# Eval 03 — Can my veNFT vote this epoch?

**Output kind:** `explanation`

## Prompt

> Can I vote with veNFT #1234 this epoch?

(`#1234` is a placeholder — the prompt is a template. Substitute a real tokenId during review.)

## Skill activation

- [ ] `topaz` skill is loaded (trigger phrase "vote with veNFT").

## Expected reads

- [ ] `Voter.lastVoted(tokenId)` — bigint, unix seconds of last vote.
- [ ] Current `epochStart(now)` from `scripts/src/lib/epoch.ts` (or `Voter.epochStart(now)`).
- [ ] Current `epochVoteStart(now)` (= `epochStart + 1h`) and `epochVoteEnd(now)` (= `epochNext - 1h`).
- [ ] Optionally `VotingEscrow.isApprovedOrOwner(msg.sender, tokenId)` if the user provided an address.

## Expected writes

- `none`.

## Final answer MUST include

A clear **yes/no** with the reason. One of:

- **"Yes"** — `lastVoted < epochStart(now)` AND we are currently inside the vote window (`epochVoteStart ≤ now < epochVoteEnd`). Quote the window end as "Wed HH:MM UTC" in absolute terms.
- **"No, you already voted this epoch."** Quote `lastVoted` formatted as ISO 8601 UTC. Note that the user can `reset()` and `vote()` again only at the next epoch flip (give the absolute timestamp).
- **"Not yet — currently in the distribute window (first hour of the epoch)."** Quote when vote opens.
- **"No, vote window has closed for the epoch (whitelist-only last hour)."** Quote when the next vote window opens.

## Final answer MUST NOT include

- [ ] An actual `Voter.vote(...)` call (this is a status check, not an execution).
- [ ] A guess if `Voter.lastVoted` returned an unexpected value; ask the user to confirm the tokenId instead.
- [ ] A claim that voting is open without verifying both `lastVoted < epochStart` AND `epochVoteStart ≤ now < epochVoteEnd`.
