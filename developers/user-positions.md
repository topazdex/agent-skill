# User Positions

Use this recipe when building portfolio views for Topaz LPs and veTOPAZ users.

## v2 LP positions

v2 LP tokens are ERC20 pair contracts. The subgraph indexes pool-level liquidity but does not provide authoritative current user balances.

For each pair you care about:

1. Read `pair.balanceOf(user)`.
2. Read `pair.totalSupply()`.
3. Read reserves / metadata from the pair.
4. Compute the user's pro-rata token amounts.
5. Check gauge staking separately if the user may have staked LP tokens.

Relevant helpers:

- `scripts/src/read/pools.ts`
- `scripts/src/read/gauges.ts`
- `references/liquidity-v2.md`
- `references/gauges.md`

## v3 LP positions

v3 LP positions are ERC721 NFTs held by `NonfungiblePositionManager` or staked in `CLGauge`.

For wallet-owned positions:

1. `NonfungiblePositionManager.balanceOf(user)`
2. `tokenOfOwnerByIndex(user, i)`
3. `positions(tokenId)`
4. join `(token0, token1, tickSpacing)` to the v3 subgraph pool

For staked positions, enumerate or inspect CLGauge state depending on the pool/gauge you are showing.

Relevant helpers:

- `scripts/src/read/positions.ts`
- `scripts/src/read/gauges.ts`
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

Relevant helpers:

- `scripts/src/read/locks.ts`
- `scripts/src/read/votes.ts`
- `scripts/src/read/claimable.ts`
- `references/ve-locks.md`
- `references/voting.md`
- `references/rewards-claiming.md`

## Dashboard caveats

- Subgraph pool data is good for TVL/volume context, not authoritative user ownership.
- Staked assets may not appear in the user's wallet balance.
- v3 positions only earn CLGauge emissions while in range.
- Claims can involve multiple reward contracts; batch carefully and display every token involved.
