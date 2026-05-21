import { Contract, parseUnits, ZeroAddress } from "ethers";
import { ABIS } from "../lib/abis.js";
import { signer } from "../lib/client.js";
import { ADDR } from "../config/addresses.js";
import { approveIfNeeded, balanceOf, erc20Read, getDecimals } from "../lib/erc20.js";
import { findV2Pool } from "../read/pools.js";

const DEFAULT_DEADLINE = () => Math.floor(Date.now() / 1000) + 60 * 20;
const slip = (amount: bigint, bps: bigint) => (amount * (10_000n - bps)) / 10_000n;

export interface AddLiquidityV2Args {
  tokenA: string;
  tokenB: string;
  stable: boolean;
  amountADesired: string | bigint;
  amountBDesired: string | bigint;
  slippageBps?: bigint;          // default 100
  recipient?: string;
  deadline?: number;
  useBnb?: boolean;              // if one side is WBNB, attach msg.value
}

export async function addLiquidityV2(args: AddLiquidityV2Args) {
  const s = signer();
  const recipient = args.recipient ?? (await s.getAddress());
  const slippageBps = args.slippageBps ?? 100n;
  const deadline = args.deadline ?? DEFAULT_DEADLINE();

  const [decA, decB] = await Promise.all([getDecimals(args.tokenA), getDecimals(args.tokenB)]);
  const amountADesired =
    typeof args.amountADesired === "string"
      ? parseUnits(args.amountADesired, decA)
      : args.amountADesired;
  const amountBDesired =
    typeof args.amountBDesired === "string"
      ? parseUnits(args.amountBDesired, decB)
      : args.amountBDesired;

  const amountAMin = slip(amountADesired, slippageBps);
  const amountBMin = slip(amountBDesired, slippageBps);

  const r = new Contract(ADDR.Router, ABIS.Router, s);

  const aIsBnb = args.useBnb && args.tokenA.toLowerCase() === ADDR.WBNB.toLowerCase();
  const bIsBnb = args.useBnb && args.tokenB.toLowerCase() === ADDR.WBNB.toLowerCase();

  if (aIsBnb) {
    await approveIfNeeded(args.tokenB, ADDR.Router, amountBDesired);
    return await r.addLiquidityETH(
      args.tokenB,
      args.stable,
      amountBDesired,
      amountBMin,
      amountAMin,
      recipient,
      deadline,
      { value: amountADesired }
    );
  }
  if (bIsBnb) {
    await approveIfNeeded(args.tokenA, ADDR.Router, amountADesired);
    return await r.addLiquidityETH(
      args.tokenA,
      args.stable,
      amountADesired,
      amountAMin,
      amountBMin,
      recipient,
      deadline,
      { value: amountBDesired }
    );
  }

  await approveIfNeeded(args.tokenA, ADDR.Router, amountADesired);
  await approveIfNeeded(args.tokenB, ADDR.Router, amountBDesired);
  return await r.addLiquidity(
    args.tokenA,
    args.tokenB,
    args.stable,
    amountADesired,
    amountBDesired,
    amountAMin,
    amountBMin,
    recipient,
    deadline
  );
}

export interface RemoveLiquidityV2Args {
  tokenA: string;
  tokenB: string;
  stable: boolean;
  liquidity?: string | bigint;     // exact LP amount; if absent, use pct
  pct?: number;                    // 0-100 (e.g. 100 = all)
  slippageBps?: bigint;            // default 100
  recipient?: string;
  deadline?: number;
}

export async function removeLiquidityV2(args: RemoveLiquidityV2Args) {
  const s = signer();
  const owner = await s.getAddress();
  const recipient = args.recipient ?? owner;
  const slippageBps = args.slippageBps ?? 100n;
  const deadline = args.deadline ?? DEFAULT_DEADLINE();

  const pool = await findV2Pool(args.tokenA, args.tokenB, args.stable);
  if (pool === ZeroAddress) throw new Error("no v2 pool for that pair/stable flag");

  let liquidity: bigint;
  if (args.liquidity !== undefined) {
    liquidity =
      typeof args.liquidity === "string"
        ? parseUnits(args.liquidity, 18)
        : args.liquidity;
  } else if (args.pct !== undefined) {
    const bal = await balanceOf(pool, owner);
    liquidity = (bal * BigInt(Math.round(args.pct * 100))) / 10_000n;
  } else {
    throw new Error("must specify either liquidity or pct");
  }
  if (liquidity === 0n) throw new Error("nothing to remove");

  // Use Router.quoteRemoveLiquidity to derive min amounts
  const r = new Contract(ADDR.Router, ABIS.Router, s);
  const [estA, estB] = await r.quoteRemoveLiquidity(
    args.tokenA,
    args.tokenB,
    args.stable,
    ADDR.PoolFactory,
    liquidity
  );
  const amountAMin = slip(estA, slippageBps);
  const amountBMin = slip(estB, slippageBps);

  await approveIfNeeded(pool, ADDR.Router, liquidity);
  return await r.removeLiquidity(
    args.tokenA,
    args.tokenB,
    args.stable,
    liquidity,
    amountAMin,
    amountBMin,
    recipient,
    deadline
  );
}
