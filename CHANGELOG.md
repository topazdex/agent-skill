# Changelog

All notable changes to the Topaz agent skill will be recorded here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Version semantics for this skill:

- **PATCH**: typo/link/address-metadata fixes; non-breaking doc clarifications.
- **MINOR**: new helpers, new workflow coverage, new examples, new eval prompts, additive ABI/address entries — all backward-compatible.
- **MAJOR**: breaking helper APIs, renamed install paths, manifest schema bumps, removal of previously documented workflows.

## [Unreleased]

### Fixed

- Corrected user-position source-of-truth docs: the deployed v2 subgraph now indexes per-user LP positions via `LiquidityPosition` and should be used for v2 discovery; the latest v3 position-indexing work is not deployed to the current `prod` endpoint yet, so v3 user CL positions should still be discovered on-chain and joined to subgraph pool analytics for context.


## [2.9.0] — 2026-06-30

### Added

- **Topaz Relays — managed veTOPAZ (mveTOPAZ) reward automation.** New
  `references/relays.md` and `examples/deposit-into-relay.md` document the two live
  BNB-Mainnet relays — **veTOPAZ Maxi** (`AutoCompounder`, compounds all rewards into
  TOPAZ in-place, no claim) and **Reward & Distribute** (`CompoundConverter`, also
  streams USDT to depositors) — and the depositor flow through Topaz core
  (`Voter.depositManaged` / `withdrawManaged`, `FreeManagedReward.getReward`). Ships
  executable, no-broadcast calldata builders (`buildDepositManagedTx`,
  `buildWithdrawManagedTx`, `buildRelayClaimTx` in `scripts/src/lib/relayBuilders.ts`),
  a `RELAYS` registry (`scripts/src/config/relays.ts`), live-state reads
  (`scripts/src/read/relays.ts`), broadcast wrappers (`scripts/src/write/relay.ts`), a
  `relay` CLI (`list` / `deposit` / `withdraw` / `claim`), a minimal `Relay` ABI, unit
  tests, and eval `09-deposit-into-relay.md`. The relay infrastructure and the two
  relay instances are added to the canonical address set
  (`scripts/src/config/addresses.ts`, `README.md`, `references/addresses.md`), and
  `SKILL.md` gains a mental-model entry, address quick-ref rows, a nav row, trigger
  phrases, and an operating principle. Verified against the `topaz-relays` deploy
  artifacts and the `topaz-agent-service` relay integration.
- **`PositionBurnHelper`** (`0x8EA90c6711bcA4203C689bF0dd6f08E43377e3C5`) — the v3
  periphery contract that bulk-burns the caller's empty/dead CL position NFTs — added
  to the address tables.

### Changed

- **Subgraphs moved to the tag-based `…/prod/gn` endpoints.** The v2 and v3 Goldsky
  URLs now use the stable `prod` tag instead of pinned `v0.0.x` versions across
  `SKILL.md`, `README.md`, `references/analytics-subgraph.md`,
  `developers/DEVELOPERS.md`, `developers/subgraph-recipes.md`, `scripts/.env.example`,
  and `scripts/src/lib/subgraph.ts`. The `prod` tag always resolves to the latest
  deploy, and the v3 `prod` build **fixes a bug that inflated `volumeUSD` / `feesUSD`**
  in the old pinned `v0.0.2`.
- **Subgraph schema docs refreshed.** The deployed v2 subgraph now indexes the gauge +
  staking layer and per-user LP balances via `LiquidityPosition`. The v3 position
  indexing work exists but is not deployed to the current `prod` endpoint yet, so v3
  user CL position discovery remains on-chain for now. `references/analytics-subgraph.md`
  and `references/analytics-onchain.md` were corrected; votes, bribes, and ve-locks
  remain on-chain only.


## [2.8.1] — 2026-06-18

### Changed

