import { ZeroAddress, type Contract } from "ethers";
import { signer } from "../lib/client.js";
import { coreContract } from "../lib/contracts.js";
import { CHAIN_ID } from "../config/chain.js";
import { isHubChain } from "../config/deployments.js";
import { votingVault } from "../read/spokePositions.js";

export interface VoteArgs {
  /** veTOPAZ NFT id on BNB Chain; XTopazVotingVault position id on a spoke. */
  tokenId: bigint;
  /** Local pool addresses (not gauges) and relative weights. */
  allocations: { pool: string; weight: bigint }[];
  validate?: boolean;            // default true
  /** Default BNB Chain (56). */
  chainId?: number;
}

/**
 * On BNB Chain the veNFT owner calls Voter directly. On a spoke the owner (or its
 * vote operator) calls the local XTopazVotingVault, which forwards to the local Voter.
 */
function voteTarget(chainId: number): Contract {
  const s = signer(chainId);
  return isHubChain(chainId) ? coreContract("Voter", chainId, s) : votingVault(chainId, s);
}

export async function assertVotable(
  allocations: { pool: string }[],
  chainId: number = CHAIN_ID,
): Promise<void> {
  const v = coreContract("Voter", chainId);
  for (const a of allocations) {
    const g: string = await v.gauges(a.pool);
    if (g === ZeroAddress) throw new Error(`no gauge for pool ${a.pool}`);
    if (!(await v.isAlive(g))) throw new Error(`gauge for ${a.pool} is killed`);
  }
}

export async function vote(args: VoteArgs) {
  const chainId = args.chainId ?? CHAIN_ID;
  const validate = args.validate ?? true;
  if (validate) {
    await assertVotable(args.allocations, chainId);
    const v = coreContract("Voter", chainId);
    const last: bigint = await v.lastVoted(args.tokenId);
    const epochStart: bigint = await v.epochStart(BigInt(Math.floor(Date.now() / 1000)));
    if (last >= epochStart) throw new Error("already voted in this epoch");
  }
  const pools = args.allocations.map((a) => a.pool);
  const weights = args.allocations.map((a) => a.weight);
  return await voteTarget(chainId).vote(args.tokenId, pools, weights);
}

export async function resetVote(tokenId: bigint, chainId: number = CHAIN_ID) {
  return await voteTarget(chainId).reset(tokenId);
}

export async function pokeVote(tokenId: bigint, chainId: number = CHAIN_ID) {
  return await voteTarget(chainId).poke(tokenId);
}
