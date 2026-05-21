# Voting (`Voter`)

`Voter` at `0x2F80F810a114223AC69E34E84E735CaD515dAD67` is the gauge controller. veTOPAZ holders allocate their NFT's voting power across gauges (= pools); allocations determine each pool's share of the weekly TOPAZ emission and entitle the voter to that pool's trading fees + any external bribes.

## Voting

```solidity
function vote(
    uint256 _tokenId,
    address[] calldata _poolVote,
    uint256[] calldata _weights
) external;
```

- `_poolVote` is an array of **pool** addresses (not gauge addresses). The Voter looks up `gauges[pool]` internally.
- `_weights` are relative numbers; their absolute scale doesn't matter — the Voter normalizes so the sum of `weights * (balanceOfNFT / sum(weights))` is allocated to each gauge.
- `_poolVote.length` must equal `_weights.length` and be ≤ `maxVotingNum` (currently **30**).
- Reverts:
  - `NotApprovedOrOwner` — caller isn't owner or operator of `_tokenId`.
  - `AlreadyVotedOrDeposited` — `lastVoted[tokenId]` falls in the **current** epoch.
  - `DistributeWindow` — first hour of epoch (Thu 00:00–01:00 UTC), reserved for keepers.
  - `NotWhitelistedNFT` — last hour of epoch (Wed 23:00 UTC → next Thu 00:00 UTC) and your NFT isn't in `isWhitelistedNFT`.
  - `GaugeDoesNotExist` / `GaugeNotAlive` — one of the pools has no gauge or the gauge is killed.
  - `ZeroBalance` — caller's veNFT has zero current voting power.
  - `UnequalLengths` — arrays mismatch.
  - `TooManyPools` — too many entries.

### Side effects

For each `(pool, weight)`:

1. Increases the pool's `weights[pool]` and global `totalWeight`.
2. Records `votes[tokenId][pool] = weight*share` and `usedWeights[tokenId] = totalShare`.
3. Calls `FeesVotingReward[gauge]._deposit(weightShare, tokenId)` — registers the voter for this epoch's trading-fee distribution.
4. Calls `BribeVotingReward[gauge]._deposit(weightShare, tokenId)` — registers the voter for this epoch's bribes.
5. Sets `lastVoted[tokenId] = block.timestamp`.

Once-per-epoch enforcement is via `onlyNewEpoch(tokenId)` which checks `lastVoted` against the current epoch.

## Resetting

```solidity
function reset(uint256 _tokenId) external;
```

Undoes the current epoch's vote: removes from each `weights[pool]`, decrements `totalWeight`, calls `FeesVotingReward._withdraw` and `BribeVotingReward._withdraw`. Like `vote`, also gated by `onlyNewEpoch` — you cannot reset a vote in the same epoch you placed it. (You **can** reset a vote from the previous epoch, on or after the next Thursday 00:00 UTC, in order to vote differently in the new epoch — but a new `vote` call already implicitly resets.)

## Poking

```solidity
function poke(uint256 _tokenId) external;
```

Re-applies the current vote allocation at the *current* veNFT balance. Use after `VotingEscrow.increaseAmount` or `increaseUnlockTime` to bring weight tracking up to date. **Not gated by `onlyNewEpoch`** — poke any number of times per epoch. The only restriction is that the first hour of an epoch (Thu 00:00–01:00 UTC) reverts with `DistributeWindow`, same as `vote`/`reset`.

## Reading the voting state

```solidity
function gauges(address pool) external view returns (address);          // 0x0 if none
function poolForGauge(address gauge) external view returns (address);
function isGauge(address gauge) external view returns (bool);
function isAlive(address gauge) external view returns (bool);
function gaugeToFees(address gauge) external view returns (address);    // FeesVotingReward
function gaugeToBribe(address gauge) external view returns (address);   // BribeVotingReward

function weights(address pool) external view returns (uint256);          // total veNFT weight on this pool
function totalWeight() external view returns (uint256);
function votes(uint256 tokenId, address pool) external view returns (uint256);  // this NFT's weight on pool
function poolVote(uint256 tokenId, uint256 index) external view returns (address);
function usedWeights(uint256 tokenId) external view returns (uint256);   // sum across all pools
function lastVoted(uint256 tokenId) external view returns (uint256);     // unix ts

function length() external view returns (uint256);                       // # of pools with gauges
function pools(uint256 index) external view returns (address);

function epochStart(uint256 ts) external pure returns (uint256);
function epochNext(uint256 ts) external pure returns (uint256);
function epochVoteStart(uint256 ts) external pure returns (uint256);
function epochVoteEnd(uint256 ts) external pure returns (uint256);
```

