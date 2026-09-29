# Building on Topaz Dex

This guide is the builder-facing entry point for the Topaz skill repository. `SKILL.md` teaches agents how to operate Topaz; this directory explains how developers can integrate Topaz into applications, dashboards, bots, and analytics pipelines.

Topaz Dex runs on **BNB (56), Robinhood (4663), Base (8453), Ethereum (1) and Arc (5042)**. Start with [multichain integration](multichain-integration.md) for chain-specific contracts, ABIs, swaps, bridging and spoke voting. The helpers and CLIs below default to BNB; pass `chainId` (or `--chain <id|name>`) to run them against any other Topaz chain. The BNB core combines:

- **v2 pools**: Solidly-style volatile and stable AMMs.
- **v3 / Slipstream pools**: concentrated liquidity pools keyed by tick spacing.
- **ve(3,3) incentives**: TOPAZ emissions, gauges, veTOPAZ voting, bribes, fees, and rebases.

## Topaz ID integration

If you are building a partner dApp and want users to connect with the Topaz
account layer, use the **Topaz ID Wallet Connector** via `@topazdex/id-connect`.
Topaz ID is a global account on all five Topaz chains — BNB Chain, Robinhood
Chain, Base, Ethereum and Arc. Users sign in with their existing Topaz ID account
(email/Google, no seed phrase) and your app connects to their Topaz ID **smart
contract wallet** (ERC-4337, the same address on every chain) through a standard
wagmi connector or a framework-free EIP-1193 provider, plus their Topaz ID name
and avatar. Pass the chains you need (`chains` from `@topazdex/id-connect/chains`);
omitting them defaults to BNB Chain only.

This is **separate from the protocol calldata builders**: the connector handles
account/login/identity, while the DEX builders handle swaps, liquidity, gauges,
votes, and rewards. Most apps use both. Because it's a smart contract wallet,
transactions go through the Topaz ID action client (`useTopazIdClient`), not plain
`writeContract` — see [`topaz-id-connect.md`](topaz-id-connect.md).

Two things trip up first-time integrators, both covered in that guide: **message
signing** (SIWE/auth signatures are ERC-1271/6492, so verify with viem's
`verifyMessage` — never `ecrecover` — and the one code path works for EOAs too),
and a short list of **integration edge cases** (configuring chains, gas sponsored
on BNB Chain only, funding the fresh smart-wallet address on each chain,
popup-gesture requirements). Swap batches from `buildTopazSwapBatch` go through
`sendCalls({ calls, atomicRequired })` on the chain the client is bound to.

## Choose the right integration surface

- **Topaz ID / wallet login integration**: use `@topazdex/id-connect` when a partner app wants to offer "Connect with Topaz ID", show Topaz ID profile identity, or let users sign through the Topaz ID consent flow. See [`topaz-id-connect.md`](topaz-id-connect.md).
- **Frontend or wallet integration**: use transaction builders from `scripts/src/lib/txBuilders.ts`. The default swap builder returns the complete `TopazSwapBatch.transactions` list plus quote metadata. Submit all calls atomically; explicit legacy builders retain the old single-transaction shape.
- **Backend bots / ops agents**: use CLI wrappers under `scripts/src/cli/` or write modules under `scripts/src/write/`, which broadcast with an env-provided `PRIVATE_KEY`.
- **Analytics / dashboards**: use the public multichain API (`https://api.topazdex.com/v1`) for pools, prices, gauges, votes, epochs, incentives, account portfolios and history on every chain; the BNB Goldsky subgraphs (v2, v3, ve) for ad-hoc GraphQL and event history; on-chain reads for the final pre-transaction state.
- **Protocol reference**: use `references/` for addresses, ABIs, timing rules, pitfalls, and contract-specific mechanics.

## Quickstart

```bash
cd topaz-skill/scripts
cp .env.example .env
# optional: BSC_RPC_URL / TOPAZ_RPC_<chainId>; PRIVATE_KEY is only needed for broadcasting writes
yarn install
yarn smoke
```

Read-only helpers work with the public RPC defaults (override per chain with `BSC_RPC_URL` or `TOPAZ_RPC_<chainId>`). Write executors require `PRIVATE_KEY`. Transaction builders do **not** require `PRIVATE_KEY` because they only construct calldata.

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
  // multichain
  deployedContract,
  coreContract,
  resolveTokenOnChain,
  getSpokePosition,
  listSpokePositions,
} from "./src/index.js";
```

`ADDR` and `TOKENS` are the BNB address book and token list; for any other chain pass `chainId` to the helpers and use `coreContract(name, chainId)`, `deployedContract(chainId, name)` and `resolveTokenOnChain(query, chainId)`.

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

Use `fetchTopazQuote` or `bestQuoteBundle(tokenIn, tokenOut, amountIn)` for Topaz API split/mixed routing. `bestQuoteBundle` returns `{topaz, best, v2: null, v3: null}`; null legacy fields do not mean those pools are absent. Read [API routing and Permit2 batches](../references/swapping-api.md) before integrating execution. Explicit on-chain diagnostic helpers remain available.

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
const batch = await buildBestSwapTx({
  tokenIn: ADDR.WBNB,
  tokenOut: ADDR.TOPAZ,
  amountIn: "0.5",
  slippageBps: 100n,
  recipient: userAddress,
});

// After wallet confirmation, pass ALL calls to an adapter that guarantees
// atomic execution from batch.payer. Never send these as sequential EOA calls.
await atomicWallet.sendCalls({
  chainId: batch.chainId,
  from: batch.payer,
  calls: batch.transactions,
  atomicRequired: batch.atomicRequired,
});
```

