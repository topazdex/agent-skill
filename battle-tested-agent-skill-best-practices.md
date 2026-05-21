# Best Practices for Building a Battle-Tested Agent Skill

A serious, battle-tested agent skill should absolutely have tests, but not only traditional unit tests. Best practice is to treat a skill like a small SDK, operating manual, and eval suite combined.

For a protocol or developer-facing skill like the Topaz Dex skill, quality should be built around the following layers.

## 1. Separate Knowledge from Execution

A strong skill has clear layers:

- **`SKILL.md`**: agent routing, when to use the skill, high-level map, pitfalls, and safety guidance.
- **`references/`**: protocol facts, contract addresses, ABI notes, epoch logic, risk notes, and detailed explanations.
- **`scripts/` or `sdk/`**: executable helpers the agent can actually run.
- **`examples/`**: known-good workflows and realistic usage examples.
- **`developers/`**: app-builder and integration guidance.
- **`tests/`**: validation of executable logic and factual claims where possible.

The common mistake is putting everything into `SKILL.md`. That makes the skill hard to verify, hard to maintain, and easy for facts to rot.

## 2. Use Multiple Test Types

For agent skills, “tests” should cover more than code compilation.

### A. Static Validation

Static checks confirm that the skill package is structurally valid.

Useful checks:

- `SKILL.md` has valid frontmatter.
- Required fields exist: `name`, `description`, metadata, and body.
- All referenced files actually exist.
- No hardcoded local paths like `/Users/foo/...` or `/home/someone/...`.
- No committed `node_modules`, `.env`, private keys, API keys, or wallet secrets.
- All links and internal references resolve.
- Description is short enough for Hermes validation.

This can be a script such as:

```bash
python scripts/validate_skill.py
```

### B. Unit Tests for Helpers

Any executable code in `scripts/` or `sdk/` should have unit tests.

For a DeFi/protocol skill, unit tests should cover things like:

- Path encoding and decoding.
- Amount parsing.
- Slippage calculations.
- Epoch window math.
- APR calculations.
- Token sorting.
- Calldata builder shape.
- Address normalization.

These should not require live RPC. They should be deterministic and fast.

### C. Integration and Smoke Tests

Smoke tests hit real services, but should stay lightweight.

Useful smoke checks:

- RPC is reachable.
- Important contract addresses have deployed bytecode.
- ERC20 symbols and decimals return expected values.
- Subgraph endpoints return sane data.
- Quote functions return nonzero for known liquid pairs.
- Calldata builders return valid `to`, `data`, `value`, and approval metadata.

For Topaz specifically, a good smoke suite includes:

- BNB Chain RPC block number works.
- v2 and v3 Goldsky subgraphs return top pools.
- `TOPAZ.symbol()` returns `TOPAZ`.
- WBNB → TOPAZ quote returns nonzero.
- `buildBestSwapTx()` produces wallet-ready calldata.

### D. Golden Tests

Golden tests catch accidental behavior changes.

Examples:

- Given fixed token addresses and amount, route selection returns the expected route class.
- Given a fixed epoch timestamp, voting-window logic returns the expected state.
- Given a sample pool/subgraph payload, APR logic returns the expected number within tolerance.
- Given known path tokens and tick spacings, encoded path equals expected hex.

Golden tests are especially useful for agent skills because they freeze protocol-specific assumptions.

### E. Agent Eval Tests

This is the part most people skip.

A mature skill should include a suite of prompts and expected behaviors.

Example:

```text
Prompt: "Quote 0.5 WBNB to TOPAZ"
Expected:
- Uses Topaz skill.
- Checks WBNB/TOPAZ addresses.
- Runs quote helper.
- Does not broadcast transaction.
- Reports route, expected output, and slippage caveat.
```

Other useful eval prompts:

- “Build a swap transaction but don’t send it.”
- “Can I vote this veNFT this epoch?”
- “Show my claimable bribes.”
- “Build a frontend quote widget.”
- “Deposit a bribe.”
- “Explain why this swap reverted.”

You do not need perfect automated LLM grading at first. Even a markdown checklist with expected tool calls and expected final-answer shape is useful. Later, automate with a test harness that runs Hermes against each prompt and inspects outputs and tool calls.

