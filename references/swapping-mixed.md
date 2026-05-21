# Swapping — Mixed Routes (v2 + v3)

When the best price for a pair requires hops through both v2 stable/volatile pools and v3 CL pools, use the `MixedRouteQuoterV1`:

```
MixedRouteQuoterV1: 0x47c3570b90e7234FE695Ad5F1bE69E21fe1a9ee2
```

This contract was developed for the case where the optimal route crosses pool types — e.g., `TOPAZ → WBNB (v3 CL) → USDT (v2 stable)`.

## Path encoding

Mixed paths reuse the v3 packing format, but the "tick spacing" slot encodes hop type:

- **Positive `int24`** → v3 CL pool with that `tickSpacing` (e.g. 200 = the 0.30% CL pool).
- **Special sentinel `int24(-1)` = `0xFFFFFF`** → v2 volatile pool.
- **Special sentinel `int24(-2)` = `0xFFFFFE`** → v2 stable pool.

So a TOPAZ → WBNB (v3 ts=200) → USDT (v2 stable) path is:

```
[ TOPAZ(20) | 0x0000C8(3, =200)  | WBNB(20) | 0xFFFFFE(3, =stable) | USDT(20) ]
```

The branching logic is implemented in `MixedRouteQuoterV1` on-chain (see `references/abis/MixedRouteQuoterV1.json`). `scripts/src/lib/path.ts` exposes:

```ts
export const V2_VOLATILE = -1;
export const V2_STABLE   = -2;
export function encodeMixedPath(tokens: string[], hops: number[]): string;
// hops[i] in { tickSpacing, -1, -2 }
```

## Quoting

```solidity
function quoteExactInput(bytes memory path, uint256 amountIn) external returns (
    uint256 amountOut,
    uint160[] memory v3SqrtPriceX96AfterList,
    uint32[]  memory v3InitializedTicksCrossedList,
    uint256 v3SwapGasEstimate
);

// Single-hop variants:
function quoteExactInputSingleV3(QuoteExactInputSingleV3Params memory params) external returns (...);
function quoteExactInputSingleV2(QuoteExactInputSingleV2Params memory params) external returns (uint256 amountOut);

struct QuoteExactInputSingleV3Params {
    address tokenIn;
    address tokenOut;
    uint256 amountIn;
    int24   tickSpacing;
    uint160 sqrtPriceLimitX96;
}
struct QuoteExactInputSingleV2Params {
    address tokenIn;
    address tokenOut;
    bool    stable;
    uint256 amountIn;
}
```

Like `QuoterV2`, these functions revert with the result — call via `.staticCall(...)` in ethers v6.

`MixedRouteQuoterV1` does **not** offer an exact-output version. For exact-output, fall back to single-stack quoting (use `Router.getAmountsOut` plus binary search or `QuoterV2.quoteExactOutput`).

## Executing a mixed-route trade

`MixedRouteQuoterV1` is **a quoter only** — it does not execute swaps. To execute a mixed route, split it into segments along stack boundaries and execute each segment with its native router (a `multicall` of `SwapRouter` for the v3 segments and a separate `Router.swapExactTokensForTokens` call for v2 segments).

```ts
// Example: TOPAZ → WBNB (v3 ts=200) → USDT (v2 stable)
// 1. Quote whole mixed route
const path = encodeMixedPath([TOPAZ, WBNB, USDT], [200, V2_STABLE]);
const [outFinal] = await mixedQuoter.quoteExactInput.staticCall(path, amountIn);

// 2. Quote per-leg to get expected intermediates
const [outWBNB] = await mixedQuoter.quoteExactInputSingleV3.staticCall({
  tokenIn: TOPAZ, tokenOut: WBNB, amountIn, tickSpacing: 200, sqrtPriceLimitX96: 0n,
});

// 3. Execute leg 1 (v3): send WBNB to user wallet (or to v2 Router if you trust an atomic flow)
await swapRouter.exactInputSingle({ ... tokenOut: WBNB, recipient: user, amountOutMinimum: outWBNB*99n/100n });

// 4. Execute leg 2 (v2): user wallet → USDT
await router.swapExactTokensForTokens(outWBNB, outFinal*99n/100n, [{ from: WBNB, to: USDT, stable: true, factory }], user, deadline);
```

For a truly atomic mixed swap, you would need a custom multicall contract that holds funds between hops. None is currently deployed in this skill's scope, so the two-tx pattern above is what we use.

## When to bother with mixed routing

Use the `MixedRouteQuoterV1` whenever **none of these are true**:

- Both tokens are bluechips → direct v3 hop is almost always best.
- Both tokens are stablecoins → v2 stable or v3 `ts=1` directly.

Use it whenever:

- Your input or output token is a long-tail asset only listed against WBNB in a v2 volatile pool, while the *other* side has good v3 liquidity against USDT.
- You're routing a large size and want to check if a hybrid path reduces price impact.

## Heuristic candidate sets

A reasonable practical heuristic (used by `scripts/src/read/quotes.ts:bestMixedQuote`):

1. Direct pools first: `quoteV2(tokenIn, tokenOut, false)`, `quoteV2(..., true)`, and `quoteV3Single(...)` for each enabled tick spacing where the pool exists.
2. 2-hop via WBNB: enumerate `(stack1, stack2)` ∈ {v2-volatile, v2-stable, v3-ts1, v3-ts50, v3-ts100, v3-ts200, v3-ts2000}² where both legs have a deployed pool.
3. 2-hop via USDT and BTCB for tokens that don't pair with WBNB.

Take the best `amountOut` across all candidates.

## Scripts

| Operation | Where |
|---|---|
| Quote mixed path | `scripts/src/read/quotes.ts` — `quoteMixed(pathBytes, amountIn)` |
| Best route search | `bestQuote(tokenIn, tokenOut, amountIn)` — tries all of the above |
| CLI | `yarn tsx src/cli/swap.ts best --in <addr> --out <addr> --amount <n>` — quotes only, prints chosen route |

For execution, after picking a route, the CLI prompts for confirmation and dispatches the appropriate `swapV2` / `swapV3*` / two-leg combo from `scripts/src/write/swap.ts`.

See `examples/swap-mixed-route.md`.
