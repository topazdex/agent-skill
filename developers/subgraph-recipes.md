# Subgraph Recipes

Topaz has separate Goldsky subgraphs for v2 and v3 pool data. Use them for indexed history, TVL, volume, fees, and pool discovery.

## Endpoints

```text
v2: https://api.goldsky.com/api/public/project_cmgzljqwl006c5np2gnao4li4/subgraphs/topaz-v2/v0.0.3/gn
v3: https://api.goldsky.com/api/public/project_cmgzljqwl006c5np2gnao4li4/subgraphs/topaz-v3/v0.0.1/gn
```

## Client setup

```ts
import { GraphQLClient, gql } from "graphql-request";

const v2 = new GraphQLClient(process.env.SUBGRAPH_V2_URL!);
const v3 = new GraphQLClient(process.env.SUBGRAPH_V3_URL!);
```

## Top pools by TVL

```graphql
query TopV3Pools {
  pools(first: 10, orderBy: totalValueLockedUSD, orderDirection: desc) {
    id
    tickSpacing
    fee
    totalValueLockedUSD
    volumeUSD
    token0 { id symbol decimals }
    token1 { id symbol decimals }
  }
}
```

For v2, query `pairs` and use `reserveUSD`, `stable`, and `fee`.

## Pools for a token

Goldsky rejects mixing column filters with `or` at the same `where` level. Put the extra filter inside every `or` clause:

```graphql
query V3PoolsForToken($token: Bytes!) {
  pools(
    first: 50
    orderBy: totalValueLockedUSD
    orderDirection: desc
    where: {
      or: [
        { token0: $token, totalValueLockedUSD_gt: "0" }
        { token1: $token, totalValueLockedUSD_gt: "0" }
      ]
    }
  ) {
    id
    tickSpacing
    fee
    totalValueLockedUSD
    totalValueLockedToken0
    totalValueLockedToken1
    token0 { id symbol decimals }
    token1 { id symbol decimals }
  }
}
```

## Token search

```graphql
query TokenSearch {
  tokens(first: 20, where: { symbol_contains_nocase: "TOPAZ" }) {
    id
    symbol
    name
    decimals
    derivedETH
    totalValueLockedUSD
  }
}
```

v2 token entities use `totalLiquidity`; v3 token entities use `totalValueLockedUSD`.

## Stats API alternative

For pre-aggregated pool lists, gauge APRs, protocol totals, and foundation data, the Stats API at `https://www.topazdex.com/api/stats` is often simpler than composing subgraph queries. It returns pre-computed numbers in a single REST call. See `references/analytics-stats-api.md` for the full endpoint catalog and when to prefer each source.

## Limitations

- Subgraphs may lag by a few blocks.
- Gauge, vote, bribe, lock, and claimable state is not fully indexed here; use on-chain reads.
- Position ownership is not reliably represented by pool subgraphs. Use `NonfungiblePositionManager` for v3 NFT ownership and ERC20 balances for v2 LP ownership.
