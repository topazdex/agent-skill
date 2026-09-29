import * as dotenv from "dotenv";
import { FetchRequest, JsonRpcProvider, Wallet } from "ethers";
import { CHAIN_ID, FALLBACK_RPC } from "../config/chain.js";
import { deployment } from "../config/deployments.js";
import { assertChain, rpcUrl } from "./multichain.js";

dotenv.config();

const providers = new Map<number, JsonRpcProvider>();
const signers = new Map<number, Wallet>();
const verified = new Map<number, Promise<void>>();

/**
 * Cached per-chain provider. The network is declared statically, so a
 * misconfigured URL is not detected here: call `verifyChain` before any write.
 */
export function provider(chainId: number = CHAIN_ID): JsonRpcProvider {
  const cached = providers.get(chainId);
  if (cached) return cached;
  const chain = deployment(chainId);
  const request = new FetchRequest(rpcUrl(chainId));
  // Route searches and relay reads send large multicalls; slow public RPCs need headroom.
  request.timeout = 120_000;
  // cacheTimeout -1: ethers otherwise shares identical requests for 250ms, so on fast chains a
  // nonce read right after an approval confirms can return the stale nonce ("nonce already used").
  // Several spoke public RPCs rate-limit JSON-RPC batches; match chainProvider and send singly.
  const options =
    chainId === CHAIN_ID
      ? { staticNetwork: true, cacheTimeout: -1 }
      : { staticNetwork: true, cacheTimeout: -1, batchMaxCount: 1 };
  const created = new JsonRpcProvider(request, { chainId, name: chain.slug }, options);
  providers.set(chainId, created);
  return created;
}

export function fallbackProvider(): JsonRpcProvider {
  const url = process.env.BSC_RPC_URL_FALLBACK ?? FALLBACK_RPC;
  return new JsonRpcProvider(url, { chainId: CHAIN_ID, name: "bnb-smart-chain" }, {
    staticNetwork: true,
  });
}

/** Reads `eth_chainId` once per chain and rejects an RPC that serves another network. */
export function verifyChain(chainId: number = CHAIN_ID): Promise<void> {
  let pending = verified.get(chainId);
  if (!pending) {
    pending = assertChain(provider(chainId), chainId);
    pending.catch(() => verified.delete(chainId));
    verified.set(chainId, pending);
  }
  return pending;
}

export function signer(chainId: number = CHAIN_ID): Wallet {
  const cached = signers.get(chainId);
  if (cached) return cached;
  const key = process.env.PRIVATE_KEY;
  if (!key) {
    throw new Error(
      "PRIVATE_KEY missing. This operation requires a signer. Set PRIVATE_KEY in scripts/.env."
    );
  }
  const created = new Wallet(key, provider(chainId));
  signers.set(chainId, created);
  return created;
}

export async function senderAddress(chainId: number = CHAIN_ID): Promise<string> {
  return signer(chainId).address;
}
