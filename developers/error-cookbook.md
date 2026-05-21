# Error Cookbook

Maps the reverts you'll see when integrating Topaz into a frontend or bot, with user-facing strings and concrete next steps. Grouped by the surface that raises them.

Use this as the source for your error-handling layer: catch the revert, match against the table below, surface the **UI string**, and if applicable apply the **next step**.

Two conventions in this file:

- Reverts in `monospace` are the **exact** string or short-code emitted on-chain. Match against `error.shortMessage` / `error.reason` from ethers v6, or against the revert reason in your tx trace.
- "Where it comes from" links to the canonical source file in the protocol so you can verify the trigger condition before shipping.

If you encounter a revert that isn't here, open an issue against [topazdex/agent-skill](https://github.com/topazdex/agent-skill/issues) with the tx hash and we'll add it.

---

## Swaps — v2 (`Router` + `Pool`)

### `Router: INSUFFICIENT_OUTPUT_AMOUNT`

- **Where**: `Router.swapExactTokensForTokens` (and the BNB-in / BNB-out variants), checked against `amountOutMin`.
- **Means**: The swap finished with less output than the user's slippage floor allowed.
- **Why**: Price moved between the time you quoted and the time the tx was mined. The classic cause is a slippage budget that's too tight for the pool's volatility.
- **UI string**: "Price moved too fast — try a higher slippage tolerance."
- **Next step**: Re-quote at the current block; rebuild calldata with a wider `slippageBps` (e.g. bump from 50 → 100 for volatile pairs, 25 → 50 for stable). **Never** retry with `amountOutMin = 0`.

### `Router: EXPIRED`

- **Where**: `Router` checks `deadline >= block.timestamp` before executing.
- **Means**: The transaction sat in the mempool past its deadline.
- **Why**: The wallet held the tx (low gas, pending signature, offline RPC) until the deadline passed.
- **UI string**: "Transaction took too long to confirm — rebuild and try again."
- **Next step**: Rebuild calldata with a fresh `deadline` (default in this skill: `now + 20m`). Surface the original deadline so the user understands the gap.

### `Router: IDENTICAL_ADDRESSES` / `Router: ZERO_ADDRESS`

- **Where**: `Router._swap` and the pool lookup helpers.
- **Means**: Token in and token out are the same, or one of them is `0x0`.
- **Why**: Bad input from the UI — likely a token-selector state bug.
- **UI string**: "Swap input is invalid — please reselect tokens."
- **Next step**: The skill's `buildBestSwapTx` rejects self-swaps before any RPC; if you see this, your UI is bypassing the builder.

### `Router: INVALID_PATH`

- **Where**: `Router` validates that the first `route.from` matches the input token (and last `route.to` matches the output for ETH-in/out variants).
- **Means**: The route array is misconstructed for the swap function being called.
- **Why**: Hand-rolled routes that don't start with `tokenIn` (or don't end with `WBNB` for `swapExactTokensForETH`).
- **UI string**: "Internal routing error — please rebuild the swap."
- **Next step**: Use the builders in `scripts/src/lib/txBuilders.ts`. They normalize routes through `normalizeAndValidate` first.

### `K` (from `Pool`)

- **Where**: `Pool._update` invariant check at end of swap.
- **Means**: The pool's `K` invariant would have been violated by this trade — the math doesn't close out.
- **Why**: Almost always a fee-on-transfer (rebase) token routed through a non-`SupportingFeeOnTransferTokens` swap function. The intermediate balance assertion fails because the token taxed itself in flight.
- **UI string**: "This token charges a transfer fee — use a fee-on-transfer-aware swap."
- **Next step**: Either route through the `swapExactTokensForTokensSupportingFeeOnTransferTokens` variant, or surface to the user that the token is non-standard and pick a different output token.

### `INSUFFICIENT_LIQUIDITY`

- **Where**: `Router._getAmountOut`.
- **Means**: One of the pools on the route has reserve(s) that round to zero for this trade size.
- **Why**: New pool with no real liquidity, or a small pool being asked for a huge swap.
- **UI string**: "Not enough liquidity in this pool for that size."
- **Next step**: Show the available liquidity from `getReserves`, and let the user try a smaller amount. Or let `bestQuote` find a different route (it already does — only relevant when the user pinned a specific path).

---

## Swaps — v3 (`SwapRouter` + `CLPool`)

