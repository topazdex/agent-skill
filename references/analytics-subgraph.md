# Analytics — Subgraphs (BNB Chain)

Topaz indexes three Goldsky subgraphs for BNB Chain: **v2** (Solidly pools), **v3** (Slipstream pools and CL positions) and **ve** (the ve(3,3) layer — veNFT locks, votes, bribe and fee notifications, epochs, gauge stakes, relays and xTOPAZ hub accounting). The entity catalogs below are the canonical reference for query authoring.

> **Use the public API first.** `https://api.topazdex.com/v1` serves pools, tokens, prices, gauges, votes, epochs, bribe markets, account portfolios and history for all five chains with USD values and explicit coverage metadata — see [analytics-multichain.md](analytics-multichain.md). Reach for these BNB graphs for ad-hoc GraphQL filtering, per-transaction events (`Mint`/`Burn`/`Swap`, `VoteCast`, `LockEvent`, `RewardNotification`), entity history beyond the API's windows, or a field the API does not expose. Spoke chains are **not** indexed here; their graphs are release-pinned and reached through `/v1`.

## Endpoints

```
V2:  https://api.goldsky.com/api/public/project_cmgzljqwl006c5np2gnao4li4/subgraphs/topaz-v2/prod/gn
V3:  https://api.goldsky.com/api/public/project_cmgzljqwl006c5np2gnao4li4/subgraphs/topaz-v3/prod/gn
VE:  https://api.goldsky.com/api/public/project_cmgzljqwl006c5np2gnao4li4/subgraphs/topaz-ve/prod/gn
```

Override via `SUBGRAPH_V2_URL` / `SUBGRAPH_V3_URL` / `SUBGRAPH_VE_URL` env vars in `scripts/.env`. All three POST JSON to `/`. No auth.

These are **tag-based** endpoints (`…/prod/gn`): the `prod` tag always resolves to the latest promoted deployment, so the URL is stable across redeploys — never pin a `v0.0.x` version from memory (older v3 versions carry a since-fixed bug that inflated `volumeUSD` / `feesUSD`). Confirm what you are talking to with `{ _meta { block { number timestamp } deployment hasIndexingErrors } }`.

## V2 schema (high level)

| Entity | Key fields |
|---|---|
| `UniswapFactory` | `id`, `pairCount`, `totalVolumeUSD`, `totalLiquidityUSD`, `totalFeesUSD`, `txCount` |
| `Token` | `id`, `symbol`, `name`, `decimals`, `tradeVolumeUSD`, `totalLiquidity`, `derivedETH` |
| `Pair` | `id`, `token0`, `token1`, `reserve0`, `reserve1`, `totalSupply`, `stable`, `fee`, `customFee`, `reserveUSD`, `token0Price`, `token1Price`, `volumeUSD`, `feesUSD`, `gauge`, `txCount`, `liquidityProviderCount`, `createdAtTimestamp` |
| `LiquidityPosition` | `id`, `user`, `pair`, `unstakedBalance`, `stakedBalance`, `totalBalance` — per-user LP balance, incl. the portion staked in the gauge |
| `Gauge` | `id`, `pair`, `isAlive`, `totalStaked`, `rewardToken` — v2 staking gauge for the pair |
| `GaugeLookup` | `id` — pair↔gauge lookup helper |
| `User` | `id` — account; resolves to its `LiquidityPosition`s |
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
| `Pool` | `id`, `token0`, `token1`, `tickSpacing`, `fee`, `feeTier`, `customFee`, `dynamicFee`, `dynamicFeeCap`, `dynamicScalingFactor`, `liquidity`, `sqrtPrice`, `tick`, `token0Price`, `token1Price`, `volumeUSD`, `feesUSD`, `totalValueLockedUSD`, `collectedFeesUSD`, `gauge`, `txCount`, `liquidityProviderCount`, `createdAtTimestamp`, `positions` |
| `Tick` | `id`, `pool`, `tickIdx`, `liquidityGross`, `liquidityNet`, `price0`, `price1` |
| `Position` | `id` (NFT tokenId), `owner` (→ `User`; stays the depositor while staked), `pool`, `token0`, `token1`, `tickLower`, `tickUpper`, `liquidity`, `staked`, `gauge`, `depositedToken0/1`, `withdrawnToken0/1`, `collectedToken0/1`, `createdAtBlockNumber` — CL position ownership and staked state |
| `Gauge` | `id`, `pool`, `isAlive`, `stakedLiquidity`, `stakedPositionCount`, `rewardToken` — v3 CLGauge |
| `GaugeLookup` | `id` — pool↔gauge lookup helper |
| `User` | `id` — account; `positions` lists its CL `Position`s |
| `Mint`, `Burn`, `Swap`, `Collect` | Per-tx events with `pool`, `tickLower`/`tickUpper` (where applicable), amounts |
| `Transaction` | Container for the above |
| `UniswapDayData` | Global daily (`volumeUSD`, `feesUSD`, `tvlUSD`, `txCount`) |
| `PoolDayData`, `PoolHourData` | OHLC + volume/fees/tvl |
| `TokenDayData`, `TokenHourData` | OHLC + volume + price |

