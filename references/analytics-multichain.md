# Multichain data and public API

Base: **https://api.topazdex.com**. Every current-data route lives under `/v1`; the contract is the [OpenAPI document](https://api.topazdex.com/openapi.json) with [interactive docs](https://api.topazdex.com/docs). The API covers BNB (56), Robinhood (4663), Base (8453), Ethereum (1) and Arc (5042). Use it first for anything that is not a per-user transaction precondition: pools, tokens, prices, protocol totals and history, gauges, votes, epochs, incentives, account portfolios, xTOPAZ backing and bridge packets. The legacy `https://api.topazdex.com/api/stats` service is **BNB-only**, keeps its own response schema, and is retained only for the [historical reports](analytics-stats-api.md) that have no `/v1` equivalent. Do not add an unsupported chain parameter to it and relabel its output.

From `scripts/`: `yarn tsx src/cli/stats.ts v1 <path> [--param value ...] [--all]` prints any route's envelope, and `fetchV1` / `fetchV1Pages` in `scripts/src/lib/topazApi.ts` do the same programmatically. Both leave `data` untyped on purpose — take field names from the OpenAPI document, not from memory.

## Route catalog

Chain-qualified identities are `{chainId}/{address}` in paths and `chainId:address` in `tokens=` filters. List routes accept `chainIds=all` or a comma list, `limit`, an opaque `cursor`, and most accept `scope=curated|all` plus `entityKind`. 55 routes as of 2026-09-28; the OpenAPI document is authoritative when this table lags.

| Area | Routes |
|---|---|
| System | `/v1/chains`, `/v1/health`, `/v1/health/chains`, `/v1/deployments` |
| Discovery | `/v1/pools`, `/v1/tokens` — filters `q`, `chainIds`, `status`, `curated`, `featured`, `categories`, `tokenTags`, `poolTypes`, `minTvlUsd`, `maxTvlUsd`, `minFeeApr`, `minEmissionsApr`, `incentivized`, `liveGauge`, `dynamicFee`, `customFee`, `token`, `sort`, `aprProfile`, `direction`, `includeFacets` |
| Markets | `/v1/pools/{chainId}/{poolAddress}` (+ `/history`, `/daily`, `/trailing`, `/ticks`, `/bribes`), `/v1/tokens/{chainId}/{tokenAddress}` (+ `/prices`, `/price-history`, `/price-changes`, `/trailing`), `/v1/prices?tokens=…` |
| Protocol | `/v1/protocol`, `/v1/protocol/history`, `/v1/protocol/daily`, `/v1/protocol/trailing` |
| Gauges | `/v1/gauges`, `/v1/gauges/{chainId}/{gaugeAddress}` (+ `/rewards`, `/bribes`, `/history`) |
| Votes | `/v1/votes` — `view`, `epochStart`, `positionId`, `gauge`, `pool`, `stakingAddress`, `voter`, `kind`, `includeZero`, `from`, `to` |
| Epochs and bribes | `/v1/epochs`, `/v1/epochs/{chainId}/{epochStart}`, `/v1/bribes`, `/v1/markets/bribes` |
| Accounts | `/v1/accounts/{address}/portfolio`, `…/liquidity-positions`, `…/voting-positions`, `…/votes`, `…/rewards`, `…/activity`, `…/xtopaz`; `POST /v1/accounts/{address}/invalidate` |
| xTOPAZ | `/v1/xtopaz`, `/v1/xtopaz/epochs`, `/v1/xtopaz/rate-history` |
| Bridge | `/v1/bridge?address=…`, `/v1/bridge/{guid}` |
| Curation | `/v1/categories`, `/v1/curation`, `/v1/token-lists`, `/v1/token-lists/{chainId}` |
| Auto Manage | `/v1/auto-manage/vaults`, `/v1/auto-manage/vaults/{chainId}/{vault}` (+ `/activity`, `/history`, `/rebalances`) |
| Quotes | `/v1/quote-providers` — capabilities only; executable quotes come from `quote.topazdex.com` via [swapping-api.md](swapping-api.md) |

Common requests:

