// CLI: yarn tsx src/cli/lp.ts <subcommand> [options]

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
import { findToken } from "../config/tokens.js";

const USAGE = `
Usage: yarn tsx src/cli/lp.ts <cmd> [options]

  add-v2      --a <addr|sym> --b <addr|sym> --amount-a <n> --amount-b <n> [--stable] [--slippage 100] [--use-bnb=true]
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
`.trim();

function resolve(t: string): string {
  const f = findToken(t);
  if (f) return f.address;
  if (t.startsWith("0x") && t.length === 42) return t;
  throw new Error(`unknown token: ${t}`);
}

async function main() {
  const argv = minimist(process.argv.slice(2), { string: ["_", "in", "out", "pool", "gauge", "address", "amount", "amount-a", "amount-b", "amount0", "amount1", "id", "tokenId", "token", "a", "b", "t0", "t1", "from", "to", "lower-price", "upper-price", "duration"] });
  const cmd = argv._[0];
  if (!cmd || cmd === "help" || argv.h || argv.help) {
    console.log(USAGE);
    return;
  }
  switch (cmd) {
    case "add-v2": {
      const tx = await addLiquidityV2({
        tokenA: resolve(argv.a),
        tokenB: resolve(argv.b),
        stable: !!argv.stable,
        amountADesired: String(argv["amount-a"]),
        amountBDesired: String(argv["amount-b"]),
        slippageBps: BigInt(argv.slippage ?? 100),
        useBnb: argv["use-bnb"] === false ? false : true,
      });
      await tx.wait();
      console.log("ok:", tx.hash);
      break;
    }
    case "remove-v2": {
      const tx = await removeLiquidityV2({
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
      const tx = await mintPosition({
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
        tokenId: BigInt(argv.id),
        liquidityPct: argv.pct !== undefined ? Number(argv.pct) : undefined,
        liquidity: argv.liquidity !== undefined ? BigInt(argv.liquidity) : undefined,
      });
      await tx.wait();
      console.log("ok:", tx.hash);
      break;
    }
    case "collect-v3": {
      const tx = await collectFees({ tokenId: BigInt(argv.id) });
      await tx.wait();
      console.log("ok:", tx.hash);
      break;
    }
    case "burn-v3": {
      const tx = await burnPosition(BigInt(argv.id));
      await tx.wait();
      console.log("ok:", tx.hash);
      break;
    }
    case "stake": {
      if (argv.tokenId !== undefined) {
        const tx = await stakePositionV3({ tokenId: BigInt(argv.tokenId) });
        await tx.wait();
        console.log("ok:", tx.hash);
      } else {
        const tx = await stakeLpV2({ pool: argv.pool, amount: BigInt(argv.amount) });
        await tx.wait();
        console.log("ok:", tx.hash);
      }
      break;
    }
    case "unstake": {
      if (argv.tokenId !== undefined) {
        const tx = await unstakePositionV3({ tokenId: BigInt(argv.tokenId) });
        await tx.wait();
        console.log("ok:", tx.hash);
      } else {
        const tx = await unstakeLpV2({ pool: argv.pool, amount: BigInt(argv.amount) });
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
