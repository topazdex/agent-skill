# User Positions

Use this recipe when building portfolio views for Topaz LPs and veTOPAZ / xTOPAZ users.

## Source-of-truth matrix

| Position type | Discovery source now | Live/action overlay |
|---|---|---|
| Everything, any chain | `GET /v1/accounts/{address}/portfolio?chainIds=all&requireComplete=true` — liquidity positions (wallet and staked), voting positions, pending rewards and pool analytics with USD values and per-field `fieldSources` | The reads below, immediately before signing |
| v2 LP positions (BNB) | v2 subgraph `LiquidityPosition` (`unstakedBalance` / `stakedBalance`) | `Gauge.earned`, pair reserves / `totalSupply`, direct balances |
| v3 CL positions (BNB), wallet-held or staked | v3 subgraph `Position` (`owner`, range, `liquidity`, `staked`, `gauge`) | `CLGauge.earned(owner, tokenId)`, NPM `positions(tokenId)`, pool `slot0` |
| Auto Manage (ALM) vault shares (BNB, Robinhood, Arc) | Included in `/portfolio` as `kind: managed-cl-position`; filter with `positionKinds=managed-cl-position&custody=vault` on `…/liquidity-positions`; BNB ve subgraph `almAccounts` | Vault `live` block via `/v1/auto-manage/vaults/{chainId}/{vault}`; vault `balanceOf` and claimable reward on-chain before signing |
| veTOPAZ locks (BNB) | `GET /v1/accounts/{address}/voting-positions?chainIds=56`; ve subgraph `veNFTs`, `votes`, `rebaseClaims`, `votingRewardClaims` | `VotingEscrow` / `Voter` reads, reward contracts `earned` |
| Spoke voting positions and xTOPAZ balances | `GET /v1/accounts/{address}/voting-positions`, `GET /v1/accounts/{address}/xtopaz?chainIds=all` | Spoke `XTopazVotingVault` reads (`references/spoke-voting.md`) |

The API response carries `fieldSources` (subgraph or rpc, block, `stale`) per field and `summary.unpricedPositionCount` / `unpricedRewardCount`; with `requireComplete=true` an unverifiable chain returns `503 account_incomplete` instead of a partial answer. After the user's own transaction, `POST /v1/accounts/{address}/invalidate` then one `fresh=true` read. Analytics never authorize a write: read balances, allowances, ownership and gates on-chain right before simulation.

## v2 LP positions

Query the v2 subgraph for the pools a user is in and the loose-vs-staked LP split.

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

Overlay on-chain for exact or action-critical state:

1. `Gauge.earned(user)` for claimable rewards.
2. `pair.getReserves()` and `pair.totalSupply()` when previewing or building liquidity actions.
3. `pair.balanceOf(user)` / `gauge.balanceOf(user)` before signing if the transaction depends on the exact current balance.

Relevant helpers:

- `scripts/src/read/pools.ts`
- `scripts/src/read/gauges.ts`
- `references/analytics-subgraph.md`
- `references/liquidity-v2.md`
- `references/gauges.md`

## v3 CL positions

Query the v3 subgraph — `Position.owner` stays the depositor while the NFT is staked, and `staked` / `gauge` tell you where it is:

```graphql
query UserV3Positions($user: String!) {
  positions(first: 100, where: { owner: $user, liquidity_gt: "0" }) {
    id
    liquidity
    tickLower
    tickUpper
    staked
    gauge { id }
    depositedToken0
    depositedToken1
    collectedToken0
    collectedToken1
    pool {
      id
      tickSpacing
      feeTier
      tick
      sqrtPrice
      token0 { id symbol decimals }
      token1 { id symbol decimals }
    }
  }
}
```

Overlay on-chain:

1. `CLPool.slot0()` for the current tick and in-range status (`tickLower <= tick < tickUpper`).
2. `CLGauge.earned(owner, tokenId)` for staked positions.
3. `NonfungiblePositionManager.positions(tokenId)` for `tokensOwed0/1` and exact liquidity before building a transaction.
4. `NonfungiblePositionManager.ownerOf(tokenId)` before any transfer or burn — it returns the gauge while staked.

If the indexer is behind (`_meta.block` or `/v1/health/chains` says so), enumerate directly: `NonfungiblePositionManager.balanceOf` / `tokenOfOwnerByIndex` for wallet-held NFTs and `CLGauge.stakedValues(user)` per candidate gauge for staked ones (`scripts/src/read/positions.ts`).

Relevant helpers:

- `scripts/src/read/positions.ts`
- `scripts/src/read/gauges.ts`
- `references/analytics-subgraph.md`
- `references/liquidity-v3.md`
- `references/gauges.md`

## Auto Manage positions

Managed CL positions are ERC-20 vault shares, not NFTs: `NonfungiblePositionManager` and `CLGauge.stakedValues(user)` will not surface them. The account API returns them by default as `kind: "managed-cl-position"` with `custody: "vault"`, `shares`, live `amount0` / `amount1` / `valueUsd`, `rewardToken` / `earned` / `earnedUsd` (the separate claimable emissions), `range`, `inRange` and raw `costBasis` totals. Their USD fields are JSON numbers or null, while the account `summary` (which already includes them) uses decimal strings. Requesting only the `rewards` section does not load them. Field semantics, vault discovery and the write-side gap are in `references/auto-manage.md`.

## veTOPAZ locks

`GET /v1/accounts/{address}/voting-positions?chainIds=56` returns each veNFT with amount, unlock time, permanence, voting power, active-vote status and custody, with `fieldSources` per field. The ve subgraph adds history: `veNFTs(where: { owner: $user })`, `lockEvents`, `rebaseClaims`, `votingRewardClaims`, `managedDeposits` and the current `votes` per veNFT.

On-chain reads that gate actions:

- lock owner (`ownerOf`) and `isApprovedOrOwner`
- locked amount and unlock timestamp (`locked`)
- voting power (`balanceOfNFT`)
- last voted epoch (`Voter.lastVoted`)
- current votes (`Voter.votes`, `poolVote`)
- claimable rebase (`RewardsDistributor.claimable`)
- claimable fees/bribes for voted gauges (reward contracts `earned`)
- managed/relay status via `escrowType`, `idToManaged`, `managedToFree`

Relevant helpers:

- `scripts/src/read/locks.ts`
- `scripts/src/read/votes.ts`
- `scripts/src/read/claimable.ts`
- `references/ve-locks.md`
- `references/voting.md`
- `references/rewards-claiming.md`
- `references/relays.md`

## Dashboard caveats

- Start from `/v1/accounts/{address}/portfolio`; use the BNB subgraphs for history and on-chain reads for exact claimables and transaction-critical balances.
- Staked assets do not appear in the wallet's token balance; the API's `custody` field and the subgraphs' `staked` flags say where they are.
- v3 positions only earn CLGauge emissions while in range.
- Claims can involve multiple reward contracts; batch carefully and display every token involved.
- Null USD values are unpriced, not zero; surface `unpricedPositionCount` / `unpricedRewardCount` instead of hiding them.
- Keep `kind` switches exhaustive: `v2-liquidity`, `cl-liquidity` and `managed-cl-position` all appear in `liquidityPositions`; filters limited to `custody=wallet|gauge` drop Auto Manage shares.
