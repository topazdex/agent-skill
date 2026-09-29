# Topaz skill — scripts

TypeScript + ethers v6 helpers for Topaz on BNB Chain (56), Robinhood Chain (4663), Base (8453), Ethereum (1) and Arc (5042). `config/deployments.ts` and `lib/multichain.ts` supply chain-bound contracts and ABIs; see [multichain integration](../developers/multichain-integration.md).

**Selecting a chain.** Every read/write helper and builder takes an optional `chainId` (args field or trailing parameter, default 56) — except the BNB-only modules `read/locks`, `read/relays`, `read/apr`, `lib/pricing`, `write/lock`, `write/relay` and `lib/relayBuilders` — and resolves that chain's contracts from `references/deployments.json` — a contract missing on a chain throws rather than falling back to BNB. The CLIs take `--chain <id|name>` (`bnb`, `robinhood`, `base`, `ethereum`, `arc`) and confirm `eth_chainId` before doing anything. Per-chain RPCs: for BNB `BSC_RPC_URL`, then `TOPAZ_RPC_56`; elsewhere `TOPAZ_RPC_<chainId>`; otherwise the catalog's public RPC (the same precedence for the CLIs, helpers and `verify:deployments`). Library write helpers do not re-check the RPC's chain; call `verifyChain(chainId)` first when you use them directly. Pointing `BSC_RPC_URL` at another network does **not** switch chains.

**What differs on a spoke.** Voting power is xTOPAZ staked in the local `XTopazVotingVault`: position ids replace veNFT ids in `vote.ts` / `claim.ts` / `stats.ts vote|claimable`, and `position.ts` opens, extends, withdraws and merges them. Gauge emissions are xTOPAZ. There are no veTOPAZ locks, relays or rebases (`lock.ts`, `relay.ts`, `claim.ts rebase` refuse), and on-chain APR (`stats.ts apr`) is BNB-only — use `stats.ts v1 /pools --chainIds <id>`. Arc has no wrapped native: trade the USDC ERC20 and never attach native value to DEX calls.

Read-only five-chain verification: `yarn verify:deployments` (optionally followed by chain IDs). Override RPCs with `TOPAZ_RPC_<chainId>`. No private key is used.

## Setup

```bash
cd ~/topaz/topaz-skill/scripts
cp .env.example .env       # optional RPC overrides; PRIVATE_KEY only for writes
yarn install
```

