# Swapping — Mixed Routes (v2 + v3)

> **The default routing pipeline never produces a mixed route.** `bestQuote`,
> `bestQuoteBundle`, `bestV2Quote`, `bestV3Quote`, and `topRoutes` enumerate v2
> (volatile + stable, up to 3 hops) and v3 (every tick-spacing combination, up
> to 3 hops) **separately**. The two stacks are never combined in a single
> route because Topaz has no atomic mixed-route executor today, so a "best
> mixed" quote could not be delivered as a single wallet signature.
>
> This page documents `MixedRouteQuoterV1` for analytics or off-protocol
> pricing use cases that genuinely need a cross-stack quote.

When you want to price (not execute) a path that crosses pool types — e.g.,
`TOPAZ → WBNB (v3 CL) → USDT (v2 stable)` — use the `MixedRouteQuoterV1`:

```
MixedRouteQuoterV1: 0x47c3570b90e7234FE695Ad5F1bE69E21fe1a9ee2
```

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

## Default candidate set (no mixing)

`scripts/src/read/quotes.ts` enumerates v2 and v3 independently:

- **v2 (basic)** — direct (volatile + stable), plus every 2- and 3-hop combination
  of volatile/stable legs through the common intermediaries
  `USDT, WBNB, BTCB, ETH, TOPAZ, USDC` (see `HOP_TOKENS` in `scripts/src/config/tokens.ts`).
  Each candidate is one `Router.getAmountsOut(amountIn, Route[])` call.
- **v3 (concentrated)** — direct at every enabled tick spacing, plus every 2-
  and 3-hop combination of tick spacings through the same intermediaries.
  Each candidate is one `QuoterV2.quoteExactInput(path, amountIn)` call.

A single pool-existence probe (`PoolFactory.getPool` + `CLFactory.getPool` per
edge, multicall) prunes routes that would step through a non-existent pool,
then the surviving quoter calls are dispatched in chunked multicalls.

`bestQuoteBundle(tokenIn, tokenOut, amountIn)` returns `{ v2, v3, best }` so a
UI can show "basic" and "concentrated" side by side without re-quoting.

## Scripts

| Operation | Where |
|---|---|
| Quote a single mixed path | `scripts/src/read/quotes.ts` — `quoteMixed(pathBytes, amountIn)` (off-protocol analytics only) |
| Best v2 + v3 routes | `bestQuoteBundle(tokenIn, tokenOut, amountIn)` — returns both stacks |
| Best overall route | `bestQuote(tokenIn, tokenOut, amountIn)` — winner of v2 vs v3 |
| Best on one stack | `bestV2Quote(...)` / `bestV3Quote(...)` |
| CLI | `yarn tsx src/cli/swap.ts best --in <addr> --out <addr> --amount <n>` — prints both v2 and v3 routes |

For execution, use `buildBestSwapTx(...)` or `buildFromExecRoute` — both only
accept `v2`, `v3-single`, or `v3-path` exec routes. Mixed routes are quote-only
until an atomic mixed executor exists.

See `examples/swap-mixed-route.md`.
