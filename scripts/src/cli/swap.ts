// CLI: yarn tsx src/cli/swap.ts <mode> [options]
//   modes: v2 | v3 | best | quote
//
// Requires PRIVATE_KEY in .env for any actual swap; `quote` and `best` (without --execute) are read-only.

import minimist from "minimist";
import { parseUnits, formatUnits } from "ethers";
import { swapV2, swapV3Single, swapV3Path } from "../write/swap.js";
import { bestQuote, quoteHuman } from "../read/quotes.js";
import { getDecimals, getSymbol } from "../lib/erc20.js";
import { findToken } from "../config/tokens.js";

const USAGE = `
Usage: yarn tsx src/cli/swap.ts <mode> [options]

  v2     --in <addr> --out <addr> --amount <human> [--stable] [--slippage 50] [--use-bnb=true]
  v3     --in <addr> --out <addr> --amount <human> --ts <tickSpacing> [--slippage 100]
  best   --in <addr> --out <addr> --amount <human> [--execute]
  quote  --in <addr> --out <addr> --amount <human>

Tokens accept either a 0x… address OR a symbol. Built-in symbols include
  BNB / WBNB, TOPAZ, USDT, USDC, USD1, FDUSD, BTCB, ETH, SOL, XRP, CAKE, DOGE,
  BLUE, gBLUE, BOOK, BUD, Broccoli, CaptainBNB, ClipX, EARN, $RISE, Trusty,
  bibi, NianNian. See references/tokens.md for the canonical list.
`.trim();

function resolveToken(query: string): string {
  const t = findToken(query);
  if (!t) {
    if (query.startsWith("0x") && query.length === 42) return query;
    throw new Error(`unknown token: ${query}`);
  }
  return t.address;
}

async function cmdV2(argv: any) {
  const tokenIn = resolveToken(argv.in);
  const tokenOut = resolveToken(argv.out);
  const stable = !!argv.stable;
  const slippageBps = BigInt(argv.slippage ?? 50);
  const useBnb = argv["use-bnb"] === false ? false : true;

  const tx = await swapV2({
    tokenIn,
    tokenOut,
    amountIn: String(argv.amount),
    stable,
    slippageBps,
    useBnb,
  });
  console.log("tx:", tx.hash);
  await tx.wait();
  console.log("mined");
}

async function cmdV3(argv: any) {
  const tokenIn = resolveToken(argv.in);
  const tokenOut = resolveToken(argv.out);
  const tickSpacing = Number(argv.ts ?? 200);
  const slippageBps = BigInt(argv.slippage ?? 100);

  const tx = await swapV3Single({
    tokenIn,
    tokenOut,
    amountIn: String(argv.amount),
    tickSpacing,
    slippageBps,
  });
  console.log("tx:", tx.hash);
  await tx.wait();
  console.log("mined");
}

async function cmdQuote(argv: any) {
  const tokenIn = resolveToken(argv.in);
  const tokenOut = resolveToken(argv.out);
  const q = await quoteHuman(tokenIn, tokenOut, String(argv.amount));
  const [symIn, symOut] = await Promise.all([getSymbol(tokenIn), getSymbol(tokenOut)]);
  console.log(`Best route: ${q.best.route}`);
  console.log(`  ${argv.amount} ${symIn} → ${q.amountOutHuman} ${symOut}`);
}

async function cmdBest(argv: any) {
  const tokenIn = resolveToken(argv.in);
  const tokenOut = resolveToken(argv.out);
  const decIn = await getDecimals(tokenIn);
  const amount = parseUnits(String(argv.amount), decIn);
  const best = await bestQuote(tokenIn, tokenOut, amount);
  const decOut = await getDecimals(tokenOut);
  console.log(`Best route: ${best.route}`);
  console.log(`  amountOut: ${formatUnits(best.amountOut, decOut)}`);
  console.log(`  exec:`, JSON.stringify(best.exec));
  if (argv.execute) {
    const slippageBps = BigInt(argv.slippage ?? 100);
    if (best.exec.type === "v2") {
      // Use lowest-level executor since route can be multi-hop
      const { Contract } = await import("ethers");
      const { signer } = await import("../lib/client.js");
      const { ADDR } = await import("../config/addresses.js");
      const { ABIS } = await import("../lib/abis.js");
      const { approveIfNeeded } = await import("../lib/erc20.js");
      const r = new Contract(ADDR.Router, ABIS.Router, signer());
      const amountOutMin = (best.amountOut * (10_000n - slippageBps)) / 10_000n;
      const deadline = Math.floor(Date.now() / 1000) + 60 * 20;
      await approveIfNeeded(tokenIn, ADDR.Router, amount);
      const tx = await r.swapExactTokensForTokens(
        amount,
        amountOutMin,
        best.exec.route,
        await signer().getAddress(),
        deadline
      );
      console.log("tx:", tx.hash);
      await tx.wait();
    } else if (best.exec.type === "v3-single") {
      const tx = await swapV3Single({
        tokenIn: best.exec.tokenIn,
        tokenOut: best.exec.tokenOut,
        amountIn: amount,
        tickSpacing: best.exec.tickSpacing,
        slippageBps,
      });
      console.log("tx:", tx.hash);
      await tx.wait();
    } else if (best.exec.type === "v3-path") {
      const tx = await swapV3Path({
        tokens: best.exec.tokens,
        spacings: best.exec.spacings,
        amountIn: amount,
        slippageBps,
      });
      console.log("tx:", tx.hash);
      await tx.wait();
    } else {
      console.log(
        "[skip] mixed-route execution is not atomic in this skill; run each leg manually (see examples/swap-mixed-route.md)"
      );
    }
  }
}

async function main() {
  const argv = minimist(process.argv.slice(2), { string: ["_", "in", "out", "pool", "gauge", "address", "amount", "amount-a", "amount-b", "amount0", "amount1", "id", "tokenId", "token", "a", "b", "t0", "t1", "from", "to", "lower-price", "upper-price", "duration"] });
  const mode = argv._[0];
  if (!mode || mode === "help" || argv.h || argv.help) {
    console.log(USAGE);
    return;
  }
  switch (mode) {
    case "v2": return await cmdV2(argv);
    case "v3": return await cmdV3(argv);
    case "best": return await cmdBest(argv);
    case "quote": return await cmdQuote(argv);
    default:
      console.error(`unknown mode: ${mode}\n\n${USAGE}`);
      process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
