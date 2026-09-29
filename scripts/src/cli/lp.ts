// CLI: yarn tsx src/cli/lp.ts <subcommand> [--chain <id|name>] [options]

import minimist from "minimist";
import { addLiquidityV2, removeLiquidityV2 } from "../write/liquidityV2.js";
import {
  mintPosition,
  increaseLiquidity,
  decreaseLiquidity,
  collectFees,
  burnPosition,
} from "../write/liquidityV3.js";
import { stakeLpV2, unstakeLpV2, stakePositionV3, unstakePositionV3 } from "../write/gauge.js";
import { resolveTokenOnChain } from "../config/tokens.js";
import { CHAIN_FLAG_HELP, selectChain } from "../lib/chainOption.js";

const USAGE = `
Usage: yarn tsx src/cli/lp.ts <cmd> [--chain <id|name>] [options]

  add-v2      --a <addr|sym> --b <addr|sym> --amount-a <n> --amount-b <n> [--stable] [--slippage 100] [--use-native]
  remove-v2   --a <addr|sym> --b <addr|sym> --pct <0-100> [--stable] [--slippage 100]
  mint-v3     --t0 <addr|sym> --t1 <addr|sym> --ts <tickSpacing>
              (--range-ticks <n> | --lower-price <p> --upper-price <p>)
              [--amount0 <n>] [--amount1 <n>] [--slippage 100]
  increase-v3 --id <tokenId> --amount0 <wei> --amount1 <wei> [--slippage 100]
  decrease-v3 --id <tokenId> [--pct 100] [--liquidity <wei>]
  collect-v3  --id <tokenId>
  burn-v3     --id <tokenId>
  stake       --pool <addr> --amount <wei>     # v2 LP
  stake       --tokenId <id>                    # v3 position
  unstake     --pool <addr> --amount <wei>
  unstake     --tokenId <id>

  ${CHAIN_FLAG_HELP}

Every chain has v2 + CL pools and gauges; spoke gauges emit xTOPAZ, BNB gauges TOPAZ.
Symbols per chain are listed by "swap.ts help"; 0x addresses work everywhere.
Naming the native symbol (BNB/ETH) on add-v2 attaches msg.value; mint-v3 is ERC20-only
(name WBNB/WETH). Arc has no native leg.
`.trim();

async function main() {
  const argv = minimist(process.argv.slice(2), { string: ["_", "chain", "in", "out", "pool", "gauge", "address", "amount", "amount-a", "amount-b", "amount0", "amount1", "id", "tokenId", "token", "a", "b", "t0", "t1", "from", "to", "lower-price", "upper-price", "duration"] });
  const cmd = argv._[0];
  if (!cmd || cmd === "help" || argv.h || argv.help) {
    console.log(USAGE);
    return;
  }
  const chainId = await selectChain(argv.chain);
  const resolve = (query: string) => resolveTokenOnChain(query, chainId).address;
  switch (cmd) {
    case "add-v2": {
      const a = resolveTokenOnChain(argv.a, chainId);
      const b = resolveTokenOnChain(argv.b, chainId);
      const explicitNative = argv["use-native"] ?? argv["use-bnb"];
      const tx = await addLiquidityV2({
        chainId,
        tokenA: a.address,
        tokenB: b.address,
        stable: !!argv.stable,
        amountADesired: String(argv["amount-a"]),
        amountBDesired: String(argv["amount-b"]),
        slippageBps: BigInt(argv.slippage ?? 100),
        useNative: explicitNative === undefined ? a.native || b.native : explicitNative === true || explicitNative === "true",
      });
      await tx.wait();
      console.log("ok:", tx.hash);
      break;
    }
    case "remove-v2": {
      const tx = await removeLiquidityV2({
        chainId,
        tokenA: resolve(argv.a),
        tokenB: resolve(argv.b),
        stable: !!argv.stable,
        pct: Number(argv.pct ?? 100),
        slippageBps: BigInt(argv.slippage ?? 100),
      });
      await tx.wait();
      console.log("ok:", tx.hash);
      break;
    }
    case "mint-v3": {
      if (resolveTokenOnChain(argv.t0, chainId).native || resolveTokenOnChain(argv.t1, chainId).native)
        throw new Error("mint-v3 is ERC20-only; name the wrapped token (WBNB/WETH)");
      const tx = await mintPosition({
        chainId,
        tokenA: resolve(argv.t0),
        tokenB: resolve(argv.t1),
        tickSpacing: Number(argv.ts),
        rangeTicks: argv["range-ticks"] !== undefined ? Number(argv["range-ticks"]) : undefined,
        lowerPrice: argv["lower-price"] !== undefined ? Number(argv["lower-price"]) : undefined,
        upperPrice: argv["upper-price"] !== undefined ? Number(argv["upper-price"]) : undefined,
        amountA: argv.amount0 !== undefined ? String(argv.amount0) : undefined,
        amountB: argv.amount1 !== undefined ? String(argv.amount1) : undefined,
        slippageBps: BigInt(argv.slippage ?? 100),
      });
      const r = await tx.wait();
      console.log("ok:", r?.hash);
      break;
    }
    case "increase-v3": {
      const tx = await increaseLiquidity({
        chainId,
        tokenId: BigInt(argv.id),
        amount0Desired: BigInt(argv.amount0),
        amount1Desired: BigInt(argv.amount1),
        slippageBps: BigInt(argv.slippage ?? 100),
      });
      await tx.wait();
      console.log("ok:", tx.hash);
      break;
    }
    case "decrease-v3": {
      const tx = await decreaseLiquidity({
        chainId,
        tokenId: BigInt(argv.id),
        liquidityPct: argv.pct !== undefined ? Number(argv.pct) : undefined,
        liquidity: argv.liquidity !== undefined ? BigInt(argv.liquidity) : undefined,
      });
      await tx.wait();
      console.log("ok:", tx.hash);
      break;
    }
    case "collect-v3": {
      const tx = await collectFees({ chainId, tokenId: BigInt(argv.id) });
      await tx.wait();
      console.log("ok:", tx.hash);
      break;
    }
    case "burn-v3": {
      const tx = await burnPosition(BigInt(argv.id), chainId);
      await tx.wait();
      console.log("ok:", tx.hash);
      break;
    }
    case "stake": {
      if (argv.tokenId !== undefined) {
        const tx = await stakePositionV3({ chainId, tokenId: BigInt(argv.tokenId) });
        await tx.wait();
        console.log("ok:", tx.hash);
      } else {
        const tx = await stakeLpV2({ chainId, pool: argv.pool, amount: BigInt(argv.amount) });
        await tx.wait();
        console.log("ok:", tx.hash);
      }
      break;
    }
    case "unstake": {
      if (argv.tokenId !== undefined) {
        const tx = await unstakePositionV3({ chainId, tokenId: BigInt(argv.tokenId) });
        await tx.wait();
        console.log("ok:", tx.hash);
      } else {
        const tx = await unstakeLpV2({ chainId, pool: argv.pool, amount: BigInt(argv.amount) });
        await tx.wait();
        console.log("ok:", tx.hash);
      }
      break;
    }
    default:
      console.error(`unknown command: ${cmd}\n\n${USAGE}`);
      process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
