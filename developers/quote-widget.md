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
- `v3 ts=200 → ts=100 via 0x…` (note the Unicode arrow `→` and ellipsis emitted by `bestQuote`)
- `mixed v3 ts=200 → v2 volatile via 0x…`

For polished UI, map these to icons/badges:

- `v2 volatile`: v2 volatile pool
- `v2 stable`: v2 stable pool
- `v3 ts=N`: concentrated liquidity pool with tick spacing `N`
- `mixed`: route uses both Topaz v2 and v3 stacks

## Important caveat: mixed execution

The mixed quoter (`MixedRouteQuoterV1`) prices v2↔v3 paths accurately, but Topaz has no atomic mixed-route executor today. `bestQuote` returns mixed candidates by default so analytics consumers can see the true best price; pass `{ allowMixed: false }` when the quote will feed a wallet:

```ts
const quote = await bestQuote(tokenIn, tokenOut, amountIn, { allowMixed: false });
```

`buildBestSwapTx` does this internally, so it will never return a mixed route. If you want to surface "best economic price (mixed)" alongside "best executable price", call `bestQuote` twice — once with each value of `allowMixed`.

## Thin-liquidity warnings

Warn users when the trade size is large compared with pool liquidity. Good heuristics:

- output is much worse than spot from the subgraph or on-chain pool state
- route uses a pool with very low TVL
- route is through a dust-liquidity tick spacing
- amount in exceeds 5-10% of the paired token reserve

For long-tail tokens, this warning is more important than the exact price-impact number.
