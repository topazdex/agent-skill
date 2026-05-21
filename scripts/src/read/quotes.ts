import { Contract, getAddress, parseUnits } from "ethers";
import { ABIS } from "../lib/abis.js";
import { provider } from "../lib/client.js";
import { ADDR, TICK_SPACINGS } from "../config/addresses.js";
import { encodePath, encodeMixedPath, V2_VOLATILE, V2_STABLE } from "../lib/path.js";
import { findV2Pool, findV3Pool } from "./pools.js";
import { getDecimals } from "../lib/erc20.js";
import { TOKENS } from "../config/tokens.js";

const router = () => new Contract(ADDR.Router, ABIS.Router, provider());
const quoter = () => new Contract(ADDR.QuoterV2, ABIS.QuoterV2, provider());
const mixedQuoter = () =>
  new Contract(ADDR.MixedRouteQuoterV1, ABIS.MixedRouteQuoterV1, provider());

export interface QuoteResult {
  route: string; // human description
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
  if (pool === "0x0000000000000000000000000000000000000000") return 0n;
  const amounts: bigint[] = await router().getAmountsOut(amountIn, [
    v2Route(tokenIn, tokenOut, stable),
  ]);
  return amounts[amounts.length - 1] ?? 0n;
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
    if (pool === "0x0000000000000000000000000000000000000000") return 0n;
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

export type ExecRoute =
  | { type: "v2"; route: V2Route[] }
  | { type: "v3-single"; tokenIn: string; tokenOut: string; tickSpacing: number }
  | { type: "v3-path"; tokens: string[]; spacings: number[] }
  | { type: "mixed"; tokens: string[]; hops: number[] }; // executed leg-by-leg

/**
 * Find the best route for tokenIn -> tokenOut at the given amount.
 * Tries: direct v2 (volatile + stable), direct v3 at each tick spacing,
 * 2-hop via WBNB / USDT / USDC / BTCB (every v2/v3 combination).
 */
export async function bestQuote(
  tokenIn: string,
  tokenOut: string,
  amountIn: bigint
): Promise<BestRoute> {
  const candidates: BestRoute[] = [];

  // Direct v2
  for (const stable of [false, true]) {
    const out = await quoteV2(tokenIn, tokenOut, amountIn, stable);
    if (out > 0n) {
      candidates.push({
        amountOut: out,
        route: `v2 ${stable ? "stable" : "volatile"} direct`,
        exec: { type: "v2", route: [v2Route(tokenIn, tokenOut, stable)] },
      });
    }
  }

  // Direct v3
  for (const ts of TICK_SPACINGS) {
    const out = await quoteV3Single(tokenIn, tokenOut, amountIn, ts);
    if (out > 0n) {
      candidates.push({
        amountOut: out,
        route: `v3 direct ts=${ts}`,
        exec: { type: "v3-single", tokenIn, tokenOut, tickSpacing: ts },
      });
    }
  }

  // 2-hop via common intermediaries
  const hops = [TOKENS.WBNB, TOKENS.USDT, TOKENS.USDC, TOKENS.BTCB]
    .map((t) => t.address.toLowerCase())
    .filter(
      (a) =>
        a !== tokenIn.toLowerCase() &&
        a !== tokenOut.toLowerCase()
    );

  for (const via of hops) {
    // v2-v2
    for (const s1 of [false, true]) {
      for (const s2 of [false, true]) {
        const out = await quoteV2Route(amountIn, [
          v2Route(tokenIn, via, s1),
          v2Route(via, tokenOut, s2),
        ]);
        if (out > 0n) {
          candidates.push({
            amountOut: out,
            route: `v2 ${s1 ? "stable" : "volatile"} → ${s2 ? "stable" : "volatile"} via ${shortAddr(via)}`,
            exec: {
              type: "v2",
              route: [v2Route(tokenIn, via, s1), v2Route(via, tokenOut, s2)],
            },
          });
        }
      }
    }
    // v3-v3
    for (const ts1 of TICK_SPACINGS) {
      for (const ts2 of TICK_SPACINGS) {
        const path = encodePath([tokenIn, via, tokenOut], [ts1, ts2]);
        const out = await quoteV3Path(path, amountIn);
        if (out > 0n) {
          candidates.push({
            amountOut: out,
            route: `v3 ts=${ts1} → ts=${ts2} via ${shortAddr(via)}`,
            exec: { type: "v3-path", tokens: [tokenIn, via, tokenOut], spacings: [ts1, ts2] },
          });
        }
      }
    }
    // mixed (v3 then v2; v2 then v3)
    for (const ts of TICK_SPACINGS) {
      for (const v2Hop of [V2_VOLATILE, V2_STABLE]) {
        const pathA = encodeMixedPath([tokenIn, via, tokenOut], [ts, v2Hop]);
        const outA = await quoteMixed(pathA, amountIn);
        if (outA > 0n) {
          candidates.push({
            amountOut: outA,
            route: `mixed v3 ts=${ts} → v2 ${v2Hop === V2_STABLE ? "stable" : "volatile"} via ${shortAddr(via)}`,
            exec: { type: "mixed", tokens: [tokenIn, via, tokenOut], hops: [ts, v2Hop] },
          });
        }
        const pathB = encodeMixedPath([tokenIn, via, tokenOut], [v2Hop, ts]);
        const outB = await quoteMixed(pathB, amountIn);
        if (outB > 0n) {
          candidates.push({
            amountOut: outB,
            route: `mixed v2 ${v2Hop === V2_STABLE ? "stable" : "volatile"} → v3 ts=${ts} via ${shortAddr(via)}`,
            exec: { type: "mixed", tokens: [tokenIn, via, tokenOut], hops: [v2Hop, ts] },
          });
        }
      }
    }
  }

  if (candidates.length === 0) {
    throw new Error("no viable route found");
  }

  candidates.sort((a, b) => (b.amountOut > a.amountOut ? 1 : b.amountOut < a.amountOut ? -1 : 0));
  return candidates[0];
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
  amountHuman: string
): Promise<{ best: BestRoute; amountOutHuman: string; decimalsOut: number }> {
  const decIn = await getDecimals(tokenIn);
  const decOut = await getDecimals(tokenOut);
  const amountIn = parseUnits(amountHuman, decIn);
  const best = await bestQuote(tokenIn, tokenOut, amountIn);
  const amountOutHuman = (Number(best.amountOut) / 10 ** decOut).toString();
  return { best, amountOutHuman, decimalsOut: decOut };
}