Requires Node ≥ 20. Uses [`tsx`](https://www.npmjs.com/package/tsx) — no compilation step needed.

## Layout

```
src/
├── config/
│   ├── addresses.ts    # BNB Chain address book (validator-checked against the catalog)
│   ├── deployments.ts  # five-chain catalog: contractAddress, requireHubChain/requireSpokeChain
│   ├── chain.ts        # BNB (56) defaults
│   └── tokens.ts       # BNB token list + resolveTokenOnChain / hopTokens for every chain
├── lib/
│   ├── client.ts       # per-chain provider(chainId) / signer(chainId) / verifyChain
│   ├── contracts.ts    # coreContract(name, chainId): Router, Voter, NPM, … on any chain
│   ├── chainOption.ts  # --chain parsing shared by the CLIs
│   ├── erc20.ts        # balanceOf, allowance, approveIfNeeded, decimals cache
│   ├── abis.ts         # Loads JSON ABIs from ../../references/abis
│   ├── subgraph.ts     # GraphQLClient instances for the BNB v2, v3 and ve graphs
│   ├── tickMath.ts     # sqrtPriceX96 <-> price <-> tick (Uniswap V3 SDK math)
│   ├── path.ts         # v3 path encode/decode + mixed-route sentinels
│   ├── pricing.ts      # Token USD price (subgraph or DexScreener)
│   ├── topazApi.ts     # fetchV1 / fetchV1Pages for the public multichain API (/v1)
│   ├── statsApi.ts     # Typed client for the legacy BNB Stats reports (/api/stats)
│   └── epoch.ts        # WEEK / epochStart / vote window helpers
├── read/               # No-signer reads (RPC + subgraph)
│   ├── pools.ts        # v2/v3 unified pool info
│   ├── positions.ts    # v3 NFT positions
│   ├── gauges.ts       # gauge state, all-gauges enum
│   ├── locks.ts        # veTOPAZ locks
│   ├── votes.ts        # current vote per veNFT / spoke position
│   ├── spokePositions.ts # XTopazVotingVault positions and vault state
│   ├── claimable.ts    # gauge, fee, bribe (+ BNB rebase) rewards
│   ├── apr.ts          # gauge / fee / voting / rebase APR
│   ├── quotes.ts       # v2 / v3 / mixed quoting + best-route search
│   └── subgraphQueries.ts
├── write/              # Requires PRIVATE_KEY
│   ├── swap.ts
│   ├── liquidityV2.ts
│   ├── liquidityV3.ts
│   ├── gauge.ts
│   ├── lock.ts
│   ├── vote.ts         # BNB Voter or spoke vault, by chain
│   ├── claim.ts        # BNB Voter or spoke vault, by chain
│   ├── spokePosition.ts # stake / add / unstake / merge / operator on a spoke
│   └── bribe.ts
└── cli/                # `yarn tsx src/cli/<cmd>.ts ...`
    ├── stats.ts
    ├── swap.ts
    ├── lp.ts
    ├── lock.ts
    ├── vote.ts
    ├── claim.ts
    ├── bribe.ts
    ├── position.ts     # spoke xTOPAZ positions (XTopazVotingVault)
    └── relay.ts        # BNB relays (managed veTOPAZ)
```

## CLIs

Every CLI prints `--help` when called with no args (or `-h`/`--help`).

```bash
# Read-only — no PRIVATE_KEY needed
yarn tsx src/cli/stats.ts pool 0xPOOL
yarn tsx src/cli/stats.ts gauge 0xPOOL
yarn tsx src/cli/stats.ts lock --id 1234
yarn tsx src/cli/stats.ts position --id 5678
yarn tsx src/cli/stats.ts claimable --id 1234 --address 0xYOUR_WALLET
yarn tsx src/cli/stats.ts gauges --limit 50
yarn tsx src/cli/stats.ts gauges-for-pair WBNB BTCB     # every gauge across all pool variants for a pair
yarn tsx src/cli/stats.ts bribes --pool 0xPOOL
yarn tsx src/cli/stats.ts apr --pool 0xPOOL
yarn tsx src/cli/stats.ts smoke                 # quick end-to-end sanity check

# Public multichain API (https://api.topazdex.com/v1) — any chain, pre-computed, no RPC needed
yarn tsx src/cli/stats.ts v1 /chains
yarn tsx src/cli/stats.ts v1 /pools --chainIds 8453 --scope all --sort emissionsApr --limit 10   # spokes need scope=all until curated
yarn tsx src/cli/stats.ts v1 /pools/56/0xPOOL --aprProfile standard
yarn tsx src/cli/stats.ts v1 /gauges --chainIds 56 --all            # follows pageInfo.nextCursor
yarn tsx src/cli/stats.ts v1 /markets/bribes --chainIds 56 --sort dollarPerVote
yarn tsx src/cli/stats.ts v1 /prices --tokens 56:0xdf002282c1474c9592780618adda7eaa99998abd
yarn tsx src/cli/stats.ts v1 /accounts/0xYOUR_WALLET/portfolio --chainIds all

# Legacy BNB Stats reports (https://api.topazdex.com/api/stats) — retained history only
yarn tsx src/cli/stats.ts protocol              # protocol overview
yarn tsx src/cli/stats.ts protocol-history --days 30
yarn tsx src/cli/stats.ts protocol-daily --days 30
yarn tsx src/cli/stats.ts api-pools --sort gaugeApr --incentivized --min-tvl 10000
yarn tsx src/cli/stats.ts pool-daily 0xPOOL --days 90
yarn tsx src/cli/stats.ts api-gauges            # all gauges with APRs
yarn tsx src/cli/stats.ts api-gauge 0xGAUGE     # single gauge detail
yarn tsx src/cli/stats.ts gauge-rewards 0xGAUGE
yarn tsx src/cli/stats.ts bribe-markets --min-usd 1   # $/vote per gauge
yarn tsx src/cli/stats.ts bribe-totals
yarn tsx src/cli/stats.ts tokens --limit 20     # token prices
yarn tsx src/cli/stats.ts token 0xTOKEN
yarn tsx src/cli/stats.ts epochs --limit 12
yarn tsx src/cli/stats.ts epoch 1748390400
yarn tsx src/cli/stats.ts foundation            # foundation summary (votes/bribes/KPIs)
yarn tsx src/cli/stats.ts dynamic-fees
yarn tsx src/cli/stats.ts health

# Writes — PRIVATE_KEY required
yarn tsx src/cli/swap.ts v2  --in BNB --out USDT --amount 0.5 --slippage 50      # BNB = native; WBNB stays ERC20
yarn tsx src/cli/swap.ts v3  --in TOPAZ --out WBNB --amount 100 --ts 200 --slippage 100   # ERC20 legs only
yarn tsx src/cli/swap.ts best --in 0xA --out 0xB --amount 10 [--payer 0xYOU] [--prefer v2|v3 --execute]

yarn tsx src/cli/lp.ts add-v2      --a 0xA --b 0xB --amount-a 1 --amount-b 2 [--stable] [--slippage 100] [--use-native]
yarn tsx src/cli/lp.ts remove-v2   --a 0xA --b 0xB --pct 100 [--stable] [--slippage 100]
yarn tsx src/cli/lp.ts mint-v3     --t0 0xA --t1 0xB --ts 200 --range-ticks 50 --amount0 1000   # ERC20 only
yarn tsx src/cli/lp.ts decrease-v3 --id 5678 [--pct 100]
yarn tsx src/cli/lp.ts collect-v3  --id 5678
yarn tsx src/cli/lp.ts burn-v3     --id 5678
yarn tsx src/cli/lp.ts stake       --tokenId 5678            # CL NFT → gauge (or --pool 0xPOOL --amount <wei> for v2 LP)
yarn tsx src/cli/lp.ts unstake     --tokenId 5678

yarn tsx src/cli/lock.ts create   --amount 10000 --duration 4y
yarn tsx src/cli/lock.ts add      --id 1234 --amount 500
yarn tsx src/cli/lock.ts extend   --id 1234 --duration 2y
yarn tsx src/cli/lock.ts merge    --from 1234 --to 5678
yarn tsx src/cli/lock.ts split    --id 1234 --amount 1000
yarn tsx src/cli/lock.ts withdraw --id 1234

yarn tsx src/cli/vote.ts cast  --id 1234 --pool 0xA --weight 60 --pool 0xB --weight 30 --pool 0xC --weight 10
yarn tsx src/cli/vote.ts reset --id 1234
yarn tsx src/cli/vote.ts poke  --id 1234

yarn tsx src/cli/claim.ts all       --id 1234
yarn tsx src/cli/claim.ts gauge     --gauge 0xGAUGE --tokenId 5678   # CL position
yarn tsx src/cli/claim.ts gauge-v2  [--address 0xYOU]                # every v2 gauge you're staked in
yarn tsx src/cli/claim.ts fees      --id 1234 --pool 0xA [--pool 0xB]
yarn tsx src/cli/claim.ts bribes    --id 1234 --pool 0xA [--pool 0xB]
yarn tsx src/cli/claim.ts rebase    --id 1234

yarn tsx src/cli/bribe.ts deposit --pool 0xPOOL --token 0xUSDC --amount 5000
```

### Other chains

Add `--chain <id|name>` to `stats` (on-chain reads), `swap`, `lp`, `vote`, `claim` and `bribe`. Spokes resolve only a few symbols (`ETH`/`WETH`/`xTOPAZ`; `USDC`/`xTOPAZ` on Arc) — pass 0x addresses for everything else.

```bash
# Read-only
yarn tsx src/cli/swap.ts quote   --chain base --in ETH --out 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 --amount 0.01
yarn tsx src/cli/swap.ts best    --chain arc  --in USDC --out xTOPAZ --amount 5 --payer 0xYOUR_WALLET   # prints the Permit2 batch
yarn tsx src/cli/stats.ts gauges --chain robinhood --limit 10
yarn tsx src/cli/stats.ts vote   --chain robinhood --id 66                  # spoke position id
yarn tsx src/cli/position.ts vault --chain ethereum
yarn tsx src/cli/position.ts list  --chain base --address 0xYOUR_WALLET

# Writes — PRIVATE_KEY required; the wallet pays gas in that chain's native asset
yarn tsx src/cli/position.ts stake   --chain base --amount 100 [--pool 0xPOOL --weight 100]
yarn tsx src/cli/position.ts add     --chain base --id 12 --amount 50
yarn tsx src/cli/position.ts unstake --chain base --id 12 [--amount 25]     # after unlockAt
yarn tsx src/cli/vote.ts cast        --chain base --id 12 --pool 0xPOOL --weight 100
yarn tsx src/cli/claim.ts all        --chain base --id 12
yarn tsx src/cli/lp.ts mint-v3       --chain robinhood --t0 WETH --t1 0xTOKEN --ts 50 --range-ticks 500 --amount0 0.1
yarn tsx src/cli/lp.ts stake         --chain robinhood --tokenId 5678        # spoke gauges emit xTOPAZ
yarn tsx src/cli/claim.ts gauge      --chain robinhood --gauge 0xGAUGE --tokenId 5678
yarn tsx src/cli/bribe.ts deposit    --chain base --pool 0xPOOL --token 0xTOKEN --amount 100
```

Arc: trade and provide liquidity with the USDC ERC20 (`USDC` resolves to `0x3600…0000`); native aliases and `--use-native` never attach value there. There is no bridge CLI — build xTOPAZ bridge calldata as in [multichain integration](../developers/multichain-integration.md).

## Programmatic usage

Most CLI commands wrap library functions you can call directly. For app and wallet integrations, prefer transaction builders that return calldata instead of broadcasting with a local private key:

```ts
import { ADDR, buildBestSwapTx } from "./src/index.js";

const batch = await buildBestSwapTx({
  tokenIn: ADDR.WBNB,
  tokenOut: ADDR.TOPAZ,
  amountIn: "0.5",
  recipient: userAddress,
  slippageBps: 100n,
});

// Review and simulate ALL batch.transactions, then submit them in order through
// an atomic wallet/account executor. No Permit2 signature; wallet confirmation required.
```

The default builder uses Topaz API routing and returns `TopazSwapBatch`; see [the migration contract](../references/swapping-api.md). WBNB is ERC20 unless `useBnb: true` is explicit.

For backend agents or ops scripts that intentionally broadcast with `PRIVATE_KEY`, use the write helpers directly:

```ts
import { swapV2 } from "./src/write/swap.js";
import { signer } from "./src/lib/client.js";

const tx = await swapV2({
  tokenIn:  "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",  // WBNB
  tokenOut: "0x55d398326f99059fF775485246999027B3197955",  // USDT
  amountIn: "0.5",         // human-readable
  stable: false,
  slippageBps: 50n,
});
await tx.wait();
```

## Sanity check (after install)

```bash
yarn smoke
```

This runs a read-only sequence: reads several known addresses on-chain, queries the v2 and v3 subgraphs for the top pool, computes an APR for one live gauge, checks `/v1/health` reports BNB ready, and prints PASS/FAIL for each. Useful as a deploy-time test or to verify your RPC endpoint is healthy.

## Safety

- Write functions throw if `PRIVATE_KEY` is missing — they don't silently degrade.
- CLI write commands broadcast once invoked with a configured `PRIVATE_KEY`; use them only after the user has explicitly authorized execution. For no-broadcast wallet flows, use the builders in `src/lib/txBuilders.ts` and `src/lib/actionBuilders.ts`.
- ABIs are loaded from `../references/abis/*.json` so they stay in sync with the documentation.
