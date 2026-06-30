# Building on Topaz Dex

This guide is the builder-facing entry point for the Topaz skill repository. `SKILL.md` teaches agents how to operate Topaz; this directory explains how developers can integrate Topaz into applications, dashboards, bots, and analytics pipelines.

Topaz Dex runs on **BNB Chain mainnet (chain id 56)** and combines:

- **v2 pools**: Solidly-style volatile and stable AMMs.
- **v3 / Slipstream pools**: concentrated liquidity pools keyed by tick spacing.
- **ve(3,3) incentives**: TOPAZ emissions, gauges, veTOPAZ voting, bribes, fees, and rebases.

## Topaz ID integration

If you are building a partner dApp and want users to connect with the Topaz
account layer, use the **Topaz ID Wallet Connector** via `@topazdex/id-connect`.
Topaz ID is a self-custodial BNB Chain global wallet — users sign in with their
existing Topaz ID account (email/Google, no seed phrase) and your app gets a
standard wagmi wallet back, plus their Topaz ID name and avatar.

This is **separate from the protocol calldata builders**: the connector handles
account/login/identity, while the DEX builders handle swaps, liquidity, gauges,
votes, and rewards. Most apps use both. See
[`topaz-id-connect.md`](topaz-id-connect.md).

## Choose the right integration surface

- **Topaz ID / wallet login integration**: use `@topazdex/id-connect` when a partner app wants to offer "Connect with Topaz ID", show Topaz ID profile identity, or let users sign through the Topaz ID consent flow. See [`topaz-id-connect.md`](topaz-id-connect.md).
- **Frontend or wallet integration**: use transaction builders from `scripts/src/lib/txBuilders.ts`. These return `{ to, data, value }` plus quote metadata so your app can show a confirmation screen and let the user's wallet sign.
- **Backend bots / ops agents**: use CLI wrappers under `scripts/src/cli/` or write modules under `scripts/src/write/`, which broadcast with an env-provided `PRIVATE_KEY`.
- **Analytics / dashboards**: use the Goldsky subgraphs for indexed pool/volume/TVL data, and on-chain reads for gauges, votes, claimables, and real-time pool state.
- **Protocol reference**: use `references/` for addresses, ABIs, timing rules, pitfalls, and contract-specific mechanics.

## Quickstart

```bash
cd topaz-skill/scripts
cp .env.example .env
# edit .env and set BSC_RPC_URL; PRIVATE_KEY is only needed for broadcasting writes
yarn install
yarn smoke
```

Read-only helpers work with only `BSC_RPC_URL`. Write executors require `PRIVATE_KEY`. Transaction builders do **not** require `PRIVATE_KEY` because they only construct calldata.

The package targets Node ≥ 20. Yarn 4 (via Corepack) is used in this repo; run `corepack enable` once if you do not already have Yarn on `PATH`, then use `yarn ...` normally.

## Importable modules

The scripts package exposes a small public surface via `src/index.ts`:

```ts
import {
  ADDR,
  TOKENS,
  bestQuote,
  bestQuoteBundle,
  bestV2Quote,
  bestV3Quote,
  buildBestSwapTx,
  buildV3SwapTx,
  getPoolV3,
} from "./src/index.js";
```

For production apps, prefer importing from package exports once this repository is published as an npm package. Until then, use these files as reference implementations or vendor them into your app.

> **Bundler note:** `scripts/src/lib/abis.ts` imports each ABI via static JSON imports with `with { type: "json" }`, so the module is statically resolvable by any modern bundler (vite, esbuild, webpack, rollup) and works in both Node and the browser. No FS access at runtime. If your bundler is older and doesn't understand JSON import attributes, upgrade to a version that targets TypeScript ≥ 5.3 (or transpile with tsx / esbuild before bundling).

## Core contract addresses

Canonical addresses live in two places and should stay synchronized:

- Human reference: `references/addresses.md`
- Typed constants: `scripts/src/config/addresses.ts`

The most commonly used addresses are:

- `ADDR.WBNB`: wrapped BNB.
- `ADDR.TOPAZ`: TOPAZ ERC20.
- `ADDR.Router`: v2 router.
- `ADDR.SwapRouter`: v3 / Slipstream router.
- `ADDR.QuoterV2`: v3 quoter.
- `ADDR.MixedRouteQuoterV1`: mixed v2+v3 quoter.
- `ADDR.PoolFactory`: v2 pool factory.
- `ADDR.CLFactory`: v3 pool factory.
- `ADDR.NonfungiblePositionManager`: v3 LP position NFTs.
- `ADDR.Voter`: gauge/vote/bribe/fee registry.

