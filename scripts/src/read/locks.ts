import { Contract } from "ethers";
import { ABIS } from "../lib/abis.js";
import { provider } from "../lib/client.js";
import { ADDR } from "../config/addresses.js";

const ve = () => new Contract(ADDR.VotingEscrow, ABIS.VotingEscrow, provider());

export interface LockInfo {
  tokenId: bigint;
  amount: bigint;
  end: bigint;
  isPermanent: boolean;
  balanceOfNFT: bigint;
  owner: string;
}

export async function getLock(tokenId: bigint): Promise<LockInfo> {
  const v = ve();
  const [locked, balanceOfNFT, owner] = await Promise.all([
    v.locked(tokenId) as Promise<{ amount: bigint; end: bigint; isPermanent: boolean }>,
    v.balanceOfNFT(tokenId) as Promise<bigint>,
    v.ownerOf(tokenId) as Promise<string>,
  ]);
  return {
    tokenId,
    amount: locked.amount,
    end: locked.end,
    isPermanent: locked.isPermanent,
    balanceOfNFT,
    owner,
  };
}

export async function listUserLocks(owner: string): Promise<bigint[]> {
  const v = ve();
  const count: bigint = await v.balanceOf(owner);
  const tokenIds: bigint[] = [];
  for (let i = 0n; i < count; i++) {
    tokenIds.push(await v.ownerToNFTokenIdList(owner, i));
  }
  return tokenIds;
}
