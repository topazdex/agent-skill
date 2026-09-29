import { Contract, ZeroAddress } from "ethers";
import { ABIS } from "../lib/abis.js";
import { signer } from "../lib/client.js";
import { coreContract } from "../lib/contracts.js";
import { CHAIN_ID } from "../config/chain.js";
import { approveIfNeeded } from "../lib/erc20.js";
import { detectPoolType } from "../read/pools.js";

async function gaugeAddress(pool: string, chainId: number): Promise<string> {
  const g: string = await coreContract("Voter", chainId).gauges(pool);
  if (g === ZeroAddress) throw new Error("no gauge for pool " + pool);
  return g;
}

/** Staked principal earns the chain's emission token: TOPAZ on BNB Chain, xTOPAZ on a spoke. */
export async function stakeLpV2(args: { pool: string; amount: bigint; chainId?: number }) {
  const chainId = args.chainId ?? CHAIN_ID;
  const gauge = await gaugeAddress(args.pool, chainId);
  // LP token is the pool address itself
  await approveIfNeeded(args.pool, gauge, args.amount, { chainId });
  const c = new Contract(gauge, ABIS.Gauge, signer(chainId));
  return await c.deposit(args.amount);
}

export async function unstakeLpV2(args: { pool: string; amount: bigint; chainId?: number }) {
  const chainId = args.chainId ?? CHAIN_ID;
  const gauge = await gaugeAddress(args.pool, chainId);
  const c = new Contract(gauge, ABIS.Gauge, signer(chainId));
  return await c.withdraw(args.amount);
}

async function positionGauge(tokenId: bigint, chainId: number) {
  const s = signer(chainId);
  const npm = coreContract("NonfungiblePositionManager", chainId, s);
  const [_n, _o, token0, token1, tickSpacing] = await npm.positions(tokenId);
  const pool: string = await coreContract("CLFactory", chainId, s).getPool(token0, token1, tickSpacing);
  if (pool === ZeroAddress) throw new Error("no pool for this NFT");
  return { npm, pool, gauge: await gaugeAddress(pool, chainId) };
}

export async function stakePositionV3(args: { tokenId: bigint; chainId?: number }) {
  const chainId = args.chainId ?? CHAIN_ID;
  const s = signer(chainId);
  const { npm, pool, gauge } = await positionGauge(args.tokenId, chainId);
  const type = await detectPoolType(pool, chainId);
  if (type !== "v3") throw new Error("not a v3 position");

  // Approve NFT (single-token approval)
  const approved = await npm.getApproved(args.tokenId);
  if (approved !== gauge) {
    const tx = await npm.approve(gauge, args.tokenId);
    await tx.wait();
  }
  const g = new Contract(gauge, ABIS.CLGauge, s);
  return await g.deposit(args.tokenId);
}

export async function unstakePositionV3(args: { tokenId: bigint; chainId?: number }) {
  const chainId = args.chainId ?? CHAIN_ID;
  const { gauge } = await positionGauge(args.tokenId, chainId);
  const g = new Contract(gauge, ABIS.CLGauge, signer(chainId));
  return await g.withdraw(args.tokenId);
}

export async function getRewardV2(args: { gauge: string; account?: string; chainId?: number }) {
  const chainId = args.chainId ?? CHAIN_ID;
  const c = new Contract(args.gauge, ABIS.Gauge, signer(chainId));
  const account = args.account ?? (await signer(chainId).getAddress());
  return await c.getReward(account);
}

export async function getRewardV3(args: { gauge: string; tokenId: bigint; chainId?: number }) {
  // CLGauge.getReward(address) is voter-only; users must call getReward(uint256 tokenId).
  const c = new Contract(args.gauge, ABIS.CLGauge, signer(args.chainId ?? CHAIN_ID));
  return await c["getReward(uint256)"](args.tokenId);
}