- **Brand asset catalog refreshed for the 2026 rebrand.** `references/brand.md`
  drops the hardcoded byte-size annotations from the asset table (they drift every
  time the artwork changes) and updates the "Twitter card" wording to "social card"
  for the X rebrand. Asset URLs, filenames, and the `BRAND.assets` keys are
  unchanged — the rebranded logos ship at the same
  `raw.githubusercontent.com/topazdex/assets/main/*` paths, so downstream embeds
  keep working with no edits.


## [2.8.0] — 2026-06-13

### Added

- **Topaz ID Connect developer guidance.** New `developers/topaz-id-connect.md`
  covering the `@topazdex/id-connect` NPM package (v0.2.0) — the Topaz ID Wallet
  Connector / account-identity layer. Documents all four integration styles
  (minimal `TopazIdProvider` + `useTopazIdLogin`, the RainbowKit `topazIdWallet()`
  picker, the plain-wagmi `topazIdConnector()`, and the `/privy` cross-app path),
  the public profile API (`GET https://id.topazdex.com/api/v1/profile/{wallet}`)
  with the full `TopazIdProfile` shape and the `displayNameForWallet` /
  `avatarForWallet` / `fetchTopazIdProfile` helpers, consent-flow signing via
  plain wagmi, and the package's export + peer-dependency matrix. Verified
  against the published package types and the `topaz-id-connect-demo` repo.
- **Topaz ID linked across the skill front doors.** `SKILL.md` (Which-path
  bullet, Where-to-look-next rows, and two agent-facing rules: recommend the
  Topaz-native connector over generic wallet wiring, and keep Topaz ID vs DEX
  responsibilities separate), `developers/DEVELOPERS.md` (Topaz ID integration
  section + integration-surface bullet), `README.md` (Links, Entry points, and
  Developer guides), and `skill.json` (a `topaz_id` metadata block,
  `developer_id_connect` entry point, and `topaz-id` / `id-connect` /
  `wallet-login` / `identity` tags) now point builders at the account layer.


## [2.7.0] — 2026-05-28

### Added

- **Full Stats API v2 coverage.** `scripts/src/lib/statsApi.ts` and the `stats`
  CLI now wrap every published endpoint: protocol history/daily time-series
  (`/protocol/history`, `/protocol/daily`), long-horizon pool daily candles
  (`/pools/{addr}/daily`), per-gauge detail/history/rewards
  (`/gauges/{addr}`, `/gauges/{addr}/rewards`), token prices (`/tokens`,
  `/tokens/{addr}`), epoch summaries/detail (`/epochs`, `/epochs/{start}`),
  bribe markets with `$/vote` (`/markets/bribes`), and foundation bribe totals
  (`/bribes/totals`). New CLI commands: `protocol-history`, `protocol-daily`,
  `pool-daily`, `api-gauge`, `gauge-rewards`, `bribe-markets`, `bribe-totals`,
  `tokens`, `token`, `epochs`, `epoch`.
- **Denormalized gauge APR on pools.** `/pools` now carries `gaugeApr`; the
  client exposes `sort: "gaugeApr"` plus `token`, `minTvl`, and `incentivized`
  filters. `/pools/{addr}` now returns the pool's `gauge` and `gaugeHistory`.
- **veTOPAZ foundation lock details.** `/ve` exposes a nested `foundation` block
  with per-NFT `locks` (`lockedAmount`, `votingPower`, `lockEnd`, `isPermanent`);
  legacy top-level `foundation*` fields are marked deprecated.

### Changed

- **API-first guidance across the skill.** SKILL.md, `references/analytics-*.md`,
  `references/apr-calculations.md`, `references/gauges.md`, `references/tokens.md`,
  `references/voting.md`, `references/epoch-timing.md`, `references/ve-locks.md`,
  `references/bribes-deposit.md`, `developers/DEVELOPERS.md`,
  `developers/gauges-and-apr.md`, and `examples/query-pool-stats.md` now point at
  the Stats API as the primary source for any data it serves, reserving subgraph
  and on-chain reads for ad-hoc filtering, history beyond the API window,
  per-user state, and block-accurate/transaction needs.
