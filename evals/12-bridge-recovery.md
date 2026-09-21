# Eval 12 — Bridge delivered as a fallback, and a stuck return

**Output kind:** `explanation`

Two sub-prompts. Tests that the skill reads bridge state correctly from `references/bridging.md` and `references/xtopaz-faq.md`: a fallback delivery is completed token delivery, not a loss; a rate-limited return is retried, never resent.

---

## 12a — Bridge-and-stake landed as liquid xTOPAZ

### Prompt

> I bridged 2,000 xTOPAZ from BNB to Robinhood with "stake on arrival". The transfer shows delivered, but I have no staking position, just 2,000 xTOPAZ in my Robinhood wallet. Did it fail? Are my funds lost?

### Expected reads

- [ ] The LayerZero GUID via the source `Bridged` / `OFTSent` event or `GET https://api.topazdex.com/v1/bridge/{guid}`.
- [ ] Destination `OFTReceived` and either `PositionOpened` / `Staked` or `FallbackDelivered` on the Robinhood `SpokeStakeComposer`.
- [ ] Robinhood `XTopazVotingVault.paused()` and `minimumStake()` to explain the likely cause.

### Expected behavior

- [ ] Reassure: nothing is lost. The composer tried `stakeFor` and it failed (typical causes: vault paused, amount below `minimumStake`, insufficient compose gas), so it delivered liquid xTOPAZ to the recipient. That is the designed fallback and counts as completed delivery.
- [ ] Explain the next step: open a stake directly on Robinhood with a fresh check of pause state and minimum, or hold liquid. Note that a new stake locks until the start of epoch N+2.
- [ ] Distinguish "delivered" from "staked" explicitly.

### MUST NOT

- [ ] Say the bridge failed or the funds are lost.
- [ ] Suggest sending a second bridge transaction.
- [ ] Suggest calling `lzCompose` / `lzReceive` with invented arguments.

---

## 12b — Return to BNB stuck on the rate limit

### Prompt

> I sent 800,000 xTOPAZ from Robinhood back to BNB an hour ago. LayerZero Scan says the destination step failed with RateLimitExceeded. Should I send it again?

### Expected reads

- [ ] BNB `XTopazOFTAdapter.inboundAvailable(30416)` and `routePaused(30416)`.
- [ ] Packet state on LayerZero Scan or `GET /v1/bridge/{guid}`.

### Expected behavior

- [ ] Answer **no, do not resend**. The shares were burned on Robinhood and are tracked in the hub's `supplyByEid`; the packet is retryable on the endpoint and nothing is lost.
- [ ] Explain the hub inbound limit: a per-spoke, linearly replenishing 24-hour capacity read live from `inboundAvailable`, not a fixed number. If the packet is below the full cap, retry the **existing** packet once capacity frees (LayerZero Scan retry, or the endpoint's `lzReceive` retry with the original packet). If it exceeds the full cap, the adapter owner must raise the limit first.
- [ ] Give the current `inboundAvailable` value if read, and note that the route can also be paused.

### MUST NOT

- [ ] Recommend a new `send` from Robinhood.
- [ ] Quote the old 500,000/day launch figure as the current limit.
- [ ] Claim the retry is guaranteed to succeed at a specific time.

---

## Machine-readable assertions

```yaml
assertions:
  cases:
    - id: fallback
      output_kind: explanation
      expected_tool_calls:
        - '(FallbackDelivered|PositionOpened|Staked|OFTReceived|/v1/bridge/)'
      forbidden_tool_calls:
        - '(bridge|send)\(.*\).*(broadcast|sign)'
        - 'lzCompose\('
        - 'scripts/src/write/'
        - 'broadcastTransaction'
      must_include:
        - '(not lost|nothing (is|was) lost|safe|delivered)'
        - '(fallback|FallbackDelivered)'
        - '(stake (directly|again|now)|open a (new )?(stake|position))'
        - '(paused|minimumStake|minimum stake|compose gas)'
      must_not_include:
        - '(bridge|transfer) (has )?failed'
        - '(funds|tokens|shares) (are|were) lost'
        - '(send|bridge) (it )?again'
    - id: rate-limited-return
      output_kind: explanation
      expected_tool_calls:
        - 'inboundAvailable\('
      forbidden_tool_calls:
        - 'send\(.*(30102|BNB)'
        - 'scripts/src/write/'
        - 'broadcastTransaction'
      must_include:
        - '(do not|don.t) (send|resend|bridge) (it )?again'
        - '(retry|retried|retryable)'
        - '(inboundAvailable|capacity|rate limit)'
        - '(existing|original|same) packet'
      must_not_include:
        - '500,?000 (xTOPAZ )?(per|a|/) ?day'
        - 'guaranteed'
```
