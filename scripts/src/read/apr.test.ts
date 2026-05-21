import { describe, it, expect } from "vitest";
import { computeEmissionApr, computeFeeApr } from "./apr.js";

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
