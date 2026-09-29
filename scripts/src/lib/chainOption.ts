import { CHAIN_ID } from "../config/chain.js";
import { DEPLOYMENTS, deployment } from "../config/deployments.js";
import { verifyChain } from "./client.js";

export const CHAIN_FLAG_HELP = `--chain <id|name>  ${DEPLOYMENTS.map((c) => `${c.chainId}|${c.slug}`).join(", ")} (default 56)`;

/** Parses a CLI `--chain` value (EVM id or catalog slug). Unknown chains fail closed. */
export function parseChainOption(value: unknown): number {
  if (value === undefined || value === true) return CHAIN_ID;
  const raw = String(value).trim().toLowerCase();
  const bySlug = DEPLOYMENTS.find((c) => c.slug === raw);
  if (bySlug) return bySlug.chainId;
  if (!/^\d+$/.test(raw)) throw new Error(`unknown --chain "${value}"; use ${CHAIN_FLAG_HELP}`);
  return deployment(Number(raw)).chainId;
}

/** Parses `--chain` and confirms the configured RPC really serves that network. */
export async function selectChain(value: unknown): Promise<number> {
  const chainId = parseChainOption(value);
  await verifyChain(chainId);
  return chainId;
}

export function chainLabel(chainId: number): string {
  const chain = deployment(chainId);
  return `${chain.name} (${chainId})`;
}
