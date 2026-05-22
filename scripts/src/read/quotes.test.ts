import { describe, it, expect } from "vitest";
import { Interface, AbiCoder, getAddress } from "ethers";
import { ABIS } from "../lib/abis.js";
import { ADDR, TICK_SPACINGS } from "../config/addresses.js";
import { HOP_TOKENS, TOKENS } from "../config/tokens.js";
import {
  compareByAmountOutDesc,
  computePriceImpactPct,
  decodeCandidates,
  enumerateV2Plans,
  enumerateV3Plans,
  filterByImpact,
  inventoryFromMap,
  permissiveInventory,
  type BestRoute,
  type CandidatePlan,
} from "./quotes.js";
import type { MulticallResult } from "../lib/multicall.js";

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
    // #given three candidates with distinct amounts
    const a = mkRoute(100n, "v2 direct", "v2");
    const b = mkRoute(200n, "v3 direct ts=200", "v3-single");
    const c = mkRoute(150n, "v3 ts=100 → ts=200", "v3-path");

    // #when
    const sorted = [a, b, c].sort(compareByAmountOutDesc);

    // #then
    expect(sorted.map((r) => r.amountOut)).toEqual([200n, 150n, 100n]);
    expect(sorted[0].route).toBe("v3 direct ts=200");
  });

  it("preserves input order on ties (stable sort)", () => {
    // #given three candidates with identical amounts
    const a = mkRoute(100n, "first", "v2");
    const b = mkRoute(100n, "second", "v3-single");
    const c = mkRoute(100n, "third", "v3-path");

    // #when
    const sorted = [a, b, c].sort(compareByAmountOutDesc);

    // #then
    expect(sorted.map((r) => r.route)).toEqual(["first", "second", "third"]);
  });

  it("handles realistic wei-magnitude amounts without precision loss", () => {
    // #given two amounts that differ only in the low bits of a 21-digit number
    const lo = mkRoute(2_999_000_000_000_000_000_000n, "v3 direct ts=200", "v3-single");
    const hi = mkRoute(2_999_276_630_055_254_559_038n, "v3 direct ts=100", "v3-single");

    // #when
    const sorted = [lo, hi].sort(compareByAmountOutDesc);

    // #then bigint comparison kept full precision
    expect(sorted[0].amountOut).toBe(2_999_276_630_055_254_559_038n);
  });

  it("returns 0 only on exact bigint equality", () => {
    expect(compareByAmountOutDesc(mkRoute(100n, "a", "v2"), mkRoute(100n, "b", "v2"))).toBe(0);
    expect(compareByAmountOutDesc(mkRoute(101n, "a", "v2"), mkRoute(100n, "b", "v2"))).toBe(-1);
    expect(compareByAmountOutDesc(mkRoute(100n, "a", "v2"), mkRoute(101n, "b", "v2"))).toBe(1);
  });
});

