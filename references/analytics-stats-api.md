# Analytics — Stats API

The Topaz Stats API is a public REST endpoint that serves pre-computed protocol metrics, pool & gauge snapshots, **gauge APRs**, **historical time-series**, token prices, epoch/voting summaries, bribe markets, foundation activity, and system health. It snapshots every 15 minutes and caches responses at 60s ISR.

**This is the easiest, fastest, and most accurate way to read any data the API exposes.** Prefer it over the subgraph or on-chain calls for anything in the catalog below; fall back to subgraph/on-chain only for data the API does not serve (see the decision table).

**Base URL:** `https://www.topazdex.com/api/stats`

Override via `TOPAZ_STATS_API_URL` env var in `scripts/.env`. No auth required; all endpoints are read-only `GET`.

## Source of truth: the OpenAPI spec

The API publishes a machine-readable **OpenAPI 3.1** spec. Treat it as canonical — when the API gains fields or endpoints, the spec updates automatically, so it never drifts from the code. Fetch it at runtime rather than trusting any static copy when you need an exact, current schema.

| Resource | URL | Use |
|---|---|---|
| OpenAPI 3.1 spec | `https://www.topazdex.com/api/stats/openapi.json` | **Canonical contract.** Exact request/response schemas for every endpoint. Feed to `openapi-typescript`, codegen, Postman, or an agent. |
| Swagger UI | `https://www.topazdex.com/api/stats/docs` | Human-browsable docs with "Try it out" against the live API. |
| Discovery linkset | `https://www.topazdex.com/.well-known/api-catalog` | RFC 9727 linkset pointing at the spec, Swagger UI, and skill manifest. |
| Skill manifest | `https://www.topazdex.com/skill.json` | Topaz agent skill manifest; carries an `analytics_api` block enumerating endpoints. |

```bash
# Inspect the live contract (authoritative field list for any endpoint):
curl -s https://www.topazdex.com/api/stats/openapi.json | jq '.paths | keys'

# Generate a typed TypeScript client straight from the spec:
npx openapi-typescript https://www.topazdex.com/api/stats/openapi.json -o topaz-api.ts
```

The endpoint catalog below is a quick map for agents; **for exact, up-to-date schemas always consult `openapi.json`.**

## When to use which data source