| Need | Request |
|---|---|
| Networks and per-feature readiness | `GET /v1/chains` |
| Indexed deployment identities | `GET /v1/deployments?chainIds=all` |
| Token metadata, decimals, discovery | `GET /v1/tokens?chainIds=8453&limit=100` |
| Wallet token list | `GET /v1/token-lists/8453` |
| Curated pools ranked by emissions APR | `GET /v1/pools?chainIds=56&sort=emissionsApr&limit=20` |
| All eligible indexed pools | Add `scope=all` to pools — the default `scope=curated` returns only the published curation, which covers BNB only as of 2026-09-28, so a spoke pool list is empty without it; token discovery instead uses `curated=all` |
| Spoke pools ranked by emissions APR | `GET /v1/pools?chainIds=8453&scope=all&sort=emissionsApr&limit=20` |
| One pool with its APR scenario | `GET /v1/pools/56/{pool}?aprProfile=standard` |
| Pool candles and rolling windows | `GET /v1/pools/56/{pool}/history?interval=1d&from=earliest`, `…/daily?alignment=utc`, `…/trailing?windows=24h,7d` |
| Concentrated liquidity by tick | `GET /v1/pools/56/{pool}/ticks?tickLower=-20000&tickUpper=-18000` |
| Current USD prices | `GET /v1/prices?tokens=8453:0x4200000000000000000000000000000000000006,56:0xdf002282c1474c9592780618adda7eaa99998abd` |
| Gauge list, detail, reward events | `GET /v1/gauges?chainIds=56`, `/v1/gauges/56/{gauge}`, `/v1/gauges/56/{gauge}/rewards` |
| Where a vote earns most | `GET /v1/markets/bribes?chainIds=56&sort=dollarPerVote` — read `dollarPerVote`, `funding.bribesUsd`, `funding.feesUsd`, `voteWeight`, `funding.valuationComplete` |
| Vote events for one veNFT or spoke position | `GET /v1/votes?chainIds=56&positionId=1234&view=events` |
| Epoch summary and detail | `GET /v1/epochs?chainIds=56&limit=4`, `/v1/epochs/56/{epochStart}` |
| User protocol positions and rewards | `GET /v1/accounts/{address}/portfolio?chainIds=all&requireComplete=true` |
| User veNFTs and spoke voting positions | `GET /v1/accounts/{address}/voting-positions?chainIds=all` |
| Wallet + voting-staked xTOPAZ | `GET /v1/accounts/{address}/xtopaz?chainIds=all` |
| Backing and economic inventory | `GET /v1/xtopaz` |
| Historical rate events | `GET /v1/xtopaz/rate-history` |
| Hub settlements and spoke funding | `GET /v1/xtopaz/epochs` |
| Bridge packets | `GET /v1/bridge?chainIds=all&address={address}`, `GET /v1/bridge/{guid}` |
| Protocol totals and history | `GET /v1/protocol`, `/v1/protocol/history`, `/v1/protocol/daily`, `/v1/protocol/trailing` |
| Auto Manage (ALM) vaults and a user's shares | `GET /v1/auto-manage/vaults?listed=true&limit=200` (singular `chainId` filter), `GET /v1/accounts/{address}/liquidity-positions?chainIds=all&positionKinds=managed-cl-position&custody=vault` — see [auto-manage.md](auto-manage.md) |
| Quote-provider capabilities | `GET /v1/quote-providers` |

Legacy `gaugeApr`, `type` and `minTvl` are not interchangeable with `/v1` `emissionsApr`, `poolTypes` and `minTvlUsd`. Quote providers have independent network support; a configured provider may still be unavailable.

## Reading responses correctly

Every response is `{ ok, data, meta }`; list routes add `pageInfo: { hasNextPage, nextCursor }`. Failures are `{ ok: false, error: { code, message, docs } }` with a matching HTTP status: `market_not_found` and `gauge_not_found` are 404, `not_found` is an unknown route, `account_incomplete` is 503. Preserve `ok`, `data`, `meta`, field-level availability/reasons, `source` blocks and timestamps.

