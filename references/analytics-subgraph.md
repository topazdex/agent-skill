# Analytics — Subgraphs

Topaz indexes two subgraphs on Goldsky — a v2 (Solidly) subgraph and a v3 (Slipstream) subgraph. The entity catalogs below are the canonical reference for query authoring.

> **Try the Stats API first.** For pool lists, gauge APRs, protocol totals, token prices, epoch/bribe data, and **historical time-series** (`/protocol/history`, `/protocol/daily`, `/pools/{addr}/daily`, plus 7-day snapshot history on most detail endpoints), the Stats API (`analytics-stats-api.md`) is the easiest, fastest, and most accurate source — one REST call with pre-computed numbers, and its OpenAPI spec (`https://www.topazdex.com/api/stats/openapi.json`) is the canonical contract. Reach for the subgraphs below only for ad-hoc GraphQL filtering, per-transaction event data (`Mint`/`Burn`/`Swap`), or history beyond the API's window.

## Endpoints

```
V2:  https://api.goldsky.com/api/public/project_cmgzljqwl006c5np2gnao4li4/subgraphs/topaz-v2/v0.0.4/gn
V3:  https://api.goldsky.com/api/public/project_cmgzljqwl006c5np2gnao4li4/subgraphs/topaz-v3/v0.0.2/gn
```

Override via `SUBGRAPH_V2_URL` / `SUBGRAPH_V3_URL` env vars in `scripts/.env`. Both POST JSON to `/`. No auth.

## V2 schema (high level)

| Entity | Key fields |
|---|---|
| `UniswapFactory` | `id`, `pairCount`, `totalVolumeUSD`, `totalLiquidityUSD`, `totalFeesUSD`, `txCount` |
| `Token` | `id`, `symbol`, `name`, `decimals`, `tradeVolumeUSD`, `totalLiquidity`, `derivedETH` |
| `Pair` | `id`, `token0`, `token1`, `reserve0`, `reserve1`, `totalSupply`, `stable`, `fee`, `customFee`, `reserveUSD`, `token0Price`, `token1Price`, `volumeUSD`, `feesUSD`, `txCount`, `liquidityProviderCount`, `createdAtTimestamp` |
| `Mint`, `Burn`, `Swap` | Per-tx events with `pair`, `amount0/1`, `amountUSD`, `from`/`to`/`sender`/`recipient` |
| `Bundle` (id=`1`) | `ethPrice` — USD per BNB |
| `UniswapDayData` | Global daily rollups (`dailyVolumeUSD`, `dailyFeesUSD`, `totalLiquidityUSD`, `txCount`) |
| `PairDayData`, `PairHourData` | Per-pair rollups |
| `TokenDayData` | Per-token daily rollups (`priceUSD`, `dailyVolumeUSD`, `totalLiquidityUSD`) |

**Note**: Despite the "Uniswap"-prefixed entity names (legacy from the v2 subgraph template), this is Topaz v2 data — the `Pair.stable` flag distinguishes Solidly stable pools from volatile.

## V3 schema (high level)

| Entity | Key fields |
|---|---|
| `Factory` | `id`, `poolCount`, `totalVolumeUSD`, `totalValueLockedUSD`, `totalFeesUSD` |
| `Bundle` (id=`1`) | `ethPriceUSD` |
| `Token` | `id`, `symbol`, `name`, `decimals`, `volume`, `volumeUSD`, `feesUSD`, `poolCount`, `totalValueLockedUSD`, `derivedETH`, `whitelistPools` |
| `Pool` | `id`, `token0`, `token1`, `tickSpacing`, `fee`, `feeTier`, `customFee`, `dynamicFee`, `dynamicFeeCap`, `dynamicScalingFactor`, `liquidity`, `sqrtPrice`, `tick`, `token0Price`, `token1Price`, `volumeUSD`, `feesUSD`, `totalValueLockedUSD`, `collectedFeesUSD`, `txCount`, `liquidityProviderCount`, `createdAtTimestamp` |
| `Tick` | `id`, `pool`, `tickIdx`, `liquidityGross`, `liquidityNet`, `price0`, `price1` |
| `Mint`, `Burn`, `Swap`, `Collect` | Per-tx events with `pool`, `tickLower`/`tickUpper` (where applicable), amounts |
| `Transaction` | Container for the above |
| `UniswapDayData` | Global daily (`volumeUSD`, `feesUSD`, `tvlUSD`, `txCount`) |
| `PoolDayData`, `PoolHourData` | OHLC + volume/fees/tvl |
| `TokenDayData`, `TokenHourData` | OHLC + volume + price |

**Important** — both subgraphs **do not** currently index gauges/votes/bribes/locks. Those entities are read directly from chain (see `analytics-onchain.md`). Don't search for `Gauge`/`Vote` types in these schemas.

## Example queries

### Top 10 v2 pools by TVL

```graphql
query TopV2Pools {
  pairs(first: 10, orderBy: reserveUSD, orderDirection: desc, where: { reserveUSD_gt: "0" }) {
    id
    stable
    fee
    customFee
    reserveUSD
    volumeUSD
    feesUSD
    token0 { id symbol decimals }
    token1 { id symbol decimals }
  }
}
```

### Top 10 v3 pools by TVL

