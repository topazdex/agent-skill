# Topaz Skill

Agent skill package for **Topaz Dex** — a ve(3,3) DEX on **BNB Chain Mainnet (chain id 56)** combining Solidly-style v2 pools (volatile + stable) with Uniswap-v3-style concentrated liquidity (Slipstream). The skill teaches Claude how to swap, manage liquidity (both v2 LP and v3 NFT positions), stake in gauges, manage veTOPAZ locks, vote, claim rewards, deposit bribes, and query analytics via on-chain reads and the official subgraphs.

Everything here is mainnet-only. Testnet and governance contracts (EpochGovernor/ProtocolGovernor) are intentionally out of scope.

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
| NFTDescriptor (library) | `0x50f9756f631266686b9A7EBDF55998dB3dA5ca0a` |
| NFTSVG (library) | `0x21C9257dFCdf04154D34dF5A2204B9402Ef31d9a` |
| CustomSwapFeeModule | `0xA0462a52af4f8cbF7766Efbba75355B30b6BCCe2` |
| CustomUnstakedFeeModule | `0x3bad7F96cd1b51CE86e12C42541Ac7d559A78582` |
| DynamicSwapFeeModule | `0x656cf5d2f1A70177E011e2c27DeafBeE4C7B0541` |

Single source of truth: `~/topaz/topaz-contracts/deployments/bscMainnet/*.json` and `~/topaz/topaz-slipstream/deployments/bscMainnet/*.json`. The same values are mirrored in `references/addresses.md` and `scripts/src/config/addresses.ts`.

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

## Pointers to source

| What | Where |
|---|---|
| Core contracts | `~/topaz/topaz-contracts/contracts/` |
| CL contracts | `~/topaz/topaz-slipstream/contracts/` |
| Frontend reference patterns | `~/topaz/topaz-interface/src/hooks/` |
| v2 subgraph schema | `~/topaz/topaz-v2-subgraph/src/v2/schema.graphql` |
| v3 subgraph schema | `~/topaz/topaz-v3-subgraph/src/v3/schema.graphql` |

## Status and roadmap

This section tracks the maturity of the skill. The top priority is closing the gaps called out in [`battle-tested-agent-skill-best-practices.md`](./battle-tested-agent-skill-best-practices.md); only after that should new features land.

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

### TODO — priority 1: battle-tested best practices

Tracks [`battle-tested-agent-skill-best-practices.md`](./battle-tested-agent-skill-best-practices.md). Land in order.

**A. Static skill validation** (`scripts/validate_skill.py` or equivalent):

- [ ] `SKILL.md` frontmatter parses; required keys (`name`, `description`) present; `description` length within Hermes limits.
- [ ] Every internal link in `SKILL.md`, `README.md`, `developers/*.md`, `references/*.md`, `examples/*.md` resolves to an existing file.
- [ ] No hardcoded author-local paths (`/Users/...`, `/home/<name>/...`) outside of explicitly-noted "source pointers".
- [ ] No committed secrets (`.env`, private keys, API tokens) or vendored deps (`node_modules`, `.pnp.*`).
- [ ] Address table in `README.md` matches `scripts/src/config/addresses.ts` matches `references/addresses.md` byte-for-byte (case-insensitive).
- [ ] Subgraph URLs in `README.md`, `SKILL.md`, `scripts/.env.example`, `scripts/src/lib/subgraph.ts`, and `developers/subgraph-recipes.md` all match.

**B. TypeScript unit tests** (no RPC required, deterministic, fast — pick `vitest`):

- [ ] `slip(amount, bps)` rounding and 0/10000 boundary behavior.
- [ ] `encodePath(tokens, spacings)` ↔ `decodePath(hex)` round-trip for v3 paths.
- [ ] `encodeMixedPath` with `V2_VOLATILE` / `V2_STABLE` sentinels.
- [ ] `epochStart`, `epochNext`, `epochVoteStart`, `epochVoteEnd`, `canVoteNow` against fixed timestamps spanning the Thu 00:00 → Wed 23:59 window and boundary hours.
- [ ] `getSqrtRatioAtTick` / `getTickAtSqrtRatio` round-trip and known Uniswap v3 fixtures.
- [ ] `getAmountsForLiquidity` / `getLiquidityForAmounts` for representative tick ranges.
- [ ] `findToken("topaz" | "0xdf...")` case + address lookup.
- [ ] `normalizeAndValidate` rejects: self-swap, zero amount, zero recipient, slippage > 10000, past deadline, malformed address.
- [ ] `buildBestSwapTx` calldata shape for a static `ExecRoute` (offline, by mocking quoters): correct selector, decoded args, `value` set when `useBnb && tokenIn === WBNB`.

**C. Live smoke tests** (extend `src/cli/stats.ts smoke`):

- [ ] `provider.getCode(addr) !== "0x"` for every entry in `ADDR` (every important address has deployed bytecode).
- [ ] `ERC20(TOPAZ).symbol() === "TOPAZ"` and `decimals() === 18`.
- [ ] v2 subgraph: top pair has `reserveUSD > 0`.
- [ ] v3 subgraph: top pool has `totalValueLockedUSD > 0`.
- [ ] WBNB→TOPAZ `bestQuote` returns nonzero, route type is `v3-single` or `v3-path` (sanity).
- [ ] `buildBestSwapTx({ WBNB→TOPAZ, recipient=dead })` returns `{ to: ADDR.SwapRouter, data: 0x..., value: amountIn, expectedOut > 0, amountOutMin > 0, quotedAt > 0, deadline > now }`.
- [ ] `Voter.gauges(<known live pool>) !== ZeroAddress` and `Voter.isAlive(gauge) === true`.

