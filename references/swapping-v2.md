# Swapping — v2 (Solidly-style pools)

The v2 stack supports two pool types: **volatile** (`xy=k`) and **stable** (`x³y + xy³ = k`, Solidly curve). Both are accessed through the single `Router` at `0x1E98c8226e7d452e1888e3d3d2F929346321c6c3`.

## Route struct

```solidity
struct Route {
    address from;     // input token of this hop
    address to;       // output token of this hop
    bool    stable;   // true = stable pool, false = volatile
    address factory;  // PoolFactory address (0x65E6cD0eF5D3467030103cf3d433034E570b5784)
}
```

Multi-hop is just an array of `Route`s where `routes[i].to == routes[i+1].from`. **Each hop carries its own `stable` flag and factory address** — different from Uniswap V2's `path: address[]`.

## Quoting

```solidity
function getAmountsOut(
    uint256 amountIn,
    Route[] memory routes
) external view returns (uint256[] memory amounts);
```

`amounts.length == routes.length + 1`. The last element is the output. View function, free to call.

```solidity
function getReserves(
    address tokenA,
    address tokenB,
    bool stable,
    address _factory
) external view returns (uint256 reserveA, uint256 reserveB);

function quoteAddLiquidity(...);     // see liquidity-v2.md
function quoteRemoveLiquidity(...);  // see liquidity-v3.md? no - liquidity-v2.md
function quoteStableLiquidityRatio(...);
```

## Swapping (signed-transaction functions)

```solidity
function swapExactTokensForTokens(
    uint256 amountIn,
    uint256 amountOutMin,
    Route[] calldata routes,
    address to,
    uint256 deadline
) external returns (uint256[] memory amounts);

function swapExactETHForTokens(
    uint256 amountOutMin,
    Route[] calldata routes,
    address to,
    uint256 deadline
) external payable returns (uint256[] memory amounts);

function swapExactTokensForETH(
    uint256 amountIn,
    uint256 amountOutMin,
    Route[] calldata routes,
    address to,
    uint256 deadline
) external returns (uint256[] memory amounts);

// fee-on-transfer variants (do not enforce intermediate output amounts strictly)
function swapExactTokensForTokensSupportingFeeOnTransferTokens(...);
function swapExactETHForTokensSupportingFeeOnTransferTokens(...);
function swapExactTokensForETHSupportingFeeOnTransferTokens(...);
```

There's also `UNSAFE_swapExactTokensForTokens(uint256[] amounts, Route[] routes, address to, uint256 deadline)` which **skips** the slippage check — only use it after you've called `getAmountsOut` and explicitly verified the path. Not for general use.

### Native-BNB rules

- BNB **in**: use `swapExactETHForTokens`. Set `routes[0].from = WBNB`. Send the BNB via `msg.value` (do NOT also pass `amountIn`).
- BNB **out**: use `swapExactTokensForETH`. The last hop's `routes[last].to` must be WBNB.
- Both BNB-in and BNB-out: this never happens directly (a swap from BNB to BNB is a no-op). Use one of the above based on direction.
- Pure ERC20↔ERC20: `swapExactTokensForTokens`. WBNB is just an ERC20 for the purpose of these routes.

## Choosing between volatile and stable

For a given `(tokenA, tokenB)`, both pools may exist independently. You can check:

```ts
const volatile = await poolFactory.getPool(tokenA, tokenB, false);  // 0x0 if none
const stable   = await poolFactory.getPool(tokenA, tokenB, true);
```

Quote both routes and use whichever returns a better `amountOut`. For correlated assets (USDT/USDC, similar pegged pairs) the stable pool is almost always better at modest sizes but worse for large sizes that depeg. The simplest robust strategy is: **quote both, take the larger amountOut**.

`scripts/src/read/quotes.ts` exposes `quoteV2(...)` for one v2 route and `bestQuote(...)` / `topRoutes(...)` for direct and 2-hop route search across v2, v3, and mixed candidates. Pass `{ allowMixed: false }` when the result will feed executable wallet calldata.

## Slippage pattern

```ts
import { Router__factory } from "./abis/Router";

const amountIn = parseUnits("1", 18);  // 1 WBNB
const routes = [{
  from: WBNB,
  to: USDT,
  stable: false,
  factory: POOL_FACTORY,
}];
const amounts = await router.getAmountsOut(amountIn, routes);
const expectedOut = amounts[amounts.length - 1];

const SLIPPAGE_BPS = 50n; // 0.50%
const amountOutMin = (expectedOut * (10_000n - SLIPPAGE_BPS)) / 10_000n;
const deadline = Math.floor(Date.now() / 1000) + 60 * 20;  // +20m

await usdt.approve(router.address, amountIn);  // if input is ERC20
const tx = await router.swapExactTokensForTokens(
  amountIn, amountOutMin, routes, recipient, deadline
);
```

## Important fee/quote semantics

- `Pool.getAmountOut(amountIn, tokenIn)` is the canonical per-pool quote function. `Router.getAmountsOut` walks the route calling this on each pool.
- The fee is already subtracted from the returned `amountOut`. Fee comes from `PoolFactory.getFee(pool, stable)` (defaults: 5 = 0.05% stable, 30 = 0.30% volatile; max 300 = 3%).
- Stable pools include a small extra precision step using token decimals normalized to 18, so be careful with tokens that have non-18 decimals on BSC (most are 18 — see `tokens.md`).

## Helper functions

- `Router.sortTokens(tokenA, tokenB)` — returns `(token0, token1)` sorted ascending, matching the pool's internal token ordering. Use this if you need to interpret `reserve0/reserve1` from a raw `Pool` call.
- `Router.poolFor(tokenA, tokenB, stable, factory)` — recomputes the deterministic pool address (CREATE2). Useful to verify or compute without an RPC call.

## Scripts

| Operation | Where |
|---|---|
| Quote | `scripts/src/read/quotes.ts` — `quoteV2(tokenIn, tokenOut, amountIn, stable)`, `bestQuote(...)`, `topRoutes(...)` |
| Build calldata | `scripts/src/lib/txBuilders.ts` — `buildV2SwapTx(...)`, `buildBestSwapTx(...)` |
| Broadcast token→token | `scripts/src/write/swap.ts` — `swapV2({ tokenIn, tokenOut, amountIn, stable, slippageBps, deadline })` |
| CLI | `yarn tsx src/cli/swap.ts v2 --in <addr> --out <addr> --amount <n> [--stable] [--slippage 50]` |

See also `examples/swap-v2-volatile.md`, `examples/swap-v2-stable.md`.
