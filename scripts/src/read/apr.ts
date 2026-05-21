import { Contract, ZeroAddress } from "ethers";
import { gql } from "graphql-request";
import { ABIS } from "../lib/abis.js";
import { provider } from "../lib/client.js";
import { ADDR } from "../config/addresses.js";
import { detectPoolType } from "./pools.js";
import { getTopazUsdPrice, getUsdPrice } from "../lib/pricing.js";
import { v2Client, v3Client } from "../lib/subgraph.js";

const voter = () => new Contract(ADDR.Voter, ABIS.Voter, provider());
const gaugeC = (addr: string) => new Contract(addr, ABIS.Gauge, provider());
const clGaugeC = (addr: string) => new Contract(addr, ABIS.CLGauge, provider());

const SECONDS_PER_YEAR = 31_536_000;

const V3_POOL_TVL_Q = gql`
  query($id: ID!) {
    pool(id: $id) { totalValueLockedUSD volumeUSD feesUSD liquidity }
    poolDayDatas(first: 7, orderBy: date, orderDirection: desc, where: { pool: $id }) {
      volumeUSD feesUSD
    }
  }
`;

const V2_POOL_TVL_Q = gql`
  query($id: ID!) {
    pair(id: $id) { reserveUSD volumeUSD feesUSD }
    pairDayDatas(first: 7, orderBy: date, orderDirection: desc, where: { pairAddress: $id }) {
      dailyVolumeUSD dailyFeesUSD
    }
  }
`;

interface SubgraphPoolData {
  tvlUsd: number;
  vol7d: number;
  fees7d: number;
}

async function subgraphPool(pool: string, type: "v2" | "v3"): Promise<SubgraphPoolData> {
  if (type === "v3") {
    const data = await v3Client.request<{
      pool: { totalValueLockedUSD: string; volumeUSD: string; feesUSD: string } | null;
      poolDayDatas: { volumeUSD: string; feesUSD: string }[];
    }>(V3_POOL_TVL_Q, { id: pool.toLowerCase() });
    const tvl = parseFloat(data.pool?.totalValueLockedUSD ?? "0");
    const vol7d = data.poolDayDatas.reduce((s, d) => s + parseFloat(d.volumeUSD), 0);
    const fees7d = data.poolDayDatas.reduce((s, d) => s + parseFloat(d.feesUSD), 0);
    return { tvlUsd: tvl, vol7d, fees7d };
  } else {
    const data = await v2Client.request<{
      pair: { reserveUSD: string; volumeUSD: string; feesUSD: string } | null;
      pairDayDatas: { dailyVolumeUSD: string; dailyFeesUSD: string }[];
    }>(V2_POOL_TVL_Q, { id: pool.toLowerCase() });
    const tvl = parseFloat(data.pair?.reserveUSD ?? "0");
    const vol7d = data.pairDayDatas.reduce((s, d) => s + parseFloat(d.dailyVolumeUSD), 0);
    const fees7d = data.pairDayDatas.reduce((s, d) => s + parseFloat(d.dailyFeesUSD), 0);
    return { tvlUsd: tvl, vol7d, fees7d };
  }
}

export interface PoolAprBreakdown {
  pool: string;
  type: "v2" | "v3";
  gauge: string | null;
  alive: boolean;
  tvlUsd: number;
  stakedTvlUsd: number;
  emissionApr: number;
  feeApr: number;
  rewardRatePerSec: bigint;
  topazUsd: number;
}

