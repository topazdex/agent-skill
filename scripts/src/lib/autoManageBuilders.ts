// Calldata builders for Topaz Auto Manage vaults: two-token deposit, in-kind
// redeem, reward claim, and single-token zap in / zap out through the chain's
// AutoManageZap with 0x swap legs. They never broadcast: each reads the vault
// through the lens, checks the gates, and returns the approvals still missing
// plus the wallet-ready call. Simulate from the owner before sending
// (`simulateBuiltTx`). See references/auto-manage.md.

import { Contract, Interface, ZeroAddress, getAddress } from "ethers";
import { ABIS } from "./abis.js";
import { provider } from "./client.js";
import { deploymentInterface } from "./multichain.js";
import { findSplit, firmSwapLeg, indicativeBuyAmount, type SwapLeg } from "./zeroX.js";
import { contractAddress, deployment } from "../config/deployments.js";
import {
  autoManageVault,
  depositBlocker,
  getAutoManageVault,
  type AutoManageVaultState,
} from "../read/autoManage.js";

const BPS = 10_000n;
const DEFAULT_SLIPPAGE_BPS = 100;
const DEPOSIT_DEADLINE_SECONDS = 600;
/** Firm 0x quotes are short-lived, so zaps get a tighter deadline. */
const ZAP_DEADLINE_SECONDS = 300;
/** Zap out sells slightly less than previewRedeem; selling more than the redeem returns reverts. */
export const ZAP_OUT_SELL_HAIRCUT_BPS = 30n;

export interface BuiltAutoManageTx {
  chainId: number;
  to: string;
  data: string;
  value: bigint;
  label: string;
}

export interface BuiltAutoManageAction {
  kind: "deposit" | "redeem" | "claim" | "zap-in" | "zap-out";
  chainId: number;
  vault: AutoManageVaultState;
  /** Approvals the owner must confirm first; empty when allowances already cover the call. */
  approvals: BuiltAutoManageTx[];
  tx: BuiltAutoManageTx;
  /** Raw amounts for display: expected and minimum shares or tokens, fees, swap legs. */
  details: Record<string, unknown>;
}

const erc20 = new Interface(ABIS.ERC20);
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const slip = (amount: bigint, bps: number) => (amount * (BPS - BigInt(bps))) / BPS;
/** Deadlines follow the chain's clock, as the vault and zap check `block.timestamp`. */
async function deadlineIn(chainId: number, seconds: number): Promise<bigint> {
  const block = await provider(chainId).getBlock("latest");
  if (!block) throw new Error("could not read the latest block");
  return BigInt(block.timestamp + seconds);
}

function checkSlippage(bps: number): void {
  if (!Number.isInteger(bps) || bps < 1 || bps > 1_000) throw new Error("slippageBps must be an integer from 1 to 1000");
}

async function openVault(chainId: number, vault: string, forDeposit: boolean): Promise<AutoManageVaultState> {
  const state = await getAutoManageVault(chainId, vault);
  const blocker = forDeposit ? depositBlocker(state) : null;
  if (blocker) throw new Error(`${blocker}; withdrawals stay open`);
  return state;
}

/** Exact approvals to `spender`, with a reset first when a smaller allowance is already set. */
async function missingApprovals(
  chainId: number,
  owner: string,
  spender: string,
  legs: Array<{ token: string; amount: bigint; symbol: string }>,
): Promise<BuiltAutoManageTx[]> {
  const out: BuiltAutoManageTx[] = [];
  for (const leg of legs) {
    if (leg.amount === 0n) continue;
    const current: bigint = await new Contract(leg.token, ABIS.ERC20, provider(chainId)).allowance(owner, spender);
    if (current >= leg.amount) continue;
    if (current > 0n) {
      out.push({ chainId, to: leg.token, data: erc20.encodeFunctionData("approve", [spender, 0n]), value: 0n, label: `Reset ${leg.symbol} allowance` });
    }
    out.push({ chainId, to: leg.token, data: erc20.encodeFunctionData("approve", [spender, leg.amount]), value: 0n, label: `Approve ${leg.symbol}` });
  }
  return out;
}

