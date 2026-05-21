// CLI: yarn tsx src/cli/stats.ts <cmd> [args]
// Read-only diagnostics. Does not require PRIVATE_KEY.

import minimist from "minimist";
import { formatUnits } from "ethers";
import { getPool } from "../read/pools.js";
import {
  getGaugeStateForPool,
  listAllPools,
  getBribeInfo,
} from "../read/gauges.js";
import { getLock, listUserLocks } from "../read/locks.js";
import { getVote } from "../read/votes.js";
import { getPosition, listOwnerPositions } from "../read/positions.js";
import { claimableSummary } from "../read/claimable.js";
import { poolApr, rebaseApr, votingApr } from "../read/apr.js";
import { quoteHuman } from "../read/quotes.js";
import { TOKENS, findToken } from "../config/tokens.js";
import { getSymbol, getDecimals } from "../lib/erc20.js";
import { topV2Pools, topV3Pools } from "../read/subgraphQueries.js";
import { provider } from "../lib/client.js";
import { fmtEpoch } from "../lib/epoch.js";

const USAGE = `
Usage: yarn tsx src/cli/stats.ts <command> [options]

Commands:
  pool <address>                Full pool snapshot (v2 or v3 auto-detected)
  gauge <pool>                  Gauge state for a pool
  position --id <tokenId>       v3 position details
  lock --id <tokenId>           veNFT lock details
  vote --id <tokenId>           Current vote allocation for a veNFT
  claimable --id <tokenId> --address <addr>   All four reward streams
  gauges [--limit 50]           List gauges (subgraph TVL-sorted; on-chain APR)
  bribes --pool <address>       This-epoch bribes posted on a pool
  apr --pool <address>          Pool APR breakdown
  quote --in <addr> --out <addr> --amount <human>   Best-route quote
  smoke                         End-to-end sanity check (verifies RPC + subgraphs + ABIs)
`.trim();

async function cmdPool(argv: any) {
  const addr = argv._[1];
  if (!addr) throw new Error("usage: pool <address>");
  const info = await getPool(addr);
  console.log("Pool:", info.address);
  console.log("  type:", info.type);
  console.log("  tokens:", `${info.symbol0} (${info.decimals0}) / ${info.symbol1} (${info.decimals1})`);
  if (info.type === "v2") {
    console.log("  stable:", info.stable);
    console.log("  fee:", `${info.fee} (= ${(info.fee / 100).toFixed(2)} bps = ${(info.fee / 10000).toFixed(4)}%)`);
    console.log(`  reserves: ${formatUnits(info.reserve0, info.decimals0)} / ${formatUnits(info.reserve1, info.decimals1)}`);
    console.log("  totalSupply (LP):", info.totalSupply.toString());
  } else {
    console.log("  tickSpacing:", info.tickSpacing);
    console.log("  fee:", `${info.fee} pips (${(info.fee / 10000).toFixed(2)}%)`);
    console.log("  unstakedFee:", `${info.unstakedFee} pips`);
    console.log("  tick:", info.tick);
    console.log("  sqrtPriceX96:", info.sqrtPriceX96.toString());
    console.log("  liquidity:", info.liquidity.toString());
    console.log("  stakedLiquidity:", info.stakedLiquidity.toString());
  }
  const gs = await getGaugeStateForPool(info.address);
  if (gs) {
    console.log("  gauge:", gs.gauge, gs.alive ? "(alive)" : "(KILLED)");
    console.log("    rewardRate:", gs.rewardRate.toString(), "TOPAZ wei/s");
    console.log("    periodFinish:", fmtEpoch(Number(gs.periodFinish)));
    console.log("    weight:", gs.weight.toString());
    console.log("    feesVotingReward:", gs.feesVotingReward);
    console.log("    bribeVotingReward:", gs.bribeVotingReward);
  } else {
    console.log("  gauge: none");
  }
}

async function cmdGauge(argv: any) {
  const pool = argv._[1];
  if (!pool) throw new Error("usage: gauge <pool>");
  const gs = await getGaugeStateForPool(pool);
  console.log(JSON.stringify(serialize(gs), null, 2));
}

async function cmdPosition(argv: any) {
  if (!argv.id) throw new Error("usage: position --id <tokenId>");
  const p = await getPosition(BigInt(argv.id));
  console.log(JSON.stringify(serialize(p), null, 2));
}

async function cmdLock(argv: any) {
  if (!argv.id) throw new Error("usage: lock --id <tokenId>");
  const l = await getLock(BigInt(argv.id));
  console.log(JSON.stringify(serialize(l), null, 2));
}

async function cmdVote(argv: any) {
  if (!argv.id) throw new Error("usage: vote --id <tokenId>");
  const v = await getVote(BigInt(argv.id));
  console.log(JSON.stringify(serialize(v), null, 2));
}

