# Eval 04 — Show claimable bribes per pool

**Output kind:** `explanation`

## Prompt

> Show my claimable bribes for veNFT #1234 on Topaz.

## Skill activation

- [ ] `topaz` skill is loaded (trigger phrases "claimable bribes", "veNFT").

## Expected reads

- [ ] `claimableSummary(tokenId)` from `scripts/src/read/claimable.ts` (or the per-component reads it composes).
- [ ] For each pool the user voted: `Voter.gaugeToBribe(gauge)` → bribe contract; `Reward.earned(tokenId, token)` per reward token.
- [ ] Optionally USD-price the reward token via `lib/pricing.ts` for a $-value display.

## Expected writes

- `none`. This is a read.

## Final answer MUST include

- [ ] A per-pool grouping. Each row shows: pool symbol (or address-short), bribe contract address, reward token symbol(s), amount in human units, optional USD value.
- [ ] If no bribes are claimable, say so explicitly ("No claimable bribes — either the veNFT didn't vote last epoch or the pools it voted for have no bribes posted").
- [ ] A reminder that calling `Voter.claimBribes(...)` is a write op (separate explicit request from the user).

## Final answer MUST NOT include

- [ ] An actual `claimBribes(...)` call (this is a status query).
- [ ] A claim of "$X claimable" without checking that `Reward.earned()` actually returned non-zero — never invent numbers.
- [ ] Bribes posted but not yet earned by this veNFT (the eval is about *claimable*, not *exists*).