### `Too little received` (or `STF` from `unwrapWETH9`)

- **Where**: `SwapRouter.exactInput*` final assertion against `amountOutMinimum`; when wrapping in a multicall + `unwrapWETH9`, the check moves to the unwrap (`STF` = "safe transfer failed" because the router's WBNB balance is below the unwrap's `amountMinimum`).
- **Means**: Same as v2 `INSUFFICIENT_OUTPUT_AMOUNT` — slippage budget was too tight for the price move.
- **Why**: See the v2 entry. v3 quotes are quoted at the current `sqrtPriceX96`, so a few ticks of movement can blow through a 0.5% budget on a thin pool.
- **UI string**: "Price moved too fast — try a higher slippage tolerance."
- **Next step**: Re-quote and widen `slippageBps`. For Topaz native-BNB-out v3 swaps, the slippage floor is enforced at the unwrap step, so the revert will surface as `STF` rather than the inner quote's reason. Both mean the same thing.

### `SPL`

- **Where**: `CLPool.swap` when `sqrtPriceLimitX96` is set and the swap would push price past it.
- **Means**: The swap would have moved price beyond your `sqrtPriceLimitX96` guard.
- **Why**: A defensive `sqrtPriceLimitX96` was set too tight (or the wrong direction). This skill defaults to `0n` (no limit) and relies on `amountOutMinimum` for slippage — `SPL` is mostly a sign someone reused a Uniswap helper that hard-codes a limit.
- **UI string**: "Price guard rejected the swap — remove or widen the price limit."
- **Next step**: Pass `sqrtPriceLimitX96 = 0n` in `buildV3SwapTx` (the default) and let `amountOutMinimum` do the slippage work.

### `TLU` / `TLM`

- **Where**: `CLPool` position management — `TLU` = tick lower below `MIN_TICK`, `TLM` = tick lower not aligned to `tickSpacing` (or upper variants).
- **Means**: The position's tick range is invalid for this pool.
- **Why**: Ticks weren't rounded to a multiple of the pool's `tickSpacing`, or were taken from a different pool with a different spacing.
- **UI string**: "Selected price range isn't valid for this pool's tick spacing."
- **Next step**: Floor/ceil ticks to `tickSpacing` multiples. The skill's `liquidity-v3.md` reference walks through this; tick math lives in `scripts/src/lib/tickMath.ts`.

### `IT`

- **Where**: `CLPool.initialize` and tick math helpers.
- **Means**: An individual tick passed in was outside `[MIN_TICK, MAX_TICK]` (±887272 for Uniswap-v3-fork pools).
- **Why**: Caller computed a tick from a non-finite `sqrtPriceX96` or used the wrong `getTickAtSqrtRatio` direction.
- **UI string**: "Selected price is outside the supported range."
- **Next step**: Validate `tick >= MIN_TICK && tick <= MAX_TICK` before passing to `mint`. The skill's `tickMath.ts` clamps in the safe direction.

### `LOK`

- **Where**: `CLPool` reentrancy guard on `swap`, `flash`, `mint`, `burn`, `collect`.
- **Means**: The pool is currently locked (mid-call).
- **Why**: A callback contract is calling back into the same pool. Production agents won't hit this; it shows up in custom router implementations.
- **UI string**: "Pool is temporarily locked — try again in a moment."
- **Next step**: If you're not building a custom router, treat this as transient and retry once. If you are, restructure so you don't re-enter the same pool.

### `AS` / `F0` / `F1` / `M0` / `M1` / `IIA`

- **Where**: `CLPool` parameter validation. `AS` = amountSpecified can't be 0; `F0`/`F1` = flash callback didn't pay back; `M0`/`M1` = mint amounts; `IIA` = invalid input amount.
- **Means**: Various "you passed 0 or a nonsensical amount" cases.
- **UI string**: "Swap amount is invalid."
- **Next step**: `normalizeAndValidate` in the skill already enforces `amountIn > 0` before any RPC. If you bypassed it, route back through `buildV3SwapTx`.

---

## Liquidity — v3 (`NonfungiblePositionManager` + `CLPool`)

### `Price slippage check`

