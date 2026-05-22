import { Contract, Interface, ZeroAddress, formatUnits, getAddress, parseUnits } from "ethers";
import { ABIS } from "../lib/abis.js";
import { provider } from "../lib/client.js";
import { ADDR, TICK_SPACINGS } from "../config/addresses.js";
import { encodePath, encodeMixedPath, V2_VOLATILE, V2_STABLE } from "../lib/path.js";
import { findV2Pool, findV3Pool } from "./pools.js";
import { getDecimals } from "../lib/erc20.js";
import { TOKENS } from "../config/tokens.js";
import { aggregate3, type MulticallRequest, type MulticallResult } from "../lib/multicall.js";

const router = () => new Contract(ADDR.Router, ABIS.Router, provider());
const quoter = () => new Contract(ADDR.QuoterV2, ABIS.QuoterV2, provider());
const mixedQuoter = () =>
  new Contract(ADDR.MixedRouteQuoterV1, ABIS.MixedRouteQuoterV1, provider());

// Long-lived ABI interfaces used for encoding/decoding multicall payloads.
// Built once at module load so we're not re-parsing the JSON on every quote.
const routerIface = new Interface(ABIS.Router);
const quoterIface = new Interface(ABIS.QuoterV2);
const mixedIface = new Interface(ABIS.MixedRouteQuoterV1);

export interface QuoteResult {
  route: string;
  amountOut: bigint;
  detail: unknown;
}

export interface V2Route {
  from: string;
  to: string;
  stable: boolean;
  factory: string;
}

export function v2Route(from: string, to: string, stable: boolean): V2Route {
  return { from, to, stable, factory: ADDR.PoolFactory };
}

export async function quoteV2(
  tokenIn: string,
  tokenOut: string,
  amountIn: bigint,
  stable: boolean
): Promise<bigint> {
  const pool = await findV2Pool(tokenIn, tokenOut, stable);
  if (pool === ZeroAddress) return 0n;
  try {
    const amounts: bigint[] = await router().getAmountsOut(amountIn, [
      v2Route(tokenIn, tokenOut, stable),
    ]);
    return amounts[amounts.length - 1] ?? 0n;
  } catch {
    return 0n;
  }
}

export async function quoteV2Route(
  amountIn: bigint,
  routes: V2Route[]
): Promise<bigint> {
  try {
    const amounts: bigint[] = await router().getAmountsOut(amountIn, routes);
    return amounts[amounts.length - 1] ?? 0n;
  } catch {
    return 0n;
  }
}

export async function quoteV3Single(
  tokenIn: string,
  tokenOut: string,
  amountIn: bigint,
  tickSpacing: number,
  sqrtPriceLimitX96: bigint = 0n
): Promise<bigint> {
  try {
    const pool = await findV3Pool(tokenIn, tokenOut, tickSpacing);
    if (pool === ZeroAddress) return 0n;
    const result = await quoter().quoteExactInputSingle.staticCall({
      tokenIn,
      tokenOut,
      amountIn,
      tickSpacing,
      sqrtPriceLimitX96,
    });
    return result[0] as bigint;
  } catch {
    return 0n;
  }
}

export async function quoteV3Path(
  pathBytes: string,
  amountIn: bigint
): Promise<bigint> {
  try {
    const result = await quoter().quoteExactInput.staticCall(pathBytes, amountIn);
    return result[0] as bigint;
  } catch {
    return 0n;
  }
}

export async function quoteMixed(pathBytes: string, amountIn: bigint): Promise<bigint> {
  try {
    const result = await mixedQuoter().quoteExactInput.staticCall(pathBytes, amountIn);
    return result[0] as bigint;
  } catch {
    return 0n;
  }
}

export interface BestRoute {
  amountOut: bigint;
  route: string;
  exec: ExecRoute;
}

