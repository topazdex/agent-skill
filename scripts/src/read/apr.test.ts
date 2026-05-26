import { describe, it, expect } from "vitest";
import {
  computeEmissionApr,
  computeFeeApr,
  computePositionEmissionApr,
  isRewardPeriodActive,
  isStablePair,
  getPresetSpreadPercent,
  getTicksForSpread,
  deriveTokenPricesUsd,
  computeV3PresetApr,
} from "./apr.js";
import type { PoolInfoV3 } from "./pools.js";
import { getSqrtRatioAtTick } from "../lib/tickMath.js";

// 1.D goldens — frozen inputs, frozen outputs. If poolApr's formula silently changes,
// these break.

describe("computeEmissionApr", () => {
  // Inputs chosen so the arithmetic resolves to a round, hand-verifiable number.
  //   rewardRatePerSec = 1e18 wei/s        → 1 TOPAZ / sec
  //   SECONDS_PER_YEAR = 31_536_000        → 31_536_000 TOPAZ / year
  //   topazUsd         = $1                → $31_536_000 / year of emissions
  //   stakedTvlUsd     = $31_536_000       → APR = 100% (annual emissions ÷ staked TVL)
  it("frozen: 1 TOPAZ/s, $1 TOPAZ, $31.536M staked → 100% APR", () => {
    const apr = computeEmissionApr(10n ** 18n, 1, 31_536_000, true);
    expect(apr).toBeCloseTo(100, 6);
  });

  it("frozen: doubling staked TVL halves the APR", () => {
    const apr = computeEmissionApr(10n ** 18n, 1, 63_072_000, true);
    expect(apr).toBeCloseTo(50, 6);
  });

  it("frozen: realistic small numbers (0.001 TOPAZ/s, $0.10 TOPAZ, $100k staked)", () => {
    // annualUsd = (1e15 * 31_536_000 / 1e18) * 0.10 = 31536 * 0.10 = 3153.6
    // apr = 3153.6 / 100_000 * 100 = 3.1536%
    const apr = computeEmissionApr(10n ** 15n, 0.1, 100_000, true);
    expect(apr).toBeCloseTo(3.1536, 6);
  });

  it("returns 0 when the gauge is killed (alive=false)", () => {
    expect(computeEmissionApr(10n ** 18n, 1, 1_000_000, false)).toBe(0);
  });

  it("returns 0 when nothing is staked", () => {
    expect(computeEmissionApr(10n ** 18n, 1, 0, true)).toBe(0);
    expect(computeEmissionApr(10n ** 18n, 1, -1, true)).toBe(0);
  });
});

describe("computeFeeApr", () => {
  //   fees7d  = $21k trailing 7d   → annualFees $21k × 52 = $1.092M
  //   tvlUsd  = $10M               → feeApr = $1.092M / $10M × 100 = 10.92%
  it("frozen: $21k 7d fees, $10M TVL → 10.92% APR", () => {
    const apr = computeFeeApr(21_000, 10_000_000);
    expect(apr).toBeCloseTo(10.92, 6);
  });

  it("frozen: low-fee sample (fees7d=$35, TVL=$1M) → 0.182% APR", () => {
    // annualFees = 35 * 52 = 1820 → apr = 1820 / 1_000_000 * 100 = 0.182%
    const apr = computeFeeApr(35, 1_000_000);
    expect(apr).toBeCloseTo(0.182, 6);
  });

  it("scales linearly with fees7d", () => {
    const aprA = computeFeeApr(10_000, 10_000_000);
    const aprB = computeFeeApr(30_000, 10_000_000);
    expect(aprB / aprA).toBeCloseTo(3, 6);
  });

  it("returns 0 when tvl is zero or negative", () => {
    expect(computeFeeApr(1_000, 0)).toBe(0);
    expect(computeFeeApr(1_000, -1)).toBe(0);
  });

  it("returns 0 when fees7d is zero (new pool, no swaps yet)", () => {
    expect(computeFeeApr(0, 1_000_000)).toBe(0);
  });
});

