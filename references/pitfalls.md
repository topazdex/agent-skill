# Pitfalls & Gotchas

Common mistakes to avoid when interacting with Topaz.

## Swapping

- **Pool doesn't exist.** `PoolFactory.getPool(a, b, stable)` and `CLFactory.getPool(a, b, tickSpacing)` return `address(0)` when no pool is deployed for that exact tuple. Constructing a `Route` or path through a non-existent pool will revert with an opaque reason. Always check first.
- **Wrong `stable` flag.** A `(USDT, USDC)` pair almost certainly exists as a stable pool, while `(WBNB, USDT)` is volatile. Passing the wrong flag silently routes through a different (possibly non-existent) pool. When in doubt, query both and use whichever returns a non-zero address — or use `references/swapping-mixed.md` to let `MixedRouteQuoterV1` quote both.
- **Wrong tick spacing (v3).** Each `(tokenA, tokenB, tickSpacing)` is a distinct pool. The same pair can exist at multiple tick spacings with very different liquidity and fees. Don't assume `tickSpacing=100` — read the live pool from the factory.
- **Slippage of zero.** Never pass `amountOutMin = 0` or `amountInMaximum = type(uint256).max`. Standard defaults: 0.5% slippage for v2 swaps, 1% for v3. For very low-liquidity pools, increase.
- **`sqrtPriceLimitX96 = 0`** in v3 `exactInputSingle` means "no limit" and is technically safe because slippage is enforced through `amountOutMinimum`, but a sensible limit prevents catastrophic price impact. The Uniswap-recommended pattern is `0` here and rely on `amountOutMinimum`.
- **Stale `getAmountsOut` quotes.** `Pool` quotes use a TWAP for the reserves it returns. The actual swap uses live reserves. Quote slippage of 0.1–0.5% can appear "for free" on busy pools.
- **Fee-on-transfer tokens.** Use the `*SupportingFeeOnTransferTokens` Router variants for any token that takes a tax on transfer. The base swap functions revert because intermediate balance assertions fail.

## Liquidity

- **`addLiquidity` ratio mismatch.** For volatile pools, supplying off-ratio amounts means one side is partially refunded. `quoteAddLiquidity` tells you the exact split — use it to size both legs.
- **`stable` pools require equal value, not equal amount.** A USDT/USDC stable pool with a 1:1.001 internal price needs amounts proportional to that price. Use `Router.quoteAddLiquidity` to compute.
- **Approving the Router only.** v2 add/remove liquidity goes through `Router`, so token approvals are to `Router`. Staking the resulting LP token goes through a `Gauge`, so a *second* approval (LP token → `Gauge`) is required before `Gauge.deposit`.
- **v3 mint computes liquidity from the **lower** of the two desired amounts at the given range.** If you provide a desired ratio that doesn't match the actual pool price, one side will be underused (and tokens left in your wallet). To put exactly `X` token0 in at the current price, compute the matching `Y` token1 via `SugarHelper.estimateAmount1`.
- **NFT positions outside the current tick range are 100% one-sided.** A position with `tickLower > current tick` is all token1; `tickUpper < current tick` is all token0. This is correct behavior, not a bug.
- **`tickLower` must be a multiple of `tickSpacing`**, and so must `tickUpper`. Picking arbitrary ticks reverts with `IT` (invalid tick). Floor/ceil to the nearest multiple.

## Staking (gauges)

- **CL positions earn rewards only while in-range.** An out-of-range NFT is still "staked" in the `CLGauge`, but its `stakedLiquidityNet` contribution is zero so it accrues nothing. Move ranges or unstake → rebalance → restake.
- **Approving the NFT.** Before `CLGauge.deposit(tokenId)`, you must `NonfungiblePositionManager.approve(clGauge, tokenId)` (or `setApprovalForAll(clGauge, true)`).
- **You cannot `increaseLiquidity` or `collect` directly on a staked NFT.** Withdraw it first (`CLGauge.withdraw(tokenId)` — claims rewards as a side effect), modify, restake.
- **`Gauge.getReward(account)` is permissionless for v2.** Anyone can call it, but rewards go to `account`. For CL, `CLGauge.getReward(tokenId)` only the position owner can call.

