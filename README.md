# Topaz Skill

Agent skill package for **Topaz Dex** — a ve(3,3) DEX on **BNB Chain Mainnet (chain id 56)** combining Solidly-style v2 pools (volatile + stable) with Uniswap-v3-style concentrated liquidity (Slipstream). The skill teaches Claude how to swap, manage liquidity (both v2 LP and v3 NFT positions), stake in gauges, manage veTOPAZ locks, vote, claim rewards, deposit bribes, and query analytics via on-chain reads and the official subgraphs.

Everything here is mainnet-only. Testnet and governance contracts (EpochGovernor/ProtocolGovernor) are intentionally out of scope.

**Current version:** `1.0.0` — see [`CHANGELOG.md`](./CHANGELOG.md). Machine-readable manifest: [`skill.json`](./skill.json).

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

`install.sh` runs the clone + dependency install + validator for you. Default destination is `~/.claude/skills/topaz`, but override it with an argument:

```bash
# default destination
curl -fsSL https://raw.githubusercontent.com/topazdex/agent-skill/main/install.sh | bash

# pick your own
curl -fsSL https://raw.githubusercontent.com/topazdex/agent-skill/main/install.sh \
  | bash -s -- ~/some/other/path
```

### Pin a version

```bash
git clone https://github.com/topazdex/agent-skill.git <dest>
git -C <dest> checkout v1.0.0
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
yarn test        # 71 unit tests (vitest, no RPC)
yarn smoke       # live read against BSC mainnet — requires BSC_RPC_URL
```

CI runs `validate` + `build` + `test` on every PR. See `.github/workflows/validate.yml`.

## Releases

Releases are one command:

```bash
cd scripts && yarn release patch --apply   # or minor / major / x.y.z
```

`yarn release` bumps the version in `SKILL.md`, `skill.json`, and `CHANGELOG.md` atomically, runs the full validation suite, commits, tags, and pushes. GitHub Actions (`.github/workflows/release.yml`) then re-validates, creates the GitHub Release with notes extracted from `CHANGELOG.md`, and (if configured) fires a `repository_dispatch` to the website repo so `/skill.md` and `/skill.json` stay in sync without manual file copies.

Full release flow + one-time website handshake setup: [`docs/RELEASING.md`](./docs/RELEASING.md).

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
v2: https://api.goldsky.com/api/public/project_cmgzljqwl006c5np2gnao4li4/subgraphs/topaz-v2/v0.0.3/gn
v3: https://api.goldsky.com/api/public/project_cmgzljqwl006c5np2gnao4li4/subgraphs/topaz-v3/v0.0.1/gn
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

- [x] `developers/` with builder-facing recipes (`DEVELOPERS.md`, `quote-widget.md`, `swap-calldata.md`, `user-positions.md`, `subgraph-recipes.md`, `gauges-and-apr.md`, `frontend-integration.md`).
- [x] Public import surface via `scripts/src/index.ts` (re-exports `ADDR`, `TOKENS`, `ABIS`, `provider`, `bestQuote`, `topRoutes`, `buildBestSwapTx`, `buildV{2,3}SwapTx`, `buildV{2,3}{Route,Path}SwapTx`, `buildFromExecRoute`, `getPoolV{2,3}`, claimable/locks/votes/positions/apr/subgraph helpers, epoch math, tick math).
- [x] Wallet-ready calldata builders in `scripts/src/lib/txBuilders.ts` returning `{ to, data, value, expectedOut, amountOutMin, route, quotedAt, deadline, approval? }`.
- [x] `bestQuote` enumerates direct v2/v3 + 2-hop combinations across WBNB/USDT/USDC/BTCB and selects the highest output. Now parallelized with bounded concurrency (default 10) — live WBNB→TOPAZ best-route quote runs in ~2s end-to-end on a public RPC.
- [x] `topRoutes(...)` returns the full sorted candidate list with an optional `limit`, so UIs can show alternates or compare best-mixed vs best-executable side by side.
- [x] Mixed v2/v3 routes are surfaced by `bestQuote` (default `allowMixed: true`) but gated out of `buildBestSwapTx` (it requests `allowMixed: false`) because Topaz has no atomic mixed-route executor today.

