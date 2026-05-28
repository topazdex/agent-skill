# Topaz Skill

Agent skill package for **Topaz Dex** — a ve(3,3) DEX on **BNB Chain Mainnet (chain id 56)** combining Solidly-style v2 pools (volatile + stable) with Uniswap-v3-style concentrated liquidity (Slipstream). The skill teaches Claude how to swap, manage liquidity (both v2 LP and v3 NFT positions), stake in gauges, manage veTOPAZ locks, vote, claim rewards, deposit bribes, and query analytics via on-chain reads, the official subgraphs, and the public Stats API.

Everything here is mainnet-only. Testnet and governance contracts (EpochGovernor/ProtocolGovernor) are intentionally out of scope.

**Current version:** `2.6.1` — see [`CHANGELOG.md`](./CHANGELOG.md). Machine-readable manifest: [`skill.json`](./skill.json).

The Topaz website auto-mirrors this version: `https://topazdex.com/agents`, `https://topazdex.com/skill.md`, and `https://topazdex.com/skill.json` all pull from `main` on a 1-hour ISR cycle. Pushing a new version here propagates without any website-side changes — see [`docs/RELEASING.md`](./docs/RELEASING.md) for details.

## Links

- **Website:** https://topazdex.com
- **Docs:** https://www.topazdex.com/docs
- **Agents page:** https://topazdex.com/agents *(canonical install / discovery page)*
- **X (Twitter):** https://x.com/TopazDex
- **Telegram:** https://t.me/TopazDex
- **GitHub:** https://github.com/topazdex
- **Brand assets:** https://github.com/topazdex/assets — full catalog in [`references/brand.md`](./references/brand.md); typed constants in [`scripts/src/config/brand.ts`](./scripts/src/config/brand.ts).

## Install

This repo **is** the skill package. Any agent that can read a `SKILL.md` plus a directory of references and scripts can consume it — Claude Code, Codex, OpenCode, Hermes, custom in-house agents, or a human at a terminal.

The fastest path is to clone the repo into wherever your agent looks for skills, then run the validator and smoke check.

```bash
git clone https://github.com/topazdex/agent-skill.git <dest>
cd <dest>/scripts
cp .env.example .env        # set BSC_RPC_URL; PRIVATE_KEY only needed for writes
yarn install --immutable
yarn validate && yarn smoke
```

Replace `<dest>` with whichever directory your agent reads skills from. Common conventions:

| Runtime | Conventional location |
|---|---|
| Claude Code (user-wide) | `~/.claude/skills/topaz` |
| Claude Code (project-local) | `<your-project>/.claude/skills/topaz` |
| Hermes | `~/.hermes/skills/defi/topaz` |
| OpenCode | `~/.config/opencode/skills/topaz` |
| Codex / generic CLI agent | anywhere — point your agent at it explicitly |
| Standalone / inspecting from a terminal | anywhere |

If your agent has no notion of skills at all, just clone the repo somewhere and tell the agent to read `SKILL.md` plus the linked `references/` and `examples/` files when working on Topaz.

### One-line install

`install.sh` runs the clone + dependency install + validator for you. With no arguments it **auto-detects** an existing agent skills directory on the host and installs there. Detection order (alphabetical, no runtime favored):

1. `~/.claude/skills/` exists → installs to `~/.claude/skills/topaz`
2. `~/.config/opencode/skills/` exists → installs to `~/.config/opencode/skills/topaz`
3. `~/.hermes/skills/` exists → installs to `~/.hermes/skills/defi/topaz`
4. None of the above → falls back to `~/.local/share/topaz-skill` and prints a notice asking you to point your agent at that path

The installer prints its chosen destination and the reason (e.g. `auto-detected ~/.claude/skills/` or `fallback (no recognized agent skill dir found)`) before cloning, so the path is never a surprise.

```bash
# auto-detect destination
curl -fsSL https://raw.githubusercontent.com/topazdex/agent-skill/main/install.sh | bash

# pick your own
curl -fsSL https://raw.githubusercontent.com/topazdex/agent-skill/main/install.sh \
  | bash -s -- ~/some/other/path
```

### Pin a version

```bash
git clone https://github.com/topazdex/agent-skill.git <dest>
git -C <dest> checkout v2.2.0
```

Or fetch a release's frozen artifacts directly (auto-redirects to the latest tag — no need to know the version number):

```bash
curl -fsSL https://github.com/topazdex/agent-skill/releases/latest/download/skill.json
curl -fsSL https://github.com/topazdex/agent-skill/releases/latest/download/SKILL.md
```

## Update

```bash
# convenience wrapper — runs git pull, refreshes deps, re-runs validate/smoke
bash <dest>/update.sh

# or just:
git -C <dest> pull --ff-only
```

Check whether an update is available without applying it:

```bash
cd <dest>
bash tools/check_update.sh   # exit 0 = up to date, 10 = update available
```

## Verify

