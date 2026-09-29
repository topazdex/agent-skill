import { isError } from "ethers";
import { coreContract } from "../lib/contracts.js";
import { CHAIN_ID } from "../config/chain.js";
import { listAllPools } from "./gauges.js";

const voter = (chainId: number) => coreContract("Voter", chainId);

export interface VoteInfo {
  /** veTOPAZ NFT id on BNB Chain; XTopazVotingVault position id on a spoke. */
  tokenId: bigint;
  usedWeights: bigint;
  lastVoted: bigint;
  allocations: { pool: string; weight: bigint }[];
}

export async function getVote(tokenId: bigint, chainId: number = CHAIN_ID): Promise<VoteInfo> {
  const v = voter(chainId);
  const [usedWeights, lastVoted] = await Promise.all([
    v.usedWeights(tokenId) as Promise<bigint>,
    v.lastVoted(tokenId) as Promise<bigint>,
  ]);

  // Enumerate poolVote until it reverts (no length getter for that array).
  const allocations: { pool: string; weight: bigint }[] = [];
  for (let i = 0n; ; i++) {
    let pool: string;
    try {
      pool = await v.poolVote(tokenId, i);
    } catch (error) {
      // Out-of-bounds reverts end the array; an RPC failure must not truncate the slate.
      if (isError(error, "CALL_EXCEPTION")) break;
      throw error;
    }
    const weight: bigint = await v.votes(tokenId, pool);
    if (weight > 0n) allocations.push({ pool, weight });
  }
  return { tokenId, usedWeights, lastVoted, allocations };
}

/**
 * Slow variant: scan every gauge pool and read votes(tokenId, pool) — only use if poolVote
 * indexing above doesn't work for some reason.
 */
export async function getVoteScan(tokenId: bigint, chainId: number = CHAIN_ID): Promise<VoteInfo> {
  const v = voter(chainId);
  const [usedWeights, lastVoted, pools] = await Promise.all([
    v.usedWeights(tokenId) as Promise<bigint>,
    v.lastVoted(tokenId) as Promise<bigint>,
    listAllPools(chainId),
  ]);
  const weights = await Promise.all(
    pools.map((p) => v.votes(tokenId, p) as Promise<bigint>)
  );
  const allocations = pools
    .map((pool, i) => ({ pool, weight: weights[i] }))
    .filter((a) => a.weight > 0n);
  return { tokenId, usedWeights, lastVoted, allocations };
}
