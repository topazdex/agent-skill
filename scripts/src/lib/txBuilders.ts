import { Interface, parseUnits, ZeroAddress } from "ethers";
import { ABIS } from "./abis.js";
import { ADDR } from "../config/addresses.js";
import { getDecimals } from "./erc20.js";
import { encodePath } from "./path.js";
import { findV2Pool, findV3Pool } from "../read/pools.js";
import {
  bestQuote,
  quoteV2,
  quoteV2Route,
  quoteV3Path,
  quoteV3Single,
  type ExecRoute,
  type V2Route,
} from "../read/quotes.js";

const DEFAULT_DEADLINE = () => Math.floor(Date.now() / 1000) + 60 * 20;
const slip = (amount: bigint, bps: bigint) => (amount * (10_000n - bps)) / 10_000n;
const isWbnb = (token: string) => token.toLowerCase() === ADDR.WBNB.toLowerCase();

export interface ApprovalRequirement {
  token: string;
  spender: string;
  amount: bigint;
}

export interface BuiltSwapTx {
  to: string;
  data: string;
  value: bigint;
  expectedOut: bigint;
  amountOutMin: bigint;
  route: string;
  approval?: ApprovalRequirement;
}

export interface BuildV2SwapTxArgs {
  tokenIn: string;
  tokenOut: string;
  amountIn: string | bigint;
  stable: boolean;
  slippageBps?: bigint;
  recipient: string;
  deadline?: number;
  useBnb?: boolean;
}

export interface BuildV2RouteSwapTxArgs {
  tokenIn: string;
  amountIn: string | bigint;
  route: V2Route[];
  slippageBps?: bigint;
  recipient: string;
  deadline?: number;
  useBnb?: boolean;
  routeLabel?: string;
}

export interface BuildV3SwapTxArgs {
  tokenIn: string;
  tokenOut: string;
  amountIn: string | bigint;
  tickSpacing: number;
  slippageBps?: bigint;
  recipient: string;
  deadline?: number;
  sqrtPriceLimitX96?: bigint;
  useBnb?: boolean;
}

export interface BuildV3PathSwapTxArgs {
  tokens: string[];
  spacings: number[];
  amountIn: string | bigint;
  slippageBps?: bigint;
  recipient: string;
  deadline?: number;
  useBnb?: boolean;
  routeLabel?: string;
}

export interface BuildBestSwapTxArgs {
  tokenIn: string;
  tokenOut: string;
  amountIn: string | bigint;
  slippageBps?: bigint;
  recipient: string;
  deadline?: number;
  useBnb?: boolean;
}

async function normalizeAmount(tokenIn: string, amountIn: string | bigint): Promise<bigint> {
  if (typeof amountIn === "bigint") return amountIn;
  const decimals = await getDecimals(tokenIn);
  return parseUnits(amountIn, decimals);
}

function approvalFor(tokenIn: string, spender: string, amountIn: bigint, useBnb: boolean): ApprovalRequirement | undefined {
  if (useBnb && isWbnb(tokenIn)) return undefined;
  return { token: tokenIn, spender, amount: amountIn };
}

export async function buildV2SwapTx(args: BuildV2SwapTxArgs): Promise<BuiltSwapTx> {
  const pool = await findV2Pool(args.tokenIn, args.tokenOut, args.stable);
  if (pool === ZeroAddress) throw new Error("no v2 pool for that pair/stable flag");

  const amountIn = await normalizeAmount(args.tokenIn, args.amountIn);
  const expectedOut = await quoteV2(args.tokenIn, args.tokenOut, amountIn, args.stable);
  if (expectedOut === 0n) throw new Error("quote returned 0; pool may be empty");

  return buildV2RouteSwapTx({
    tokenIn: args.tokenIn,
    amountIn,
    route: [{ from: args.tokenIn, to: args.tokenOut, stable: args.stable, factory: ADDR.PoolFactory }],
    slippageBps: args.slippageBps,
    recipient: args.recipient,
    deadline: args.deadline,
    useBnb: args.useBnb,
    routeLabel: `v2 ${args.stable ? "stable" : "volatile"} direct`,
  });
}

export async function buildV2RouteSwapTx(args: BuildV2RouteSwapTxArgs): Promise<BuiltSwapTx> {
  const amountIn = await normalizeAmount(args.tokenIn, args.amountIn);
  const expectedOut = await quoteV2Route(amountIn, args.route);
  if (expectedOut === 0n) throw new Error("quote returned 0; route may be unavailable");

  const slippageBps = args.slippageBps ?? 50n;
  const amountOutMin = slip(expectedOut, slippageBps);
  const deadline = args.deadline ?? DEFAULT_DEADLINE();
  const useBnb = args.useBnb ?? true;
  const router = new Interface(ABIS.Router);
  const finalToken = args.route[args.route.length - 1]?.to;
  const nativeIn = useBnb && isWbnb(args.tokenIn);
  const nativeOut = useBnb && !!finalToken && isWbnb(finalToken);

  if (nativeIn) {
    return {
      to: ADDR.Router,
      data: router.encodeFunctionData("swapExactETHForTokens", [amountOutMin, args.route, args.recipient, deadline]),
      value: amountIn,
      expectedOut,
      amountOutMin,
      route: args.routeLabel ?? "v2 route",
    };
  }

  if (nativeOut) {
    return {
      to: ADDR.Router,
      data: router.encodeFunctionData("swapExactTokensForETH", [amountIn, amountOutMin, args.route, args.recipient, deadline]),
      value: 0n,
      expectedOut,
      amountOutMin,
      route: args.routeLabel ?? "v2 route",
      approval: approvalFor(args.tokenIn, ADDR.Router, amountIn, false),
    };
  }

  return {
    to: ADDR.Router,
    data: router.encodeFunctionData("swapExactTokensForTokens", [amountIn, amountOutMin, args.route, args.recipient, deadline]),
    value: 0n,
    expectedOut,
    amountOutMin,
    route: args.routeLabel ?? "v2 route",
    approval: approvalFor(args.tokenIn, ADDR.Router, amountIn, false),
  };
}

