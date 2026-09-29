import { Contract, MaxUint256, type AddressLike, type Signer } from "ethers";
import { ABIS } from "./abis.js";
import { provider, signer } from "./client.js";
import { CHAIN_ID } from "../config/chain.js";

// Keyed by chain too: the same address is a different token (or nothing) on another chain.
const decimalsCache = new Map<string, number>();

export function erc20Read(address: string, chainId: number = CHAIN_ID): Contract {
  return new Contract(address, ABIS.ERC20, provider(chainId));
}

export function erc20Write(address: string, _signer?: Signer, chainId: number = CHAIN_ID): Contract {
  return new Contract(address, ABIS.ERC20, _signer ?? signer(chainId));
}

export async function getDecimals(address: string, chainId: number = CHAIN_ID): Promise<number> {
  const key = `${chainId}:${address.toLowerCase()}`;
  const cached = decimalsCache.get(key);
  if (cached !== undefined) return cached;
  const dec = Number(await erc20Read(address, chainId).decimals());
  decimalsCache.set(key, dec);
  return dec;
}

export async function getSymbol(address: string, chainId: number = CHAIN_ID): Promise<string> {
  try {
    return await erc20Read(address, chainId).symbol();
  } catch {
    return "?";
  }
}

export async function balanceOf(
  token: string,
  owner: AddressLike,
  chainId: number = CHAIN_ID,
): Promise<bigint> {
  return await erc20Read(token, chainId).balanceOf(owner);
}

export async function allowance(
  token: string,
  owner: AddressLike,
  spender: AddressLike,
  chainId: number = CHAIN_ID,
): Promise<bigint> {
  return await erc20Read(token, chainId).allowance(owner, spender);
}

/**
 * If current allowance is less than `amount`, approve `amount` (or MaxUint256 when `infinite`).
 * Returns the tx hash if a tx was sent, undefined otherwise.
 */
export async function approveIfNeeded(
  token: string,
  spender: string,
  amount: bigint,
  options: { infinite?: boolean; signer?: Signer; chainId?: number } = {}
): Promise<string | undefined> {
  const chainId = options.chainId ?? CHAIN_ID;
  const s = options.signer ?? signer(chainId);
  const owner = await s.getAddress();
  const current = await allowance(token, owner, spender, chainId);
  if (current >= amount) return undefined;
  const c = erc20Write(token, s, chainId);
  const target = options.infinite ? MaxUint256 : amount;
  const tx = await c.approve(spender, target);
  const receipt = await tx.wait();
  return receipt?.hash;
}