- **Where**: `NonfungiblePositionManager.mint` / `increaseLiquidity` against `amount0Min` / `amount1Min`.
- **Means**: The pool moved between quote and mint, and the actual amounts used were below the user's floor.
- **Why**: Adding liquidity at the current tick computes the split from live `sqrtPriceX96`. A small move changes the required ratio.
- **UI string**: "Pool price shifted — try widening your slippage."
- **Next step**: Re-quote with `SugarHelper.estimateAmount1` (or the equivalent) and rebuild with higher `slippageBps` (default in this skill is 100 bps for v3 mint).

### `Transaction too old`

- **Where**: `NonfungiblePositionManager` deadline check.
- **Means**: Same as v2 `EXPIRED` — deadline elapsed in the mempool.
- **UI string**: "Transaction took too long to confirm — rebuild and try again."
- **Next step**: Rebuild with a fresh deadline.

### `Not approved`

- **Where**: `NonfungiblePositionManager._isApprovedOrOwner` on every position-modifying method.
- **Means**: The caller isn't the position's owner and doesn't have token-level or operator-level approval.
- **Why**: Trying to manage a position you don't own — common when a contract tries to operate on a user's NFT without `setApprovalForAll`.
- **UI string**: "Wallet isn't authorized to manage this position."
- **Next step**: Surface an "Approve" CTA targeting `NonfungiblePositionManager.setApprovalForAll(<your contract>, true)`. Don't try to work around this by changing `recipient` — that's a different code path.

---

## Staking & Gauges

### `NotAuthorized`

- **Where**: `Voter.killGauge` / `Voter.reviveGauge`, gauge admin paths.
- **Means**: Caller isn't the emergency council / governor.
- **Why**: A non-protocol UI tried to call an admin function.
- **UI string**: "This action requires protocol admin privileges."
- **Next step**: This skill is out-of-scope for governance/admin flows (`evals/08-safe-refusals.md` covers this). Refuse.

### `NotAlive` (gauge)

- **Where**: `Gauge.notifyRewardAmount` and downstream paths.
- **Means**: The gauge has been killed; emissions can't be added and rewards can't be claimed normally.
- **Why**: `Voter.killGauge` was called on it (typically because the pool became malicious or trivial).
- **UI string**: "This gauge has been retired — claim any remaining rewards and migrate."
- **Next step**: Read `Voter.isAlive(gauge)` to confirm and stop showing it as a voting target. The skill checks this in its smoke test.

### `ZeroAmount`

- **Where**: `Gauge.deposit(0)`, `CLGauge.deposit(0)`, `Gauge.withdraw(0)`.
- **Means**: Caller passed `0` as the amount to stake / unstake.
- **UI string**: "Enter an amount greater than zero."
- **Next step**: Validate at the form level before building the tx.

---

## Voting

### `DistributeWindow`

- **Where**: `Voter.vote` / `Voter.reset` / `Voter.poke` during the first hour of an epoch (Thu 00:00–01:00 UTC).
- **Means**: The first hour of every epoch is reserved for keepers to call `distribute(...)`; user votes are blocked.
- **Why**: The user (or a UI) tried to vote in the distribute window.
- **UI string**: "Voting is locked for the first hour of each epoch — try again at 01:00 UTC."
- **Next step**: Read `Voter.epochStart(now)` to compute the wait, surface a countdown. `references/epoch-timing.md` has the full window state machine.

### `NotWhitelistedNFT`

- **Where**: `Voter.vote` during the **last** hour of an epoch (Wed 23:00 → next Thu 00:00 UTC).
- **Means**: The final hour of every epoch only accepts whitelisted veNFTs (typically managed NFTs).
- **UI string**: "Voting closed for this epoch — opens again Thursday 00:00 UTC."
- **Next step**: Same — surface the wait. Don't try to retry inside the window.

### `AlreadyVotedOrDeposited`

- **Where**: `Voter.vote` when `lastVoted[tokenId]` is in the current epoch.
- **Means**: This veNFT already voted (or reset) this epoch.
- **Why**: The contract's `onlyNewEpoch` modifier blocks duplicate votes.
- **UI string**: "This veNFT already voted this epoch — changes apply next Thursday."
- **Next step**: Read `Voter.lastVoted(tokenId)` and compare with `Voter.epochStart(now)`. If you need to refresh weight after `increaseAmount`, use `Voter.poke(tokenId)` instead — it's not gated by `onlyNewEpoch`.

### `NotWhitelisted` (bribe token)

