# Changelog

All notable changes to the Topaz agent skill will be recorded here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Version semantics for this skill:

- **PATCH**: typo/link/address-metadata fixes; non-breaking doc clarifications.
- **MINOR**: new helpers, new workflow coverage, new examples, new eval prompts, additive ABI/address entries — all backward-compatible.
- **MAJOR**: breaking helper APIs, renamed install paths, manifest schema bumps, removal of previously documented workflows.

## [Unreleased]


## [2.2.0] — 2026-05-21

### Added

- **Release-asset uploads.** `release.yml` now attaches `skill.json` and `SKILL.md` as assets on every GitHub Release (with `--clobber` so re-running the workflow on an existing tag replaces them). This makes the following URLs serve the latest tag's content via GitHub auto-redirect:
  - `https://github.com/topazdex/agent-skill/releases/latest/download/skill.json`
  - `https://github.com/topazdex/agent-skill/releases/latest/download/SKILL.md`
  Today the live integration at `topazdex.com` pulls from `main` via Next.js ISR, but these asset URLs are the documented migration path if production ever needs to gate WIP commits out of the site (see `topaz-agent-skill-website-integration.md` in `.claude/`).

### Changed — docs

- **`docs/RELEASING.md` Website-propagation section rewritten** to match the live integration: dynamic Next.js ISR fetch with a 1-hour window. Adds the same-day verification hint ("Redeploy without build cache" on Vercel), a table of what each Topaz endpoint mirrors, and the release-asset URL alternative.
- **`README.md` top-of-file Current-version block** now points readers at `docs/RELEASING.md` and explains that `topazdex.com/agents`, `topazdex.com/skill.md`, and `topazdex.com/skill.json` auto-update on a 1h ISR cycle once a version lands on `main`.
- **`.claude/topaz-agent-skill-website-setup-generic.md` Sync Strategy section refactored** to treat dynamic-ISR-fetch as the recommended pattern (proven by topazdex.com) and demote CI sync / asset pinning / static manual copy to clearly-labeled alternatives. Cross-references the integration doc for the actual handler code.

### Fixed

- **README.md `Current version` line is now kept in sync.** v2.0.0 + v2.1.0 both shipped with `**Current version:** \`1.0.0\`` on the README's third line because the release CLI only bumped `SKILL.md`, `skill.json`, and `CHANGELOG.md` — not the README. Fixed retroactively (README now reads `2.1.0`) and forward: `release.ts` now also rewrites the `**Current version:** \`X.Y.Z\`` marker in lockstep, and `yarn validate` enforces parity between `README.md`, `SKILL.md`, and `skill.json` (any drift becomes an error, not a warning).
- **Release workflow's tag-version assertion now also checks README.md.** `.github/workflows/release.yml` would have published v2.1.0 with a stale README anyway — the verify step only compared the tag against `SKILL.md` and `skill.json`. README is now included, so a future release with drift would fail CI before reaching `gh release create`.

### Removed

- `repository_dispatch` step in `.github/workflows/release.yml`. The Topaz website auto-fetches `SKILL.md` and `skill.json` directly from `raw.githubusercontent.com` on its own schedule, so the webhook handshake we'd built was dead code for this deployment. Documentation updated to match: `docs/RELEASING.md` no longer instructs anyone to wire up `WEBSITE_DISPATCH_TOKEN` / `WEBSITE_REPO`. `docs/website-sync.yml.example` is retained as an optional reference for future deployments that want webhook-driven sync instead of polling.


## [2.1.0] — 2026-05-21

### Fixed — frontend QA (agents-page review)

