import { Contract, ZeroAddress } from "ethers";
import { ABIS } from "../lib/abis.js";
import { signer } from "../lib/client.js";
import { ADDR } from "../config/addresses.js";

const voter = () => new Contract(ADDR.Voter, ABIS.Voter, signer());

export interface VoteArgs {
  tokenId: bigint;
  allocations: { pool: string; weight: bigint }[];
  validate?: boolean;            // default true
}

export async function vote(args: VoteArgs) {
  const v = voter();
  const validate = args.validate ?? true;
  if (validate) {
    for (const a of args.allocations) {
      const g: string = await v.gauges(a.pool);
      if (g === ZeroAddress) throw new Error(`no gauge for pool ${a.pool}`);
      if (!(await v.isAlive(g))) throw new Error(`gauge for ${a.pool} is killed`);
    }
    const last: bigint = await v.lastVoted(args.tokenId);
    const epochStart: bigint = await v.epochStart(BigInt(Math.floor(Date.now() / 1000)));
    if (last >= epochStart) throw new Error("already voted in this epoch");
  }
  const pools = args.allocations.map((a) => a.pool);
  const weights = args.allocations.map((a) => a.weight);
  return await v.vote(args.tokenId, pools, weights);
}

export async function resetVote(tokenId: bigint) {
  return await voter().reset(tokenId);
}

export async function pokeVote(tokenId: bigint) {
  return await voter().poke(tokenId);
}
