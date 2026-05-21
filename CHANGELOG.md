# Changelog

All notable changes to the Topaz agent skill will be recorded here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Version semantics for this skill:

- **PATCH**: typo/link/address-metadata fixes; non-breaking doc clarifications.
- **MINOR**: new helpers, new workflow coverage, new examples, new eval prompts, additive ABI/address entries — all backward-compatible.
- **MAJOR**: breaking helper APIs, renamed install paths, manifest schema bumps, removal of previously documented workflows.

## [Unreleased]

### Changed

- `bestQuote` / `topRoutes` now collapse every candidate (direct v2, direct v3, all 2-hop variants through WBNB/USDT/USDC/BTCB, and mixed v2/v3 paths) into a single `Multicall3.aggregate3` RPC round-trip with `allowFailure: true`. Replaces the prior bounded-concurrency sequential dispatch (~200 RPC calls per quote). Target latency: <500ms on a private RPC. Public API surface unchanged; the `concurrency` option is now a deprecated no-op.
- **v3 swaps that end in WBNB now deliver native BNB by default.** When `useBnb` is true (the default) and the v3 swap's terminal token is WBNB, `buildV3SwapTx` and `buildV3PathSwapTx` emit `SwapRouter.multicall([exactInputSingle|exactInput(recipient=Router, amountOutMinimum=0), unwrapWETH9(amountOutMin, recipient=user)])` rather than a plain exactInputSingle/exactInput. Slippage is enforced at the unwrap boundary. Pass `useBnb: false` to opt out and receive WBNB instead. Matches the long-standing v2 behavior so the two builders are now symmetric. Closes the gap previously called out in `developers/frontend-integration.md`.

### Added

- `references/abis/Multicall3.json` and `ABIS.Multicall3` — minimal ABI covering `aggregate3` + `tryAggregate`.
- `scripts/src/lib/multicall.ts` — thin `aggregate3` wrapper + `decodeIfSuccess` helper. Reusable by future read-path batching (gauges, positions, claimable streams).
- `enumerateCandidates` and `decodeCandidates` exports on `quotes.ts` so unit tests can verify plan construction and result-distribution without going through the live RPC.
- `isStale(tx, maxAgeSeconds=30, now?)` exported from `txBuilders` — returns `true` when the underlying quote is older than `maxAgeSeconds` OR the tx's `deadline` has passed. Saves frontends from reinventing the math on top of `quotedAt`/`deadline`. Documented in `developers/frontend-integration.md`.
- 24 new unit tests across `src/read/quotes.test.ts` (multicall3 plan + decode), `src/lib/txBuilders.test.ts` (isStale boundary cases + v3 native-BNB-out multicall/unwrap assertions for both single-hop and path swaps). Total: 95 tests.

## [1.0.0] — 2026-05-21

First public release. Foundational quality work complete; safe to install, pin, and depend on.

### Added

