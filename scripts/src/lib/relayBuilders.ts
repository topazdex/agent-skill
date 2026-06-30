// Calldata builders for the Topaz Relay depositor flow (managed veTOPAZ / mveTOPAZ).
// These never broadcast — they read the chain to validate, then return wallet-ready
// `{ to, data, value }`. The depositor operations target Topaz core (Voter /
// VotingEscrow / FreeManagedReward), not the relay contract itself.

import { Contract, Interface, ZeroAddress, getAddress } from "ethers";
import { ADDR } from "../config/addresses.js";
import { TOKENS } from "../config/tokens.js";
import { ABIS } from "./abis.js";
import { provider } from "./client.js";
import { canVoteNow, epochVoteEnd, nowSec } from "./epoch.js";
import {
  relayByMTokenId,
  resolveRelay,
  type RelayConfig,
} from "../config/relays.js";

// VotingEscrow.escrowType values.
export const ESCROW_NORMAL = 0;
export const ESCROW_LOCKED = 1;
export const ESCROW_MANAGED = 2;

export interface BuiltRelayTx {
  to: string;
  data: string;
  value: bigint;
}

export interface BuiltDepositManagedTx {
  kind: "deposit-managed";
  tokenId: bigint;
  relay: RelayConfig;
  mTokenId: number;
  tx: BuiltRelayTx;
  builtAt: number;
}

export interface BuiltWithdrawManagedTx {
  kind: "withdraw-managed";
  tokenId: bigint;
  tx: BuiltRelayTx;
  builtAt: number;
}

export interface BuiltRelayClaimTx {
  kind: "relay-claim";
  tokenId: bigint;
  mTokenId: number;
  relay?: RelayConfig;
  freeManagedReward: string;
  payoutToken: string;
  earned: bigint;
  tx: BuiltRelayTx;
  builtAt: number;
}

export interface DepositManagedArgs {
  tokenId: string | number | bigint;
  /** "maxi" | "reward-distribute" | display name | relay address. */
  relay: string;
  /** Optional expected owner; if set, the builder fails on a mismatch. */
  owner?: string;
}

export interface WithdrawManagedArgs {
  tokenId: string | number | bigint;
  owner?: string;
}

export interface RelayClaimArgs {
  tokenId: string | number | bigint;
}

const voterIface = new Interface(ABIS.Voter);
const rewardIface = new Interface(ABIS.Reward);

const ve = (): Contract => new Contract(ADDR.VotingEscrow, ABIS.VotingEscrow, provider());
const voter = (): Contract => new Contract(ADDR.Voter, ABIS.Voter, provider());

function assertNotFinalHour(now: number): void {
  if (now > epochVoteEnd(now)) {
    throw new Error(
      "inside the final-hour window before the epoch flip — managed deposit/withdraw is restricted then; wait for the next epoch (Thursday 00:00 UTC)",
    );
  }
}

function assertOwner(expected: string | undefined, actual: string, tokenId: bigint): void {
  if (expected && getAddress(expected) !== getAddress(actual)) {
    throw new Error(`veNFT #${tokenId} is owned by ${actual}, not ${expected}`);
  }
}

