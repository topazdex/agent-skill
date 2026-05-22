import {
  AbiCoder,
  Contract,
  Interface,
  ZeroAddress,
  formatUnits,
  getAddress,
  parseUnits,
} from "ethers";
import { ABIS } from "../lib/abis.js";
import { provider } from "../lib/client.js";
import { ADDR, TICK_SPACINGS } from "../config/addresses.js";
import { encodePath, encodeMixedPath, V2_VOLATILE, V2_STABLE } from "../lib/path.js";
import { findV2Pool, findV3Pool } from "./pools.js";
import { tokenPricesUSD } from "./subgraphQueries.js";
import { getDecimals } from "../lib/erc20.js";
import { HOP_TOKENS } from "../config/tokens.js";
import {
  aggregate3Chunked,
  type MulticallRequest,
  type MulticallResult,
} from "../lib/multicall.js";

const router = () => new Contract(ADDR.Router, ABIS.Router, provider());
const quoter = () => new Contract(ADDR.QuoterV2, ABIS.QuoterV2, provider());
const mixedQuoter = () =>
  new Contract(ADDR.MixedRouteQuoterV1, ABIS.MixedRouteQuoterV1, provider());

// Long-lived ABI interfaces used for encoding/decoding multicall payloads.
// Built once at module load so we're not re-parsing the JSON on every quote.
const routerIface = new Interface(ABIS.Router);
const quoterIface = new Interface(ABIS.QuoterV2);
const mixedIface = new Interface(ABIS.MixedRouteQuoterV1);
const poolFactoryIface = new Interface(ABIS.PoolFactory);
const clFactoryIface = new Interface(ABIS.CLFactory);
const abiCoder = AbiCoder.defaultAbiCoder();

/**
 * The maximum number of hops the V2 and V3 enumerators will consider when
 * searching for a route. Set to 3 because beyond that:
 *   - the candidate count explodes (6 hops × 5 hops × 5 tick spacings^3 for v3),
 *   - each additional hop pays another swap fee and is dominated by the 3-hop
 *     route through the same intermediaries in practice.
 *
 * Callers can pass `maxHops` to `bestV2Quote`/`bestV3Quote`/`bestQuoteBundle`
 * to restrict the search further (e.g. `maxHops: 2` for snappier UIs).
 */
export const MAX_ROUTE_HOPS = 3;

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
  /**
   * Price impact as a fraction in [0, 1], computed from subgraph USD prices
   * when available: `(usdIn - usdOut) / usdIn`. Positive values mean the route
   * gives up value to fees + slippage; values near 1 indicate a broken or
   * stale pool. Absent when either token has no subgraph price.
   */
  priceImpactPct?: number;
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
   * @deprecated The default best-route search is now V2-only or V3-only — it
   * never returns a mixed v2/v3 route, because Topaz has no atomic mixed-route
   * executor. This flag is retained as a no-op for backwards compatibility;
   * callers that want a mixed quote should call `quoteMixed(...)` directly.
   */
  allowMixed?: boolean;
  /**
   * @deprecated Retained for backwards compatibility. As of v1.1, `bestQuote`
   * collapses every candidate into multicall round-trips, so client-side
   * concurrency limits no longer apply. Setting this is a no-op.
   */
  concurrency?: number;
  /**
   * Maximum hops the enumerator will consider per stack (v2 and v3 independently).
   * Defaults to `MAX_ROUTE_HOPS` (= 3). Clamped to `1..MAX_ROUTE_HOPS`.
   */
  maxHops?: number;
  /**
   * Drop any candidate whose USD-denominated price impact exceeds this
   * fraction. Computed against subgraph spot prices; routes where either side
   * has no subgraph price fall through to the relative filter only. Default
   * 0.5 (50%) — catches the "stale pool returning $2 for $1000" case while
   * leaving room for legitimate high-slippage trades. Set to 1 to disable.
   */
  maxPriceImpactPct?: number;
  /**
   * Drop any candidate whose `amountOut` is less than this fraction of the
   * best candidate's `amountOut` on the same stack. Always-on guard for when
   * subgraph prices are missing. Default 0.5. Set to 0 to disable.
   */
  minRelativeToBest?: number;
  /**
   * Skip the subgraph price fetch entirely. Useful in tests, or when latency
   * matters more than the USD-based sanity filter. The relative-to-best
   * filter still runs. Default false.
   */
  skipPriceFilter?: boolean;
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

