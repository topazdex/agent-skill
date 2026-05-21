import { Interface, ZeroAddress, getAddress, parseUnits } from "ethers";
import { ABIS } from "./abis.js";
import { ADDR } from "../config/addresses.js";
import { allowance, getDecimals } from "./erc20.js";
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
export const MAX_SLIPPAGE_BPS = 10_000n;
const isWbnb = (token: string) => token.toLowerCase() === ADDR.WBNB.toLowerCase();
export const slip = (amount: bigint, bps: bigint): bigint => (amount * (10_000n - bps)) / 10_000n;
const nowSec = () => Math.floor(Date.now() / 1000);

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
  /** Unix seconds when this build was prepared; use to enforce quote freshness. */
  quotedAt: number;
  /** Tx deadline (unix seconds). */
  deadline: number;
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
  /** Address that will sign + pay tokenIn. Used to skip approvals when allowance already covers amountIn. */
  payer?: string;
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
  payer?: string;
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
  payer?: string;
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
  payer?: string;
}

export interface BuildBestSwapTxArgs {
  tokenIn: string;
  tokenOut: string;
  amountIn: string | bigint;
  slippageBps?: bigint;
  recipient: string;
  deadline?: number;
  useBnb?: boolean;
  payer?: string;
}

interface NormalizedSwapInputs {
  tokenIn: string;
  tokenOut?: string;
  recipient: string;
  payer?: string;
  slippageBps: bigint;
  deadline: number;
  useBnb: boolean;
}

export function normalizeAndValidate(args: {
  tokenIn: string;
  tokenOut?: string;
  recipient: string;
  payer?: string;
  slippageBps?: bigint;
  deadline?: number;
  useBnb?: boolean;
  defaultSlippageBps: bigint;
}): NormalizedSwapInputs {
  const tokenIn = getAddress(args.tokenIn);
  const tokenOut = args.tokenOut !== undefined ? getAddress(args.tokenOut) : undefined;
  const recipient = getAddress(args.recipient);
  const payer = args.payer !== undefined ? getAddress(args.payer) : undefined;

  if (recipient === ZeroAddress) {
    throw new Error("recipient cannot be the zero address");
  }
  if (tokenOut !== undefined && tokenIn.toLowerCase() === tokenOut.toLowerCase()) {
    throw new Error("tokenIn and tokenOut must differ");
  }

  const slippageBps = args.slippageBps ?? args.defaultSlippageBps;
  if (slippageBps < 0n || slippageBps > MAX_SLIPPAGE_BPS) {
    throw new Error(`slippageBps must be 0..${MAX_SLIPPAGE_BPS} (1bp = 0.01%)`);
  }

  const deadline = args.deadline ?? DEFAULT_DEADLINE();
  if (deadline <= nowSec()) {
    throw new Error("deadline must be in the future");
  }

  return {
    tokenIn,
    tokenOut,
    recipient,
    payer,
    slippageBps,
    deadline,
    useBnb: args.useBnb ?? true,
  };
}

async function normalizeAmount(tokenIn: string, amountIn: string | bigint): Promise<bigint> {
  if (typeof amountIn === "bigint") {
    if (amountIn <= 0n) throw new Error("amountIn must be > 0");
    return amountIn;
  }
  const decimals = await getDecimals(tokenIn);
  const parsed = parseUnits(amountIn, decimals);
  if (parsed <= 0n) throw new Error("amountIn must be > 0");
  return parsed;
}

async function approvalFor(
  tokenIn: string,
  spender: string,
  amountIn: bigint,
  useBnb: boolean,
  payer: string | undefined
): Promise<ApprovalRequirement | undefined> {
  if (useBnb && isWbnb(tokenIn)) return undefined;
  if (payer) {
    const current = await allowance(tokenIn, payer, spender);
    if (current >= amountIn) return undefined;
  }
  return { token: tokenIn, spender, amount: amountIn };
}

