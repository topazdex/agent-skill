# Swap calldata and atomic Permit2 batches

Use [API routing and Permit2 batches](../references/swapping-api.md) for the maintained execution contract and a complete example. The SOR supports split and mixed CL/v2 routes on BNB Chain.

```ts
import { buildBestSwapTx, isStale } from "../scripts/src/index.js";

const batch = await buildBestSwapTx({
  tokenIn, tokenOut, amountIn: "0.5", recipient: executingAccount,
  slippageBps: 100n, useBnb: false,
});
if (isStale(batch)) throw new Error("Refresh the quote before confirming");
// Show batch.quote.quote, batch.quote.minimumAmountOut, batch.deadline and every call.
// After simulation/review, submit batch.transactions through your atomic wallet executor.
```

`buildBestSwapTx` returns `TopazSwapBatch`, with a complete `transactions` array. There is no top-level `to`, `data`, `value` or singular `approval`. WBNB is ERC20 by default. `useBnb: true` explicitly selects native input/output when a token is WBNB. A batch has one payer and recipient; chained output remains with that executing account.

For raw amounts without RPC decimal discovery, import `buildTopazSwapBatch` directly from `scripts/src/lib/topazSwap.ts`. Its slippage is a number in basis points, and its input is a bigint. The call list includes exact ERC20 approval to Permit2, `Permit2.approve` to the Topaz router, the swap, and allowance cleanup. Use **all** calls in order. `permit2SignatureRequired: false` does not remove the wallet transaction confirmation.

Explicit direct-router integrations may still use `buildBestLegacySwapTx`, `buildV2SwapTx`, `buildV2RouteSwapTx`, `buildV3SwapTx` and `buildV3PathSwapTx`. Those retain the older `BuiltSwapTx` shape and have their own singular ERC20 `approval` requirement. They are not the SOR path. `buildFromExecRoute` intentionally rejects `topaz-api`: use a fresh complete batch instead of forwarding that route into an old single-call builder.

The API builders reject other chains, zero/overflow input, zero minimum output, disconnected/cyclic paths, unsupported protocols, invalid deadlines and recipients other than the payer. They rebuild restricted commands from validated routes rather than executing opaque API calldata. Simulation and quote freshness remain required before signing.