function clampMaxHops(maxHops: number | undefined): number {
  if (maxHops === undefined) return MAX_ROUTE_HOPS;
  if (!Number.isFinite(maxHops) || maxHops < 1) return 1;
  return Math.min(MAX_ROUTE_HOPS, Math.floor(maxHops));
}

function shortAddr(a: string): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function edgeKey(a: string, b: string): string {
  const [x, y] = [a.toLowerCase(), b.toLowerCase()];
  return x < y ? `${x}-${y}` : `${y}-${x}`;
}

/**
 * Per-edge view of which Topaz pools actually exist for a given unordered token
 * pair. Built from a single `Multicall3.aggregate3` probe over every distinct
 * edge in `(tokenIn, tokenOut, ...HOP_TOKENS)` × every pool type the protocol
 * supports (v2 volatile, v2 stable, v3 at each enabled tick spacing).
 *
 * Used by the V2 / V3 enumerators to skip routes that would walk through a
 * non-existent pool — collapses thousands of "this leg doesn't exist" quoter
 * reverts into one cheap address lookup.
 */
export interface PoolInventory {
  has(a: string, b: string, kind: "v2-volatile" | "v2-stable"): boolean;
  hasV3(a: string, b: string, tickSpacing: number): boolean;
}

interface PoolInventoryEntry {
  v2Volatile: boolean;
  v2Stable: boolean;
  v3: Set<number>;
}

/**
 * Probe pool existence for every edge connecting any pair of tokens in
 * `uniqueTokens`. One `Multicall3.aggregate3` call; returns a lookup keyed by
 * sorted-lowercase edge.
 *
 * Exported so tests can stub out the network round-trip with a synthetic
 * inventory and verify the enumerator's filtering behavior.
 */
export async function detectPoolInventory(
  uniqueTokens: string[],
): Promise<PoolInventory> {
  const map = new Map<string, PoolInventoryEntry>();
  const tokens = Array.from(new Set(uniqueTokens.map((t) => t.toLowerCase())));
  if (tokens.length < 2) return makeInventory(map);

  interface ProbeKey {
    edge: string;
    kind: "v2-volatile" | "v2-stable" | "v3";
    tickSpacing?: number;
  }
  const calls: MulticallRequest[] = [];
  const keys: ProbeKey[] = [];

  for (let i = 0; i < tokens.length; i++) {
    for (let j = i + 1; j < tokens.length; j++) {
      const a = getAddress(tokens[i]);
      const b = getAddress(tokens[j]);
      const k = edgeKey(a, b);

      calls.push({
        target: ADDR.PoolFactory,
        callData: poolFactoryIface.encodeFunctionData("getPool", [a, b, false]),
      });
      keys.push({ edge: k, kind: "v2-volatile" });

      calls.push({
        target: ADDR.PoolFactory,
        callData: poolFactoryIface.encodeFunctionData("getPool", [a, b, true]),
      });
      keys.push({ edge: k, kind: "v2-stable" });

      for (const ts of TICK_SPACINGS) {
        calls.push({
          target: ADDR.CLFactory,
          callData: clFactoryIface.encodeFunctionData("getPool", [a, b, ts]),
        });
        keys.push({ edge: k, kind: "v3", tickSpacing: ts });
      }
    }
  }

  const results = await aggregate3Chunked(calls);

  for (let idx = 0; idx < results.length; idx++) {
    const r = results[idx];
    const key = keys[idx];
    if (!r.success) continue;
    let addr: string;
    try {
      addr = abiCoder.decode(["address"], r.returnData)[0] as string;
    } catch {
      continue;
    }
    if (addr === ZeroAddress) continue;
    const entry = ensureEntry(map, key.edge);
    if (key.kind === "v2-volatile") entry.v2Volatile = true;
    else if (key.kind === "v2-stable") entry.v2Stable = true;
    else if (key.kind === "v3" && key.tickSpacing !== undefined) entry.v3.add(key.tickSpacing);
  }

  return makeInventory(map);
}