- **Installer default-path documentation no longer claims `~/.claude/skills/topaz` as an unconditional default.** Both the website-setup spec (`.claude/topaz-agent-skill-website-setup-generic.md`) and the repo README now describe the installer's actual behavior: auto-detect among `~/.claude/skills`, `~/.config/opencode/skills`, `~/.hermes/skills` in alphabetical order; fall back to `~/.local/share/topaz-skill` if none exist. Surfaced from a QA review of `https://topazdex.com/agents` that found the page copy diverged from the runtime behavior.
- **Installer prints the chosen destination + reason before cloning.** `install.sh` now reports `destination: <path>  (reason)` upfront, where the reason is one of `explicit (positional arg)`, `explicit (DEST env)`, `auto-detected <dir>`, or `fallback (no recognized agent skill dir found)`. The post-install "next:" message branches on the chosen path (Claude Code, OpenCode, Hermes, fallback, or custom) so users get a runtime-specific configuration hint instead of a generic one.
- **`scripts/package.json` now pins `packageManager: yarn@4.9.2`** so Corepack-enabled environments install with Yarn 4 instead of falling back to a globally installed Yarn 1 (the QA caught a clean-room install using Yarn 1.22.22 because the field was missing). `yarn install --immutable`, `yarn validate`, `yarn build`, `yarn test` all verified green under the pinned version against the existing `yarn.lock` (metadata v8).

### Fixed

- **Gauge-lookup confusion that caused agents to report "no gauge" for pairs that actually have multiple live gauges.** Surfaced from a real WBNB/BTCB report: that pair has both a v2-volatile gauge (`0x14c93dDb…87eb`) and a v3 ts=50 gauge (`0xa9F8A05F…3737`), but an agent missed both — checking only one pool variant, and (separately) guessing that the Voter exposes a `gaugeForPool(address)` function. It doesn't — Topaz uses `Voter.gauges(address)` (selector `0xb9a09fd5`). The `gaugeForPool` name belongs to Velodrome/Aerodrome forks; calling it on the deployed Topaz Voter reverts with empty data, which is easy to misread as "no gauge". Fixes:
  - `references/gauges.md` now has a top-of-file **Voter API** section listing every deployed function with its exact name, explicitly pushing back on `gaugeForPool` and other Solidly-fork aliases.
  - A new dedicated section explains that a pair can have **up to seven** gauges (v2 stable + v2 volatile + v3 at each tick spacing in {1, 50, 100, 200, 2000}) and shows both the helper-based and manual enumeration patterns.
  - `references/pitfalls.md` Staking entries extended with "multiple gauges per pair" and "use `voter.gauges`, not `gaugeForPool`".
  - `developers/error-cookbook.md` gains two entries: "empty-data revert on a read-only function (selector not deployed)" and "`listGaugesForPair` returned empty when I expected a gauge".

### Added

- `listGaugesForPair(tokenA, tokenB)` in `scripts/src/read/gauges.ts` — enumerates every pool variant (2 v2 + 5 v3) in a single concurrent batch and returns `{ kind, type, pool, gauge, alive }` for each variant with a non-zero gauge. Kept dead gauges in the result (with `alive: false`) instead of silently dropping them, so callers can distinguish "no gauge ever existed" from "gauge was killed".
- `yarn tsx src/cli/stats.ts gauges-for-pair <tokenA> <tokenB>` — CLI subcommand for ad-hoc agent calls.
- Smoke-test guard asserting WBNB/BTCB returns ≥ 2 live gauges. Any contract upgrade that breaks the lookup turns smoke red.
- 6 new unit tests in `src/read/gauges.test.ts` covering: full multi-gauge shape, gauges filtered when `ZeroAddress`, killed gauges retained with `alive: false`, all-empty case, self-lookup rejection, exact call count per variant (no skipping). Total: 109 tests.
- `developers/error-cookbook.md` — canonical mapping from every revert message Topaz can produce (v2 Router, v3 SwapRouter / CLPool, NonfungiblePositionManager, Voter, VotingEscrow, gauges, ERC20, plus generic RPC patterns) to a user-friendly UI string + concrete remediation step. Each entry cites its source surface and a recommended diagnostic. The closing "Diagnostic pattern" section mirrors `evals/07-explain-revert.md` so the eval and the developer-facing doc stay in lockstep. Linked from `SKILL.md` navigation, `developers/DEVELOPERS.md`, and the priority-3 polish TODO in `README.md`.


