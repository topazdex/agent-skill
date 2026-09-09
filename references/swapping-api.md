# Topaz API swaps and Permit2 batches

The canonical smart order router is `https://quote.topazdex.com/quote` on BNB Chain (56). It searches Topaz CL and v2 stable/volatile liquidity, including split and mixed routes. The Topaz Universal Router is `0x691e6171e0a434FfE5C9f1759621D05b9efcF6A6`; Permit2 is `0x000000000022D473030F116dDEE9F6B43aC78BA3`. Typed constants and response validation live in `scripts/src/lib/topazRouting.ts`.

Use `fetchTopazQuote` for price discovery and `buildTopazSwapBatch` for execution preparation. Both accept **raw bigint input amounts**, support exact input, and fail closed on unavailable or malformed API responses. `BNB` explicitly means native BNB; a WBNB address always means ERC20 WBNB. Native/wrapped pairs are wrap operations, not router swaps. Slippage is 1–500 basis points; deadlines are 30–1800 seconds; ERC20 amounts must fit uint160.

```ts
import { buildTopazSwapBatch, TOPAZ_WBNB } from "../scripts/src/index.js";

const batch = await buildTopazSwapBatch({
  chainId: 56,
  tokenIn: TOPAZ_WBNB,
  tokenOut: "0xdf002282C1474C9592780618Adda7EaA99998Abd",
  amountIn: 500_000_000_000_000_000n,
  payer: executingAccount, // the wallet/account that owns the input and sends EVERY call
  slippageBps: 100,
  deadlineSeconds: 600,
});
// Review batch.quote, batch.deadline, batch.payer and EVERY entry in batch.transactions.
// Pass the entire ordered list to an atomic wallet/account executor after approval.
// This helper does not request signatures or broadcast anything.
```

The request includes `permitGrantedInBatch: true` and `skipCache: true`; never attach a signed `permit`. For ERC20 input the seven-call list is:

1. Clear the direct Universal Router allowance, even if a previous read reported zero.
2. Reset the token's ERC20 allowance to Permit2 to zero.
3. Approve the exact input amount to Permit2.
4. Call `Permit2.approve(token, TopazUniversalRouter, uint160(amount), uint48(deadline))`.
5. Execute the router swap.
6. Clear the router's Permit2 allowance.
7. Clear the ERC20 allowance to Permit2.

A wallet transaction signature is still required. `permit2SignatureRequired: false` means **no separate Permit2/EIP-712/ERC-1271 signature**. `atomicRequired: true` means the entire call list must execute atomically from one payer. Sequential EOA transactions are not an atomic batch. Never submit only the last entry (it is cleanup), only the router entry, or a list missing the approvals. Native input needs only the router call with the input amount as `value`.

The SDK builds only approved swap, wrap, sweep and unwrap commands from validated route data. It does not execute opaque `methodParameters.calldata` supplied by the API. Split inputs must sum to the exact input, paths must be continuous and acyclic, and the final sweep/unwrap enforces the aggregate minimum output to the payer. Unknown protocols, invalid tokens, weak/zero minima, other chains, excessive amounts and third-party recipients fail before a batch is returned. API quotes do not include a reliable price-impact metric: report it as unavailable rather than inventing one.

Keep funds at the same account when chaining swaps into LP, locks or another swap. An exact-input quote is sized for a known input: a later plain SDK call must not assume the earlier swap produces exactly its estimate. Quote a guaranteed amount no greater than prior minimum proceeds, retain surplus, or use the AI wallet compiler's runtime balance connectors. Those resolve the actual account balance and enforce the quote's minimum exchange rate proportionally; simulation can reject a much larger runtime input because of price impact. A newly minted NFT ID still cannot be referenced later in the same batch.

`buildBestSwapTx` now returns a **TopazSwapBatch**, with `quote`, `transactions`, `payer`, `deadline`, `quotedAt`, `atomicRequired` and `permit2SignatureRequired`. It no longer returns one `{to,data,value,approval}` object. It defaults to ERC20 WBNB; set `useBnb: true` explicitly for native BNB. Its human amount wrapper uses `slippageBps: bigint`; `buildTopazSwapBatch` uses raw bigint input and numeric slippage.

The old single-router builders remain available as `buildBestLegacySwapTx`, `buildV2SwapTx`, `buildV3SwapTx`, and path/route variants. Explicit on-chain diagnostics are `onchainQuoteBundle`, `onchainBestQuote`, `bestV2Quote`, `bestV3Quote`, `topRoutes` and `quoteMixed`. They do not provide the API's split/mixed best execution. Do not downgrade to them silently after an API failure.

Rebuild after wallet, chain, amount or slippage changes, and when `isStale(batch)` returns true. Review changed prices before submission, simulate the complete batch, and require the user's wallet confirmation. Publishing this source package does not deploy the wallet connectors or agent service.

The API can return token-revisiting routes through different pools. The agent builders intentionally reject those paths and request a fresh quote with `maxHops: 2`; the resulting route and minimum output are independently validated. Other invalid quote data fails immediately. This compatibility retry can select a less profitable route than an unrestricted quote.