## VE schema (high level)

| Entity | Key fields |
|---|---|
| `ProtocolState` (id=`1`) | `totalLocked`, `permanentLocked`, `veNFTCount`, `activeVeNFTCount`, `gaugeCount`, `aliveGaugeCount`, `relayCount`, `totalEmissions`, `totalRebase`, `tailEmissionRate`, `currentEpoch` |
| `Epoch` (id = epoch start) | `startTimestamp`, `endTimestamp`, `emissions`, `emissionsUSD`, `rebase`, `rebaseUSD`, `totalVotes`, `veTotalLocked`, `activeVeNFTCount`, `bribesUSD`, `feesUSD`, `voterNotified`, `gaugeDistributed`, `tail`, `rolloverTimestamp`, `gaugeEpochs` — query roots `epoch` / `epoches` |
| `VeNFT` (id = tokenId) | `tokenId`, `owner` (→ `User`), `amount`, `lockEnd`, `permanent`, `escrowType` (`NORMAL` / `LOCKED` / `MANAGED`), `alive`, `votingWhitelisted`, `lastVoted`, `usedWeight`, `managedTo`, `managedWeight`, `relay`, `lockedManagedReward`, `freeManagedReward`, `createdAt`; lists `votes`, `events`, `epochVotes`, `managedDeposits`, `rebaseClaims`, `rewardPositions` |
| `LockEvent` | `type` (`CREATE`, `INCREASE`, `EXTEND`, `DEPOSIT_FOR`, `WITHDRAW`, `MERGE_FROM/TO`, `SPLIT_FROM/TO`, `PERMANENT`, `UNPERMANENT`, `TRANSFER`, `MANAGED_DEPOSIT/WITHDRAW`), `tokenId`, `owner`, `amount`, `amountUSD`, `usdResolved`, `lockTime`, `counterparty`, `timestamp`, `transactionHash` |
| `Vote` | current allocation per (veNFT, pool): `weight`, `epoch`, `pool`, `gauge`, `veNFT`, `timestamp` |
| `VoteCast` | vote and reset events: `type` (`VOTE` / `ABSTAIN`), `tokenId`, `pool`, `gauge`, `weight`, `poolTotalWeight`, `epoch`, `transactionHash` |
| `VeNFTEpochVote` | per-epoch weight history per (veNFT, pool) |
| `Gauge` | `pool`, `kind`, `feesVotingReward`, `bribeVotingReward`, `rewardToken`, `isAlive`, `createdAt`, `killedAt`, `currentWeight`, `rewardRate`, `periodFinish`, `totalStaked`, `totalEmissions`, `totalEmissionsUSD`, `totalFees0/1`, `systemRole`, `epochs` |
| `GaugeEpoch` | per gauge per epoch: `votes`, `emissions`, `emissionsUSD`, `distributed`, `totalVotesAtDistribution`, `fees0/1`, `feesUSD`, `bribesUSD`, `rewardTokenEpochs` — query root `gaugeEpoches` |
| `GaugeStake`, `GaugeStakeEvent`, `StakedCLPosition`, `EmissionClaim` | LP staking balances and events, staked CL NFTs per gauge, TOPAZ emission claims (`amountUSD`) |
| `VotingReward` | `kind` (`FEE` / `BRIBE` / `LOCKED_MANAGED` / `FREE_MANAGED`), `gauge`, `mVeNFT`, `rewardTokens`, `totalSupply`, `positions` |
| `RewardNotification` | bribe and fee deposits: `kind`, `token`, `amount`, `amountUSD`, `tokenPriceUSD`, `usdResolved`, `from` (→ `User`), `gauge`, `epoch`, `timestamp`, `transactionHash` |
| `RewardTokenEpoch` | per (reward contract, token, epoch): `kind`, `token`, `gauge`, `gaugeEpoch`, `relay`, `amount`, `amountUSD` — query root `rewardTokenEpoches` |
| `VotingRewardClaim`, `RebaseClaim`, `RewardBalanceEvent`, `RewardPosition` | voter claims with USD, rebase claims per epoch, checkpointed voter balances per reward contract |
| `Relay`, `RelayEpoch`, `RelayAction`, `RelayEpochTokenFlow`, `ManagedDeposit` | managed veTOPAZ relays (`kind`: `AUTO_COMPOUNDER` / `COMPOUND_CONVERTER`, `name`, `mVeNFT`, `rewardToken`, `payoutToken`, `totalCompounded`, `totalDistributed`, `epochs`), per-epoch `compounded(USD)` / `distributed(USD)` / `callerRewards` / `swapCount`, swaps and token flows, depositor weights — query root `relayEpoches` |
| `XTopazState`, `RateSample`, `VaultAction`, `VaultNftTransfer`, `ZapAction` | xTOPAZ vault backing (`totalAssets`, `totalShares`, `assetsPerShare`, `aggregateTokenId`, `entryPaused`, `unwrapPaused`, `settledEpoch`, `priceUSD`), rate-update samples, deposits/wraps/unwraps |
| `HubEpoch`, `ChainBudget`, `BudgetDispatch`, `SpokeSupply`, `BridgeTransfer`, `UnwrapCompose`, `CoordinatorState`, `HubBridgeState` | weekly settlement, per-spoke budgets and sends, adapter supply per EID, LayerZero packets seen from BNB, compose outcomes — query root `hubEpoches` |
| `SystemStrategy`, `SystemGaugeState`, `SystemGaugeAccount`, `SystemStrategyAction` | system pool / gauge accounting behind settlement (infrastructure, not a user market) |
| `AlmFactory`, `AlmVault`, `AlmAccount`, `AlmAction`, `AlmRebalance`, `AlmRewardCheckpoint`, `AlmVaultDayData`, `AlmVaultHourData` | Auto Manage (ALM) vaults on BNB: vault wiring and state (`pool`, `gauge`, `token0/1`, `rewardToken`, `listed`, `paused`, `totalSupplyRaw`, `tvlUSD`, `inRange`, `mainTokenId` / `altTokenId`, `holderCount`, `rebalanceCount`, `rewardFeeBps`), per-account shares and lifetime totals (`account`, `sharesRaw`, `deposited0Raw` / `deposited1Raw`, `withdrawn0Raw` / `withdrawn1Raw`, `rewardsClaimedRaw`), actions (`kind`, `sharesRaw`, `amount0Raw`, `amount1Raw`, `rewardRaw`, `transactionHash`), keeper rebalances and reward checkpoints — see [auto-manage.md](auto-manage.md) |
| `Token`, `Pool`, `Bundle` | pricing context for USD fields (`Token.voterWhitelisted`, `Token.priceSource`; `Pool.isPricingPool`, `Pool.systemRole`) |
| `User` | `veNFTs`, `gaugeStakes`, `stakedCLPositions`, `lockEvents`, `votingRewardClaims`, `emissionClaims`, `rewardNotifications`, `relayActions` |

