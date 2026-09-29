import { ErrorFragment, Interface, isError, type InterfaceAbi } from "ethers";
import { ABIS } from "./abis.js";
import { DEPLOYED_ABIS } from "./deployedAbis.js";

let errorsBySelector: Map<string, Interface> | undefined;

/** Every custom error in the bundled ABIs, keyed by selector (first ABI wins on collisions). */
function errorIndex(): Map<string, Interface> {
  if (errorsBySelector) return errorsBySelector;
  errorsBySelector = new Map();
  for (const abi of [...Object.values(DEPLOYED_ABIS), ...Object.values(ABIS)] as InterfaceAbi[]) {
    const iface = new Interface(abi);
    iface.forEachError((fragment: ErrorFragment) => {
      if (!errorsBySelector!.has(fragment.selector)) errorsBySelector!.set(fragment.selector, iface);
    });
  }
  return errorsBySelector;
}

function revertData(error: unknown): string | undefined {
  const seen = new Set<unknown>();
  const stack: unknown[] = [error];
  while (stack.length) {
    const e = stack.pop();
    if (!e || typeof e !== "object" || seen.has(e)) continue;
    seen.add(e);
    const data = (e as { data?: unknown }).data;
    if (typeof data === "string" && /^0x[0-9a-fA-F]{8}/.test(data)) return data;
    for (const key of ["error", "info", "cause"]) stack.push((e as Record<string, unknown>)[key]);
  }
  return undefined;
}

/** Custom-error name and arguments for a revert, e.g. `AlreadyVoted()`, or undefined. */
export function decodeRevert(error: unknown): string | undefined {
  const data = revertData(error);
  if (!data) return undefined;
  const iface = errorIndex().get(data.slice(0, 10).toLowerCase());
  if (!iface) return undefined;
  try {
    const parsed = iface.parseError(data);
    if (!parsed) return undefined;
    return `${parsed.name}(${parsed.args.map((a) => String(a)).join(", ")})`;
  } catch {
    return undefined;
  }
}

/** One readable line for a CLI failure; keeps ethers' short message and names the custom error. */
export function describeError(error: unknown): string {
  const decoded = decodeRevert(error);
  if (isError(error, "CALL_EXCEPTION") || decoded) {
    const e = error as { shortMessage?: string; reason?: string | null; action?: string };
    const base = e.reason ? `execution reverted: ${e.reason}` : (e.shortMessage ?? "execution reverted");
    return decoded ? `${base.replace(/ \(unknown custom error\)/, "")} — ${decoded}` : base;
  }
  if (error instanceof Error) return (error as { shortMessage?: string }).shortMessage ?? error.message;
  return String(error);
}

/** Shared CLI exit path: readable message, full error only with TOPAZ_DEBUG=1. */
export function exitWithError(error: unknown): never {
  console.error(`Error: ${describeError(error)}`);
  if (process.env.TOPAZ_DEBUG) console.error(error);
  process.exit(1);
}
