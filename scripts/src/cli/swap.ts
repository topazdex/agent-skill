// CLI: yarn tsx src/cli/swap.ts <mode> [--chain <id|name>] [options]
//   modes: v2 | v3 | best | quote
//
// Requires PRIVATE_KEY in .env for any actual swap; `quote` and `best` (without --execute) are read-only.

import minimist from "minimist";
import { parseUnits, formatUnits } from "ethers";
import { buildBestSwapTx } from "../lib/txBuilders.js";
import { swapV2, swapV3Single, swapV3Path } from "../write/swap.js";
import { onchainQuoteBundle, bestQuoteBundle, type BestRoute } from "../read/quotes.js";
import { getDecimals, getSymbol } from "../lib/erc20.js";
import { resolveTokenOnChain, type ResolvedToken } from "../config/tokens.js";
import { CHAIN_FLAG_HELP, chainLabel, selectChain } from "../lib/chainOption.js";
import { exitWithError } from "../lib/revertReason.js";

const USAGE = `
Usage: yarn tsx src/cli/swap.ts <mode> [--chain <id|name>] [options]

  v2     --in <token> --out <token> --amount <human> [--stable] [--slippage 50] [--use-native]
  v3     --in <token> --out <token> --amount <human> --ts <tickSpacing> [--slippage 100]
  best   --in <token> --out <token> --amount <human> [--payer <addr>] [--execute] [--prefer v2|v3]
  quote  --in <token> --out <token> --amount <human>

  ${CHAIN_FLAG_HELP}

Default quote/best use quote.topazdex.com on the selected chain, including split
and mixed CL/v2 routes. Pass --payer <executing-account> to best to print the
complete signature-free Permit2 approval + swap batch. Submit every returned call
atomically through your wallet/account adapter (e.g. Topaz ID sendCalls with
atomicRequired). This CLI does not broadcast API batches. Explicit --prefer v2|v3
keeps the legacy direct-router execution path.

Tokens accept a 0x… address on every chain. Symbols:
  BNB Chain: BNB (native) / WBNB, TOPAZ, USDT, USDC, USD1, FDUSD, BTCB, ETH, SOL,
             XRP, CAKE, DOGE, BLUE, … (see references/tokens.md)
  Robinhood / Base / Ethereum: ETH (native), WETH, xTOPAZ
  Arc: USDC (the 6-decimal ERC20; Arc has no native DEX legs), xTOPAZ
Native assets: in v2 and best --payer, naming the native symbol (BNB/ETH) swaps
the native asset and the wrapped token stays an ERC20 unless --use-native is
passed. v3 and best --execute trade ERC20s only: name WBNB/WETH there. Arc has no
native DEX leg. Find other addresses with
GET https://api.topazdex.com/v1/tokens?chainIds=<id>.
`.trim();

function isTruthyFlag(value: unknown): boolean {
  return value === true || value === "true";
}

function requireErc20Legs(mode: string, ...tokens: ResolvedToken[]): void {
  if (tokens.some((t) => t.native))
    throw new Error(`${mode} trades ERC20s only; name the wrapped token (WBNB/WETH), or use v2 / best --payer for native`);
}

function useNative(argv: minimist.ParsedArgs, tokenIn: ResolvedToken, tokenOut: ResolvedToken): boolean {
  const explicit = argv["use-native"] ?? argv["use-bnb"];
  if (explicit !== undefined) return isTruthyFlag(explicit);
  return tokenIn.native || tokenOut.native;
}

async function cmdV2(argv: minimist.ParsedArgs, chainId: number) {
  const tokenIn = resolveTokenOnChain(argv.in, chainId);
  const tokenOut = resolveTokenOnChain(argv.out, chainId);
  const tx = await swapV2({
    chainId,
    tokenIn: tokenIn.address,
    tokenOut: tokenOut.address,
    amountIn: String(argv.amount),
    stable: !!argv.stable,
    slippageBps: BigInt(argv.slippage ?? 50),
    useNative: useNative(argv, tokenIn, tokenOut),
  });
  console.log("tx:", tx.hash);
  await tx.wait();
  console.log("mined");
}

