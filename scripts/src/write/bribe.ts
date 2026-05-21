import { Contract, parseUnits, ZeroAddress } from "ethers";
import { ABIS } from "../lib/abis.js";
import { signer } from "../lib/client.js";
import { ADDR } from "../config/addresses.js";
import { approveIfNeeded, getDecimals } from "../lib/erc20.js";

const voter = () => new Contract(ADDR.Voter, ABIS.Voter, signer());

export interface DepositBribeArgs {
  pool: string;
  token: string;
  amount: string | bigint;       // human or wei
}

export async function depositBribe(args: DepositBribeArgs) {
  const v = voter();
  const gauge: string = await v.gauges(args.pool);
  if (gauge === ZeroAddress) throw new Error("no gauge for that pool");
  if (!(await v.isAlive(gauge)))
    throw new Error("gauge is killed — bribes wouldn't flow");
  const bribeAddr: string = await v.gaugeToBribe(gauge);
  const bribe = new Contract(bribeAddr, ABIS.Reward, signer());

  const isRewardAlready: boolean = await bribe.isReward(args.token);
  if (!isRewardAlready) {
    const wl: boolean = await v.isWhitelistedToken(args.token);
    if (!wl)
      throw new Error(
        `token ${args.token} is neither a reward of bribe contract nor whitelisted; tx would revert`
      );
  }

  const dec = await getDecimals(args.token);
  const amount =
    typeof args.amount === "string" ? parseUnits(args.amount, dec) : args.amount;

  await approveIfNeeded(args.token, bribeAddr, amount);
  return await bribe.notifyRewardAmount(args.token, amount);
}
