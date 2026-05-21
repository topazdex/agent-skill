# Gauges, APR, Voting, and Bribes

Topaz's builder opportunity is not only swaps. The ve(3,3) layer creates useful surfaces for dashboards, voting tools, bribe marketplaces, and LP analytics.

## Gauge discovery

A pool has a gauge after `Voter.createGauge(pool)` has been called. Use `Voter.gauges(pool)` or helper functions in:

```text
scripts/src/read/gauges.ts
```

Gauge type depends on pool type:

- v2 pool -> `Gauge`, LP ERC20 staking
- v3 pool -> `CLGauge`, position NFT staking

## Reward streams

There are four common reward categories:

1. **LP emissions**: TOPAZ paid to staked v2 LPs or staked v3 NFT positions.
2. **Voting fees**: trading fees paid to veTOPAZ voters for pools they voted for.
3. **Bribes**: external incentives deposited into `BribeVotingReward` contracts.
4. **Rebase**: weekly anti-dilution distribution to veTOPAZ holders.

Use `scripts/src/read/claimable.ts` for examples of aggregating these streams.

## APR displays

APR can be misleading unless you label the basis clearly:

- **Gauge APR**: emissions to LP stakers based on current vote weight and pool TVL.
- **Fee APR**: trading fees relative to pool TVL.
- **Voting APR**: fees/bribes per unit of veTOPAZ vote weight.
- **Rebase APR**: veTOPAZ anti-dilution stream.

Relevant implementation:

```text
scripts/src/read/apr.ts
references/apr-calculations.md
```

## Voting UX

Voting constraints are critical:

- Epoch starts Thursday 00:00 UTC.
- First hour after epoch flip is a distribute window.
- Normal voting opens Thursday 01:00 UTC.
- Final hour before next epoch is restricted.
- A veNFT can vote/reset only once per epoch.

Before letting a user cast/reset votes, read:

- current epoch start
- `Voter.lastVoted(tokenId)`
- current votes
- available pools/gauges

## Bribe UX

When depositing bribes:

- Resolve pool -> gauge -> bribe reward contract.
- Confirm the bribe token is accepted or whitelisted.
- Make approval spender explicit.
- Communicate that bribes apply to the current epoch's voters if deposited in time.

Relevant docs:

- `references/bribes-deposit.md`
- `references/voting.md`
- `references/epoch-timing.md`