See `developers/swap-calldata.md`.

### Pool and position dashboards

For pools, tokens, prices, gauges, votes, epochs, incentives, **pre-computed APRs**, account portfolios and **history** on all five chains, prefer the public multichain API — one REST call, explicit coverage metadata, and an OpenAPI contract you can codegen against:

- Base: `https://api.topazdex.com/v1` — e.g. `/v1/pools?chainIds=56&sort=emissionsApr`, `/v1/pools/{chainId}/{pool}/history`, `/v1/gauges?chainIds=all`, `/v1/prices?tokens=56:0x…`, `/v1/markets/bribes`, `/v1/accounts/{address}/portfolio`.
- Spec (source of truth): `https://api.topazdex.com/openapi.json` — `npx openapi-typescript https://api.topazdex.com/openapi.json -o topaz-api.ts`.
- Helpers: `fetchV1` / `fetchV1Pages` in `scripts/src/lib/topazApi.ts`; `yarn tsx src/cli/stats.ts v1 <path>` for a quick look.
- See `references/analytics-multichain.md` for the route catalog, envelope, pagination and coverage rules. The legacy `/api/stats` reports (`references/analytics-stats-api.md`) are BNB-only history.

Use the BNB subgraphs for ad-hoc GraphQL filtering, per-transaction events, or entity history beyond the API's window:

- v2 endpoint: `https://api.goldsky.com/api/public/project_cmgzljqwl006c5np2gnao4li4/subgraphs/topaz-v2/prod/gn`
- v3 endpoint: `https://api.goldsky.com/api/public/project_cmgzljqwl006c5np2gnao4li4/subgraphs/topaz-v3/prod/gn`
- ve endpoint (locks, votes, bribes, epochs, relays, xTOPAZ hub): `https://api.goldsky.com/api/public/project_cmgzljqwl006c5np2gnao4li4/subgraphs/topaz-ve/prod/gn`

Use on-chain reads for the final pre-transaction state:

- v2 LP balances: ERC20 `balanceOf(user)` on pair addresses.
- v3 positions: `NonfungiblePositionManager.positions(tokenId)`, `CLPool.slot0()`, `CLGauge.earned`.
- gauges/votes/claimables: `Voter`, `Gauge`, `CLGauge`, `VotingEscrow`, reward contracts `earned`.

See `developers/user-positions.md` and `developers/subgraph-recipes.md`.

## Handling reverts

`developers/error-cookbook.md` maps every revert message Topaz can produce (v2 Router, v3 SwapRouter / CLPool, NonfungiblePositionManager, Voter, VotingEscrow, gauges, ERC20) to a user-friendly string and a concrete next step. Wire your error-handling layer through it so users see "Price moved too fast — try a higher slippage" instead of `INSUFFICIENT_OUTPUT_AMOUNT`. The diagnostic-pattern section at the bottom mirrors the workflow in `evals/07-explain-revert.md`.

## Safety and UX checklist

- Always quote before building a write transaction.
- Always show expected output and minimum output after slippage.
- Never default swap protection to zero. Compute CL liquidity minima from the intended range and price tolerance; one side may legitimately reach zero at a boundary.
- Verify a pool exists before suggesting a route.
- Make approvals explicit and spender-specific.
- For native-in v3 swaps (BNB, or ETH on Robinhood/Base/Ethereum), set `value = amountIn` and use the wrapped native as `tokenIn`. Arc has no native leg.
- Warn users when liquidity is thin relative to trade size.
- Use current on-chain reads for claimables, votes, and position ownership; subgraphs may lag.
- Respect epoch timing: normal voting opens Thursday 01:00 UTC and closes one hour before the next epoch.

## What is intentionally out of scope

- BSC testnet deployments.
- Governance proposal authoring.
- Deploying replacement protocol infrastructure. Permissionless pools and eligible gauges are covered in [pools and gauges](pools-and-gauges.md).
- Custodial key management.
- Production-grade hosted routing infrastructure.

This repository should be treated as a reference implementation and developer accelerator, not a substitute for your app's own validation, simulation, monitoring, and risk controls.
