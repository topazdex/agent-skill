// Thin wrapper over Multicall3.aggregate3. Used by `bestQuote` / `topRoutes` to
// collapse the v2/v3/mixed candidate-enumeration sweep into a single RPC round-trip.
//
// The contract is at the canonical address `0xcA11bde05977b3631167028862bE2a173976CA11`
// on every EVM chain we care about (BSC included). See `MULTICALL3` in `config/chain.ts`.

import { Contract, Interface } from "ethers";
import { ABIS } from "./abis.js";
import { provider } from "./client.js";
import { MULTICALL3 } from "../config/chain.js";

export interface MulticallRequest {
  target: string;
  callData: string;
  allowFailure?: boolean;
}

export interface MulticallResult {
  success: boolean;
  returnData: string;
}

export interface Aggregate3Options {
  /**
   * Maximum total attempts on transient RPC errors. Default 2 (one retry).
   * The retry waits `retryBackoffMs` between attempts. Reverts inside the
   * multicall don't count as transient — those land as `success: false` in
   * the result array and are handled by the caller.
   */
  retries?: number;
  /** Backoff in milliseconds between attempts. Default 250ms. */
  retryBackoffMs?: number;
  /**
   * Injectable executor for tests. Production callers leave this unset and
   * the executor uses `provider().aggregate3.staticCall(...)`.
   */
  exec?: (formatted: Array<{ target: string; allowFailure: boolean; callData: string }>) => Promise<Array<[boolean, string]>>;
}

const multicallIface = new Interface(ABIS.Multicall3);

const defaultExec = async (
  formatted: Array<{ target: string; allowFailure: boolean; callData: string }>,
): Promise<Array<[boolean, string]>> => {
  const multicall = new Contract(MULTICALL3, ABIS.Multicall3, provider());
  return (await multicall.aggregate3.staticCall(formatted)) as Array<[boolean, string]>;
};

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Execute a batch of read-only calls in a single RPC round-trip.
 * Defaults `allowFailure: true` on each call so one bad target (non-existent pool,
 * revert-priced quoter) doesn't kill the whole batch.
 *
 * Transient RPC errors (the outer `staticCall` rejecting — e.g. 429, ECONNRESET,
 * provider timeout) trigger up to `retries` attempts with `retryBackoffMs` between
 * them. Default policy is one retry after 250ms, total two attempts. The retry
 * window is small on purpose: a quote is no good if we wait 30 seconds for it.
 *
 * Returns one result per input call, in order.
 */
export async function aggregate3(
  calls: MulticallRequest[],
  opts: Aggregate3Options = {},
): Promise<MulticallResult[]> {
  if (calls.length === 0) return [];
  const formatted = calls.map((c) => ({
    target: c.target,
    allowFailure: c.allowFailure ?? true,
    callData: c.callData,
  }));
  const exec = opts.exec ?? defaultExec;
  const maxAttempts = Math.max(1, opts.retries ?? 2);
  const backoffMs = Math.max(0, opts.retryBackoffMs ?? 250);

  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const raw = await exec(formatted);
      return raw.map(([success, returnData]) => ({ success, returnData }));
    } catch (e) {
      lastErr = e;
      if (attempt >= maxAttempts) break;
      if (backoffMs > 0) await sleep(backoffMs);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/**
 * Helper for callers that want to decode a single result against a target ABI.
 * Returns null when the call failed or the decoded data is malformed.
 */
export function decodeIfSuccess<T>(
  result: MulticallResult,
  iface: Interface,
  method: string,
): T | null {
  if (!result.success) return null;
  try {
    return iface.decodeFunctionResult(method, result.returnData) as unknown as T;
  } catch {
    return null;
  }
}

/**
 * Exposed so tests + callers can encode without rebuilding the Interface each time.
 */
export { multicallIface };
