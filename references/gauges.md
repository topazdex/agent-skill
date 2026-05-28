# Gauges — v2 LP + v3 CL position staking

A `Gauge` (v2) or `CLGauge` (v3) is the contract that distributes weekly TOPAZ emissions to liquidity providers of a specific pool. One gauge per pool, created by `Voter.createGauge(poolFactory, pool)` once per pool's lifetime.

Both gauge types support the same conceptual API: deposit, withdraw, getReward, earned. But:

- **v2 `Gauge`** stakes the pool's ERC20 LP token, takes a `uint256` amount.
- **v3 `CLGauge`** stakes the position NFT, takes a `uint256` tokenId. Emissions accrue only while the position is **in range**.

> **Reading gauge analytics (APR, vote weights, staked TVL, rewards)?** Use the Stats API — `/gauges` lists every gauge with `emissionApr`/`feeApr`/`bribeApr`/`totalApr` and vote weights, `/gauges/{addr}` adds 7-day history, and `/gauges/{addr}/rewards` breaks down per-epoch reward tokens. The on-chain calls below are for staking/claiming and block-accurate state. See `references/analytics-stats-api.md`.

## Voter API — exact function names

The Topaz `Voter` contract (`0x2F80F810a114223AC69E34E84E735CaD515dAD67`) exposes these mappings. Use the function **names below verbatim** — they are the deployed selectors. There is no `gaugeForPool`, no `gaugesByPool`, no `getGauge` on this contract; those names belong to Velodrome / Aerodrome / other Solidly forks and calling them on Topaz reverts with no data.

```solidity
function gauges(address pool) external view returns (address gauge);    // pool → gauge (or 0x0)
function poolForGauge(address gauge) external view returns (address);   // gauge → pool
function isAlive(address gauge) external view returns (bool);           // false once killed
function gaugeToFees(address gauge) external view returns (address);    // FeesVotingReward
function gaugeToBribe(address gauge) external view returns (address);   // BribeVotingReward
function weights(address pool) external view returns (uint256);         // current epoch weight
function lastVoted(uint256 tokenId) external view returns (uint256);
function epochStart(uint256 timestamp) external view returns (uint256);
function isWhitelistedToken(address token) external view returns (bool);
```

The selector for `gauges(address)` is `0xb9a09fd5`. If your agent or library reports "function not found" or an empty-data revert when trying to look up a gauge, it is almost certainly calling `gaugeForPool(address)` (selector `0x2045be90`, which is **not deployed**) — fix the call site, do not "fall back" to assuming there is no gauge.

## Lookups — one pool at a time

When you already have a pool address:

```ts
const gauge = await voter.gauges(pool);           // 0x0 if no gauge created yet
const pool  = await voter.poolForGauge(gauge);    // reverse (returns 0x0 if not a gauge)
const alive = await voter.isAlive(gauge);          // killed gauges receive 0 emissions
const isCl  = await gauge.isPool();                // both gauge types return true once initialized
```

Distinguishing v2 vs v3 gauge from address alone: query `gauge.nft()` — for v2 this reverts (function not defined), for `CLGauge` it returns the `NonfungiblePositionManager` address. Or check `voter.poolForGauge(gauge)` and then `PoolFactory.isPool(addr)` (v2) vs `CLFactory.isPool(addr)` (v3).

## Lookups — every gauge for a token pair

**A pair can have multiple gauges.** Each (v2 stable + v2 volatile + v3 at each tick spacing) is a distinct pool, and each has at most one gauge. Stopping at the first `getPool` that returns `ZeroAddress` is a common foot-gun — it might just mean "no pool of that variant" rather than "no gauge for this pair".

The skill exposes a helper so you never have to roll the enumeration by hand:

```ts
import { listGaugesForPair, ADDR, TOKENS } from "./scripts/src";

const entries = await listGaugesForPair(TOKENS.WBNB.address, TOKENS.BTCB.address);
// entries: Array<{ kind, type, pool, gauge, alive }>
// kind: "v2-volatile" | "v2-stable" | "v3-ts-1" | "v3-ts-50" | "v3-ts-100" | "v3-ts-200" | "v3-ts-2000"
```

For WBNB/BTCB this returns two live gauges:

```
v2-volatile   v2  pool=0x35BF6c83…  gauge=0x14c93dDb…  ALIVE
v3-ts-50      v3  pool=0xfdA4eF28…  gauge=0xa9F8A05F…  ALIVE
```

Same behavior from the CLI:

```bash
yarn tsx src/cli/stats.ts gauges-for-pair WBNB BTCB
```

If the helper returns an empty array, the pair genuinely has zero gauges at this block — the enumeration covered every variant and none had a gauge. Don't second-guess; check whether either token is misspelled.

Doing the enumeration manually:

```ts
const variants: { kind: string; pool: Promise<string> }[] = [
  { kind: "v2-volatile", pool: poolFactory.getPool(a, b, false) },
  { kind: "v2-stable",   pool: poolFactory.getPool(a, b, true) },
  ...[1, 50, 100, 200, 2000].map((ts) => ({
    kind: `v3-ts-${ts}`,
    pool: clFactory.getPool(a, b, ts),
  })),
];
const pools = await Promise.all(variants.map((v) => v.pool));
const gauges = await Promise.all(
  pools.map((p) => (p === ZeroAddress ? ZeroAddress : voter.gauges(p))),
);
// then filter the variants whose gauge !== ZeroAddress
```

Argument order does not matter — the factory canonicalizes `(token0, token1)` for you. `getPool(WBNB, BTCB, false)` and `getPool(BTCB, WBNB, false)` return the same pool address.

## v2 Gauge — function reference

ABI: `references/abis/Gauge.json`.

```solidity
function deposit(uint256 _amount) external;                     // stake on behalf of msg.sender
function deposit(uint256 _amount, address _recipient) external; // stake on behalf of someone else
function withdraw(uint256 _amount) external;                    // unstake; does NOT auto-claim rewards
function getReward(address _account) external;                  // caller must be _account or Voter; rewards sent to _account

function earned(address _account) external view returns (uint256);
function balanceOf(address _account) external view returns (uint256);     // staked LP
function totalSupply() external view returns (uint256);                    // total staked LP
function rewardPerToken() external view returns (uint256);
function lastTimeRewardApplicable() external view returns (uint256);
function rewardRate() external view returns (uint256);                     // TOPAZ wei per second
function periodFinish() external view returns (uint256);                   // unix ts when current weekly stream ends
function left() external view returns (uint256);                           // undistributed TOPAZ remaining
function rewardToken() external view returns (address);                    // TOPAZ
function stakingToken() external view returns (address);                   // LP token (pool address)
function feesVotingReward() external view returns (address);               // same as voter.gaugeToFees(this)
```