```graphql
query TopV3Pools {
  pools(first: 10, orderBy: totalValueLockedUSD, orderDirection: desc, where: { totalValueLockedUSD_gt: "0" }) {
    id
    tickSpacing
    fee
    feeTier
    customFee
    dynamicFee
    totalValueLockedUSD
    volumeUSD
    feesUSD
    liquidity
    sqrtPrice
    tick
    token0 { id symbol decimals }
    token1 { id symbol decimals }
  }
}
```

### Single v3 pool with last 14 daily snapshots

```graphql
query PoolDetail($pool: ID!) {
  pool(id: $pool) {
    id
    tickSpacing
    feeTier
    totalValueLockedUSD
    volumeUSD
    feesUSD
    liquidity
    sqrtPrice
    tick
    token0 { symbol decimals }
    token1 { symbol decimals }
  }
  poolDayDatas(first: 14, orderBy: date, orderDirection: desc, where: { pool: $pool }) {
    date
    volumeUSD
    feesUSD
    tvlUSD
    open close high low
  }
}
```

For v2, replace `pool`/`pools`/`poolDayDatas` with `pair`/`pairs`/`pairDayDatas`. v2 daily data uses `dailyVolumeUSD` / `dailyFeesUSD` field names.

### User's v2 LP positions

The v2 subgraph doesn't index per-user balances directly. Either read `ERC20.balanceOf(user)` on each Pair on-chain, or query Mint/Burn events:

```graphql
query UserV2LPHistory($user: Bytes!) {
  mints(where: { to: $user }, orderBy: timestamp, orderDirection: desc, first: 100) {
    id timestamp pair { id token0 { symbol } token1 { symbol } stable }
    amount0 amount1 amountUSD liquidity
  }
  burns(where: { sender: $user }, orderBy: timestamp, orderDirection: desc, first: 100) {
    id timestamp pair { id token0 { symbol } token1 { symbol } stable }
    amount0 amount1 amountUSD liquidity
  }
}
```

Authoritative current balance is on-chain.

### User's v3 positions

The v3 subgraph also doesn't index ERC721 position ownership. Read on-chain via `NonfungiblePositionManager.balanceOf(user)` + `tokenOfOwnerByIndex(user, i)`. Then for each `tokenId`, `npm.positions(tokenId)` and join with the indexed `Pool` entity using `(token0, token1, tickSpacing)`.

```graphql
query PoolForPosition($t0: Bytes!, $t1: Bytes!, $ts: BigInt!) {
  pools(where: { token0: $t0, token1: $t1, tickSpacing: $ts }, first: 1) {
    id totalValueLockedUSD volumeUSD feesUSD tickSpacing feeTier
    token0 { symbol decimals } token1 { symbol decimals }
  }
}
```

### Historical daily totals (last 30 days, v3)

```graphql
query GlobalDaily {
  uniswapDayDatas(first: 30, orderBy: date, orderDirection: desc) {
    date
    volumeUSD
    feesUSD
    tvlUSD
    txCount
  }
}
```

### Pool by token pair (any v3 tick spacing)

```graphql
query PoolsForPair($t0: Bytes!, $t1: Bytes!) {
  pools(where: { token0: $t0, token1: $t1 }) {
    id tickSpacing feeTier totalValueLockedUSD volumeUSD
  }
}
```

Sort by `totalValueLockedUSD` desc client-side to pick the canonical pool.

### Token top movers

```graphql
query TokenDay {
  tokenDayDatas(first: 20, orderBy: volumeUSD, orderDirection: desc) {
    token { id symbol name }
    date
    volumeUSD
    priceUSD
    totalValueLockedUSD
  }
}
```

### Current BNB price (for any USD-derivation locally)

```graphql
query BnbPrice { bundle(id: "1") { ethPrice } }     # v2
query BnbPrice { bundle(id: "1") { ethPriceUSD } }  # v3
```

## Calling the subgraph from scripts

```ts
import { GraphQLClient, gql } from "graphql-request";

const v2 = new GraphQLClient(process.env.SUBGRAPH_V2_URL!);
const v3 = new GraphQLClient(process.env.SUBGRAPH_V3_URL!);

const TOP_V3 = gql`query { pools(first: 10, orderBy: totalValueLockedUSD, orderDirection: desc) { id totalValueLockedUSD volumeUSD } }`;
const { pools } = await v3.request<{ pools: any[] }>(TOP_V3);
```

`scripts/src/lib/subgraph.ts` exports `v2Client` and `v3Client` instances. `scripts/src/read/subgraphQueries.ts` wraps the most common queries.

## Limitations & caveats

- **Indexing lag**: Goldsky typically lags 1–2 blocks behind chain head. For things that need real-time freshness (current pool price, current voting weight, pending claims), use on-chain reads via `analytics-onchain.md`.
- **No gauge / vote data in subgraphs** as noted above. There is a placeholder for a future gauges subgraph but it's not currently live.
- **`fee` vs `feeTier`** in v3: `feeTier` is the tickSpacing default; `fee` is the effective fee at index time (could be overridden by a fee module). Use `fee` for revenue calcs.
- **`customFee` and `dynamicFee` booleans** indicate non-default fee state — surface these in any "pool detail" UI so users understand why the fee changed.
- **`derivedETH` is the token's price in WBNB**; multiply by `bundle.ethPrice(USD)` to get USD.
