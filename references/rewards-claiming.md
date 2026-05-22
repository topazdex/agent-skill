# Claiming Rewards

There are **four** distinct reward streams an active Topaz user can collect:

| # | Reward | Earned by | Claim entry point |
|---|---|---|---|
| 1 | TOPAZ gauge emissions | Staking LP or position NFT in a gauge | `Gauge.getReward(account)` / `CLGauge.getReward(tokenId)` (or batched via `Voter.claimRewards(gauges)`) |
| 2 | Trading-fee voter share | Voting for the pool | `Voter.claimFees(feeContracts, tokens, tokenId)` |
| 3 | Bribe / incentive share | Voting for the pool | `Voter.claimBribes(bribeContracts, tokens, tokenId)` |
| 4 | TOPAZ rebase (anti-dilution) | Holding any veTOPAZ | `RewardsDistributor.claim(tokenId)` or `claimMany(tokenIds)` |

Each stream is independent. A vote-and-stake user typically claims all four.

## 1. Gauge emissions

```solidity
// v2
function Gauge.getReward(address _account) external;              // caller must be _account OR Voter; rewards sent to _account
function Voter.claimRewards(address[] memory _gauges) external;   // batch; calls Gauge.getReward(msg.sender) for each gauge

// v3 (CL)
function CLGauge.getReward(uint256 tokenId) external;       // caller must own the staked NFT (was the depositor)
function CLGauge.getReward(address account) external;       // **VOTER-ONLY** — `require(msg.sender == voter)`; not user-callable
```

For users claiming CL gauge emissions, **iterate your staked tokenIds and call `getReward(uint256)` for each**. The `getReward(address)` overload exists for Voter-driven batch distribution, not retail use.

To find every gauge `account` currently has stake in: track from your own logs, or enumerate `Voter.length()` pools and read `gauge.balanceOf(account)` / `clGauge.stakedValues(account)` for each. The library functions `v2StakedGaugesForAccount(account)` and `v3StakedGaugesForAccount(account)` in `scripts/src/read/gauges.ts` do this.

After `getReward`, the gauge's `earned(account)` returns 0; `userRewardPerTokenPaid` advances.

### Permissionlessness

For v2 `Gauge.getReward(_account)`, the caller must be either `_account` itself or the Voter contract — so it's **not** permissionless. To claim for someone else, route via `Voter.claimRewards([gauges])` (which calls `getReward(msg.sender)`), or call directly as the staker.

For `CLGauge.getReward(uint256 tokenId)`, only the original depositor (the staker recorded for that tokenId) can call. `CLGauge.getReward(address account)` is reserved for the Voter contract and reverts for end users.

## 2. Voting fees

```solidity
function Voter.claimFees(
    address[] memory _fees,         // FeesVotingReward contract addresses
    address[][] memory _tokens,     // tokens[i] = list of reward token addresses to claim from _fees[i]
    uint256 _tokenId                // your veNFT
) external;
```

For each gauge G you voted for, `voter.gaugeToFees(G)` is the corresponding `FeesVotingReward`. The fee tokens for a v2 pool are its two underlying tokens (so always two tokens per claim). For a v3 pool, also its two underlying tokens.

Pattern:

```ts
const myGauges = [...];   // gauges you voted for last epoch
const feeRewards = await Promise.all(myGauges.map(g => voter.gaugeToFees(g)));
const tokens = await Promise.all(myGauges.map(async g => {
  const pool = await voter.poolForGauge(g);
  const [t0, t1] = await Promise.all([
    poolContract(pool).token0(), poolContract(pool).token1()
  ]);
  return [t0, t1];
}));
await voter.claimFees(feeRewards, tokens, tokenId);
```

`Voter.claimFees` requires `isApprovedOrOwner(msg.sender, tokenId)`.

To pre-check claimable amounts: for each fee reward contract C and each token T, call `C.earned(T, tokenId)`. Don't include claims with `earned == 0` — wastes gas.

## 3. Bribes

Same exact shape as fees, but for the bribe contracts:

```solidity
function Voter.claimBribes(
    address[] memory _bribes,
    address[][] memory _tokens,
    uint256 _tokenId
) external;
```

Look up via `voter.gaugeToBribe(gauge)`. The reward tokens are **whatever bribers have posted**, which is dynamic and pool-specific.

To enumerate active bribe tokens for a bribe contract:

```ts
const length = await bribe.rewardsListLength();
const tokens = await Promise.all([...Array(Number(length))].map((_, i) => bribe.rewards(i)));
// Filter to only those with earned() > 0 for your tokenId
const earned = await Promise.all(tokens.map(t => bribe.earned(t, tokenId)));
const toClaim = tokens.filter((_, i) => earned[i] > 0n);
```

