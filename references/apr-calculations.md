# APR Calculations

> **Want a number, not the math?** The Stats API already serves every APR pre-computed and is the easiest, fastest, most accurate source: `/gauges` (emission/fee/bribe/total APR per gauge), `/pools` (denormalized `gaugeApr` + `feeApr`, sortable via `sort=gaugeApr`), and `/gauges/{addr}` (7-day APR history). Use the formulas below only when you need a custom window, a position-specific APR, or block-accurate state. See `references/analytics-stats-api.md`.

There are four APR types in the Topaz UI. The formulas here match the production frontend.

## Conventions

- All amounts are in **wei** (1e18 unless noted). Divide by `10^decimals` to get human-readable.
- `SECONDS_PER_YEAR = 365 * 24 * 60 * 60 = 31,536,000`. (We deliberately don't use 365.25 — match the frontend.)
- `topazPriceUsd` = USD value of 1 TOPAZ. Source: DexScreener (`scripts/src/lib/pricing.ts:getTopazUsdPrice`), or fall back to the v3 subgraph: `TOPAZ.derivedETH * Bundle.ethPriceUSD`.

## 1) Gauge emission APR

Both `poolApr()` and `positionApr()` check `gauge.periodFinish()` before computing emissions. If `periodFinish > 0` and `periodFinish <= now`, the reward period has expired and emission APR is 0. This matches the production frontend's `isRewardPeriodActive` guard.

### v2 pools (pool-wide average)

v2 pools have fungible LP tokens, so all stakers earn the same rate.

```
stakedShare    = gauge.totalSupply() / pool.totalSupply()
stakedTvlUsd   = poolTvlUsd * stakedShare
emissionApr    = (rewardRate / 1e18) * SECONDS_PER_YEAR * topazPriceUsd / stakedTvlUsd * 100
```

### v3 pools (position-specific formula)

In CL pools, a position's share of emissions depends on its liquidity relative to total staked liquidity, and its USD value depends on how concentrated the range is. The core formula:

```
APR = (positionLiquidity / stakedLiquidity) * (rewardRate / 1e18) * SECONDS_PER_YEAR * topazPriceUsd / positionValueUsd * 100
```

Where:
- `stakedLiquidity` = `pool.stakedLiquidity()` — total in-range staked liquidity from the pool contract
- `positionLiquidity` = the position's liquidity units
- `positionValueUsd` = the position's token amounts converted to USD

A tighter range puts more liquidity per dollar of capital, so the same dollar amount earns a higher share of emissions.

### Gauge listing APR (preset position)

For pool tables / gauge listings, `poolApr()` simulates a representative $1,000 deposit at a preset spread:

| Pair type | Spread |
|---|---|
| Volatile | ±3% |
| Stable–stable | ±0.1% |
| tickSpacing = 1 | ±0.05% |

The algorithm (matches the production frontend `computeV3GaugeApr`):

1. Convert spread percentage to tick bounds aligned to `tickSpacing`.
2. Compute token amounts for a reference liquidity (1e15) in that range.
3. Derive individual token USD prices from the pool's subgraph TVL data.
4. Scale the reference liquidity so the position is worth $1,000.
5. Apply the core formula with `stakedLiquidity + positionLiquidity` as denominator (dilution effect).

### Position-level APR

For an existing staked position, `positionApr(tokenId)` uses the position's actual liquidity and tick range:

```
positionAnnualUsd = (position.liquidity / pool.stakedLiquidity) * (rewardRate / 1e18) * SECONDS_PER_YEAR * topazPriceUsd
positionTvlUsd    = position's actual amount0 + amount1 in USD
positionApr       = positionAnnualUsd / positionTvlUsd * 100
```

No dilution adjustment (the position is already staked). Out-of-range positions return 0.

## 2) LP fee APR

Uses **realized** 7-day fees from the subgraph (not `volume * feeRate`), because Topaz v3 pools support `DynamicSwapFeeModule` and `CustomSwapFeeModule`.

```
feeApr = (fees7d * 52) / poolTvlUsd * 100
```

For a v3 position with a narrow range, the concentrated fee share is:

```
positionFeeApr = (annualFeesUsd * positionLiqShare) / positionTvlUsd * 100
```

where `positionLiqShare = positionLiquidity / poolLiquidity`.

## 3) Voting APR (bribes + fees per ve-weight)

For a veTOPAZ holder, voting for pool P in epoch E earns a share of:

- **Trading fees** of pool P during epoch E (flowed into `FeesVotingReward`).
- **Bribes** posted on P during epoch E (in `BribeVotingReward`).

```
feesUsdEpoch    = total trading fees that accrued to FeesVotingReward[P] in epoch E, in USD
bribesUsdEpoch  = sum over reward tokens of (tokenRewardsPerEpoch(t, E) / 10^decimals(t) * priceUsd(t))
poolWeightVe    = voter.weights(P) / 1e18

usdPerVoteEpoch = (feesUsdEpoch + bribesUsdEpoch) / poolWeightVe
```

Annualizing (one epoch = 1 week → 52 epochs/yr) and converting to a percentage APR relative to the cost of 1 veTOPAZ (≈ 1 TOPAZ at max lock):

```
votingApr = (usdPerVoteEpoch * 52) / topazPriceUsd * 100
```

A pool with high voting APR is **underbribed** — voting there yields more USD per unit ve-weight.

## 4) Rebase APR (anti-dilution for ve holders)

```
rebaseWeeklyTopaz = RewardsDistributor.tokensPerWeek(epochStart) / 1e18
totalVeSupply     = VotingEscrow.totalSupplyAt(epochStart) / 1e18

rebasePerVeAnnual = (rebaseWeeklyTopaz / totalVeSupply) * 52
rebaseApr         = rebasePerVeAnnual / 1 * 100     // assuming 1 TOPAZ ≈ 1 ve-unit at full lock
```

For a non-permanent lock, scale by `balanceOfNFT / amount`.

## Putting it together

A veTOPAZ holder who LPs and votes earns:

```
yourTotalApr = lpEmissionApr  (gauge stake)
             + lpFeeApr_unstaked  (only if unstaked LP — staked LP earns no fees)
             + (votingApr from bribes & fees of pools you voted for)
             + rebaseApr
```

**A staked position does not collect trading fees** — those flow to the gauge fee voter contract. Staked CL positions trade fee yield for emission yield + voting yield.

## Scripts

`scripts/src/read/apr.ts` exports:

```ts
// Pure helpers
computeEmissionApr(rewardRate, topazUsd, stakedTvlUsd, alive): number           // v2 pool-wide %
computePositionEmissionApr(posLiq, stakedLiq, rate, topazUsd, posValue, alive)   // v3 position-specific %
computeFeeApr(fees7d, tvlUsd): number
computeV3PresetApr(poolInfo, sgData, rewardRate, topazUsd, alive)                // v3 gauge listing preset
isRewardPeriodActive(periodFinish, nowSec?): boolean                             // periodFinish guard

// Async (on-chain + subgraph)
poolApr(pool): Promise<PoolAprBreakdown>                // v2: pool-wide, v3: preset-range
positionApr(tokenId): Promise<PositionAprBreakdown>     // individual staked position
votingApr(pool): Promise<number>
rebaseApr(): Promise<number>
```

CLI:

```
yarn tsx src/cli/stats.ts apr --pool 0xPOOL
```