/**
 * Comparator used by `bestQuote` / `topRoutes` to rank candidate routes.
 * Strictly descending by `amountOut`. Ties preserve input order (stable sort).
 *
 * Exported so unit tests can lock the sort behavior — if this flips, the user gets
 * a worse route for the same liquidity, which is a silent regression we cannot afford.
 */
export function compareByAmountOutDesc(a: BestRoute, b: BestRoute): number {
  return b.amountOut > a.amountOut ? 1 : b.amountOut < a.amountOut ? -1 : 0;
}

export type ExecRoute =
  | { type: "v2"; route: V2Route[] }
  | { type: "v3-single"; tokenIn: string; tokenOut: string; tickSpacing: number }
  | { type: "v3-path"; tokens: string[]; spacings: number[] }
  | { type: "mixed"; tokens: string[]; hops: number[] };

export interface BestQuoteOptions {
  /**
   * If false, mixed v2/v3 candidates are dropped before selecting the best
   * route. Defaults to true. The mixed quoter (`MixedRouteQuoterV1`) returns
   * accurate output for a leg-by-leg path, but there is no atomic mixed-route
   * router on Topaz today, so wallet-facing builders should request
   * `allowMixed: false` to avoid getting back a route they cannot execute in
   * a single transaction.
   */
  allowMixed?: boolean;
  /**
   * @deprecated Retained for backwards compatibility. As of v1.1, `bestQuote`
   * collapses every candidate into a single `Multicall3.aggregate3` round-trip,
   * so client-side concurrency limits no longer apply. Setting this is a no-op.
   */
  concurrency?: number;
}

/**
 * Plan for a single candidate route: one multicall payload + a decoder that
 * turns the result into a `BestRoute` (or `null` if the route is not viable).
 *
 * Exported for unit tests; not part of the stable public API.
 */
export interface CandidatePlan {
  call: MulticallRequest;
  build: (result: MulticallResult) => BestRoute | null;
}

const decodeAmountsOutLast = (r: MulticallResult): bigint => {
  if (!r.success) return 0n;
  try {
    const decoded = routerIface.decodeFunctionResult("getAmountsOut", r.returnData);
    const amounts = decoded[0] as bigint[];
    return amounts[amounts.length - 1] ?? 0n;
  } catch {
    return 0n;
  }
};

const decodeQuoterFirstReturn = (
  iface: Interface,
  method: string,
  r: MulticallResult,
): bigint => {
  if (!r.success) return 0n;
  try {
    const decoded = iface.decodeFunctionResult(method, r.returnData);
    return decoded[0] as bigint;
  } catch {
    return 0n;
  }
};

/**
 * Enumerate every candidate route (direct v2, direct v3, 2-hop via WBNB / USDT /
 * USDC / BTCB across all v2/v3 combinations, plus mixed routes when `allowMixed`).
 *
 * Returns a list of `CandidatePlan`s. Each plan owns its own multicall payload
 * and decoder, so `topRoutes` can flatten them, dispatch a single multicall, and
 * fan the results back out to each plan without any cross-plan coupling.
 */