async function requireBalance(chainId: number, owner: string, token: string, need: bigint, symbol: string): Promise<void> {
  const balance: bigint = await new Contract(token, ABIS.ERC20, provider(chainId)).balanceOf(owner);
  if (balance < need) throw new Error(`Insufficient ${symbol}: have ${balance}, need ${need} (raw units)`);
}

async function sharesToRedeem(chainId: number, state: AutoManageVaultState, owner: string, shares?: bigint, percent?: number): Promise<bigint> {
  const balance: bigint = await autoManageVault(chainId, state.vault).balanceOf(owner);
  if (balance === 0n) throw new Error(`${owner} holds no shares of the ${state.symbol0}/${state.symbol1} vault`);
  if (shares !== undefined) {
    if (shares <= 0n || shares > balance) throw new Error(`shares must be between 1 and ${balance} (raw, 18 decimals)`);
    return shares;
  }
  const pct = percent ?? 100;
  if (!Number.isInteger(pct) || pct < 1 || pct > 100) throw new Error("percent must be an integer from 1 to 100");
  return (balance * BigInt(pct)) / 100n;
}

/** The zap's native entry needs a wrapped native; Arc has none, so it takes ERC20 only. */
function wrappedNativeFor(chainId: number): string {
  const wrapped = deployment(chainId).wrappedNative;
  if (!wrapped) throw new Error(`${deployment(chainId).name} has no wrapped native; the Auto Manage zap takes ERC20 only there`);
  return getAddress(wrapped);
}

export interface AutoManageDepositArgs {
  chainId: number;
  vault: string;
  owner: string;
  /** Raw token0 cap. Give one side and the other is matched to the vault's composition. */
  amount0Max?: bigint;
  amount1Max?: bigint;
  receiver?: string;
  slippageBps?: number;
}

/** vault.deposit(amount0Max, amount1Max, minShares, receiver, deadline). Both tokens are approved to the vault. */
export async function buildAutoManageDepositTx(args: AutoManageDepositArgs): Promise<BuiltAutoManageAction> {
  const { chainId } = args;
  const bps = args.slippageBps ?? DEFAULT_SLIPPAGE_BPS;
  checkSlippage(bps);
  const owner = getAddress(args.owner);
  const state = await openVault(chainId, args.vault, true);
  let max0 = args.amount0Max;
  let max1 = args.amount1Max;
  if (max0 === undefined && max1 === undefined) throw new Error("Pass amount0Max, amount1Max or both");
  if (max1 === undefined) max1 = state.total0 === 0n ? 0n : (max0! * state.total1) / state.total0 + 1n;
  if (max0 === undefined) max0 = state.total1 === 0n ? 0n : (max1 * state.total0) / state.total1 + 1n;

  const vault = autoManageVault(chainId, state.vault);
  const [shares, used0, used1] = (await vault.previewDeposit(max0, max1)) as [bigint, bigint, bigint];
  if (shares === 0n) throw new Error("These amounts are too small to mint vault shares");
  await requireBalance(chainId, owner, state.token0, max0, state.symbol0);
  await requireBalance(chainId, owner, state.token1, max1, state.symbol1);
  const minShares = slip(shares, bps);
  const approvals = await missingApprovals(chainId, owner, state.vault, [
    { token: state.token0, amount: max0, symbol: state.symbol0 },
    { token: state.token1, amount: max1, symbol: state.symbol1 },
  ]);
  return {
    kind: "deposit",
    chainId,
    vault: state,
    approvals,
    tx: {
      chainId,
      to: state.vault,
      data: vault.interface.encodeFunctionData("deposit", [max0, max1, minShares, getAddress(args.receiver ?? owner), await deadlineIn(chainId, DEPOSIT_DEADLINE_SECONDS)]),
      value: 0n,
      label: `Deposit into the ${state.symbol0}/${state.symbol1} Auto Manage vault`,
    },
    details: { amount0Max: max0, amount1Max: max1, expectedShares: shares, used0, used1, minShares },
  };
}

