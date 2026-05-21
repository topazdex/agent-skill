# Epoch Timing

Topaz's emission and voting cycle is **weekly**. All state transitions snap to a 1-week boundary anchored at the Unix epoch (1970-01-01 00:00 UTC), so each epoch starts at **Thursday 00:00:00 UTC**.

## Boundaries

`Voter` exposes pure helpers (see `Voter.sol` lines 107–122 / `ProtocolTimeLibrary.sol`):

```solidity
function epochStart(uint256 ts)     pure returns (uint256);  // floor(ts, 1 week)
function epochNext(uint256 ts)      pure returns (uint256);  // epochStart(ts) + 1 week
function epochVoteStart(uint256 ts) pure returns (uint256);  // epochStart(ts) + 1 hour
function epochVoteEnd(uint256 ts)   pure returns (uint256);  // epochNext(ts) - 1 hour
```

Voting window for the current epoch: `[epochVoteStart(now), epochVoteEnd(now))`. Outside this window most votes still **work** (the contract allows `vote()` after epoch flip), but a few protected actions (token whitelisting, gauge create/kill) are restricted.

## What happens at epoch flip (Thu 00:00 UTC)

1. The first transaction to call `Minter.updatePeriod()` in the new week triggers the weekly emission:
   - Decays/grows the headline `weekly` amount per the formula in `Minter.sol`.
   - Sends `team` cut (5% cap) to the team multisig.
   - Computes rebase (`RewardsDistributor`) share for veTOPAZ holders.
   - Notifies the `Voter` of the remaining emission via `notifyRewardAmount`.
2. `Voter.distribute(start, end)` (or `distribute(gauges[])`) is then called (by anyone, but typically a keeper) to push each gauge's share to its `Gauge.notifyRewardAmount` and start a 7-day reward stream.
3. veTOPAZ holders can call `RewardsDistributor.claim(tokenId)` to pull the rebase.
4. Voters can `reset(tokenId)` then `vote(tokenId, ...)` again — but only **after** the new epoch starts.

`Minter.updatePeriod()` is idempotent within the same epoch — if it's already been called this week it just returns.

## What you can't do twice in the same epoch

The Voter enforces this via the `onlyNewEpoch` modifier (Voter.sol lines 163, 252):

- `Voter.vote(tokenId, ...)` requires `block.timestamp > lastVoted[tokenId]`'s epoch end. In practice that means **at most one effective `vote` per epoch** per veNFT — re-calling `vote` in the same epoch will revert with `AlreadyVotedOrDeposited`.
- `Voter.reset(tokenId)` likewise reverts if `lastVoted` is in the current epoch.
- `Voter.poke(tokenId)` is exempt — you can `poke` any number of times to re-weight after your veNFT balance changes (e.g. after `increaseAmount`).

To re-vote intentionally, wait for the next Thursday 00:00 UTC.

## What bribes/fees pay out

When a veNFT votes for pool P with weight W in epoch E, the contract:

1. Calls `FeesVotingReward[gauge(P)]._deposit(W, tokenId)`.
2. Calls `BribeVotingReward[gauge(P)]._deposit(W, tokenId)`.

These deposits make the veNFT eligible for **the rewards collected during epoch E**. Bribes deposited via `BribeVotingReward.notifyRewardAmount(token, amount)` in epoch E are paid pro-rata to all veNFTs who voted in epoch E. Fees claimed by the gauge in epoch E (via `_claimFees` inside `_distribute`) flow to `FeesVotingReward` and similarly accrue to E's voters.

Voters can `claim` for epoch E **starting in epoch E+1** (rewards become claimable after the epoch ends, when supply checkpoints can be looked up). This means:

| If you want to earn the bribe / fee for epoch E | You must … |
|---|---|
| As a voter | Have an active vote for that gauge during epoch E. Cast the vote any time **before Thu 23:00 UTC** of epoch E. |
| As a briber | Call `notifyRewardAmount` on the bribe contract **before Thu 23:00 UTC** of epoch E. Bribes posted after the window roll into epoch E+1's voter set, **not** E's. |

`scripts/src/lib/epoch.ts` exposes:

```ts
export const WEEK = 7 * 24 * 60 * 60;
export const epochStart = (ts: number) => Math.floor(ts / WEEK) * WEEK;
export const epochNext = (ts: number) => epochStart(ts) + WEEK;
export const epochVoteStart = (ts: number) => epochStart(ts) + 3600;
export const epochVoteEnd = (ts: number) => epochNext(ts) - 3600;
export const canVoteNow = (lastVoted: number, now: number) =>
  lastVoted < epochStart(now);  // i.e. you haven't voted yet in this epoch
```

## Constants

| | |
|---|---|
| `WEEK` | 7 days = 604,800 seconds |
| Epoch anchor | Thursday 00:00 UTC (chosen because Unix epoch happens to be a Thursday) |
| Vote window | Thursday 01:00 UTC → next Thursday 23:00 UTC (offset +1h, end −1h) |
| `Voter.DURATION` | 7 days |
| `Voter.maxVotingNum` | 30 (governance-set: max pools you can vote for from one veNFT) |
| `VotingEscrow.MAXTIME` | 4 × 365 × 86,400 = 126,144,000 seconds (4 years) |
| `Minter.WEEKLY_DECAY` | 9,900 / 10,000 (1% decay/week before tail) |
| `Minter.WEEKLY_GROWTH` | 10,300 / 10,000 (3% growth — used in tail-rate governance nudge) |
