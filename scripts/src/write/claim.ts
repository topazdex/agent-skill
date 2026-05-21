import { Contract, ZeroAddress } from "ethers";
import { ABIS } from "../lib/abis.js";
import { signer } from "../lib/client.js";
import { ADDR } from "../config/addresses.js";
import {
  v2StakedGaugesForAccount,
  v3StakedGaugesForAccount,
} from "../read/gauges.js";
import { getVote } from "../read/votes.js";

const voter = () => new Contract(ADDR.Voter, ABIS.Voter, signer());
const rewardsDistributor = () =>
  new Contract(ADDR.RewardsDistributor, ABIS.RewardsDistributor, signer());

export async function claimGaugeRewardsV2(args: { gauges: string[] }) {
  if (args.gauges.length === 0) return null;
  return await voter().claimRewards(args.gauges);
}

export async function claimGaugeRewardV3(args: {
  gauge: string;
  tokenId: bigint;
}) {
  // Note: CLGauge.getReward(address) is voter-only. End users must call
  // getReward(uint256 tokenId) per staked position they own.
  const c = new Contract(args.gauge, ABIS.CLGauge, signer());
  return await c["getReward(uint256)"](args.tokenId);
}

export async function claimFees(args: { tokenId: bigint; pools: string[] }) {
  const v = voter();
  if (args.pools.length === 0) return null;
  const gauges = await Promise.all(args.pools.map((p) => v.gauges(p) as Promise<string>));
  const feeContracts: string[] = [];
  const tokenLists: string[][] = [];
  for (let i = 0; i < args.pools.length; i++) {
    if (gauges[i] === ZeroAddress) continue;
    feeContracts.push(await v.gaugeToFees(gauges[i]));
    const pc = new Contract(args.pools[i], ABIS.Pool, signer());
    const [t0, t1] = await Promise.all([pc.token0() as Promise<string>, pc.token1() as Promise<string>]);
    tokenLists.push([t0, t1]);
  }
  if (feeContracts.length === 0) return null;
  return await v.claimFees(feeContracts, tokenLists, args.tokenId);
}

export async function claimBribes(args: { tokenId: bigint; pools: string[] }) {
  const v = voter();
  if (args.pools.length === 0) return null;
  const gauges = await Promise.all(args.pools.map((p) => v.gauges(p) as Promise<string>));
  const bribeContracts: string[] = [];
  const tokenLists: string[][] = [];
  for (let i = 0; i < args.pools.length; i++) {
    if (gauges[i] === ZeroAddress) continue;
    const b: string = await v.gaugeToBribe(gauges[i]);
    const c = new Contract(b, ABIS.Reward, signer());
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
  return await v.claimBribes(bribeContracts, tokenLists, args.tokenId);
}

export async function claimRebase(tokenId: bigint) {
  const claimable: bigint = await rewardsDistributor().claimable(tokenId);
  if (claimable === 0n) return null;
  return await rewardsDistributor().claim(tokenId);
}

export interface ClaimAllArgs {
  tokenId: bigint;
  account?: string;
}

export async function claimAll(args: ClaimAllArgs) {
  const account = args.account ?? (await signer().getAddress());

  // 1. Gauge emissions
  const [v2Gauges, v3Gauges] = await Promise.all([
    v2StakedGaugesForAccount(account),
    v3StakedGaugesForAccount(account),
  ]);
  const results: Record<string, unknown> = {};
  if (v2Gauges.length > 0) {
    const tx = await voter().claimRewards(v2Gauges);
    await tx.wait();
    results.v2GaugeRewards = tx.hash;
  }
  for (const { gauge, tokenIds } of v3Gauges) {
    const c = new Contract(gauge, ABIS.CLGauge, signer());
    for (const tokenId of tokenIds) {
      const tx = await c["getReward(uint256)"](tokenId);
      await tx.wait();
      results[`v3GaugeRewards_${gauge}_${tokenId}`] = tx.hash;
    }
  }

  // 2. Fees + bribes
  const vote = await getVote(args.tokenId);
  const pools = vote.allocations.map((a) => a.pool);
  const feesTx = await claimFees({ tokenId: args.tokenId, pools });
  if (feesTx) {
    await feesTx.wait();
    results.fees = feesTx.hash;
  }
  const bribesTx = await claimBribes({ tokenId: args.tokenId, pools });
  if (bribesTx) {
    await bribesTx.wait();
    results.bribes = bribesTx.hash;
  }

  // 3. Rebase
  const rebaseTx = await claimRebase(args.tokenId);
  if (rebaseTx) {
    await rebaseTx.wait();
    results.rebase = rebaseTx.hash;
  }

  return results;
}
