# veTOPAZ Locks (`VotingEscrow`)

`VotingEscrow` at `0xe951aC65EFE86682311ab0d8995E7A58750c5eB3` mints **ERC721 NFTs** that represent a locked TOPAZ position. The voting power of a lock decays linearly to zero over its remaining life; max lock is **4 years**.

> **Protocol-wide veTOPAZ stats** (total locked TOPAZ, aggregate voting power) and **foundation veNFT lock details** (per-NFT `lockedAmount`, `votingPower`, `lockEnd`, `isPermanent`) are served by the Stats API at `/ve` — the foundation locks are fetched live from RPC server-side. Use the on-chain reads below for an arbitrary user's own locks. See `references/analytics-stats-api.md`.

## Key constants

| | |
|---|---|
| `MAXTIME` | 4 × 365 × 86,400 = 126,144,000 seconds (4 years) |
| `WEEK` | 7 × 86,400 = 604,800 seconds. All `unlockTime` values are floored to weekly boundaries. |
| `DepositType` | `DEPOSIT_FOR_TYPE`, `CREATE_LOCK_TYPE`, `INCREASE_LOCK_AMOUNT`, `INCREASE_UNLOCK_TIME` (internal) |
| `EscrowType` | `NORMAL` (regular), `LOCKED` (deposited into a managed NFT), `MANAGED` (the managed NFT itself) |

## Reading

```solidity
struct LockedBalance { int128 amount; uint256 end; bool isPermanent; }

function locked(uint256 _tokenId) external view returns (LockedBalance memory);
function balanceOfNFT(uint256 _tokenId) external view returns (uint256);       // current ve-balance (decayed)
function balanceOfNFTAt(uint256 _tokenId, uint256 _t) external view returns (uint256);  // ve-balance at timestamp
function totalSupply() external view returns (uint256);                         // total ve power across all locks now
function totalSupplyAt(uint256 _t) external view returns (uint256);
function ownerOf(uint256 _tokenId) external view returns (address);
function balanceOf(address _owner) external view returns (uint256);             // # of NFTs the address owns
function ownerToNFTokenIdList(address _owner, uint256 _index) external view returns (uint256);
function escrowType(uint256 _tokenId) external view returns (EscrowType);
function isApprovedOrOwner(address _spender, uint256 _tokenId) external view returns (bool);
```

`locked(tokenId).amount` is the locked TOPAZ in 18-dec wei. `locked(tokenId).end` is the unlock timestamp (Thursday 00:00 UTC week). For permanent locks, `isPermanent == true` and `end` is meaningless.

`balanceOfNFT(tokenId)` is the **current voting power** = `amount * (end - now) / MAXTIME` (linear decay), or `amount` if permanent.

## Creating a lock

```solidity
function createLock(uint256 _value, uint256 _lockDuration) external returns (uint256 tokenId);
function createLockFor(uint256 _value, uint256 _lockDuration, address _to) external returns (uint256 tokenId);
```

- `_value` is the TOPAZ amount in 18-dec wei (approve TOPAZ to `VotingEscrow` first).
- `_lockDuration` is **the duration from now in seconds**, capped at `MAXTIME`. The actual `unlockTime` is rounded **down** to the next Thursday 00:00 UTC. So "1 year" lock = `365 * 86400` seconds → actual unlock is at most that, rounded down by up to 7 days.

Common durations:

| Label | Seconds |
|---|---|
| 1 week | 604,800 |
| 1 month | 2,629,800 (≈ 30.44 days, but choose 4 × WEEK = 2,419,200 for clean rounding) |
| 6 months | 15,778,800 (or 26 × WEEK) |
| 1 year | 31,536,000 (or 52 × WEEK) |
| 2 years | 63,072,000 |
| 4 years (max) | 126,144,000 |

## Modifying a lock

```solidity
function increaseAmount(uint256 _tokenId, uint256 _value) external;   // add more TOPAZ; unlock time unchanged
function increaseUnlockTime(uint256 _tokenId, uint256 _lockDuration) external;  // extend; _lockDuration is new duration from now (must be > current remaining)
function withdraw(uint256 _tokenId) external;                           // only after end <= now; burns the NFT, returns TOPAZ
function depositFor(uint256 _tokenId, uint256 _value) external;          // anyone can top up someone else's lock
```