function ensureEntry(map: Map<string, PoolInventoryEntry>, key: string): PoolInventoryEntry {
  let entry = map.get(key);
  if (!entry) {
    entry = { v2Volatile: false, v2Stable: false, v3: new Set() };
    map.set(key, entry);
  }
  return entry;
}

function makeInventory(map: Map<string, PoolInventoryEntry>): PoolInventory {
  return {
    has(a, b, kind) {
      const e = map.get(edgeKey(a, b));
      if (!e) return false;
      return kind === "v2-volatile" ? e.v2Volatile : e.v2Stable;
    },
    hasV3(a, b, ts) {
      const e = map.get(edgeKey(a, b));
      return e ? e.v3.has(ts) : false;
    },
  };
}

/**
 * Build a synthetic `PoolInventory` from a literal map. Useful in tests so
 * `enumerateV2Plans` / `enumerateV3Plans` can be exercised without an RPC.
 */
export function inventoryFromMap(map: {
  [edge: string]: { v2Volatile?: boolean; v2Stable?: boolean; v3?: number[] };
}): PoolInventory {
  const m = new Map<string, PoolInventoryEntry>();
  for (const [key, val] of Object.entries(map)) {
    const [a, b] = key.split("-");
    if (!a || !b) throw new Error(`bad inventory key: ${key}`);
    m.set(edgeKey(a, b), {
      v2Volatile: !!val.v2Volatile,
      v2Stable: !!val.v2Stable,
      v3: new Set(val.v3 ?? []),
    });
  }
  return makeInventory(m);
}

function* enumeratePaths(
  tokenIn: string,
  tokenOut: string,
  maxHops: number,
): Generator<string[]> {
  const lowerIn = tokenIn.toLowerCase();
  const lowerOut = tokenOut.toLowerCase();
  const hops = HOP_TOKENS.map((t) => t.address).filter(
    (a) => a.toLowerCase() !== lowerIn && a.toLowerCase() !== lowerOut,
  );

  if (maxHops >= 1) yield [tokenIn, tokenOut];
  if (maxHops >= 2) {
    for (const h of hops) yield [tokenIn, h, tokenOut];
  }
  if (maxHops >= 3) {
    for (const h1 of hops) {
      for (const h2 of hops) {
        if (h1.toLowerCase() === h2.toLowerCase()) continue;
        yield [tokenIn, h1, h2, tokenOut];
      }
    }
  }
}

/**
 * Enumerate every v2 quote candidate (volatile/stable per leg) for paths up to
 * `maxHops` long. Each leg's pool must exist according to `inventory`, so we
 * never burn a multicall slot on a route that walks through a non-existent
 * pool.
 */
