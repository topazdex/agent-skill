import * as dotenv from "dotenv";
import { JsonRpcProvider, Wallet } from "ethers";
import { CHAIN_ID, DEFAULT_RPC, FALLBACK_RPC } from "../config/chain.js";

dotenv.config();

let _provider: JsonRpcProvider | undefined;
let _signer: Wallet | undefined;

export function provider(): JsonRpcProvider {
  if (_provider) return _provider;
  const url = process.env.BSC_RPC_URL ?? DEFAULT_RPC;
  _provider = new JsonRpcProvider(url, { chainId: CHAIN_ID, name: "bnb-smart-chain" }, {
    staticNetwork: true,
  });
  return _provider;
}

export function fallbackProvider(): JsonRpcProvider {
  const url = process.env.BSC_RPC_URL_FALLBACK ?? FALLBACK_RPC;
  return new JsonRpcProvider(url, { chainId: CHAIN_ID, name: "bnb-smart-chain" }, {
    staticNetwork: true,
  });
}

export function signer(): Wallet {
  if (_signer) return _signer;
  const key = process.env.PRIVATE_KEY;
  if (!key) {
    throw new Error(
      "PRIVATE_KEY missing. This operation requires a signer. Set PRIVATE_KEY in scripts/.env."
    );
  }
  _signer = new Wallet(key, provider());
  return _signer;
}

export async function senderAddress(): Promise<string> {
  return signer().address;
}