export async function buildDepositManagedTx(
  args: DepositManagedArgs,
): Promise<BuiltDepositManagedTx> {
  const relay = resolveRelay(args.relay);
  if (!relay) {
    throw new Error(
      `unknown relay "${args.relay}" — use "maxi", "reward-distribute", or a relay address`,
    );
  }
  const tokenId = BigInt(args.tokenId);
  const escrowContract = ve();
  const [escrow, lastVoted, owner] = await Promise.all([
    escrowContract.escrowType(tokenId) as Promise<bigint>,
    voter().lastVoted(tokenId) as Promise<bigint>,
    escrowContract.ownerOf(tokenId) as Promise<string>,
  ]);
  if (Number(escrow) !== ESCROW_NORMAL) {
    throw new Error(
      `veNFT #${tokenId} is not a NORMAL lock (escrowType=${escrow}) — only a normal veTOPAZ lock can be deposited into a relay`,
    );
  }
  assertOwner(args.owner, owner, tokenId);
  const now = nowSec();
  if (!canVoteNow(lastVoted, now)) {
    throw new Error(
      `veNFT #${tokenId} already voted or deposited this epoch — depositManaged reverts until the next epoch`,
    );
  }
  assertNotFinalHour(now);

  const data = voterIface.encodeFunctionData("depositManaged", [tokenId, BigInt(relay.mTokenId)]);
  return {
    kind: "deposit-managed",
    tokenId,
    relay,
    mTokenId: relay.mTokenId,
    tx: { to: ADDR.Voter, data, value: 0n },
    builtAt: now,
  };
}

export async function buildWithdrawManagedTx(
  args: WithdrawManagedArgs,
): Promise<BuiltWithdrawManagedTx> {
  const tokenId = BigInt(args.tokenId);
  const escrowContract = ve();
  const [escrow, managedId, lastVoted, owner] = await Promise.all([
    escrowContract.escrowType(tokenId) as Promise<bigint>,
    escrowContract.idToManaged(tokenId) as Promise<bigint>,
    voter().lastVoted(tokenId) as Promise<bigint>,
    escrowContract.ownerOf(tokenId) as Promise<string>,
  ]);
  if (Number(escrow) !== ESCROW_LOCKED || managedId === 0n) {
    throw new Error(
      `veNFT #${tokenId} is not currently deposited in a managed lock (escrowType=${escrow}) — nothing to withdraw`,
    );
  }
  assertOwner(args.owner, owner, tokenId);
  const now = nowSec();
  if (!canVoteNow(lastVoted, now)) {
    throw new Error(
      `veNFT #${tokenId} cannot be withdrawn in the same epoch it was deposited or voted — wait for the next epoch`,
    );
  }
  assertNotFinalHour(now);

  const data = voterIface.encodeFunctionData("withdrawManaged", [tokenId]);
  return {
    kind: "withdraw-managed",
    tokenId,
    tx: { to: ADDR.Voter, data, value: 0n },
    builtAt: now,
  };
}

export async function buildRelayClaimTx(args: RelayClaimArgs): Promise<BuiltRelayClaimTx> {
  const tokenId = BigInt(args.tokenId);
  const escrowContract = ve();
  const managedId = (await escrowContract.idToManaged(tokenId)) as bigint;
  if (managedId === 0n) {
    throw new Error(`veNFT #${tokenId} is not deposited into any managed lock — nothing to claim`);
  }
  const relay = relayByMTokenId(managedId);
  if (relay && !relay.hasUserClaim) {
    throw new Error(
      `${relay.displayName} compounds rewards in-place into the lock — there is nothing to claim; withdraw the veNFT to realize the gains`,
    );
  }
  const freeManagedReward = (await escrowContract.managedToFree(managedId)) as string;
  if (freeManagedReward === ZeroAddress) {
    throw new Error(`managed lock #${managedId} has no FreeManagedReward contract`);
  }
  const payoutToken = relay?.payoutToken ?? TOKENS.USDT.address;
  const reward = new Contract(freeManagedReward, ABIS.Reward, provider());
  const earned = (await reward.earned(payoutToken, tokenId)) as bigint;
  if (earned === 0n) {
    throw new Error(
      `nothing claimable for veNFT #${tokenId} (0 ${relay?.payoutSymbol ?? "reward token"})`,
    );
  }
  const data = rewardIface.encodeFunctionData("getReward", [tokenId, [payoutToken]]);
  return {
    kind: "relay-claim",
    tokenId,
    mTokenId: Number(managedId),
    relay,
    freeManagedReward,
    payoutToken,
    earned,
    tx: { to: freeManagedReward, data, value: 0n },
    builtAt: nowSec(),
  };
}