export function enumerateCandidates(
  tokenIn: string,
  tokenOut: string,
  amountIn: bigint,
  allowMixed: boolean,
): CandidatePlan[] {
  const plans: CandidatePlan[] = [];

  // Direct v2
  for (const stable of [false, true] as const) {
    const route = [v2Route(tokenIn, tokenOut, stable)];
    plans.push({
      call: {
        target: ADDR.Router,
        callData: routerIface.encodeFunctionData("getAmountsOut", [amountIn, route]),
      },
      build: (r) => {
        const out = decodeAmountsOutLast(r);
        if (out === 0n) return null;
        return {
          amountOut: out,
          route: `v2 ${stable ? "stable" : "volatile"} direct`,
          exec: { type: "v2", route },
        };
      },
    });
  }

  // Direct v3
  for (const ts of TICK_SPACINGS) {
    plans.push({
      call: {
        target: ADDR.QuoterV2,
        callData: quoterIface.encodeFunctionData("quoteExactInputSingle", [
          { tokenIn, tokenOut, amountIn, tickSpacing: ts, sqrtPriceLimitX96: 0n },
        ]),
      },
      build: (r) => {
        const out = decodeQuoterFirstReturn(quoterIface, "quoteExactInputSingle", r);
        if (out === 0n) return null;
        return {
          amountOut: out,
          route: `v3 direct ts=${ts}`,
          exec: { type: "v3-single", tokenIn, tokenOut, tickSpacing: ts },
        };
      },
    });
  }

  // 2-hop via common intermediaries
  const hops = [TOKENS.WBNB, TOKENS.USDT, TOKENS.USDC, TOKENS.BTCB]
    .map((t) => t.address.toLowerCase())
    .filter(
      (a) =>
        a !== tokenIn.toLowerCase() &&
        a !== tokenOut.toLowerCase(),
    );

  for (const via of hops) {
    // v2-v2
    for (const s1 of [false, true] as const) {
      for (const s2 of [false, true] as const) {
        const route = [v2Route(tokenIn, via, s1), v2Route(via, tokenOut, s2)];
        plans.push({
          call: {
            target: ADDR.Router,
            callData: routerIface.encodeFunctionData("getAmountsOut", [amountIn, route]),
          },
          build: (r) => {
            const out = decodeAmountsOutLast(r);
            if (out === 0n) return null;
            return {
              amountOut: out,
              route: `v2 ${s1 ? "stable" : "volatile"} → ${s2 ? "stable" : "volatile"} via ${shortAddr(via)}`,
              exec: { type: "v2", route },
            };
          },
        });
      }
    }
    // v3-v3
    for (const ts1 of TICK_SPACINGS) {
      for (const ts2 of TICK_SPACINGS) {
        const path = encodePath([tokenIn, via, tokenOut], [ts1, ts2]);
        plans.push({
          call: {
            target: ADDR.QuoterV2,
            callData: quoterIface.encodeFunctionData("quoteExactInput", [path, amountIn]),
          },
          build: (r) => {
            const out = decodeQuoterFirstReturn(quoterIface, "quoteExactInput", r);
            if (out === 0n) return null;
            return {
              amountOut: out,
              route: `v3 ts=${ts1} → ts=${ts2} via ${shortAddr(via)}`,
              exec: { type: "v3-path", tokens: [tokenIn, via, tokenOut], spacings: [ts1, ts2] },
            };
          },
        });
      }
    }
    if (!allowMixed) continue;
    // mixed (v3 then v2; v2 then v3)
    for (const ts of TICK_SPACINGS) {
      for (const v2Hop of [V2_VOLATILE, V2_STABLE]) {
        const pathA = encodeMixedPath([tokenIn, via, tokenOut], [ts, v2Hop]);
        plans.push({
          call: {
            target: ADDR.MixedRouteQuoterV1,
            callData: mixedIface.encodeFunctionData("quoteExactInput", [pathA, amountIn]),
          },
          build: (r) => {
            const out = decodeQuoterFirstReturn(mixedIface, "quoteExactInput", r);
            if (out === 0n) return null;
            return {
              amountOut: out,
              route: `mixed v3 ts=${ts} → v2 ${v2Hop === V2_STABLE ? "stable" : "volatile"} via ${shortAddr(via)}`,
              exec: { type: "mixed", tokens: [tokenIn, via, tokenOut], hops: [ts, v2Hop] },
            };
          },
        });
        const pathB = encodeMixedPath([tokenIn, via, tokenOut], [v2Hop, ts]);
        plans.push({
          call: {
            target: ADDR.MixedRouteQuoterV1,
            callData: mixedIface.encodeFunctionData("quoteExactInput", [pathB, amountIn]),
          },
          build: (r) => {
            const out = decodeQuoterFirstReturn(mixedIface, "quoteExactInput", r);
            if (out === 0n) return null;
            return {
              amountOut: out,
              route: `mixed v2 ${v2Hop === V2_STABLE ? "stable" : "volatile"} → v3 ts=${ts} via ${shortAddr(via)}`,
              exec: { type: "mixed", tokens: [tokenIn, via, tokenOut], hops: [v2Hop, ts] },
            };
          },
        });
      }
    }
  }
  return plans;
}

