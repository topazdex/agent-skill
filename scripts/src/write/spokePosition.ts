// Spoke xTOPAZ positions in XTopazVotingVault (Robinhood, Base, Ethereum, Arc). These are
// not NFTs: ids are vault-local, non-transferable, and every deposit extends the whole
// position's unlock date. See references/spoke-voting.md.

import { ZeroAddress, getAddress, parseUnits, type TransactionResponse } from "ethers";
import { provider, signer } from "../lib/client.js";
import { coreContract } from "../lib/contracts.js";
import { approveIfNeeded } from "../lib/erc20.js";
import { contractAddress } from "../config/deployments.js";
import { getSpokePosition, getSpokeVaultState, votingVault } from "../read/spokePositions.js";
import { assertVotable } from "./vote.js";

const XTOPAZ_DECIMALS = 18;

const toWei = (amount: string | bigint) =>
  typeof amount === "string" ? parseUnits(amount, XTOPAZ_DECIMALS) : amount;

async function assertCanDeposit(amount: bigint, chainId: number, opening: boolean): Promise<void> {
  const state = await getSpokeVaultState(chainId);
  if (state.paused) throw new Error("XTopazVotingVault is paused");
  if (amount <= 0n) throw new Error("amount must be > 0");
  if (opening && amount < state.minimumStake)
    throw new Error(`amount is below the vault minimumStake (${state.minimumStake} wei)`);
}

/** A new position is never whitelisted, so stakeAndVote needs the normal window. */
async function assertNormalVoteWindow(chainId: number): Promise<void> {
  const block = await provider(chainId).getBlock("latest");
  if (!block) throw new Error("could not read the latest block");
  const now = BigInt(block.timestamp);
  const voter = coreContract("Voter", chainId);
  const [voteStart, voteEnd]: [bigint, bigint] = await Promise.all([voter.epochVoteStart(now), voter.epochVoteEnd(now)]);
  if (now <= voteStart) throw new Error("voting is closed in the first hour after the epoch flip; stake without pools or retry after Thursday 01:00 UTC");
  if (now > voteEnd) throw new Error("the last hour before the epoch flip is whitelisted-only; stake without pools and vote next epoch");
}

async function assertOwnerOrOperator(id: bigint, chainId: number): Promise<void> {
  const caller = await signer(chainId).getAddress();
  if (!(await votingVault(chainId).isApprovedOrOwner(caller, id)))
    throw new Error(`${caller} is neither the owner nor the vote operator of position ${id}`);
}

async function approveXTopaz(amount: bigint, chainId: number): Promise<void> {
  await approveIfNeeded(contractAddress(chainId, "XTopazOFT"), contractAddress(chainId, "XTopazVotingVault"), amount, {
    chainId,
  });
}

export interface StakeSpokeArgs {
  chainId: number;
  amount: string | bigint;       // xTOPAZ shares, human or wei
  /** Optional slate for stakeAndVote: local pool addresses (not gauges) and relative weights. */
  allocations?: { pool: string; weight: bigint }[];
}

/** Always opens a NEW position; read its id from the PositionOpened event. */
export async function stakeSpoke(args: StakeSpokeArgs): Promise<TransactionResponse> {
  const amount = toWei(args.amount);
  await assertCanDeposit(amount, args.chainId, true);
  const vault = votingVault(args.chainId, signer(args.chainId));
  if (args.allocations?.length) {
    await assertVotable(args.allocations, args.chainId);
    await assertNormalVoteWindow(args.chainId);
    await approveXTopaz(amount, args.chainId);
    return await vault.stakeAndVote(
      amount,
      args.allocations.map((a) => a.pool),
      args.allocations.map((a) => a.weight),
    );
  }
  await approveXTopaz(amount, args.chainId);
  return await vault.stake(amount);
}

/** Extends the whole position's unlock date to at least the vault's current lockUntil. */
export async function addToSpokePosition(args: {
  chainId: number;
  id: bigint;
  amount: string | bigint;
}): Promise<TransactionResponse> {
  const amount = toWei(args.amount);
  await assertCanDeposit(amount, args.chainId, false);
  await assertOwnerOrOperator(args.id, args.chainId);
  await approveXTopaz(amount, args.chainId);
  return await votingVault(args.chainId, signer(args.chainId)).addToPosition(args.id, amount);
}

/** Owner only. Omit `amount` to close the position (fails if it voted this epoch). */
export async function unstakeSpoke(args: {
  chainId: number;
  id: bigint;
  amount?: string | bigint;
  receiver?: string;
}): Promise<TransactionResponse> {
  const s = signer(args.chainId);
  const owner = await s.getAddress();
  const position = await getSpokePosition(args.id, args.chainId);
  if (position.owner === ZeroAddress) throw new Error(`unknown position ${args.id}`);
  if (getAddress(position.owner) !== getAddress(owner)) throw new Error("only the position owner can unstake");
  if (!position.unlocked)
    throw new Error(`position ${args.id} is locked until ${new Date(Number(position.unlockAt) * 1000).toISOString()}`);
  const amount = args.amount === undefined ? position.amount : toWei(args.amount);
  if (amount <= 0n || amount > position.amount) throw new Error(`amount must be 1..${position.amount} wei`);
  const receiver = getAddress(args.receiver ?? owner);
  return await votingVault(args.chainId, s).unstake(args.id, amount, receiver);
}

/** Same owner only; the target keeps its slate and the later unlock date. */
export async function mergeSpokePositions(args: {
  chainId: number;
  from: bigint;
  to: bigint;
}): Promise<TransactionResponse> {
  if (args.from === args.to) throw new Error("from and to must differ");
  return await votingVault(args.chainId, signer(args.chainId)).merge(args.from, args.to);
}

/** One operator for all the caller's positions: can add, vote, merge and claim, never withdraw. */
export async function setSpokeVoteOperator(args: {
  chainId: number;
  operator: string;
}): Promise<TransactionResponse> {
  return await votingVault(args.chainId, signer(args.chainId)).setVoteOperator(getAddress(args.operator));
}
