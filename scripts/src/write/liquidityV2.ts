import { parseUnits, ZeroAddress } from "ethers";
import { signer } from "../lib/client.js";
import { coreContract } from "../lib/contracts.js";
import { CHAIN_ID } from "../config/chain.js";
import { contractAddress } from "../config/deployments.js";
import { isWrappedNative } from "../config/tokens.js";
import { approveIfNeeded, balanceOf, getDecimals } from "../lib/erc20.js";
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
  /** Attach msg.value when one side is the chain's wrapped native (WBNB/WETH). Never on Arc. */
  useNative?: boolean;
  /** Original BNB-era name for `useNative`; still honoured. */
  useBnb?: boolean;
  /** Default BNB Chain (56). */
  chainId?: number;
}

export async function addLiquidityV2(args: AddLiquidityV2Args) {
  const chainId = args.chainId ?? CHAIN_ID;
  const s = signer(chainId);
  const recipient = args.recipient ?? (await s.getAddress());
  const slippageBps = args.slippageBps ?? 100n;
  const deadline = args.deadline ?? DEFAULT_DEADLINE();

  const [decA, decB] = await Promise.all([
    getDecimals(args.tokenA, chainId),
    getDecimals(args.tokenB, chainId),
  ]);
  const amountADesired =
    typeof args.amountADesired === "string"
      ? parseUnits(args.amountADesired, decA)
      : args.amountADesired;
  const amountBDesired =
    typeof args.amountBDesired === "string"
      ? parseUnits(args.amountBDesired, decB)
      : args.amountBDesired;

  const r = coreContract("Router", chainId, s);
  const routerAddress = contractAddress(chainId, "Router");
  // The Router only takes the pool-ratio share of the desired amounts, so minima must come
  // from that quote; slipping the desired amounts reverts whenever the ratio differs.
  const [quotedA, quotedB] = (await r.quoteAddLiquidity(
    args.tokenA,
    args.tokenB,
    args.stable,
    contractAddress(chainId, "PoolFactory"),
    amountADesired,
    amountBDesired,
  )) as [bigint, bigint, bigint];
  const amountAMin = slip(quotedA, slippageBps);
  const amountBMin = slip(quotedB, slippageBps);
  const useNative = args.useNative ?? args.useBnb ?? false;

  const aIsNative = useNative && isWrappedNative(args.tokenA, chainId);
  const bIsNative = useNative && isWrappedNative(args.tokenB, chainId);

  if (aIsNative) {
    await approveIfNeeded(args.tokenB, routerAddress, amountBDesired, { chainId });
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
  if (bIsNative) {
    await approveIfNeeded(args.tokenA, routerAddress, amountADesired, { chainId });
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

  await approveIfNeeded(args.tokenA, routerAddress, amountADesired, { chainId });
  await approveIfNeeded(args.tokenB, routerAddress, amountBDesired, { chainId });
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
  /** Default BNB Chain (56). */
  chainId?: number;
}

export async function removeLiquidityV2(args: RemoveLiquidityV2Args) {
  const chainId = args.chainId ?? CHAIN_ID;
  const s = signer(chainId);
  const owner = await s.getAddress();
  const recipient = args.recipient ?? owner;
  const slippageBps = args.slippageBps ?? 100n;
  const deadline = args.deadline ?? DEFAULT_DEADLINE();

  const pool = await findV2Pool(args.tokenA, args.tokenB, args.stable, chainId);
  if (pool === ZeroAddress) throw new Error("no v2 pool for that pair/stable flag");

  let liquidity: bigint;
  if (args.liquidity !== undefined) {
    liquidity =
      typeof args.liquidity === "string"
        ? parseUnits(args.liquidity, 18)
        : args.liquidity;
  } else if (args.pct !== undefined) {
    const bal = await balanceOf(pool, owner, chainId);
    liquidity = (bal * BigInt(Math.round(args.pct * 100))) / 10_000n;
  } else {
    throw new Error("must specify either liquidity or pct");
  }
  if (liquidity === 0n) throw new Error("nothing to remove");

  // Use Router.quoteRemoveLiquidity to derive min amounts
  const r = coreContract("Router", chainId, s);
  const routerAddress = contractAddress(chainId, "Router");
  const [estA, estB] = await r.quoteRemoveLiquidity(
    args.tokenA,
    args.tokenB,
    args.stable,
    contractAddress(chainId, "PoolFactory"),
    liquidity
  );
  const amountAMin = slip(estA, slippageBps);
  const amountBMin = slip(estB, slippageBps);

  await approveIfNeeded(pool, routerAddress, liquidity, { chainId });
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
