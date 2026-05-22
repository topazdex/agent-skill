import { Contract, Interface, ZeroAddress, getAddress, parseUnits } from "ethers";
import { ADDR } from "../config/addresses.js";
import { ABIS } from "./abis.js";
import { allowance, getDecimals } from "./erc20.js";
import { provider } from "./client.js";
import { epochStart, epochVoteEnd, nowSec } from "./epoch.js";

export interface BuiltContractTx {
  to: string;
  data: string;
  value: bigint;
}

export interface BuiltApprovalTx extends BuiltContractTx {
  token: string;
  spender: string;
  amount: bigint;
}

export interface BuiltBribeDepositTx {
  pool: string;
  gauge: string;
  bribe: string;
  token: string;
  amount: bigint;
  isRewardAlready: boolean;
  isWhitelisted: boolean;
  approval?: BuiltApprovalTx;
  deposit: BuiltContractTx;
  epochStart: number;
  epochVoteEnd: number;
  builtAt: number;
}

export interface BuildBribeDepositTxArgs {
  pool: string;
  token: string;
  amount: string | bigint;
  /**
   * Address that will sign + provide the reward token. When present, the
   * builder checks allowance and omits approval if it already covers amount.
   * Omit this to always return approval calldata.
   */
  payer?: string;
}

async function normalizeAmount(token: string, amount: string | bigint): Promise<bigint> {
  if (typeof amount === "bigint") {
    if (amount <= 0n) throw new Error("amount must be > 0");
    return amount;
  }
  const decimals = await getDecimals(token);
  const parsed = parseUnits(amount, decimals);
  if (parsed <= 0n) throw new Error("amount must be > 0");
  return parsed;
}

async function approvalFor(
  token: string,
  spender: string,
  amount: bigint,
  payer: string | undefined,
): Promise<BuiltApprovalTx | undefined> {
  if (payer) {
    const current = await allowance(token, payer, spender);
    if (current >= amount) return undefined;
  }
  const erc20 = new Interface(ABIS.ERC20);
  return {
    token,
    spender,
    amount,
    to: token,
    data: erc20.encodeFunctionData("approve", [spender, amount]),
    value: 0n,
  };
}

export async function buildBribeDepositTx(
  args: BuildBribeDepositTxArgs,
): Promise<BuiltBribeDepositTx> {
  const pool = getAddress(args.pool);
  const token = getAddress(args.token);
  const payer = args.payer !== undefined ? getAddress(args.payer) : undefined;

  const voter = new Contract(ADDR.Voter, ABIS.Voter, provider());
  const gauge: string = await voter.gauges(pool);
  if (gauge === ZeroAddress) throw new Error("no gauge for that pool");
  if (!(await voter.isAlive(gauge))) {
    throw new Error("gauge is killed; bribes would not flow");
  }

  const bribe: string = await voter.gaugeToBribe(gauge);
  if (bribe === ZeroAddress) throw new Error("pool gauge has no bribe contract");

  const reward = new Contract(bribe, ABIS.Reward, provider());
  const [isRewardAlready, isWhitelisted] = await Promise.all([
    reward.isReward(token) as Promise<boolean>,
    voter.isWhitelistedToken(token) as Promise<boolean>,
  ]);
  if (!isRewardAlready && !isWhitelisted) {
    throw new Error(
      `token ${token} is neither a reward token of the bribe contract nor whitelisted; notifyRewardAmount would revert`,
    );
  }

  const amount = await normalizeAmount(token, args.amount);
  const rewardIface = new Interface(ABIS.Reward);
  const builtAt = nowSec();

  return {
    pool,
    gauge,
    bribe,
    token,
    amount,
    isRewardAlready,
    isWhitelisted,
    approval: await approvalFor(token, bribe, amount, payer),
    deposit: {
      to: bribe,
      data: rewardIface.encodeFunctionData("notifyRewardAmount", [token, amount]),
      value: 0n,
    },
    epochStart: epochStart(builtAt),
    epochVoteEnd: epochVoteEnd(builtAt),
    builtAt,
  };
}
