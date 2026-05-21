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

const multicallIface = new Interface(ABIS.Multicall3);

/**
 * Execute a batch of read-only calls in a single RPC round-trip.
 * Defaults `allowFailure: true` on each call so one bad target (non-existent pool,
 * revert-priced quoter) doesn't kill the whole batch.
 *
 * Returns one result per input call, in order.
 */
export async function aggregate3(
  calls: MulticallRequest[],
): Promise<MulticallResult[]> {
  if (calls.length === 0) return [];
  const formatted = calls.map((c) => ({
    target: c.target,
    allowFailure: c.allowFailure ?? true,
    callData: c.callData,
  }));
  const multicall = new Contract(MULTICALL3, ABIS.Multicall3, provider());
  const raw = (await multicall.aggregate3.staticCall(formatted)) as Array<[boolean, string]>;
  return raw.map(([success, returnData]) => ({ success, returnData }));
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
