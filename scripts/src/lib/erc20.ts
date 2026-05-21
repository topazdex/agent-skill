import { Contract, MaxUint256, type AddressLike, type Signer } from "ethers";
import { ABIS } from "./abis.js";
import { provider, signer } from "./client.js";

const decimalsCache = new Map<string, number>();

export function erc20Read(address: string): Contract {
  return new Contract(address, ABIS.ERC20, provider());
}

export function erc20Write(address: string, _signer?: Signer): Contract {
  return new Contract(address, ABIS.ERC20, _signer ?? signer());
}

export async function getDecimals(address: string): Promise<number> {
  const key = address.toLowerCase();
  const cached = decimalsCache.get(key);
  if (cached !== undefined) return cached;
  const dec = Number(await erc20Read(address).decimals());
  decimalsCache.set(key, dec);
  return dec;
}

export async function getSymbol(address: string): Promise<string> {
  try {
    return await erc20Read(address).symbol();
  } catch {
    return "?";
  }
}

export async function balanceOf(token: string, owner: AddressLike): Promise<bigint> {
  return await erc20Read(token).balanceOf(owner);
}

export async function allowance(
  token: string,
  owner: AddressLike,
  spender: AddressLike
): Promise<bigint> {
  return await erc20Read(token).allowance(owner, spender);
}

/**
 * If current allowance is less than `amount`, approve `amount` (or MaxUint256 when `infinite`).
 * Returns the tx hash if a tx was sent, undefined otherwise.
 */
export async function approveIfNeeded(
  token: string,
  spender: string,
  amount: bigint,
  options: { infinite?: boolean; signer?: Signer } = {}
): Promise<string | undefined> {
  const s = options.signer ?? signer();
  const owner = await s.getAddress();
  const current = await allowance(token, owner, spender);
  if (current >= amount) return undefined;
  const c = erc20Write(token, s);
  const target = options.infinite ? MaxUint256 : amount;
  const tx = await c.approve(spender, target);
  const receipt = await tx.wait();
  return receipt?.hash;
}