- **OpenAPI spec cited as the source of truth.** `references/analytics-stats-api.md`
  now references the auto-updating OpenAPI 3.1 spec
  (`/api/stats/openapi.json`) and Swagger UI (`/api/stats/docs`) as canonical,
  replacing the internal schema pointer.
- **Subgraph version bump** to Topaz v2 `v0.0.4` / v3 `v0.0.2` across all docs,
  config, and `.env.example`.


## [2.6.1] — 2026-05-27

### Fixed

- **`votingApr()` hardcoded 18 decimals for all bribe/fee reward tokens.** Tokens
  with non-18 decimals (DOGE = 8, BLUE = 9) produced wildly incorrect USD values.
  Now reads actual decimals via `getDecimals()` for each reward token.
- **`votingApr()` did not divide by TOPAZ price**, making the returned number
  incomparable with emission and fee APRs. Now computes
  `(usdPerVe * 52) / topazPriceUsd * 100` — a true percentage APR relative to
  the cost of 1 veTOPAZ at max lock.
- **Eval fixture `03-can-i-vote` had incorrect epoch timestamps.** `epochStart`
  landed on a Tuesday instead of Thursday; `now` was Friday but the comment said
  Monday. All timestamps recomputed to be self-consistent with the epoch math.
- **`references/apr-calculations.md` section 3** updated to document the corrected
  voting APR formula (with decimals and TOPAZ price denominator).


## [2.6.0] — 2026-05-26

### Changed

- **v3 gauge emission APR now uses the position-specific preset formula**, matching
  the production frontend and stats API snapshot runner. Previously computed a
  pool-wide average (`emissions / stakedTvlUsd`); now simulates a $1,000 deposit
  at a preset spread (±3% volatile, ±0.1% stable, ±0.05% for tickSpacing=1) and
  computes `(posLiq / stakedLiq) * rewardRate * SECONDS_PER_YEAR * topazPrice /
  posValueUsd * 100` with dilution. v2 pools are unchanged.
- **`poolApr()` and `positionApr()` now check `gauge.periodFinish()`** and return
  0 emission APR when the reward period has expired, matching the frontend's
  `isRewardPeriodActive` guard.

### Added

- **`positionApr(tokenId)`** — computes emission and fee APR for an individual
  staked CL position using its actual liquidity and tick range (no dilution).
- **New pure helpers**: `computePositionEmissionApr`, `computeV3PresetApr`,
  `isRewardPeriodActive`, `isStablePair`, `getPresetSpreadPercent`,
  `getTicksForSpread`, `deriveTokenPricesUsd`.
- **26 new unit tests** covering all new pure functions with frozen golden values.

### Fixed

- `references/apr-calculations.md` listed phantom function signatures
  (`gaugeEmissionApr`, `lpFeeApr`) that never existed in code — replaced with
  actual exports.


## [2.5.2] — 2026-05-26

### Fixed

- **`listUserLocks` called non-existent `tokenOfOwnerByIndex` on VotingEscrow.** The Topaz VotingEscrow contract exposes `ownerToNFTokenIdList(address, uint256)`, not the ERC721Enumerable `tokenOfOwnerByIndex` name. Calling the old name reverted at runtime. Fixed in `scripts/src/read/locks.ts` and corrected the documented signature in `references/ve-locks.md` and `references/analytics-onchain.md`.


## [2.5.0] — 2026-05-25

### Added

- **Stats API integration.** New typed TypeScript client
  (`scripts/src/lib/statsApi.ts`) with wrappers for all 15 public
  `/api/stats/*` endpoints: `fetchProtocol`, `fetchPools`, `fetchPool`,
  `fetchGauges`, `fetchVe`, `fetchFoundation`, `fetchFoundationVotes`,
  `fetchFoundationBribes`, `fetchFoundationKpis`, `fetchVotes`,
  `fetchBribes`, `fetchDynamicFees`, `fetchLiveDynamicFees`, `fetchHealth`,
  `fetchConfig`. Full response types, `StatsApiRequestError` for error
  handling, env-overridable base URL via `TOPAZ_STATS_API_URL`.
