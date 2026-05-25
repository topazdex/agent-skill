# Gauges, APR, Voting, and Bribes

Topaz's builder opportunity is not only swaps. The ve(3,3) layer creates useful surfaces for dashboards, voting tools, bribe marketplaces, and LP analytics.

## Gauge discovery

A pool has a gauge after `Voter.createGauge(pool)` has been called. The mapping is `Voter.gauges(pool)` → gauge address (`0x0` if no gauge yet).

```ts
import { Contract, ZeroAddress } from "ethers";
import { ABIS, ADDR, provider } from "../scripts/src/index.js";

const voter = new Contract(ADDR.Voter, ABIS.Voter, provider());
const gauge: string = await voter.gauges(pool);
if (gauge === ZeroAddress) {
  // pool has no gauge yet; no emissions, fees still accrue on-pool to LPs
}
```

`scripts/src/read/gauges.ts:getGaugeStateForPool(pool)` does this and also returns `rewardRate`, `periodFinish`, `feesVotingReward`, `bribeVotingReward`, `weight`, and `alive`.

Gauge type follows pool type:

- v2 pool → `Gauge`, LP ERC20 staking via `Gauge.deposit(amount)`
- v3 pool → `CLGauge`, NFT position staking via `CLGauge.deposit(tokenId)`

The reward contracts behind each gauge are:

| Reward contract | Lookup | Who claims |
|---|---|---|
| `Gauge` / `CLGauge` | the gauge address itself | LP stakers (TOPAZ emissions) |
| `FeesVotingReward` | `Voter.gaugeToFees(gauge)` | voters (pool trading fees) |
| `BribeVotingReward` | `Voter.gaugeToBribe(gauge)` | voters (external bribes) |
| `RewardsDistributor` | `ADDR.RewardsDistributor` | veTOPAZ holders (weekly rebase) |

## Reward streams

There are four common reward categories:

1. **LP emissions**: TOPAZ paid to staked v2 LPs or staked v3 NFT positions.
2. **Voting fees**: trading fees paid to veTOPAZ voters for pools they voted for.
3. **Bribes**: external incentives deposited into `BribeVotingReward` contracts.
4. **Rebase**: weekly anti-dilution distribution to veTOPAZ holders.

Use `scripts/src/read/claimable.ts:claimableSummary(tokenId, address)` for examples of aggregating these streams into one display.

## APR recipe

`scripts/src/read/apr.ts` exports four numbers you can wire straight into a dashboard. They use the on-chain `rewardRate` for emission math, the v2/v3 subgraph for 7-day fees/volume, and the TOPAZ USD price helper for normalization.

```ts
import { poolApr, votingApr, rebaseApr } from "../scripts/src/read/apr.js";

const breakdown = await poolApr(pool);   // { emissionApr, feeApr, tvlUsd, stakedTvlUsd, ... }
const voteApr   = await votingApr(pool); // annualized USD value of one epoch's bribes+fees / pool weight
const rebase    = await rebaseApr();     // veTOPAZ-wide anti-dilution APR
```

Suggested display:

| Field | Source | Audience |
|---|---|---|
| Gauge / Emission APR | `poolApr().emissionApr` | LPs deciding whether to stake |
| Fee APR | `poolApr().feeApr` | LPs and voters |
| Voting APR | `votingApr(pool)` | veTOPAZ holders allocating votes |
| Rebase APR | `rebaseApr()` | all veTOPAZ holders |

### Pre-computed APRs via Stats API

If you don't need custom APR formulas, the Stats API returns all four APR types pre-computed:

```ts
import { fetchGauges } from "../scripts/src/index.js";
const { data: gauges } = await fetchGauges();
// Each gauge has: emissionApr, feeApr, bribeApr, totalApr, stakedTvlUsd
```

This is simpler for dashboards — no manual calculation, no subgraph + on-chain dance. Snapshots every 15 min. See `references/analytics-stats-api.md`.

### Caveats every APR display must respect

- **`emissionApr` uses `stakedTvlUsd`, not pool TVL.** For v3 it scales by `stakedLiquidity / liquidity`. Out-of-range CL positions are staked but earn nothing; if your dashboard shows "earnings per $", divide by `stakedTvlUsd`, not headline TVL, or you'll mislead users.
- **`votingApr` is a one-epoch annualization** based on this epoch's deposited rewards and the pool's current vote weight. Bribes are typically posted late in the epoch — a Monday snapshot will look much worse than a Wednesday snapshot. Either cache the previous-completed-epoch number or label the freshness explicitly.
- **Subgraph lag**: APR numbers backed by `volumeUSD`/`feesUSD` lag the chain by a few blocks. Combine with on-chain `slot0` / `getReserves` for "now" pricing.
- **Dead gauges**: `Voter.isAlive(gauge) === false` means emissions stopped. `poolApr` already returns `emissionApr: 0` in that case but you should label the gauge so users don't expect rewards.

## Voting UX

Voting constraints are protocol-level — your UI must surface them.

- Epoch starts Thursday 00:00 UTC.
- First hour after epoch flip (`DistributeWindow`) is read-only for users — `Voter.vote`/`Voter.reset` revert.
- Normal voting opens Thursday 01:00 UTC.
- Final hour (Wed 23:00 UTC → epoch flip) is whitelisted-NFTs-only.
- A veNFT can `vote` or `reset` at most once per epoch (`Voter.lastVoted(tokenId)` < `Voter.epochStart(now)`).

Pre-checks before letting a user submit a vote:

```ts
import { canVoteNow, epochStart, nowSec } from "../scripts/src/lib/epoch.js";
import { Contract } from "ethers";
import { ABIS, ADDR, provider } from "../scripts/src/index.js";

const voter = new Contract(ADDR.Voter, ABIS.Voter, provider());
const lastVoted = await voter.lastVoted(tokenId);
if (!canVoteNow(lastVoted)) {
  // already voted this epoch, or inside the distribute / whitelist-only window
}
```

`scripts/src/lib/epoch.ts:canVoteNow` does the full window check.

## Bribe UX

When depositing bribes:

1. Resolve `pool → gauge → bribe` via `Voter.gaugeToBribe(gauge)`.
2. Check that the bribe token is already a reward token on that contract (`BribeVotingReward.isReward(token)`) **or** that it's whitelisted globally (`Voter.isWhitelistedToken(token)`); otherwise the deposit reverts.
3. Show approval explicitly — spender is the `BribeVotingReward` address, not the gauge.
4. Communicate timing: bribes deposited within the current epoch are paid to that epoch's voters; deposit before Wed 23:00 UTC.

```ts
import { Contract } from "ethers";
import { ABIS, ADDR, provider } from "../scripts/src/index.js";

const voter   = new Contract(ADDR.Voter, ABIS.Voter, provider());
const gauge   = await voter.gauges(pool);
const bribe   = await voter.gaugeToBribe(gauge);
const isReward       = await new Contract(bribe, ABIS.BribeVotingReward, provider()).isReward(token);
const isWhitelisted  = await voter.isWhitelistedToken(token);
if (!isReward && !isWhitelisted) {
  // notifyRewardAmount will revert
}
```

Full deposit recipe (write side, with `PRIVATE_KEY`) is in `scripts/src/write/bribe.ts`.

## Related references

- `references/bribes-deposit.md`
- `references/voting.md`
- `references/epoch-timing.md`
- `references/rewards-claiming.md`
- `references/apr-calculations.md`