describe("enumerateV2Plans (multicall plan construction, no mixed)", () => {
  // #given a non-trivial token pair that doesn't overlap any HOP_TOKENS entry
  const tokenIn = getAddress("0x" + "1".repeat(40));
  const tokenOut = getAddress("0x" + "2".repeat(40));
  const amountIn = 1_000_000_000_000_000_000n;
  const fullyConnected = permissiveInventory();

  it("emits direct + 2-hop + 3-hop v2 plans across HOP_TOKENS", () => {
    // #when the enumerator sweeps up to MAX_ROUTE_HOPS=3 with every pool present
    const plans = enumerateV2Plans(tokenIn, tokenOut, amountIn, fullyConnected, 3);

    // #then the candidate count matches the closed-form combinatorics:
    //   direct          : 2 (volatile + stable)
    //   2-hop via H     : |HOP| × 2^2 = |HOP| × 4
    //   3-hop via H1,H2 : |HOP| × (|HOP|-1) × 2^3
    const h = HOP_TOKENS.length;
    const expected = 2 + h * 4 + h * (h - 1) * 8;
    expect(plans.length).toBe(expected);
  });

  it("respects maxHops=2 by dropping the 3-hop layer", () => {
    // #when only 1- and 2-hop routes are requested
    const plans = enumerateV2Plans(tokenIn, tokenOut, amountIn, fullyConnected, 2);

    // #then 3-hop combinations are absent
    const h = HOP_TOKENS.length;
    const expected = 2 + h * 4;
    expect(plans.length).toBe(expected);
  });

  it("skips intermediaries that collide with tokenIn or tokenOut", () => {
    // #given tokenIn = WBNB, which is itself one of the HOP_TOKENS
    const wbnb = TOKENS.WBNB.address;

    // #when
    const plans = enumerateV2Plans(wbnb, tokenOut, amountIn, fullyConnected, 3);

    // #then the hop set shrinks by 1 (WBNB excluded as midpoint)
    const h = HOP_TOKENS.length - 1;
    const expected = 2 + h * 4 + h * (h - 1) * 8;
    expect(plans.length).toBe(expected);
  });

  it("filters out routes whose legs are not in the inventory", () => {
    // #given an inventory where the direct leg has only a volatile pool and no hop edge exists
    const inventory = inventoryFromMap({
      [`${tokenIn.toLowerCase()}-${tokenOut.toLowerCase()}`]: { v2Volatile: true },
    });

    // #when
    const plans = enumerateV2Plans(tokenIn, tokenOut, amountIn, inventory, 3);

    // #then only the volatile direct candidate survives
    expect(plans.length).toBe(1);
    expect(plans[0].call.target).toBe(ADDR.Router);
    const iface = new Interface(ABIS.Router);
    const selector = iface.getFunction("getAmountsOut")!.selector;
    expect(plans[0].call.callData.startsWith(selector)).toBe(true);
  });
});

describe("enumerateV3Plans (multicall plan construction, no mixed)", () => {
  const tokenIn = getAddress("0x" + "1".repeat(40));
  const tokenOut = getAddress("0x" + "2".repeat(40));
  const amountIn = 1_000_000_000_000_000_000n;
  const fullyConnected = permissiveInventory();

  it("emits direct + 2-hop + 3-hop v3 plans for every tick spacing combination", () => {
    // #when sweeping all hops up to 3 with every CL pool present
    const plans = enumerateV3Plans(tokenIn, tokenOut, amountIn, fullyConnected, 3);

    // #then candidate count matches the cartesian product of tick spacings per leg:
    //   direct          : |TS|
    //   2-hop via H     : |HOP| × |TS|^2
    //   3-hop via H1,H2 : |HOP| × (|HOP|-1) × |TS|^3
    const h = HOP_TOKENS.length;
    const ts = TICK_SPACINGS.length;
    const expected = ts + h * ts * ts + h * (h - 1) * ts * ts * ts;
    expect(plans.length).toBe(expected);
  });

  it("uses quoteExactInputSingle for direct routes and quoteExactInput for multi-hop", () => {
    // #given a permissive inventory (every pool present)
    const plans = enumerateV3Plans(tokenIn, tokenOut, amountIn, fullyConnected, 2);
    const iface = new Interface(ABIS.QuoterV2);
    const directSel = iface.getFunction("quoteExactInputSingle")!.selector;
    const pathSel = iface.getFunction("quoteExactInput")!.selector;

    // #when partitioning by selector
    const directs = plans.filter((p) => p.call.callData.startsWith(directSel));
    const paths = plans.filter((p) => p.call.callData.startsWith(pathSel));

    // #then direct count = |TS|, path count = |HOP| × |TS|^2
    expect(directs.length).toBe(TICK_SPACINGS.length);
    expect(paths.length).toBe(HOP_TOKENS.length * TICK_SPACINGS.length * TICK_SPACINGS.length);
  });

  it("drops candidates whose legs lack the required tick-spacing pool", () => {
    // #given an inventory with only ts=200 direct CL liquidity, no hop edges
    const inventory = inventoryFromMap({
      [`${tokenIn.toLowerCase()}-${tokenOut.toLowerCase()}`]: { v3: [200] },
    });

    // #when
    const plans = enumerateV3Plans(tokenIn, tokenOut, amountIn, inventory, 3);

    // #then only the direct ts=200 plan survives
    expect(plans.length).toBe(1);
  });
});