`meta.snapshots[]` carries per-chain `status`, `indexedBlock`, `indexedAt` and a `limitations` list (for example `gauge_notification_events_not_indexed` on BNB). Read it before claiming coverage. Deployment registry verification can be **configuration-only**, and readiness can be based on stored observations with `liveProbes:false`; neither authorizes a transaction without RPC checks. A healthy chain may still report `prices` or `emissionsApr` as `degraded` in `/v1/health/chains`.

Use decimal strings/bigints for accounting; USD amounts, raw token amounts and percentages arrive as strings. The Auto Manage routes and the `managed-cl-position` account member are the exception: their USD and APR fields are JSON numbers or null, APRs are annual fractions, and vault reads are uncached live lens calls ([auto-manage.md](auto-manage.md)). Null means unavailable, not zero. If totals expose `valueUsd:null` and `knownValueUsd`, label any shown known subtotal **partial**. Ownership completeness and USD valuation completeness are different. Independent chain snapshots are not a synchronized global checkpoint, even when their epoch labels agree.

Pool lists support `sort=emissionsApr` and `aprProfile=minimum|five-spacing|standard`; show the returned `aprScenario` (tick range, `stakedTvlUsd`, reward rate, `capped`, `fallback`) and its $100 reference deposit including dilution. Do not convert a representative CL scenario into a pool-wide or user-position APR. Current rate/backing is not a guaranteed market execution price.

Follow opaque pagination cursors with unchanged filters. Restart on expired cursor errors; do not synthesize cursors. Chart `from=earliest` and supported intervals allow broader history, but historical samples have explicit gaps and availability. Respect `Retry-After` on 429/503 with bounded jittered retries. Cache public data according to headers (`ETag` / `If-None-Match` are honored); account responses are private/no-store.

## Account xTOPAZ balance definition

The focused account endpoint sums liquid wallet xTOPAZ plus principal still in local voting positions, in raw 18-decimal shares. BNB's voting-staked component is zero: ordinary veTOPAZ/relay TOPAZ is not xTOPAZ. It excludes pending rewards, LP-embedded xTOPAZ, in-transit shares and protocol custody. Its default complete-only mode returns `503 account_incomplete` if a selected chain cannot be verified. Diagnostic `requireComplete=false` preserves nulls and partial rows; never award zero balance based on failed reads.

For post-transaction portfolio refresh, the API supports `POST /v1/accounts/{address}/invalidate`, then one `fresh=true` portfolio read. Use this after a relevant authorized user action, not as a background poll. No API refresh replaces reading balances, allowances, ownership, live gates and pool state immediately before simulation/submission.

## Subgraphs

BNB keeps three Goldsky graphs on the stable `prod` tag — `topaz-v2`, `topaz-v3` and `topaz-ve` (veNFT locks, votes, bribe and fee notifications, epochs, gauge stakes, relays, xTOPAZ hub state). Entity catalogs and queries are in [analytics-subgraph.md](analytics-subgraph.md). Spokes are indexed by per-chain `topaz-chain-{slug}` graphs published as immutable releases (`r-{sourceSha}-{artifactHash}`), not a `prod` tag; the API pins the current one and exposes its `sourceVersion` and IPFS `deployment` hash under `/v1/chains` → `health.configuredSources`. Spoke graphs use a different unified schema (`chainState`, `pools`, `poolType`, user/protocol entity kind and local positions). Do not reuse BNB GraphQL entities on a spoke or pin a spoke release URL from memory. Prefer `/v1` for portable discovery; use a chain-specific graph only after checking its deployment identity against the registry. Exclude system pools from user market totals and keep closed position owners for reward history.

## Windows and retained historical reports

Current volume and fees use server-computed rolling 24-hour and seven-day windows. Respect explicit observation boundaries; never apply the older Stats UTC-day proration. Use explicit UTC alignment for daily charts and preserve partial coverage. Updates have source-specific timestamps, not a universal refresh schedule.

[Historical Stats reports](analytics-stats-api.md) remain for cumulative volume/fees, Foundation ROI/lifetime incentives, reported TOPAZ supply/locked share, BNB escrow totals and BNB base/maximum fee settings. These do not follow the multichain network filter. Use `/v1` prices and current market metrics; date retained reports separately. Multichain lifetime USD volume needs historical pricing and verified coverage, not a sum of raw token counters.
