# Spoke xTOPAZ positions, voting and rewards

Applies to Robinhood 4663, Base 8453, Ethereum 1 and Arc 5042. Select that chain's `XTopazOFT`, `XTopazVotingVault` and `Voter` from [deployments.md](deployments.md). The voting vault exposes compatibility views to Voter, but positions are **not NFTs**, cannot be transferred, and have no BNB rebase or managed-lock interface.

| Intent | Call to local XTopazVotingVault | Required reads / effect |
|---|---|---|
| Open a stake | `stake(amount)` | Read `paused`, `minimumStake`, `lockUntil`; approve xTOPAZ to vault; returns new ID |
| Open and vote | `stakeAndVote(amount,pools,weights)` | Also check voting window, eligible live gauges and weights; all or nothing |
| Stake for someone | `stakeFor(account,amount)` | Always creates a new position; never extends an existing beneficiary position |
| Add principal | `addToPosition(id,amount)` | Owner/operator only; allowance from caller; extends the whole position's withdrawal date |
| Vote | `vote(id,pools,weights)` | Owner/operator; local pool addresses, not gauge addresses; once per epoch |
| Clear slate | `reset(id)` | Prior vote must be in an older epoch; first-hour restriction applies |
| Rescale slate | `poke(id)` | Permissionless; voting windows/gauge state can still revert |
| Withdraw | `unstake(id,amount,receiver)` | Owner only; unlock time plus vote/reset gates; partial vs full differ |
| Merge | `merge(fromId,toId)` | Same owner; owner/operator; target retains slate and later unlock date |
| Claim fees | `claimFees(id,feesContracts,tokenLists)` | Owner/operator; rewards pay position owner |
| Claim bribes | `claimBribes(id,bribeContracts,tokenLists)` | Owner/operator; rewards pay position owner |
| Delegate | `setVoteOperator(operator)` | One operator for caller's positions; can add, vote, merge, claim, not withdraw |

## Read positions and timing

`positionsOf(owner)` then `position(id)` gives the amount, owner and unlock timestamp. `stakedBalance(owner)` gives remaining principal. Historical enumeration grows without bound; for large accounts use indexed `PositionOpened` events plus individual reads. Keep closed IDs because rewards remain claimable and owner information persists.

Read `lockEpochs()` live. Each deposit at time `t` imposes `epochStart(t)+(lockEpochs+1)*WEEK`. With the launch value 1, entry in epoch N unlocks at N+2: roughly 7–14 days, not a fixed 7 days. Adding takes the maximum of the existing date and `lockUntil()`. Withdrawals, claims and votes do not extend it.

Normal voting is after Thursday 01:00 UTC through Wednesday 23:00 UTC; exact boundary comparisons come from the deployed Voter and chain timestamp. `lastVoted(id)` must precede this epoch for another vote/reset. Read current ownership, `usedWeights`, `votes`, pool validity and `isAlive(gauge)`. Weights are relative positive integer allocations; inspect the Voter's current maximum vote count. Never call the BNB Voter for a spoke position.

`isUnlocked(id)` alone is insufficient to promise withdrawal. A voting position can fail in the first-hour distribution window. A **full close** fails if it voted this epoch; normally retry after the next Thursday first hour. Partial withdrawal updates the slate to remaining principal and can revert if a voted gauge was killed. This does not change unlockAt; wait for a valid close/reset window or gauge revival. Simulate the exact amount.

## Discover and claim rewards

Resolve each voted pool's gauge with local `Voter.gauges(pool)` and its `gaugeToFees(gauge)` / `gaugeToBribe(gauge)`. Reward contracts expose `rewardsListLength()`, `rewards(i)` and `earned(token,id)`. Use paired outer arrays and token lists; the ID is the local position ID. Include historical reward contracts and closed positions. Fees/bribes for an epoch become claimable after it ends. There is no spoke `RewardsDistributor.claim` rebase: backing appreciation is already in each xTOPAZ share.

LP gauge rewards are separate from voting rewards: approve/deposit v2 LP tokens or CL NFTs to the local gauge and use its deployed `getReward` signature. Read its reward token and current rate/period; budget delivery alone does not prove it is streaming. `SpokeEmissionReceiver.received(epoch)`, `pending()`, `latestEpoch()` and `exchangeRate()` explain local funding. The last delivered exchangeRate is display evidence, not a fresh hub quote.

To bridge staked principal, first withdraw it under these rules. A bridge cannot pull from a voting position. Bridge-and-stake opens a **new** destination position and can instead deliver liquid xTOPAZ on failure; inspect destination events.