async function cmdClaimable(argv: any) {
  if (!argv.id) throw new Error("--id required");
  if (!argv.address) throw new Error("--address required");
  const s = await claimableSummary(BigInt(argv.id), argv.address, { includeUsd: true });
  console.log(JSON.stringify(serialize(s), null, 2));
}

async function cmdGauges(argv: any) {
  const limit = Number(argv.limit ?? 20);
  const pools = (await listAllPools()).slice(0, limit);
  console.log(`pool                                          gauge                                         weight`);
  for (const p of pools) {
    const gs = await getGaugeStateForPool(p);
    if (!gs) continue;
    console.log(`${p} ${gs.gauge} ${gs.weight.toString()}  ${gs.alive ? "alive" : "killed"}`);
  }
}

async function cmdBribes(argv: any) {
  if (!argv.pool) throw new Error("--pool required");
  const info = await getBribeInfo(argv.pool);
  if (!info) {
    console.log("No gauge / no bribe contract for that pool");
    return;
  }
  console.log("Bribe contract:", info.bribeContract);
  for (let i = 0; i < info.rewardTokens.length; i++) {
    const t = info.rewardTokens[i];
    const a = info.perEpochAmounts[i];
    const [sym, dec] = await Promise.all([getSymbol(t), getDecimals(t)]);
    console.log(`  ${sym.padEnd(8)} ${t}  this epoch: ${formatUnits(a, dec)}`);
  }
}

async function cmdApr(argv: any) {
  if (!argv.pool) throw new Error("--pool required");
  const apr = await poolApr(argv.pool);
  const voting = await votingApr(argv.pool).catch(() => 0);
  const serialized = serialize(apr) as Record<string, unknown>;
  console.log(JSON.stringify({ ...serialized, votingApr: voting }, null, 2));
}

function resolveTokenArg(query: string): string {
  const t = findToken(query);
  if (t) return t.address;
  if (query.startsWith("0x") && query.length === 42) return query;
  throw new Error(`unknown token: ${query}`);
}

async function cmdQuote(argv: any) {
  if (!argv.in || !argv.out || !argv.amount) throw new Error("--in --out --amount required");
  const tokenIn = resolveTokenArg(String(argv.in));
  const tokenOut = resolveTokenArg(String(argv.out));
  const q = await quoteHuman(tokenIn, tokenOut, String(argv.amount));
  console.log(JSON.stringify({
    best: { route: q.best.route, amountOut: q.best.amountOut.toString() },
    human: `${argv.amount} → ${q.amountOutHuman}`,
  }, null, 2));
}

async function cmdSmoke() {
  const out: string[] = [];
  const ok = (label: string, val: unknown) => out.push(`[PASS] ${label}: ${val}`);
  const fail = (label: string, err: unknown) =>
    out.push(`[FAIL] ${label}: ${(err as Error).message ?? err}`);

  try {
    const block = await provider().getBlockNumber();
    ok("RPC blockNumber", block);
  } catch (e) {
    fail("RPC blockNumber", e);
  }

  try {
    const pools = await topV3Pools(3);
    ok("v3 subgraph", `top pool TVL=${pools[0]?.totalValueLockedUSD ?? "(none)"}`);
  } catch (e) {
    fail("v3 subgraph", e);
  }

  try {
    const pairs = await topV2Pools(3);
    ok("v2 subgraph", `top pair TVL=${pairs[0]?.reserveUSD ?? "(none)"}`);
  } catch (e) {
    fail("v2 subgraph", e);
  }

  try {
    const sym = await getSymbol(TOKENS.TOPAZ.address);
    ok("ERC20.symbol(TOPAZ)", sym);
  } catch (e) {
    fail("ERC20.symbol(TOPAZ)", e);
  }

  try {
    const r = await rebaseApr();
    ok("rebaseApr", r.toFixed(2) + "%");
  } catch (e) {
    fail("rebaseApr", e);
  }

  console.log(out.join("\n"));
}

function serialize(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(serialize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, serialize(v)]));
  }
  return value;
}

async function main() {
  const argv = minimist(process.argv.slice(2), {
    string: ["_", "in", "out", "pool", "gauge", "address", "amount"],
  });
  const cmd = String(argv._[0] ?? "");
  if (!cmd || cmd === "help" || argv.h || argv.help) {
    console.log(USAGE);
    return;
  }
  switch (cmd) {
    case "pool": return await cmdPool(argv);
    case "gauge": return await cmdGauge(argv);
    case "position": return await cmdPosition(argv);
    case "lock": return await cmdLock(argv);
    case "vote": return await cmdVote(argv);
    case "claimable": return await cmdClaimable(argv);
    case "gauges": return await cmdGauges(argv);
    case "bribes": return await cmdBribes(argv);
    case "apr": return await cmdApr(argv);
    case "quote": return await cmdQuote(argv);
    case "smoke": return await cmdSmoke();
    default:
      console.error(`unknown command: ${cmd}\n\n${USAGE}`);
      process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
