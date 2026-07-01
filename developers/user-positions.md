# User Positions

Use this recipe when building portfolio views for Topaz LPs and veTOPAZ users.

## Source-of-truth matrix

| Position type | Discovery source now | Live/action overlay |
|---|---|---|
| v2 LP positions | Deployed v2 subgraph `LiquidityPosition` | Gauge `earned`, pair reserves/totalSupply, direct balances before signing |
| v3 wallet-held CL NFTs | On-chain `NonfungiblePositionManager` | Pool `slot0`, `positions(tokenId)`, token owed fields |
| v3 staked CL NFTs | On-chain `CLGauge.stakedValues(user)` | `CLGauge.earned`, NPM `positions(tokenId)`, pool `slot0` |
| veTOPAZ locks | On-chain `VotingEscrow` / `Voter` reads | Stats API for protocol context; direct reward contracts for exact claimables |

The latest v3 subgraph work includes CL position ownership/staked-state indexing, but that version is **not deployed to the current `prod` endpoint yet**. Until it is deployed, use on-chain reads for v3 user-position discovery. V2 user LP discovery can use the deployed v2 subgraph today.

## v2 LP positions

Use the v2 subgraph as the primary discovery source. Query `liquidityPositions(where: { user, totalBalance_gt: "0" })` to get the pools a user is in and the loose-vs-staked LP split.

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

Use the subgraph result for portfolio/dashboard discovery. For exact current/action-critical state, overlay:

1. `Gauge.earned(user)` for claimable rewards.
2. `pair.getReserves()` and `pair.totalSupply()` when previewing or building liquidity actions.
3. Direct `pair.balanceOf(user)` / `gauge.balanceOf(user)` before signing if the transaction depends on the exact current balance.

Relevant helpers:

- `scripts/src/read/pools.ts`
- `scripts/src/read/gauges.ts`
- `references/analytics-subgraph.md`
- `references/liquidity-v2.md`
- `references/gauges.md`

## v3 LP positions

For now, use on-chain reads for user CL position discovery. The V3 position-indexing subgraph work exists but is not deployed to the current `prod` endpoint yet.

For wallet-owned positions:

1. `NonfungiblePositionManager.balanceOf(user)`
2. `tokenOfOwnerByIndex(user, i)`
3. `positions(tokenId)`
4. `CLFactory.getPool(token0, token1, tickSpacing)`
5. `CLPool.slot0()` for current tick / in-range status

For staked positions:

1. Enumerate candidate CL gauges from the Stats API or known gauge set.
2. Call `CLGauge.stakedValues(user)` per gauge.
3. For each tokenId, call `NonfungiblePositionManager.positions(tokenId)`.
4. Call `CLGauge.earned(user, tokenId)` for current emissions.
5. Call the pool `slot0()` for current tick / in-range status.

Use the current v3 subgraph for pool analytics context — TVL, volume, fees, tick spacing, token metadata — after resolving the pool id on-chain. Do not rely on the deployed v3 subgraph for complete user CL ownership until the newer position-indexing deployment is promoted to `prod`.

Relevant helpers:

- `scripts/src/read/positions.ts`
- `scripts/src/read/gauges.ts`
- `references/analytics-subgraph.md`
- `references/liquidity-v3.md`
- `references/gauges.md`

## veTOPAZ locks

veTOPAZ locks are NFTs in `VotingEscrow`.

Useful reads:

- lock owner
- locked amount
- unlock timestamp
- voting power
- last voted epoch
- current votes
- claimable rebase
- claimable fees/bribes for voted gauges
- managed/relay status via `escrowType`, `idToManaged`, and relay metadata

Relevant helpers:

- `scripts/src/read/locks.ts`
- `scripts/src/read/votes.ts`
- `scripts/src/read/claimable.ts`
- `references/ve-locks.md`
- `references/voting.md`
- `references/rewards-claiming.md`
- `references/relays.md`

## Dashboard caveats

- V2 user-position discovery is subgraph-first; overlay on-chain reads for exact claimables and transaction-critical balances.
- Current deployed V3 `prod` is pool-analytics-ready but not complete for user-position ownership; use on-chain V3 discovery for now.
- Staked assets may not appear in the user's wallet balance.
- v3 positions only earn CLGauge emissions while in range.
- Claims can involve multiple reward contracts; batch carefully and display every token involved.
