# Analytics — Stats API

The Topaz Stats API is a public REST endpoint that serves pre-computed protocol metrics, pool snapshots, gauge APRs, foundation activity, and system health. It snapshots every 15 minutes and caches responses at 60s ISR.

**Base URL:** `https://www.topazdex.com/api/stats`

Override via `TOPAZ_STATS_API_URL` env var in `scripts/.env`. No auth required.

Full endpoint schema: `.claude/STATS-API.md`.

## When to use which data source

| Need | Best source | Why |
|---|---|---|
| Protocol overview (TVL, volume, fees, TOPAZ price, veTOPAZ totals) | **Stats API** `/protocol` | Single call, pre-aggregated |
| Pool list sorted by TVL/volume/fees/APR | **Stats API** `/pools` | Pre-computed, filterable, includes fee APR |
| Pool 7-day history (15-min granularity) | **Stats API** `/pools/{addr}` | 168 snapshots ready to go |
| All gauges with emission/fee/bribe/total APR | **Stats API** `/gauges` | One call; no manual APR calculation |
| Foundation wallet, veNFT IDs, voting power | **Stats API** `/ve` or `/foundation` | **Only source** for this data |
| Foundation vote allocations by epoch | **Stats API** `/foundation/votes` | **Only source** |
| Foundation bribe deposits | **Stats API** `/foundation/bribes` | **Only source** |
| KPI effectiveness (cost-per-TVL, ROI, classification) | **Stats API** `/foundation/kpis` | **Only source** |
| All vote allocations (foundation + external) | **Stats API** `/votes` | Pre-aggregated |
| Bribe history (filterable by pool/epoch) | **Stats API** `/bribes` | Indexed with USD values |
| Dynamic fee readings (snapshot vs live) | **Stats API** `/dynamic-fees`, `/live/dynamic-fees` | Pre-filtered to dynamic-fee pools |
| Data freshness / system health | **Stats API** `/health` | Monitors snapshot pipeline |
| Real-time quote for a swap | **On-chain** (QuoterV2 / Router) | Stats API has no quoting |
| Build transaction calldata | **On-chain** | Stats API is read-only |
| User-specific state (balances, positions, claimable) | **On-chain** | Stats API has no per-user data |
| Block-accurate state for time-sensitive ops (vote, bribe) | **On-chain** | Stats API lags up to 15 min |
| Historical daily volume/fees (30+ days) | **Subgraph** | Day-data entities go back further |
| Token search / pool discovery by token address | **Subgraph** | More flexible GraphQL filtering |

**Rule of thumb:** Use the Stats API when you need aggregated, human-readable numbers (dashboards, summaries, comparisons). Use subgraph + on-chain when you need per-user state, real-time precision, or transaction construction.

## Response envelope

Every endpoint returns `{ ok, data, meta }`:

```json
{
  "ok": true,
  "data": { ... },
  "meta": {
    "chainId": 56,
    "generatedAt": "2026-05-25T12:00:00.000Z",
    "snapshotAt": "2026-05-25T11:45:00.000Z",
    "source": ["topaz-subgraph-v2", "topaz-subgraph-v3", "bsc-rpc"],
    "cacheTtlSeconds": 60
  }
}
```

All USD amounts and percentages are strings (to preserve precision). Counts are numbers. Addresses are lowercase hex.

## Key endpoints

### Protocol at a glance

```bash
curl https://www.topazdex.com/api/stats/protocol | jq .data
```

Returns: `tvlUsd`, `v2TvlUsd`, `v3TvlUsd`, `volume24hUsd`, `volume7dUsd`, `fees24hUsd`, `fees7dUsd`, `cumulativeVolumeUsd`, `cumulativeFeesUsd`, `poolCount`, `activeGaugeCount`, `topazPriceUsd`, `totalLockedTopaz`, `totalVetopazPower`, `currentEpochStart`.

### Pool list

```bash
curl "https://www.topazdex.com/api/stats/pools?sort=apr&limit=10&type=v3" | jq .data
```

Each pool includes `tvlUsd`, `volume24hUsd`, `fees24hUsd`, `feeApr`, token symbols, pool type, fee details.

Filter by pair: `?pair=BNB-USDT` (case-insensitive, either token order).

### Pool history

```bash
curl https://www.topazdex.com/api/stats/pools/0xPOOL | jq '.data.history | length'
```