describe("computePriceImpactPct (USD sanity)", () => {
  it("returns 0 for a perfectly priced 1-for-1 swap", () => {
    // #given 1000 USDT (18 dec, $1) → 1000 USDC (18 dec, $1)
    const amountIn = 1000n * 10n ** 18n;
    const amountOut = 1000n * 10n ** 18n;

    // #when
    const impact = computePriceImpactPct(amountIn, 18, 1, amountOut, 18, 1);

    // #then no value lost
    expect(impact).toBe(0);
  });

  it("flags a stale-pool route as near-100% impact", () => {
    // #given 1000 USDT in ($1000), 0.022 SOL out at $87.10/SOL (≈ $1.92)
    const amountIn = 1000n * 10n ** 18n;
    const amountOut = 22547660849769575n; // 0.0225 SOL in wei

    // #when
    const impact = computePriceImpactPct(amountIn, 18, 1, amountOut, 18, 87.10);

    // #then ≈ 99.8% impact
    expect(impact).toBeGreaterThan(0.99);
  });

  it("returns undefined when either price is missing", () => {
    expect(computePriceImpactPct(1n, 18, undefined, 1n, 18, 1)).toBeUndefined();
    expect(computePriceImpactPct(1n, 18, 1, 1n, 18, undefined)).toBeUndefined();
    expect(computePriceImpactPct(1n, 18, 0, 1n, 18, 1)).toBeUndefined();
  });
});

describe("filterByImpact (drop broken-pool candidates)", () => {
  const amountIn = 1000n * 10n ** 18n;
  const ctxBase = {
    decIn: 18,
    decOut: 18,
    amountIn,
    maxPriceImpactPct: 0.5,
    minRelativeToBest: 0.5,
  };

  it("drops a >50%-impact route when USD prices are known and annotates survivors", () => {
    // #given a healthy 1000 USDT → 11.4 SOL route and a stale 0.022 SOL route
    const healthy = mkRoute(11_400_000_000_000_000_000n, "v3 direct ts=50", "v3-single");
    const stale = mkRoute(22_000_000_000_000_000n, "v3 ts=1 → ts=200 via USDC/WBNB", "v3-path");

    // #when SOL = $87.10, USDT = $1
    const out = filterByImpact([healthy, stale], {
      ...ctxBase,
      priceInUSD: 1,
      priceOutUSD: 87.10,
    });

    // #then only the healthy route survives, with its impact annotated
    expect(out.length).toBe(1);
    expect(out[0].route).toBe("v3 direct ts=50");
    expect(out[0].priceImpactPct).toBeDefined();
    expect(out[0].priceImpactPct!).toBeLessThan(0.01);
  });

  it("falls back to relative-to-best filtering when prices are missing", () => {
    // #given the healthy/stale pair but no subgraph prices
    const healthy = mkRoute(11_400_000_000_000_000_000n, "v3 direct ts=50", "v3-single");
    const stale = mkRoute(22_000_000_000_000_000n, "v3 ts=1 → ts=200 via USDC/WBNB", "v3-path");

    // #when no priceInUSD / priceOutUSD set
    const out = filterByImpact([healthy, stale], ctxBase);

    // #then the relative filter still drops the stale route (≈ 0.2% of best)
    expect(out.length).toBe(1);
    expect(out[0].priceImpactPct).toBeUndefined();
  });

  it("keeps an alternate route that is 75% of the best (legitimate 2nd choice)", () => {
    // #given two close routes for 1000 USDT → SOL, both healthy
    const best = mkRoute(11_400_000_000_000_000_000n, "v3 direct ts=50", "v3-single");
    const alt = mkRoute(8_500_000_000_000_000_000n, "v3 ts=50 → ts=50 via WBNB", "v3-path");

    // #when prices imply ~0%-25% impact (within the 50% threshold)
    const out = filterByImpact([best, alt], {
      ...ctxBase,
      priceInUSD: 1,
      priceOutUSD: 87.10,
    });

    // #then both survive
    expect(out.length).toBe(2);
  });

  it("returns an empty list when the input is empty (does not crash)", () => {
    expect(filterByImpact([], ctxBase)).toEqual([]);
  });

  it("setting maxPriceImpactPct=1 disables the USD filter", () => {
    // #given a -150% impact route (outUSD > inUSD — implausible but tests the bound)
    const r = mkRoute(5n, "synth", "v2");

    // #when threshold relaxed and relative filter disabled
    const out = filterByImpact([r], {
      ...ctxBase,
      priceInUSD: 1,
      priceOutUSD: 1,
      maxPriceImpactPct: 1,
      minRelativeToBest: 0,
    });

    // #then it survives
    expect(out.length).toBe(1);
  });
});