export interface AutoManageRedeemArgs {
  chainId: number;
  vault: string;
  owner: string;
  /** Raw shares (18 decimals); omit for `percent` of the balance (default 100). */
  shares?: bigint;
  percent?: number;
  receiver?: string;
  slippageBps?: number;
}

/** vault.redeem(shares, min0, min1, receiver, owner, deadline). Returns both tokens in kind; never paused. */
export async function buildAutoManageRedeemTx(args: AutoManageRedeemArgs): Promise<BuiltAutoManageAction> {
  const { chainId } = args;
  const bps = args.slippageBps ?? DEFAULT_SLIPPAGE_BPS;
  checkSlippage(bps);
  const owner = getAddress(args.owner);
  const state = await openVault(chainId, args.vault, false);
  const shares = await sharesToRedeem(chainId, state, owner, args.shares, args.percent);
  const vault = autoManageVault(chainId, state.vault);
  const [amount0, amount1] = (await vault.previewRedeem(shares)) as [bigint, bigint];
  const min0 = slip(amount0, bps);
  const min1 = slip(amount1, bps);
  return {
    kind: "redeem",
    chainId,
    vault: state,
    approvals: [],
    tx: {
      chainId,
      to: state.vault,
      data: vault.interface.encodeFunctionData("redeem", [shares, min0, min1, getAddress(args.receiver ?? owner), owner, await deadlineIn(chainId, DEPOSIT_DEADLINE_SECONDS)]),
      value: 0n,
      label: `Withdraw from the ${state.symbol0}/${state.symbol1} Auto Manage vault`,
    },
    details: { shares, expected0: amount0, expected1: amount1, min0, min1 },
  };
}

/** vault.claimRewards(receiver). Rewards (TOPAZ on BNB, xTOPAZ on spokes) are separate from principal. */
export async function buildAutoManageClaimTx(args: { chainId: number; vault: string; owner: string; receiver?: string }): Promise<BuiltAutoManageAction> {
  const { chainId } = args;
  const owner = getAddress(args.owner);
  const state = await openVault(chainId, args.vault, false);
  const vault = autoManageVault(chainId, state.vault);
  const earned: bigint = await vault.earned(owner);
  if (earned === 0n) throw new Error(`Nothing to claim from the ${state.symbol0}/${state.symbol1} vault yet`);
  return {
    kind: "claim",
    chainId,
    vault: state,
    approvals: [],
    tx: {
      chainId,
      to: state.vault,
      data: vault.interface.encodeFunctionData("claimRewards", [getAddress(args.receiver ?? owner)]),
      value: 0n,
      label: `Claim Auto Manage rewards from the ${state.symbol0}/${state.symbol1} vault`,
    },
    details: { earned, rewardToken: state.rewardToken },
  };
}

const EMPTY_SWAP = { sellToken: ZeroAddress, sellAmount: 0n, data: "0x" };
const toZapSwap = (leg: SwapLeg | null) =>
  leg ? { sellToken: leg.sellToken, sellAmount: leg.sellAmount, data: leg.allowanceHolderCalldata } : { ...EMPTY_SWAP };

async function zapLeg(chainId: number, zap: string, owner: string, sell: string, buy: string, amount: bigint, bps: number): Promise<SwapLeg | null> {
  if (amount === 0n || same(sell, buy)) return null;
  return firmSwapLeg({ chainId, sellToken: sell, buyToken: buy, sellAmount: amount, zap, txOrigin: owner, slippageBps: bps });
}