Returns `{ current, history }` — up to 168 snapshots (7 days at 15-min intervals).

### Gauges with APRs

```bash
curl https://www.topazdex.com/api/stats/gauges | jq '.data[] | {pair: (.token0Symbol + "/" + .token1Symbol), totalApr, emissionApr, feeApr, bribeApr}'
```

Each gauge: `emissionApr`, `feeApr`, `bribeApr`, `totalApr`, `stakedTvlUsd`, `totalVoteWeight`, `foundationVoteWeight`, `alive`.

### Foundation data

```bash
curl https://www.topazdex.com/api/stats/foundation | jq .data
```

Returns: wallet address, veNFT IDs, voting power, active vote/pool counts, lifetime bribe totals, per-epoch bribe summaries.

Foundation vote allocations:
```bash
curl "https://www.topazdex.com/api/stats/foundation/votes?latestOnly=true" | jq .data
```

Foundation KPI effectiveness:
```bash
curl https://www.topazdex.com/api/stats/foundation/kpis | jq '.data[] | {pool: .poolAddress, classification, bribeCost: .bribeCostUsd, tvlDelta: .tvlDeltaUsd, roi: .roiEstimate}'
```

KPI `classification` values: `scale`, `repeat`, `monitor`, `reduce`, `stop`, `insufficient_data`.

### Bribe history

```bash
curl "https://www.topazdex.com/api/stats/bribes?pool=0xPOOL&limit=50" | jq .data
```

Each bribe: `txHash`, `timestamp`, `epochStart`, `tokenSymbol`, `amountDecimal`, `amountUsd`, `isFoundationFunded`.

### Dynamic fees

Snapshot-based (which pools have custom/dynamic fees):
```bash
curl https://www.topazdex.com/api/stats/dynamic-fees | jq .data
```

Live on-chain readings (compares snapshot fee to current):
```bash
curl https://www.topazdex.com/api/stats/live/dynamic-fees | jq '.data.pools[] | {pair: (.token0Symbol + "/" + .token1Symbol), snapshotFee, liveFee}'
```

### Health check

```bash
curl https://www.topazdex.com/api/stats/health | jq .data
```

Returns HTTP `200` if healthy, `503` if stale. Check `minutesSinceLastSuccess` and `lastAttemptStatus`.

## Using the TypeScript client

`scripts/src/lib/statsApi.ts` exports typed wrappers for every endpoint:

```ts
import {
  fetchProtocol,
  fetchPools,
  fetchGauges,
  fetchFoundation,
  fetchFoundationVotes,
  fetchFoundationKpis,
  fetchBribes,
  fetchHealth,
} from "./index.js";  // from scripts/src/

const { data: protocol } = await fetchProtocol();
console.log(`TVL: $${protocol.tvlUsd}, TOPAZ: $${protocol.topazPriceUsd}`);

const { data: pools } = await fetchPools({ sort: "apr", limit: 10, type: "v3" });
const { data: gauges } = await fetchGauges();
const { data: foundation } = await fetchFoundation();
const { data: kpis } = await fetchFoundationKpis();
```

Errors throw `StatsApiRequestError` with `code`, `message`, and `meta`.

## CLI

```bash
cd scripts
yarn tsx src/cli/stats.ts protocol          # protocol overview
yarn tsx src/cli/stats.ts api-pools --sort apr --limit 10
yarn tsx src/cli/stats.ts api-gauges        # all gauges with APRs
yarn tsx src/cli/stats.ts foundation        # foundation summary
yarn tsx src/cli/stats.ts foundation-votes  # vote allocations
yarn tsx src/cli/stats.ts foundation-bribes # bribe deposits
yarn tsx src/cli/stats.ts foundation-kpis   # KPI effectiveness
yarn tsx src/cli/stats.ts dynamic-fees      # pools with dynamic fees
yarn tsx src/cli/stats.ts health            # API health
```

## Caveats

- **Staleness**: Snapshots run every 15 minutes. For time-sensitive operations (voting deadlines, live swap prices), use on-chain reads.
- **No per-user data**: The Stats API is protocol-wide. User balances, positions, and claimable amounts require on-chain reads.
- **No write capability**: The API is read-only. Transaction construction uses on-chain ABIs.
- **`force-dynamic` endpoints**: `/health`, `/live/dynamic-fees`, and `/foundation/kpis` bypass ISR cache and hit the server on every request.
