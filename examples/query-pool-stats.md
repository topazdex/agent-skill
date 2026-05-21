# Example — Query Pool Stats

**Goal:** Get a complete picture of a pool — TVL, 24h volume, fees, current price, emission APR, fee APR, and (if applicable) voting incentive density — using a mix of subgraph queries and on-chain reads.

The example uses the WBNB/USDT v3 pool at `tickSpacing=200`, but the script handles either v2 or v3 transparently.

## Pure CLI

```bash
yarn tsx src/cli/stats.ts pool 0xPOOL
```

Output (illustrative):

```
Pool 0xPOOL
  Type:           v3 (tickSpacing=200, fee=3000 pips = 0.30%)
  Tokens:         WBNB (18) / USDT (18)
  Current price:  584.20 USDT per WBNB (tick = -56210)
  Liquidity:      1.84e23 (units; see sqrtPriceX96 = 4.62e26)
  Staked liq:     7.50e22 (40.7% of total)
  Subgraph 24h:
    Volume:       $1,245,000
    Fees:         $3,735
  Subgraph 7d:
    Volume:       $9,820,000
    Fees:         $29,460
  TVL (subgraph): $4,200,000
  Gauge:
    Address:      0xGAUGE  (alive)
    rewardRate:   3.21e15 wei/sec (= 277.36 TOPAZ/day)
    periodFinish: 2026-05-22 00:00:00 UTC
    emissionAPR:  18.2%  (annualized, based on stakedTvl share)
  Fee APR:        2.6%  (annualized from 7d volume × feeRate / poolTVL)
  Voting:
    Pool weight:  1.42M ve  (3.41% of total)
    Bribes:       $0 this epoch
    Fees this epoch (so far): $1,820
    USD/1k vote:  $1.28
```

The script (`src/cli/stats.ts` calling `src/read/pools.ts:getPoolFullReport`) does:

## 1. Read pool basics on-chain

```ts
const pool = await detectPoolType(POOL);   // v2|v3 — checks PoolFactory.isPool / CLFactory.isPool

if (pool.type === "v2") {
  const [r0, r1, blockTs] = await pool.contract.getReserves();
  const [t0, t1] = await Promise.all([pool.contract.token0(), pool.contract.token1()]);
  const stable = await pool.contract.stable();
  const fee = await poolFactory.getFee(POOL, stable);  // bps/10000
  // TVL: convert r0/r1 to USD using token prices
} else {
  // v3
  const slot0 = await pool.contract.slot0();
  const liquidity = await pool.contract.liquidity();
  const stakedLiquidity = await pool.contract.stakedLiquidity();
  const fee = await pool.contract.fee();    // pips
  const tickSpacing = await pool.contract.tickSpacing();
}
```

## 2. Pull volume/fees from the subgraph

```ts
import { gql } from "graphql-request";

const TOP = gql`
  query Pool($pool: ID!) {
    pool(id: $pool) { id totalValueLockedUSD volumeUSD feesUSD tickSpacing fee }
    poolDayDatas(first: 7, orderBy: date, orderDirection: desc, where: { pool: $pool }) {
      date volumeUSD feesUSD tvlUSD
    }
  }
`;
const { pool, poolDayDatas } = await v3.request(TOP, { pool: POOL.toLowerCase() });

const last24h = poolDayDatas[0];
const last7d = poolDayDatas.reduce((s, d) => ({
  volumeUSD: Number(s.volumeUSD) + Number(d.volumeUSD),
  feesUSD:   Number(s.feesUSD)   + Number(d.feesUSD),
}), { volumeUSD: 0, feesUSD: 0 });
```

For v2 pools, the equivalent fields are `pair { reserveUSD volumeUSD feesUSD }` and `pairDayDatas { dailyVolumeUSD dailyFeesUSD }`.

## 3. Gauge state on-chain

```ts
const gauge = await voter.gauges(POOL);
if (gauge !== ethers.ZeroAddress) {
  const [alive, rewardRate, periodFinish, weight] = await Promise.all([
    voter.isAlive(gauge),
    gaugeContract.attach(gauge).rewardRate(),
    gaugeContract.attach(gauge).periodFinish(),
    voter.weights(POOL),
  ]);
  const feesVotingReward = await voter.gaugeToFees(gauge);
  const bribeVotingReward = await voter.gaugeToBribe(gauge);
  // → see analytics-onchain.md for full read pattern
}
```

## 4. Compute APRs

```ts
import { getTopazUsdPrice } from "./lib/pricing";

const topazUsd = await getTopazUsdPrice();
const SECONDS_PER_YEAR = 31_536_000;

const annualTopazWei = rewardRate * BigInt(SECONDS_PER_YEAR);
const annualUsd = Number(annualTopazWei) / 1e18 * topazUsd;

const stakedFraction = Number(stakedLiquidity) / Math.max(Number(liquidity), 1);
const stakedTvlUsd = Number(pool.totalValueLockedUSD) * stakedFraction;

const emissionApr = stakedTvlUsd > 0 ? (annualUsd / stakedTvlUsd) * 100 : 0;

const annualVolumeUsd = last7d.volumeUSD / 7 * 365;
const feeRate = Number(fee) / 1_000_000;     // v3 pips → decimal
const feeApr = (annualVolumeUsd * feeRate) / Number(pool.totalValueLockedUSD) * 100;
```

## 5. Voting incentives (bribes + fees) for current epoch

```ts
const epochStart = await voter.epochStart(BigInt(Math.floor(Date.now() / 1000)));
const bribe = rewardContract.attach(bribeVotingReward);
const len = await bribe.rewardsListLength();
const tokens = await Promise.all([...Array(Number(len))].map((_, i) => bribe.rewards(i)));
const amounts = await Promise.all(tokens.map(t => bribe.tokenRewardsPerEpoch(t, epochStart)));

let bribesUsd = 0;
for (let i = 0; i < tokens.length; i++) {
  if (amounts[i] === 0n) continue;
  const dec = await getDecimals(tokens[i]);
  const px  = await getUsdPrice(tokens[i]);
  bribesUsd += Number(amounts[i]) / 10**dec * px;
}

const usdPer1kVote = weight > 0n
  ? (bribesUsd / Number(weight)) * 1000 * 1e18    // scale
  : 0;
```

The same pattern with `feesVotingReward` gives this-epoch trading-fee accrual.

## Doing it for many pools at once

```bash
yarn tsx src/cli/stats.ts gauges --limit 50 --sort-by emissionApr
```

Iterates every gauge from `Voter.length()` / `Voter.pools(i)`, batches the reads with multicall, and prints a sortable table. Use `--csv` to emit machine-readable output for downstream analysis.

## Where the heuristics live

All of the logic above is in `scripts/src/read/pools.ts` and `scripts/src/read/apr.ts`. If you want different APR formulas (e.g. 1-day vs 7-day window, different price sources), edit those files. The CLI just composes them.