**D. Golden / regression tests**:

- [ ] Fixed-input route selection (e.g. `WBNB→TOPAZ, 0.5e18` → `v3 direct ts=200` family) so route logic doesn't silently drift.
- [ ] Epoch logic at fixed timestamps (e.g. `2026-01-08T00:30Z` → distribute window; `2026-01-08T01:30Z` → vote-open; `2026-01-14T23:30Z` → whitelist-only).
- [ ] APR math against a frozen sample of `rewardRate`, `stakedLiquidity`, `liquidity`, `tvlUsd`, `topazUsd` — must equal the recorded numbers within a small tolerance.
- [ ] `encodePath` for a known tokens/spacings pair against a frozen hex string.

**E. Agent eval prompts** (under `evals/`, markdown checklist first; automated later):

- [ ] "Quote 0.5 WBNB → TOPAZ on Topaz." — expects: skill used, `bestQuote`/`quoteHuman` call, no broadcast, route + amountOut + slippage caveat.
- [ ] "Build a swap tx but don't send it." — expects: `buildBestSwapTx`, returns `{to, data, value, approval?}` shape, no `signer()`.
- [ ] "Can I vote with veNFT #N this epoch?" — expects: read `Voter.lastVoted` + `epochStart` + window check; clear yes/no with reason.
- [ ] "Show my claimable bribes for veNFT #N." — expects: `claimableSummary(tokenId, address)` (or equivalent), grouped per pool.
- [ ] "Build a frontend quote widget." — expects: routes to `developers/quote-widget.md`, recommends `bestQuote({ allowMixed: false })` for execution paths.
- [ ] "Deposit a bribe on pool X with USDC." — expects: gauge lookup → `BribeVotingReward` → `isReward || isWhitelisted` precheck → explicit approval to the bribe contract, not the gauge.
- [ ] "Explain why this swap reverted." — expects: pool existence check, slippage check, allowance check, deadline check; does not propose retry-without-slippage.
- [ ] Safe-refusal cases: testnet ask, governance proposal ask, deploy-new-pool ask — skill should say out-of-scope and stop.

**F. Regression checklist** (`docs/PR-CHECKLIST.md`):

- [ ] `SKILL.md` validates.
- [ ] No secrets / `node_modules` / vendored deps committed.
- [ ] `cd scripts && yarn install --immutable` succeeds from the lockfile.
- [ ] `cd scripts && yarn build` (tsc --noEmit) clean.
- [ ] Unit tests pass.
- [ ] Smoke tests pass against a live BSC RPC.
- [ ] Golden tests pass.
- [ ] Address tables across README / SKILL / references / config agree.
- [ ] `developers/*.md` links resolve.
- [ ] Eval prompts reviewed (manual until automation).

### TODO — priority 2: feature gaps surfaced by the robustness review

- [ ] **Native-BNB-out for v3 swaps.** `buildV3SwapTx` does not currently emit `SwapRouter.multicall([exactInputSingle(recipient=Router), unwrapWETH9(amountMin, recipient=user)])`. Add `unwrapWbnb?: boolean` and emit the multicall variant when set. Mirror the same in `buildV3PathSwapTx`. Update `developers/frontend-integration.md` once it ships.
- [ ] **Multicall3 aggregation for `bestQuote`.** Even parallelized, 200 RPC calls per quote is wasteful. `ADDR` exposes `MULTICALL3 = 0xcA11...CA11` and `chain.ts` exports it but nothing uses it. Collapse candidate enumeration into a single `Multicall3.aggregate3(allowFailure=true, ...)` round trip. Target: best-quote latency < 500ms on a private RPC.
- [ ] **Bundler-safe ABI loading.** `scripts/src/lib/abis.ts` uses `fs.readFileSync` so the package is Node-only. Port to JSON import attributes (`import abi from "../../references/abis/Router.json" with { type: "json" }`) so the same module bundles for browser consumers. Keep the FS path as a fallback for runtime ABI overrides.
- [ ] **APR signal cleanup.** `scripts/src/read/apr.ts` fetches `fees7d` but never uses it — the underscore-prefix only suppresses the lint warning. Pick one of (`vol7d * feeRate`) or (`fees7d * 52 / tvlUsd`) and drop the other; document which.
- [ ] **`bestQuote` retry policy.** Single transient RPC error currently returns `0n` for that candidate (treated as "no route"). Add one retry with backoff before giving up on a candidate.
- [ ] **Quote freshness helper.** Now that `BuiltSwapTx.quotedAt` exists, ship a tiny `isStale(tx, maxAgeSeconds=30)` helper from `txBuilders.ts` so frontends don't reinvent the math.

### TODO — priority 3: nice-to-have polish

- [ ] `sdk/` folder is a single README pointing at `scripts/`. Either flesh it into a real publishable package (`@topazdex/sdk`, `tsup` build, types-only deps) or fold its README into `developers/DEVELOPERS.md` and delete the directory.
- [ ] `developers/frontend-integration.md` BNB-vs-WBNB section calls out the v3-unwrap gap; once feature #1 above ships, simplify the section.
- [ ] Verify `developers/subgraph-recipes.md`'s "Goldsky rejects mixing column filters with `or`" claim against the live deployment; the comment reads like it was written from a remembered failure rather than tested.
- [ ] Add a `developers/error-cookbook.md` mapping common revert messages (`Router: INSUFFICIENT_OUTPUT_AMOUNT`, `SPL`, `TLU`, etc.) to user-friendly UI strings.