Entity references (`owner`, `epoch`, `from`, `gauge`, `pool`, `veNFT`, `managedTo`, `counterparty`, `relay`) need a sub-selection such as `{ id }`. Enum filters are unquoted (`where: { kind: BRIBE }`). USD fields carry `usdResolved`; treat `usdResolved: false` as unpriced, not zero.

**Where each fact lives.** Pool and pair market data (TVL, volume, fees, OHLC) is in v2 / v3. CL position ownership and staked state is v3 `Position`; v2 LP balances are v2 `LiquidityPosition`. Everything about locks, votes, bribes, fees to voters, rebases, epochs, relays and xTOPAZ is in **ve**. Claimable amounts and emission APR are stored nowhere — read `earned(...)` on-chain, and take APR from `/v1` or compute it per [apr-calculations.md](apr-calculations.md).

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

The v2 subgraph indexes per-user LP positions through `LiquidityPosition`, splitting the balance into loose wallet LP and LP staked in the gauge.

```graphql
query UserV2LPPositions($user: String!) {
  liquidityPositions(first: 100, where: { user: $user, totalBalance_gt: "0" }) {
    id
    unstakedBalance
    stakedBalance
    totalBalance
    pair {
      id
      stable
      reserve0
      reserve1
      reserveUSD
      totalSupply
      token0 { id symbol decimals }
      token1 { id symbol decimals }
      gauge { id rewardToken isAlive }
    }
  }
}
```