export async function poolApr(pool: string): Promise<PoolAprBreakdown> {
  const type = await detectPoolType(pool);
  const { tvlUsd, vol7d, fees7d: _fees7d } = await subgraphPool(pool, type);
  const topazUsd = await getTopazUsdPrice();
  const v = voter();
  const gauge: string = await v.gauges(pool);

  if (gauge === ZeroAddress) {
    return {
      pool,
      type,
      gauge: null,
      alive: false,
      tvlUsd,
      stakedTvlUsd: 0,
      emissionApr: 0,
      feeApr: 0,
      rewardRatePerSec: 0n,
      topazUsd,
    };
  }
  const alive: boolean = await v.isAlive(gauge);

  let rewardRate: bigint, stakedFraction: number, feeRate: number;
  if (type === "v2") {
    const g = gaugeC(gauge);
    const [rate, totalSupply, poolSupply, fee] = await Promise.all([
      g.rewardRate() as Promise<bigint>,
      g.totalSupply() as Promise<bigint>,
      new Contract(pool, ABIS.Pool, provider()).totalSupply() as Promise<bigint>,
      // v2 fee is bps-style: fee/10000 = bps; e.g. 30 = 0.30%
      new Contract(ADDR.PoolFactory, ABIS.PoolFactory, provider())
        .getFee(pool, await new Contract(pool, ABIS.Pool, provider()).stable()) as Promise<bigint>,
    ]);
    rewardRate = rate;
    stakedFraction = poolSupply > 0n ? Number(totalSupply) / Number(poolSupply) : 0;
    feeRate = Number(fee) / 10000; // 30 -> 0.003
  } else {
    const g = clGaugeC(gauge);
    const pc = new Contract(pool, ABIS.CLPool, provider());
    const [rate, stakedLiq, liq, fee] = await Promise.all([
      g.rewardRate() as Promise<bigint>,
      pc.stakedLiquidity() as Promise<bigint>,
      pc.liquidity() as Promise<bigint>,
      pc.fee() as Promise<bigint>,
    ]);
    rewardRate = rate;
    stakedFraction = liq > 0n ? Number(stakedLiq) / Number(liq) : 0;
    feeRate = Number(fee) / 1_000_000; // 3000 pips -> 0.003
  }

  const annualTopazUsd = (Number(rewardRate) * SECONDS_PER_YEAR / 1e18) * topazUsd;
  const stakedTvlUsd = tvlUsd * stakedFraction;
  const emissionApr =
    stakedTvlUsd > 0 && alive ? (annualTopazUsd / stakedTvlUsd) * 100 : 0;

  const avgDaily = vol7d / 7;
  const annualVolUsd = avgDaily * 365;
  const annualFeesUsd = annualVolUsd * feeRate;
  const feeApr = tvlUsd > 0 ? (annualFeesUsd / tvlUsd) * 100 : 0;

  return {
    pool,
    type,
    gauge,
    alive,
    tvlUsd,
    stakedTvlUsd,
    emissionApr,
    feeApr,
    rewardRatePerSec: rewardRate,
    topazUsd,
  };
}

export async function rebaseApr(): Promise<number> {
  const rd = new Contract(ADDR.RewardsDistributor, ABIS.RewardsDistributor, provider());
  const ve = new Contract(ADDR.VotingEscrow, ABIS.VotingEscrow, provider());
  const epoch = Math.floor(Date.now() / 1000 / (7 * 86400)) * 7 * 86400;
  const [weekly, supply] = await Promise.all([
    rd.tokensPerWeek(epoch) as Promise<bigint>,
    ve.totalSupply() as Promise<bigint>,
  ]);
  if (supply === 0n) return 0;
  const annual = Number(weekly * 52n);
  return (annual / Number(supply)) * 100;
}

export async function votingApr(pool: string): Promise<number> {
  // USD value of bribes + accrued fees this epoch / pool weight, annualized.
  const v = voter();
  const gauge: string = await v.gauges(pool);
  if (gauge === ZeroAddress) return 0;
  const [bribeAddr, feeAddr] = await Promise.all([v.gaugeToBribe(gauge), v.gaugeToFees(gauge)]);
  const epoch: bigint = await v.epochStart(BigInt(Math.floor(Date.now() / 1000)));
  const weight: bigint = await v.weights(pool);
  if (weight === 0n) return 0;
  const topazUsd = await getTopazUsdPrice();

  let usdEpoch = 0;
  for (const addr of [bribeAddr, feeAddr]) {
    const c = new Contract(addr, ABIS.Reward, provider());
    const len: bigint = await c.rewardsListLength();
    const tokens = await Promise.all(
      Array.from({ length: Number(len) }, (_, i) => c.rewards(i) as Promise<string>)
    );
    const amounts = await Promise.all(
      tokens.map((t) => c.tokenRewardsPerEpoch(t, epoch) as Promise<bigint>)
    );
    for (let i = 0; i < tokens.length; i++) {
      if (amounts[i] === 0n) continue;
      const px = tokens[i].toLowerCase() === ADDR.TOPAZ.toLowerCase()
        ? topazUsd
        : await getUsdPrice(tokens[i]).catch(() => 0);
      // 18 decimal assumption — most BSC tokens are 18; for non-18 the caller should refine.
      usdEpoch += (Number(amounts[i]) / 1e18) * px;
    }
  }

  // Convert weight (in ve-units 1e18) and annualize (52 epochs/yr)
  const usdPerVe = usdEpoch / (Number(weight) / 1e18);
  return usdPerVe * 52 * 100; // already a fraction; *100 -> percent against 1 ve
}