- **Where**: `BribeVotingReward.notifyRewardAmount` when the token isn't in `rewards[]` AND `Voter.isWhitelistedToken(token)` is false.
- **Means**: The bribe token hasn't been governance-approved for this bribe contract.
- **UI string**: "This token can't be used as a bribe — only governance-approved tokens are accepted."
- **Next step**: Pre-flight with `Voter.isWhitelistedToken(token)` before showing the bribe form. The skill's `bribes-deposit.md` shows the check.

### `Not approved or owner` (vote / claim)

- **Where**: `VotingEscrow._isApprovedOrOwner` and `Voter._checkOwner`.
- **Means**: The signer isn't the veNFT owner and isn't approved for it.
- **Why**: A contract or relayer tried to vote without `VotingEscrow.approve(...)` from the owner.
- **UI string**: "Connected wallet isn't authorized to vote with this veNFT."
- **Next step**: Surface "Approve" targeting `VotingEscrow.approve(<spender>, tokenId)`. Or operate from the owner's wallet directly.

---

## veTOPAZ Locks

### `SplitNotAllowed`

- **Where**: `VotingEscrow.split` when `canSplit[msg.sender]` and `canSplit[address(0)]` are both false.
- **Means**: Split is globally (or per-account) disabled.
- **UI string**: "Splitting locks is currently disabled."
- **Next step**: Read `canSplit[owner]` and `canSplit[address(0)]`; only show the Split UI when at least one is true. If a user reports this and the flag is supposed to be on, escalate to protocol governance.

### `ZeroValue` / `ZeroAmount` (lock)

- **Where**: `VotingEscrow.createLock`, `increaseAmount`.
- **Means**: User tried to create / add `0` TOPAZ.
- **UI string**: "Enter an amount greater than zero."
- **Next step**: Form-level validation.

### `Lock not expired` / unlock-time-in-past

- **Where**: `VotingEscrow.withdraw` before `unlockTime`.
- **Means**: User tried to withdraw a still-locked veNFT.
- **UI string**: "Lock isn't expired yet — unlocks {date}."
- **Next step**: Read `VotingEscrow.locked(tokenId).end` and surface the unlock date. Disable the withdraw CTA until then.

---

## ERC20 / Approvals

### `TRANSFER_FROM_FAILED` / `SafeERC20: low-level call failed`

- **Where**: Any function that does `IERC20.transferFrom(user, ...)` — Router, SwapRouter, Gauge, BribeVotingReward.
- **Means**: The token's `transferFrom` returned false (or reverted). Two common causes:
  1. **Missing approval** — `allowance(user, spender) < amount`.
  2. **Insufficient balance** — user spent the tokens between approval and swap.
- **UI string**: "Approval missing or balance changed — please re-check and approve again."
- **Next step**: Read `ERC20.allowance(payer, spender)` and `ERC20.balanceOf(payer)`. If allowance is short, surface "Approve" first; the skill's builders return an `approval` field on `BuiltSwapTx` that captures exactly this.

### `ERC20: insufficient allowance`

- **Where**: OpenZeppelin-style ERC20 `_spendAllowance`.
- **Means**: Same as above; some tokens use OZ's stricter error message.
- **UI string**: Same as above.
- **Next step**: Same as above.

### `ERC20: transfer amount exceeds balance`

- **Where**: OpenZeppelin-style ERC20 `_transfer`.
- **Means**: The payer doesn't have enough tokens.
- **UI string**: "Insufficient {SYMBOL} balance."
- **Next step**: Read `ERC20.balanceOf(payer)` and compare. Don't build the tx if balance is short.

---

## Generic patterns

### Empty revert data (`0x` from the RPC)

