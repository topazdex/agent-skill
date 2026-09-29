import { Contract, ZeroAddress } from "ethers";
import { ABIS } from "../lib/abis.js";
import { provider, signer } from "../lib/client.js";
import { coreContract } from "../lib/contracts.js";
import { CHAIN_ID } from "../config/chain.js";
import { isHubChain, requireHubChain } from "../config/deployments.js";
import {
  v2StakedGaugesForAccount,
  v3StakedGaugesForAccount,
} from "../read/gauges.js";
import { votingVault } from "../read/spokePositions.js";
import { getVote } from "../read/votes.js";

export async function claimGaugeRewardsV2(args: { gauges: string[]; chainId?: number }) {
  if (args.gauges.length === 0) return null;
  const chainId = args.chainId ?? CHAIN_ID;
  return await coreContract("Voter", chainId, signer(chainId)).claimRewards(args.gauges);
}

export async function claimGaugeRewardV3(args: {
  gauge: string;
  tokenId: bigint;
  chainId?: number;
}) {
  // Note: CLGauge.getReward(address) is voter-only. End users must call
  // getReward(uint256 tokenId) per staked position they own.
  const c = new Contract(args.gauge, ABIS.CLGauge, signer(args.chainId ?? CHAIN_ID));
  return await c["getReward(uint256)"](args.tokenId);
}

/**
 * Same reward contracts on every chain, different entry point: BNB Voter takes
 * (contracts, tokens, veNFT id); a spoke XTopazVotingVault takes (position id,
 * contracts, tokens) and pays the position owner.
 */
async function sendVotingClaim(
  kind: "claimFees" | "claimBribes",
  tokenId: bigint,
  contracts: string[],
  tokenLists: string[][],
  chainId: number,
) {
  const s = signer(chainId);
  if (isHubChain(chainId)) return await coreContract("Voter", chainId, s)[kind](contracts, tokenLists, tokenId);
  return await votingVault(chainId, s)[kind](tokenId, contracts, tokenLists);
}

export async function claimFees(args: { tokenId: bigint; pools: string[]; chainId?: number }) {
  const chainId = args.chainId ?? CHAIN_ID;
  const v = coreContract("Voter", chainId);
  if (args.pools.length === 0) return null;
  const gauges = await Promise.all(args.pools.map((p) => v.gauges(p) as Promise<string>));
  const feeContracts: string[] = [];
  const tokenLists: string[][] = [];
  for (let i = 0; i < args.pools.length; i++) {
    if (gauges[i] === ZeroAddress) continue;
    feeContracts.push(await v.gaugeToFees(gauges[i]));
    const pc = new Contract(args.pools[i], ABIS.Pool, provider(chainId));
    const [t0, t1] = await Promise.all([pc.token0() as Promise<string>, pc.token1() as Promise<string>]);
    tokenLists.push([t0, t1]);
  }
  if (feeContracts.length === 0) return null;
  return await sendVotingClaim("claimFees", args.tokenId, feeContracts, tokenLists, chainId);
}

export async function claimBribes(args: { tokenId: bigint; pools: string[]; chainId?: number }) {
  const chainId = args.chainId ?? CHAIN_ID;
  const v = coreContract("Voter", chainId);
  if (args.pools.length === 0) return null;
  const gauges = await Promise.all(args.pools.map((p) => v.gauges(p) as Promise<string>));
  const bribeContracts: string[] = [];
  const tokenLists: string[][] = [];
  for (let i = 0; i < args.pools.length; i++) {
    if (gauges[i] === ZeroAddress) continue;
    const b: string = await v.gaugeToBribe(gauges[i]);
    const c = new Contract(b, ABIS.Reward, provider(chainId));
    const len: bigint = await c.rewardsListLength();
    const tokens = await Promise.all(
      Array.from({ length: Number(len) }, (_, j) => c.rewards(j) as Promise<string>)
    );
    const earnedAmts = await Promise.all(
      tokens.map((t) => c.earned(t, args.tokenId) as Promise<bigint>)
    );
    const active = tokens.filter((_, j) => earnedAmts[j] > 0n);
    if (active.length > 0) {
      bribeContracts.push(b);
      tokenLists.push(active);
    }
  }
  if (bribeContracts.length === 0) return null;
  return await sendVotingClaim("claimBribes", args.tokenId, bribeContracts, tokenLists, chainId);
}

/** BNB veTOPAZ only: spoke xTOPAZ already carries its backing appreciation. */
export async function claimRebase(tokenId: bigint, chainId: number = CHAIN_ID) {
  requireHubChain(chainId, "RewardsDistributor rebase");
  const rewardsDistributor = coreContract("RewardsDistributor", chainId, signer(chainId));
  const claimable: bigint = await rewardsDistributor.claimable(tokenId);
  if (claimable === 0n) return null;
  return await rewardsDistributor.claim(tokenId);
}

export interface ClaimAllArgs {
  /** veTOPAZ NFT id on BNB Chain; XTopazVotingVault position id on a spoke. */
  tokenId: bigint;
  account?: string;
  /** Default BNB Chain (56). */
  chainId?: number;
}

export async function claimAll(args: ClaimAllArgs) {
  const chainId = args.chainId ?? CHAIN_ID;
  const s = signer(chainId);
  const account = args.account ?? (await s.getAddress());

  // 1. Gauge emissions (TOPAZ on BNB Chain, xTOPAZ on a spoke)
  const [v2Gauges, v3Gauges] = await Promise.all([
    v2StakedGaugesForAccount(account, chainId),
    v3StakedGaugesForAccount(account, chainId),
  ]);
  const results: Record<string, unknown> = {};
  if (v2Gauges.length > 0) {
    const tx = await coreContract("Voter", chainId, s).claimRewards(v2Gauges);
    await tx.wait();
    results.v2GaugeRewards = tx.hash;
  }
  for (const { gauge, tokenIds } of v3Gauges) {
    const c = new Contract(gauge, ABIS.CLGauge, s);
    for (const tokenId of tokenIds) {
      const tx = await c["getReward(uint256)"](tokenId);
      await tx.wait();
      results[`v3GaugeRewards_${gauge}_${tokenId}`] = tx.hash;
    }
  }

  // 2. Fees + bribes
  const vote = await getVote(args.tokenId, chainId);
  const pools = vote.allocations.map((a) => a.pool);
  const feesTx = await claimFees({ tokenId: args.tokenId, pools, chainId });
  if (feesTx) {
    await feesTx.wait();
    results.fees = feesTx.hash;
  }
  const bribesTx = await claimBribes({ tokenId: args.tokenId, pools, chainId });
  if (bribesTx) {
    await bribesTx.wait();
    results.bribes = bribesTx.hash;
  }

  // 3. Rebase (hub only)
  if (isHubChain(chainId)) {
    const rebaseTx = await claimRebase(args.tokenId, chainId);
    if (rebaseTx) {
      await rebaseTx.wait();
      results.rebase = rebaseTx.hash;
    }
  }

  return results;
}
