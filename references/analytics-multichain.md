# Multichain data and public API

Base: **https://api.topazdex.com**. Discover the current contract at [OpenAPI](https://api.topazdex.com/openapi.json) and [API docs](https://api.topazdex.com/docs). The public API covers BNB, Robinhood, Base, Ethereum and Arc. The legacy `https://api.topazdex.com/api/stats` remains **BNB-only**; its response schema is different. Do not add an unsupported chain parameter and relabel its output.

| Need | Request |
|---|---|
| Networks and per-feature readiness | `GET /v1/chains` |
| Indexed deployment identities | `GET /v1/deployments?chainIds=all` |
| Token metadata, decimals, discovery | `GET /v1/tokens?chainIds=8453&limit=100` |
| Wallet token list | `GET /v1/token-lists/8453` |
| Curated pools | `GET /v1/pools?chainIds=8453` |
| All eligible indexed pools | Add `scope=all` to pools; token discovery instead uses `curated=all` |
| Current USD prices | `GET /v1/prices?tokens=8453:0x4200000000000000000000000000000000000006` |
| User protocol positions and rewards | `GET /v1/accounts/{address}/portfolio?chainIds=all&requireComplete=true` |
| Wallet + voting-staked xTOPAZ | `GET /v1/accounts/{address}/xtopaz?chainIds=all` |
| Backing and economic inventory | `GET /v1/xtopaz` |
| Historical rate events | `GET /v1/xtopaz/rate-history` |
| Hub settlements and spoke funding | `GET /v1/xtopaz/epochs` |
| Bridge packets | `GET /v1/bridge?chainIds=all&address={address}` |
| One packet | `GET /v1/bridge/{guid}` |
| Protocol totals / history | `GET /v1/protocol`, `/v1/protocol/history`, `/v1/protocol/daily`, `/v1/protocol/trailing` |
| Quote-provider capabilities | `GET /v1/quote-providers` |

The schema also defines chain-qualified pool/token detail, ticks, price history, trailing windows, gauge, vote, epoch and reward routes. Fetch it before selecting query names: legacy `gaugeApr`, `type` and `minTvl` are not interchangeable with `/v1` `emissionsApr`, `poolTypes` and `minTvlUsd`. Quote providers have independent network support; a configured provider may still be unavailable.

## Reading responses correctly

Preserve `ok`, `data`, `meta`, field-level availability/reasons, source blocks and timestamps. Deployment registry verification can be **configuration-only**, and readiness can be based on stored observations with `liveProbes:false`; neither authorizes a transaction without RPC checks. A healthy chain may still have unresolved prices or APRs.

Use decimal strings/bigints for accounting. Null means unavailable, not zero. If totals expose `valueUsd:null` and `knownValueUsd`, label any shown known subtotal **partial**. Ownership completeness and USD valuation completeness are different. Independent chain snapshots are not a synchronized global checkpoint, even when their epoch labels agree.

Pool lists support `sort=emissionsApr` and `aprProfile=minimum|five-spacing|standard`; show the returned `aprScenario`, range and $100 reference deposit including dilution. Do not convert a representative CL scenario into a pool-wide or user-position APR. Current rate/backing is not a guaranteed market execution price.

Follow opaque pagination cursors with unchanged filters. Restart on expired cursor errors; do not synthesize cursors. Chart `from=earliest` and supported intervals allow broader history, but historical samples have explicit gaps and availability. Respect `Retry-After` on 429/503 with bounded jittered retries. Cache public data according to headers; account responses are private/no-store.

## Account xTOPAZ balance definition

The focused account endpoint sums liquid wallet xTOPAZ plus principal still in local voting positions, in raw 18-decimal shares. BNB's voting-staked component is zero: ordinary veTOPAZ/relay TOPAZ is not xTOPAZ. It excludes pending rewards, LP-embedded xTOPAZ, in-transit shares and protocol custody. Its default complete-only mode returns `503 account_incomplete` if a selected chain cannot be verified. Diagnostic `requireComplete=false` preserves nulls and partial rows; never award zero balance based on failed reads.

For post-transaction portfolio refresh, the API supports `POST /v1/accounts/{address}/invalidate`, then one `fresh=true` portfolio read. Use this after a relevant authorized user action, not as a background poll. No API refresh replaces reading balances, allowances, ownership, live gates and pool state immediately before simulation/submission.

## Subgraphs

BNB's older v2/v3/ve references remain useful for BNB-only queries. Spokes use a different unified schema (`chainState`, `pools`, `poolType`, user/protocol entity kind and local positions). Do not reuse BNB GraphQL entities or pin an old spoke release URL from memory. Prefer `/v1` for portable discovery; use a verified current chain-specific graph only when its schema/deployment identity has been checked. Exclude system pools from user market totals and keep closed position owners for reward history.