- **Means**: The tx reverted without a reason string. Most common in v2 pools when the failure is at the assembly level (e.g. `Pool.swap` callback didn't pay).
- **UI string**: "Transaction reverted without a reason."
- **Next step**: Pull the trace from the RPC if it supports `debug_traceTransaction`. Otherwise: re-quote the path and rebuild. If it consistently reverts at the same step, the pool itself may be malformed.

### `eth_call` empty-data revert on a read-only function (selector not deployed)

- **Means**: You called a function name that doesn't exist on the deployed contract. The EVM falls through the function dispatcher and reverts with no data.
- **Why**: Almost always a function-name mismatch between an ABI and the actual deployed contract. Common Topaz-specific case: agents borrowing prior knowledge from Velodrome / Aerodrome and calling `Voter.gaugeForPool(address)` — that function **is not deployed** on Topaz. The correct name is `Voter.gauges(address)` (selector `0xb9a09fd5`). Calling `gaugeForPool` (selector `0x2045be90`) reverts with no data, which an unwary integration can misread as "no gauge exists for this pool."
- **UI string**: "Internal contract error — wrong function name." (This is an integration bug; surface to dev tooling, not end users.)
- **Next step**: Check the ABI you're using against `references/abis/Voter.json`. The deployed selector list is fixed; do not "fall back" to interpreting an empty revert as a legitimate `ZeroAddress` response. The skill's `references/gauges.md` lists the canonical Voter function names; the `listGaugesForPair` helper in `scripts/src/read/gauges.ts` uses them directly and never raw-calls speculative selectors.

### `listGaugesForPair` returned an empty array but I expected a gauge

- **Means**: The enumeration genuinely did not find a gauge across all seven variants (v2 stable, v2 volatile, v3 at each tick spacing in {1, 50, 100, 200, 2000}). Either there really is no gauge for this pair at the current block, or one of the input addresses is wrong.
- **Why**: Two real possibilities:
  1. The pair exists as a pool but `Voter.createGauge(...)` has never been called — common for low-priority long-tail pairs.
  2. The token address you passed is wrong (e.g. a Binance-bridged USDT vs the canonical BSC USDT, or an unchecksummed address that silently maps to a different token at the factory level).
- **UI string**: "No gauge exists for this pair yet."
- **Next step**: Confirm both token addresses with `references/tokens.md` (or `findToken()` in `scripts/src/config/tokens.ts`). If both are correct and the enumeration is still empty, treat the pair as ungauged — emissions don't flow there, voting for the pool has no economic effect.

### `nonce too low` / `replacement transaction underpriced`

- **Where**: RPC layer, not the contract.
- **Means**: The wallet sent a tx with a nonce already mined or an underpriced replacement.
- **UI string**: "Wallet sent a duplicate / outdated transaction — refresh the page and retry."
- **Next step**: Force the wallet to re-read its nonce (most wallet libraries have a `wallet_resetState` or similar). This is a frontend bug, not a Topaz issue.

### `gas required exceeds allowance` / `out of gas`

- **Where**: Pre-flight gas estimation or actual execution.
- **Means**: The estimated gas was wrong (rare for swap), or the wallet capped gas too low.
- **UI string**: "Transaction needs more gas than your wallet allowed."
- **Next step**: Let the wallet auto-estimate. If you're manually setting `gasLimit`, bump by 20% on swaps and 50% on liquidity / vote tx (they branch more).

---

## Diagnostic pattern (from `evals/07-explain-revert.md`)

When you see a revert in production, follow this order:

1. **Match the revert string** against this table.
2. For the matched surface, run the **single most targeted diagnostic**:
   - `INSUFFICIENT_OUTPUT_AMOUNT` / `Too little received` / `STF` → re-quote at the current block, compare with the user's `amountOutMin`.
   - `EXPIRED` / `Transaction too old` → check `deadline` vs the inclusion block timestamp.
   - `TRANSFER_FROM_FAILED` → read `ERC20.allowance(payer, spender)`.
   - `SPL` / `TLU` / `TLM` / `IT` → surface as a v3 price/tick issue, link to `references/swapping-v3.md`.
   - `AlreadyVotedOrDeposited` / `DistributeWindow` / `NotWhitelistedNFT` → read `Voter.lastVoted(tokenId)` and `Voter.epochStart(now)`, compute when the window opens.
3. Surface the **UI string** from the table.
4. Apply the **Next step** to rebuild calldata. **Never** strip slippage or set `amountOutMin = 0` to "make it go through" — that's the canonical anti-pattern.
5. Hand the rebuilt calldata back to the user's wallet. Do not auto-broadcast.

---

## Adding a new entry

When you hit a revert that isn't in this table:

1. Capture the full revert reason from `error.shortMessage` / `error.reason` / the tx trace.
2. Locate the source line in the protocol (most code paths are pointed at from `.claude/INTERNAL-SOURCE-POINTERS.md` if you're on the maintainer's machine).
3. Write a 5-line entry: where it comes from, what it means, why it happens, UI string, next step.
4. Open a PR. The validator (`yarn validate`) will catch any broken links you introduce.
