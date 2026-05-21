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
import { bestQuote, getDecimals } from "../scripts/src/index.js";

export async function quoteSwap(tokenIn: string, tokenOut: string, amountHuman: string) {
  const [decIn, decOut] = await Promise.all([
    getDecimals(tokenIn),
    getDecimals(tokenOut),
  ]);

  const amountIn = parseUnits(amountHuman, decIn);
  const quote = await bestQuote(tokenIn, tokenOut, amountIn);

  return {
    route: quote.route,
    amountOut: quote.amountOut,
    amountOutHuman: formatUnits(quote.amountOut, decOut),
    exec: quote.exec,
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

## Route labels

`bestQuote` returns human labels such as:

- `v2 volatile direct`
- `v2 stable direct`
- `v3 direct ts=200`
- `v3 ts=200 -> ts=100 via 0x...`
- `mixed v3 ts=200 -> v2 volatile via 0x...`

For polished UI, map these to icons/badges:

- `v2 volatile`: v2 volatile pool
- `v2 stable`: v2 stable pool
- `v3 ts=N`: concentrated liquidity pool with tick spacing `N`
- `mixed`: route uses both Topaz v2 and v3 stacks

## Important caveat: mixed execution

The mixed quoter can return the best economic route, but not every mixed path is currently exposed as a single high-level write helper. If your UI supports mixed routes, either:

1. build the exact mixed-route swap calldata against `MixedRouteQuoterV1` / compatible router support after confirming execution support, or
2. restrict wallet execution to routes whose `exec.type` is `v2`, `v3-single`, or `v3-path`, and label mixed routes as quote-only until execution is implemented.

`buildBestSwapTx` intentionally rejects `exec.type === "mixed"` instead of silently broadcasting a leg-by-leg route with extra risk.

## Thin-liquidity warnings

Warn users when the trade size is large compared with pool liquidity. Good heuristics:

- output is much worse than spot from the subgraph or on-chain pool state
- route uses a pool with very low TVL
- route is through a dust-liquidity tick spacing
- amount in exceeds 5-10% of the paired token reserve

For long-tail tokens, this warning is more important than the exact price-impact number.