export function enumerateV2Plans(
  tokenIn: string,
  tokenOut: string,
  amountIn: bigint,
  inventory: PoolInventory,
  maxHops: number = MAX_ROUTE_HOPS,
): CandidatePlan[] {
  const plans: CandidatePlan[] = [];
  const hopBudget = clampMaxHops(maxHops);
  for (const tokens of enumeratePaths(tokenIn, tokenOut, hopBudget)) {
    const legs = tokens.length - 1;
    const combos = 1 << legs;
    for (let mask = 0; mask < combos; mask++) {
      const stables: boolean[] = [];
      let viable = true;
      for (let leg = 0; leg < legs; leg++) {
        const stable = ((mask >> leg) & 1) === 1;
        stables.push(stable);
        if (!inventory.has(tokens[leg], tokens[leg + 1], stable ? "v2-stable" : "v2-volatile")) {
          viable = false;
          break;
        }
      }
      if (!viable) continue;
      const route: V2Route[] = stables.map((stable, i) =>
        v2Route(tokens[i], tokens[i + 1], stable),
      );
      const label = v2RouteLabel(tokens, stables);
      plans.push({
        call: {
          target: ADDR.Router,
          callData: routerIface.encodeFunctionData("getAmountsOut", [amountIn, route]),
        },
        build: (r) => {
          const out = decodeAmountsOutLast(r);
          if (out === 0n) return null;
          return { amountOut: out, route: label, exec: { type: "v2", route } };
        },
      });
    }
  }
  return plans;
}

/**
 * Enumerate every v3 quote candidate (each leg's tick spacing combination) for
 * paths up to `maxHops` long. Like `enumerateV2Plans`, candidates that would
 * route through a non-existent CL pool are filtered out via `inventory` so the
 * downstream multicall stays compact.
 */
export function enumerateV3Plans(
  tokenIn: string,
  tokenOut: string,
  amountIn: bigint,
  inventory: PoolInventory,
  maxHops: number = MAX_ROUTE_HOPS,
): CandidatePlan[] {
  const plans: CandidatePlan[] = [];
  const hopBudget = clampMaxHops(maxHops);
  for (const tokens of enumeratePaths(tokenIn, tokenOut, hopBudget)) {
    const legs = tokens.length - 1;
    for (const spacings of cartesianTickSpacings(legs)) {
      let viable = true;
      for (let leg = 0; leg < legs; leg++) {
        if (!inventory.hasV3(tokens[leg], tokens[leg + 1], spacings[leg])) {
          viable = false;
          break;
        }
      }
      if (!viable) continue;
      if (legs === 1) {
        const [a, b] = [tokens[0], tokens[1]];
        const ts = spacings[0];
        plans.push({
          call: {
            target: ADDR.QuoterV2,
            callData: quoterIface.encodeFunctionData("quoteExactInputSingle", [
              { tokenIn: a, tokenOut: b, amountIn, tickSpacing: ts, sqrtPriceLimitX96: 0n },
            ]),
          },
          build: (r) => {
            const out = decodeQuoterFirstReturn(quoterIface, "quoteExactInputSingle", r);
            if (out === 0n) return null;
            return {
              amountOut: out,
              route: `v3 direct ts=${ts}`,
              exec: { type: "v3-single", tokenIn: a, tokenOut: b, tickSpacing: ts },
            };
          },
        });
      } else {
        const path = encodePath(tokens, spacings);
        const label = v3PathLabel(tokens, spacings);
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
              route: label,
              exec: { type: "v3-path", tokens: [...tokens], spacings: [...spacings] },
            };
          },
        });
      }
    }
  }
  return plans;
}

function* cartesianTickSpacings(legs: number): Generator<number[]> {
  const arr = new Array<number>(legs);
  function* rec(idx: number): Generator<number[]> {
    if (idx === legs) {
      yield arr.slice();
      return;
    }
    for (const ts of TICK_SPACINGS) {
      arr[idx] = ts;
      yield* rec(idx + 1);
    }
  }
  yield* rec(0);
}

function v2RouteLabel(tokens: string[], stables: boolean[]): string {
  if (tokens.length === 2) {
    return `v2 ${stables[0] ? "stable" : "volatile"} direct`;
  }
  const legs = stables.map((s) => (s ? "stable" : "volatile")).join(" → ");
  const intermediates = tokens.slice(1, -1).map(shortAddr).join(" → ");
  return `v2 ${legs} via ${intermediates}`;
}

