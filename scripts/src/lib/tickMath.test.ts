import { describe, it, expect } from "vitest";
import {
  Q96,
  MIN_TICK,
  MAX_TICK,
  MIN_SQRT_RATIO,
  MAX_SQRT_RATIO,
  getSqrtRatioAtTick,
  getTickAtSqrtRatio,
  getAmountsForLiquidity,
  getLiquidityForAmounts,
  nearestUsableTick,
} from "./tickMath.js";

describe("getSqrtRatioAtTick — known Uniswap V3 fixtures", () => {
  // Reference values match the canonical Uniswap V3 TickMath library.
  it("tick 0 returns Q96 (price = 1)", () => {
    expect(getSqrtRatioAtTick(0)).toBe(Q96);
  });

  it("MIN_TICK returns MIN_SQRT_RATIO", () => {
    expect(getSqrtRatioAtTick(MIN_TICK)).toBe(MIN_SQRT_RATIO);
  });

  it("MAX_TICK returns MAX_SQRT_RATIO", () => {
    expect(getSqrtRatioAtTick(MAX_TICK)).toBe(MAX_SQRT_RATIO);
  });

  it("known fixtures match Uniswap V3 SDK", () => {
    // Spot-checks against @uniswap/v3-sdk TickMath.getSqrtRatioAtTick output.
    expect(getSqrtRatioAtTick(1)).toBe(79232123823359799118286999568n);
    expect(getSqrtRatioAtTick(-1)).toBe(79224201403219477170569942574n);
    expect(getSqrtRatioAtTick(100)).toBe(79625275426524748796330556128n);
  });

  it("rejects out-of-range ticks", () => {
    expect(() => getSqrtRatioAtTick(MAX_TICK + 1)).toThrow(/out of range/);
    expect(() => getSqrtRatioAtTick(MIN_TICK - 1)).toThrow(/out of range/);
  });
});

describe("getTickAtSqrtRatio — inverse of getSqrtRatioAtTick", () => {
  it("round-trips a representative tick set", () => {
    // Interior ticks only — the inverse at the absolute boundary computes a candidate
    // tick outside ±MAX_TICK (same caveat as Uniswap's TickMath reference).
    for (const tick of [-887271, -100000, -10000, -200, -1, 0, 1, 200, 10000, 100000, 887271]) {
      const sqrt = getSqrtRatioAtTick(tick);
      expect(getTickAtSqrtRatio(sqrt)).toBe(tick);
    }
  });

  it("rejects out-of-range sqrt prices", () => {
    expect(() => getTickAtSqrtRatio(MIN_SQRT_RATIO - 1n)).toThrow(/out of range/);
    expect(() => getTickAtSqrtRatio(MAX_SQRT_RATIO)).toThrow(/out of range/);
  });
});

describe("getAmountsForLiquidity / getLiquidityForAmounts", () => {
  // Range: tick -200 .. 200, current price at tick 0.
  const sqrtLower = getSqrtRatioAtTick(-200);
  const sqrtUpper = getSqrtRatioAtTick(200);
  const sqrtCurrent = getSqrtRatioAtTick(0);
  const L = 10n ** 18n;

  it("price below range → all amount0, zero amount1", () => {
    const below = getSqrtRatioAtTick(-500);
    const { amount0, amount1 } = getAmountsForLiquidity(below, sqrtLower, sqrtUpper, L);
    expect(amount0).toBeGreaterThan(0n);
    expect(amount1).toBe(0n);
  });

  it("price above range → all amount1, zero amount0", () => {
    const above = getSqrtRatioAtTick(500);
    const { amount0, amount1 } = getAmountsForLiquidity(above, sqrtLower, sqrtUpper, L);
    expect(amount0).toBe(0n);
    expect(amount1).toBeGreaterThan(0n);
  });

  it("price inside range → both sides nonzero", () => {
    const { amount0, amount1 } = getAmountsForLiquidity(sqrtCurrent, sqrtLower, sqrtUpper, L);
    expect(amount0).toBeGreaterThan(0n);
    expect(amount1).toBeGreaterThan(0n);
  });

  it("symmetric range around price has near-equal amount0/amount1", () => {
    const { amount0, amount1 } = getAmountsForLiquidity(sqrtCurrent, sqrtLower, sqrtUpper, L);
    // Within 0.1% — symmetry isn't exact because sqrt math rounds.
    const diff = amount0 > amount1 ? amount0 - amount1 : amount1 - amount0;
    expect(diff * 1000n).toBeLessThanOrEqual(amount0);
  });

  it("getLiquidityForAmounts inverts within rounding tolerance", () => {
    const { amount0, amount1 } = getAmountsForLiquidity(sqrtCurrent, sqrtLower, sqrtUpper, L);
    const recovered = getLiquidityForAmounts(sqrtCurrent, sqrtLower, sqrtUpper, amount0, amount1);
    // Liquidity is the min of the two sides → rounding loses ≤ 1 wei of L.
    const diff = recovered > L ? recovered - L : L - recovered;
    expect(diff).toBeLessThanOrEqual(L / 1_000_000n);
  });
});

describe("nearestUsableTick", () => {
  it("rounds to the nearest multiple of tickSpacing", () => {
    // Use strict-equals on a coerced value so JS's -0 (Math.round of a small negative)
    // compares equal to +0 (Object.is, which `.toBe` uses, distinguishes them).
    const at = (t: number, s: number) => nearestUsableTick(t, s) + 0;
    expect(at(0, 200)).toBe(0);
    expect(at(99, 200)).toBe(0);
    expect(at(100, 200)).toBe(200);
    expect(at(199, 200)).toBe(200);
    expect(at(-99, 200)).toBe(0);
    expect(at(-100, 200)).toBe(0);
    expect(at(-101, 200)).toBe(-200);
  });

  it("clamps inward when rounded result exceeds MIN/MAX tick", () => {
    expect(nearestUsableTick(MAX_TICK, 200)).toBeLessThanOrEqual(MAX_TICK);
    expect(nearestUsableTick(MIN_TICK, 200)).toBeGreaterThanOrEqual(MIN_TICK);
  });
});
