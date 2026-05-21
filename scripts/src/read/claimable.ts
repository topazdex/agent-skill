import { Contract } from "ethers";
import { ABIS } from "../lib/abis.js";
import { provider } from "../lib/client.js";
import { ADDR } from "../config/addresses.js";
import {
  v2StakedGaugesForAccount,
  v3StakedGaugesForAccount,
  getEarnedV2,
  getEarnedV3,
} from "./gauges.js";
import { getVote } from "./votes.js";
import { getDecimals, getSymbol } from "../lib/erc20.js";
import { getUsdPrice } from "../lib/pricing.js";

const voter = () => new Contract(ADDR.Voter, ABIS.Voter, provider());
const rewardC = (addr: string) => new Contract(addr, ABIS.Reward, provider());
const poolC = (addr: string) => new Contract(addr, ABIS.Pool, provider());
const rewardsDistributor = () =>
  new Contract(ADDR.RewardsDistributor, ABIS.RewardsDistributor, provider());

export interface GaugeClaimable {
  gauge: string;
  type: "v2" | "v3";
  topazWei: bigint;
  tokenId?: bigint;
}

export interface TokenClaim {
  token: string;
  symbol: string;
  decimals: number;
  amount: bigint;
  usd?: number;
}

export interface PoolFeeOrBribeClaim {
  pool: string;
  feesOrBribeContract: string;
  tokens: TokenClaim[];
}

export interface ClaimableSummary {
  tokenId: bigint;
  account: string;
  gaugeRewards: GaugeClaimable[];
  fees: PoolFeeOrBribeClaim[];
  bribes: PoolFeeOrBribeClaim[];
  rebaseTopazWei: bigint;
  totalTopazWei: bigint;
}

async function tokensInRewardContract(addr: string): Promise<string[]> {
  const c = rewardC(addr);
  const len: bigint = await c.rewardsListLength();
  return await Promise.all(
    Array.from({ length: Number(len) }, (_, i) => c.rewards(i) as Promise<string>)
  );
}

async function earnedForTokens(
  rewardContract: string,
  tokens: string[],
  tokenId: bigint
): Promise<bigint[]> {
  const c = rewardC(rewardContract);
  return await Promise.all(tokens.map((t) => c.earned(t, tokenId) as Promise<bigint>));
}

async function tokenClaimEntries(
  rewardContract: string,
  tokens: string[],
  tokenId: bigint,
  includeUsd: boolean
): Promise<TokenClaim[]> {
  const amounts = await earnedForTokens(rewardContract, tokens, tokenId);
  const entries: TokenClaim[] = [];
  for (let i = 0; i < tokens.length; i++) {
    if (amounts[i] === 0n) continue;
    const [decimals, symbol] = await Promise.all([
      getDecimals(tokens[i]),
      getSymbol(tokens[i]),
    ]);
    let usd: number | undefined;
    if (includeUsd) {
      const px = await getUsdPrice(tokens[i]).catch(() => 0);
      usd = (Number(amounts[i]) / 10 ** decimals) * px;
    }
    entries.push({ token: tokens[i], symbol, decimals, amount: amounts[i], usd });
  }
  return entries;
}

export async function claimableSummary(
  tokenId: bigint,
  account: string,
  options: { includeUsd?: boolean } = {}
): Promise<ClaimableSummary> {
  const includeUsd = options.includeUsd ?? false;
  const v = voter();

  // 1. Gauge rewards (emissions)
  const [v2Gauges, v3Gauges] = await Promise.all([
    v2StakedGaugesForAccount(account),
    v3StakedGaugesForAccount(account),
  ]);

  const gaugeRewards: GaugeClaimable[] = [];

  for (const g of v2Gauges) {
    const earned = await getEarnedV2(g, account);
    if (earned > 0n) gaugeRewards.push({ gauge: g, type: "v2", topazWei: earned });
  }
  for (const { gauge, tokenIds } of v3Gauges) {
    for (const id of tokenIds) {
      const earned = await getEarnedV3(gauge, account, id);
      if (earned > 0n)
        gaugeRewards.push({ gauge, type: "v3", topazWei: earned, tokenId: id });
    }
  }

  // 2. Fees & bribes for voted pools
  const vote = await getVote(tokenId);
  const votedPools = vote.allocations.map((a) => a.pool);

  const fees: PoolFeeOrBribeClaim[] = [];
  const bribes: PoolFeeOrBribeClaim[] = [];

  for (const pool of votedPools) {
    const gauge = await v.gauges(pool);
    if (!gauge || gauge === "0x0000000000000000000000000000000000000000") continue;
    const [feeR, bribeR] = await Promise.all([v.gaugeToFees(gauge), v.gaugeToBribe(gauge)]);

    // Fees: always the two pool tokens
    const pc = poolC(pool);
    const [t0, t1] = await Promise.all([pc.token0() as Promise<string>, pc.token1() as Promise<string>]);
    const feeEntries = await tokenClaimEntries(feeR, [t0, t1], tokenId, includeUsd);
    if (feeEntries.length > 0) fees.push({ pool, feesOrBribeContract: feeR, tokens: feeEntries });

    // Bribes: discover reward tokens dynamically
    const bribeTokens = await tokensInRewardContract(bribeR);
    const bribeEntries = await tokenClaimEntries(bribeR, bribeTokens, tokenId, includeUsd);
    if (bribeEntries.length > 0)
      bribes.push({ pool, feesOrBribeContract: bribeR, tokens: bribeEntries });
  }

  // 3. Rebase
  const rebaseTopazWei: bigint = await rewardsDistributor().claimable(tokenId);

  const totalTopazWei =
    rebaseTopazWei + gaugeRewards.reduce((s, g) => s + g.topazWei, 0n);

  return { tokenId, account, gaugeRewards, fees, bribes, rebaseTopazWei, totalTopazWei };
}
