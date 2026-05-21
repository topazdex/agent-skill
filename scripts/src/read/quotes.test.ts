import { describe, it, expect } from "vitest";
import { compareByAmountOutDesc, type BestRoute } from "./quotes.js";

const mkRoute = (amountOut: bigint, route: string, type: "v2" | "v3-single" | "v3-path"): BestRoute => ({
  amountOut,
  route,
  exec: type === "v3-single"
    ? { type, tokenIn: "0x" + "1".repeat(40), tokenOut: "0x" + "2".repeat(40), tickSpacing: 200 }
    : type === "v3-path"
    ? { type, tokens: [], spacings: [] }
    : { type, route: [] },
});

describe("compareByAmountOutDesc (1.D route-sort golden)", () => {
  it("orders strictly by amountOut descending", () => {
    const a = mkRoute(100n, "v2 direct", "v2");
    const b = mkRoute(200n, "v3 direct ts=200", "v3-single");
    const c = mkRoute(150n, "v3 ts=100 → ts=200", "v3-path");
    const sorted = [a, b, c].sort(compareByAmountOutDesc);
    expect(sorted.map((r) => r.amountOut)).toEqual([200n, 150n, 100n]);
    expect(sorted[0].route).toBe("v3 direct ts=200");
  });

  it("preserves input order on ties (stable sort)", () => {
    const a = mkRoute(100n, "first", "v2");
    const b = mkRoute(100n, "second", "v3-single");
    const c = mkRoute(100n, "third", "v3-path");
    const sorted = [a, b, c].sort(compareByAmountOutDesc);
    expect(sorted.map((r) => r.route)).toEqual(["first", "second", "third"]);
  });

  it("handles realistic wei-magnitude amounts without precision loss", () => {
    const lo = mkRoute(2_999_000_000_000_000_000_000n, "v3 direct ts=200", "v3-single");
    const hi = mkRoute(2_999_276_630_055_254_559_038n, "v3 direct ts=100", "v3-single");
    const sorted = [lo, hi].sort(compareByAmountOutDesc);
    expect(sorted[0].amountOut).toBe(2_999_276_630_055_254_559_038n);
  });

  it("returns 0 only on exact bigint equality", () => {
    expect(compareByAmountOutDesc(mkRoute(100n, "a", "v2"), mkRoute(100n, "b", "v2"))).toBe(0);
    expect(compareByAmountOutDesc(mkRoute(101n, "a", "v2"), mkRoute(100n, "b", "v2"))).toBe(-1);
    expect(compareByAmountOutDesc(mkRoute(100n, "a", "v2"), mkRoute(101n, "b", "v2"))).toBe(1);
  });
});
