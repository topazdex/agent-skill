import { Contract, ZeroAddress, getAddress } from "ethers";
import { ABIS } from "../lib/abis.js";
import { provider } from "../lib/client.js";
import { coreContract } from "../lib/contracts.js";
import { TICK_SPACINGS } from "../config/addresses.js";
import { CHAIN_ID } from "../config/chain.js";
import { detectPoolType } from "./pools.js";

const voter = (chainId: number) => coreContract("Voter", chainId);
const gaugeC = (addr: string, chainId: number) => new Contract(addr, ABIS.Gauge, provider(chainId));
const clGaugeC = (addr: string, chainId: number) => new Contract(addr, ABIS.CLGauge, provider(chainId));
const rewardC = (addr: string, chainId: number) => new Contract(addr, ABIS.Reward, provider(chainId));

export interface GaugeState {
  pool: string;
  gauge: string;
  type: "v2" | "v3";
  alive: boolean;
  rewardRate: bigint;
  periodFinish: bigint;
  left: bigint;
  totalSupplyOrStaked: bigint;
  feesVotingReward: string;
  bribeVotingReward: string;
  weight: bigint;
}

/**
 * One entry per (pool kind, pool address) where a gauge actually exists for a
 * token pair. Returned by `listGaugesForPair`. Use this when an agent or user
 * asks "find the gauge for X/Y" — Topaz can have **multiple** gauges per pair
 * (one per v2 stable/volatile + one per v3 tick spacing), and stopping at the
 * first ZeroAddress is a known foot-gun.
 */
export interface PairGaugeEntry {
  /** Pool kind label, e.g. "v2-volatile", "v2-stable", "v3-ts-200". */
  kind: string;
  /** v2 vs v3 — useful to dispatch the right `Gauge` vs `CLGauge` ABI later. */
  type: "v2" | "v3";
  pool: string;
  gauge: string;
  alive: boolean;
}

/**
 * Find every gauge that exists for a token pair.
 *
 * Topaz has up to 7 pools per pair:
 *   - v2 volatile  (PoolFactory.getPool(a, b, false))
 *   - v2 stable    (PoolFactory.getPool(a, b, true))
 *   - v3 at each tick spacing (CLFactory.getPool(a, b, ts) for ts in {1,50,100,200,2000})
 *
 * Each pool can have at most one gauge (`Voter.gauges(pool)`). This helper checks
 * every variant and returns only the entries with a non-zero gauge address.
 *
 * Args are accepted in any order (the factory itself normalizes (token0, token1)).
 *
 * Returns an empty array when neither token has any pools, or when pools exist
 * but none has had `Voter.createGauge` called on it.
 *
 * Common failure modes this helper prevents:
 *   1. Checking only one stable flag for v2.
 *   2. Checking only one tick spacing for v3.
 *   3. Assuming the wrong function name on the Voter — the live mapping is
 *      `gauges(address) returns (address)`. There is **no** `gaugeForPool`
 *      function on Topaz (that name comes from Velodrome/Aerodrome forks);
 *      calling it reverts.
 */
export async function listGaugesForPair(
  tokenA: string,
  tokenB: string,
  chainId: number = CHAIN_ID,
): Promise<PairGaugeEntry[]> {
  const a = getAddress(tokenA);
  const b = getAddress(tokenB);
  if (a.toLowerCase() === b.toLowerCase()) {
    throw new Error("tokenA and tokenB must differ");
  }

  const poolFactory = coreContract("PoolFactory", chainId);
  const clFactory = coreContract("CLFactory", chainId);
  const v = voter(chainId);

  const variants: Array<{ kind: string; type: "v2" | "v3"; poolP: Promise<string> }> = [
    { kind: "v2-volatile", type: "v2", poolP: poolFactory.getPool(a, b, false) as Promise<string> },
    { kind: "v2-stable", type: "v2", poolP: poolFactory.getPool(a, b, true) as Promise<string> },
    ...TICK_SPACINGS.map((ts) => ({
      kind: `v3-ts-${ts}`,
      type: "v3" as const,
      poolP: clFactory.getPool(a, b, ts) as Promise<string>,
    })),
  ];

  const pools = await Promise.all(variants.map((x) => x.poolP));
  const gauges = await Promise.all(
    pools.map((p) => (p === ZeroAddress ? Promise.resolve(ZeroAddress) : (v.gauges(p) as Promise<string>))),
  );
  const alives = await Promise.all(
    gauges.map((g) => (g === ZeroAddress ? Promise.resolve(false) : (v.isAlive(g) as Promise<boolean>))),
  );

  const out: PairGaugeEntry[] = [];
  for (let i = 0; i < variants.length; i++) {
    if (gauges[i] === ZeroAddress) continue;
    out.push({
      kind: variants[i].kind,
      type: variants[i].type,
      pool: pools[i],
      gauge: gauges[i],
      alive: alives[i],
    });
  }
  return out;
}

