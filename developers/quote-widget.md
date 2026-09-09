# Topaz smart order router quotes

```ts
import { fetchTopazQuote, TOPAZ_WBNB } from "../scripts/src/lib/topazRouting.js";

const quote = await fetchTopazQuote({
  tokenIn: TOPAZ_WBNB,
  tokenOut: "0xdf002282C1474C9592780618Adda7EaA99998Abd",
  amountIn: 500_000_000_000_000_000n,
  slippageBps: 100,
});
// Display quote.quote and quote.minimumAmountOut using output-token decimals.
// quote.routes gives split percentages, per-route amounts and ordered CL/v2 hops.
```

`bestQuoteBundle(tokenIn, tokenOut, rawAmount)` returns `{topaz, best, v2: null, v3: null}`. Its Topaz route can split liquidity and mix protocols; null v2/v3 fields do not mean the protocol has no such pools. Inspect `topaz.exec.quote.routes` for the actual hops. `bestQuote` returns the same overall API result. Do not invent separate alternatives or a price-impact value the API did not supply.

Refresh when token, amount, slippage, account or chain changes, and keep an unavailable response distinct from a zero price. Discard late responses after changing inputs. Quotes are exact input on chain 56, slippage 1–500 bps. Native BNB is the string `BNB`; WBNB is an ERC20 address.

When the user confirms, [build and review a fresh complete Permit2 batch](swap-calldata.md). Do not treat route amounts as guaranteed proceeds for another fixed-input transaction; size a downstream call from guaranteed minimum proceeds or use a runtime balance-aware account connector.

For explicit on-chain diagnostics, `onchainQuoteBundle`, `onchainBestQuote`, `bestV2Quote`, `bestV3Quote`, `topRoutes` and `quoteMixed` retain the earlier individual-pool quoters. They are separate from the API and are not a silent fallback for an unavailable SOR.
