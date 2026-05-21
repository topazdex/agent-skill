# Analytics — On-chain reads

When subgraph data is stale, missing (gauges/votes/bribes/locks aren't indexed), or you need block-accurate state, read directly from the chain.

## Multicall

BSC has the canonical Multicall3 at `0xcA11bde05977b3631167028862bE2a173976CA11`. Use it to batch any of the read functions below into one RPC call. `scripts/src/lib/client.ts` exposes a multicall helper that wraps `ethers.Contract` calls.

## v2 Pool reads

```solidity
function getReserves() view returns (uint256 r0, uint256 r1, uint256 blockTimestampLast);
function token0() view returns (address);
function token1() view returns (address);
function stable() view returns (bool);
function metadata() view returns (uint256 dec0, uint256 dec1, uint256 r0, uint256 r1, bool st, address t0, address t1);
function getAmountOut(uint256 amountIn, address tokenIn) view returns (uint256);
function quote(address tokenIn, uint256 amountIn, uint256 granularity) view returns (uint256);  // TWAP-based
function totalSupply() view returns (uint256);                  // LP token total supply
function balanceOf(address user) view returns (uint256);        // LP balance
function fee() view returns (uint256);  // via PoolFactory.getFee — pool itself doesn't expose
```

Live pool USD TVL: `(r0 / 10^dec0) * price0_USD + (r1 / 10^dec1) * price1_USD`. Token USD prices come from either a price oracle, the v3 subgraph (`Token.derivedETH * Bundle.ethPriceUSD`), DexScreener, or via on-chain quote-against-a-USD-stable.

## v3 Pool reads (CLPool)

```solidity
function slot0() view returns (
  uint160 sqrtPriceX96,
  int24 tick,
  uint16 observationIndex,
  uint16 observationCardinality,
  uint16 observationCardinalityNext,
  bool unlocked
);
function liquidity() view returns (uint128);                       // current in-range liquidity
function stakedLiquidity() view returns (uint128);                 // currently staked in CLGauge
function maxLiquidityPerTick() view returns (uint128);
function fee() view returns (uint24);
function unstakedFee() view returns (uint24);
function tickSpacing() view returns (int24);
function token0() / token1() view returns (address);
function gauge() view returns (address);
function nft() view returns (address);
function feeGrowthGlobal0X128() view returns (uint256);
function feeGrowthGlobal1X128() view returns (uint256);
function ticks(int24 tick) view returns (
  uint128 liquidityGross, int128 liquidityNet, int128 stakedLiquidityNet,
  uint256 feeGrowthOutside0X128, uint256 feeGrowthOutside1X128,
  uint256 rewardGrowthOutsideX128, int56 tickCumulativeOutside,
  uint160 secondsPerLiquidityOutsideX128, uint32 secondsOutside, bool initialized
);
function tickBitmap(int16 wordPosition) view returns (uint256);
function positions(bytes32 key) view returns (
  uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128,
  uint128 tokensOwed0, uint128 tokensOwed1
);
// reward growth (CL gauge emissions)
function rewardGrowthGlobalX128() view returns (uint256);
function rewardRate() view returns (uint256);
function periodFinish() view returns (uint256);
function rewardReserve() view returns (uint256);
function getRewardGrowthInside(int24 tickLower, int24 tickUpper, uint256 _global) view returns (uint256);
function observe(uint32[] secondsAgos) view returns (int56[] tickCumulatives, uint160[] secondsPerLiquidityCumulativeX128s);
```

Current price (token1/token0 in raw units): `(sqrtPriceX96 / 2^96)^2`. Multiply by `10^dec0 / 10^dec1` to get human-readable.

Live pool TVL is **not stored** — you compute it from active ticks. The simplest accurate approach:

```ts
const tvl0 = await sugarHelper.principal0AtRange(pool, lowerTick, upperTick, sqrtPriceX96);
// or use TickLens.getPopulatedTicksInWord + iterate
```

For dashboarding, prefer the v3 subgraph's `Pool.totalValueLockedUSD` — it's already computed and good enough.

## VotingEscrow reads

```solidity
function balanceOfNFT(uint256 tokenId) view returns (uint256);
function locked(uint256 tokenId) view returns (LockedBalance);   // amount, end, isPermanent
function totalSupply() view returns (uint256);                    // current total ve power
function totalSupplyAt(uint256 t) view returns (uint256);
function ownerOf(uint256 tokenId) view returns (address);
function balanceOf(address owner) view returns (uint256);
function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256);
function escrowType(uint256 tokenId) view returns (uint8);
```

## Voter reads (vote weights, gauge map, epoch)

```solidity
function gauges(address pool) view returns (address);
function poolForGauge(address gauge) view returns (address);
function isAlive(address gauge) view returns (bool);
function gaugeToFees(address gauge) view returns (address);
function gaugeToBribe(address gauge) view returns (address);
function weights(address pool) view returns (uint256);
function totalWeight() view returns (uint256);
function votes(uint256 tokenId, address pool) view returns (uint256);
function poolVote(uint256 tokenId, uint256 index) view returns (address);
function usedWeights(uint256 tokenId) view returns (uint256);
function lastVoted(uint256 tokenId) view returns (uint256);
function length() view returns (uint256);
function pools(uint256 index) view returns (address);
function epochStart(uint256 ts) pure returns (uint256);
function epochNext(uint256 ts) pure returns (uint256);
function isWhitelistedToken(address token) view returns (bool);
function isWhitelistedNFT(uint256 tokenId) view returns (bool);
```

## Gauge reads

v2 `Gauge`:

```solidity
function balanceOf(address) view returns (uint256);     // staked LP
function totalSupply() view returns (uint256);           // total staked
function rewardRate() view returns (uint256);
function periodFinish() view returns (uint256);
function left() view returns (uint256);                  // undistributed TOPAZ
function earned(address) view returns (uint256);
function rewardToken() view returns (address);           // = TOPAZ
function stakingToken() view returns (address);          // = pool
function feesVotingReward() view returns (address);
```

v3 `CLGauge` (in addition to similar globals):

```solidity
function stakedValues(address) view returns (uint256[]);
function stakedByIndex(address, uint256) view returns (uint256);
function stakedLength(address) view returns (uint256);
function stakedContains(address, uint256) view returns (bool);
function earned(address account, uint256 tokenId) view returns (uint256);
function rewardRateByEpoch(uint256 epochTs) view returns (uint256);
function rewardGrowthInside(uint256 tokenId) view returns (uint256);
function lastUpdateTime(uint256 tokenId) view returns (uint256);
```

## Reward (Bribe / Fees) reads

```solidity
function earned(address token, uint256 tokenId) view returns (uint256);
function rewardsListLength() view returns (uint256);
function rewards(uint256 index) view returns (address);
function isReward(address token) view returns (bool);
function tokenRewardsPerEpoch(address token, uint256 epoch) view returns (uint256);
function lastEarn(address token, uint256 tokenId) view returns (uint256);
function balanceOf(uint256 tokenId) view returns (uint256);
function totalSupply() view returns (uint256);
function numCheckpoints(uint256 tokenId) view returns (uint256);
function supplyNumCheckpoints() view returns (uint256);
function checkpoints(uint256 tokenId, uint256 index) view returns ((uint256 timestamp, uint256 balance));
function getPriorBalanceIndex(uint256 tokenId, uint256 timestamp) view returns (uint256);
function getPriorSupplyIndex(uint256 timestamp) view returns (uint256);
```

## Minter / RewardsDistributor reads

```solidity
// Minter
function weekly() view returns (uint256);
function activePeriod() view returns (uint256);
function tailEmissionRate() view returns (uint256);
function teamRate() view returns (uint256);
function epochCount() view returns (uint256);

// RewardsDistributor
function claimable(uint256 tokenId) view returns (uint256);    // current rebase owed
function lastTokenTime() view returns (uint256);
function startTime() view returns (uint256);
function tokensPerWeek(uint256 weekTs) view returns (uint256);
```

## Helpful aggregation patterns

### "Show me a complete picture of pool P"

```ts
const calls = [
  pool.token0(), pool.token1(),
  v3 ? pool.slot0() : pool.getReserves(),
  v3 ? pool.fee() : poolFactory.getFee(pool.address, await pool.stable()),
  v3 ? pool.liquidity() : pool.totalSupply(),
  voter.gauges(pool.address),
];
const [t0, t1, state, fee, liq, gauge] = await Promise.all(calls);
const [reward, alive, feeR, bribeR, weight] = await Promise.all([
  gauge !== ZeroAddress ? gaugeContract(gauge).rewardRate() : 0n,
  gauge !== ZeroAddress ? voter.isAlive(gauge) : false,
  gauge !== ZeroAddress ? voter.gaugeToFees(gauge) : ZeroAddress,
  gauge !== ZeroAddress ? voter.gaugeToBribe(gauge) : ZeroAddress,
  voter.weights(pool.address),
]);
```

`scripts/src/read/pools.ts:getPool(address)` runs this for either v2 or v3 (auto-detects).

### "Show me a complete picture of a veNFT lock"

```ts
const [lock, balance, owner, lastVoted, usedWeights] = await Promise.all([
  ve.locked(tokenId),
  ve.balanceOfNFT(tokenId),
  ve.ownerOf(tokenId),
  voter.lastVoted(tokenId),
  voter.usedWeights(tokenId),
]);
// Then enumerate votes:
const allPools = await listAllPools();
const myVotes = await multicall(allPools.map(p => voter.votes(tokenId, p)));
const activeVotes = allPools
  .map((p, i) => ({ pool: p, weight: myVotes[i] }))
  .filter(v => v.weight > 0n);
```

`scripts/src/read/locks.ts:getLockFull(tokenId)` does this.

### "What's my total claimable across all streams?"

See the recipe in `references/rewards-claiming.md` and `scripts/src/read/claimable.ts:claimableSummary(tokenId, account)`.