export async function buildV2SwapTx(args: BuildV2SwapTxArgs): Promise<BuiltSwapTx> {
  const v = normalizeAndValidate({ ...args, defaultSlippageBps: 50n });
  const pool = await findV2Pool(v.tokenIn, v.tokenOut!, args.stable);
  if (pool === ZeroAddress) throw new Error("no v2 pool for that pair/stable flag");

  const amountIn = await normalizeAmount(v.tokenIn, args.amountIn);
  const expectedOut = await quoteV2(v.tokenIn, v.tokenOut!, amountIn, args.stable);
  if (expectedOut === 0n) throw new Error("quote returned 0; pool may be empty");

  return buildV2RouteSwapTx({
    tokenIn: v.tokenIn,
    amountIn,
    route: [{ from: v.tokenIn, to: v.tokenOut!, stable: args.stable, factory: ADDR.PoolFactory }],
    slippageBps: v.slippageBps,
    recipient: v.recipient,
    deadline: v.deadline,
    useBnb: v.useBnb,
    payer: v.payer,
    routeLabel: `v2 ${args.stable ? "stable" : "volatile"} direct`,
  });
}

export async function buildV2RouteSwapTx(args: BuildV2RouteSwapTxArgs): Promise<BuiltSwapTx> {
  if (args.route.length === 0) throw new Error("route must contain at least one hop");
  const tokenIn = getAddress(args.tokenIn);
  const finalToken = args.route[args.route.length - 1].to;
  const v = normalizeAndValidate({
    tokenIn,
    tokenOut: finalToken,
    recipient: args.recipient,
    payer: args.payer,
    slippageBps: args.slippageBps,
    deadline: args.deadline,
    useBnb: args.useBnb,
    defaultSlippageBps: 50n,
  });

  const amountIn = await normalizeAmount(v.tokenIn, args.amountIn);
  const expectedOut = await quoteV2Route(amountIn, args.route);
  if (expectedOut === 0n) throw new Error("quote returned 0; route may be unavailable");

  const amountOutMin = slip(expectedOut, v.slippageBps);
  const router = new Interface(ABIS.Router);
  const nativeIn = v.useBnb && isWbnb(v.tokenIn);
  const nativeOut = v.useBnb && !!finalToken && isWbnb(finalToken);

  const shared = {
    expectedOut,
    amountOutMin,
    route: args.routeLabel ?? "v2 route",
    quotedAt: nowSec(),
    deadline: v.deadline,
  };

  if (nativeIn) {
    return {
      to: ADDR.Router,
      data: router.encodeFunctionData("swapExactETHForTokens", [amountOutMin, args.route, v.recipient, v.deadline]),
      value: amountIn,
      ...shared,
    };
  }

  if (nativeOut) {
    return {
      to: ADDR.Router,
      data: router.encodeFunctionData("swapExactTokensForETH", [amountIn, amountOutMin, args.route, v.recipient, v.deadline]),
      value: 0n,
      ...shared,
      approval: await approvalFor(v.tokenIn, ADDR.Router, amountIn, false, v.payer),
    };
  }

  return {
    to: ADDR.Router,
    data: router.encodeFunctionData("swapExactTokensForTokens", [amountIn, amountOutMin, args.route, v.recipient, v.deadline]),
    value: 0n,
    ...shared,
    approval: await approvalFor(v.tokenIn, ADDR.Router, amountIn, false, v.payer),
  };
}

