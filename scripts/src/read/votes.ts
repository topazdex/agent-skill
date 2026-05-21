import { Contract } from "ethers";
import { ABIS } from "../lib/abis.js";
import { provider } from "../lib/client.js";
import { ADDR } from "../config/addresses.js";
import { listAllPools } from "./gauges.js";

const voter = () => new Contract(ADDR.Voter, ABIS.Voter, provider());

export interface VoteInfo {
  tokenId: bigint;
  usedWeights: bigint;
  lastVoted: bigint;
  allocations: { pool: string; weight: bigint }[];
}

export async function getVote(tokenId: bigint): Promise<VoteInfo> {
  const v = voter();
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
    } catch {
      break;
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
export async function getVoteScan(tokenId: bigint): Promise<VoteInfo> {
  const v = voter();
  const [usedWeights, lastVoted, pools] = await Promise.all([
    v.usedWeights(tokenId) as Promise<bigint>,
    v.lastVoted(tokenId) as Promise<bigint>,
    listAllPools(),
  ]);
  const weights = await Promise.all(
    pools.map((p) => v.votes(tokenId, p) as Promise<bigint>)
  );
  const allocations = pools
    .map((pool, i) => ({ pool, weight: weights[i] }))
    .filter((a) => a.weight > 0n);
  return { tokenId, usedWeights, lastVoted, allocations };
}
