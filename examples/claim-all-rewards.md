# Example — Claim Everything

**Goal:** Claim all four reward streams in one session: gauge emissions for your staked LP / positions, voting fees, voting bribes, and the veNFT rebase.

You're a user who:
- holds veNFT `tokenId = 1234`,
- voted last epoch for 3 pools,
- has LP staked in a v2 gauge `0xGAUGE2` and a v3 position staked in `0xGAUGE3`.

## 1. Inspect (no signer needed)

```bash
yarn tsx src/cli/stats.ts claimable --id 1234 --address 0xYOUR_WALLET
```

Output (illustrative):

```
veNFT 1234 owner: 0xYOUR_WALLET
─── Gauge emissions (TOPAZ) ───
  v2 gauge 0xGAUGE2  →  127.43 TOPAZ
  v3 gauge 0xGAUGE3  →   89.10 TOPAZ
  TOTAL              →  216.53 TOPAZ
─── Voting fees (epoch ending Thu) ───
  pool 0xPOOL_A → 1.23 WBNB, 410.00 USDT
  pool 0xPOOL_B → 0.05 BTCB
  TOTAL value   ≈ $1,612 USD
─── Voting bribes (epoch ending Thu) ───
  pool 0xPOOL_C → 5.00 USDC, 0.10 TOPAZ
  TOTAL value   ≈ $5.20 USD
─── Rebase (anti-dilution) ───
  veNFT 1234    → 12.30 TOPAZ (auto-added to lock on claim)
```

Source: `scripts/src/read/claimable.ts:claimableSummary(tokenId, account)`. Uses multicall.

## 2. Claim everything

```bash
yarn tsx src/cli/claim.ts all --id 1234
```

Behind the scenes, this is (roughly):

```ts
// 1. Gauge emissions — batch v2 + per-gauge v3
const stakedV2 = await myStakedV2Gauges(account);    // [0xGAUGE2, ...]
if (stakedV2.length > 0) await voter.claimRewards(stakedV2);

const stakedV3 = await myStakedV3Gauges(account);    // [{ gauge, tokenIds }, ...]
for (const g of stakedV3) await clGaugeContract(g.gauge).getReward(account);

// 2. Voting fees — only pools you voted for last epoch
const votedPools = await myVotedPools(tokenId);
const gauges = await Promise.all(votedPools.map(p => voter.gauges(p)));
const feeRewards   = await Promise.all(gauges.map(g => voter.gaugeToFees(g)));
const tokensPerFee = await Promise.all(votedPools.map(async p => {
  const [t0, t1] = await Promise.all([poolContract(p).token0(), poolContract(p).token1()]);
  return [t0, t1];
}));
await voter.claimFees(feeRewards, tokensPerFee, tokenId);

// 3. Bribes — discover active reward tokens per bribe contract
const bribeRewards = await Promise.all(gauges.map(g => voter.gaugeToBribe(g)));
const bribeTokens = await Promise.all(bribeRewards.map(async (b) => {
  const len = await rewardContract(b).rewardsListLength();
  const all = await Promise.all([...Array(Number(len))].map((_, i) => rewardContract(b).rewards(i)));
  const earned = await Promise.all(all.map(t => rewardContract(b).earned(t, tokenId)));
  return all.filter((_, i) => earned[i] > 0n);
}));
const activePairs = bribeRewards
  .map((b, i) => ({ b, tokens: bribeTokens[i] }))
  .filter(p => p.tokens.length > 0);
if (activePairs.length > 0) {
  await voter.claimBribes(activePairs.map(p => p.b), activePairs.map(p => p.tokens), tokenId);
}

// 4. Rebase — adds to lock
const claimableRebase = await rewardsDistributor.claimable(tokenId);
if (claimableRebase > 0n) await rewardsDistributor.claim(tokenId);
```

## 3. Verify

```bash
yarn tsx src/cli/stats.ts claimable --id 1234 --address 0xYOUR_WALLET
```

All four sections should now show ~0 (or very small amounts that accrued between the previous read and the claim transactions).

## Gas budget

A "claim everything" with 3 voted pools and 2 staked gauges is typically 4 transactions:

1. v2 `claimRewards` (one tx for all v2 gauges)
2. v3 `getReward` per gauge (one tx each — 1 tx here)
3. `claimFees` (one tx for all voted pools)
4. `claimBribes` (one tx for all voted pools)
5. `claim` rebase (one tx)

Total: ~5 transactions. On BSC at ~3 gwei, this is roughly $0.50–$2.00 in BNB depending on how many gauges/tokens are involved. `scripts/src/write/claim.ts:claimAll` constructs all of them with optimal batching.

## When to claim

- **Emissions** can be claimed any time; they accrue continuously through the 7-day epoch.
- **Fees & bribes** for epoch E become claimable in epoch E+1 (i.e. after the next Thursday 00:00 UTC). Claiming earlier returns 0.
- **Rebase** updates every epoch flip — calling `claim` more than once per week just returns 0 for the prior weeks.

A reasonable cadence: claim once a week, the morning after Thursday's epoch flip.

## Don't forget …

- If you also have **unstaked** v3 positions earning trading fees, call `NPM.collect({ ... })` separately. That's not included in `claim all` because staked positions are the common case and unstaked is per-tokenId.
- Permanent veNFT locks accumulate **maximum** rebase (because their voting power doesn't decay). Use `lockPermanent(tokenId)` if you want this.
