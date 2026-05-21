import { Contract, ZeroAddress } from "ethers";
import { ABIS } from "../lib/abis.js";
import { signer } from "../lib/client.js";
import { ADDR } from "../config/addresses.js";
import { approveIfNeeded, erc20Read } from "../lib/erc20.js";
import { detectPoolType } from "../read/pools.js";

const voter = () => new Contract(ADDR.Voter, ABIS.Voter, signer());

async function gaugeAddress(pool: string): Promise<string> {
  const g: string = await voter().gauges(pool);
  if (g === ZeroAddress) throw new Error("no gauge for pool " + pool);
  return g;
}

export async function stakeLpV2(args: { pool: string; amount: bigint }) {
  const gauge = await gaugeAddress(args.pool);
  // LP token is the pool address itself
  await approveIfNeeded(args.pool, gauge, args.amount);
  const c = new Contract(gauge, ABIS.Gauge, signer());
  return await c.deposit(args.amount);
}

export async function unstakeLpV2(args: { pool: string; amount: bigint }) {
  const gauge = await gaugeAddress(args.pool);
  const c = new Contract(gauge, ABIS.Gauge, signer());
  return await c.withdraw(args.amount);
}

export async function stakePositionV3(args: { tokenId: bigint }) {
  const s = signer();
  const npm = new Contract(ADDR.NonfungiblePositionManager, ABIS.NonfungiblePositionManager, s);
  const pos = await npm.positions(args.tokenId);
  const [_n, _o, token0, token1, tickSpacing] = pos;
  const pool: string = await new Contract(ADDR.CLFactory, ABIS.CLFactory, s).getPool(
    token0,
    token1,
    tickSpacing
  );
  if (pool === ZeroAddress) throw new Error("no pool for this NFT");
  const type = await detectPoolType(pool);
  if (type !== "v3") throw new Error("not a v3 position");
  const gauge = await gaugeAddress(pool);

  // Approve NFT (single-token approval)
  const approved = await npm.getApproved(args.tokenId);
  if (approved !== gauge) {
    const tx = await npm.approve(gauge, args.tokenId);
    await tx.wait();
  }
  const g = new Contract(gauge, ABIS.CLGauge, s);
  return await g.deposit(args.tokenId);
}

export async function unstakePositionV3(args: { tokenId: bigint }) {
  // Need to find the gauge — query via positions() and CLFactory
  const s = signer();
  const npm = new Contract(ADDR.NonfungiblePositionManager, ABIS.NonfungiblePositionManager, s);
  const pos = await npm.positions(args.tokenId);
  const [_n, _o, token0, token1, tickSpacing] = pos;
  const pool: string = await new Contract(ADDR.CLFactory, ABIS.CLFactory, s).getPool(
    token0,
    token1,
    tickSpacing
  );
  const gauge = await gaugeAddress(pool);
  const g = new Contract(gauge, ABIS.CLGauge, s);
  return await g.withdraw(args.tokenId);
}

export async function getRewardV2(args: { gauge: string; account?: string }) {
  const c = new Contract(args.gauge, ABIS.Gauge, signer());
  const account = args.account ?? (await signer().getAddress());
  return await c.getReward(account);
}

export async function getRewardV3(args: { gauge: string; tokenId: bigint }) {
  // CLGauge.getReward(address) is voter-only; users must call getReward(uint256 tokenId).
  const c = new Contract(args.gauge, ABIS.CLGauge, signer());
  return await c["getReward(uint256)"](args.tokenId);
}
