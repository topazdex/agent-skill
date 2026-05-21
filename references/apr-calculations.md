# APR Calculations

There are three APR figures in the Topaz UI; we compute them the same way the frontend does.

## Conventions

- All amounts are in **wei** (1e18 unless noted). Divide by `10^decimals` to get human-readable.
- `SECONDS_PER_YEAR = 365 * 24 * 60 * 60 = 31,536,000`. (We deliberately don't use 365.25 — match the frontend.)
- `topazPriceUsd` = USD value of 1 TOPAZ. Source: DexScreener (`scripts/src/lib/pricing.ts:getTopazUsdPrice`), or fall back to the v3 subgraph: `TOPAZ.derivedETH * Bundle.ethPriceUSD`.
- `stakedTvlUsd` = USD value of the stake **currently earning emissions**. For v2 this is the staked LP's underlying value; for v3 it's the *staked, in-range* liquidity's underlying value.

## 1) Gauge emission APR

```
annualEmissionsTopazWei = rewardRate * SECONDS_PER_YEAR              (TOPAZ wei)
annualEmissionsUsd      = (annualEmissionsTopazWei / 1e18) * topazPriceUsd

emissionApr = annualEmissionsUsd / stakedTvlUsd * 100
```

### v2 staked TVL

```ts
const poolTvlUsd = (r0 / 10**dec0) * price0Usd + (r1 / 10**dec1) * price1Usd;
const stakedShare = Number(gauge.totalSupply()) / Number(pool.totalSupply());   // LP token totalSupply
const stakedTvlUsd = poolTvlUsd * stakedShare;
```

### v3 staked TVL

```ts
const poolTvlUsd = await subgraphPoolTvlUsd(pool);    // from v3 subgraph
const liquidity = Number(pool.liquidity());
const stakedLiquidity = Number(pool.stakedLiquidity());
const stakedTvlUsd = liquidity > 0
  ? poolTvlUsd * (stakedLiquidity / liquidity)
  : 0;
```

> **Caveat for v3**: this formula assumes staked liquidity has the same distribution across ticks as total liquidity. In practice, in-range staked positions tend to be tighter — so the *actual* emission APR for a tight-range position is **higher** than this average. The frontend exposes a "concentrated APR" multiplier; the simple version above is the conservative pool-wide average.

### Concentration multiplier (v3)

For a position spanning ticks `[tickLower, tickUpper]`, the share of pool liquidity it represents is:

```
positionLiquidityShare = position.liquidity / pool.liquidity     // only meaningful when in-range
```

But the emission per unit liquidity is `pool.rewardRate / pool.stakedLiquidity` (when in range). So position's annual TOPAZ:

```
positionAnnualTopazWei = pool.rewardRate * SECONDS_PER_YEAR * (position.liquidity / pool.stakedLiquidity)
positionAnnualUsd      = (positionAnnualTopazWei / 1e18) * topazPriceUsd

positionTvlUsd         = position's actual amount0 + amount1 in USD (from SugarHelper.principal or local math)
positionApr            = positionAnnualUsd / positionTvlUsd * 100
```

This is what makes tight ranges so attractive: less `positionTvlUsd` per unit `position.liquidity`. See `scripts/src/read/apr.ts:positionApr(tokenId)`.

## 2) LP fee APR

Approximate from recent volume:

```
days = 1 | 7 | 30                                    // averaging window
volumeUsdInWindow = subgraph PoolDayData / PairDayData sum(volumeUSD) for last `days`
avgDailyVolumeUsd = volumeUsdInWindow / days
annualVolumeUsd   = avgDailyVolumeUsd * 365

feeRate = effective swap fee in decimal (e.g. 0.003 for 30 bps).
  v2: PoolFactory.getFee(pool, stable) / 10000      (units: bps/10? — actually fee / 10000 = bps; e.g. 30 = 0.30%; so /10000 = 0.003 ✓)
  v3: CLFactory.getSwapFee(pool) / 1_000_000        (units: pips; e.g. 3000 pips = 0.30%; /1e6 = 0.003 ✓)

annualFeesUsd = annualVolumeUsd * feeRate

feeApr = annualFeesUsd / poolTvlUsd * 100
```

For a v3 position with a **narrow** range, fees are concentrated similarly to emissions — the **in-range fee share** for a position is roughly `position.liquidity / pool.liquidity` (when in-range), so `positionFeeApr ≈ feeApr * (poolTvlUsd / positionTvlUsd) * (positionLiquidity / poolLiquidity)`. Simpler: `positionFeeApr ≈ (annualFeesUsd * positionLiqShare) / positionTvlUsd * 100`, with `positionLiqShare = positionLiquidity / poolLiquidity`.

## 3) Voting APR (bribes + fees per ve-weight)

For a veTOPAZ holder, voting for pool P in epoch E earns a share of:

- **Trading fees** of pool P during epoch E (flowed into `FeesVotingReward`).
- **Bribes** posted on P during epoch E (in `BribeVotingReward`).

The per-vote USD earned in epoch E is:

```
feesUsdEpoch    = total trading fees that accrued to FeesVotingReward[P] in epoch E, in USD
bribesUsdEpoch  = sum over reward tokens of (BribeVotingReward[P].tokenRewardsPerEpoch(t, E) * priceUsd(t))
poolWeightEpoch = supply at epoch E from BribeVotingReward.supplyCheckpoints / FeesVotingReward.supplyCheckpoints
                  (approximate with current voter.weights(P) for the "this-epoch-so-far" view)

usdPerVoteEpoch = (feesUsdEpoch + bribesUsdEpoch) / poolWeightEpoch
```

Annualizing (one epoch = 1 week → 52 epochs/yr):

```
usdPerVoteAnnualized = usdPerVoteEpoch * 52
```

The veTOPAZ holder's effective APR depends on their lock duration (since `balanceOfNFT` decays). A simple representative figure:

```
yourAnnualUsd = usdPerVoteAnnualized * yourCurrentBalanceOfNFT
yourLockedTopaz = locked(tokenId).amount
yourTopazInUsd = (yourLockedTopaz / 1e18) * topazPriceUsd

votingApr = yourAnnualUsd / yourTopazInUsd * 100
```

A pool with high `usdPerVoteAnnualized / votedWeight` ratio relative to others is **underbribed** — voting there yields more USD per unit ve-weight. Voters maximize income by directing weight at the highest such ratios.

## 4) Rebase APR (anti-dilution for ve holders)

```
rebaseWeeklyTopaz = RewardsDistributor.tokensPerWeek(epochStart) / 1e18
totalVeSupply     = VotingEscrow.totalSupplyAt(epochStart) / 1e18

rebasePerVeAnnual = (rebaseWeeklyTopaz / totalVeSupply) * 52        // TOPAZ per ve-unit per year
rebaseApr         = rebasePerVeAnnual / 1 * 100                     // assuming 1 TOPAZ ≈ 1 ve-unit at full lock
```

For a non-permanent lock, scale by `balanceOfNFT / amount`. For a permanent lock that's the full APR.

## Putting it together

A veTOPAZ holder who LPs and votes earns:

```
yourTotalApr = lpEmissionApr  (gauge stake)
             + lpFeeApr_unstaked  (only if unstaked LP — staked LP earns no fees)
             + (votingApr from bribes & fees of pools you voted for)
             + rebaseApr
```

A v3 LP who stakes a narrow in-range position effectively earns `positionApr (emissions) + positionFeeApr (only if unstaked)`. **A staked position does not collect trading fees** — those flow to the gauge fee voter contract. So staked CL positions trade fee yield for emission yield + voting yield (if the LP also has a veNFT and votes for the pool).

## Scripts

`scripts/src/read/apr.ts`:

```ts
gaugeEmissionApr(pool: Address): Promise<number>;          // %
lpFeeApr(pool: Address, days: 1|7|30 = 7): Promise<number>;
positionApr(tokenId: bigint): Promise<{ emissionApr: number; feeApr: number; totalApr: number }>;
votingApr(pool: Address): Promise<number>;
rebaseApr(): Promise<number>;
poolApr(pool: Address): Promise<{ emission: number; fee: number; voting: number }>;
```

CLI:

```
yarn tsx src/cli/stats.ts apr --pool 0xPOOL [--position 1234]
```
