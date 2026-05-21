import { Contract, parseUnits } from "ethers";
import { ABIS } from "../lib/abis.js";
import { signer } from "../lib/client.js";
import { ADDR } from "../config/addresses.js";
import { approveIfNeeded } from "../lib/erc20.js";

const ve = () => new Contract(ADDR.VotingEscrow, ABIS.VotingEscrow, signer());

export interface CreateLockArgs {
  amount: string | bigint;     // human or wei (TOPAZ is 18 dec)
  durationSec: number;         // 0 < d <= 4*365*86400
}

export async function createLock(args: CreateLockArgs) {
  const amount =
    typeof args.amount === "string" ? parseUnits(args.amount, 18) : args.amount;
  await approveIfNeeded(ADDR.TOPAZ, ADDR.VotingEscrow, amount);
  return await ve().createLock(amount, args.durationSec);
}

export async function increaseAmount(args: { tokenId: bigint; amount: string | bigint }) {
  const amount =
    typeof args.amount === "string" ? parseUnits(args.amount, 18) : args.amount;
  await approveIfNeeded(ADDR.TOPAZ, ADDR.VotingEscrow, amount);
  return await ve().increaseAmount(args.tokenId, amount);
}

export async function increaseUnlockTime(args: { tokenId: bigint; newDurationSec: number }) {
  return await ve().increaseUnlockTime(args.tokenId, args.newDurationSec);
}

export async function withdrawLock(tokenId: bigint) {
  return await ve().withdraw(tokenId);
}

export async function mergeLocks(args: { from: bigint; to: bigint }) {
  return await ve().merge(args.from, args.to);
}

export async function splitLock(args: { tokenId: bigint; amount: string | bigint }) {
  const amount =
    typeof args.amount === "string" ? parseUnits(args.amount, 18) : args.amount;
  return await ve().split(args.tokenId, amount);
}

export async function lockPermanent(tokenId: bigint) {
  return await ve().lockPermanent(tokenId);
}

export async function unlockPermanent(tokenId: bigint) {
  return await ve().unlockPermanent(tokenId);
}

export async function depositForLock(args: { tokenId: bigint; amount: string | bigint }) {
  const amount =
    typeof args.amount === "string" ? parseUnits(args.amount, 18) : args.amount;
  await approveIfNeeded(ADDR.TOPAZ, ADDR.VotingEscrow, amount);
  return await ve().depositFor(args.tokenId, amount);
}