export interface AutoManageZapInArgs {
  chainId: number;
  vault: string;
  owner: string;
  /** ERC20 address, or null for the chain's native coin (not on Arc). */
  tokenIn: string | null;
  amountIn: bigint;
  swapSlippageBps?: number;
  shareSlippageBps?: number;
}

/**
 * zapIn / zapInNative(ZapIn{vault, tokenIn, amountIn, swap0, swap1, minShares, receiver, refundTo, deadline}).
 * swap0 buys token0 and swap1 token1 from tokenIn; an empty leg is sellAmount 0 with data 0x.
 * ERC20 input is approved to the zap; native input is sent as value.
 */
export async function buildAutoManageZapInTx(args: AutoManageZapInArgs): Promise<BuiltAutoManageAction> {
  const { chainId, amountIn } = args;
  const swapBps = args.swapSlippageBps ?? DEFAULT_SLIPPAGE_BPS;
  const shareBps = args.shareSlippageBps ?? DEFAULT_SLIPPAGE_BPS;
  checkSlippage(swapBps);
  checkSlippage(shareBps);
  if (amountIn <= 0n) throw new Error("amountIn must be positive");
  const owner = getAddress(args.owner);
  const native = args.tokenIn === null;
  const tokenIn = native ? wrappedNativeFor(chainId) : getAddress(args.tokenIn!);
  const state = await openVault(chainId, args.vault, true);
  const zap = contractAddress(chainId, "AutoManageZap");

  if (native) {
    const balance = await provider(chainId).getBalance(owner);
    if (balance < amountIn) throw new Error(`Insufficient native balance: have ${balance}, need ${amountIn}`);
  } else {
    await requireBalance(chainId, owner, tokenIn, amountIn, "input token");
  }
  const approvals = native ? [] : await missingApprovals(chainId, owner, zap, [{ token: tokenIn, amount: amountIn, symbol: "input token" }]);

  const split = await findSplit({
    input: tokenIn,
    token0: state.token0,
    token1: state.token1,
    amountIn,
    capacity: (a0, a1) => [
      state.total0 === 0n ? null : (a0 * 10n ** 18n) / state.total0,
      state.total1 === 0n ? null : (a1 * 10n ** 18n) / state.total1,
    ],
    quote: (buy, amount) => indicativeBuyAmount(chainId, tokenIn, buy, amount, zap),
  });
  const [leg0, leg1] = await Promise.all([
    zapLeg(chainId, zap, owner, tokenIn, state.token0, split.toToken0, swapBps),
    zapLeg(chainId, zap, owner, tokenIn, state.token1, split.toToken1, swapBps),
  ]);
  const retained = amountIn - (leg0?.sellAmount ?? 0n) - (leg1?.sellAmount ?? 0n);
  const min0 = (leg0?.minBuyAmount ?? 0n) + (same(tokenIn, state.token0) ? retained : 0n);
  const min1 = (leg1?.minBuyAmount ?? 0n) + (same(tokenIn, state.token1) ? retained : 0n);
  const [expectedShares] = (await autoManageVault(chainId, state.vault).previewDeposit(min0, min1)) as [bigint];
  const minShares = slip(expectedShares, shareBps);
  if (minShares === 0n) throw new Error("The zap amount is too small to mint vault shares");

  const z = {
    vault: state.vault,
    tokenIn,
    amountIn,
    swap0: toZapSwap(leg0),
    swap1: toZapSwap(leg1),
    minShares,
    receiver: owner,
    refundTo: owner,
    deadline: await deadlineIn(chainId, ZAP_DEADLINE_SECONDS),
  };
  return {
    kind: "zap-in",
    chainId,
    vault: state,
    approvals,
    tx: {
      chainId,
      to: zap,
      data: deploymentInterface(chainId, "AutoManageZap").encodeFunctionData(native ? "zapInNative" : "zapIn", [z]),
      value: native ? amountIn : 0n,
      label: `Zap into the ${state.symbol0}/${state.symbol1} Auto Manage vault`,
    },
    details: { tokenIn, native, amountIn, legs: [leg0, leg1].filter(Boolean), minShares, quoteExpiresInSeconds: ZAP_DEADLINE_SECONDS },
  };
}