async function cmdV3(argv: minimist.ParsedArgs, chainId: number) {
  const tokenIn = resolveTokenOnChain(argv.in, chainId);
  const tokenOut = resolveTokenOnChain(argv.out, chainId);
  requireErc20Legs("swap v3", tokenIn, tokenOut);
  const tx = await swapV3Single({
    chainId,
    tokenIn: tokenIn.address,
    tokenOut: tokenOut.address,
    amountIn: String(argv.amount),
    tickSpacing: Number(argv.ts ?? 200),
    slippageBps: BigInt(argv.slippage ?? 100),
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

async function describePair(argv: minimist.ParsedArgs, chainId: number) {
  const tokenIn = resolveTokenOnChain(argv.in, chainId);
  const tokenOut = resolveTokenOnChain(argv.out, chainId);
  const [decIn, decOut, symIn, symOut] = await Promise.all([
    getDecimals(tokenIn.address, chainId),
    getDecimals(tokenOut.address, chainId),
    getSymbol(tokenIn.address, chainId),
    getSymbol(tokenOut.address, chainId),
  ]);
  const amountIn = parseUnits(String(argv.amount), decIn);
  return { tokenIn, tokenOut, decOut, symIn, symOut, amountIn };
}

async function cmdQuote(argv: minimist.ParsedArgs, chainId: number) {
  const { tokenIn, tokenOut, decOut, symIn, symOut, amountIn } = await describePair(argv, chainId);
  const bundle = await bestQuoteBundle(tokenIn.address, tokenOut.address, amountIn, chainId);

  console.log(`Quoting ${argv.amount} ${symIn} → ${symOut} on ${chainLabel(chainId)}\n`);
  if (bundle.topaz) console.log(formatRoute("Topaz API", bundle.topaz, decOut, symOut));
  else {
    console.log(formatRoute("v2 (basic)", bundle.v2, decOut, symOut));
    console.log(formatRoute("v3 (concentrated)", bundle.v3, decOut, symOut));
  }
  if (bundle.best) {
    console.log(`\nBest overall: ${bundle.best.route}`);
  }
}

async function cmdBest(argv: minimist.ParsedArgs, chainId: number) {
  const { tokenIn, tokenOut, decOut, symIn, symOut, amountIn } = await describePair(argv, chainId);
  if (argv.prefer && !["v2", "v3"].includes(String(argv.prefer))) throw new Error("--prefer must be v2 or v3");
  const bundle = argv.prefer
    ? await onchainQuoteBundle(tokenIn.address, tokenOut.address, amountIn, { chainId })
    : await bestQuoteBundle(tokenIn.address, tokenOut.address, amountIn, chainId);

  console.log(`Routing ${argv.amount} ${symIn} → ${symOut} on ${chainLabel(chainId)}\n`);
  if (bundle.topaz) console.log(formatRoute("Topaz API", bundle.topaz, decOut, symOut));
  else {
    console.log(formatRoute("v2 (basic)", bundle.v2, decOut, symOut));
    console.log(formatRoute("v3 (concentrated)", bundle.v3, decOut, symOut));
  }

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
  console.log(`  exec: ${JSON.stringify(chosen.exec, (_k, v) => (typeof v === "bigint" ? v.toString() : v))}`);

  const slippageBps = BigInt(argv.slippage ?? 100);
  if (chosen.exec.type === "topaz-api") {
    if (argv.execute) throw new Error("API swaps require an atomic wallet/account batch; use --payer to build its calls, then submit with your wallet adapter.");
    if (argv.payer) {
      const batch = await buildBestSwapTx({ chainId, tokenIn: tokenIn.address, tokenOut: tokenOut.address,
        amountIn, recipient: String(argv.payer), slippageBps, useBnb: useNative(argv, tokenIn, tokenOut) });
      console.log(JSON.stringify(batch, null, 2));
    }
    return;
  }
  if (!argv.execute) return;
  requireErc20Legs("best --execute", tokenIn, tokenOut);

  if (chosen.exec.type === "v2") {
    const { coreContract } = await import("../lib/contracts.js");
    const { contractAddress } = await import("../config/deployments.js");
    const { signer } = await import("../lib/client.js");
    const { approveIfNeeded } = await import("../lib/erc20.js");
    const s = signer(chainId);
    const r = coreContract("Router", chainId, s);
    const amountOutMin = (chosen.amountOut * (10_000n - slippageBps)) / 10_000n;
    const deadline = Math.floor(Date.now() / 1000) + 60 * 20;
    await approveIfNeeded(tokenIn.address, contractAddress(chainId, "Router"), amountIn, { chainId });
    const tx = await r.swapExactTokensForTokens(
      amountIn,
      amountOutMin,
      chosen.exec.route,
      await s.getAddress(),
      deadline
    );
    console.log("tx:", tx.hash);
    await tx.wait();
  } else if (chosen.exec.type === "v3-single") {
    const tx = await swapV3Single({
      chainId,
      tokenIn: chosen.exec.tokenIn,
      tokenOut: chosen.exec.tokenOut,
      amountIn,
      tickSpacing: chosen.exec.tickSpacing,
      slippageBps,
    });
    console.log("tx:", tx.hash);
    await tx.wait();
  } else if (chosen.exec.type === "v3-path") {
    const tx = await swapV3Path({
      chainId,
      tokens: chosen.exec.tokens,
      spacings: chosen.exec.spacings,
      amountIn,
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
  const argv = minimist(process.argv.slice(2), { string: ["_", "chain", "in", "out", "pool", "gauge", "address", "amount", "amount-a", "amount-b", "amount0", "amount1", "id", "tokenId", "token", "a", "b", "t0", "t1", "from", "to", "lower-price", "upper-price", "duration", "prefer", "payer"] });
  const mode = argv._[0];
  if (!mode || mode === "help" || argv.h || argv.help) {
    console.log(USAGE);
    return;
  }
  const chainId = await selectChain(argv.chain);
  switch (mode) {
    case "v2": return await cmdV2(argv, chainId);
    case "v3": return await cmdV3(argv, chainId);
    case "best": return await cmdBest(argv, chainId);
    case "quote": return await cmdQuote(argv, chainId);
    default:
      console.error(`unknown mode: ${mode}\n\n${USAGE}`);
      process.exit(1);
  }
}

main().catch(exitWithError);