export async function buildV3SwapTx(args: BuildV3SwapTxArgs): Promise<BuiltSwapTx> {
  const pool = await findV3Pool(args.tokenIn, args.tokenOut, args.tickSpacing);
  if (pool === ZeroAddress) throw new Error("no v3 pool at that tick spacing");

  const amountIn = await normalizeAmount(args.tokenIn, args.amountIn);
  const expectedOut = await quoteV3Single(
    args.tokenIn,
    args.tokenOut,
    amountIn,
    args.tickSpacing,
    args.sqrtPriceLimitX96 ?? 0n
  );
  if (expectedOut === 0n) throw new Error("quote returned 0");

  const slippageBps = args.slippageBps ?? 100n;
  const amountOutMin = slip(expectedOut, slippageBps);
  const deadline = args.deadline ?? DEFAULT_DEADLINE();
  const useBnb = args.useBnb ?? true;
  const router = new Interface(ABIS.SwapRouter);
  const nativeIn = useBnb && isWbnb(args.tokenIn);

  return {
    to: ADDR.SwapRouter,
    data: router.encodeFunctionData("exactInputSingle", [{
      tokenIn: args.tokenIn,
      tokenOut: args.tokenOut,
      tickSpacing: args.tickSpacing,
      recipient: args.recipient,
      deadline,
      amountIn,
      amountOutMinimum: amountOutMin,
      sqrtPriceLimitX96: args.sqrtPriceLimitX96 ?? 0n,
    }]),
    value: nativeIn ? amountIn : 0n,
    expectedOut,
    amountOutMin,
    route: `v3 direct ts=${args.tickSpacing}`,
    approval: approvalFor(args.tokenIn, ADDR.SwapRouter, amountIn, nativeIn),
  };
}

export async function buildV3PathSwapTx(args: BuildV3PathSwapTxArgs): Promise<BuiltSwapTx> {
  if (args.tokens.length !== args.spacings.length + 1) throw new Error("tokens/spacings mismatch");

  const tokenIn = args.tokens[0];
  const amountIn = await normalizeAmount(tokenIn, args.amountIn);
  const path = encodePath(args.tokens, args.spacings);
  const expectedOut = await quoteV3Path(path, amountIn);
  if (expectedOut === 0n) throw new Error("quote returned 0");

  const slippageBps = args.slippageBps ?? 100n;
  const amountOutMin = slip(expectedOut, slippageBps);
  const deadline = args.deadline ?? DEFAULT_DEADLINE();
  const useBnb = args.useBnb ?? true;
  const router = new Interface(ABIS.SwapRouter);
  const nativeIn = useBnb && isWbnb(tokenIn);

  return {
    to: ADDR.SwapRouter,
    data: router.encodeFunctionData("exactInput", [{
      path,
      recipient: args.recipient,
      deadline,
      amountIn,
      amountOutMinimum: amountOutMin,
    }]),
    value: nativeIn ? amountIn : 0n,
    expectedOut,
    amountOutMin,
    route: args.routeLabel ?? "v3 path",
    approval: approvalFor(tokenIn, ADDR.SwapRouter, amountIn, nativeIn),
  };
}

export async function buildBestSwapTx(args: BuildBestSwapTxArgs): Promise<BuiltSwapTx> {
  const amountIn = await normalizeAmount(args.tokenIn, args.amountIn);
  const best = await bestQuote(args.tokenIn, args.tokenOut, amountIn);
  return buildFromExecRoute({
    exec: best.exec,
    tokenIn: args.tokenIn,
    amountIn,
    slippageBps: args.slippageBps,
    recipient: args.recipient,
    deadline: args.deadline,
    useBnb: args.useBnb,
    routeLabel: best.route,
  });
}

export async function buildFromExecRoute(args: {
  exec: ExecRoute;
  tokenIn: string;
  amountIn: bigint;
  slippageBps?: bigint;
  recipient: string;
  deadline?: number;
  useBnb?: boolean;
  routeLabel?: string;
}): Promise<BuiltSwapTx> {
  switch (args.exec.type) {
    case "v2":
      return buildV2RouteSwapTx({
        tokenIn: args.tokenIn,
        amountIn: args.amountIn,
        route: args.exec.route,
        slippageBps: args.slippageBps,
        recipient: args.recipient,
        deadline: args.deadline,
        useBnb: args.useBnb,
        routeLabel: args.routeLabel,
      });
    case "v3-single":
      return buildV3SwapTx({
        tokenIn: args.exec.tokenIn,
        tokenOut: args.exec.tokenOut,
        amountIn: args.amountIn,
        tickSpacing: args.exec.tickSpacing,
        slippageBps: args.slippageBps,
        recipient: args.recipient,
        deadline: args.deadline,
        useBnb: args.useBnb,
      });
    case "v3-path":
      return buildV3PathSwapTx({
        tokens: args.exec.tokens,
        spacings: args.exec.spacings,
        amountIn: args.amountIn,
        slippageBps: args.slippageBps,
        recipient: args.recipient,
        deadline: args.deadline,
        useBnb: args.useBnb,
        routeLabel: args.routeLabel,
      });
    case "mixed":
      throw new Error("mixed routes are quote-only in this builder; implement atomic mixed execution before enabling");
    default: {
      const exhaustive: never = args.exec;
      throw new Error(`unsupported route: ${JSON.stringify(exhaustive)}`);
    }
  }
}