describe("computePositionEmissionApr", () => {
  // posLiq=1000, stakedLiq=10000 → 10% share of rewards
  // rewardRate=1e18 (1 TOPAZ/s), topazUsd=$1
  // annualRewards = 0.10 * 31_536_000 = 3_153_600
  // posValueUsd=$100_000 → apr = 3_153_600 / 100_000 * 100 = 3153.6%
  it("frozen: 10% liquidity share, $100k position → 3153.6% APR", () => {
    const apr = computePositionEmissionApr(1000n, 10000n, 10n ** 18n, 1, 100_000, true);
    expect(apr).toBeCloseTo(3153.6, 1);
  });

  it("tighter position = higher APR (same liquidity, lower posValueUsd)", () => {
    const wide = computePositionEmissionApr(1000n, 10000n, 10n ** 18n, 1, 100_000, true)!;
    const tight = computePositionEmissionApr(1000n, 10000n, 10n ** 18n, 1, 10_000, true)!;
    expect(tight / wide).toBeCloseTo(10, 6);
  });

  it("returns 0 when gauge is dead", () => {
    expect(computePositionEmissionApr(1000n, 10000n, 10n ** 18n, 1, 100_000, false)).toBe(0);
  });

  it("returns Infinity when stakedLiquidity is 0 (first staker)", () => {
    expect(computePositionEmissionApr(1000n, 0n, 10n ** 18n, 1, 100_000, true)).toBe(Infinity);
  });

  it("returns 0 when positionValueUsd is 0", () => {
    expect(computePositionEmissionApr(1000n, 10000n, 10n ** 18n, 1, 0, true)).toBe(0);
  });
});

describe("isRewardPeriodActive", () => {
  it("returns true when periodFinish is in the future", () => {
    const future = Math.floor(Date.now() / 1000) + 86400;
    expect(isRewardPeriodActive(BigInt(future))).toBe(true);
  });

  it("returns false when periodFinish is in the past", () => {
    const past = Math.floor(Date.now() / 1000) - 86400;
    expect(isRewardPeriodActive(BigInt(past))).toBe(false);
  });

  it("returns true when periodFinish is 0 (no period set)", () => {
    expect(isRewardPeriodActive(0n)).toBe(true);
  });

  it("accepts explicit nowSec for deterministic testing", () => {
    expect(isRewardPeriodActive(1000n, 999)).toBe(true);
    expect(isRewardPeriodActive(1000n, 1001)).toBe(false);
  });
});

describe("isStablePair", () => {
  it("returns true for USDC/USDT", () => {
    expect(isStablePair("USDC", "USDT")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isStablePair("usdc", "dai")).toBe(true);
  });

  it("returns false when one token is not a stablecoin", () => {
    expect(isStablePair("WBNB", "USDT")).toBe(false);
  });
});

describe("getPresetSpreadPercent", () => {
  it("returns 3% for volatile pairs", () => {
    expect(getPresetSpreadPercent("WBNB", "USDT", 200)).toBe(3);
  });

  it("tickSpacing=1 overrides stable pair to 0.05%", () => {
    expect(getPresetSpreadPercent("USDC", "USDT", 1)).toBe(0.05);
  });

  it("returns 0.05% for tickSpacing=1 regardless of pair", () => {
    expect(getPresetSpreadPercent("WBNB", "TOPAZ", 1)).toBe(0.05);
  });

  it("returns 0.1% for stable pairs with tickSpacing > 1", () => {
    expect(getPresetSpreadPercent("USDC", "USDT", 50)).toBe(0.1);
  });
});

