import { Contract, ZeroAddress } from "ethers";
import { gql } from "graphql-request";
import { ABIS } from "../lib/abis.js";
import { provider } from "../lib/client.js";
import { ADDR } from "../config/addresses.js";
import { detectPoolType, getPoolV3, type PoolInfoV3 } from "./pools.js";
import { getPosition } from "./positions.js";
import { getTopazUsdPrice, getUsdPrice } from "../lib/pricing.js";
import { getDecimals } from "../lib/erc20.js";
import { v2Client, v3Client } from "../lib/subgraph.js";
import {
  getSqrtRatioAtTick,
  getAmountsForLiquidity,
  sqrtPriceX96ToPrice,
} from "../lib/tickMath.js";

const voter = () => new Contract(ADDR.Voter, ABIS.Voter, provider());
const gaugeC = (addr: string) => new Contract(addr, ABIS.Gauge, provider());
const clGaugeC = (addr: string) => new Contract(addr, ABIS.CLGauge, provider());

const SECONDS_PER_YEAR = 31_536_000;

const VOLATILE_PRESET_SPREAD_PERCENT = 3;
const STABLE_PRESET_SPREAD_PERCENT = 0.1;
const ONE_TICK_PRESET_SPREAD_PERCENT = 0.05;
const PRESET_DEPOSIT_USD = 1000;
const REFERENCE_LIQUIDITY = 1_000_000_000_000_000n; // 1e15

const STABLE_SYMBOLS = new Set([
  "USDC", "USDC.E", "USDT", "DAI", "USDP", "FRAX", "USDE", "USD+", "LUSD", "BUSD",
]);

export function isStablePair(s0: string, s1: string): boolean {
  return STABLE_SYMBOLS.has(s0.toUpperCase()) && STABLE_SYMBOLS.has(s1.toUpperCase());
}

export function getPresetSpreadPercent(
  symbol0: string,
  symbol1: string,
  tickSpacing: number,
): number {
  if (tickSpacing === 1) return ONE_TICK_PRESET_SPREAD_PERCENT;
  return isStablePair(symbol0, symbol1)
    ? STABLE_PRESET_SPREAD_PERCENT
    : VOLATILE_PRESET_SPREAD_PERCENT;
}

export function getTicksForSpread(
  currentTick: number,
  spreadPercent: number,
  tickSpacing: number,
): { tickLower: number; tickUpper: number } {
  const ticksFromCenter = Math.floor(
    Math.log(1 + spreadPercent / 100) / Math.log(1.0001),
  );
  const tickLower =
    Math.floor((currentTick - ticksFromCenter) / tickSpacing) * tickSpacing;
  const tickUpper =
    Math.ceil((currentTick + ticksFromCenter) / tickSpacing) * tickSpacing;
  if (tickUpper <= tickLower) {
    const aligned = Math.floor(currentTick / tickSpacing) * tickSpacing;
    return { tickLower: aligned, tickUpper: aligned + tickSpacing };
  }
  return { tickLower, tickUpper };
}

export function isRewardPeriodActive(periodFinish: bigint, nowSec?: number): boolean {
  const now = nowSec ?? Math.floor(Date.now() / 1000);
  return periodFinish === 0n || Number(periodFinish) > now;
}

export function computePositionEmissionApr(
  positionLiquidity: bigint,
  stakedLiquidity: bigint,
  rewardRatePerSec: bigint,
  topazUsd: number,
  positionValueUsd: number,
  alive: boolean,
): number | undefined {
  if (!alive || positionLiquidity === 0n || positionValueUsd <= 0) return 0;
  if (stakedLiquidity === 0n) return Infinity;
  const liquidityRatio = Number(positionLiquidity) / Number(stakedLiquidity);
  const annualRewardsUsd =
    liquidityRatio * (Number(rewardRatePerSec) / 1e18) * SECONDS_PER_YEAR * topazUsd;
  const apr = (annualRewardsUsd / positionValueUsd) * 100;
  if (!Number.isFinite(apr) || apr < 0) return undefined;
  return apr;
}

/**
 * Pure helper: gauge emission APR (percent). Mirrors the formula the Topaz UI uses.
 * Returns 0 if the gauge is dead or no liquidity is staked.
 *
 * @param rewardRatePerSec - TOPAZ wei per second (from `Gauge.rewardRate()`).
 * @param topazUsd         - USD value of 1 TOPAZ.
 * @param stakedTvlUsd     - USD value of liquidity currently earning emissions.
 * @param alive            - `Voter.isAlive(gauge)`.
 */
export function computeEmissionApr(
  rewardRatePerSec: bigint,
  topazUsd: number,
  stakedTvlUsd: number,
  alive: boolean,
): number {
  if (!alive || stakedTvlUsd <= 0) return 0;
  const annualTopazUsd = (Number(rewardRatePerSec) * SECONDS_PER_YEAR / 1e18) * topazUsd;
  return (annualTopazUsd / stakedTvlUsd) * 100;
}

