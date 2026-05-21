import { describe, it, expect } from "vitest";
import { Interface, AbiCoder, getAddress } from "ethers";
import { ABIS } from "../lib/abis.js";
import { ADDR, TICK_SPACINGS } from "../config/addresses.js";
import { TOKENS } from "../config/tokens.js";
import {
  compareByAmountOutDesc,
  decodeCandidates,
  enumerateCandidates,
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

describe("enumerateCandidates (multicall plan construction)", () => {
  // #given a non-trivial token pair that doesn't match any 2-hop intermediary
  const tokenIn = getAddress("0x" + "1".repeat(40));
  const tokenOut = getAddress("0x" + "2".repeat(40));
  const amountIn = 1_000_000_000_000_000_000n;

  it("emits the expected number of plans with allowMixed=true", () => {
    // #when
    const plans = enumerateCandidates(tokenIn, tokenOut, amountIn, true);

    // #then — math:
    //   direct v2 (volatile+stable)         = 2
    //   direct v3 (per tick spacing)        = TICK_SPACINGS.length
    //   per hop:
    //     v2-v2 (2 stable bits × 2)         = 4
    //     v3-v3 (ts × ts)                   = TICK_SPACINGS.length ** 2
    //     mixed (2 orderings × 2 v2 stable × ts) = 4 * TICK_SPACINGS.length
    //   hops = WBNB, USDT, USDC, BTCB (all 4 distinct from tokenIn/Out)
    const ts = TICK_SPACINGS.length;
    const perHop = 4 + ts * ts + 4 * ts;
    const expected = 2 + ts + 4 * perHop;
    expect(plans.length).toBe(expected);
  });

  it("drops mixed plans when allowMixed=false", () => {
    // #when
    const withMixed = enumerateCandidates(tokenIn, tokenOut, amountIn, true);
    const withoutMixed = enumerateCandidates(tokenIn, tokenOut, amountIn, false);

    // #then mixed plans (4 * TICK_SPACINGS.length per hop, 4 hops) disappear
    const ts = TICK_SPACINGS.length;
    const dropped = 4 * 4 * ts;
    expect(withMixed.length - withoutMixed.length).toBe(dropped);
    // none of the remaining plans is mixed
    expect(
      withoutMixed.every((p) => {
        return p.call.target !== ADDR.MixedRouteQuoterV1;
      }),
    ).toBe(true);
  });

  it("skips hops where the intermediary equals tokenIn or tokenOut", () => {
    // #given tokenIn = WBNB so WBNB is no longer a viable intermediary
    const wbnb = TOKENS.WBNB.address;

    // #when
    const plans = enumerateCandidates(wbnb, tokenOut, amountIn, true);

    // #then we lose one full hop's worth of plans
    const ts = TICK_SPACINGS.length;
    const perHop = 4 + ts * ts + 4 * ts;
    const expected = 2 + ts + 3 * perHop; // 3 hops instead of 4
    expect(plans.length).toBe(expected);
  });

  it("encodes the v2 direct router call with the correct selector", () => {
    // #given the first plan is v2 direct volatile
    const plans = enumerateCandidates(tokenIn, tokenOut, amountIn, true);

    // #when
    const firstCall = plans[0].call;

    // #then it targets the Router and the selector is getAmountsOut(uint256,(address,address,bool,address)[])
    const routerIface = new Interface(ABIS.Router);
    const expectedSelector = routerIface.getFunction("getAmountsOut")!.selector;
    expect(firstCall.target).toBe(ADDR.Router);
    expect(firstCall.callData.startsWith(expectedSelector)).toBe(true);
  });

  it("encodes the v3 direct quoter call with the correct selector", () => {
    // #given direct v3 plans live after the two v2 direct plans
    const plans = enumerateCandidates(tokenIn, tokenOut, amountIn, true);
    const v3DirectFirst = plans[2];

    // #when
    const quoterIface = new Interface(ABIS.QuoterV2);
    const expectedSelector = quoterIface.getFunction("quoteExactInputSingle")!.selector;

    // #then
    expect(v3DirectFirst.call.target).toBe(ADDR.QuoterV2);
    expect(v3DirectFirst.call.callData.startsWith(expectedSelector)).toBe(true);
  });
});

describe("decodeCandidates (multicall result distribution)", () => {
  const tokenIn = getAddress("0x" + "1".repeat(40));
  const tokenOut = getAddress("0x" + "2".repeat(40));
  const amountIn = 1_000_000_000_000_000_000n;

  // Encode a synthetic Router.getAmountsOut result with the given final amount.
  const encodeV2Result = (finalAmount: bigint): string => {
    const iface = new Interface(ABIS.Router);
    return iface.encodeFunctionResult("getAmountsOut", [[amountIn, finalAmount]]);
  };

  // Encode a synthetic QuoterV2.quoteExactInputSingle result.
  const encodeV3SingleResult = (amount: bigint): string => {
    const iface = new Interface(ABIS.QuoterV2);
    return iface.encodeFunctionResult("quoteExactInputSingle", [amount, 0n, 0n, 0n]);
  };

  it("returns one BestRoute per successful non-zero result", () => {
    // #given two direct v2 plans
    const plans = enumerateCandidates(tokenIn, tokenOut, amountIn, false).slice(0, 2);

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
    // #given a single v3 direct plan
    const allPlans = enumerateCandidates(tokenIn, tokenOut, amountIn, false);
    const plans = [allPlans[2]]; // first v3 direct

    // #when the result is a failure
    const results: MulticallResult[] = [{ success: false, returnData: "0x" }];
    const decoded = decodeCandidates(plans, results);

    // #then
    expect(decoded).toEqual([]);
  });

  it("drops candidates whose decoded amountOut is zero", () => {
    // #given a single v3 direct plan
    const plans = [enumerateCandidates(tokenIn, tokenOut, amountIn, false)[2]];

    // #when the quoter returned 0
    const results: MulticallResult[] = [{ success: true, returnData: encodeV3SingleResult(0n) }];
    const decoded = decodeCandidates(plans, results);

    // #then
    expect(decoded).toEqual([]);
  });

  it("drops candidates whose decoder throws on malformed returnData", () => {
    // #given any plan
    const plans = [enumerateCandidates(tokenIn, tokenOut, amountIn, false)[0]];

    // #when the returnData is garbage of the wrong shape
    const garbage = AbiCoder.defaultAbiCoder().encode(["uint256"], [42n]); // not a uint256[]
    const results: MulticallResult[] = [{ success: true, returnData: garbage }];
    const decoded = decodeCandidates(plans, results);

    // #then we don't crash; we just drop the candidate
    expect(decoded).toEqual([]);
  });

  it("throws on length mismatch between plans and results", () => {
    // #given a plan
    const plans = [enumerateCandidates(tokenIn, tokenOut, amountIn, false)[0]];

    // #when results array is shorter
    const results: MulticallResult[] = [];

    // #then
    expect(() => decodeCandidates(plans, results)).toThrow(/multicall returned 0 results for 1 plans/);
  });

  it("preserves exec metadata when decoding succeeds", () => {
    // #given the first v2 direct plan (volatile)
    const plans = enumerateCandidates(tokenIn, tokenOut, amountIn, false).slice(0, 1);

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