```bash
cd <dest>/scripts
yarn validate    # static checks: frontmatter, links, addresses, checksums, manifest parity, ...
yarn build       # type-check (tsc --noEmit)
yarn test        # 109 unit tests (vitest, no RPC)
yarn smoke       # live read against BSC mainnet — requires BSC_RPC_URL
```

CI runs `validate` + `build` + `test` on every PR. See `.github/workflows/validate.yml`.

## Releases

Releases are one command:

```bash
cd scripts && yarn release patch --apply   # or minor / major / x.y.z
```

`yarn release` bumps the version in `SKILL.md`, `skill.json`, `README.md`, and `CHANGELOG.md` atomically, runs the full validation suite, commits, tags, and pushes. GitHub Actions (`.github/workflows/release.yml`) then re-validates, creates the GitHub Release with notes extracted from `CHANGELOG.md`, and attaches `skill.json` + `SKILL.md` as release assets (so `releases/latest/download/...` URLs always resolve to the newest tag).

The Topaz website auto-mirrors anything that lands on `main` via Next.js ISR with a 1-hour cache — no handshake step in this workflow. Full release flow + propagation details: [`docs/RELEASING.md`](./docs/RELEASING.md).

## Entry points

- **For agents:** start at `SKILL.md`, then drill into `references/*.md` and `examples/*.md` as needed.
- **For developers:** start at `developers/DEVELOPERS.md` for app, SDK, calldata, dashboard, subgraph, and frontend integration guidance.
- **For humans doing ops:** address tables below, deeper docs under `references/`, runnable code under `scripts/`.

## Contract addresses (BNB Mainnet, chain id 56)

### Core / v2 (`topaz-contracts`)

| Contract | Address |
|---|---|
| TOPAZ (governance token, ERC20) | `0xdf002282C1474C9592780618Adda7EaA99998Abd` |
| WBNB | `0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c` |
| VotingEscrow (veTOPAZ, ERC721) | `0xe951aC65EFE86682311ab0d8995E7A58750c5eB3` |
| Voter | `0x2F80F810a114223AC69E34E84E735CaD515dAD67` |
| Minter | `0x606794d37991A426a189fD9FA8664D339A77f8ae` |
| RewardsDistributor (rebase) | `0x85e15e7Ad4f20d5ca3A1104B1c2CcE72f5F683dB` |
| PoolFactory (v2) | `0x65E6cD0eF5D3467030103cf3d433034E570b5784` |
| Pool implementation | `0xdC942D8e37cC20BCf9aD1Fe0111eE6c5908f3678` |
| Router (v2) | `0x1E98c8226e7d452e1888e3d3d2F929346321c6c3` |
| GaugeFactory | `0xFc080D1EcD7c332022cebf942AEb62d5E1d4Cb08` |
| VotingRewardsFactory | `0x4C303f7af7b8b05226440e4e12FF9a82F513716c` |
| ManagedRewardsFactory | `0xe4b23F13b24232C1E68AD0575191216152AA9480` |
| FactoryRegistry | `0x268d1C8a538Ecf6628838C11d581e1EABD13D6A4` |
| Forwarder (ERC-2771) | `0xE79EB7c4D06ff38e6483921DE8e85A37eC7c731b` |
| VeArtProxy | `0x9612305fe63DFb84Da8f6d6261169F6B85026601` |
| AirdropDistributor | `0x7B1d8745079C85af80Ff7A7eA7C2C4769Eab5348` |
| BalanceLogicLibrary (linked library) | `0xeF6724ad68Fd2f8526765e08afa6627850c8a589` |
| DelegationLogicLibrary (linked library) | `0xCb24e31896d7476EFB7B76A366566cfbcf375033` |

### Slipstream / v3 (`topaz-slipstream`)

| Contract | Address |
|---|---|
| CLFactory | `0x73DC984D9490286E735548f61dfCCec67Af82ed9` |
| CLPool implementation | `0x18e68051d1b1fB44cb539cA4436F112D28577AF7` |
| NonfungiblePositionManager (NFT positions) | `0xf8c30c3C362941C23025f2eA30B066A73C982f63` |
| SwapRouter (v3) | `0x9B63CA87919617d042A89663492dB3c8686e0CaE` |
| QuoterV2 | `0x7CCB89bB9BdEF68688F39a2c22d249fD1D9759f1` |
| MixedRouteQuoterV1 (v2+v3 routes) | `0x47c3570b90e7234FE695Ad5F1bE69E21fe1a9ee2` |
| CLGaugeFactory | `0xeD2ED418f104E18B1D11eA5C26236A1caa675839` |
| CLGauge implementation | `0xc2f777a2e9f54f195212a5a2d394399252958b97` |
| NonfungibleTokenPositionDescriptor | `0xBa4C4f5Ca809C21286ff1a872b3c0CFb57AfE904` |
| NonfungibleTokenPositionDescriptor_V1 (legacy) | `0x81aCc35240D19948a56b8b68BcC8706F90baBAb5` |
| NFTDescriptor (library) | `0x50f9756f631266686b9A7EBDF55998dB3dA5ca0a` |
| NFTSVG (library) | `0x21C9257dFCdf04154D34dF5A2204B9402Ef31d9a` |
| CustomSwapFeeModule | `0xA0462a52af4f8cbF7766Efbba75355B30b6BCCe2` |
| CustomUnstakedFeeModule | `0x3bad7F96cd1b51CE86e12C42541Ac7d559A78582` |
| DynamicSwapFeeModule | `0x656cf5d2f1A70177E011e2c27DeafBeE4C7B0541` |