Approvals: the LP token (which is the v2 `pool` address — it's its own ERC20) must be approved to the gauge before `deposit`.

## CLGauge — function reference

ABI: `references/abis/CLGauge.json`.

```solidity
function deposit(uint256 tokenId) external;       // NFT transferred from msg.sender to gauge
function withdraw(uint256 tokenId) external;      // NFT returned; also auto-claims rewards
function getReward(uint256 tokenId) external;     // only the original depositor of that tokenId
function getReward(address account) external;     // **voter-only** (require msg.sender == voter); not user-callable

function earned(address account, uint256 tokenId) external view returns (uint256);

function stakedValues(address depositor) external view returns (uint256[] memory tokenIds);
function stakedByIndex(address depositor, uint256 index) external view returns (uint256 tokenId);
function stakedContains(address depositor, uint256 tokenId) external view returns (bool);
function stakedLength(address depositor) external view returns (uint256);

function rewardRate() external view returns (uint256);
function periodFinish() external view returns (uint256);
function rewardRateByEpoch(uint256 epochTs) external view returns (uint256);
function left() external view returns (uint256);

function pool() external view returns (address);
function nft() external view returns (address);    // NonfungiblePositionManager
function feesVotingReward() external view returns (address);
function rewardToken() external view returns (address);
```

Approval: `NonfungiblePositionManager.approve(clGauge, tokenId)` or `setApprovalForAll(clGauge, true)` before `deposit(tokenId)`.

**In-range vs out-of-range** — the underlying `CLPool` tracks `stakedLiquidity` separately. Only staked positions whose `[tickLower, tickUpper]` brackets the current `slot0.tick` contribute. If your position moves out of range, accrual stops; once price re-enters, it resumes. The gauge rebalances internally during `_updateRewards`.

## Earning APR

Both gauge types broadcast emissions linearly across the 7-day epoch:

```
rewardsPerSecond  = rewardRate()                                  // wei TOPAZ/s
annualRewardsWei  = rewardRate() * 365 * 24 * 60 * 60
annualRewardsUsd  = annualRewardsWei * TOPAZ_USD_PRICE / 1e18

stakedTvlUsd  (v2)   = pool's reserve USD * (gauge.totalSupply() / pool.totalSupply())
stakedTvlUsd  (v3)   = pool's TVL USD * (pool.stakedLiquidity() / pool.liquidity())

emissionApr = annualRewardsUsd / stakedTvlUsd * 100
```

Note: at epoch flip, `rewardRate` resets based on the new `_notifyRewardAmount`. Using the snapshot `rewardRate` gives the APR *for the current epoch*. For a multi-week average, look at `rewardRateByEpoch(epochTs)` for prior epochs.

Full computation in `apr-calculations.md`.

**Permissions recap:** A keeper can push rewards to *anyone* for v2 only via `Voter.claimRewards([gauges])` (which proxies to `Gauge.getReward(msg.sender)`). Direct `Gauge.getReward(_account)` requires the caller to be `_account` or the Voter. For CL gauges there's no keeper-poke path — the depositor must call `getReward(uint256)` themselves per tokenId.

## Fees accruing to gauges, not LPs

Once a pool has a live gauge:

- v2 trading fees flow to `gauge.feesVotingReward()` (via `Gauge._claimFees` inside `notifyRewardAmount`), not to LPs.
- v3 trading fees on **staked** positions flow to `gauge.feesVotingReward()` (via `CLPool.gaugeFees()` + `_claimFees`). Fees on **unstaked** positions still go to the position owner via `NonfungiblePositionManager.collect()`.

This is the design that lets voters earn the fees by voting for that pool.

## Killed gauges

Governance can call `Voter.killGauge(gauge)` to set `isAlive = false`. Effects:

- No more emissions distributed to that gauge — all accruals are routed back to the Minter.
- Existing stakers can still `withdraw` and `getReward` for unclaimed rewards already in the gauge.
- New `deposit` may revert depending on the gauge implementation (see source).

Always check `Voter.isAlive(gauge)` before voting for or staking in a gauge.

## Scripts

| Operation | Where |
|---|---|
| Read gauge state | `scripts/src/read/gauges.ts` — `getGaugeState(pool)` returns `{ gauge, rewardRate, periodFinish, left, totalSupply, isAlive, feesVotingReward, bribeVotingReward, type: "v2"|"v3" }` |
| Earned | `getEarned(gauge, accountOrTokenId)` |
| Stake v2 LP | `scripts/src/write/gauge.ts` — `stakeLpV2({ pool, amount })` |
| Stake v3 NFT | `stakePositionV3({ tokenId })` |
| Unstake | `unstakeLpV2`, `unstakePositionV3` |
| Claim emissions | `claimGaugeRewardsV2({ gauges })`, `claimGaugeRewardsV3({ gauge, tokenIds })` |
| CLI | `yarn tsx src/cli/lp.ts stake --pool <addr> [--amount n | --tokenId n]` |
