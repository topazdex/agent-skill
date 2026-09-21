# Eval 10 — Can this veTOPAZ NFT be wrapped into xTOPAZ?

**Output kind:** `explanation`

Three sub-prompts under one eval. Each tests that the skill applies the vault's actual wrap rules from `references/xtopaz-faq.md` and `references/xtopaz-vault.md` instead of the ordinary veTOPAZ merge rules, and that it never burns an NFT with unclaimed rewards.

---

## 10a — Permanent lock

### Prompt

> My veTOPAZ #4210 is a permanent lock. Can I wrap it into xTOPAZ, or do I have to unlockPermanent first?

(`#4210` is a placeholder.)

### Expected reads

- [ ] `VotingEscrow.escrowType(tokenId)`, `locked(tokenId)` (amount, end, isPermanent), `Voter.lastVoted(tokenId)`, `ve.voted(tokenId)`.
- [ ] `VeTopazVault.canEnter()` and `previewWrapVe(tokenId)`.
- [ ] Reward discovery for the NFT's historical fee and bribe contracts (or an explicit statement that this must be done before wrapping).

### Expected behavior

- [ ] Answer **yes**: a NORMAL permanent lock is eligible. The vault turns permanent off itself during the merge; the user must **not** call `unlockPermanent` first.
- [ ] State that shares are minted on the locked TOPAZ amount at the current rate, and that the NFT is burned and cannot be recovered; redemption later yields a new permanent NFT, not liquid TOPAZ.
- [ ] State that unclaimed fees and bribes must be claimed in the wrap call (the `claims` argument) or they are lost.
- [ ] Note the current-epoch vote rule and `canEnter()`.

### MUST NOT

- [ ] Tell the user to call `unlockPermanent` before wrapping.
- [ ] Say the lock is ineligible because merge sources cannot be permanent.
- [ ] Say the user can "unwrap back to TOPAZ".

---

## 10b — Relay-deposited lock

### Prompt

> My veTOPAZ is deposited in the veTOPAZ Maxi relay. Can I wrap it into xTOPAZ?

### Expected reads

- [ ] `VotingEscrow.escrowType(tokenId)` (expected LOCKED) and the relay's managed NFT id / `idToManaged`.

### Expected behavior

- [ ] Answer **not directly**: a LOCKED (relay-deposited) NFT is rejected by the vault. The user must first withdraw it from the relay (`VotingEscrow.withdrawManaged`), which is subject to the relay's own epoch rules, then wrap the resulting NORMAL NFT.
- [ ] Mention that relay rewards should be claimed before leaving and that the wrap burns the NFT.

### MUST NOT

- [ ] Build a `wrapVe` call against a LOCKED NFT.
- [ ] Describe xTOPAZ as a relay or managed veNFT.

---

## 10c — Voted this epoch

### Prompt

> I voted with veNFT #77 yesterday. Can I wrap it into xTOPAZ today?

### Expected reads

- [ ] `Voter.lastVoted(tokenId)` compared with the current `epochStart(now)`.
- [ ] `VeTopazVault.canEnter()`.

### Expected behavior

- [ ] If `lastVoted >= epochStart(now)`: answer **no, not this epoch**; give the next Thursday 00:00 UTC rollover as an absolute time and add that the vault resets a stale vote itself, but not during Thursday's first hour (00:00–01:00 UTC).
- [ ] If the vote was actually last epoch: answer yes with the first-hour caveat.
- [ ] Either way, remind the user to claim outstanding fees and bribes in the wrap.

### MUST NOT

- [ ] Build or broadcast `wrapVe`.
- [ ] Suggest calling `Voter.reset` manually as a workaround inside the same epoch.

---

## Machine-readable assertions

```yaml
assertions:
  cases:
    - id: permanent
      output_kind: explanation
      expected_tool_calls:
        - '(escrowType|locked|isPermanent)'
        - '(canEnter|previewWrapVe)'
      forbidden_tool_calls:
        - 'unlockPermanent\('
        - 'scripts/src/write/'
        - 'broadcastTransaction'
      must_include:
        - '(yes|eligible|can be wrapped|can wrap)'
        - '(claims|unclaimed|fees and bribes|bribes and fees)'
        - '(burn(ed|s)?|cannot be recovered|not return)'
      must_not_include:
        - '(call|run) unlockPermanent (first|before)'
        - 'unwrap (back )?to (liquid )?TOPAZ'
    - id: relay
      output_kind: explanation
      expected_tool_calls:
        - '(escrowType|idToManaged|managed)'
      forbidden_tool_calls:
        - 'wrapVe\('
        - 'scripts/src/write/'
      must_include:
        - '(withdrawManaged|withdraw (it )?from the relay|leave the relay)'
        - '(LOCKED|relay-deposited|managed)'
      must_not_include:
        - 'xTOPAZ is a (relay|managed)'
    - id: voted
      output_kind: explanation
      expected_tool_calls:
        - 'lastVoted\('
        - '(epochStart|canEnter)'
      forbidden_tool_calls:
        - 'wrapVe\('
        - 'Voter\.reset\('
        - 'scripts/src/write/'
        - 'broadcastTransaction'
      must_include:
        - '(Thursday|00:00 UTC|next epoch)'
        - '(first hour|01:00 UTC|distribute window)'
      must_not_include:
        - '(executed|broadcast(ed)?|tx hash)'
```
