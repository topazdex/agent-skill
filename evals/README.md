# Agent Eval Prompts

Markdown checklist of expected agent behavior for the Topaz skill. Reviewed manually for now; the format is structured enough to be re-targeted at an automated harness later (e.g. Hermes recording tool calls and final answers).

Closes priority-1.E in [`../README.md`](../README.md).

## Format

Each file under `evals/` describes one prompt and the expected agent behavior:

- **Prompt** — exact user input (`User:` block).
- **Skill activation** — must `topaz` skill load? Usually yes; some prompts test refusal.
- **Expected reads** — which library functions / CLIs / on-chain calls the agent should make.
- **Expected writes** — `none` for read/quote prompts; specific function for write prompts (but still as **built calldata**, not a broadcast, unless the prompt explicitly authorizes broadcasting).
- **Final answer MUST include** — required elements in the response.
- **Final answer MUST NOT include** — anti-patterns. Catching these is the point of the eval.
- **Output kind** — one of `quote` / `built calldata` / `approval-needed` / `broadcast tx-hash` / `refusal` / `explanation`. Matches the labeling rule in `SKILL.md` Operating principles.

## How to review

For each file in this directory:

1. Open a clean Hermes session.
2. Paste the `Prompt` block verbatim.
3. Tick the boxes by comparing the agent's tool calls + final answer against the `MUST include` / `MUST NOT include` lists.
4. If any `MUST NOT` is hit, that's a regression — file an issue or fix immediately.

## Index

| # | File | Theme | Output kind |
|---|---|---|---|
| 1 | [`01-quote.md`](./01-quote.md) | Quote a swap | quote |
| 2 | [`02-build-swap.md`](./02-build-swap.md) | Build swap calldata, do not broadcast | built calldata |
| 3 | [`03-can-i-vote.md`](./03-can-i-vote.md) | Check whether a veNFT can vote this epoch | explanation |
| 4 | [`04-claimable-bribes.md`](./04-claimable-bribes.md) | Show claimable bribes per pool | explanation |
| 5 | [`05-quote-widget.md`](./05-quote-widget.md) | Build a frontend quote widget | explanation |
| 6 | [`06-deposit-bribe.md`](./06-deposit-bribe.md) | Deposit a USDC bribe on a pool | built calldata + approval-needed |
| 7 | [`07-explain-revert.md`](./07-explain-revert.md) | Diagnose a reverted swap | explanation |
| 8 | [`08-safe-refusals.md`](./08-safe-refusals.md) | Out-of-scope requests (testnet, governance, deploy) | refusal |

## Future automation

When automating, each file's `Expected reads` / `Expected writes` / `MUST NOT include` rows become assertions against the recorded tool-call trace and final-answer text. The `Prompt` block is the only thing replayed verbatim.
