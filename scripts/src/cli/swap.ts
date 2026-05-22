// CLI: yarn tsx src/cli/swap.ts <mode> [options]
//   modes: v2 | v3 | best | quote
//
// Requires PRIVATE_KEY in .env for any actual swap; `quote` and `best` (without --execute) are read-only.

import minimist from "minimist";
import { parseUnits, formatUnits } from "ethers";
import { swapV2, swapV3Single, swapV3Path } from "../write/swap.js";
import { bestQuoteBundle, type BestRoute } from "../read/quotes.js";
import { getDecimals, getSymbol } from "../lib/erc20.js";
import { findToken } from "../config/tokens.js";

const USAGE = `
Usage: yarn tsx src/cli/swap.ts <mode> [options]

  v2     --in <addr> --out <addr> --amount <human> [--stable] [--slippage 50] [--use-bnb=true]
  v3     --in <addr> --out <addr> --amount <human> --ts <tickSpacing> [--slippage 100]
  best   --in <addr> --out <addr> --amount <human> [--execute] [--prefer v2|v3]
  quote  --in <addr> --out <addr> --amount <human>

Both \`quote\` and \`best\` enumerate routes for v2 (volatile + stable, up to 3 hops)
and v3 / concentrated liquidity (every tick spacing combination, up to 3 hops)
separately. The two stacks are never mixed in a single route — Topaz has no atomic
mixed-route executor today. Intermediaries used for the search: USDT, BNB/WBNB,
BTCB, ETH, TOPAZ, USDC.

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

function formatRoute(
  label: string,
  best: BestRoute | null,
  decOut: number,
  symOut: string,
): string {
  if (!best) return `  ${label}: no viable route`;
  const human = formatUnits(best.amountOut, decOut);
  const impact =
    best.priceImpactPct !== undefined
      ? ` (price impact ${(best.priceImpactPct * 100).toFixed(2)}%)`
      : "";
  return `  ${label}: ${best.route}\n    → ${human} ${symOut}${impact}`;
}

async function cmdQuote(argv: any) {
  const tokenIn = resolveToken(argv.in);
  const tokenOut = resolveToken(argv.out);
  const decIn = await getDecimals(tokenIn);
  const decOut = await getDecimals(tokenOut);
  const [symIn, symOut] = await Promise.all([getSymbol(tokenIn), getSymbol(tokenOut)]);
  const amountIn = parseUnits(String(argv.amount), decIn);
  const bundle = await bestQuoteBundle(tokenIn, tokenOut, amountIn);

  console.log(`Quoting ${argv.amount} ${symIn} → ${symOut}\n`);
  console.log(formatRoute("v2 (basic)", bundle.v2, decOut, symOut));
  console.log(formatRoute("v3 (concentrated)", bundle.v3, decOut, symOut));
  if (bundle.best) {
    console.log(`\nBest overall: ${bundle.best.route}`);
  }
}

async function cmdBest(argv: any) {
  const tokenIn = resolveToken(argv.in);
  const tokenOut = resolveToken(argv.out);
  const decIn = await getDecimals(tokenIn);
  const decOut = await getDecimals(tokenOut);
  const [symIn, symOut] = await Promise.all([getSymbol(tokenIn), getSymbol(tokenOut)]);
  const amount = parseUnits(String(argv.amount), decIn);
  const bundle = await bestQuoteBundle(tokenIn, tokenOut, amount);

  console.log(`Routing ${argv.amount} ${symIn} → ${symOut}\n`);
  console.log(formatRoute("v2 (basic)", bundle.v2, decOut, symOut));
  console.log(formatRoute("v3 (concentrated)", bundle.v3, decOut, symOut));

  const prefer = String(argv.prefer ?? "").toLowerCase();
  const chosen =
    prefer === "v2" ? bundle.v2 :
    prefer === "v3" ? bundle.v3 :
    bundle.best;
  if (!chosen) {
    console.log("\nNo viable route on the requested stack.");
    return;
  }
  console.log(`\nChosen: ${chosen.route}`);
  console.log(`  amountOut: ${formatUnits(chosen.amountOut, decOut)} ${symOut}`);
  console.log(`  exec: ${JSON.stringify(chosen.exec)}`);

  if (!argv.execute) return;

  const slippageBps = BigInt(argv.slippage ?? 100);
  if (chosen.exec.type === "v2") {
    const { Contract } = await import("ethers");
    const { signer } = await import("../lib/client.js");
    const { ADDR } = await import("../config/addresses.js");
    const { ABIS } = await import("../lib/abis.js");
    const { approveIfNeeded } = await import("../lib/erc20.js");
    const r = new Contract(ADDR.Router, ABIS.Router, signer());
    const amountOutMin = (chosen.amountOut * (10_000n - slippageBps)) / 10_000n;
    const deadline = Math.floor(Date.now() / 1000) + 60 * 20;
    await approveIfNeeded(tokenIn, ADDR.Router, amount);
    const tx = await r.swapExactTokensForTokens(
      amount,
      amountOutMin,
      chosen.exec.route,
      await signer().getAddress(),
      deadline
    );
    console.log("tx:", tx.hash);
    await tx.wait();
  } else if (chosen.exec.type === "v3-single") {
    const tx = await swapV3Single({
      tokenIn: chosen.exec.tokenIn,
      tokenOut: chosen.exec.tokenOut,
      amountIn: amount,
      tickSpacing: chosen.exec.tickSpacing,
      slippageBps,
    });
    console.log("tx:", tx.hash);
    await tx.wait();
  } else if (chosen.exec.type === "v3-path") {
    const tx = await swapV3Path({
      tokens: chosen.exec.tokens,
      spacings: chosen.exec.spacings,
      amountIn: amount,
      slippageBps,
    });
    console.log("tx:", tx.hash);
    await tx.wait();
  } else {
    throw new Error(
      `unsupported exec route type "${chosen.exec.type}" — the v2/v3-separated enumerator never returns mixed routes`,
    );
  }
}

async function main() {
  const argv = minimist(process.argv.slice(2), { string: ["_", "in", "out", "pool", "gauge", "address", "amount", "amount-a", "amount-b", "amount0", "amount1", "id", "tokenId", "token", "a", "b", "t0", "t1", "from", "to", "lower-price", "upper-price", "duration", "prefer"] });
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