In this skill, addresses are canonical in `scripts/src/config/addresses.ts` and mirrored to `references/addresses.md` and the table above. The validator (`yarn validate` in `scripts/`) enforces parity across the three.

## Subgraph endpoints (Goldsky)

```
v2: https://api.goldsky.com/api/public/project_cmgzljqwl006c5np2gnao4li4/subgraphs/topaz-v2/v0.0.4/gn
v3: https://api.goldsky.com/api/public/project_cmgzljqwl006c5np2gnao4li4/subgraphs/topaz-v3/v0.0.2/gn
```

Entity catalogs and example queries: `references/analytics-subgraph.md`.

## Architecture overview

Topaz is two pool stacks (v2 and v3) sharing one ve(3,3) governance layer.

```
                    ┌─────────────────────────────┐
                    │   TOPAZ ERC20 (emissions)   │
                    └──────────────┬──────────────┘
                                   │ mint weekly
                    ┌──────────────▼──────────────┐
                    │           Minter            │
                    └──────┬───────────────┬──────┘
              60% to Voter │               │ 40% to RewardsDistributor (rebase)
                    ┌──────▼──────┐ ┌──────▼──────┐
                    │    Voter    │ │ RewardsDistributor │  → claimed by veTOPAZ holders
                    └──────┬──────┘ └─────────────┘
                           │ distribute() per-epoch (per pool weight)
        ┌──────────────────┴──────────────────┐
        │                                     │
┌───────▼────────┐                  ┌─────────▼────────┐
│  Gauge (v2)    │                  │   CLGauge (v3)   │
│  stake LP ERC20│                  │   stake NFT pos  │
└───────┬────────┘                  └─────────┬────────┘
        │                                     │
┌───────▼────────┐                  ┌─────────▼────────┐
│   Pool (v2)    │                  │   CLPool (v3)    │
│  xy=k / stable │                  │ concentrated liq │
└────────────────┘                  └──────────────────┘

Voting:
   veTOPAZ holders ─vote()─▶ Voter ─_deposit()─▶ FeesVotingReward[gauge]
                                  └_deposit()─▶ BribeVotingReward[gauge]

   Pool trading fees ─claimFees()─▶ FeesVotingReward (distributed to voters)
   External bribers ─notifyRewardAmount(token, amt)─▶ BribeVotingReward (paid to voters)
```

- **Pools** generate trading fees. Fees that accrue to gauges flow into `FeesVotingReward` (one per gauge, mapped via `Voter.gaugeToFees(gauge)`).
- **Gauges** receive TOPAZ emissions proportional to vote weight; LPs stake to earn emissions.
- **Voters** allocate veTOPAZ weight across gauges, earning a share of that gauge's trading fees + any bribes.
- **Bribers** add reward tokens to `BribeVotingReward` (mapped via `Voter.gaugeToBribe(gauge)`) to attract votes.
- **veTOPAZ holders** also receive a weekly rebase (anti-dilution) via `RewardsDistributor.claim(tokenId)`.

Epochs are weekly, starting **Thursday 00:00:00 UTC**. Voting window opens at +1h and closes at the next epoch boundary -1h. See `references/epoch-timing.md`.

## Repository layout

```
topaz-skill/
├── README.md                # This file
├── SKILL.md                 # Agent entry (frontmatter + nav)
├── references/              # Topic docs (loaded on demand)
│   ├── addresses.md
│   ├── tokens.md
│   ├── epoch-timing.md
│   ├── swapping-{v2,v3,mixed}.md
│   ├── liquidity-{v2,v3}.md
│   ├── gauges.md
│   ├── ve-locks.md
│   ├── voting.md
│   ├── rewards-claiming.md
│   ├── bribes-deposit.md
│   ├── analytics-{subgraph,onchain}.md
│   ├── apr-calculations.md
│   ├── pitfalls.md
│   └── abis/                # JSON ABIs for ethers/web3
├── developers/              # Builder guides: app integration, calldata, subgraphs, dashboards
├── sdk/                     # SDK layer notes; public exports currently live under scripts/src
├── examples/                # Narrative walkthroughs
└── scripts/                 # TypeScript + ethers v6 helpers
    ├── package.json
    └── src/
        ├── config/          # addresses, chain, tokens
        ├── lib/             # client, erc20, subgraph, tickMath, path, pricing, epoch
        ├── read/            # quotes, pools, gauges, locks, votes, claimable, apr, ...
        ├── write/           # swap, liquidity, gauge, lock, vote, claim, bribe
        └── cli/             # `yarn tsx src/cli/<cmd>.ts ...` entry points
```

