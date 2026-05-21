# Topaz skill — scripts

TypeScript + ethers v6 helpers for interacting with Topaz Dex on BNB Chain Mainnet. Used by the Topaz Claude Code skill, but invokable directly.

## Setup

```bash
cd ~/topaz/topaz-skill/scripts
cp .env.example .env       # fill in BSC_RPC_URL (required) and PRIVATE_KEY (required for writes)
yarn install
```

Requires Node ≥ 20. Uses [`tsx`](https://www.npmjs.com/package/tsx) — no compilation step needed.

## Layout

```
src/
├── config/
│   ├── addresses.ts    # All BNB Mainnet contract addresses
│   ├── chain.ts        # Chain id 56, RPC defaults
│   └── tokens.ts       # WBNB / TOPAZ / common BSC tokens
├── lib/
│   ├── client.ts       # provider() + signer() factories from env
│   ├── erc20.ts        # balanceOf, allowance, approveIfNeeded, decimals cache
│   ├── abis.ts         # Loads JSON ABIs from ../../references/abis
│   ├── subgraph.ts     # GraphQLClient instances for v2 + v3
│   ├── tickMath.ts     # sqrtPriceX96 <-> price <-> tick (Uniswap V3 SDK math)
│   ├── path.ts         # v3 path encode/decode + mixed-route sentinels
│   ├── pricing.ts      # Token USD price (subgraph or DexScreener)
│   └── epoch.ts        # WEEK / epochStart / vote window helpers
├── read/               # No-signer reads (RPC + subgraph)
│   ├── pools.ts        # v2/v3 unified pool info
│   ├── positions.ts    # v3 NFT positions
│   ├── gauges.ts       # gauge state, all-gauges enum
│   ├── locks.ts        # veTOPAZ locks
│   ├── votes.ts        # current vote per veNFT
│   ├── claimable.ts    # all four reward streams
│   ├── apr.ts          # gauge / fee / voting / rebase APR
│   ├── quotes.ts       # v2 / v3 / mixed quoting + best-route search
│   └── subgraphQueries.ts
├── write/              # Requires PRIVATE_KEY
│   ├── swap.ts
│   ├── liquidityV2.ts
│   ├── liquidityV3.ts
│   ├── gauge.ts
│   ├── lock.ts
│   ├── vote.ts
│   ├── claim.ts
│   └── bribe.ts
└── cli/                # `yarn tsx src/cli/<cmd>.ts ...`
    ├── stats.ts
    ├── swap.ts
    ├── lp.ts
    ├── lock.ts
    ├── vote.ts
    ├── claim.ts
    └── bribe.ts
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
yarn tsx src/cli/stats.ts bribes --pool 0xPOOL
yarn tsx src/cli/stats.ts apr --pool 0xPOOL [--position 1234]
yarn tsx src/cli/stats.ts smoke                 # quick end-to-end sanity check

# Writes — PRIVATE_KEY required
yarn tsx src/cli/swap.ts v2  --in 0xWBNB --out 0xUSDT --amount 0.5 --slippage 50
yarn tsx src/cli/swap.ts v3  --in 0xTOPAZ --out 0xWBNB --amount 100 --ts 200 --slippage 100
yarn tsx src/cli/swap.ts best --in 0xA --out 0xB --amount 10 [--execute]

yarn tsx src/cli/lp.ts add-v2     --a 0xA --b 0xB --amount-a 1 [--stable] [--slippage 100] [--stake]
yarn tsx src/cli/lp.ts remove-v2  --a 0xA --b 0xB --pct 100 [--stable] [--unstake] [--claim]
yarn tsx src/cli/lp.ts mint-v3    --t0 0xA --t1 0xB --ts 200 --range-ticks 50 --amount0 1000 [--stake]
yarn tsx src/cli/lp.ts close-v3   --id 5678
yarn tsx src/cli/lp.ts stake      --tokenId 5678
yarn tsx src/cli/lp.ts unstake    --tokenId 5678

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
yarn tsx src/cli/claim.ts gauge     --tokenId 5678        # CL position
yarn tsx src/cli/claim.ts gauge-v2  --pool 0xPOOL
yarn tsx src/cli/claim.ts fees      --id 1234
yarn tsx src/cli/claim.ts bribes    --id 1234
yarn tsx src/cli/claim.ts rebase    --id 1234

yarn tsx src/cli/bribe.ts deposit --pool 0xPOOL --token 0xUSDC --amount 5000
```

## Programmatic usage

Most CLI commands wrap library functions you can call directly. For app and wallet integrations, prefer transaction builders that return calldata instead of broadcasting with a local private key:

```ts
import { ADDR, buildBestSwapTx } from "./src/index.js";

const tx = await buildBestSwapTx({
  tokenIn: ADDR.WBNB,
  tokenOut: ADDR.TOPAZ,
  amountIn: "0.5",
  recipient: userAddress,
  slippageBps: 100n,
});

// Submit with a wallet/provider of your choice:
// await signer.sendTransaction({ to: tx.to, data: tx.data, value: tx.value });
```

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

This runs a read-only sequence: reads several known addresses on-chain, queries the v2 and v3 subgraphs for the top pool, computes an APR for one live gauge, and prints PASS/FAIL for each. Useful as a deploy-time test or to verify your RPC endpoint is healthy.

## Safety

- Write functions throw if `PRIVATE_KEY` is missing — they don't silently degrade.
- Every CLI write command prints a confirmation prompt with the parsed parameters before broadcasting, unless `--yes` is passed (intended for scripts).
- ABIs are loaded from `../references/abis/*.json` so they stay in sync with the documentation.