To enumerate all gauges for a UI/analytics agent:

```ts
const n = await voter.length();
const pools = await Promise.all([...Array(Number(n))].map((_, i) => voter.pools(i)));
const gauges = await Promise.all(pools.map(p => voter.gauges(p)));
const alive = await Promise.all(gauges.map(g => voter.isAlive(g)));
```

Use multicall to do this in one RPC call for any non-trivial gauge count.

## Creating a gauge

```solidity
function createGauge(address _poolFactory, address _pool) external returns (address gauge);
```

Permissionless (anyone can call) but with three conditions:

- `_poolFactory` is whitelisted in `FactoryRegistry`.
- `_pool` exists in `_poolFactory` (`PoolFactory.isPool(pool)` / `CLFactory.isPool(pool)`).
- Both tokens of `_pool` are whitelisted in `Voter.isWhitelistedToken` OR `isWhitelistedNFT` for managed.
- The pool does not already have a gauge.

`createGauge` deploys a `Gauge`/`CLGauge` clone, plus paired `FeesVotingReward` and `BribeVotingReward` clones, and wires them all into `gauges`/`poolForGauge`/`gaugeToFees`/`gaugeToBribe`.

## Distribution (keeper / public)

```solidity
function distribute(uint256 _start, uint256 _finish) external;   // process pools[start..finish]
function distribute(address[] memory _gauges) external;
function updateFor(address _gauge) external;                      // refresh accrued reward share for one gauge
function updateFor(address[] memory _gauges) external;
function updateFor(uint256 start, uint256 end) external;
```

Each `distribute` call triggers `Minter.updatePeriod()` if a new epoch has started, then for each gauge pushes its accrued share to `Gauge.notifyRewardAmount`, kicking off a 7-day reward stream. Anyone can call — keepers typically do shortly after Thursday 00:00 UTC.

## maxVotingNum

```solidity
function maxVotingNum() external view returns (uint256);     // currently 30
function setMaxVotingNum(uint256 _newMax) external;          // governance only
```

If you need to allocate across more than 30 pools, use multiple veNFTs.

## Recipe: standard vote flow

```ts
const lastVoted = Number(await voter.lastVoted(tokenId));
const nowEpoch = await voter.epochStart(BigInt(Math.floor(Date.now() / 1000)));
if (BigInt(lastVoted) >= nowEpoch) throw new Error("already voted this epoch");

const poolAddrs = ["0x...A", "0x...B", "0x...C"];
const weights   = [60n, 30n, 10n];   // relative; same as 6, 3, 1

// Validate every gauge exists and is alive
for (const p of poolAddrs) {
  const g = await voter.gauges(p);
  if (g === ethers.ZeroAddress) throw new Error(`no gauge for ${p}`);
  if (!(await voter.isAlive(g))) throw new Error(`gauge for ${p} is killed`);
}

await voter.vote(tokenId, poolAddrs, weights);
```

## Scripts

| Operation | Where |
|---|---|
| Read vote | `scripts/src/read/votes.ts` — `getVote(tokenId)` returns pools + weights + usedWeights + lastVoted |
| List gauges | `scripts/src/read/gauges.ts` — `listAllGauges()` |
| Vote | `scripts/src/write/vote.ts` — `vote({ tokenId, allocations: [{pool, weight}, ...] })` |
| Reset | `resetVote({ tokenId })` |
| Poke | `pokeVote({ tokenId })` |
| CLI | `yarn tsx src/cli/vote.ts cast --id 123 --pool 0xA --weight 60 --pool 0xB --weight 30 --pool 0xC --weight 10` |
