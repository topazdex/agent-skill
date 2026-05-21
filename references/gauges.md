# Gauges — v2 LP + v3 CL position staking

A `Gauge` (v2) or `CLGauge` (v3) is the contract that distributes weekly TOPAZ emissions to liquidity providers of a specific pool. One gauge per pool, created by `Voter.createGauge(poolFactory, pool)` once per pool's lifetime.

Both gauge types support the same conceptual API: deposit, withdraw, getReward, earned. But:

- **v2 `Gauge`** stakes the pool's ERC20 LP token, takes a `uint256` amount.
- **v3 `CLGauge`** stakes the position NFT, takes a `uint256` tokenId. Emissions accrue only while the position is **in range**.

## Lookups

```ts
const gauge = await voter.gauges(pool);           // 0x0 if no gauge
const pool  = await voter.poolForGauge(gauge);    // reverse
const alive = await voter.isAlive(gauge);          // killed gauges receive 0 emissions
const isCl  = await gauge.isPool();                // both gauges return true once initialized
```

Distinguishing v2 vs v3 gauge from address alone: query `gauge.nft()` — for v2 this is a missing function (reverts) and for `CLGauge` it returns the `NonfungiblePositionManager` address. Or check `voter.poolForGauge(gauge)` then check whether the pool address is in `PoolFactory.isPool(addr)` (v2) or `CLFactory.isPool(addr)` (v3).

## v2 Gauge — function reference

ABI: `references/abis/Gauge.json`.

```solidity
function deposit(uint256 _amount) external;                     // stake on behalf of msg.sender
function deposit(uint256 _amount, address _recipient) external; // stake on behalf of someone else
function withdraw(uint256 _amount) external;                    // unstake; does NOT auto-claim rewards
function getReward(address _account) external;                  // permissionless; rewards sent to _account

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