Builder-side input validation and safety (added on this branch):

- [x] Every builder runs through a normalizer: `tokenIn` / `tokenOut` / `recipient` / `payer` are checksummed via `getAddress(...)`, `tokenIn !== tokenOut`, `recipient !== ZeroAddress`, `slippageBps` clamped to `0..10000`, `amountIn > 0`, `deadline` strictly in the future. Malformed input fails synchronously before any RPC call.
- [x] Optional `payer?: string` triggers an on-chain `allowance(tokenIn, payer, spender)` read; the `approval` field is omitted when existing allowance already covers `amountIn`, saving the user a redundant tx.
- [x] `BuiltSwapTx` carries `quotedAt` and `deadline` (unix seconds) for staleness UX.
- [x] `quoteV2` and the v3 quoters all `try/catch` reverts; one bad pool can't kill a `bestQuote`.
- [x] Provider is constructed with `staticNetwork: { chainId: 56 }` so ethers rejects wrong-chain RPCs.
- [x] Write helpers throw on missing `PRIVATE_KEY` (no silent degradation); every write CLI requires explicit confirmation unless `--yes`.

Skill hygiene, validator, and brand surface (added on this branch):

- [x] Static skill validator `scripts/src/cli/validate.ts` (run via `yarn validate`) covering 9 categories: frontmatter, internal links (markdown + backticked paths, fenced-code-aware), author-local paths, external-repo source pointers, secrets / vendored deps / yarn-cache artifacts, address-set parity (config ↔ README ↔ references), EIP-55 checksum validity (via `ethers.getAddress`), subgraph URL consistency, and brand URL parity. Git-aware: only inspects tracked files.
- [x] `.claude/INTERNAL-SOURCE-POINTERS.md` (gitignored) captures the developer-machine paths under `~/topaz/topaz-{contracts,slipstream,interface,v2-subgraph,v3-subgraph}/`. Those pointers were removed from all tracked public docs and `scripts/src/config/addresses.ts`; the validator now rejects any future leak of those paths.
- [x] `scripts/.yarn/install-state.gz` untracked + `**/.yarn/{cache,unplugged,build-state.yml,install-state.gz}` gitignored.
- [x] Doc-only addresses (`BalanceLogicLibrary`, `DelegationLogicLibrary`, `NFTDescriptor`, `NFTSVG`, legacy `NonfungibleTokenPositionDescriptor_V1`) added to `scripts/src/config/addresses.ts` and `README.md` to satisfy strict byte-for-byte parity with `references/addresses.md`.
- [x] Vitest harness + 95 unit tests across `path`, `epoch`, `tickMath`, `tokens`, `txBuilders`, `apr`, `quotes` (incl. mocked `buildBestSwapTx` calldata-shape test, the 1.D goldens, multicall3 enumerate/decode coverage, `isStale` boundary/deadline cases, and v3 native-BNB-out multicall/unwrap assertions). `yarn test` / `yarn test:watch`.
- [x] Real bug fix surfaced by the tests: `getTickAtSqrtRatio`'s MSB binary search wrote `(r > mask ? 1 : 0) << bit` where `bit ∈ {128, 64, 32}` — JS bitwise shift truncates to 32 bits, so `1 << 128 = 1`. Fixed in `src/lib/tickMath.ts`. Smoke test still passes.
- [x] Brand surface: `scripts/src/config/brand.ts` typed `BRAND` constant (web, docs, X, Telegram, GitHub, assetsRepo, plus `assets.{logoPng,logoSvg,tokenLogoPng,topaz100Png,previewJpg}` pointing at `raw.githubusercontent.com/topazdex/assets/main/*`). Catalog page `references/brand.md` with embedding examples. Links section in `README.md`, project-links section in `SKILL.md`. Validator enforces channel-URL parity across README/SKILL/brand.md and asset-URL presence in brand.md.
- [x] Live smoke test (`yarn smoke`) extended from 5 to 9 checks (bytecode on every `ADDR`, TOPAZ symbol+decimals, v2/v3 TVL > 0, live `bestQuote` + route-type assertion, full `buildBestSwapTx` shape, live `Voter.gauges` + `isAlive`). Exits non-zero on any FAIL.
- [x] Golden tests (1.D) — `compareByAmountOutDesc` extracted from `quotes.ts`; `computeEmissionApr` + `computeFeeApr` extracted from `apr.ts` (poolApr behavior unchanged); new `src/read/{quotes,apr}.test.ts` + epoch window-state goldens. 71 vitest tests total.
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