export async function getGaugeStateForPool(
  pool: string,
  chainId: number = CHAIN_ID,
): Promise<GaugeState | null> {
  const v = voter(chainId);
  const gauge: string = await v.gauges(pool);
  if (gauge === ZeroAddress) return null;
  const type = await detectPoolType(pool, chainId);

  const [alive, feesVotingReward, bribeVotingReward, weight] = await Promise.all([
    v.isAlive(gauge),
    v.gaugeToFees(gauge),
    v.gaugeToBribe(gauge),
    v.weights(pool),
  ]);

  let rewardRate: bigint, periodFinish: bigint, left: bigint, totalSupplyOrStaked: bigint;
  if (type === "v2") {
    const g = gaugeC(gauge, chainId);
    [rewardRate, periodFinish, left, totalSupplyOrStaked] = await Promise.all([
      g.rewardRate(),
      g.periodFinish(),
      g.left(),
      g.totalSupply(),
    ]);
  } else {
    const g = clGaugeC(gauge, chainId);
    [rewardRate, periodFinish, left, totalSupplyOrStaked] = await Promise.all([
      g.rewardRate(),
      g.periodFinish(),
      g.left(),
      // For CLGauge there is no "totalSupply" — use the pool's stakedLiquidity instead
      new Contract(pool, ABIS.CLPool, provider(chainId)).stakedLiquidity(),
    ]);
  }

  return {
    pool,
    gauge,
    type,
    alive,
    rewardRate,
    periodFinish,
    left,
    totalSupplyOrStaked,
    feesVotingReward,
    bribeVotingReward,
    weight,
  };
}

export async function listAllPools(chainId: number = CHAIN_ID): Promise<string[]> {
  const v = voter(chainId);
  const len: bigint = await v.length();
  return await Promise.all(
    Array.from({ length: Number(len) }, (_, i) => v.pools(i) as Promise<string>)
  );
}

export async function getEarnedV2(
  gauge: string,
  account: string,
  chainId: number = CHAIN_ID,
): Promise<bigint> {
  return await gaugeC(gauge, chainId).earned(account);
}

export async function getEarnedV3(
  gauge: string,
  account: string,
  tokenId: bigint,
  chainId: number = CHAIN_ID,
): Promise<bigint> {
  return await clGaugeC(gauge, chainId).earned(account, tokenId);
}

export interface BribeInfo {
  bribeContract: string;
  rewardTokens: string[];
  perEpochAmounts: bigint[]; // for current epoch
}

export async function getBribeInfo(pool: string, chainId: number = CHAIN_ID): Promise<BribeInfo | null> {
  const v = voter(chainId);
  const gauge: string = await v.gauges(pool);
  if (gauge === ZeroAddress) return null;
  const bribeAddr: string = await v.gaugeToBribe(gauge);
  const bribe = rewardC(bribeAddr, chainId);
  const epoch: bigint = await v.epochStart(BigInt(Math.floor(Date.now() / 1000)));
  const len: bigint = await bribe.rewardsListLength();
  const tokens = await Promise.all(
    Array.from({ length: Number(len) }, (_, i) => bribe.rewards(i) as Promise<string>)
  );
  const amounts = await Promise.all(
    tokens.map((t) => bribe.tokenRewardsPerEpoch(t, epoch) as Promise<bigint>)
  );
  return { bribeContract: bribeAddr, rewardTokens: tokens, perEpochAmounts: amounts };
}

/**
 * Split active pools into v2 and v3 sets in one pass.
 * detectPoolType makes 2 RPC calls per pool; batch them all in parallel.
 */
async function partitionPoolsByType(
  pools: string[],
  chainId: number,
): Promise<{ v2: string[]; v3: string[] }> {
  const types = await Promise.all(pools.map((p) => detectPoolType(p, chainId).catch(() => null)));
  const v2: string[] = [];
  const v3: string[] = [];
  pools.forEach((p, i) => {
    if (types[i] === "v2") v2.push(p);
    else if (types[i] === "v3") v3.push(p);
  });
  return { v2, v3 };
}

export async function v2StakedGaugesForAccount(
  account: string,
  chainId: number = CHAIN_ID,
): Promise<string[]> {
  const allPools = await listAllPools(chainId);
  const { v2: v2Pools } = await partitionPoolsByType(allPools, chainId);
  const v = voter(chainId);
  const gauges = await Promise.all(v2Pools.map((p) => v.gauges(p) as Promise<string>));
  const balances = await Promise.all(
    gauges.map((g) =>
      g === ZeroAddress
        ? Promise.resolve(0n)
        : (gaugeC(g, chainId).balanceOf(account) as Promise<bigint>).catch(() => 0n)
    )
  );
  return gauges.filter((_, i) => balances[i] > 0n);
}

export async function v3StakedGaugesForAccount(
  account: string,
  chainId: number = CHAIN_ID,
): Promise<{ gauge: string; tokenIds: bigint[] }[]> {
  const allPools = await listAllPools(chainId);
  const { v3: v3Pools } = await partitionPoolsByType(allPools, chainId);
  const v = voter(chainId);
  const gauges = await Promise.all(v3Pools.map((p) => v.gauges(p) as Promise<string>));
  const v3Gauges = gauges.filter((g) => g !== ZeroAddress);
  const result = await Promise.all(
    v3Gauges.map(async (g) => {
      const ids: bigint[] = await clGaugeC(g, chainId).stakedValues(account).catch(() => []);
      return { gauge: g, tokenIds: ids };
    })
  );
  return result.filter((r) => r.tokenIds.length > 0);
}