export async function buildV3SwapTx(args: BuildV3SwapTxArgs): Promise<BuiltSwapTx> {
  const v = normalizeAndValidate({ ...args, defaultSlippageBps: 100n });
  const pool = await findV3Pool(v.tokenIn, v.tokenOut!, args.tickSpacing);
  if (pool === ZeroAddress) throw new Error("no v3 pool at that tick spacing");

  const amountIn = await normalizeAmount(v.tokenIn, args.amountIn);
  const expectedOut = await quoteV3Single(
    v.tokenIn,
    v.tokenOut!,
    amountIn,
    args.tickSpacing,
    args.sqrtPriceLimitX96 ?? 0n
  );
  if (expectedOut === 0n) throw new Error("quote returned 0");

  const amountOutMin = slip(expectedOut, v.slippageBps);
  const router = new Interface(ABIS.SwapRouter);
  const nativeIn = v.useBnb && isWbnb(v.tokenIn);

  return {
    to: ADDR.SwapRouter,
    data: router.encodeFunctionData("exactInputSingle", [{
      tokenIn: v.tokenIn,
      tokenOut: v.tokenOut!,
      tickSpacing: args.tickSpacing,
      recipient: v.recipient,
      deadline: v.deadline,
      amountIn,
      amountOutMinimum: amountOutMin,
      sqrtPriceLimitX96: args.sqrtPriceLimitX96 ?? 0n,
    }]),
    value: nativeIn ? amountIn : 0n,
    expectedOut,
    amountOutMin,
    route: `v3 direct ts=${args.tickSpacing}`,
    quotedAt: nowSec(),
    deadline: v.deadline,
    approval: await approvalFor(v.tokenIn, ADDR.SwapRouter, amountIn, nativeIn, v.payer),
  };
}

export async function buildV3PathSwapTx(args: BuildV3PathSwapTxArgs): Promise<BuiltSwapTx> {
  if (args.tokens.length !== args.spacings.length + 1) throw new Error("tokens/spacings mismatch");
  if (args.tokens.length < 2) throw new Error("path must contain at least 2 tokens");

  const tokens = args.tokens.map(getAddress);
  const v = normalizeAndValidate({
    tokenIn: tokens[0],
    tokenOut: tokens[tokens.length - 1],
    recipient: args.recipient,
    payer: args.payer,
    slippageBps: args.slippageBps,
    deadline: args.deadline,
    useBnb: args.useBnb,
    defaultSlippageBps: 100n,
  });

  const amountIn = await normalizeAmount(v.tokenIn, args.amountIn);
  const path = encodePath(tokens, args.spacings);
  const expectedOut = await quoteV3Path(path, amountIn);
  if (expectedOut === 0n) throw new Error("quote returned 0");

  const amountOutMin = slip(expectedOut, v.slippageBps);
  const router = new Interface(ABIS.SwapRouter);
  const nativeIn = v.useBnb && isWbnb(v.tokenIn);

  return {
    to: ADDR.SwapRouter,
    data: router.encodeFunctionData("exactInput", [{
      path,
      recipient: v.recipient,
      deadline: v.deadline,
      amountIn,
      amountOutMinimum: amountOutMin,
    }]),
    value: nativeIn ? amountIn : 0n,
    expectedOut,
    amountOutMin,
    route: args.routeLabel ?? "v3 path",
    quotedAt: nowSec(),
    deadline: v.deadline,
    approval: await approvalFor(v.tokenIn, ADDR.SwapRouter, amountIn, nativeIn, v.payer),
  };
}

export async function buildBestSwapTx(args: BuildBestSwapTxArgs): Promise<BuiltSwapTx> {
  // Validate up front so a bad input fails before we eat hundreds of RPC quotes.
  const v = normalizeAndValidate({ ...args, defaultSlippageBps: 100n });
  const amountIn = await normalizeAmount(v.tokenIn, args.amountIn);
  // Builders are wallet-facing and have no atomic mixed-route executor yet,
  // so we ask bestQuote for executable candidates only. Use `bestQuote` directly
  // (or `buildFromExecRoute`) if you want the raw best route, mixed included.
  const best = await bestQuote(v.tokenIn, v.tokenOut!, amountIn, {
    allowMixed: false,
  });
  return buildFromExecRoute({
    exec: best.exec,
    tokenIn: v.tokenIn,
    amountIn,
    slippageBps: v.slippageBps,
    recipient: v.recipient,
    deadline: v.deadline,
    useBnb: v.useBnb,
    payer: v.payer,
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
  payer?: string;
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
        payer: args.payer,
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
        payer: args.payer,
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
        payer: args.payer,
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