- **10 new CLI commands** in `stats.ts`: `protocol`, `api-pools`,
  `api-gauges`, `foundation`, `foundation-votes`, `foundation-bribes`,
  `foundation-kpis`, `dynamic-fees`, `health`. Foundation data (wallet,
  veNFT IDs, vote allocations, bribe deposits, KPI effectiveness) is
  surfaced for the first time.
- **Stats API health check** added to `yarn smoke`.
- **New reference doc** `references/analytics-stats-api.md` — decision
  table for when to prefer Stats API vs subgraph vs on-chain, endpoint
  catalog with curl + TypeScript examples, foundation-only data callout.
- **SKILL.md**: Stats API base URL, navigation table entry, and operating
  principle for preferring the Stats API for aggregated reads and
  foundation data.
- **Cross-references** added to `analytics-onchain.md`,
  `analytics-subgraph.md`, `examples/query-pool-stats.md`,
  `developers/gauges-and-apr.md`, `developers/subgraph-recipes.md`, and
  `references/bribes-deposit.md`.


## [2.4.0] — 2026-05-22

### Changed

- **Route search is now v2-only or v3-only — never mixed.** `bestQuote`,
  `bestQuoteBundle`, `bestV2Quote`, `bestV3Quote`, and `topRoutes` enumerate v2
  (volatile + stable, up to 3 hops) and v3 (every tick-spacing combination, up
  to 3 hops) **separately**. The two stacks are never combined in a single
  route, because Topaz has no atomic mixed-route executor — a "best mixed"
  quote could not be delivered as a single wallet signature. `MixedRouteQuoterV1`
  is still callable directly via `quoteMixed(pathBytes, amountIn)` for
  analytics or off-protocol pricing.
- **`HOP_TOKENS` expanded** to `USDT, WBNB, BTCB, ETH, TOPAZ, USDC` (was
  `WBNB, USDT, USDC, BTCB`). ETH and TOPAZ catch routes like
  `SOL → ETH → USDT → X` and `X → TOPAZ → WBNB → Y` that the previous list
  missed.
- **3-hop coverage on both stacks.** Beyond direct and 2-hop, the enumerator
  now searches every distinct 3-hop chain through two intermediaries (e.g.
  `USDC → USDT → BNB → SOL` for v2, same path at any tick-spacing combination
  for v3). Bounded at 3 because (a) candidate counts explode beyond that and
  (b) each hop pays another swap fee.

### Added

- **`bestQuoteBundle(tokenIn, tokenOut, amountIn)` → `{ v2, v3, best }`.**
  Single-call helper that returns the best executable v2 route and the best
  executable v3 route side by side, plus the overall winner. UI can show
  "basic" and "concentrated" without re-quoting.
- **`bestV2Quote` / `bestV3Quote`.** One-stack helpers, returning `BestRoute |
  null`. Re-introduced (last removed in 2.0.0 alongside `bestMixedQuote`).
- **`detectPoolInventory(tokens)`.** Probes `PoolFactory.getPool` and
  `CLFactory.getPool` for every distinct edge in one `Multicall3.aggregate3`,
  so the quoter sweep only sees routes through real pools. Cuts the candidate
  count by an order of magnitude on typical pairs.
- **`aggregate3Chunked(calls, chunkSize?)`.** Splits large multicall batches
  across parallel round-trips so the v3 3-hop layer fits inside the eth_call
  gas cap.
- **`MAX_ROUTE_HOPS = 3` constant** and a `maxHops?` option on
  `BestQuoteOptions` so callers can dial the search down for snappier UIs.