## Using the scripts

```bash
cd scripts
cp .env.example .env
# edit .env: BSC_RPC_URL (required), PRIVATE_KEY (required only for write ops)
yarn install
yarn tsx src/cli/stats.ts pool 0x<pool-address>    # read-only example
```

Full env + per-CLI usage in `scripts/README.md`.

## Developer guides

If you are building an app or SDK on top of Topaz, start with `developers/DEVELOPERS.md`. It links to focused guides for quote widgets, wallet-ready swap calldata, subgraph recipes, position dashboards, gauges/APR, and frontend integration.

## Status and roadmap

This section tracks the maturity of the skill. Priority 1 (validator, tests, smoke, goldens, evals, PR checklist) is complete; remaining work is feature-side (priority 2) and polish (priority 3).

### Done

Agent-facing operator layer (read + write):

- [x] `SKILL.md` frontmatter, trigger phrases, navigation map.
- [x] `references/` topic docs for swaps (v2/v3/mixed), liquidity (v2/v3), gauges, ve-locks, voting, rewards, bribes, epoch timing, APR, addresses, tokens, pitfalls, analytics (subgraph + on-chain).
- [x] `references/abis/*.json` for every contract the skill touches.
- [x] `examples/` walkthroughs for the canonical workflows (swap-v2 stable/volatile, swap-v3 single, mixed route, v2 add-liquidity, v3 mint, CL stake, lock+vote, claim-all-rewards, deposit-bribe, query-pool-stats).
- [x] `scripts/` CLIs: `stats`, `swap`, `lp`, `lock`, `vote`, `claim`, `bribe` — each backed by a typed library function in `scripts/src/read/` or `scripts/src/write/`.
- [x] Single canonical address table (`scripts/src/config/addresses.ts` ↔ `references/addresses.md` ↔ this README).
- [x] FS-loaded ABIs out of `references/abis/` so docs and runtime stay in sync.
- [x] `yarn smoke` end-to-end live read against mainnet.

Developer/builder layer (added on this branch):

- [x] `developers/` with builder-facing recipes (`DEVELOPERS.md`, `quote-widget.md`, `swap-calldata.md`, `user-positions.md`, `subgraph-recipes.md`, `gauges-and-apr.md`, `frontend-integration.md`, `error-cookbook.md`).
- [x] Public import surface via `scripts/src/index.ts` (re-exports `ADDR`, `TOKENS`, `ABIS`, `provider`, `bestQuote`, `bestQuoteBundle`, `bestV2Quote`, `bestV3Quote`, `topRoutes`, `buildBestSwapTx`, `buildV{2,3}SwapTx`, `buildV{2,3}{Route,Path}SwapTx`, `buildFromExecRoute`, `buildBribeDepositTx`, `getPoolV{2,3}`, claimable/locks/votes/positions/apr/subgraph helpers, epoch math, tick math).
- [x] Wallet-ready swap calldata builders in `scripts/src/lib/txBuilders.ts` returning `{ to, data, value, expectedOut, amountOutMin, route, quotedAt, deadline, approval? }`.
- [x] Wallet-ready bribe calldata builder in `scripts/src/lib/actionBuilders.ts` returning approval + `notifyRewardAmount` calldata after gauge/live/whitelist checks.
- [x] Route search is **v2-only or v3-only — never mixed**. `bestQuoteBundle(...)` returns the best v2 (volatile + stable, up to 3 hops) and best v3 (every tick-spacing combination, up to 3 hops) side-by-side, plus the overall winner. Intermediaries swept: `USDT, WBNB, BTCB, ETH, TOPAZ, USDC`. A pool-existence probe (one `Multicall3.aggregate3`) prunes routes through non-existent pools before the quoter sweep, and large quote batches are chunked across multicalls so the v3 3-hop layer fits inside the eth_call gas cap.
- [x] **Broken-pool filter** on every route search: candidates with > 50% USD price impact (subgraph spot prices) are dropped, with a relative-to-best fallback when subgraph prices are missing. `BestRoute.priceImpactPct` exposed for UI. Tunable via `maxPriceImpactPct` / `minRelativeToBest` / `skipPriceFilter` on `BestQuoteOptions`. New `tokenPricesUSD(addresses)` helper in `scripts/src/read/subgraphQueries.ts`.
- [x] `bestQuote` returns the overall winner (max of v2 / v3), `bestV2Quote` / `bestV3Quote` return one stack at a time. `topRoutes(...)` returns the full sorted candidate list with an optional `limit` for UI alternatives. `allowMixed` on `BestQuoteOptions` is now a deprecated no-op.

