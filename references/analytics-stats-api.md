# Historical Topaz Stats reports

Use [the multichain API](analytics-multichain.md) for current protocol totals, pool/token discovery, pricing, charts, gauges, votes, incentives and account observations across Topaz networks.

The public Topaz Stats service at `https://api.topazdex.com/api/stats` is retained only for reports without a `/v1` equivalent:

| Report | Route | Scope |
| --- | --- | --- |
| Lifetime volume and fees | `/protocol` | Available historical record; multichain lifetime USD totals are coming |
| Foundation ROI and lifetime incentives | `/foundation`, `/foundation/votes`, `/foundation/bribes`, `/foundation/kpis` | Original deployment's Foundation report |
| TOPAZ supply and locked share | `/topaz` | Reported supply; locked share measures veTOPAZ voting power, not locked principal |
| Escrow totals | `/ve` | BNB Chain escrow |
| Base and maximum fee settings | `/live/dynamic-fees` | BNB Chain settings; use `/v1/pools` for observed fees on selected networks |

Read each report's update time and methodology. These reports do not follow the multichain network filter. Compute current TOPAZ valuations with a resolved `/v1` price and the separately dated reported supply. Never present a missing or stale observation as zero. Do not sum raw token-volume counters into lifetime USD volume without historical pricing and verified coverage.

Use the [full OpenAPI contract](https://api.topazdex.com/openapi.json) for exact route schemas. The older `/api/stats/openapi.json` describes legacy reports only. The existing TypeScript `statsApi` helpers and `TOPAZ_STATS_API_URL` setting still use that older schema; do not point them to `/v1` or label their responses multichain. Use direct `/v1` calls for supported data until those helpers are migrated.

Updates are source-specific, not a universal 15-minute schedule. Legacy `volume24hUsd` and `fees24hUsd` are UTC-day buckets; the new API's current metrics are server-computed rolling windows and must not be prorated. Analytics observations are not transaction preconditions.
