import { Contract, parseUnits, ZeroAddress } from "ethers";
import { ABIS } from "../lib/abis.js";
import { signer } from "../lib/client.js";
import { ADDR } from "../config/addresses.js";
import { approveIfNeeded, getDecimals } from "../lib/erc20.js";
import { findV2Pool, findV3Pool } from "../read/pools.js";
import { quoteV2, quoteV3Single, v2Route, type V2Route } from "../read/quotes.js";
import { encodePath } from "../lib/path.js";

const DEFAULT_DEADLINE = () => Math.floor(Date.now() / 1000) + 60 * 20;
const slip = (amount: bigint, bps: bigint) => (amount * (10_000n - bps)) / 10_000n;

export interface SwapV2Args {
  tokenIn: string;
  tokenOut: string;
  amountIn: string | bigint;     // human ("1.5") or wei (1500000000000000000n)
  stable: boolean;
  slippageBps?: bigint;          // default 50 (0.50%)
  recipient?: string;
  deadline?: number;
  useBnb?: boolean;              // route through swapExactETHForTokens / swapExactTokensForETH
}

export async function swapV2(args: SwapV2Args) {
  const s = signer();
  const recipient = args.recipient ?? (await s.getAddress());
  const slippageBps = args.slippageBps ?? 50n;
  const deadline = args.deadline ?? DEFAULT_DEADLINE();

  const decIn = await getDecimals(args.tokenIn);
  const amountIn =
    typeof args.amountIn === "string" ? parseUnits(args.amountIn, decIn) : args.amountIn;

  const pool = await findV2Pool(args.tokenIn, args.tokenOut, args.stable);
  if (pool === ZeroAddress) throw new Error("no v2 pool for that pair/stable flag");

  const expected = await quoteV2(args.tokenIn, args.tokenOut, amountIn, args.stable);
  if (expected === 0n) throw new Error("quote returned 0; pool may be empty");
  const amountOutMin = slip(expected, slippageBps);

  const routes: V2Route[] = [v2Route(args.tokenIn, args.tokenOut, args.stable)];
  const r = new Contract(ADDR.Router, ABIS.Router, s);

  const isBnbIn = args.useBnb && args.tokenIn.toLowerCase() === ADDR.WBNB.toLowerCase();
  const isBnbOut = args.useBnb && args.tokenOut.toLowerCase() === ADDR.WBNB.toLowerCase();

  if (isBnbIn) {
    return await r.swapExactETHForTokens(amountOutMin, routes, recipient, deadline, {
      value: amountIn,
    });
  }
  if (isBnbOut) {
    await approveIfNeeded(args.tokenIn, ADDR.Router, amountIn);
    return await r.swapExactTokensForETH(amountIn, amountOutMin, routes, recipient, deadline);
  }
  await approveIfNeeded(args.tokenIn, ADDR.Router, amountIn);
  return await r.swapExactTokensForTokens(amountIn, amountOutMin, routes, recipient, deadline);
}

export interface SwapV3SingleArgs {
  tokenIn: string;
  tokenOut: string;
  amountIn: string | bigint;
  tickSpacing: number;
  slippageBps?: bigint;          // default 100 (1.00%)
  recipient?: string;
  deadline?: number;
  sqrtPriceLimitX96?: bigint;
}

export async function swapV3Single(args: SwapV3SingleArgs) {
  const s = signer();
  const recipient = args.recipient ?? (await s.getAddress());
  const slippageBps = args.slippageBps ?? 100n;
  const deadline = args.deadline ?? DEFAULT_DEADLINE();

  const decIn = await getDecimals(args.tokenIn);
  const amountIn =
    typeof args.amountIn === "string" ? parseUnits(args.amountIn, decIn) : args.amountIn;

  const pool = await findV3Pool(args.tokenIn, args.tokenOut, args.tickSpacing);
  if (pool === ZeroAddress) throw new Error("no v3 pool at that tick spacing");

  const expected = await quoteV3Single(
    args.tokenIn,
    args.tokenOut,
    amountIn,
    args.tickSpacing,
    args.sqrtPriceLimitX96 ?? 0n
  );
  if (expected === 0n) throw new Error("quote returned 0");
  const amountOutMin = slip(expected, slippageBps);

  await approveIfNeeded(args.tokenIn, ADDR.SwapRouter, amountIn);
  const r = new Contract(ADDR.SwapRouter, ABIS.SwapRouter, s);
  return await r.exactInputSingle({
    tokenIn: args.tokenIn,
    tokenOut: args.tokenOut,
    tickSpacing: args.tickSpacing,
    recipient,
    deadline,
    amountIn,
    amountOutMinimum: amountOutMin,
    sqrtPriceLimitX96: args.sqrtPriceLimitX96 ?? 0n,
  });
}

export interface SwapV3PathArgs {
  tokens: string[];               // first = tokenIn, last = tokenOut
  spacings: number[];             // tokens.length - 1
  amountIn: string | bigint;
  slippageBps?: bigint;           // default 100
  recipient?: string;
  deadline?: number;
}

export async function swapV3Path(args: SwapV3PathArgs) {
  const s = signer();
  const recipient = args.recipient ?? (await s.getAddress());
  const slippageBps = args.slippageBps ?? 100n;
  const deadline = args.deadline ?? DEFAULT_DEADLINE();

  if (args.tokens.length !== args.spacings.length + 1)
    throw new Error("tokens/spacings mismatch");

  const decIn = await getDecimals(args.tokens[0]);
  const amountIn =
    typeof args.amountIn === "string" ? parseUnits(args.amountIn, decIn) : args.amountIn;

  const path = encodePath(args.tokens, args.spacings);
  const { quoteV3Path } = await import("../read/quotes.js");
  const expected = await quoteV3Path(path, amountIn);
  if (expected === 0n) throw new Error("quote returned 0");
  const amountOutMin = slip(expected, slippageBps);

  await approveIfNeeded(args.tokens[0], ADDR.SwapRouter, amountIn);
  const r = new Contract(ADDR.SwapRouter, ABIS.SwapRouter, s);
  return await r.exactInput({
    path,
    recipient,
    deadline,
    amountIn,
    amountOutMinimum: amountOutMin,
  });
}