With 1.A–1.F complete and the `SKILL.md` broadcast/labeling rule patched, the foundational quality work is done. Remaining work is feature-side (priority 2) and polish (priority 3).

### TODO — priority 2: feature gaps surfaced by the robustness review

- [x] **Native-BNB-out for v3 swaps.** Shipped: when `useBnb` is true (default) and the v3 swap's terminal token is WBNB, `buildV3SwapTx` and `buildV3PathSwapTx` emit `SwapRouter.multicall([exactInputSingle|exactInput(recipient=Router, amountOutMinimum=0), unwrapWETH9(amountOutMin, recipient=user)])`. Slippage is enforced at the unwrap boundary. Pass `useBnb: false` to keep WBNB output. `developers/frontend-integration.md` updated.
- [x] **Multicall3 aggregation for `bestQuote`.** Shipped: every candidate (direct v2, direct v3 per tick spacing, 2-hop v2-v2/v3-v3, mixed v2/v3 routes) is packed into a single `Multicall3.aggregate3(allowFailure=true, ...)` round trip. `concurrency` option is now a deprecated no-op. New helpers `enumerateCandidates` + `decodeCandidates` are unit-tested with synthetic results.
- [ ] **Bundler-safe ABI loading.** `scripts/src/lib/abis.ts` uses `fs.readFileSync` so the package is Node-only. Port to JSON import attributes (`import abi from "../../references/abis/Router.json" with { type: "json" }`) so the same module bundles for browser consumers. Keep the FS path as a fallback for runtime ABI overrides.
- [ ] **APR signal cleanup.** `scripts/src/read/apr.ts` fetches `fees7d` but never uses it — the underscore-prefix only suppresses the lint warning. Pick one of (`vol7d * feeRate`) or (`fees7d * 52 / tvlUsd`) and drop the other; document which.
- [ ] **`bestQuote` retry policy.** Single transient RPC error currently returns `0n` for that candidate (treated as "no route"). Add one retry with backoff before giving up on a candidate.
- [x] **Quote freshness helper.** Shipped: `isStale(tx, maxAgeSeconds=30, now?)` from `txBuilders.ts`. Returns true when quote is older than `maxAgeSeconds` OR the tx's `deadline` has passed. Documented in `developers/frontend-integration.md`.

### TODO — priority 3: nice-to-have polish

- [ ] `sdk/` folder is a single README pointing at `scripts/`. Either flesh it into a real publishable package (`@topazdex/sdk`, `tsup` build, types-only deps) or fold its README into `developers/DEVELOPERS.md` and delete the directory.
- [x] `developers/frontend-integration.md` BNB-vs-WBNB section updated now that v3 native-BNB-out is shipped.
- [ ] Verify `developers/subgraph-recipes.md`'s "Goldsky rejects mixing column filters with `or`" claim against the live deployment; the comment reads like it was written from a remembered failure rather than tested.
- [ ] Add an error-cookbook page under `developers/` (intended filename: `error-cookbook.md`) mapping common revert messages (`Router: INSUFFICIENT_OUTPUT_AMOUNT`, `SPL`, `TLU`, etc.) to user-friendly UI strings.
