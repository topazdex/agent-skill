# Example — Quote and build a mixed/split Topaz swap

```ts
import { buildTopazSwapBatch } from "../scripts/src/lib/topazSwap.js";

const batch = await buildTopazSwapBatch({
  tokenIn: "0xdf002282C1474C9592780618Adda7EaA99998Abd",
  tokenOut: "0x55d398326f99059fF775485246999027B3197955",
  amountIn: 100n * 10n ** 18n,
  payer: executingAccount,
  slippageBps: 100,
});
```

The API determines whether CL, v2 or mixed/split execution wins for the live amount. Inspect `batch.quote.routes`; do not hardcode a WBNB/USDT pool or stable flag. The builder returns approvals, the router call and cleanup, without broadcasting. Review and simulate the complete list, then submit **every call in order atomically** from `batch.payer` using the user's wallet/account adapter. Output goes to that same payer for later calls.

There is no separate Permit2 signature. An EOA sending each entry as a separate transaction does not provide the same atomicity. See [the execution contract](../references/swapping-api.md).