function assertQuoteInputs(tokenIn: string, tokenOut: string, amountIn: bigint): void {
  if (tokenIn.toLowerCase() === tokenOut.toLowerCase()) {
    throw new Error("tokenIn and tokenOut must differ");
  }
  if (amountIn <= 0n) {
    throw new Error("amountIn must be > 0");
  }
  // Throws on malformed input.
  getAddress(tokenIn);
  getAddress(tokenOut);
}

/**
 * Find the best route for tokenIn -> tokenOut at the given amount.
 * Tries: direct v2 (volatile + stable), direct v3 at each tick spacing,
 * 2-hop via WBNB / USDT / USDC / BTCB (every v2/v3 combination).
 *
 * Every candidate is packed into a single `Multicall3.aggregate3` RPC round
 * trip, so total latency is dominated by one network hop rather than ~200
 * sequential calls. Failed quotes (non-existent pool, revert-priced quoter)
 * are silently dropped via `allowFailure: true`.
 */
export async function bestQuote(
  tokenIn: string,
  tokenOut: string,
  amountIn: bigint,
  opts: BestQuoteOptions = {}
): Promise<BestRoute> {
  const sorted = await topRoutes(tokenIn, tokenOut, amountIn, opts);
  const best = sorted[0];
  if (!best) throw new Error("no viable route found");
  return best;
}

/**
 * Same enumeration as `bestQuote` but returns all candidates sorted by
 * `amountOut` descending. Useful for UIs that display route alternatives or
 * for tools that compare best-mixed vs. best-executable side by side.
 */
export async function topRoutes(
  tokenIn: string,
  tokenOut: string,
  amountIn: bigint,
  opts: BestQuoteOptions & { limit?: number } = {}
): Promise<BestRoute[]> {
  assertQuoteInputs(tokenIn, tokenOut, amountIn);
  const allowMixed = opts.allowMixed ?? true;
  const plans = enumerateCandidates(tokenIn, tokenOut, amountIn, allowMixed);
  const results = await aggregate3(plans.map((p) => p.call));
  const candidates = decodeCandidates(plans, results);
  candidates.sort(compareByAmountOutDesc);
  return opts.limit !== undefined ? candidates.slice(0, opts.limit) : candidates;
}

/**
 * Fan multicall results back through each candidate plan's decoder. Exported
 * so unit tests can verify the distribution logic with synthetic results.
 */
export function decodeCandidates(
  plans: CandidatePlan[],
  results: MulticallResult[],
): BestRoute[] {
  if (plans.length !== results.length) {
    throw new Error(
      `multicall returned ${results.length} results for ${plans.length} plans`,
    );
  }
  const out: BestRoute[] = [];
  for (let i = 0; i < plans.length; i++) {
    const route = plans[i].build(results[i]);
    if (route) out.push(route);
  }
  return out;
}

function shortAddr(a: string): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

/**
 * Helper for quoting in human units. Returns the raw bigint amountOut and the human string.
 */
export async function quoteHuman(
  tokenIn: string,
  tokenOut: string,
  amountHuman: string,
  opts: BestQuoteOptions = {}
): Promise<{ best: BestRoute; amountOutHuman: string; decimalsOut: number }> {
  const decIn = await getDecimals(tokenIn);
  const decOut = await getDecimals(tokenOut);
  const amountIn = parseUnits(amountHuman, decIn);
  const best = await bestQuote(tokenIn, tokenOut, amountIn, opts);
  const amountOutHuman = formatUnits(best.amountOut, decOut);
  return { best, amountOutHuman, decimalsOut: decOut };
}
