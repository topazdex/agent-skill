# BNB xTOPAZ entry and redemption

All calls here are on **BNB 56**. Use the deployed `VeTopazVault`, `WrapRouter`, `XTopazZap`, `XTopaz`, `Topaz`, `VotingEscrow` and reward ABIs from [deployments.json](deployments.json). [Builder examples](../developers/multichain-integration.md) show how to load them. Build calldata by default; simulate from the actual owner after required approvals confirm.

## Deposit TOPAZ

Read `canEnter()`, `entryPaused()`, `isSettled()`, TOPAZ balance and allowance. Preview `convertToShares(amount)` using raw 18-decimal TOPAZ. Approve TOPAZ to **WrapRouter**, then call `WrapRouter.depositTopaz(amount,receiver)`. Direct vault deposit is also available but its spender is the vault. `depositTopazWithPermit(amount,receiver,deadline,v,r,s)` is the router's TOPAZ permit variant.

Direct deposit/wrap has **no minShares field**. Quotes can change during rebase synchronization; simulate the exact call and disclose this limitation rather than inventing a minimum argument. Do not apply swap slippage parameters to an ABI that has none. Read `Deposited` for actual assets and shares; do not record the preview as the outcome.

## Wrap a veTOPAZ NFT

Read ownership/operator state, `escrowType`, `locked`, `Voter.lastVoted`, `ve.voted`, `claimable`, `canEnter()` and `previewWrapVe(tokenId)`. Accept only a NORMAL lock that is permanent or unexpired, with no current-epoch vote. Managed and relay-deposited locks need their documented withdrawal path first. A stale vote reset can still fail in the first hour of the epoch.

Use `VotingEscrow.setApprovalForAll(WrapRouter,true)` followed by:

```text
WrapRouter.wrapVe(tokenId, receiver, claims)
claims = { fees: address[], feeTokens: address[][],
           bribes: address[], bribeTokens: address[][] }
```

The router acts as operator while the user owns the NFT. It claims listed fees/bribes to that owner, approves the vault and lets the vault normalize/merge the lock. Do not transfer the NFT to the router first. The source NFT is burned: discover **historical** reward contracts/token lists, including prior votes, not just the current slate. Empty claims are appropriate only after verifying there are no unclaimed rewards. Never silently burn an NFT with incomplete claim discovery.

Rebase claiming is synchronized by the vault. `RebaseBacklog(id)` means the distributor still has claimable amounts after its bounded batch. For the source NFT, repeat authorized `RewardsDistributor.claim(id)` until drained; for the aggregate use `vault.claimRebase()`, then reread and simulate. A claim does not substitute for epoch finalization.

## Entry and bridge in one source transaction

`depositTopazAndBridge(amount,b)` and `wrapVeAndBridge(tokenId,claims,b)` use `b = {dstEid,receiver,composer}`. Approve TOPAZ/NFT to WrapRouter as above and supply the LayerZero native fee. Quote with the expected **shares**, not the TOPAZ amount: `quoteBridge(shares,b)`. Actual minting can differ; simulate and requote near submission. The router computes its send from actual shares and returns subprecision dust to the source caller. See [bridging.md](bridging.md).

## Redeem

Read `canUnwrap()`, `unwrapPaused()`, aggregate vote state, `aggregateTokenId()`, current rate and seed constraints. Approve **XTopaz to VeTopazVault**, then call `redeem(shares,receiver)`. The result is a **new permanent veTOPAZ NFT on BNB**, not liquid TOPAZ. The original wrapped NFT does not return. A smart-contract recipient must be able to own/manage the lock; simulate from the intended account.

The vault splits the aggregate, burns shares and updates its aggregate ID. Read `Redeemed` and `AggregateReplaced` for the result. Converting the permanent lock into liquid TOPAZ requires the separate BNB permanent-unlock/timed-lock withdrawal rules; never promise immediate cash redemption.

## xTOPAZ zap

`XTopazZap` is BNB-only token/native BNB → TOPAZ → xTOPAZ entry. It is **not CL Zap**, which supplies concentrated liquidity. Read `quoteZap(amountIn,routes)`; use v2 Router routes ending in TOPAZ. The deployed ABI specifies `ZapParams` and the permit/bridge variants. Enforce `minTopazOut`, `minShares` and a deadline. `zapNative(routes,minTopazOut,minShares,receiver,deadline)` sends BNB value. Approve ERC20 input to the zap for token variants. Do not send tokens or NFTs directly to any vault/router/zap address: there is no general recovery guarantee.