Builder-side input validation and safety (added on this branch):

- [x] Every builder runs through a normalizer: `tokenIn` / `tokenOut` / `recipient` / `payer` are checksummed via `getAddress(...)`, `tokenIn !== tokenOut`, `recipient !== ZeroAddress`, `slippageBps` clamped to `0..10000`, `amountIn > 0`, `deadline` strictly in the future. Malformed input fails synchronously before any RPC call.
- [x] Optional `payer?: string` triggers an on-chain `allowance(tokenIn, payer, spender)` read; the `approval` field is omitted when existing allowance already covers `amountIn`, saving the user a redundant tx.
- [x] `BuiltSwapTx` carries `quotedAt` and `deadline` (unix seconds) for staleness UX.
- [x] `quoteV2` and the v3 quoters all `try/catch` reverts; one bad pool can't kill a `bestQuote`.
- [x] Provider is constructed with `staticNetwork: { chainId: 56 }` so ethers rejects wrong-chain RPCs.
- [x] Write helpers throw on missing `PRIVATE_KEY` (no silent degradation); write CLIs broadcast only when explicitly invoked with a configured key, while no-broadcast wallet flows use builders.

Skill hygiene, validator, and brand surface (added on this branch):

- [x] Static skill validator `scripts/src/cli/validate.ts` (run via `yarn validate`) covering 9 categories: frontmatter, internal links (markdown + backticked paths, fenced-code-aware), author-local paths, external-repo source pointers, secrets / vendored deps / yarn-cache artifacts, address-set parity (config ↔ README ↔ references), EIP-55 checksum validity (via `ethers.getAddress`), subgraph URL consistency, and brand URL parity. Git-aware: only inspects tracked files.
- [x] `.claude/INTERNAL-SOURCE-POINTERS.md` (gitignored) captures the developer-machine paths under `~/topaz/topaz-{contracts,slipstream,interface,v2-subgraph,v3-subgraph}/`. Those pointers were removed from all tracked public docs and `scripts/src/config/addresses.ts`; the validator now rejects any future leak of those paths.
- [x] `scripts/.yarn/install-state.gz` untracked + `**/.yarn/{cache,unplugged,build-state.yml,install-state.gz}` gitignored.
- [x] Doc-only addresses (`BalanceLogicLibrary`, `DelegationLogicLibrary`, `NFTDescriptor`, `NFTSVG`, legacy `NonfungibleTokenPositionDescriptor_V1`) added to `scripts/src/config/addresses.ts` and `README.md` to satisfy strict byte-for-byte parity with `references/addresses.md`.
- [x] Vitest harness + 116 unit tests across `path`, `epoch`, `tickMath`, `tokens`, `txBuilders`, `actionBuilders`, `apr`, `quotes`, `gauges`, and `multicall` (incl. mocked `buildBestSwapTx` calldata-shape test, bribe approval/deposit calldata tests, the 1.D goldens, multicall3 enumerate/decode coverage, `isStale` boundary/deadline cases, v3 native-BNB-out multicall/unwrap assertions, realized-fees APR goldens, and aggregate3 retry-policy coverage with injectable exec). `yarn test` / `yarn test:watch`.
- [x] Real bug fix surfaced by the tests: `getTickAtSqrtRatio`'s MSB binary search wrote `(r > mask ? 1 : 0) << bit` where `bit ∈ {128, 64, 32}` — JS bitwise shift truncates to 32 bits, so `1 << 128 = 1`. Fixed in `src/lib/tickMath.ts`. Smoke test still passes.
- [x] Brand surface: `scripts/src/config/brand.ts` typed `BRAND` constant (web, docs, X, Telegram, GitHub, assetsRepo, plus `assets.{logoPng,logoSvg,tokenLogoPng,topaz100Png,previewJpg}` pointing at `raw.githubusercontent.com/topazdex/assets/main/*`). Catalog page `references/brand.md` with embedding examples. Links section in `README.md`, project-links section in `SKILL.md`. Validator enforces channel-URL parity across README/SKILL/brand.md and asset-URL presence in brand.md.
- [x] Live smoke test (`yarn smoke`) extended from 5 to 9 checks (bytecode on every `ADDR`, TOPAZ symbol+decimals, v2/v3 TVL > 0, live `bestQuote` + route-type assertion, full `buildBestSwapTx` shape, live `Voter.gauges` + `isAlive`). Exits non-zero on any FAIL.
- [x] Golden tests (1.D) — `compareByAmountOutDesc` extracted from `quotes.ts`; `computeEmissionApr` + `computeFeeApr` extracted from `apr.ts` (poolApr behavior unchanged); `src/read/{quotes,apr}.test.ts` + epoch window-state goldens are covered by the current 116-test vitest suite.
- [x] Agent eval prompts (1.E) — `evals/` directory with 8 markdown checklists covering quote / build-swap / can-i-vote / claimable-bribes / quote-widget / deposit-bribe / explain-revert / safe-refusals.
- [x] PR checklist (1.F) — `docs/PR-CHECKLIST.md` mirroring validator + tests + smoke + golden + eval steps. Includes "bumping a golden" guidance.
- [x] `SKILL.md` Operating principles patched with an explicit broadcast-safety rule: "Build and quote by default; do not broadcast unless the user explicitly asks; label every output as one of {quote / built calldata / approval-needed / broadcast tx-hash}."