/**
 * Pure helper: fee APR (percent) from 7-day **realized** USD fees.
 *
 * We use realized fees rather than `vol7d * feeRate` because Topaz v3 pools
 * support `DynamicSwapFeeModule` and `CustomSwapFeeModule`, so the fee rate
 * a pool actually charged over the last week can differ from its nominal
 * `fee()` value. The subgraph emits `feesUSD` directly from swap events, so
 * fees7d already reflects whatever dynamic adjustments were applied.
 *
 * Conversion is `fees7d * 52 / tvlUsd * 100` — i.e. we approximate one year
 * as 52 weeks (≈ 52.142857). The ~0.3% drift vs `365/7` is negligible relative
 * to the underlying TVL/volume noise.
 *
 * @param fees7d  - Trailing 7-day USD fees collected by the pool.
 * @param tvlUsd  - Current USD TVL.
 */
export function computeFeeApr(fees7d: number, tvlUsd: number): number {
  if (tvlUsd <= 0) return 0;
  return (fees7d * 52 / tvlUsd) * 100;
}

const V3_POOL_TVL_Q = gql`
  query($id: ID!) {
    pool(id: $id) {
      totalValueLockedUSD totalValueLockedToken0 totalValueLockedToken1
      volumeUSD feesUSD liquidity
    }
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
  tvlToken0: number;
  tvlToken1: number;
  vol7d: number;
  fees7d: number;
}

async function subgraphPool(pool: string, type: "v2" | "v3"): Promise<SubgraphPoolData> {
  if (type === "v3") {
    const data = await v3Client.request<{
      pool: {
        totalValueLockedUSD: string;
        totalValueLockedToken0: string;
        totalValueLockedToken1: string;
        volumeUSD: string;
        feesUSD: string;
      } | null;
      poolDayDatas: { volumeUSD: string; feesUSD: string }[];
    }>(V3_POOL_TVL_Q, { id: pool.toLowerCase() });
    const tvl = parseFloat(data.pool?.totalValueLockedUSD ?? "0");
    const tvlToken0 = parseFloat(data.pool?.totalValueLockedToken0 ?? "0");
    const tvlToken1 = parseFloat(data.pool?.totalValueLockedToken1 ?? "0");
    const vol7d = data.poolDayDatas.reduce((s, d) => s + parseFloat(d.volumeUSD), 0);
    const fees7d = data.poolDayDatas.reduce((s, d) => s + parseFloat(d.feesUSD), 0);
    return { tvlUsd: tvl, tvlToken0, tvlToken1, vol7d, fees7d };
  } else {
    const data = await v2Client.request<{
      pair: { reserveUSD: string; volumeUSD: string; feesUSD: string } | null;
      pairDayDatas: { dailyVolumeUSD: string; dailyFeesUSD: string }[];
    }>(V2_POOL_TVL_Q, { id: pool.toLowerCase() });
    const tvl = parseFloat(data.pair?.reserveUSD ?? "0");
    const vol7d = data.pairDayDatas.reduce((s, d) => s + parseFloat(d.dailyVolumeUSD), 0);
    const fees7d = data.pairDayDatas.reduce((s, d) => s + parseFloat(d.dailyFeesUSD), 0);
    return { tvlUsd: tvl, tvlToken0: 0, tvlToken1: 0, vol7d, fees7d };
  }
}

export function deriveTokenPricesUsd(
  tvlUsd: number,
  tvlToken0: number,
  tvlToken1: number,
  priceRatio: number,
): { price0Usd: number; price1Usd: number } | undefined {
  const denom = tvlToken0 * priceRatio + tvlToken1;
  if (!(denom > 0) || !(tvlUsd > 0) || !Number.isFinite(priceRatio) || priceRatio <= 0) {
    return undefined;
  }
  const price1Usd = tvlUsd / denom;
  return { price0Usd: price1Usd * priceRatio, price1Usd };
}

export function computeV3PresetApr(
  poolInfo: PoolInfoV3,
  sgData: { tvlUsd: number; tvlToken0: number; tvlToken1: number },
  rewardRate: bigint,
  topazUsd: number,
  alive: boolean,
): { emissionApr: number; stakedTvlUsd: number } {
  if (!alive || poolInfo.stakedLiquidity === 0n) {
    const stakedFrac = poolInfo.liquidity > 0n
      ? Number(poolInfo.stakedLiquidity) / Number(poolInfo.liquidity)
      : 0;
    return { emissionApr: 0, stakedTvlUsd: sgData.tvlUsd * stakedFrac };
  }

  const priceRatio = sqrtPriceX96ToPrice(
    poolInfo.sqrtPriceX96, poolInfo.decimals0, poolInfo.decimals1,
  );
  const prices = deriveTokenPricesUsd(
    sgData.tvlUsd, sgData.tvlToken0, sgData.tvlToken1, priceRatio,
  );

  const stakedFrac = poolInfo.liquidity > 0n
    ? Math.min(Math.max(Number(poolInfo.stakedLiquidity) / Number(poolInfo.liquidity), 0), 1)
    : 0;
  const stakedTvlUsd = sgData.tvlUsd * stakedFrac;

  if (!prices) {
    const fallback = computeEmissionApr(rewardRate, topazUsd, stakedTvlUsd, alive);
    return { emissionApr: fallback, stakedTvlUsd };
  }

  const spread = getPresetSpreadPercent(poolInfo.symbol0, poolInfo.symbol1, poolInfo.tickSpacing);
  const { tickLower, tickUpper } = getTicksForSpread(poolInfo.tick, spread, poolInfo.tickSpacing);

  const sqrtCurrent = poolInfo.sqrtPriceX96;
  const sqrtLower = getSqrtRatioAtTick(tickLower);
  const sqrtUpper = getSqrtRatioAtTick(tickUpper);

  const refAmounts = getAmountsForLiquidity(sqrtCurrent, sqrtLower, sqrtUpper, REFERENCE_LIQUIDITY);
  const refValue =
    Number(refAmounts.amount0) / 10 ** poolInfo.decimals0 * prices.price0Usd +
    Number(refAmounts.amount1) / 10 ** poolInfo.decimals1 * prices.price1Usd;

  if (!Number.isFinite(refValue) || refValue <= 0) {
    const fallback = computeEmissionApr(rewardRate, topazUsd, stakedTvlUsd, alive);
    return { emissionApr: fallback, stakedTvlUsd };
  }

  const scaledLiq = BigInt(Math.floor(
    Number(REFERENCE_LIQUIDITY) * (PRESET_DEPOSIT_USD / refValue),
  ));
  if (scaledLiq <= 0n) {
    return { emissionApr: 0, stakedTvlUsd };
  }

  const posAmounts = getAmountsForLiquidity(sqrtCurrent, sqrtLower, sqrtUpper, scaledLiq);
  const posValueUsd =
    Number(posAmounts.amount0) / 10 ** poolInfo.decimals0 * prices.price0Usd +
    Number(posAmounts.amount1) / 10 ** poolInfo.decimals1 * prices.price1Usd;

  const totalStakedAfter = poolInfo.stakedLiquidity + scaledLiq;
  const apr = computePositionEmissionApr(
    scaledLiq, totalStakedAfter, rewardRate, topazUsd, posValueUsd, alive,
  );

  return { emissionApr: apr ?? 0, stakedTvlUsd };
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
  const sgData = await subgraphPool(pool, type);
  const topazUsd = await getTopazUsdPrice();
  const v = voter();
  const gauge: string = await v.gauges(pool);

  if (gauge === ZeroAddress) {
    return {
      pool,
      type,
      gauge: null,
      alive: false,
      tvlUsd: sgData.tvlUsd,
      stakedTvlUsd: 0,
      emissionApr: 0,
      feeApr: computeFeeApr(sgData.fees7d, sgData.tvlUsd),
      rewardRatePerSec: 0n,
      topazUsd,
    };
  }
  const alive: boolean = await v.isAlive(gauge);

  let rewardRate: bigint;
  let periodFinish: bigint;
  let stakedTvlUsd: number;
  let emissionApr: number;

  if (type === "v2") {
    const g = gaugeC(gauge);
    const [rate, pf, totalSupply, poolSupply] = await Promise.all([
      g.rewardRate() as Promise<bigint>,
      g.periodFinish() as Promise<bigint>,
      g.totalSupply() as Promise<bigint>,
      new Contract(pool, ABIS.Pool, provider()).totalSupply() as Promise<bigint>,
    ]);
    rewardRate = rate;
    periodFinish = pf;
    const stakedFraction = poolSupply > 0n ? Number(totalSupply) / Number(poolSupply) : 0;
    stakedTvlUsd = sgData.tvlUsd * stakedFraction;
    emissionApr = isRewardPeriodActive(periodFinish)
      ? computeEmissionApr(rewardRate, topazUsd, stakedTvlUsd, alive)
      : 0;
  } else {
    const g = clGaugeC(gauge);
    const [poolInfo, rate, pf] = await Promise.all([
      getPoolV3(pool),
      g.rewardRate() as Promise<bigint>,
      g.periodFinish() as Promise<bigint>,
    ]);
    rewardRate = rate;
    periodFinish = pf;
    if (isRewardPeriodActive(periodFinish)) {
      const result = computeV3PresetApr(poolInfo, sgData, rewardRate, topazUsd, alive);
      emissionApr = result.emissionApr;
      stakedTvlUsd = result.stakedTvlUsd;
    } else {
      const stakedFrac = poolInfo.liquidity > 0n
        ? Math.min(Math.max(Number(poolInfo.stakedLiquidity) / Number(poolInfo.liquidity), 0), 1)
        : 0;
      emissionApr = 0;
      stakedTvlUsd = sgData.tvlUsd * stakedFrac;
    }
  }

  const feeApr = computeFeeApr(sgData.fees7d, sgData.tvlUsd);

  return {
    pool,
    type,
    gauge,
    alive,
    tvlUsd: sgData.tvlUsd,
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
    const [amounts, decimals] = await Promise.all([
      Promise.all(tokens.map((t) => c.tokenRewardsPerEpoch(t, epoch) as Promise<bigint>)),
      Promise.all(tokens.map((t) => getDecimals(t))),
    ]);
    for (let i = 0; i < tokens.length; i++) {
      if (amounts[i] === 0n) continue;
      const px = tokens[i].toLowerCase() === ADDR.TOPAZ.toLowerCase()
        ? topazUsd
        : await getUsdPrice(tokens[i]).catch(() => 0);
      usdEpoch += (Number(amounts[i]) / 10 ** decimals[i]) * px;
    }
  }

  const weightVe = Number(weight) / 1e18;
  const usdPerVeAnnual = (usdEpoch / weightVe) * 52;
  return (usdPerVeAnnual / topazUsd) * 100;
}

export interface PositionAprBreakdown {
  tokenId: bigint;
  pool: string;
  inRange: boolean;
  positionValueUsd: number;
  emissionApr: number;
  feeApr: number;
}

export async function positionApr(tokenId: bigint): Promise<PositionAprBreakdown> {
  const pos = await getPosition(tokenId);
  if (pos.pool === ZeroAddress) {
    return { tokenId, pool: pos.pool, inRange: false, positionValueUsd: 0, emissionApr: 0, feeApr: 0 };
  }

  const [poolInfo, sgData, topazUsd] = await Promise.all([
    getPoolV3(pos.pool),
    subgraphPool(pos.pool, "v3"),
    getTopazUsdPrice(),
  ]);

  const inRange = poolInfo.tick >= pos.tickLower && poolInfo.tick < pos.tickUpper;

  const priceRatio = sqrtPriceX96ToPrice(poolInfo.sqrtPriceX96, poolInfo.decimals0, poolInfo.decimals1);
  const prices = deriveTokenPricesUsd(sgData.tvlUsd, sgData.tvlToken0, sgData.tvlToken1, priceRatio);

  if (!prices) {
    return { tokenId, pool: pos.pool, inRange, positionValueUsd: 0, emissionApr: 0, feeApr: 0 };
  }

  const sqrtLower = getSqrtRatioAtTick(pos.tickLower);
  const sqrtUpper = getSqrtRatioAtTick(pos.tickUpper);
  const amounts = getAmountsForLiquidity(poolInfo.sqrtPriceX96, sqrtLower, sqrtUpper, pos.liquidity);
  const posValueUsd =
    Number(amounts.amount0) / 10 ** poolInfo.decimals0 * prices.price0Usd +
    Number(amounts.amount1) / 10 ** poolInfo.decimals1 * prices.price1Usd;

  if (posValueUsd <= 0 || !inRange) {
    return { tokenId, pool: pos.pool, inRange, positionValueUsd: posValueUsd, emissionApr: 0, feeApr: 0 };
  }

  const v = voter();
  const gauge: string = await v.gauges(pos.pool);
  if (gauge === ZeroAddress) {
    return { tokenId, pool: pos.pool, inRange, positionValueUsd: posValueUsd, emissionApr: 0, feeApr: 0 };
  }
  const g = clGaugeC(gauge);
  const [alive, rewardRate, periodFinish]: [boolean, bigint, bigint] = await Promise.all([
    v.isAlive(gauge),
    g.rewardRate() as Promise<bigint>,
    g.periodFinish() as Promise<bigint>,
  ]);

  const emissionApr = isRewardPeriodActive(periodFinish)
    ? (computePositionEmissionApr(
        pos.liquidity, poolInfo.stakedLiquidity, rewardRate, topazUsd, posValueUsd, alive,
      ) ?? 0)
    : 0;

  const posLiqShare = poolInfo.liquidity > 0n
    ? Number(pos.liquidity) / Number(poolInfo.liquidity)
    : 0;
  const annualFeesUsd = sgData.fees7d * 52;
  const feeApr = posValueUsd > 0
    ? (annualFeesUsd * posLiqShare) / posValueUsd * 100
    : 0;

  return { tokenId, pool: pos.pool, inRange, positionValueUsd: posValueUsd, emissionApr, feeApr };
}
