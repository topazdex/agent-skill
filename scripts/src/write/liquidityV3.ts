import { parseUnits, ZeroAddress, getAddress } from "ethers";
import { signer } from "../lib/client.js";
import { coreContract } from "../lib/contracts.js";
import { CHAIN_ID } from "../config/chain.js";
import { contractAddress } from "../config/deployments.js";
import { approveIfNeeded, getDecimals } from "../lib/erc20.js";
import { findV3Pool, getPoolV3 } from "../read/pools.js";
import { getPosition } from "../read/positions.js";
import {
  getSqrtRatioAtTick,
  matchedAmount1,
  nearestUsableTick,
  priceToTick,
} from "../lib/tickMath.js";

const MAX_UINT128 = (1n << 128n) - 1n;
const DEFAULT_DEADLINE = () => Math.floor(Date.now() / 1000) + 60 * 20;
const slip = (amount: bigint, bps: bigint) => (amount * (10_000n - bps)) / 10_000n;

const npmC = (chainId: number) => coreContract("NonfungiblePositionManager", chainId, signer(chainId));
const npmAddress = (chainId: number) => contractAddress(chainId, "NonfungiblePositionManager");

function sortTokens(
  a: string,
  b: string
): { token0: string; token1: string; flipped: boolean } {
  const A = getAddress(a);
  const B = getAddress(b);
  if (A.toLowerCase() < B.toLowerCase()) return { token0: A, token1: B, flipped: false };
  return { token0: B, token1: A, flipped: true };
}

export interface MintPositionArgs {
  tokenA: string;
  tokenB: string;
  tickSpacing: number;
  /** Range expressed as ticks (centered on current). Alternative: lowerPrice/upperPrice. */
  rangeTicks?: number;
  lowerPrice?: number;
  upperPrice?: number;
  /** Provide *one* of amountA or amountB; the other is computed from the range and current price. */
  amountA?: string | bigint;
  amountB?: string | bigint;
  slippageBps?: bigint;          // default 50 for stable, 100 for volatile (caller decides)
  recipient?: string;
  deadline?: number;
  /** Default BNB Chain (56). */
  chainId?: number;
}

export async function mintPosition(args: MintPositionArgs) {
  const chainId = args.chainId ?? CHAIN_ID;
  const s = signer(chainId);
  const recipient = args.recipient ?? (await s.getAddress());
  const slippageBps = args.slippageBps ?? 100n;
  const deadline = args.deadline ?? DEFAULT_DEADLINE();

  const { token0, token1, flipped } = sortTokens(args.tokenA, args.tokenB);
  const tickSpacing = args.tickSpacing;

  const poolAddr = await findV3Pool(token0, token1, tickSpacing, chainId);
  if (poolAddr === ZeroAddress)
    throw new Error("no v3 pool at that tick spacing — create via CLFactory first");
  const poolInfo = await getPoolV3(poolAddr, chainId);

  // Decide ticks
  let tickLower: number, tickUpper: number;
  if (args.rangeTicks !== undefined) {
    tickLower = nearestUsableTick(poolInfo.tick - args.rangeTicks, tickSpacing);
    tickUpper = nearestUsableTick(poolInfo.tick + args.rangeTicks, tickSpacing);
  } else if (args.lowerPrice !== undefined && args.upperPrice !== undefined) {
    const tl = priceToTick(args.lowerPrice, poolInfo.decimals0, poolInfo.decimals1);
    const tu = priceToTick(args.upperPrice, poolInfo.decimals0, poolInfo.decimals1);
    tickLower = nearestUsableTick(Math.min(tl, tu), tickSpacing);
    tickUpper = nearestUsableTick(Math.max(tl, tu), tickSpacing);
  } else {
    throw new Error("must specify either rangeTicks or lowerPrice+upperPrice");
  }

  if (tickLower >= tickUpper) throw new Error("tickLower >= tickUpper after rounding");

  // Decide amounts. We expect token0/token1 from the sorted order.
  let amount0Desired: bigint, amount1Desired: bigint;
  const sqrtLower = getSqrtRatioAtTick(tickLower);
  const sqrtUpper = getSqrtRatioAtTick(tickUpper);
  const sqrtPrice = poolInfo.sqrtPriceX96;

  const decA = await getDecimals(args.tokenA, chainId);
  const decB = await getDecimals(args.tokenB, chainId);
  const amountAWei =
    args.amountA !== undefined
      ? typeof args.amountA === "string"
        ? parseUnits(args.amountA, decA)
        : args.amountA
      : undefined;
  const amountBWei =
    args.amountB !== undefined
      ? typeof args.amountB === "string"
        ? parseUnits(args.amountB, decB)
        : args.amountB
      : undefined;

  // Map A/B -> 0/1 according to sort
  const amount0Input = flipped ? amountBWei : amountAWei;
  const amount1Input = flipped ? amountAWei : amountBWei;

  if (amount0Input !== undefined && amount1Input === undefined) {
    amount0Desired = amount0Input;
    amount1Desired = matchedAmount1(amount0Input, sqrtPrice, sqrtLower, sqrtUpper);
  } else if (amount1Input !== undefined && amount0Input === undefined) {
    amount1Desired = amount1Input;
    // Reverse: derive amount0 from amount1 at the same liquidity
    // Easier: compute liquidity from amount1 first, then derive amount0.
    const { getLiquidityForAmount1, getAmount0ForLiquidity } = await import("../lib/tickMath.js");
    const sqrtPricePin = sqrtPrice < sqrtLower ? sqrtLower : sqrtPrice > sqrtUpper ? sqrtUpper : sqrtPrice;
    const liq = getLiquidityForAmount1(sqrtLower, sqrtPricePin, amount1Input);
    amount0Desired = getAmount0ForLiquidity(sqrtPricePin, sqrtUpper, liq);
  } else if (amount0Input !== undefined && amount1Input !== undefined) {
    amount0Desired = amount0Input;
    amount1Desired = amount1Input;
  } else {
    throw new Error("must specify at least one of amountA or amountB");
  }

  await approveIfNeeded(token0, npmAddress(chainId), amount0Desired, { chainId });
  await approveIfNeeded(token1, npmAddress(chainId), amount1Desired, { chainId });

  const npm = npmC(chainId);
  const params = {
    token0,
    token1,
    tickSpacing,
    tickLower,
    tickUpper,
    amount0Desired,
    amount1Desired,
    amount0Min: 0n,
    amount1Min: 0n,
    recipient,
    deadline,
    // Nonzero asks NPM.mint to create the pool first, which reverts for an existing pool.
    sqrtPriceX96: 0n,
  };
  // The pool takes only the range-ratio share of the desired amounts; slip what it will use.
  const [, , used0, used1] = (await npm.mint.staticCall(params)) as [bigint, bigint, bigint, bigint];
  return await npm.mint({ ...params, amount0Min: slip(used0, slippageBps), amount1Min: slip(used1, slippageBps) });
}

