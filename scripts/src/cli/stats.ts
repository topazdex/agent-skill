// CLI: yarn tsx src/cli/stats.ts <cmd> [args]
// Read-only diagnostics. Does not require PRIVATE_KEY.

import minimist from "minimist";
import { formatUnits, Contract, ZeroAddress } from "ethers";
import { ADDR } from "../config/addresses.js";
import { ABIS } from "../lib/abis.js";
import { getPool } from "../read/pools.js";
import {
  getGaugeStateForPool,
  listAllPools,
  listGaugesForPair,
  getBribeInfo,
} from "../read/gauges.js";
import { getLock, listUserLocks } from "../read/locks.js";
import { getVote } from "../read/votes.js";
import { getPosition, listOwnerPositions } from "../read/positions.js";
import { claimableSummary } from "../read/claimable.js";
import { poolApr, rebaseApr, votingApr } from "../read/apr.js";
import { bestQuote, quoteHuman } from "../read/quotes.js";
import { TOKENS, findToken } from "../config/tokens.js";
import { getSymbol, getDecimals } from "../lib/erc20.js";
import { topV2Pools, topV3Pools } from "../read/subgraphQueries.js";
import { provider } from "../lib/client.js";
import { fmtEpoch } from "../lib/epoch.js";
import { buildBestSwapTx } from "../lib/txBuilders.js";

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
  gauges-for-pair <A> <B>       All gauges for token pair (enumerates v2 stable/volatile + every v3 tick spacing)
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
    // v2 fee is stored such that fee/10000 = decimal rate, i.e. fee is already in bps.
    // Example: fee=30 → 30 bps = 0.30%
    console.log("  fee:", `${info.fee} (= ${info.fee} bps = ${(info.fee / 100).toFixed(2)}%)`);
    console.log(`  reserves: ${formatUnits(info.reserve0, info.decimals0)} / ${formatUnits(info.reserve1, info.decimals1)}`);
    console.log("  totalSupply (LP):", info.totalSupply.toString());
  } else {
    console.log("  tickSpacing:", info.tickSpacing);
    // v3 fee is in pips (1e-6). 100 pips = 0.01%
    console.log("  fee:", `${info.fee} pips (${(info.fee / 10_000).toFixed(4)}%)`);
    console.log("  unstakedFee:", `${info.unstakedFee} pips (${(info.unstakedFee / 10_000).toFixed(2)}%)`);
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

async function cmdGaugesForPair(argv: any) {
  const a = argv._[1];
  const b = argv._[2];
  if (!a || !b) {
    throw new Error("usage: gauges-for-pair <tokenA> <tokenB>  (addresses or symbols)");
  }
  const tokenA = resolveTokenArg(String(a));
  const tokenB = resolveTokenArg(String(b));
  const entries = await listGaugesForPair(tokenA, tokenB);
  if (entries.length === 0) {
    console.log(`No gauges found for ${a}/${b}.`);
    console.log("This means every (v2-stable, v2-volatile, v3 at each tick spacing) variant");
    console.log("either has no pool or has a pool without a gauge.");
    return;
  }
  for (const e of entries) {
    console.log(
      `${e.kind.padEnd(13)} ${e.type}  pool=${e.pool}  gauge=${e.gauge}  ${e.alive ? "ALIVE" : "killed"}`,
    );
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
  let failed = 0;
  const ok = (label: string, val: unknown) => out.push(`[PASS] ${label}: ${val}`);
  const fail = (label: string, err: unknown) => {
    out.push(`[FAIL] ${label}: ${(err as Error).message ?? err}`);
    failed++;
  };
  const p = provider();

  try {
    ok("RPC blockNumber", await p.getBlockNumber());
  } catch (e) {
    fail("RPC blockNumber", e);
  }

  // Every ADDR entry must have deployed bytecode at this block. Catches a stale config.
  try {
    const entries = Object.entries(ADDR);
    const codes = await Promise.all(entries.map(([, a]) => p.getCode(a)));
    const missing = entries
      .map(([name], i) => (codes[i] === "0x" ? name : null))
      .filter((n): n is string => n !== null);
    if (missing.length > 0) {
      throw new Error(`no bytecode at: ${missing.join(", ")}`);
    }
    ok("ADDR bytecode", `${entries.length}/${entries.length} addresses have code`);
  } catch (e) {
    fail("ADDR bytecode", e);
  }

  try {
    const [sym, dec] = await Promise.all([
      getSymbol(TOKENS.TOPAZ.address),
      getDecimals(TOKENS.TOPAZ.address),
    ]);
    if (sym !== "TOPAZ") throw new Error(`symbol=${sym}, expected TOPAZ`);
    if (dec !== 18) throw new Error(`decimals=${dec}, expected 18`);
    ok("TOPAZ symbol+decimals", `${sym} (${dec})`);
  } catch (e) {
    fail("TOPAZ symbol+decimals", e);
  }

  try {
    const pools = await topV3Pools(5);
    const tvl = Number(pools[0]?.totalValueLockedUSD ?? 0);
    if (!(tvl > 0)) throw new Error(`top v3 pool TVL=${tvl}`);
    ok("v3 subgraph", `top pool TVL=$${tvl.toFixed(2)}`);
  } catch (e) {
    fail("v3 subgraph", e);
  }

  try {
    const pairs = await topV2Pools(5);
    const tvl = Number(pairs[0]?.reserveUSD ?? 0);
    if (!(tvl > 0)) throw new Error(`top v2 pair reserveUSD=${tvl}`);
    ok("v2 subgraph", `top pair TVL=$${tvl.toFixed(2)}`);
  } catch (e) {
    fail("v2 subgraph", e);
  }

  try {
    const amountIn = 10n ** 17n; // 0.1 WBNB — small but live
    const best = await bestQuote(
      TOKENS.WBNB.address,
      TOKENS.TOPAZ.address,
      amountIn,
    );
    if (best.amountOut <= 0n) throw new Error("amountOut=0");
    // The v2/v3 winner depends on live pool depth — either stack is acceptable
    // as long as the route is atomically executable (not "mixed", which the
    // current enumerator never emits anyway).
    if (
      best.exec.type !== "v2" &&
      best.exec.type !== "v3-single" &&
      best.exec.type !== "v3-path"
    ) {
      throw new Error(`route type ${best.exec.type}, expected v2|v3-single|v3-path`);
    }
    ok(
      "bestQuote WBNB→TOPAZ (0.1)",
      `${best.route} → ${formatUnits(best.amountOut, 18)} TOPAZ`,
    );
  } catch (e) {
    fail("bestQuote WBNB→TOPAZ", e);
  }

  try {
    const amountIn = 10n ** 17n;
    const built = await buildBestSwapTx({
      tokenIn: TOKENS.WBNB.address,
      tokenOut: TOKENS.TOPAZ.address,
      amountIn,
      recipient: "0x000000000000000000000000000000000000dEaD",
      slippageBps: 100n,
    });
    if (built.to !== ADDR.SwapRouter) {
      throw new Error(`to=${built.to}, expected SwapRouter ${ADDR.SwapRouter}`);
    }
    if (!built.data.startsWith("0x") || built.data.length < 10) {
      throw new Error(`bad data: ${built.data.slice(0, 32)}...`);
    }
    if (built.value !== amountIn) throw new Error(`value=${built.value}, expected amountIn ${amountIn}`);
    if (built.expectedOut <= 0n) throw new Error("expectedOut <= 0");
    if (built.amountOutMin <= 0n) throw new Error("amountOutMin <= 0");
    if (built.quotedAt <= 0) throw new Error("quotedAt missing");
    if (built.deadline <= Math.floor(Date.now() / 1000)) {
      throw new Error("deadline not in the future");
    }
    ok(
      "buildBestSwapTx WBNB→TOPAZ",
      `route=${built.route} expectedOut=${formatUnits(built.expectedOut, 18)} TOPAZ amountOutMin=${formatUnits(built.amountOutMin, 18)}`,
    );
  } catch (e) {
    fail("buildBestSwapTx WBNB→TOPAZ", e);
  }

  try {
    const pools = await topV3Pools(5);
    const voter = new Contract(ADDR.Voter, ABIS.Voter, p);
    let live: { pool: string; gauge: string } | null = null;
    for (const pool of pools) {
      const gauge: string = await voter.gauges(pool.id);
      if (gauge === ZeroAddress) continue;
      const alive: boolean = await voter.isAlive(gauge);
      if (alive) {
        live = { pool: pool.id, gauge };
        break;
      }
    }
    if (!live) throw new Error("no live gauge across top 5 v3 pools by TVL");
    ok(
      "Voter.gauges live",
      `pool=${live.pool.slice(0, 10)}… gauge=${live.gauge.slice(0, 10)}… isAlive=true`,
    );
  } catch (e) {
    fail("Voter.gauges live", e);
  }

  try {
    const r = await rebaseApr();
    ok("rebaseApr", r.toFixed(2) + "%");
  } catch (e) {
    fail("rebaseApr", e);
  }

  // Regression guard for the "agent saw no gauge" bug: WBNB/BTCB has both a
  // v2-volatile gauge and a v3 ts=50 gauge. If either disappears (or if a
  // future contract upgrade renames `Voter.gauges`), this check turns red.
  try {
    const entries = await listGaugesForPair(TOKENS.WBNB.address, TOKENS.BTCB.address);
    const live = entries.filter((e) => e.alive);
    if (live.length < 2) {
      throw new Error(
        `expected ≥2 live gauges for WBNB/BTCB, got ${live.length} (${entries
          .map((e) => `${e.kind}=${e.alive ? "alive" : "killed/missing"}`)
          .join(", ")})`,
      );
    }
    ok(
      "WBNB/BTCB gauge enumeration",
      `${live.length} live gauges across ${entries.length} pool variants (${entries
        .map((e) => e.kind)
        .join(", ")})`,
    );
  } catch (e) {
    fail("WBNB/BTCB gauge enumeration", e);
  }

  console.log(out.join("\n"));
  if (failed > 0) {
    console.error(`\n${failed} smoke check(s) failed`);
    process.exit(1);
  }
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
    case "gauges-for-pair": return await cmdGaugesForPair(argv);
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