- **Broken-pool filter.** Route search now drops candidates with > 50%
  price impact (computed from subgraph USD spot prices for tokenIn /
  tokenOut, fetched in parallel with the inventory probe). Subgraph prices
  come from `Token.derivedETH × Bundle.ethPriceUSD` (v3 subgraph first, v2
  fallback). When a token has no subgraph price, the filter falls back to
  a relative-to-best guard — anything under 50% of the best route's output
  on the same stack is dropped. Tunable via `maxPriceImpactPct` and
  `minRelativeToBest` on `BestQuoteOptions`; set
  `skipPriceFilter: true` to disable. New `BestRoute.priceImpactPct?`
  field exposes the impact for UI display. New `tokenPricesUSD(addresses)`
  helper in `scripts/src/read/subgraphQueries.ts`.
- **`yarn tsx src/cli/swap.ts quote|best`** now prints both the best v2 and
  best v3 route side by side, with price impact %. `best --execute --prefer v2|v3`
  picks the preferred stack to broadcast.

### Deprecated

- **`allowMixed`** on `BestQuoteOptions` is a no-op. The default search never
  emits mixed routes regardless of the flag.


## [2.3.1] — 2026-05-22

### Fixed

- **Token registry mislabels — agents were getting wrong prices.** Two addresses in `scripts/src/config/tokens.ts` and `references/tokens.md` were attached to the wrong symbols, which caused agents to quote against pools they thought were one asset but were actually another (concretely: "swap USDT → SOL" was failing because SOL wasn't in the registry, and the actual SOL contract was sitting under the `WETH` key with the wrong name):
  - `0x570A5D26f7765Ecb712C0924E4De545B89fD43dF` — was labeled `WETH (alternate pegged)`, is actually **SOL** (Binance-Peg SOLANA). Verified against Topaz v3 subgraph + BscScan.
  - `0x8d0D000Ee44948FC98c9B98A4FA4921476f08B0d` — was labeled `EGB`, is actually **USD1** (World Liberty Financial USD).
- Regression tests added: `findToken("SOL")` returns the right address, `findToken("WETH")`/`findToken("EGB")` return `undefined` so the stale names cannot silently resurface, and the SOL/USD1 entries assert their on-chain `name` fields.

### Added

- **Full token registry rebuild.** Every previously-unlabeled address in the whitelist now has a verified `symbol`, `name`, and `decimals` pulled from the Topaz v2/v3 Goldsky subgraphs and confirmed on-chain. New canonical entries: `USD1`, `FDUSD`, `SOL`, `XRP`, `DOGE`, `BLUE`, `gBLUE`, `BOOK`, `BUD`, `Broccoli`, `CaptainBNB`, `ClipX`, `EARN`, `$RISE`, `Trusty`, `bibi`, `NianNian`. Two **non-18-decimal tokens** flagged: `DOGE` (8) and `BLUE` (9). Hardcoding `18` will produce wrong amounts for these — always use `getDecimals` (`scripts/src/lib/erc20.ts`) or the registry.
- **`BNB` symbol alias.** `findToken("BNB")` now resolves to `WBNB` so callers can write "swap BNB for X" naturally; the router's `swapExactETHForTokens` / `unwrapWETH9` helpers handle the wrap/unwrap. Implemented via a new `aliases` field on `TokenMeta`; `$RISE` ↔ `RISE` uses the same mechanism.
- **`references/tokens.md` refresh recipe.** New "Refreshing this list from the subgraph" section with the exact GraphQL query to re-derive symbol/name/decimals for any new whitelist entry — so the next maintainer can keep the registry honest without guessing.

### Changed

- **`scripts/src/cli/swap.ts` USAGE string** now lists the full set of built-in symbols instead of the stale 8-token line (which still mentioned `EGB`). Points at `references/tokens.md` for the canonical list.


## [2.3.0] — 2026-05-22

### Added

- **`buildBribeDepositTx({ pool, token, amount, payer? })`** in `scripts/src/lib/actionBuilders.ts` — wallet-ready bribe calldata builder. Resolves gauge via `Voter.gauges`, asserts `isAlive`, looks up `BribeVotingReward` via `gaugeToBribe`, checks the token is either already a reward token of the bribe contract or `Voter.isWhitelistedToken == true`, then returns `{ approval?, deposit, gauge, bribe, amount, epochStart, epochVoteEnd, builtAt }`. Approval is omitted when an optional `payer` already has enough `allowance(token, payer, bribe)`. Re-exported from `scripts/src/index.ts` and `scripts/package.json` (`./action-builders` entry point). 7 new tests in `src/lib/actionBuilders.test.ts` cover happy path, allowance skip, already-registered reward token, missing gauge, killed gauge, non-whitelisted token, and zero amount. Total: 116 tests.

### Fixed

- **Bribe / voting timing docs corrected to Wednesday 23:00 UTC.** `references/bribes-deposit.md`, `references/epoch-timing.md`, `references/pitfalls.md`, and `examples/deposit-bribe.md` previously said the normal voting window closes at "Thu 23:00 UTC". The actual cutoff is **Wednesday 23:00 UTC** — `scripts/src/lib/epoch.ts` defines `epochVoteEnd = epochNext - HOUR`, and since the epoch flip is Thursday 00:00 UTC the final hour (Wed 23:00 → Thu 00:00) is the distribute / whitelist-only window where normal veNFT voting is already closed. Bribes deposited during that final hour still record against the current epoch, but no new voters can react to them; docs now disambiguate "normal voting closes Wed 23:00" from "bribe still recorded in epoch E".
- **`Gauge.getReward(address)` is gated, not permissionless** (`references/pitfalls.md`). `Gauge.sol` reverts with `NotAuthorized` unless `msg.sender == _account || msg.sender == voter`. Old doc said "permissionless — anyone can call it" — factual error.
- **`CLGauge.getReward(uint256)` must be called by the original depositor** (`references/pitfalls.md`). The contract checks `_stakes[msg.sender].contains(tokenId)`. The NFT's actual owner is the gauge contract itself; only the depositor is tracked in `_stakes`. Wording corrected from "position owner".
- **`Voter.claimRewards(gauges)` does not take a tokenId** (`references/pitfalls.md`, `references/rewards-claiming.md`). It claims v2 gauge emissions for `msg.sender` with no veNFT check, separate from `claimBribes`/`claimFees` which require `isApprovedOrOwner(msg.sender, tokenId)`. Old text conflated the three.
- **`claimFees` / `claimBribes` are called on the Voter** (`references/pitfalls.md`). Old text claimed they were called "on the contracts (not Voter)" but the very next line showed `Voter.claimFees(...)` — the actual ABI. Corrected.
- **`decreaseLiquidity` slippage hole** (`scripts/src/write/liquidityV3.ts`). Previously broadcast with `amount0Min = 0, amount1Min = 0` — caller's slippage was silently dropped. Now `staticCall`s `decreaseLiquidity` first to get the expected `(amount0, amount1)`, then applies `slip(amount, slippageBps)` to each. Matches `mintPosition` / `increaseLiquidity`.
- **`quoteHuman` precision loss for large bigints** (`scripts/src/read/quotes.ts`). Replaced `Number(best.amountOut) / 10**decOut` with `formatUnits(best.amountOut, decOut)`. Floats lose precision above 2^53; `formatUnits` is bigint-safe.
- **Stale helper names removed from docs.** `references/swapping-v2.md`, `references/swapping-v3.md`, `references/swapping-mixed.md`, `references/rewards-claiming.md`, and `examples/swap-v3-single-hop.md` referenced helpers that no longer exist (`findBestCLPool`, `bestV2Quote`, `bestV2MultiHopQuote`, `bestMixedQuote`, `claimableBribes`, `claimableGaugeRewards`, `myStakedGauges`, `myVotedGauges`, `tokensForGauges`, `activeBribeTokens`). All replaced with currently-exported names (`bestQuote`, `topRoutes`, `claimableSummary`, `v2StakedGaugesForAccount`, `v3StakedGaugesForAccount`, `getVote`).
- **Outdated `swapV2` signature in `references/swapping-v2.md`.** Doc table claimed `swapV2({ routes, amountIn, slippageBps, deadlineSec })`; actual `SwapV2Args` is `{ tokenIn, tokenOut, amountIn, stable, slippageBps?, recipient?, deadline?, useBnb? }`. Corrected. Doc table also now distinguishes "build calldata" (`buildV2SwapTx` / `buildBestSwapTx`) from "broadcast" (`swapV2`).
- **`claimFees` / `claimBribes` builder signatures.** Doc table in `references/rewards-claiming.md` now shows `claimFees({ tokenId, pools })` and `claimBribes({ tokenId, pools })`, matching `scripts/src/write/claim.ts` — the previous `{ tokenId, gauges }` entries did not match the deployed signatures.

### Changed

- **`SKILL.md` operating principles** now point agents at both `scripts/src/lib/txBuilders.ts` and `scripts/src/lib/actionBuilders.ts` for wallet-ready calldata, with `references/abis/*.json` as the fallback for write flows not yet covered by a builder.
- **Slippage rule in `SKILL.md`** sharpened. `sqrtPriceLimitX96 = 0` is acceptable for normal v3 swaps when `amountOutMinimum` enforces slippage; only set a nonzero price limit for advanced price-bound trades. `amount{0,1}Min = 0` only forbidden for legs whose expected amount is nonzero.
- **`developers/quote-widget.md`** now passes `allowMixed: false` to `bestQuote` for executable widgets and adds a Staleness section pointing at `buildBestSwapTx` + `quotedAt` for the refresh-before-sign pattern.
- **`evals/06-deposit-bribe.md`** updated to mention `buildBribeDepositTx` as the preferred path over manual ABI encoding.
- **`README.md` builder section** now lists `buildBribeDepositTx` alongside the swap builders, describes `bestQuote` as a single `Multicall3.aggregate3` (the v2.0.0 architecture, replacing the older "bounded-concurrency default 10" framing that was still in the file), and bumps the test count to 116.
- **`skill.json` install notes** rewritten to match the actual installer behavior (auto-detect among supported skill dirs, fall back to `~/.local/share/topaz-skill`), aligning with the v2.1.0 install-flow fixes.


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

[Unreleased]: https://github.com/topazdex/agent-skill/compare/v2.9.0...HEAD
[2.9.0]: https://github.com/topazdex/agent-skill/compare/v2.8.1...v2.9.0
[2.8.1]: https://github.com/topazdex/agent-skill/compare/v2.8.0...v2.8.1
[2.8.0]: https://github.com/topazdex/agent-skill/compare/v2.7.0...v2.8.0
[2.7.0]: https://github.com/topazdex/agent-skill/compare/v2.6.0...v2.7.0
[2.6.0]: https://github.com/topazdex/agent-skill/compare/v2.5.2...v2.6.0
[2.5.2]: https://github.com/topazdex/agent-skill/compare/v2.5.0...v2.5.2
[2.5.0]: https://github.com/topazdex/agent-skill/compare/v2.4.0...v2.5.0
[2.4.0]: https://github.com/topazdex/agent-skill/compare/v2.3.1...v2.4.0
[2.3.1]: https://github.com/topazdex/agent-skill/compare/v2.3.0...v2.3.1
[2.3.0]: https://github.com/topazdex/agent-skill/compare/v2.2.0...v2.3.0
[2.2.0]: https://github.com/topazdex/agent-skill/compare/v2.1.0...v2.2.0
[2.1.0]: https://github.com/topazdex/agent-skill/compare/v2.0.0...v2.1.0
[2.0.0]: https://github.com/topazdex/agent-skill/compare/v1.0.0...v2.0.0
[1.0.0]: https://github.com/topazdex/agent-skill/releases/tag/v1.0.0