describe("getTicksForSpread", () => {
  it("produces symmetric bounds around current tick for ±3%", () => {
    // log(1.03) / log(1.0001) ≈ 295.9 → ticksFromCenter = 295
    const { tickLower, tickUpper } = getTicksForSpread(0, 3, 1);
    expect(tickLower).toBeLessThan(0);
    expect(tickUpper).toBeGreaterThan(0);
    expect(tickUpper + tickLower).toBeLessThanOrEqual(1);
  });

  it("aligns to tickSpacing", () => {
    const { tickLower, tickUpper } = getTicksForSpread(100, 3, 200);
    expect(Math.abs(tickLower % 200)).toBe(0);
    expect(Math.abs(tickUpper % 200)).toBe(0);
  });

  it("fallback: at least one tick spacing if spread is too narrow", () => {
    const { tickLower, tickUpper } = getTicksForSpread(0, 0.00001, 200);
    expect(tickUpper - tickLower).toBeGreaterThanOrEqual(200);
  });
});

describe("deriveTokenPricesUsd", () => {
  it("derives prices from pool TVL data", () => {
    // token0 is 2x price of token1, pool has 100 token0 + 200 token1 = $400 total
    // priceRatio = 2 (how many token1 per token0)
    // denom = 100 * 2 + 200 = 400
    // price1Usd = 400 / 400 = 1
    // price0Usd = 1 * 2 = 2
    const result = deriveTokenPricesUsd(400, 100, 200, 2);
    expect(result).toBeDefined();
    expect(result!.price0Usd).toBeCloseTo(2, 6);
    expect(result!.price1Usd).toBeCloseTo(1, 6);
  });

  it("returns undefined when tvlUsd is 0", () => {
    expect(deriveTokenPricesUsd(0, 100, 200, 2)).toBeUndefined();
  });

  it("returns undefined when priceRatio is 0", () => {
    expect(deriveTokenPricesUsd(400, 100, 200, 0)).toBeUndefined();
  });
});

describe("computeV3PresetApr", () => {
  function makePoolInfo(overrides?: Partial<PoolInfoV3>): PoolInfoV3 {
    return {
      type: "v3",
      address: "0x1234567890123456789012345678901234567890",
      token0: "0xaaaa",
      token1: "0xbbbb",
      decimals0: 18,
      decimals1: 18,
      symbol0: "WBNB",
      symbol1: "USDT",
      tickSpacing: 200,
      fee: 3000,
      unstakedFee: 0,
      sqrtPriceX96: getSqrtRatioAtTick(0), // price = 1.0
      tick: 0,
      liquidity: 1_000_000_000_000_000_000n, // 1e18
      stakedLiquidity: 500_000_000_000_000_000n, // 5e17 (50% staked)
      ...overrides,
    };
  }

  const sgData = { tvlUsd: 1_000_000, tvlToken0: 500_000, tvlToken1: 500_000 };

  it("returns higher APR than pool-wide average for concentrated position", () => {
    const pool = makePoolInfo();
    const rewardRate = 10n ** 18n; // 1 TOPAZ/s
    const topazUsd = 1;

    const result = computeV3PresetApr(pool, sgData, rewardRate, topazUsd, true);
    const poolWideAvg = computeEmissionApr(rewardRate, topazUsd, sgData.tvlUsd * 0.5, true);

    expect(result.emissionApr).toBeGreaterThan(poolWideAvg);
  });

  it("returns 0 when gauge is dead", () => {
    const pool = makePoolInfo();
    const result = computeV3PresetApr(pool, sgData, 10n ** 18n, 1, false);
    expect(result.emissionApr).toBe(0);
  });

  it("returns 0 when stakedLiquidity is 0", () => {
    const pool = makePoolInfo({ stakedLiquidity: 0n });
    const result = computeV3PresetApr(pool, sgData, 10n ** 18n, 1, true);
    expect(result.emissionApr).toBe(0);
  });

  it("stakedTvlUsd reflects staked fraction of pool TVL", () => {
    const pool = makePoolInfo();
    const result = computeV3PresetApr(pool, sgData, 10n ** 18n, 1, true);
    expect(result.stakedTvlUsd).toBeCloseTo(500_000, -2);
  });
});
