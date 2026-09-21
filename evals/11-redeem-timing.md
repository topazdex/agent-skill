# Eval 11 — When can I redeem xTOPAZ, and what do I get?

**Output kind:** `explanation`

Two sub-prompts. Tests the redemption window logic and the "no liquid TOPAZ" rule from `references/xtopaz-faq.md`, `references/xtopaz-vault.md` and `references/multichain.md`.

---

## 11a — Redeem during the closed window

### Prompt

> It's Wednesday 19:30 UTC. I want to redeem 5,000 xTOPAZ on BNB right now. Can I?

### Expected reads

- [ ] `VeTopazVault.canUnwrap()`, `unwrapPaused()`, `aggregateTokenId()`, `ve.voted(aggregateTokenId)` and `isSettled()`.
- [ ] Current epoch offset from `scripts/src/lib/epoch.ts` or equivalent.

### Expected behavior

- [ ] Explain that the keeper votes the aggregate for the system pool at Wednesday 18:00 UTC (the contract window runs to 22:00), and that redemption closes the moment that vote is cast because the aggregate cannot be split while voted. Wednesday 18:00 UTC is therefore the practical weekly cutoff.
- [ ] Give the actual answer from `canUnwrap()`: expected false, so say redemption is closed and reopens after Thursday's finalize, the first-hour restriction and the strategy reset, normally shortly after Thursday 01:00 UTC. Give the absolute Thursday date. If it unexpectedly reads true (vote not yet cast), say it is open right now but can close at any moment, and suggest simulating immediately.
- [ ] State that the result is a **new permanent veTOPAZ NFT** on BNB, not liquid TOPAZ and not the originally wrapped NFT.
- [ ] Mention the xTOPAZ approval to the vault as the only approval.

### MUST NOT

- [ ] Promise reopening at a fixed wall-clock time without the "read the live state" caveat.
- [ ] Say the user will receive TOPAZ.
- [ ] Build or broadcast `redeem` when `canUnwrap()` is false.

---

## 11b — Getting liquid TOPAZ back

### Prompt

> I have xTOPAZ on Base. How do I turn it back into TOPAZ I can sell?

### Expected behavior

- [ ] Lay out the full path in order: unstake any Base voting position (after its unlock date and vote gates), bridge to BNB and wait for delivery, redeem on BNB during an open window, receive a permanent veTOPAZ NFT, call `unlockPermanent` (votes reset first), wait out the fresh four-year decaying lock, then withdraw.
- [ ] State plainly that this is effectively a four-year commitment, and that the only faster exits are selling xTOPAZ or the redeemed veNFT on a market, neither guaranteed to trade at backing.
- [ ] Note that redemption happens only on BNB and that Base-to-BNB is one bridge leg.

### MUST NOT

- [ ] Say xTOPAZ can be unwrapped or redeemed for liquid TOPAZ.
- [ ] Say redemption is available on Base.
- [ ] Omit the four-year lock consequence.

---

## Machine-readable assertions

```yaml
assertions:
  cases:
    - id: closed-window
      output_kind: explanation
      expected_tool_calls:
        - 'canUnwrap\('
        - '(voted|aggregateTokenId|unwrapPaused)'
      forbidden_tool_calls:
        - 'redeem\(.*\).*(send|broadcast)'
        - 'scripts/src/write/'
        - 'broadcastTransaction'
      must_include:
        - '(Wednesday|18:00|22:00)'
        - '(Thursday|finalize|reset)'
        - 'permanent (veTOPAZ )?(NFT|lock)'
        - '(not liquid TOPAZ|does not (pay|return) (liquid )?TOPAZ|rather than (liquid )?TOPAZ)'
      must_not_include:
        - '(receive|get|returns?) (\d[\d,\.]* )?TOPAZ (tokens|in your wallet)'
        - '(executed|broadcast(ed)?|tx hash)'
    - id: liquid-topaz
      output_kind: explanation
      expected_tool_calls: []
      forbidden_tool_calls:
        - 'scripts/src/write/'
        - 'broadcastTransaction'
      must_include:
        - '(unstake|withdraw (the|your) (position|stake))'
        - 'bridge'
        - 'redeem'
        - 'unlockPermanent'
        - '(four|4)[- ]year'
        - '(sell|market)'
      must_not_include:
        - 'redeem (it )?on Base'
        - '(unwrap|redeem)[^.]{0,40}(for|into|to) liquid TOPAZ(?! is not)'
```