## Builder workflows

### Quotes and route selection

Use `bestQuoteBundle(tokenIn, tokenOut, amountIn)` from `scripts/src/read/quotes.ts`
to compare:

- best v2 route (volatile + stable, up to 3 hops through `USDT, WBNB, BTCB, ETH, TOPAZ, USDC`)
- best v3 route (every tick-spacing combination, up to 3 hops through the same intermediaries)
- the overall winner

The two stacks are searched independently — the default flow **never returns a
mixed v2/v3 route** (Topaz has no atomic mixed-route executor). If you only
need the overall winner, call `bestQuote(...)`; for one stack at a time, call
`bestV2Quote(...)` or `bestV3Quote(...)`. For analytics-only mixed pricing,
call `quoteMixed(pathBytes, amountIn)` against `MixedRouteQuoterV1` directly.

For simple UX, show:

- route label
- expected output
- effective price
- price impact if available
- minimum output after slippage
- whether the returned route is executable atomically

See `developers/quote-widget.md`.

### Swap transaction construction

Use `buildBestSwapTx` or the more specific builders in `scripts/src/lib/txBuilders.ts` to construct wallet-ready calldata:

```ts
const tx = await buildBestSwapTx({
  tokenIn: ADDR.WBNB,
  tokenOut: ADDR.TOPAZ,
  amountIn: "0.5",
  slippageBps: 100n,
  recipient: userAddress,
});

await walletClient.sendTransaction({
  to: tx.to,
  data: tx.data,
  value: tx.value,
});
```

See `developers/swap-calldata.md`.

### Pool and position dashboards

For protocol/pool/gauge stats, **pre-computed APRs**, token prices, epoch/bribe data, and **historical time-series**, prefer the public Stats API — one REST call, no math, and its OpenAPI spec is the canonical contract you can codegen against:

- Base: `https://www.topazdex.com/api/stats` — e.g. `/protocol/history`, `/pools?sort=gaugeApr`, `/pools/{addr}/daily`, `/gauges`, `/tokens`, `/markets/bribes`.
- Spec (source of truth): `https://www.topazdex.com/api/stats/openapi.json` — `npx openapi-typescript … -o topaz-api.ts`.
- See `references/analytics-stats-api.md` for the full catalog and decision table.

Use the subgraphs for ad-hoc GraphQL filtering, per-transaction events, or history beyond the API's window:

- v2 endpoint: `https://api.goldsky.com/api/public/project_cmgzljqwl006c5np2gnao4li4/subgraphs/topaz-v2/prod/gn`
- v3 endpoint: `https://api.goldsky.com/api/public/project_cmgzljqwl006c5np2gnao4li4/subgraphs/topaz-v3/prod/gn`

Use on-chain reads for current ownership and live state:

- v2 LP balances: ERC20 `balanceOf(user)` on pair addresses.
- v3 positions: `NonfungiblePositionManager.balanceOf`, `tokenOfOwnerByIndex`, `positions(tokenId)`.
- gauges/votes/claimables: `Voter`, `Gauge`, `CLGauge`, `VotingEscrow`, reward contracts.

See `developers/user-positions.md` and `developers/subgraph-recipes.md`.

## Handling reverts

`developers/error-cookbook.md` maps every revert message Topaz can produce (v2 Router, v3 SwapRouter / CLPool, NonfungiblePositionManager, Voter, VotingEscrow, gauges, ERC20) to a user-friendly string and a concrete next step. Wire your error-handling layer through it so users see "Price moved too fast — try a higher slippage" instead of `INSUFFICIENT_OUTPUT_AMOUNT`. The diagnostic-pattern section at the bottom mirrors the workflow in `evals/07-explain-revert.md`.

## Safety and UX checklist

- Always quote before building a write transaction.
- Always show expected output and minimum output after slippage.
- Never default `amountOutMin` or liquidity minimums to zero.
- Verify a pool exists before suggesting a route.
- Make approvals explicit and spender-specific.
- For BNB-in v3 swaps, set `value = amountIn` and use WBNB as `tokenIn`.
- Warn users when liquidity is thin relative to trade size.
- Use current on-chain reads for claimables, votes, and position ownership; subgraphs may lag.
- Respect epoch timing: normal voting opens Thursday 01:00 UTC and closes one hour before the next epoch.

## What is intentionally out of scope

- BSC testnet deployments.
- Governance proposal authoring.
- Deploying new protocol contracts.
- Custodial key management.
- Production-grade hosted routing infrastructure.

This repository should be treated as a reference implementation and developer accelerator, not a substitute for your app's own validation, simulation, monitoring, and risk controls.
