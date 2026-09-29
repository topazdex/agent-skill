import { type ContractRunner } from "ethers";
import { provider } from "../lib/client.js";
import { contractOnChain } from "../lib/multichain.js";
import { requireSpokeChain } from "../config/deployments.js";

export interface SpokePositionInfo {
  id: bigint;
  owner: string;
  amount: bigint;
  unlockAt: bigint;
  unlocked: boolean;
  hasActiveVote: boolean;
}

export interface SpokeVaultState {
  paused: boolean;
  minimumStake: bigint;
  /** Unlock timestamp a deposit made now would receive. */
  lockUntil: bigint;
  lockEpochs: bigint;
}

/** XTopazVotingVault on a spoke; throws on BNB Chain, which has no such vault. */
export function votingVault(chainId: number, runner: ContractRunner = provider(chainId)) {
  requireSpokeChain(chainId, "XTopazVotingVault");
  return contractOnChain(chainId, "XTopazVotingVault", runner);
}

export async function getSpokeVaultState(chainId: number): Promise<SpokeVaultState> {
  const vault = votingVault(chainId);
  const [paused, minimumStake, lockUntil, lockEpochs] = await Promise.all([
    vault.paused() as Promise<boolean>,
    vault.minimumStake() as Promise<bigint>,
    vault.lockUntil() as Promise<bigint>,
    vault.lockEpochs() as Promise<bigint>,
  ]);
  return { paused, minimumStake, lockUntil, lockEpochs };
}

export async function getSpokePosition(id: bigint, chainId: number): Promise<SpokePositionInfo> {
  const vault = votingVault(chainId);
  const [position, unlocked, hasActiveVote] = await Promise.all([
    vault.position(id) as Promise<{ owner: string; amount: bigint; unlockAt: bigint }>,
    vault.isUnlocked(id) as Promise<boolean>,
    vault.hasActiveVote(id) as Promise<boolean>,
  ]);
  return { id, owner: position.owner, amount: position.amount, unlockAt: position.unlockAt, unlocked, hasActiveVote };
}

/** Includes closed (zero-amount) positions: their rewards stay claimable. */
export async function listSpokePositions(owner: string, chainId: number): Promise<SpokePositionInfo[]> {
  const ids: bigint[] = await votingVault(chainId).positionsOf(owner);
  return await Promise.all(ids.map((id) => getSpokePosition(id, chainId)));
}