Overlay on-chain reads only when you need block-exact or action-critical values: `Gauge.earned(user)` for current claimables, `pair.getReserves()` / `totalSupply()` for transaction previews, and direct `balanceOf` checks before signing.

### User's v3 positions

`Position.owner` stays the depositor while the NFT is staked in a `CLGauge`, so one query covers wallet-held and staked positions; `staked` and `gauge` say where each NFT sits.

```graphql
query UserV3Positions($user: String!) {
  positions(first: 100, where: { owner: $user, liquidity_gt: "0" }) {
    id
    liquidity
    tickLower
    tickUpper
    staked
    gauge { id }
    pool {
      id tickSpacing feeTier tick sqrtPrice totalValueLockedUSD
      token0 { id symbol decimals }
      token1 { id symbol decimals }
    }
  }
}
```

`$user` is the lowercase address. In range means `pool.tick >= tickLower && pool.tick < tickUpper`. Overlay `CLGauge.earned(owner, tokenId)`, `NonfungiblePositionManager.positions(tokenId)` and `CLPool.slot0()` for exact claimables and pre-transaction state; `NonfungiblePositionManager.ownerOf(tokenId)` returns the gauge while staked. `/v1/accounts/{address}/portfolio` returns the same positions with USD valuation across chains.

### A veNFT lock and its current votes (ve)

```graphql
query VeNft($tokenId: ID!) {
  veNFT(id: $tokenId) {
    tokenId
    owner { id }
    amount
    lockEnd
    permanent
    escrowType
    alive
    lastVoted
    usedWeight
    managedTo { tokenId }
    relay { id name kind }
    votes(orderBy: weight, orderDirection: desc) { weight epoch { id } pool { id } gauge { id } }
  }
}
```

`veNFT.id` equals the tokenId string. `votes` is the current allocation; the event log is `voteCasts(where: { tokenId: "1234" }, orderBy: timestamp, orderDirection: desc) { type weight pool { id } epoch { id } transactionHash }` with `type` `VOTE` or `ABSTAIN`. All locks of a wallet: `veNFTs(where: { owner: $owner, alive: true })`.

### Bribes and fees posted on a gauge for an epoch (ve)

```graphql
query GaugeFunding($gauge: String!, $epoch: String!) {
  rewardNotifications(where: { gauge: $gauge, epoch: $epoch }, orderBy: timestamp, orderDirection: desc) {
    kind
    token { id symbol decimals }
    amount
    amountUSD
    usdResolved
    from { id }
    timestamp
    transactionHash
  }
  rewardTokenEpoches(where: { gauge: $gauge, epoch: $epoch }) {
    kind
    token { symbol }
    amount
    amountUSD
  }
}
```