## [2.0.0] — 2026-05-21

### Changed

- `bestQuote` / `topRoutes` now collapse every candidate (direct v2, direct v3, all 2-hop variants through WBNB/USDT/USDC/BTCB, and mixed v2/v3 paths) into a single `Multicall3.aggregate3` RPC round-trip with `allowFailure: true`. Replaces the prior bounded-concurrency sequential dispatch (~200 RPC calls per quote). Target latency: <500ms on a private RPC. Public API surface unchanged; the `concurrency` option is now a deprecated no-op.
- **v3 swaps that end in WBNB now deliver native BNB by default.** When `useBnb` is true (the default) and the v3 swap's terminal token is WBNB, `buildV3SwapTx` and `buildV3PathSwapTx` emit `SwapRouter.multicall([exactInputSingle|exactInput(recipient=Router, amountOutMinimum=0), unwrapWETH9(amountOutMin, recipient=user)])` rather than a plain exactInputSingle/exactInput. Slippage is enforced at the unwrap boundary. Pass `useBnb: false` to opt out and receive WBNB instead. Matches the long-standing v2 behavior so the two builders are now symmetric. Closes the gap previously called out in `developers/frontend-integration.md`.

### Changed — breaking

- `computeFeeApr` signature changed from `(vol7d, tvlUsd, feeRate)` to `(fees7d, tvlUsd)`. Topaz v3 supports `DynamicSwapFeeModule` and `CustomSwapFeeModule`, so the fee a pool actually charged over a week can differ from its nominal `fee()`. Realized fees (`feesUSD` from the subgraph) capture whatever dynamic adjustments were applied; `vol7d * feeRate` cannot. `poolApr` consumes the new signal and no longer reads `PoolFactory.getFee` or `CLPool.fee` — one fewer RPC per call. Goldens in `src/read/apr.test.ts` updated.

### Added — multicall retry policy

- `aggregate3` now takes an optional `{ retries, retryBackoffMs, exec }` options bag. Default policy: up to 2 attempts total with a 250ms backoff. Reverts inside the batch still surface as `success: false` per call; only outer RPC errors (provider 502, ECONNRESET, etc.) trigger the retry. The `exec` injection point lets unit tests drive the retry path deterministically without mocking ethers Contracts. 7 new tests in `src/lib/multicall.test.ts`. Total: 103 tests.

### Changed — bundler-safe ABI loading

- `scripts/src/lib/abis.ts` no longer uses `fs.readFileSync`. Each ABI is now loaded via a static `import … with { type: "json" }` (TypeScript 5.3+ import-attributes syntax). The module is statically resolvable by any modern bundler (vite, esbuild, webpack, rollup) and works in browser + edge runtimes; no FS access at runtime. ABI values are typed as `JsonFragment[]` (from `ethers`), so `new Interface(ABIS.Router)` and `new Contract(addr, ABIS.Router, provider)` typecheck without casts. The internal `loadAbi(name)` helper is gone — replaced by 21 named imports + a single `extract(json)` shape-normalizer. `developers/DEVELOPERS.md` bundler note updated to reflect the new behavior.

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

[Unreleased]: https://github.com/topazdex/agent-skill/compare/v2.2.0...HEAD
[2.2.0]: https://github.com/topazdex/agent-skill/compare/v2.1.0...v2.2.0
[2.1.0]: https://github.com/topazdex/agent-skill/compare/v2.0.0...v2.1.0
[2.0.0]: https://github.com/topazdex/agent-skill/compare/v1.0.0...v2.0.0
[1.0.0]: https://github.com/topazdex/agent-skill/releases/tag/v1.0.0
