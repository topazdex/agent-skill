import { Contract, ZeroAddress } from "ethers";
import { ABIS } from "../lib/abis.js";
import { provider } from "../lib/client.js";
import { ADDR } from "../config/addresses.js";
import { detectPoolType } from "./pools.js";

const voter = () => new Contract(ADDR.Voter, ABIS.Voter, provider());
const gaugeC = (addr: string) => new Contract(addr, ABIS.Gauge, provider());
const clGaugeC = (addr: string) => new Contract(addr, ABIS.CLGauge, provider());
const rewardC = (addr: string) => new Contract(addr, ABIS.Reward, provider());

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

export async function getGaugeStateForPool(pool: string): Promise<GaugeState | null> {
  const v = voter();
  const gauge: string = await v.gauges(pool);
  if (gauge === ZeroAddress) return null;
  const type = await detectPoolType(pool);

  const [alive, feesVotingReward, bribeVotingReward, weight] = await Promise.all([
    v.isAlive(gauge),
    v.gaugeToFees(gauge),
    v.gaugeToBribe(gauge),
    v.weights(pool),
  ]);

  let rewardRate: bigint, periodFinish: bigint, left: bigint, totalSupplyOrStaked: bigint;
  if (type === "v2") {
    const g = gaugeC(gauge);
    [rewardRate, periodFinish, left, totalSupplyOrStaked] = await Promise.all([
      g.rewardRate(),
      g.periodFinish(),
      g.left(),
      g.totalSupply(),
    ]);
  } else {
    const g = clGaugeC(gauge);
    [rewardRate, periodFinish, left, totalSupplyOrStaked] = await Promise.all([
      g.rewardRate(),
      g.periodFinish(),
      g.left(),
      // For CLGauge there is no "totalSupply" — use the pool's stakedLiquidity instead
      new Contract(pool, ABIS.CLPool, provider()).stakedLiquidity(),
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

export async function listAllPools(): Promise<string[]> {
  const v = voter();
  const len: bigint = await v.length();
  return await Promise.all(
    Array.from({ length: Number(len) }, (_, i) => v.pools(i) as Promise<string>)
  );
}

export async function getEarnedV2(gauge: string, account: string): Promise<bigint> {
  return await gaugeC(gauge).earned(account);
}

export async function getEarnedV3(
  gauge: string,
  account: string,
  tokenId: bigint
): Promise<bigint> {
  return await clGaugeC(gauge).earned(account, tokenId);
}

export interface BribeInfo {
  bribeContract: string;
  rewardTokens: string[];
  perEpochAmounts: bigint[]; // for current epoch
}

export async function getBribeInfo(pool: string): Promise<BribeInfo | null> {
  const v = voter();
  const gauge: string = await v.gauges(pool);
  if (gauge === ZeroAddress) return null;
  const bribeAddr: string = await v.gaugeToBribe(gauge);
  const bribe = rewardC(bribeAddr);
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
async function partitionPoolsByType(pools: string[]): Promise<{ v2: string[]; v3: string[] }> {
  const types = await Promise.all(pools.map((p) => detectPoolType(p).catch(() => null)));
  const v2: string[] = [];
  const v3: string[] = [];
  pools.forEach((p, i) => {
    if (types[i] === "v2") v2.push(p);
    else if (types[i] === "v3") v3.push(p);
  });
  return { v2, v3 };
}

export async function v2StakedGaugesForAccount(account: string): Promise<string[]> {
  const allPools = await listAllPools();
  const { v2: v2Pools } = await partitionPoolsByType(allPools);
  const v = voter();
  const gauges = await Promise.all(v2Pools.map((p) => v.gauges(p) as Promise<string>));
  const balances = await Promise.all(
    gauges.map((g) =>
      g === ZeroAddress
        ? Promise.resolve(0n)
        : (gaugeC(g).balanceOf(account) as Promise<bigint>).catch(() => 0n)
    )
  );
  return gauges.filter((_, i) => balances[i] > 0n);
}

export async function v3StakedGaugesForAccount(
  account: string
): Promise<{ gauge: string; tokenIds: bigint[] }[]> {
  const allPools = await listAllPools();
  const { v3: v3Pools } = await partitionPoolsByType(allPools);
  const v = voter();
  const gauges = await Promise.all(v3Pools.map((p) => v.gauges(p) as Promise<string>));
  const v3Gauges = gauges.filter((g) => g !== ZeroAddress);
  const result = await Promise.all(
    v3Gauges.map(async (g) => {
      const ids: bigint[] = await clGaugeC(g).stakedValues(account).catch(() => []);
      return { gauge: g, tokenIds: ids };
    })
  );
  return result.filter((r) => r.tokenIds.length > 0);
}