function v3PathLabel(tokens: string[], spacings: number[]): string {
  const legs = spacings.map((s) => `ts=${s}`).join(" → ");
  const intermediates = tokens.slice(1, -1).map(shortAddr).join(" → ");
  return `v3 ${legs} via ${intermediates}`;
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
 * @deprecated Use `bestQuoteBundle` (or `bestV2Quote` / `bestV3Quote`) for
 * separated v2 vs v3 routes. Retained so existing callers keep compiling; the
 * `allowMixed` flag is now a no-op — the enumerator never emits mixed-route
 * candidates because Topaz has no atomic mixed-route executor.
 *
 * Returns the flat list of candidates the new enumerators would produce
 * (v2 plans first, then v3 plans), keyed off an internally-fetched inventory.
 */
export function enumerateCandidates(
  tokenIn: string,
  tokenOut: string,
  amountIn: bigint,
  _allowMixed: boolean,
  inventory?: PoolInventory,
  maxHops: number = MAX_ROUTE_HOPS,
): CandidatePlan[] {
  // Tests provide a permissive synthetic inventory; production callers should
  // go through `bestQuoteBundle` which probes the chain first.
  const inv = inventory ?? permissiveInventory();
  return [
    ...enumerateV2Plans(tokenIn, tokenOut, amountIn, inv, maxHops),
    ...enumerateV3Plans(tokenIn, tokenOut, amountIn, inv, maxHops),
  ];
}

/**
 * Inventory that reports every pool as present. Used by the deprecated
 * `enumerateCandidates` shim so unit tests can exercise plan construction
 * without staging an RPC. Real route searches always probe pool existence
 * via `detectPoolInventory`.
 */
export function permissiveInventory(): PoolInventory {
  return {
    has: () => true,
    hasV3: () => true,
  };
}

/**
 * Quote bundle: best executable v2 route, best executable v3 route, and the
 * overall winner. Each leg is enumerated and quoted independently so callers
 * can show side-by-side "v2 vs CL" prices without re-running the search.
 */
export interface QuoteBundle {
  v2: BestRoute | null;
  v3: BestRoute | null;
  best: BestRoute | null;
}

/**
 * Compute a route's price impact against subgraph spot prices. Returns
 * `undefined` when either token's USD price is missing or the input USD value
 * is zero. Result is in `[0, 1+]`; values > 1 mean the route lost more than
 * 100% of the input value (typically a wildly broken pool).
 *
 * Exported so tests + UI callers can recompute impact without re-fetching.
 */
export function computePriceImpactPct(
  amountIn: bigint,
  decIn: number,
  priceInUSD: number | undefined,
  amountOut: bigint,
  decOut: number,
  priceOutUSD: number | undefined,
): number | undefined {
  if (
    priceInUSD === undefined ||
    priceOutUSD === undefined ||
    priceInUSD <= 0 ||
    priceOutUSD <= 0
  ) {
    return undefined;
  }
  const inUSD = Number(formatUnits(amountIn, decIn)) * priceInUSD;
  const outUSD = Number(formatUnits(amountOut, decOut)) * priceOutUSD;
  if (inUSD <= 0) return undefined;
  return (inUSD - outUSD) / inUSD;
}

interface FilterContext {
  decIn: number;
  decOut: number;
  amountIn: bigint;
  priceInUSD?: number;
  priceOutUSD?: number;
  maxPriceImpactPct: number;
  minRelativeToBest: number;
}

/**
 * Apply both price-impact filters to a sorted (best-first) candidate list:
 *   1. USD-based: drop where `(usdIn - usdOut) / usdIn > maxPriceImpactPct`.
 *      Skipped when subgraph prices for either token are missing.
 *   2. Relative-to-best: drop where `amountOut < minRelativeToBest * best`.
 *      Always on so we still catch broken pools when subgraph data is missing.
 *
 * Annotates `priceImpactPct` on each surviving candidate when prices are known.
 * Exported for tests; production callers go through `bestQuoteBundle` / `topRoutes`.
 */
export function filterByImpact(
  sorted: BestRoute[],
  ctx: FilterContext,
): BestRoute[] {
  if (sorted.length === 0) return sorted;
  const best = sorted[0].amountOut;
  const relCutoff =
    ctx.minRelativeToBest > 0
      ? (best * BigInt(Math.floor(ctx.minRelativeToBest * 10_000))) / 10_000n
      : 0n;

  const out: BestRoute[] = [];
  for (const r of sorted) {
    const impact = computePriceImpactPct(
      ctx.amountIn,
      ctx.decIn,
      ctx.priceInUSD,
      r.amountOut,
      ctx.decOut,
      ctx.priceOutUSD,
    );
    if (impact !== undefined && impact > ctx.maxPriceImpactPct) continue;
    if (r.amountOut < relCutoff) continue;
    out.push(impact !== undefined ? { ...r, priceImpactPct: impact } : r);
  }
  return out;
}

/**
 * Best executable route searched across v2 and v3 (separately, no mixed). Up
 * to `MAX_ROUTE_HOPS` hops per stack. The returned `best` is the max of the
 * two; pass through `v2` / `v3` to show alternatives.
 *
 * Three RPC round-trips at most: one pool-existence probe across
 * `(tokenIn, tokenOut, ...HOP_TOKENS)` and one chunked multicall per stack
 * (often a single chunk each). Failed quotes are silently dropped.
 */
export async function bestQuoteBundle(
  tokenIn: string,
  tokenOut: string,
  amountIn: bigint,
  opts: BestQuoteOptions = {},
): Promise<QuoteBundle> {
  assertQuoteInputs(tokenIn, tokenOut, amountIn);
  const maxHops = clampMaxHops(opts.maxHops);
  const maxPriceImpactPct = opts.maxPriceImpactPct ?? 0.5;
  const minRelativeToBest = opts.minRelativeToBest ?? 0.5;

  // Inventory probe, subgraph prices, and decimals all fan out in parallel —
  // they're independent and dominate latency.
  const pricesPromise = opts.skipPriceFilter
    ? Promise.resolve(new Map<string, number>())
    : tokenPricesUSD([tokenIn, tokenOut]).catch(() => new Map<string, number>());
  const [inventory, prices, decIn, decOut] = await Promise.all([
    detectPoolInventory([tokenIn, tokenOut, ...HOP_TOKENS.map((t) => t.address)]),
    pricesPromise,
    getDecimals(tokenIn),
    getDecimals(tokenOut),
  ]);

  const v2Plans = enumerateV2Plans(tokenIn, tokenOut, amountIn, inventory, maxHops);
  const v3Plans = enumerateV3Plans(tokenIn, tokenOut, amountIn, inventory, maxHops);

  const [v2Results, v3Results] = await Promise.all([
    aggregate3Chunked(v2Plans.map((p) => p.call)),
    aggregate3Chunked(v3Plans.map((p) => p.call)),
  ]);

  const ctx: FilterContext = {
    decIn,
    decOut,
    amountIn,
    priceInUSD: prices.get(tokenIn.toLowerCase()),
    priceOutUSD: prices.get(tokenOut.toLowerCase()),
    maxPriceImpactPct,
    minRelativeToBest,
  };
  const v2Candidates = filterByImpact(
    decodeCandidates(v2Plans, v2Results).sort(compareByAmountOutDesc),
    ctx,
  );
  const v3Candidates = filterByImpact(
    decodeCandidates(v3Plans, v3Results).sort(compareByAmountOutDesc),
    ctx,
  );
  const v2 = v2Candidates[0] ?? null;
  const v3 = v3Candidates[0] ?? null;
  const best = !v2 ? v3 : !v3 ? v2 : compareByAmountOutDesc(v2, v3) <= 0 ? v2 : v3;
  return { v2, v3, best };
}

/**
 * Best executable v2 (volatile/stable, up to `MAX_ROUTE_HOPS` hops) route. Returns
 * `null` if no v2 path is viable. Shares the pool-existence probe shape with
 * `bestQuoteBundle` — call `bestQuoteBundle` instead if you also want the v3
 * side.
 */
export async function bestV2Quote(
  tokenIn: string,
  tokenOut: string,
  amountIn: bigint,
  opts: BestQuoteOptions = {},
): Promise<BestRoute | null> {
  return (await bestQuoteBundle(tokenIn, tokenOut, amountIn, opts)).v2;
}

/**
 * Best executable v3 route (single tick spacing per leg, up to `MAX_ROUTE_HOPS`
 * hops). Returns `null` if no v3 path is viable.
 */
export async function bestV3Quote(
  tokenIn: string,
  tokenOut: string,
  amountIn: bigint,
  opts: BestQuoteOptions = {},
): Promise<BestRoute | null> {
  return (await bestQuoteBundle(tokenIn, tokenOut, amountIn, opts)).v3;
}

/**
 * Find the best route for `tokenIn -> tokenOut` at the given amount across v2
 * and v3 (separately — the search never returns a mixed v2/v3 route).
 *
 * Throws when neither stack has a viable route.
 */
export async function bestQuote(
  tokenIn: string,
  tokenOut: string,
  amountIn: bigint,
  opts: BestQuoteOptions = {}
): Promise<BestRoute> {
  const bundle = await bestQuoteBundle(tokenIn, tokenOut, amountIn, opts);
  if (!bundle.best) throw new Error("no viable route found");
  return bundle.best;
}

/**
 * Same enumeration as `bestQuote` but returns all viable candidates (v2 and v3
 * combined) sorted by `amountOut` descending. Useful for UIs that display route
 * alternatives or for tools that compare top-k options.
 */
export async function topRoutes(
  tokenIn: string,
  tokenOut: string,
  amountIn: bigint,
  opts: BestQuoteOptions & { limit?: number } = {}
): Promise<BestRoute[]> {
  assertQuoteInputs(tokenIn, tokenOut, amountIn);
  const maxHops = clampMaxHops(opts.maxHops);
  const maxPriceImpactPct = opts.maxPriceImpactPct ?? 0.5;
  const minRelativeToBest = opts.minRelativeToBest ?? 0.5;

  const pricesPromise = opts.skipPriceFilter
    ? Promise.resolve(new Map<string, number>())
    : tokenPricesUSD([tokenIn, tokenOut]).catch(() => new Map<string, number>());
  const [inventory, prices, decIn, decOut] = await Promise.all([
    detectPoolInventory([tokenIn, tokenOut, ...HOP_TOKENS.map((t) => t.address)]),
    pricesPromise,
    getDecimals(tokenIn),
    getDecimals(tokenOut),
  ]);

  const plans = [
    ...enumerateV2Plans(tokenIn, tokenOut, amountIn, inventory, maxHops),
    ...enumerateV3Plans(tokenIn, tokenOut, amountIn, inventory, maxHops),
  ];
  const results = await aggregate3Chunked(plans.map((p) => p.call));
  const candidates = decodeCandidates(plans, results);
  candidates.sort(compareByAmountOutDesc);

  const filtered = filterByImpact(candidates, {
    decIn,
    decOut,
    amountIn,
    priceInUSD: prices.get(tokenIn.toLowerCase()),
    priceOutUSD: prices.get(tokenOut.toLowerCase()),
    maxPriceImpactPct,
    minRelativeToBest,
  });
  return opts.limit !== undefined ? filtered.slice(0, opts.limit) : filtered;
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

/**
 * Re-exported so power users can build mixed paths against `MixedRouteQuoterV1`
 * directly. The default routing pipeline never produces or executes mixed
 * routes (Topaz has no atomic mixed-route executor today), but the sentinels
 * stay available for analytics or off-protocol pricing.
 */
export { V2_VOLATILE, V2_STABLE, encodeMixedPath };
