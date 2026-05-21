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
  //   vol7d   = $7M trailing 7d → avgDaily $1M → annualVol $365M
  //   feeRate = 0.003 (30 bps)  → annualFees $1.095M
  //   tvlUsd  = $10M            → feeApr = 10.95%
  it("frozen: $7M 7d-vol, 30bps fee, $10M TVL → 10.95% APR", () => {
    const apr = computeFeeApr(7_000_000, 10_000_000, 0.003);
    expect(apr).toBeCloseTo(10.95, 6);
  });

  it("frozen: low-volume sample (vol=$70k, 5bps, TVL=$1M) → 0.1825% APR", () => {
    // avgDaily=10k → annualVol=3.65M → annualFees=1825 → apr=0.1825%
    const apr = computeFeeApr(70_000, 1_000_000, 0.0005);
    expect(apr).toBeCloseTo(0.1825, 6);
  });

  it("scales linearly with feeRate", () => {
    const aprA = computeFeeApr(7_000_000, 10_000_000, 0.001);
    const aprB = computeFeeApr(7_000_000, 10_000_000, 0.003);
    expect(aprB / aprA).toBeCloseTo(3, 6);
  });

  it("returns 0 when tvl is zero or negative", () => {
    expect(computeFeeApr(1_000_000, 0, 0.003)).toBe(0);
    expect(computeFeeApr(1_000_000, -1, 0.003)).toBe(0);
  });
});