`scripts/src/read/claimable.ts:claimableSummary(tokenId, account)` returns claimable fees and bribes grouped by pool with token amounts. Use `scripts/src/write/claim.ts` only after the user explicitly asks to broadcast.

## 4. Rebase

The Minter sends a portion of weekly emissions to `RewardsDistributor`. Each veTOPAZ holder is owed a slice proportional to their `balanceOfNFTAt(start of epoch)`.

```solidity
function RewardsDistributor.claim(uint256 _tokenId) external returns (uint256);
function RewardsDistributor.claimMany(uint256[] calldata _tokenIds) external returns (bool);
function RewardsDistributor.claimable(uint256 _tokenId) external view returns (uint256);
```

The rebase is **added to the veNFT's locked amount** (same effect as `increaseAmount`), it does **not** transfer TOPAZ to your wallet. It also auto-extends decaying locks to the current epoch's end, which means small rebase claims on near-expired locks can subtly extend them — typically not a concern.

Always call `claim` after a new epoch starts so the latest week's rebase is included. The function is idempotent and cheap to call.

## Claim-everything recipe

```ts
// poolContract/rewardContract are thin ethers.Contract wrappers using Pool/Reward ABIs.

// 0. ensure you own/are approved for the veNFT
const lastVoted = Number(await voter.lastVoted(tokenId));
const currentEpoch = Number(await voter.epochStart(BigInt(Math.floor(Date.now()/1000))));

// 1. Find your staked gauges and claim emissions
const v2Gauges = await v2StakedGaugesForAccount(account);
const v3Gauges = await v3StakedGaugesForAccount(account);
if (v2Gauges.length > 0) await voter.claimRewards(v2Gauges);
for (const g of v3Gauges) {
  for (const positionTokenId of g.tokenIds) {
    await clGauge(g.gauge)["getReward(uint256)"](positionTokenId);
  }
}

// 2. Find voted-for gauges from prior epoch and claim fees + bribes
if (lastVoted > 0 && lastVoted < currentEpoch) {
  const vote = await getVote(tokenId);
  const votedGauges = await Promise.all(vote.allocations.map(a => voter.gauges(a.pool)));
  const feeRewards = await Promise.all(votedGauges.map(g => voter.gaugeToFees(g)));
  const bribeRewards = await Promise.all(votedGauges.map(g => voter.gaugeToBribe(g)));

  const feeTokens = await Promise.all(vote.allocations.map(async a => {
    const pool = poolContract(a.pool);
    return await Promise.all([pool.token0(), pool.token1()]);
  }));
  await voter.claimFees(feeRewards, feeTokens, tokenId);

  const bribeTokens = await Promise.all(bribeRewards.map(async rewardAddr => {
    const bribe = rewardContract(rewardAddr);
    const len = Number(await bribe.rewardsListLength());
    const tokens = await Promise.all([...Array(len)].map((_, i) => bribe.rewards(i)));
    const earned = await Promise.all(tokens.map(t => bribe.earned(t, tokenId)));
    return tokens.filter((_, i) => earned[i] > 0n);
  }));
  const nonEmptyBribes = bribeRewards.filter((_, i) => bribeTokens[i].length > 0);
  const nonEmptyTokens = bribeTokens.filter(tokens => tokens.length > 0);
  if (nonEmptyBribes.length > 0) {
    await voter.claimBribes(nonEmptyBribes, nonEmptyTokens, tokenId);
  }
}

// 3. Claim rebase
await rewardsDistributor.claim(tokenId);
```

`scripts/src/write/claim.ts:claimAll({ tokenId, account })` runs the whole sequence with the signer account.

## When can you claim?

- Gauge emissions: any time after they accrue (linear over the 7-day epoch).
- Fees & bribes: anytime starting in epoch E+1 for votes cast in epoch E. Claiming earlier than E+1 returns 0.
- Rebase: anytime; updates each `Minter.updatePeriod()` call (i.e. once per epoch).

## Scripts

| Operation | Where |
|---|---|
| Read all claimable | `scripts/src/read/claimable.ts` — returns gauge/emissions, fees, bribes, rebase quantities |
| Claim emissions (v2 batch) | `scripts/src/write/claim.ts` — `claimGaugeRewardsV2({ gauges })` |
| Claim emissions (v3 single/batch) | `claimGaugeRewardsV3({ gauge, account?, tokenIds? })` |
| Claim fees | `claimFees({ tokenId, pools })` — auto-resolves gauges, fee contracts, and pool tokens |
| Claim bribes | `claimBribes({ tokenId, pools })` — auto-resolves gauges, bribe contracts, and active reward tokens |
| Claim rebase | `claimRebase({ tokenId })` |
| Claim everything | `claimAll({ tokenId, account })` |
| CLI | `yarn tsx src/cli/claim.ts all --id 123` (uses signer address for account) |