| Need | Best source | Why |
|---|---|---|
| Protocol overview (TVL, volume, fees, TOPAZ price, veTOPAZ totals) | **Stats API** `/protocol` | Single call, pre-aggregated |
| Protocol TVL/volume/fee/price **history** | **Stats API** `/protocol/history`, `/protocol/daily` | Chart-ready time-series; daily rollups dedupe the subgraph's running total |
| Pool list sorted by TVL/volume/fees/**fee APR**/**gauge APR** | **Stats API** `/pools` | Pre-computed, filterable (`pair`, `token`, `minTvl`, `incentivized`), includes `gaugeApr` |
| Pool detail + 7-day history + its gauge + gauge history | **Stats API** `/pools/{addr}` | One call returns `{ current, history, gauge, gaugeHistory }` |
| Pool daily candles **beyond 7 days** | **Stats API** `/pools/{addr}/daily` | Long-horizon `pool_daily` table (up to 365d) |
| All gauges with emission/fee/bribe/**total APR** | **Stats API** `/gauges` | One call; no manual APR calculation |
| Single gauge APR-breakdown history | **Stats API** `/gauges/{addr}` | 7-day APR history |
| Per-epoch reward-token breakdown for a gauge | **Stats API** `/gauges/{addr}/rewards` | Token-by-token bribe + fee USD amounts |
| Token prices & price history | **Stats API** `/tokens`, `/tokens/{addr}` | USD price per tracked token, 7-day history |
| Epoch summaries / single-epoch detail | **Stats API** `/epochs`, `/epochs/{start}` | Bribe totals, foundation vote share, top gauges, votes/bribes/KPIs |
| Current bribe markets ($/vote per gauge) | **Stats API** `/markets/bribes` | Sorted by reward USD; derived `dollarPerVote` for vote routing |
| Foundation wallet, veNFT IDs, voting power, **veNFT lock details** | **Stats API** `/ve` or `/foundation` | **Only source** (locks fetched live from RPC server-side) |
| Foundation votes / bribes / KPI effectiveness | **Stats API** `/foundation/*` | **Only source** |
| Bribe history (filterable by pool/epoch/gauge) | **Stats API** `/bribes`, `/pools/{addr}/bribes`, `/gauges/{addr}/bribes` | Indexed with USD values |
| Foundation bribe spend per epoch | **Stats API** `/bribes/totals` | Pre-aggregated |
| Dynamic fee readings (snapshot vs live) | **Stats API** `/dynamic-fees`, `/live/dynamic-fees` | Pre-filtered to dynamic-fee pools |
| Data freshness / system health | **Stats API** `/health` | Monitors snapshot pipeline |
| Real-time quote for a swap | **On-chain** (QuoterV2 / Router) | Stats API has no quoting |
| Build transaction calldata | **On-chain** | Stats API is read-only |
| User-specific state (balances, positions, claimable) | **On-chain** | Stats API has no per-user data |
| Block-accurate state for time-sensitive ops (vote, bribe) | **On-chain** | Stats API lags up to 15 min |
| Daily history beyond what the API serves, or flexible token/pool GraphQL filtering | **Subgraph** | Arbitrary entity queries |

**Rule of thumb:** Reach for the Stats API first for any aggregated, historical, or human-readable number. Use the subgraph only for ad-hoc GraphQL filtering or history past the API's window, and on-chain only for per-user state, block-accurate precision, or transaction construction.

## Response envelope

Every endpoint returns `{ ok, data, meta }`:

```json
{
  "ok": true,
  "data": { ... },
  "meta": {
    "chainId": 56,
    "generatedAt": "2026-05-28T20:00:43.515Z",
    "snapshotAt": "2026-05-28T19:45:43.303Z",
    "source": ["snapshots-db"],
    "cacheTtlSeconds": 60
  }
}
```

The discriminant is the boolean `ok`. On failure: `{ ok: false, error: { code, message }, meta }` with a `4xx`/`5xx` status (`503` is reserved for `/health` when snapshots are stale). All USD amounts, token amounts, and percentages are **strings** (to preserve precision); counts are numbers; addresses are lowercase hex; timestamps are ISO 8601. Responses carry an `ETag` keyed on `meta.snapshotAt` for conditional GETs.

## Endpoint catalog

Grouped quick-reference. Consult `openapi.json` for exact field lists.

### Protocol
- `GET /protocol` — latest protocol-wide aggregate (TVL, v2/v3 TVL, 24h/7d volume & fees, cumulative totals, pool/gauge counts, TOPAZ price, veTOPAZ totals, current epoch).
- `GET /protocol/history?days=30` — snapshot-resolution time-series (`tvlUsd`, `v2/v3TvlUsd`, `volume24hUsd`, `fees24hUsd`, `topazPriceUsd`).
- `GET /protocol/daily?days=30` — one row per UTC day (`volumeUsd`, `feesUsd`, `partial`). Use for daily bar charts.

### Pools
- `GET /pools` — list. Params: `type` (`v2`/`v3`/`all`), `sort` (`tvl`/`volume24h`/`fees24h`/`apr`/`gaugeApr`), `limit`, `pair` (`WBNB-USDT`), `token` (0x), `minTvl`, `incentivized`. Each pool carries `feeApr` and `gaugeApr`.
- `GET /pools/{addr}` — `{ current, history (≤672), gauge, gaugeHistory (≤672) }` in one call.
- `GET /pools/{addr}/daily?days=90` — long-horizon daily candles (`volumeUsd`, `feesUsd`, `tvlUsdClose`).
- `GET /pools/{addr}/bribes` — bribes routed to this pool's gauge (alias of `/bribes?pool=`).

### Gauges
- `GET /gauges` — all gauges with `emissionApr`, `feeApr`, `bribeApr`, `totalApr`, `stakedTvlUsd`, vote weights, joined token symbols/addresses.
- `GET /gauges/{addr}` — `{ current, history (≤672) }` APR-breakdown history.
- `GET /gauges/{addr}/bribes` — bribes on this gauge.
- `GET /gauges/{addr}/kpis` — foundation KPI/classification history.
- `GET /gauges/{addr}/rewards?limit=12` — per-epoch reward-token breakdown (`kind: bribe|fee`, `amountDecimal`, `amountUsd`).

### Tokens
- `GET /tokens?limit=100` — every tracked token with `priceUsd`, sorted by price desc.
- `GET /tokens/{addr}` — `{ current, history (≤672) }` price history.

### Epochs, bribes & markets
- `GET /epochs?limit=12` — recent epoch summaries (bribe totals, foundation vote share, gauge count, top 5 gauges).
- `GET /epochs/{unixSeconds}` — single epoch detail (`votes`, `bribes`, `kpis`, `totals`).
- `GET /bribes` — bribe deposits across all gauges (params: `pool`, `epoch`, `foundationOnly`, `limit`).
- `GET /bribes/totals` — foundation bribe spend per epoch.
- `GET /markets/bribes?minUsd=0` — current bribe markets per gauge with derived `dollarPerVote`, sorted by reward USD. Best signal for **where a voter earns the most per vote**.

### Foundation & votes
- `GET /foundation` — transparency summary (wallet, veNFT IDs, voting power, active vote/pool counts, lifetime bribe totals, recent per-epoch bribe summaries).
- `GET /foundation/votes` — foundation veNFT vote allocations (`epoch`, `latestOnly`).
- `GET /foundation/bribes` — foundation-funded bribes (alias of `/bribes?foundationOnly=true`).
- `GET /foundation/kpis` — vote-ROI per epoch/pool with `classification` (`scale`/`repeat`/`monitor`/`reduce`/`stop`/`insufficient_data`).
- `GET /votes` — vote allocations (currently foundation only; same shape as `/foundation/votes`).

### veTOPAZ
- `GET /ve` — veTOPAZ supply + foundation lock stats. The nested `foundation` block carries `wallet`, `venftIds`, `activeVotingPower`, and per-NFT `locks` (`lockedAmount`, `votingPower`, `lockEnd`, `isPermanent`) fetched live from BNB RPC. Top-level `foundationWallet`/`foundationVeNftIds`/`foundationVotingPowerActive` are **deprecated** — read `foundation.*`.

### Dynamic fees, system & discovery
- `GET /dynamic-fees` — v3 CL pools using custom/dynamic fee modules (snapshot).
- `GET /live/dynamic-fees` — live on-chain fee readings (bypasses the 15-min snapshot).
- `GET /health` — snapshot freshness (`200` healthy / `503` stale).
- `GET /config` — chain id, methodology version, tracked pairs, key contract addresses.
- `GET /openapi.json`, `GET /docs` — the spec and Swagger UI (see [Source of truth](#source-of-truth-the-openapi-spec)).

## Example queries

```bash
# Highest gauge APR among incentivized pools over $10k TVL:
curl "https://www.topazdex.com/api/stats/pools?sort=gaugeApr&incentivized=true&minTvl=10000&limit=20" | jq '.data[] | {pair:(.token0Symbol+"/"+.token1Symbol), gaugeApr, feeApr, tvlUsd}'

# 30-day protocol TVL & volume history:
curl "https://www.topazdex.com/api/stats/protocol/history?days=30" | jq '.data'

# Where does a voter earn the most per vote this epoch?
curl "https://www.topazdex.com/api/stats/markets/bribes?minUsd=1" | jq '.data[] | {pair:(.token0Symbol+"/"+.token1Symbol), dollarPerVote, totalRewardUsd}'

# Foundation veNFT locks (lock end / permanent status), served from live RPC:
curl "https://www.topazdex.com/api/stats/ve" | jq '.data.foundation.locks'
```

## Using the TypeScript client

`scripts/src/lib/statsApi.ts` exports a typed wrapper for **every** endpoint:

```ts
import {
  fetchProtocol, fetchProtocolHistory, fetchProtocolDaily,
  fetchPools, fetchPool, fetchPoolDaily, fetchPoolBribes,
  fetchGauges, fetchGauge, fetchGaugeRewards, fetchGaugeBribes, fetchGaugeKpis,
  fetchTokens, fetchToken,
  fetchEpochs, fetchEpoch,
  fetchBribes, fetchBribeTotals, fetchBribeMarkets,
  fetchFoundation, fetchFoundationVotes, fetchFoundationKpis,
  fetchVe, fetchHealth, fetchConfig,
} from "./index.js";  // from scripts/src/

const { data: protocol } = await fetchProtocol();
const { data: pools } = await fetchPools({ sort: "gaugeApr", incentivized: true, minTvl: 10000 });
const { data: history } = await fetchProtocolHistory({ days: 30 });
const { data: markets } = await fetchBribeMarkets({ minUsd: 1 });
const { data: ve } = await fetchVe();           // ve.foundation.locks
```

Errors throw `StatsApiRequestError` with `code`, `message`, and `meta`.

## CLI

```bash
cd scripts
yarn tsx src/cli/stats.ts protocol               # protocol overview
yarn tsx src/cli/stats.ts protocol-history --days 30
yarn tsx src/cli/stats.ts protocol-daily --days 30
yarn tsx src/cli/stats.ts api-pools --sort gaugeApr --incentivized --min-tvl 10000 --limit 20
yarn tsx src/cli/stats.ts pool-daily 0xPOOL --days 90
yarn tsx src/cli/stats.ts api-gauges             # all gauges with APRs
yarn tsx src/cli/stats.ts api-gauge 0xGAUGE      # single gauge detail
yarn tsx src/cli/stats.ts gauge-rewards 0xGAUGE  # per-epoch reward tokens
yarn tsx src/cli/stats.ts bribe-markets --min-usd 1   # $/vote per gauge
yarn tsx src/cli/stats.ts bribe-totals           # foundation spend per epoch
yarn tsx src/cli/stats.ts tokens --limit 20      # token prices
yarn tsx src/cli/stats.ts token 0xTOKEN          # single token + history
yarn tsx src/cli/stats.ts epochs --limit 12      # epoch summaries
yarn tsx src/cli/stats.ts epoch 1748390400       # single epoch detail
yarn tsx src/cli/stats.ts foundation             # foundation summary
yarn tsx src/cli/stats.ts foundation-votes --epoch N
yarn tsx src/cli/stats.ts foundation-kpis --pool 0x..
yarn tsx src/cli/stats.ts dynamic-fees           # pools with dynamic fees
yarn tsx src/cli/stats.ts health                 # API health
```

## Caveats

- **Staleness**: Snapshots run every 15 minutes. For time-sensitive operations (voting deadlines, live swap prices), use on-chain reads.
- **No per-user data**: The Stats API is protocol-wide. User balances, positions, and claimable amounts require on-chain reads.
- **No write capability**: The API is read-only. Transaction construction uses on-chain ABIs.
- **`force-dynamic` endpoints**: `/health`, `/live/dynamic-fees`, and `/foundation/kpis` bypass ISR cache and hit the server on every request.
- **Schema authority**: field-level shapes can gain fields over time. When you need certainty, read `openapi.json` rather than this catalog.
