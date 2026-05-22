# Quote Widget Integration

Use this recipe when building a frontend component that quotes Topaz routes and displays the best execution path to a user.

## Inputs

A useful quote widget usually needs:

- `tokenIn` and `tokenOut` addresses.
- human-readable input amount, e.g. `"0.5"`.
- token metadata: symbol, decimals, logo if your app has one.
- slippage setting in basis points.

## Basic quote

```ts
import { parseUnits, formatUnits } from "ethers";
import { bestQuoteBundle, getDecimals } from "../scripts/src/index.js";

export async function quoteSwap(tokenIn: string, tokenOut: string, amountHuman: string) {
  const [decIn, decOut] = await Promise.all([
    getDecimals(tokenIn),
    getDecimals(tokenOut),
  ]);

  const amountIn = parseUnits(amountHuman, decIn);
  const { v2, v3, best } = await bestQuoteBundle(tokenIn, tokenOut, amountIn);

  // `v2` and `v3` let the UI show "basic" vs "concentrated" side-by-side;
  // `best` is the winner you'd execute. Each may be `null` when no route
  // exists on that stack.
  return {
    v2,
    v3,
    best,
    amountOutHumanBest: best ? formatUnits(best.amountOut, decOut) : null,
  };
}
```

## Minimum output

```ts
export function applySlippage(amountOut: bigint, slippageBps: bigint) {
  return (amountOut * (10_000n - slippageBps)) / 10_000n;
}
```

Show both the expected output and minimum output. Do not hide slippage from the user.

## Staleness

For wallet-ready calldata, call `buildBestSwapTx(...)` after the user chooses slippage and recipient. Treat the returned `quotedAt` as the freshness signal; refresh the quote before signing if it is older than roughly 15-30 seconds.

## Route labels

`bestQuoteBundle` / `bestQuote` returns human labels such as:

- `v2 volatile direct`
- `v2 stable direct`
- `v2 volatile → stable via 0xabcd…` (2-hop)
- `v2 volatile → stable → volatile via 0xabcd… → 0xef12…` (3-hop)
- `v3 direct ts=200`
- `v3 ts=200 → ts=100 via 0xabcd…` (2-hop, note the Unicode arrow `→` and ellipsis)
- `v3 ts=1 → ts=200 → ts=2000 via 0xabcd… → 0xef12…` (3-hop)

For polished UI, map these to icons/badges:

- `v2 volatile`: v2 volatile pool
- `v2 stable`: v2 stable pool
- `v3 ts=N`: concentrated liquidity pool with tick spacing `N`

## Mixed v2/v3 routes

Default routing never produces a mixed route — v2 and v3 are searched as
separate stacks. `MixedRouteQuoterV1` is still available for analytics or
off-protocol pricing via `quoteMixed(pathBytes, amountIn)`, but Topaz has no
atomic mixed-route executor, so a wallet-facing flow cannot deliver a mixed
quote as a single signature. See `references/swapping-mixed.md` for details.

## Thin-liquidity warnings

Warn users when the trade size is large compared with pool liquidity. Good heuristics:

- output is much worse than spot from the subgraph or on-chain pool state
- route uses a pool with very low TVL
- route is through a dust-liquidity tick spacing
- amount in exceeds 5-10% of the paired token reserve

For long-tail tokens, this warning is more important than the exact price-impact number.

## Price impact and the broken-pool filter

`bestQuoteBundle` and `topRoutes` fetch USD spot prices for `tokenIn` / `tokenOut`
from the subgraph (`Token.derivedETH × Bundle.ethPriceUSD`, v3 first, v2 fallback)
and drop any candidate where `(usdIn - usdOut) / usdIn > 0.5` — the broken-pool
guard. A second always-on filter drops anything under 50% of the best
candidate's `amountOut` on the same stack, so even when subgraph prices are
missing for a long-tail asset the search still rejects stale-pool nonsense.

Each surviving route carries a `priceImpactPct?: number` (0–1) when prices
were known — surface it next to the route label so users see whether they're
about to eat 20% of their trade. Tune via `BestQuoteOptions.maxPriceImpactPct`
and `BestQuoteOptions.minRelativeToBest`; set `skipPriceFilter: true` to bypass
the subgraph call entirely.
