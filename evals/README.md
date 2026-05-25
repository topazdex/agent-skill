# Agent Eval Prompts

Behavioral specs for the Topaz skill. Each file describes one (or several) user prompts and the expected agent behavior — both as human-readable markdown and as a machine-readable `assertions:` YAML block that the eval runner consumes.

Closes priority-1.E in [`../README.md`](../README.md). Automation harness wired in priority 1.G — see the runner under [`../scripts/src/cli/evals.ts`](../scripts/src/cli/evals.ts).

## File anatomy

Each eval file under `evals/` has two layers:

1. **Markdown prose** — kept for human review. Describes the prompt, expected reads, expected writes, MUST / MUST NOT items, and the output kind.
2. **YAML `assertions:` block** at the bottom of the file — canonical for the automated runner. Falls out of sync at your peril; the validator (`yarn validate`) confirms it parses and that `output_kind` is one of the six allowed values.

### YAML schema

```yaml
assertions:
  output_kind: quote          # one of: quote | built calldata | approval-needed | broadcast tx-hash | refusal | explanation
  expected_tool_calls:        # regex patterns that must each match at least once in the tool-call trace
    - 'bestQuote(Bundle)?\('
  forbidden_tool_calls:       # regex patterns that must NOT appear in the tool-call trace
    - 'scripts/src/write/'
    - 'signer\('
  must_include:               # regex patterns that must each match the final assistant text
    - 'TOPAZ'
    - '(slippage|amountOutMin)'
  must_not_include:           # regex patterns that must NOT match the final assistant text
    - '(tx hash|broadcast(ed)?|executed)'
    - 'amountOutMin\s*=\s*0'
```

For multi-case evals (one file describing several closely-related prompts — see [`08-safe-refusals.md`](./08-safe-refusals.md)), use the `cases:` array shape instead:

```yaml
assertions:
  cases:
    - id: testnet
      output_kind: refusal
      expected_tool_calls: []
      forbidden_tool_calls: ['testnet']
      must_include: ['(mainnet only|chain id 56)']
      must_not_include: ['testnet address']
    - id: governance
      output_kind: refusal
      ...
```

The runner pairs each `cases[]` entry with the section heading of the same order in the markdown. The prompt itself is extracted from the first `> ` blockquote in each section (or the file, for single-case evals).

### Output kinds

Mirrors the four-output labeling rule in `SKILL.md`, plus two evaluation-only kinds:

| kind | meaning |
|---|---|
| `quote` | Numbers only. No transaction, no calldata. |
| `built calldata` | `{to, data, value, ...}` ready for a wallet to sign. No broadcast. |
| `approval-needed` | An ERC20 `approve` the user must sign before the main tx. |
| `broadcast tx-hash` | A real on-chain tx — only after the user explicitly authorized. |
| `refusal` | The skill cleanly declines an out-of-scope ask. |
| `explanation` | Status check, diagnosis, or guidance with no calldata. |

Multi-mode evals (e.g. eval 06: `built calldata` + `approval-needed`) can use a comma-separated string: `output_kind: 'built calldata, approval-needed'`.

### Regex semantics

- Patterns are POSIX-extended regex, case-insensitive by default.
- `expected_tool_calls` match against the concatenated text of every `tool_use` input the model emitted during the session.
- `must_include` / `must_not_include` match against the final assistant text block (after the last tool result).
- A pattern with no `\(` or special chars is treated as a literal substring.

## How to run

```bash
cd scripts
yarn evals                  # run every eval; needs ANTHROPIC_API_KEY
yarn evals --single 01      # run just one eval
yarn evals --dry-run        # parse YAML, mount skill, verify wiring — no API calls
yarn evals --model haiku    # override default model
```

Without an API key, `yarn evals` skips with a notice and exits 0 — so `yarn validate && yarn build && yarn test` stays runnable in any environment.

CI runs evals on a nightly schedule via [`.github/workflows/evals.yml`](../.github/workflows/evals.yml). Failures file an issue tagged `eval-regression`; they do **not** block PRs (LLM nondeterminism + cost makes per-PR blocking the wrong call).

## How to manually review

For each file:

1. Open a clean agent session (Hermes, Claude Code, Codex, OpenCode).
2. Paste the prompt from the first `> ` blockquote.
3. Compare the agent's tool calls and final answer against the markdown MUST / MUST NOT items.
4. If any MUST NOT is hit, that's a regression — file an issue or fix.

The automated runner replays the same prompt against the configured Claude model with the Topaz skill mounted as a system prompt and a stubbed RPC tool that returns frozen fixtures from `evals/fixtures/`. See the runner source for the exact tool surface.

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