`increaseUnlockTime` requires the *new* unlock duration to be **strictly greater than the current remaining**. To shorten a lock, you cannot — wait for it to expire and create a new one.

After modifying voting-power (any of `increase*`), call `Voter.poke(tokenId)` to re-apply your existing vote allocation at the new balance — otherwise your votes remain weighted at the *old* balance until next epoch.

## Merge & split

```solidity
function merge(uint256 _from, uint256 _to) external;
//   _from's amount is added to _to.
//   _to's unlock time becomes max(_from.end, _to.end).
//   _from is burned.
//   Neither lock may be voting in the current epoch (call Voter.reset first if so).

function split(uint256 _from, uint256 _amount) external returns (uint256 tokenId1, uint256 tokenId2);
//   BURNS _from and creates TWO new NFTs:
//     tokenId1 = original amount - _amount    (i.e. the remainder)
//     tokenId2 = _amount                       (the split-off piece)
//   Both inherit _from's unlock time / permanent flag.
//   Requires canSplit[owner] (or canSplit[address(0)]) == true (governance-gated; off by default).
//   Reverts if _from has voted in the current epoch (voted[_from] == true).
//   Decode the new tokenIds from the `Split` event in the receipt.

function toggleSplit(address _account, bool _bool) external;   // governance only
```

`canSplit` is per-address (set by team). For most users it's false by default — check before assuming.

## Permanent locks

```solidity
function lockPermanent(uint256 _tokenId) external;     // never expires; voting power stays at amount (no decay)
function unlockPermanent(uint256 _tokenId) external;   // start a fresh 4-year decay clock
```

Permanent locks always vote with full `amount`, do not decay, and earn rebase at full weight. They cannot be `withdraw`n until `unlockPermanent` is called and then waited the remaining time (which starts at MAXTIME again).

Use cases: a DAO/treasury that intends to hold TOPAZ governance forever.

## Approvals / ERC721

`VotingEscrow` is a full ERC721. Standard:

```solidity
function approve(address _approved, uint256 _tokenId) external;
function setApprovalForAll(address _operator, bool _approved) external;
function transferFrom(address _from, address _to, uint256 _tokenId) external;
function safeTransferFrom(address _from, address _to, uint256 _tokenId, bytes memory _data) external;
```

A few veNFT-specific gotchas:

- **You cannot transfer a veNFT that is voting in the current epoch.** Call `Voter.reset(tokenId)` first (which is itself blocked by `onlyNewEpoch` if you already voted this week — so plan ahead by a week).
- A veNFT deposited into a managed NFT (`EscrowType.LOCKED`) is non-transferable and most ops on it are blocked. Use `VotingEscrow.withdrawManaged(tokenId)` to undo.

## Managed NFTs (advanced)

The managed-NFT system lets DAOs / treasuries pool many users' locks under one veNFT that votes on their behalf. Most users will never need this.

```solidity
function createManagedLockFor(address _to) external returns (uint256 _mTokenId);   // governance only
function depositManaged(uint256 _tokenId, uint256 _mTokenId) external;             // user opts in
function withdrawManaged(uint256 _tokenId) external;                                // user opts out
function setManagedState(uint256 _mTokenId, bool _state) external;                  // governance freezes a managed NFT
```

Two reward types accompany managed NFTs:

- `FreeManagedReward` — rewards distributed instantly when collected (e.g. arbitrage profits).
- `LockedManagedReward` — rewards are converted into more TOPAZ and locked into the managed NFT itself.

Out of scope for typical users; integrate against the `FreeManagedReward` and `LockedManagedReward` contracts on-chain (look up the per-managed-NFT addresses via `Voter`).

## Scripts

| Operation | Where |
|---|---|
| Read lock | `scripts/src/read/locks.ts` — `getLock(tokenId)`, `listUserLocks(owner)` |
| Create | `scripts/src/write/lock.ts` — `createLock({ amount, durationSec })` |
| Increase amount | `increaseAmount({ tokenId, amount })` |
| Extend duration | `increaseUnlockTime({ tokenId, newDurationSec })` |
| Merge | `mergeLocks({ from, to })` |
| Split | `splitLock({ tokenId, amount })` |
| Permanent on/off | `lockPermanent(tokenId)`, `unlockPermanent(tokenId)` |
| Withdraw | `withdrawLock(tokenId)` (expired only) |
| CLI | `yarn tsx src/cli/lock.ts create --amount 1000 --duration 4y` etc. |