export interface AutoManageZapOutArgs {
  chainId: number;
  vault: string;
  owner: string;
  /** ERC20 address, or null for the chain's native coin (not on Arc). */
  tokenOut: string | null;
  shares?: bigint;
  percent?: number;
  swapSlippageBps?: number;
}

/**
 * zapOut / zapOutNative(ZapOut{vault, shares, tokenOut, swap0, swap1, minOut, receiver, deadline}).
 * Vault shares are approved to the zap. Each non-output leg sells slightly less than
 * previewRedeem returns, and the unsold remainder comes back as pool-token dust.
 */
export async function buildAutoManageZapOutTx(args: AutoManageZapOutArgs): Promise<BuiltAutoManageAction> {
  const { chainId } = args;
  const swapBps = args.swapSlippageBps ?? DEFAULT_SLIPPAGE_BPS;
  checkSlippage(swapBps);
  const owner = getAddress(args.owner);
  const native = args.tokenOut === null;
  const tokenOut = native ? wrappedNativeFor(chainId) : getAddress(args.tokenOut!);
  const state = await openVault(chainId, args.vault, false);
  const shares = await sharesToRedeem(chainId, state, owner, args.shares, args.percent);
  const zap = contractAddress(chainId, "AutoManageZap");
  const approvals = await missingApprovals(chainId, owner, zap, [
    { token: state.vault, amount: shares, symbol: `${state.symbol0}/${state.symbol1} vault shares` },
  ]);

  const [r0, r1] = (await autoManageVault(chainId, state.vault).previewRedeem(shares)) as [bigint, bigint];
  const haircut = (amount: bigint) => (amount * (BPS - ZAP_OUT_SELL_HAIRCUT_BPS)) / BPS;
  const sell0 = same(state.token0, tokenOut) ? 0n : haircut(r0);
  const sell1 = same(state.token1, tokenOut) ? 0n : haircut(r1);
  const [leg0, leg1] = await Promise.all([
    zapLeg(chainId, zap, owner, state.token0, tokenOut, sell0, swapBps),
    zapLeg(chainId, zap, owner, state.token1, tokenOut, sell1, swapBps),
  ]);
  const direct = same(state.token0, tokenOut) ? r0 : same(state.token1, tokenOut) ? r1 : 0n;
  const minOut = slip(direct, swapBps) + (leg0?.minBuyAmount ?? 0n) + (leg1?.minBuyAmount ?? 0n);
  const z = {
    vault: state.vault,
    shares,
    tokenOut,
    swap0: toZapSwap(leg0),
    swap1: toZapSwap(leg1),
    minOut,
    receiver: owner,
    deadline: await deadlineIn(chainId, ZAP_DEADLINE_SECONDS),
  };
  return {
    kind: "zap-out",
    chainId,
    vault: state,
    approvals,
    tx: {
      chainId,
      to: zap,
      data: deploymentInterface(chainId, "AutoManageZap").encodeFunctionData(native ? "zapOutNative" : "zapOut", [z]),
      value: 0n,
      label: `Withdraw from the ${state.symbol0}/${state.symbol1} Auto Manage vault as one token`,
    },
    details: { shares, tokenOut, native, expected0: r0, expected1: r1, legs: [leg0, leg1].filter(Boolean), minOut, quoteExpiresInSeconds: ZAP_DEADLINE_SECONDS },
  };
}

/** eth_call the built transaction from `from`; resolves on success, throws the revert otherwise. */
export async function simulateBuiltTx(tx: BuiltAutoManageTx, from: string): Promise<void> {
  await provider(tx.chainId).call({ from, to: tx.to, data: tx.data, value: tx.value });
}