## 3. Every Factual Claim Should Have a Source of Truth

For protocol skills, accuracy comes from not trusting prose alone.

Best practices:

- Contract addresses live in one canonical file, for example `scripts/src/config/addresses.ts`.
- Token metadata lives in one canonical file.
- ABIs live in `references/abis/`.
- Docs reference canonical files instead of duplicating addresses everywhere.
- Tests compare docs/examples against config where practical.
- Smoke tests verify live chain code exists at every important address.

For example, if `README.md` says the router is `0x...`, a test should assert that it matches `ADDR.Router`.

## 4. Make Dangerous Actions Impossible by Default

A good skill should prevent the agent from accidentally doing damage.

For DeFi skills:

- Quote/read helpers should be the default path.
- Transaction builders should return calldata only.
- Broadcast helpers should require explicit `PRIVATE_KEY` configuration.
- Docs should say “do not broadcast unless the user explicitly asks.”
- Approvals should be exact-amount by default.
- Any function that can move funds should have a dry-run or simulation path.
- Final answers should clearly distinguish:
  - quote
  - built calldata
  - approval needed
  - broadcasted transaction hash

The safest default skill helps build and simulate transactions, not blindly execute them.

## 5. Include a Regression Checklist for Humans

Before merging a serious skill PR, use a checklist like this:

- [ ] `SKILL.md` validates.
- [ ] No secrets committed.
- [ ] No vendored dependencies.
- [ ] Scripts install cleanly from lockfile.
- [ ] Typecheck/build passes.
- [ ] Unit tests pass.
- [ ] Smoke tests pass against live RPC/subgraphs.
- [ ] Agent eval prompts reviewed.
- [ ] All addresses verified on-chain.
- [ ] All docs references resolve.
- [ ] Dangerous actions require explicit user intent.
- [ ] Fresh install into `~/.hermes/skills/...` works.
- [ ] Skill loads via `skill_view`.
- [ ] A new Hermes session can use it end-to-end.

## 6. How Do We Know It Is Fully Accurate?

You never know forever. Protocols change, RPCs fail, subgraphs drift, contracts get upgraded, and docs become stale.

The real standard is not “perfect forever.” The real standard is:

- **Traceability**: every important claim points to code, chain, ABI, docs, or a live endpoint.
- **Reproducibility**: another machine can install and run the same smoke tests.
- **Coverage**: common workflows and edge cases are represented in tests and evals.
- **Freshness checks**: live smoke tests catch stale addresses and broken endpoints.
- **Fail-safe behavior**: if unsure, the skill tells the agent to verify rather than guess.
- **Change discipline**: whenever the agent discovers a mistake, patch the skill immediately.

## Recommended Next Steps for the Topaz Skill

For Topaz specifically, I would add a formal test suite with the following pieces.

### Static Skill Validation

Add:

```text
scripts/validate_skill.py
```

It should check:

- frontmatter validity
- required files
- no secrets
- no hardcoded author-local paths
- no vendored dependencies
- internal references resolve

### TypeScript Unit Tests

Add tests for:

- slippage math
- path encoding
- epoch timing
- calldata builder outputs
- token/address normalization
- route object shape

### Live Smoke Tests

Add smoke tests for:

- BNB Chain RPC health
- router/factory contract bytecode existence
- TOPAZ token metadata
- WBNB/TOPAZ quote
- v2 and v3 subgraph health
- `buildBestSwapTx()` output shape

### Agent Eval Prompts

Add eval cases for:

- quote flow
- build swap calldata flow
- LP position lookup
- gauge/APR explanation
- bribe/voting flow
- safe refusal or dry-run behavior for risky requests

## Bottom Line

A good agent skill is not just a markdown prompt. It is closer to a small operational product.

The strongest skills have:

- clean structure
- executable helpers
- canonical sources of truth
- static validation
- unit tests
- live smoke tests
- golden regression tests
- agent eval prompts
- clear safety boundaries
- a maintenance loop for fixing stale assumptions

That is what turns a skill from “useful instructions” into a reliable operating layer.