export interface IncreaseLiquidityArgs {
  tokenId: bigint;
  amount0Desired: bigint;
  amount1Desired: bigint;
  slippageBps?: bigint;
  deadline?: number;
  /** Default BNB Chain (56). */
  chainId?: number;
}

export async function increaseLiquidity(args: IncreaseLiquidityArgs) {
  const chainId = args.chainId ?? CHAIN_ID;
  const slippageBps = args.slippageBps ?? 100n;
  const deadline = args.deadline ?? DEFAULT_DEADLINE();
  const pos = await getPosition(args.tokenId, chainId);
  await approveIfNeeded(pos.token0, npmAddress(chainId), args.amount0Desired, { chainId });
  await approveIfNeeded(pos.token1, npmAddress(chainId), args.amount1Desired, { chainId });
  const npm = npmC(chainId);
  const params = {
    tokenId: args.tokenId,
    amount0Desired: args.amount0Desired,
    amount1Desired: args.amount1Desired,
    amount0Min: 0n,
    amount1Min: 0n,
    deadline,
  };
  const [, used0, used1] = (await npm.increaseLiquidity.staticCall(params)) as [bigint, bigint, bigint];
  return await npm.increaseLiquidity({ ...params, amount0Min: slip(used0, slippageBps), amount1Min: slip(used1, slippageBps) });
}

export interface DecreaseLiquidityArgs {
  tokenId: bigint;
  liquidityPct?: number;   // 0-100; default 100
  liquidity?: bigint;       // exact (overrides pct)
  slippageBps?: bigint;
  deadline?: number;
  /** Default BNB Chain (56). */
  chainId?: number;
}

export async function decreaseLiquidity(args: DecreaseLiquidityArgs) {
  const chainId = args.chainId ?? CHAIN_ID;
  const slippageBps = args.slippageBps ?? 100n;
  const deadline = args.deadline ?? DEFAULT_DEADLINE();
  const pos = await getPosition(args.tokenId, chainId);

  let liquidity: bigint;
  if (args.liquidity !== undefined) liquidity = args.liquidity;
  else {
    const pct = args.liquidityPct ?? 100;
    liquidity = (pos.liquidity * BigInt(Math.round(pct * 100))) / 10_000n;
  }
  if (liquidity === 0n) throw new Error("nothing to decrease");

  const npm = npmC(chainId);
  const quoted = await npm.decreaseLiquidity.staticCall({
    tokenId: args.tokenId,
    liquidity,
    amount0Min: 0n,
    amount1Min: 0n,
    deadline,
  });
  const [amount0, amount1] = quoted as [bigint, bigint];

  return await npm.decreaseLiquidity({
    tokenId: args.tokenId,
    liquidity,
    amount0Min: slip(amount0, slippageBps),
    amount1Min: slip(amount1, slippageBps),
    deadline,
  });
}

export interface CollectArgs {
  tokenId: bigint;
  recipient?: string;
  amount0Max?: bigint;
  amount1Max?: bigint;
  /** Default BNB Chain (56). */
  chainId?: number;
}

export async function collectFees(args: CollectArgs) {
  const chainId = args.chainId ?? CHAIN_ID;
  const s = signer(chainId);
  const recipient = args.recipient ?? (await s.getAddress());
  return await npmC(chainId).collect({
    tokenId: args.tokenId,
    recipient,
    amount0Max: args.amount0Max ?? MAX_UINT128,
    amount1Max: args.amount1Max ?? MAX_UINT128,
  });
}

export async function burnPosition(tokenId: bigint, chainId: number = CHAIN_ID) {
  return await npmC(chainId).burn(tokenId);
}