describe("decodeCandidates (multicall result distribution)", () => {
  const tokenIn = getAddress("0x" + "1".repeat(40));
  const tokenOut = getAddress("0x" + "2".repeat(40));
  const amountIn = 1_000_000_000_000_000_000n;
  const inventory = permissiveInventory();

  const encodeV2Result = (finalAmount: bigint): string => {
    const iface = new Interface(ABIS.Router);
    return iface.encodeFunctionResult("getAmountsOut", [[amountIn, finalAmount]]);
  };

  const encodeV3SingleResult = (amount: bigint): string => {
    const iface = new Interface(ABIS.QuoterV2);
    return iface.encodeFunctionResult("quoteExactInputSingle", [amount, 0n, 0n, 0n]);
  };

  it("returns one BestRoute per successful non-zero result", () => {
    // #given two direct v2 plans (volatile + stable)
    const plans = enumerateV2Plans(tokenIn, tokenOut, amountIn, inventory, 1).slice(0, 2);

    // #when both succeed with distinct amounts
    const results: MulticallResult[] = [
      { success: true, returnData: encodeV2Result(123n) },
      { success: true, returnData: encodeV2Result(456n) },
    ];
    const decoded = decodeCandidates(plans, results);

    // #then
    expect(decoded.length).toBe(2);
    expect(decoded.map((r) => r.amountOut).sort()).toEqual([123n, 456n].sort());
  });

  it("drops candidates where the multicall reported failure", () => {
    // #given a single direct v3 plan
    const plans: CandidatePlan[] = [enumerateV3Plans(tokenIn, tokenOut, amountIn, inventory, 1)[0]];

    // #when the multicall slot returned failure
    const results: MulticallResult[] = [{ success: false, returnData: "0x" }];
    const decoded = decodeCandidates(plans, results);

    // #then
    expect(decoded).toEqual([]);
  });

  it("drops candidates whose decoded amountOut is zero", () => {
    // #given a single direct v3 plan
    const plans: CandidatePlan[] = [enumerateV3Plans(tokenIn, tokenOut, amountIn, inventory, 1)[0]];

    // #when the quoter returned 0
    const results: MulticallResult[] = [{ success: true, returnData: encodeV3SingleResult(0n) }];
    const decoded = decodeCandidates(plans, results);

    // #then
    expect(decoded).toEqual([]);
  });

  it("drops candidates whose decoder throws on malformed returnData", () => {
    // #given any plan
    const plans: CandidatePlan[] = [enumerateV2Plans(tokenIn, tokenOut, amountIn, inventory, 1)[0]];

    // #when the returnData is garbage of the wrong shape
    const garbage = AbiCoder.defaultAbiCoder().encode(["uint256"], [42n]);
    const results: MulticallResult[] = [{ success: true, returnData: garbage }];
    const decoded = decodeCandidates(plans, results);

    // #then we don't crash; we just drop the candidate
    expect(decoded).toEqual([]);
  });

  it("throws on length mismatch between plans and results", () => {
    // #given one plan
    const plans: CandidatePlan[] = [enumerateV2Plans(tokenIn, tokenOut, amountIn, inventory, 1)[0]];

    // #when the results array is empty
    const results: MulticallResult[] = [];

    // #then
    expect(() => decodeCandidates(plans, results)).toThrow(/multicall returned 0 results for 1 plans/);
  });

  it("preserves exec metadata when decoding succeeds", () => {
    // #given the first v2 direct plan (volatile)
    const plans = enumerateV2Plans(tokenIn, tokenOut, amountIn, inventory, 1).slice(0, 1);

    // #when it succeeds
    const results: MulticallResult[] = [{ success: true, returnData: encodeV2Result(789n) }];
    const decoded = decodeCandidates(plans, results);

    // #then
    expect(decoded.length).toBe(1);
    expect(decoded[0].route).toBe("v2 volatile direct");
    expect(decoded[0].exec).toEqual({
      type: "v2",
      route: [
        {
          from: tokenIn,
          to: tokenOut,
          stable: false,
          factory: ADDR.PoolFactory,
        },
      ],
    });
  });
});
