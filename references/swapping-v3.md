# Swapping — v3 (Slipstream / Concentrated Liquidity)

The v3 stack uses three contracts:

| | |
|---|---|
| `CLFactory` | `0x73DC984D9490286E735548f61dfCCec67Af82ed9` — pool discovery |
| `SwapRouter` | `0x9B63CA87919617d042A89663492dB3c8686e0CaE` — execute swaps |
| `QuoterV2` | `0x7CCB89bB9BdEF68688F39a2c22d249fD1D9759f1` — off-chain quoting |

A pool is identified by `(tokenA, tokenB, tickSpacing)`. Multiple pools may exist for the same pair at different tick spacings.

## Pool discovery

```solidity
function getPool(address tokenA, address tokenB, int24 tickSpacing) external view returns (address pool);  // 0x0 if none
function tickSpacings() external view returns (int24[] memory);  // all enabled tick spacings
function tickSpacingToFee(int24 tickSpacing) external view returns (uint24 fee);  // default fee for that spacing
function getSwapFee(address pool) external view returns (uint24);   // live fee (may be overridden by module)
function getUnstakedFee(address pool) external view returns (uint24); // fee on unstaked LP (default 100,000 pips = 10%)
```

Default tick-spacing → fee map (pips, where 1e6 = 100%):

| tickSpacing | fee (pips) | bps |
|---|---|---|
| 1 | 100 | 0.01% |
| 50 | 500 | 0.05% |
| 100 | 1000 | 0.10% |
| 200 | 3000 | 0.30% |
| 2000 | 10000 | 1.00% |

To find candidate pools for a pair, iterate `tickSpacings()` and check `getPool` for each.

## Path encoding (multi-hop)

A v3 path is a packed bytes string:

```
[ token0(20 bytes) | tickSpacing(3 bytes, big-endian int24) | token1(20) | tickSpacing(3) | token2(20) | … ]
```

So a 3-hop path = 20 + (3+20) × 3 = 89 bytes.

For `exactOutput*`, **reverse the path** (the *last* token in the path is the input). Encoding helper in `scripts/src/lib/path.ts`:

```ts
import { hexlify, concat, getBytes } from "ethers";

export function encodePath(tokens: string[], spacings: number[]): string {
  if (tokens.length !== spacings.length + 1) throw new Error("bad path lengths");
  const parts: Uint8Array[] = [];
  for (let i = 0; i < spacings.length; i++) {
    parts.push(getBytes(tokens[i]));
    const sp = new Uint8Array(3);
    const s = spacings[i] & 0xffffff;
    sp[0] = (s >> 16) & 0xff;
    sp[1] = (s >> 8)  & 0xff;
    sp[2] =  s        & 0xff;
    parts.push(sp);
  }
  parts.push(getBytes(tokens[tokens.length - 1]));
  return hexlify(concat(parts));
}
```

## Quoting (off-chain only)

`QuoterV2` functions are **state-changing in Solidity** (they revert and decode in JS land). Don't `staticcall` them on-chain — call them off-chain via `callStatic` / `populateTransaction` + provider call.

```solidity
struct QuoteExactInputSingleParams {
    address tokenIn;
    address tokenOut;
    uint256 amountIn;
    int24   tickSpacing;
    uint160 sqrtPriceLimitX96;  // 0 = no limit
}
function quoteExactInputSingle(QuoteExactInputSingleParams params)
    external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate);

function quoteExactInput(bytes path, uint256 amountIn)
    external returns (uint256 amountOut, uint160[] sqrtPriceX96AfterList, uint32[] initializedTicksCrossedList, uint256 gasEstimate);

struct QuoteExactOutputSingleParams {
    address tokenIn;
    address tokenOut;
    uint256 amount;
    int24   tickSpacing;
    uint160 sqrtPriceLimitX96;
}
function quoteExactOutputSingle(QuoteExactOutputSingleParams params)
    external returns (uint256 amountIn, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate);

function quoteExactOutput(bytes reversedPath, uint256 amountOut)
    external returns (uint256 amountIn, uint160[] sqrtPriceX96AfterList, uint32[] initializedTicksCrossedList, uint256 gasEstimate);
```

In ethers v6, call with `.staticCall(...)` to capture the return values without sending a transaction.

## Executing swaps

