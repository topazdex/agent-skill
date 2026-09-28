# Subgraph Recipes (BNB Chain)

Topaz has three Goldsky subgraphs for BNB Chain: **v2** and **v3** for pool data, and **ve** for locks, votes, bribes, fee notifications, epochs, gauge stakes and relays. Use them for ad-hoc GraphQL, per-transaction events and indexed history. For pool lists, prices, APRs, gauges, votes, incentives and account portfolios on **any** chain, start with the public API instead (see [Public API alternative](#public-api-alternative)) — spoke chains are not indexed by these graphs.

## Endpoints

```text
v2: https://api.goldsky.com/api/public/project_cmgzljqwl006c5np2gnao4li4/subgraphs/topaz-v2/prod/gn
v3: https://api.goldsky.com/api/public/project_cmgzljqwl006c5np2gnao4li4/subgraphs/topaz-v3/prod/gn
ve: https://api.goldsky.com/api/public/project_cmgzljqwl006c5np2gnao4li4/subgraphs/topaz-ve/prod/gn
```

## Client setup

```ts
import { GraphQLClient, gql } from "graphql-request";

const v2 = new GraphQLClient(process.env.SUBGRAPH_V2_URL!);
const v3 = new GraphQLClient(process.env.SUBGRAPH_V3_URL!);
const ve = new GraphQLClient(process.env.SUBGRAPH_VE_URL!);
```

`scripts/src/lib/subgraph.ts` exports ready-made `v2Client`, `v3Client` and `veClient` with these defaults baked in.

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

Goldsky rejects mixing column filters with `or` at the same `where` level (verified against `topaz-v3/prod` on 2026-09-28 — the endpoint answers `Cannot mix column filters with 'or' operator at the same level`). Put the extra filter inside every `or` clause:

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

## A wallet's CL positions (v3)

`Position.owner` is the depositor even while the NFT is staked in a `CLGauge`, so one query returns wallet-held and staked positions; `staked` and `gauge` say where each NFT sits.

```graphql
query WalletCLPositions($user: String!) {
  positions(first: 100, where: { owner: $user, liquidity_gt: "0" }) {
    id
    liquidity
    tickLower
    tickUpper
    staked
    gauge { id }
    pool { id tickSpacing feeTier tick token0 { symbol decimals } token1 { symbol decimals } }
  }
}
```

`$user` is the lowercase address. In-range means `pool.tick >= tickLower && pool.tick < tickUpper`.

## A veNFT's votes and a gauge's incentives (ve)

```graphql
query VeNftAndGauge($tokenId: ID!, $gauge: String!, $epoch: String!) {
  veNFT(id: $tokenId) {
    tokenId
    owner { id }
    amount
    lockEnd
    permanent
    escrowType
    usedWeight
    votes(orderBy: weight, orderDirection: desc) { weight pool { id } gauge { id } epoch { id } }
  }
  rewardNotifications(where: { gauge: $gauge, epoch: $epoch }, orderBy: timestamp, orderDirection: desc) {
    kind
    token { symbol decimals }
    amount
    amountUSD
    usdResolved
    from { id }
    transactionHash
  }
}
```

`veNFT.id` is the tokenId as a string; `$epoch` is the epoch start (for example `"1790208000"`). Entity references (`owner`, `epoch`, `from`, `gauge`, `pool`) need a sub-selection such as `{ id }`. `usdResolved: false` means the token was unpriced at index time — do not read `amountUSD` as zero. The full ve entity catalog is in `references/analytics-subgraph.md`.

## Public API alternative

For pre-aggregated pool lists, APRs, gauges, votes, bribe markets, epochs and account portfolios — on all five chains — the public API at `https://api.topazdex.com/v1` is simpler than composing subgraph queries and carries explicit coverage metadata. `yarn tsx src/cli/stats.ts v1 /pools --chainIds 56 --sort emissionsApr` or `fetchV1` from `scripts/src/lib/topazApi.ts`. See `references/analytics-multichain.md` for the route catalog and when to prefer each source.

## Limitations

- Subgraphs may lag by a few blocks; `{ _meta { block { number } } }` gives the indexed head.
- BNB only. Spoke data comes from `/v1`; the spoke graphs use a different schema and release-pinned URLs.
- Claimable amounts are not indexed anywhere; read `earned(...)` on the gauge or reward contract.
- Custody vs ownership: v3 `Position.owner` stays the depositor while staked. Check `staked` / `gauge`, and confirm `NonfungiblePositionManager.ownerOf(tokenId)` (the gauge, while staked) before building a transfer or burn.
- Ordering by an entity-reference field (for example `orderBy: epoch` on `RelayEpoch`) is rejected; order by `id` or a scalar.