- `SKILL.md` with frontmatter, trigger phrases, navigation map, and four-output broadcast-safety rule (`quote` / `built calldata` / `approval-needed` / `broadcast tx-hash`).
- `references/` topic docs for v2/v3/mixed swapping, v2/v3 liquidity, gauges, ve-locks, voting, rewards, bribes, epoch timing, APR, addresses, tokens, pitfalls, on-chain and subgraph analytics.
- `references/abis/` — JSON ABIs for every contract the skill touches.
- `examples/` walkthroughs for the canonical operator workflows (swap-v2 stable/volatile, swap-v3 single, mixed route, v2 add-liquidity, v3 mint, CL stake, lock+vote, claim-all-rewards, deposit-bribe, query-pool-stats).
- `developers/` builder guides (`DEVELOPERS.md`, `quote-widget.md`, `swap-calldata.md`, `user-positions.md`, `subgraph-recipes.md`, `gauges-and-apr.md`, `frontend-integration.md`).
- `scripts/` CLIs: `stats`, `swap`, `lp`, `lock`, `vote`, `claim`, `bribe`. Backed by typed library functions in `scripts/src/read/` and `scripts/src/write/`.
- `scripts/src/index.ts` public import surface (`ADDR`, `TOKENS`, `ABIS`, `provider`, `bestQuote`, `topRoutes`, `buildBestSwapTx`, `buildV{2,3}SwapTx`, `buildV{2,3}{Route,Path}SwapTx`, `buildFromExecRoute`, claimable/locks/votes/positions/apr/subgraph helpers, epoch math, tick math).
- Wallet-ready calldata builders in `scripts/src/lib/txBuilders.ts` returning `{ to, data, value, expectedOut, amountOutMin, route, quotedAt, deadline, approval? }`.
- Static skill validator (`yarn validate`) covering frontmatter, internal links, author-local paths, external-repo source pointers, secrets/vendored-deps, address-set parity (config ↔ README ↔ references), EIP-55 checksum validity, subgraph URL consistency, brand URL parity, and manifest/version parity.
- Vitest harness + 71 unit tests across `path`, `epoch`, `tickMath`, `tokens`, `txBuilders`, `apr`, `quotes`.
- Live smoke harness (`yarn smoke`): bytecode on every `ADDR`, TOPAZ symbol/decimals, v2/v3 TVL > 0, live `bestQuote` + route-type assertion, full `buildBestSwapTx` shape, live `Voter.gauges` + `isAlive`. Non-zero exit on any FAIL.
- 8 agent eval checklists under `evals/` (quote, build-swap, can-i-vote, claimable-bribes, quote-widget, deposit-bribe, explain-revert, safe-refusals).
- PR checklist (`docs/PR-CHECKLIST.md`).
- Brand surface: typed `BRAND` constant in `scripts/src/config/brand.ts`, catalog page at `references/brand.md`, validator-enforced channel-URL parity.

### Distribution layer (this release)

- `skill.json` machine-readable manifest at repo root, including `consumption_modes` (read_url, clone_repo, copy_to_agent_memory, runtime_specific_install) and `conventional_destinations` for every supported agent runtime.
- Agent-agnostic install: `install.sh` auto-detects which agent skill directory exists on the host (`~/.claude/skills`, `~/.config/opencode/skills`, `~/.hermes/skills`, in alphabetical order) and falls back to `~/.local/share/topaz-skill` if none does. Explicit destination argument or `DEST=` env var always wins.
- `update.sh` at repo root; `tools/check_update.sh` for update polling.
- `LICENSE` (MIT).
- GitHub Actions CI (`.github/workflows/validate.yml`) running `yarn validate`, `yarn build`, `yarn test` on every PR and push to `main`. Smoke runs when `BSC_RPC_URL` secret is configured.
- Validator now enforces `skill.json` ↔ `SKILL.md` version parity, name parity, and basic manifest shape (install/update/verify commands, required fields). Warns if CHANGELOG lacks a section for the current version.

### Release automation

- `yarn release <patch|minor|major|x.y.z> [--apply]` — single command that bumps `SKILL.md` frontmatter, `skill.json`, and `CHANGELOG.md` (promotes `## [Unreleased]` into a new dated `## [X.Y.Z]` section + updates comparison links), runs the full validation suite, and either prints the commit/tag commands or executes them with `--apply`.
- `.github/workflows/release.yml` — on `v*.*.*` tag push (or manual dispatch): re-verifies version parity, re-runs validate/build/test, extracts release notes from CHANGELOG for the tagged version, and creates the GitHub Release.
- The release workflow also fires a `repository_dispatch` event (`topaz-agent-skill-released`) to a configurable website repo so `/skill.md` and `/skill.json` stay in sync automatically. Setup is opt-in via `WEBSITE_DISPATCH_TOKEN` secret and `WEBSITE_REPO` variable; copy-paste-ready website-side workflow lives at `docs/website-sync.yml.example`. Full release flow documented in [`docs/RELEASING.md`](./docs/RELEASING.md).

### Fixed

- `getTickAtSqrtRatio`'s MSB binary search wrote `(r > mask ? 1 : 0) << bit` where `bit ∈ {128, 64, 32}`; JS bitwise shift truncates to 32 bits, so `1 << 128 = 1`. Fixed in `scripts/src/lib/tickMath.ts` (caught by unit tests).

[Unreleased]: https://github.com/topazdex/agent-skill/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/topazdex/agent-skill/releases/tag/v1.0.0