```solidity
// Single hop, exact input
struct ExactInputSingleParams {
    address tokenIn;
    address tokenOut;
    int24   tickSpacing;
    address recipient;
    uint256 deadline;
    uint256 amountIn;
    uint256 amountOutMinimum;
    uint160 sqrtPriceLimitX96;   // 0 = no limit; slippage enforced via amountOutMinimum
}
function exactInputSingle(ExactInputSingleParams params)
    external payable returns (uint256 amountOut);

// Multi-hop, exact input
struct ExactInputParams {
    bytes   path;
    address recipient;
    uint256 deadline;
    uint256 amountIn;
    uint256 amountOutMinimum;
}
function exactInput(ExactInputParams params) external payable returns (uint256 amountOut);

// Exact output variants
function exactOutputSingle(ExactOutputSingleParams params)  external payable returns (uint256 amountIn);
function exactOutput(ExactOutputParams params)               external payable returns (uint256 amountIn);

// Wrap many of the above in a single tx
function multicall(bytes[] calldata data) external payable returns (bytes[] memory results);
```

Both `exact*` variants are `payable` to support **BNB-in** via `msg.value` when `tokenIn == WBNB`. The router auto-wraps using its `unwrapWETH9` /  `refundETH` /  `sweepToken` helpers — typically invoked via `multicall`:

```ts
// BNB → USDT: wrap, swap, refund leftover BNB
const swapData = swapRouter.interface.encodeFunctionData("exactInputSingle", [{ ... tokenIn: WBNB ... }]);
const refundData = swapRouter.interface.encodeFunctionData("refundETH", []);
await swapRouter.multicall([swapData, refundData], { value: amountInBNB });
```

For **BNB-out**:

```ts
// X → WBNB swap to router (recipient = swapRouter), then unwrap to user
const swap = swapRouter.interface.encodeFunctionData("exactInputSingle", [{
  ... tokenOut: WBNB, recipient: SwapRouterAddress ...
}]);
const unwrap = swapRouter.interface.encodeFunctionData("unwrapWETH9", [amountOutMin, userAddress]);
await swapRouter.multicall([swap, unwrap]);
```

## Slippage pattern

```ts
const SLIPPAGE_BPS = 100n; // 1% — be more generous than v2 due to in-range liquidity volatility
const [expectedOut] = await quoterV2.quoteExactInputSingle.staticCall({
  tokenIn, tokenOut, amountIn, tickSpacing: 200, sqrtPriceLimitX96: 0n,
});
const amountOutMinimum = (expectedOut * (10_000n - SLIPPAGE_BPS)) / 10_000n;
```

`sqrtPriceLimitX96` is **independent** of slippage. Leave it `0` for normal trades; set it only if you want to cap how far the price can move (advanced: useful for limit-order-style behavior).

## When v3 is better than v2

- High-liquidity, low-volatility pairs at a tight tick spacing (USDT/USDC `tickSpacing=1`) typically beat v2 stable by 5–20× capital efficiency on price impact.
- ETH/USDT-style at `tickSpacing=100` or `200` is competitive with v2 volatile.
- Long-tail / exotic pairs often only exist as v2 — there may be no v3 pool yet.

To programmatically pick the better venue, see `references/swapping-mixed.md` — it covers `MixedRouteQuoterV1` which can quote a single path mixing v2 and v3 hops, returning the best aggregate.

## Scripts

| Operation | Where |
|---|---|
| Single-pool quote | `scripts/src/read/quotes.ts` — `quoteV3Single({ tokenIn, tokenOut, amountIn, tickSpacing })` |
| Multi-hop quote | `quoteV3Path(pathBytes, amountIn)` |
| Find best executable CL route | `bestV3Quote(tokenA, tokenB, amountIn)` — direct + 2- and 3-hop combinations of tick spacings through common intermediaries. v2 is never mixed in. |
| Build calldata | `scripts/src/lib/txBuilders.ts` — `buildV3SwapTx(...)`, `buildV3PathSwapTx(...)`, `buildBestSwapTx(...)` |
| Execute single | `scripts/src/write/swap.ts` — `swapV3Single({ tokenIn, tokenOut, amountIn, tickSpacing, slippageBps })` |
| Execute multi-hop | `swapV3Path({ tokens, spacings, amountIn, slippageBps })` |
| CLI | `yarn tsx src/cli/swap.ts v3 --in <addr> --out <addr> --amount <n> [--ts 200] [--slippage 100]` |

See `examples/swap-v3-single-hop.md`.
