# Eval 09 — Deposit a veTOPAZ lock into a Relay

**Output kind:** `built calldata`

## Prompt

> Deposit my veTOPAZ lock #1234 into the veTOPAZ Maxi relay on Topaz.

(Substitute a real veNFT id owned by the test wallet during review.)

## Skill activation

- [ ] `topaz` skill is loaded (trigger phrase "deposit … into a relay / veTOPAZ Maxi").

## Expected reads

- [ ] `VotingEscrow.escrowType(1234)` → must be `0` (NORMAL); a LOCKED/MANAGED lock cannot be deposited (fail loudly).
- [ ] `VotingEscrow.ownerOf(1234)` → confirms the user owns (or is approved on) the veNFT.
- [ ] `Voter.lastVoted(1234)` vs the current epoch start → must not have voted/deposited this epoch.
- [ ] Resolve the relay: veTOPAZ Maxi = `AutoCompounder`, managed veNFT `mTokenId` **3083**.

## Expected writes

- [ ] `buildDepositManagedTx({ tokenId: 1234, relay: "maxi" })` or equivalent manual ABI encoding.
- [ ] **Deposit calldata** for `Voter.depositManaged(1234, 3083)` — target is the **Voter**, `value: 0`.
- [ ] No ERC20 `approve` step (depositing a veNFT is not a token transfer).
- [ ] Not broadcast unless the user explicitly authorizes.

## Final answer MUST include

- [ ] The `Voter.depositManaged(tokenId, mTokenId)` call with `mTokenId` 3083 (veTOPAZ Maxi).
- [ ] That the lock must be a **NORMAL** lock to be deposited.
- [ ] That depositing **forfeits the user's own vote** while in the relay (the relay votes the aggregated weight).
- [ ] The once-per-epoch / final-hour timing constraint.
- [ ] That **veTOPAZ Maxi compounds in-place — there is no claim**; to realize gains the user must `withdrawManaged` (which re-locks to max).

## Final answer MUST NOT include

- [ ] An ERC20 `approve(...)` step for the deposit.
- [ ] A "claim from veTOPAZ Maxi" calldata block (Maxi has no claim).
- [ ] Auto-broadcast without an explicit user ask.
- [ ] A hardcoded `FreeManagedReward` address (it is resolved via `ve.managedToFree(mTokenId)`).

## Machine-readable assertions

```yaml
assertions:
  output_kind: built calldata
  expected_tool_calls:
    - '(buildDepositManagedTx|depositManaged\(|escrowType\(|lastVoted\()'
  forbidden_tool_calls:
    - 'scripts/src/write/relay'
    - 'src/cli/relay\.ts'
    - 'broadcastTransaction'
    - 'sendTransaction'
  must_include:
    - 'depositManaged'
    - '(veTOPAZ Maxi|mTokenId 3083|\b3083\b|AutoCompounder)'
    - '(NORMAL lock|normal lock|escrowType)'
    - '(forfeit|gives up|relay votes|no longer vote)'
    - '(once per epoch|same epoch|final hour|withdrawManaged)'
  must_not_include:
    - '\.approve\('
    - '(broadcast(ed)?|tx hash|sent on-?chain|executed)'
    - '(claim from .{0,12}Maxi|Maxi.{0,20}getReward)'
```
