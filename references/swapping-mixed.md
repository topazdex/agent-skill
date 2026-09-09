# Mixed and split swaps

Topaz's Universal Router executes mixed CL/v2 routes atomically. The canonical quote source is `https://quote.topazdex.com`. Read [API routing and Permit2 batches](swapping-api.md) for requests, response validation and the complete execution call list.

The SOR may split input across several routes, each with its own raw input amount. Within a route it may traverse CL, v2 volatile and v2 stable pools. CL path slots contain **tick spacing**, not a Uniswap fee tier. Universal Router v2 hops are `(from,to,stable)`; they do not include the legacy v2 Router's `factory` field. The router's immutable deployments determine the factories.

Use `buildTopazSwapBatch` or `buildBestSwapTx`. Intermediate hops keep funds in the router and consume its runtime balance; the final aggregate minimum applies to all split outputs. The whole allowance + swap + cleanup call list must come from one payer account. No separate Permit2 signature is needed.

## Legacy mixed-quoter diagnostics

`MixedRouteQuoterV1` is still a read-only quoter. `quoteMixed(pathBytes, amountIn)` can inspect a hand-selected path. Its encoding uses `token (int24 hop token)+`: positive values are CL tick spacings, `-1` (`0xFFFFFF`) is v2 volatile, and `-2` (`0xFFFFFE`) is v2 stable. These sentinels belong to the **mixed quoter**, not the Universal Router's CL path ABI.

Do not split a mixed swap into separate EOA transactions or feed mixed-quoter sentinel bytes to a CL swap. The deployed Universal Router and the API batch helpers provide atomic mixed execution. `buildFromExecRoute` retains old direct-router support; it rejects legacy `mixed` and new `topaz-api` route objects to direct callers to the complete batch builder.