`$epoch` is the epoch start as a string (for example `"1790208000"`). `kind` is `BRIBE` for external incentives and `FEE` for trading fees routed to voters; `LOCKED_MANAGED` / `FREE_MANAGED` are relay reward streams. `/v1/gauges/56/{gauge}/bribes` returns the same funding pre-aggregated with valuation coverage.

### Epoch summary and per-gauge results (ve)

```graphql
query EpochResults($epoch: ID!) {
  epoch(id: $epoch) {
    startTimestamp endTimestamp emissions emissionsUSD rebase totalVotes veTotalLocked activeVeNFTCount bribesUSD feesUSD
  }
  gaugeEpoches(first: 20, where: { epoch: $epoch }, orderBy: votes, orderDirection: desc) {
    gauge { id pool { id } }
    votes
    emissions
    emissionsUSD
    feesUSD
    bribesUSD
  }
}
```

### Relay history (ve)

```graphql
query Relays {
  relays {
    id name kind mVeNFT { tokenId } totalCompounded totalDistributed
    epochs(first: 8, orderBy: id, orderDirection: desc) {
      epoch { id } compounded compoundedUSD distributed distributedUSD swapCount
    }
  }
}
```

### Protocol-wide ve totals

```graphql
query VeTotals {
  protocolState(id: "1") {
    totalLocked permanentLocked veNFTCount activeVeNFTCount gaugeCount aliveGaugeCount relayCount currentEpoch
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
const ve = new GraphQLClient(process.env.SUBGRAPH_VE_URL!);

const TOP_V3 = gql`query { pools(first: 10, orderBy: totalValueLockedUSD, orderDirection: desc) { id totalValueLockedUSD volumeUSD } }`;
const { pools } = await v3.request<{ pools: any[] }>(TOP_V3);

const VE_TOTALS = gql`query { protocolState(id: "1") { totalLocked activeVeNFTCount currentEpoch } }`;
const { protocolState } = await ve.request<{ protocolState: any }>(VE_TOTALS);
```

`scripts/src/lib/subgraph.ts` exports `v2Client`, `v3Client` and `veClient` instances. `scripts/src/read/subgraphQueries.ts` wraps the most common v2/v3 queries.

## Limitations & caveats

- **Indexing lag**: Goldsky typically lags 1–2 blocks behind chain head; `_meta.block` says where each graph is. For real-time freshness (current pool price, current voting weight, pending claims), use on-chain reads via `analytics-onchain.md`.
- **BNB only.** Spoke chains are served through `/v1`; their graphs use a different schema and release-pinned URLs (`analytics-multichain.md`).
- **Custody vs ownership.** v3 `Position.owner` is the depositor while the NFT is staked; `staked` / `gauge` say where it is, and `NonfungiblePositionManager.ownerOf` returns the gauge. v2 `LiquidityPosition` splits `unstakedBalance` / `stakedBalance`.
- **Claimables are not indexed.** Voter earnings, gauge emissions and rebases owed come from `earned(...)` / `claimable(...)` on-chain; the graphs record claims after the fact.
- **Plurals.** Query roots for `Epoch`-suffixed entities are `epoches`, `gaugeEpoches`, `relayEpoches`, `hubEpoches`, `rewardTokenEpoches`.
- **Ordering** by an entity-reference field (for example `orderBy: epoch` on `RelayEpoch`) is rejected; order by `id` or a scalar.
- **`fee` vs `feeTier`** in v3: `feeTier` is the tickSpacing default; `fee` is the effective fee at index time (could be overridden by a fee module). Use `fee` for revenue calcs.
- **`customFee` and `dynamicFee` booleans** indicate non-default fee state — surface these in any "pool detail" UI so users understand why the fee changed.
- **`derivedETH` is the token's price in WBNB**; multiply by `bundle.ethPrice(USD)` to get USD. For canonical prices with provenance use `/v1/prices`.