## Voting

- **`vote` and `reset` revert if called twice in one epoch.** Check `Voter.lastVoted(tokenId)` first. To change vote weights inside the same epoch, you cannot — wait until Thursday 00:00 UTC.
- **`poke` is the only way to refresh voting power mid-epoch** (e.g. after `increaseAmount` grew your veNFT). It re-applies your existing pool/weight allocation with the new balance.
- **`vote` requires `isApprovedOrOwner(msg.sender, tokenId)`.** Calling from a contract you don't own the NFT in (and didn't `approve` from the owner) reverts.
- **Voting with `maxVotingNum` (30) pools at once is the cap.** If your vote allocation has 31+ pools, split into multiple veNFTs or drop the lowest-weight choices.
- **Weights are relative.** `[100, 200]` and `[1, 2]` produce identical allocations. Don't try to make weights "match percent" — the contract normalizes to `usedWeights = balanceOfNFT(tokenId)`.
- **A killed gauge (`Voter.isAlive(gauge) == false`) earns no emissions** even if you voted for it. Always check `isAlive` before allocating significant weight.

## veTOPAZ locks

- **`createLock(value, duration)` rounds the unlock down to the next Thursday 00:00 UTC.** A "1 year lock" might actually be 365 days minus a few hours.
- **`increaseUnlockTime(tokenId, newDuration)`** is interpreted as *the duration from now*, not as an absolute timestamp. Passing a duration that's *less than* the current remaining lock reverts.
- **You can't `withdraw` before `unlockTime`** unless the lock has been "permanent-unlocked" via `unlockPermanent` + waited. Permanent locks have no expiry until you call `unlockPermanent`.
- **`merge(from, to)`** transfers all of `from`'s amount into `to` and burns `from`. The destination keeps the longer of the two unlock times. You cannot merge if `from` is voting in the current epoch (must `reset` first, but reset is blocked by `onlyNewEpoch` if you already voted this week — plan ahead).
- **`split` is gated by `canSplit[owner]`** — set per-address via `VotingEscrow.toggleSplit`. If you can't split, it's likely disabled for your address.

## Bribes / fees

- **Bribe tokens must be whitelisted** or already a reward token of that specific bribe contract. If `Voter.isWhitelistedToken(token) == false` and `BribeVotingReward.isReward(token) == false`, `notifyRewardAmount` reverts with `NotWhitelisted`.
- **Bribes deposited after Thu 23:00 UTC roll to the next epoch's voters.** Time it correctly.
- **`claimFees` / `claimBribes` are called on the contracts (not Voter), but with `tokenId`.** The exact pattern is `Voter.claimFees(feeContracts[], tokens[][], tokenId)` — note the nested arrays. `tokens[i]` is the list of reward tokens to pull from `feeContracts[i]`. Mismatched lengths revert.
- **You must own (or be approved for) the veNFT** to call `claimBribes`/`claimFees`/`claimRewards` for it (the Voter checks `isApprovedOrOwner`).

## Rebase

- **`RewardsDistributor.claim(tokenId)`** sends the rebase **into the veNFT itself** (increasing its locked amount), not to your wallet. Treat it like `increaseAmount`. Permanent locks accumulate rebase at full weight, decaying locks at their current ve-balance weight.

## Calldata-level gotchas

- **`Pool.swap` is the low-level callback-based primitive.** Don't call it directly from an EOA — use `Router` (v2) or `SwapRouter` (v3).
- **`QuoterV2` is not view** in Solidity (it `revert`s with the result and decodes off-chain). On-chain contracts cannot use it; for on-chain quotes, replicate the math or use a TWAP.
- **All addresses in this skill are checksummed.** When pasting into a tool that re-checksum-validates, copy exactly — case matters.
