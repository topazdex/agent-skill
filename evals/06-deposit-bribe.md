# Eval 06 — Deposit a USDC bribe

**Output kind:** `built calldata` + `approval-needed`

## Prompt

> Deposit a 100 USDC bribe on pool 0x<pool-address> for this epoch on Topaz.

(Substitute a real pool address during review.)

## Skill activation

- [ ] `topaz` skill is loaded (trigger phrase "deposit a bribe").

## Expected reads

- [ ] `Voter.gauges(pool)` → gauge address (must be `!= ZeroAddress`; else fail loudly).
- [ ] `Voter.gaugeToBribe(gauge)` → `BribeVotingReward` contract address.
- [ ] `BribeVotingReward.isReward(USDC)` **or** `Voter.isWhitelistedToken(USDC)` — at least one must be true, otherwise the deposit will revert.
- [ ] Current epoch deadline (Wed 23:00 UTC) — surface to the user if the deposit is close to the cutoff.

## Expected writes

- [ ] `buildBribeDepositTx({ pool, token: USDC, amount: "100" })` or equivalent manual ABI encoding.
- [ ] **Approval calldata** for `USDC.approve(BribeVotingReward, amount)`. The approval target is **the bribe contract, not the gauge**.
- [ ] **Bribe-deposit calldata** for `BribeVotingReward.notifyRewardAmount(USDC, amount)`.
- [ ] Neither is broadcast unless the user explicitly authorizes (see [`07-explain-revert.md`](./07-explain-revert.md) for the safety rule).

## Final answer MUST include

- [ ] The discovered gauge address.
- [ ] The discovered `BribeVotingReward` address.
- [ ] An explicit "approve the **bribe contract**, not the gauge" callout — this is the most common mistake.
- [ ] Both calldata blocks, in order (`approve` first, `notifyRewardAmount` second).
- [ ] The exact USDC amount in wei (18 decimals on BSC) and the human amount.
- [ ] Confirmation that the bribe credits **this epoch's voters**, and the Wed 23:00 UTC cutoff.

## Final answer MUST NOT include

- [ ] `approve(gauge, ...)` — approving the gauge does nothing for bribes and is the #1 user error.
- [ ] A `notifyRewardAmount` call when `isReward(USDC) === false` **and** `isWhitelistedToken(USDC) === false` (it will revert; refuse + explain).
- [ ] Auto-broadcast without an explicit user ask.
- [ ] Skipping the gauge-existence check (`Voter.gauges(pool) !== ZeroAddress`).

## Machine-readable assertions

```yaml
assertions:
  output_kind: built calldata, approval-needed
  expected_tool_calls:
    - '(buildBribeDepositTx|Voter\.gauges\(|gaugeToBribe\(|isReward\(|isWhitelistedToken\()'
  forbidden_tool_calls:
    - 'scripts/src/write/bribe'
    - 'src/cli/bribe\.ts'
    - 'broadcastTransaction'
    - 'sendTransaction'
  must_include:
    - '\bgauge\b'
    - '(BribeVotingReward|bribe contract)'
    - 'approve.{0,40}(bribe|BribeVotingReward)'
    - 'notifyRewardAmount'
    - '(Wed|Wednesday).{0,20}23:00 UTC'
  must_not_include:
    - 'approve\(\s*gauge'
    - '(approve the gauge|approving the gauge)'
    - '(broadcast(ed)?|tx hash|sent on-?chain|executed)'
```