### TODO — priority 1: foundational skill quality

Validator, unit tests, live smoke, goldens, agent evals, PR checklist. Land in order.

**A. Static skill validation** ([`scripts/src/cli/validate.ts`](./scripts/src/cli/validate.ts), run via `yarn validate`):

- [x] `SKILL.md` frontmatter parses; required keys (`name`, `description`) present; `description` length within Hermes limits.
- [x] Every internal link in `SKILL.md`, `README.md`, developers/, references/, examples/ resolves to an existing file.
- [x] No hardcoded author-local paths (`/Users/...`, `/home/<name>/...`) outside of explicitly-noted "source pointers".
- [x] No committed secrets (`.env`, private keys, API tokens) or vendored deps (`node_modules`, `.pnp.*`).
- [x] Address table in `README.md` matches `scripts/src/config/addresses.ts` matches `references/addresses.md` byte-for-byte (case-insensitive).
- [x] Subgraph URLs in `README.md`, `SKILL.md`, `scripts/.env.example`, `scripts/src/lib/subgraph.ts`, `developers/subgraph-recipes.md`, `developers/DEVELOPERS.md`, and `references/analytics-subgraph.md` all match.

**B. TypeScript unit tests** (vitest, no RPC, run via `yarn test`):

- [x] `slip(amount, bps)` rounding and 0/10000 boundary behavior.
- [x] `encodePath(tokens, spacings)` ↔ `decodePath(hex)` round-trip for v3 paths.
- [x] `encodeMixedPath` with `V2_VOLATILE` / `V2_STABLE` sentinels.
- [x] `epochStart`, `epochNext`, `epochVoteStart`, `epochVoteEnd`, `canVoteNow` against fixed timestamps spanning the Thu 00:00 → Wed 23:59 window and boundary hours.
- [x] `getSqrtRatioAtTick` / `getTickAtSqrtRatio` round-trip and known Uniswap v3 fixtures. (Tests caught a real bug in `getTickAtSqrtRatio`'s MSB binary search — JS shift overflow at `bit ≥ 32`; fixed in `src/lib/tickMath.ts`.)
- [x] `getAmountsForLiquidity` / `getLiquidityForAmounts` for representative tick ranges.
- [x] `findToken("topaz" | "0xdf...")` case + address lookup.
- [x] `normalizeAndValidate` rejects: self-swap, zero recipient, slippage > 10000, past deadline, malformed address.
- [x] `buildBestSwapTx` calldata shape for a static `ExecRoute` (offline, by mocking quoters): correct selector, decoded args, `value` set when `useBnb && tokenIn === WBNB`, approval skipped when payer allowance ≥ amountIn.

**C. Live smoke tests** (`yarn smoke` runs `src/cli/stats.ts smoke`; exits non-zero on any FAIL):

- [x] `provider.getCode(addr) !== "0x"` for every entry in `ADDR` (every important address has deployed bytecode).
- [x] `ERC20(TOPAZ).symbol() === "TOPAZ"` and `decimals() === 18`.
- [x] v2 subgraph: top pair has `reserveUSD > 0`.
- [x] v3 subgraph: top pool has `totalValueLockedUSD > 0`.
- [x] WBNB→TOPAZ `bestQuote` returns nonzero, route type is `v3-single` or `v3-path` (sanity).
- [x] `buildBestSwapTx({ WBNB→TOPAZ, recipient=dead })` returns `{ to: ADDR.SwapRouter, data: 0x..., value: amountIn, expectedOut > 0, amountOutMin > 0, quotedAt > 0, deadline > now }`.
- [x] `Voter.gauges(<top live pool by TVL>) !== ZeroAddress` and `Voter.isAlive(gauge) === true`.

**D. Golden / regression tests**:

- [x] Route sort logic — `compareByAmountOutDesc` extracted from `quotes.ts` and golden-tested in `src/read/quotes.test.ts` (strict descending, stable on ties, wei-magnitude safe). Live smoke (1.C) covers route-family freeze for WBNB→TOPAZ.
- [x] Epoch window state at the three fixed timestamps the README calls out (Thu 00:30 UTC → distribute, Thu 01:30 UTC → vote-open, Wed 23:30 UTC → whitelist-only) — `src/lib/epoch.test.ts`.
- [x] APR math against frozen samples — `computeEmissionApr` and `computeFeeApr` extracted from `apr.ts` and golden-tested in `src/read/apr.test.ts` with hand-verifiable inputs.
- [x] `encodePath` for a known tokens/spacings pair against a frozen hex string — already covered by `src/lib/path.test.ts` "encodes the expected hex layout for a fixed input".

**E. Agent eval prompts** ([`evals/`](./evals/) — 1 file per prompt, manual review first, automation later):

- [x] [`01-quote.md`](./evals/01-quote.md) — "Quote 0.5 WBNB → TOPAZ on Topaz."
- [x] [`02-build-swap.md`](./evals/02-build-swap.md) — "Build a swap tx but don't send it."
- [x] [`03-can-i-vote.md`](./evals/03-can-i-vote.md) — "Can I vote with veNFT #N this epoch?"
- [x] [`04-claimable-bribes.md`](./evals/04-claimable-bribes.md) — "Show my claimable bribes for veNFT #N."
- [x] [`05-quote-widget.md`](./evals/05-quote-widget.md) — "Build a frontend quote widget."
- [x] [`06-deposit-bribe.md`](./evals/06-deposit-bribe.md) — "Deposit a bribe on pool X with USDC."
- [x] [`07-explain-revert.md`](./evals/07-explain-revert.md) — "Explain why this swap reverted." (locks the retry-without-slippage anti-pattern.)
- [x] [`08-safe-refusals.md`](./evals/08-safe-refusals.md) — testnet ask / governance proposal / deploy-new-pool — skill refuses cleanly.

**F. Regression checklist** ([`docs/PR-CHECKLIST.md`](./docs/PR-CHECKLIST.md)):

- [x] `SKILL.md` validates.
- [x] No secrets / `node_modules` / vendored deps committed.
- [x] `cd scripts && yarn install --immutable` succeeds from the lockfile.
- [x] `cd scripts && yarn build` (tsc --noEmit) clean.
- [x] Unit tests pass.
- [x] Smoke tests pass against a live BSC RPC.
- [x] Golden tests pass.
- [x] Address tables across `README.md` / `references/addresses.md` / `scripts/src/config/addresses.ts` agree byte-for-byte; SKILL.md's quick-reference subset is checksum-validated.
- [x] `developers/*.md` links resolve.
- [x] Eval prompts reviewed (manual until automation).

With 1.A–1.F complete and the `SKILL.md` broadcast/labeling rule patched, the foundational quality work is done. Remaining work is feature-side (priority 2), an automated eval harness (priority 1.G — closes the manual-review hole left by 1.E), and polish (priority 3).

**G. Automated eval harness** ([`scripts/src/cli/evals.ts`](./scripts/src/cli/evals.ts), [`evals/`](./evals/), [`.github/workflows/evals.yml`](./.github/workflows/evals.yml) — run via `yarn evals`):

The 1.E checklists in `evals/*.md` are reviewed manually today. That leaves agent-behavior regressions invisible between releases. This slice lifts them into machine-readable assertions and an automated runner.

- [x] **YAML assertion schema** documented in [`evals/README.md`](./evals/README.md). Six output kinds (`quote` / `built calldata` / `approval-needed` / `broadcast tx-hash` / `refusal` / `explanation`) plus four regex lists (`expected_tool_calls`, `forbidden_tool_calls`, `must_include`, `must_not_include`). Single-case and multi-case (`cases:`) shapes both supported.
- [x] **Assertion blocks added to all 8 evals** ([`01-quote.md`](./evals/01-quote.md) through [`08-safe-refusals.md`](./evals/08-safe-refusals.md)). The existing markdown prose stays as human-readable docs; the trailing YAML is canonical for the runner.
- [x] **Spec parser** ([`scripts/src/lib/evalSpec.ts`](./scripts/src/lib/evalSpec.ts)) — extracts the prompt from the first `> ` blockquote (single-case) or per-section blockquote (multi-case), parses YAML via `js-yaml`, validates `output_kind` against the six allowed values, and returns typed `EvalSpec[]`. Shared by validator + runner.
- [x] **Validator extension** — `yarn validate` now parses every `evals/*.md`, confirms the YAML block is well-formed, each regex compiles, and `output_kind` is recognized. Added as the 11th validator section.
- [x] **RPC fixture system** ([`scripts/src/lib/evalFixtures.ts`](./scripts/src/lib/evalFixtures.ts), `evals/fixtures/<case-id>/responses.json`) — frozen, shape-realistic JSON keyed by helper function name. Deterministic, free, replayable. Refusal evals get empty fixtures so any tool call surfaces as `fixture-missing` (and is graded against `forbidden_tool_calls`).
- [x] **Runner CLI** ([`scripts/src/cli/evals.ts`](./scripts/src/cli/evals.ts)) — `yarn evals` mounts `SKILL.md` plus a short eval-environment note as the system prompt, exposes two tools (`topaz_read({function, args})` served from fixtures; `read_file({path})` served from the tracked repo), runs the conversation loop until `end_turn`, records every `tool_use` input, and grades the trace + final answer against each case's assertions. Flags: `--single`, `--dry-run`, `--model`, `--verbose`, `--max-turns`. Default model: `claude-haiku-4-5`. Without `ANTHROPIC_API_KEY`, prints a skip notice and exits 0.
- [x] **Nightly CI** ([`.github/workflows/evals.yml`](./.github/workflows/evals.yml)) — `cron: 0 7 * * *` plus `workflow_dispatch` with optional `single` / `model` inputs. Skips cleanly when no API key is configured. On failure, opens a GitHub issue tagged `eval-regression` rather than blocking PRs (LLM cost + nondeterminism make per-PR gating the wrong call).
- [x] **README + evals/README.md updated** to describe the schema, the runner, and the CI cadence.

The harness can be re-targeted: the YAML schema is runtime-agnostic, and any agent runtime that can record `tool_use` blocks + final text could grade the same assertions. Today's runner uses the Anthropic SDK; an external runner (Hermes, OpenCode, Codex) could consume the same `evalSpec.ts` parser.

### TODO — priority 2: feature gaps surfaced by the robustness review

- [x] **Native-BNB-out for v3 swaps.** Shipped: when `useBnb` is true (default) and the v3 swap's terminal token is WBNB, `buildV3SwapTx` and `buildV3PathSwapTx` emit `SwapRouter.multicall([exactInputSingle|exactInput(recipient=Router, amountOutMinimum=0), unwrapWETH9(amountOutMin, recipient=user)])`. Slippage is enforced at the unwrap boundary. Pass `useBnb: false` to keep WBNB output. `developers/frontend-integration.md` updated.
- [x] **Multicall3 aggregation for `bestQuote`.** Shipped: every candidate is packed into `Multicall3.aggregate3(allowFailure=true, ...)` round trips (chunked via `aggregate3Chunked` so 3-hop v3 sweeps fit under the eth_call gas cap). One pool-existence probe runs first so the quoter sweep only sees routes through real pools. `concurrency` option is a deprecated no-op. Helpers `enumerateV2Plans` / `enumerateV3Plans` / `detectPoolInventory` / `decodeCandidates` are unit-tested with synthetic results.
- [x] **Bundler-safe ABI loading.** Shipped: `scripts/src/lib/abis.ts` now uses static `import … with { type: "json" }` for every ABI. The module is statically resolvable by vite/esbuild/webpack/rollup and works in browser + edge runtimes. No FS access at runtime. Returns `JsonFragment[]` (typed against ethers' `Interface`/`Contract` signatures) so call-sites don't need any casts. The previous `loadAbi(name)` helper is gone — replaced by named imports of each JSON wrapper.
- [x] **APR signal cleanup.** Shipped: `computeFeeApr` now takes `(fees7d, tvlUsd)` and computes `fees7d * 52 / tvlUsd * 100`. Realized fees handle Topaz's `DynamicSwapFeeModule` / `CustomSwapFeeModule` correctly, which `vol7d * feeRate` would not. `poolApr` no longer reads the v2 `getFee()` or the v3 `fee()` for APR purposes (the fee-rate fetches are dropped, one fewer RPC per call). Breaking change to `computeFeeApr` signature — documented in CHANGELOG.
- [x] **`bestQuote` retry policy.** Shipped: `aggregate3` now takes `{ retries, retryBackoffMs, exec }` and re-tries the whole multicall once (250ms backoff by default) on transient RPC errors. Default policy is 2 attempts total. Caller can tune via the options bag; tests inject a synthetic `exec` to drive the retry path deterministically. Since multicall3 collapses every candidate into one call, retrying the batch is more useful than per-candidate retries would have been.
- [x] **Quote freshness helper.** Shipped: `isStale(tx, maxAgeSeconds=30, now?)` from `txBuilders.ts`. Returns true when quote is older than `maxAgeSeconds` OR the tx's `deadline` has passed. Documented in `developers/frontend-integration.md`.

### TODO — priority 3: nice-to-have polish

- [ ] `sdk/` folder is a single README pointing at `scripts/`. Either flesh it into a real publishable package (`@topazdex/sdk`, `tsup` build, types-only deps) or fold its README into `developers/DEVELOPERS.md` and delete the directory.
- [x] `developers/frontend-integration.md` BNB-vs-WBNB section updated now that v3 native-BNB-out is shipped.
- [ ] Verify `developers/subgraph-recipes.md`'s "Goldsky rejects mixing column filters with `or`" claim against the live deployment; the comment reads like it was written from a remembered failure rather than tested.
- [x] `developers/error-cookbook.md` — every revert across v2 Router, v3 SwapRouter / CLPool, NonfungiblePositionManager, Voter, VotingEscrow, gauges, ERC20, plus generic patterns (empty revert data, nonce / gas) — each entry has source pointer, UI string, and a next step. Wired from `SKILL.md` nav, `developers/DEVELOPERS.md`, and the priority-1 `evals/07-explain-revert.md` diagnostic.
