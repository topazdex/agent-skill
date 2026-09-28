# Auto Manage (ALM) vaults

Topaz **Auto Manage** is keeper-managed concentrated liquidity. A user picks a Slipstream (CL) pool, chooses Auto Manage instead of setting a price range, deposits both tokens in the vault's current ratio and receives a **transferable ERC-20 share** (18 decimals). The vault's strategy holds a MAIN Slipstream NFT around the live price plus a one-sided ALT NFT for leftover inventory, both staked in the pool's `CLGauge`. A Topaz-operated keeper re-ranges within on-chain bounds (optional swap capped and price-limited). Gauge emissions — **TOPAZ on BNB, xTOPAZ on spokes** — are forwarded to the vault and accrue to depositors as a **separate claimable balance**; they are never sold or compounded, so this is not an autocompounder. Withdrawals are always available in kind (token0 + token1 for your share of every position and idle balance) and never pause. Deposits are blocked while the vault or factory is paused, when the gauge is dead, or when the price sits outside the TWAP calm band.

Live on **BNB (56), Robinhood (4663) and Arc (5042)** as of 2026-09-28 (15 listed vaults: 11 / 2 / 2). No Auto Manage deployment exists on Base or Ethereum in this snapshot. Discover the inventory through the API on every request; counts and vault addresses are not configuration.

**Scope of this skill.** Everything below is read-side: discovery, vault metrics, a user's managed position. The skill does **not** yet carry Auto Manage ABIs, addresses or transaction builders. Do not invent deposit, withdraw or claim calldata; resolve the vault, strategy and factory from the API, verify them on-chain, and use the project's published ABI before building anything (see [Transactions](#transactions)).

## Discover vaults

All routes are public GETs under `https://api.topazdex.com/v1` returning `{ ok, data, meta }`; collections add `pageInfo.nextCursor`. Vault reads include a **live lens call** on each request (`meta.liveRead: true`) and are not cached; cursors expire after 24 hours.

| Route | Purpose |
|---|---|
| `GET /v1/auto-manage/vaults?listed=true&limit=200` | Listed vaults across every ALM chain. Filters: singular **`chainId`**, `pool`, `listed=true\|false`; `limit` 1..200 (default 100), `cursor`. Use `listed=true` for deposit discovery; unlisted vaults stay reachable for exits and claims. |
| `GET /v1/auto-manage/vaults/{chainId}/{vault}` | One vault: configuration, indexed metrics, `live` lens block. |
| `GET /v1/auto-manage/vaults/{chainId}/{vault}/history?interval=1h\|1d` | Buckets of principal, supply, `tvlUsd`, `principalPerShareUsd`, `apr`, `inRange`, `cumulativeInRangeSeconds`. `from` / `to` are Unix-second strings (inclusive / exclusive), default seven days, max 366 days; oldest first. |
| `GET /v1/auto-manage/vaults/{chainId}/{vault}/rebalances` | Keeper rebalances: old/new NFT ids, main and alt bounds, `tick`, swap amounts and direction, `keeper`, `transactionHash`. Oldest first. |
| `GET /v1/auto-manage/vaults/{chainId}/{vault}/activity` | Vault-wide `DEPOSIT`, `REDEEM`, `CLAIM`, `TRANSFER_OUT`, `TRANSFER_IN` actions with `account`, `sharesRaw`, `amount0Raw`, `amount1Raw`, `rewardRaw`. Not account-filtered; oldest first. |

Match a vault to a pool by `chainId` + `poolAddress` (the subgraph `pool` link may be null) and identify a vault by `chainId` + `id`. Account routes use plural `chainIds`; vault discovery uses singular `chainId`.

```bash
curl 'https://api.topazdex.com/v1/auto-manage/vaults?listed=true&limit=200'
curl 'https://api.topazdex.com/v1/auto-manage/vaults?chainId=4663&listed=true'
# example BNB vault (ZEC/WBNB) — discover the current list rather than reusing this address
curl 'https://api.topazdex.com/v1/auto-manage/vaults/56/0x1fa7b23ff3ebb0fee2450a9db1cce5bcf6d8e8c2'
curl 'https://api.topazdex.com/v1/auto-manage/vaults/56/0x1fa7b23ff3ebb0fee2450a9db1cce5bcf6d8e8c2/history?interval=1d&limit=30'
yarn tsx src/cli/stats.ts v1 /auto-manage/vaults --listed true --limit 200
```

## Reading a vault

| Field | Meaning |
|---|---|
| `id`, `chainId`, `factory`, `strategy`, `poolAddress`, `gauge`, `tickSpacing` | Identity and wiring. `strategy` holds the NFTs (`mainTokenId`, `altTokenId`). |
| `token0`, `token1`, `rewardToken` | `{ id, symbol, decimals }`; `symbol` / `decimals` are nullable. Read `rewardToken` rather than assuming TOPAZ — spokes emit xTOPAZ. |
| `listed`, `paused`, `globalPause`, `live.paused`, `live.depositsEnabled`, `live.isCalm` | Prefer the `live` block for status. `listed` alone does not establish deposit readiness; `depositsEnabled && isCalm && !paused && !globalPause` does. |
| `tvlUsd` | USD value of **principal only**; excludes pending rewards. Already part of the underlying pool's TVL — never add it on top when summing protocol totals. |
| `live.total0`, `live.total1`, `live.totalSupply`, `live.tick`, `live.inRange`, `live.block` | Lens read at `live.block`. Top-level `total0Raw` / `total1Raw` / `totalSupplyRaw` / `tick` / `inRange` are the indexed values. |
| `aprRealized7d` | Primary APR: annualized net checkpoint rewards against historical principal exposure over the trailing window. Null below 24 hours of complete priced coverage. Already net of the reward fee. |
| `aprEstimate` | Fallback: current gross emissions estimate before the reward fee. Label it **Estimated reward APR**. |
| `coverageHours` | Observed principal hours behind the realized figure; may be well under seven days. |
| `timeInRange7d`, `timeInRangeMethod` | Fraction of time in range from cumulative-counter differences (snapshot-weighted approximation). Null without enough anchors. |
| `mainTickLower`, `mainTickUpper`, `altTickLower`, `altTickUpper`, `lastRebalanceAt`, `rebalanceCount` | Indexed ranges and rebalance cadence. Re-read the lens when a transaction depends on the current range. |
| `rewardFeeBps`, `pendingRewardFeeBps`, `pendingRewardFeeAt` | Protocol fee on rewards in basis points (divide by 100 for a percent). |
| `holderCount`, `cumulativeGaugeRewards`, `cumulativeRewardsClaimed`, `cumulativeProtocolRewards`, `rewardPerShare` | Reward ledger totals (raw reward-token units). |
| `positionWidth`, `maxTickDeviation`, `twapInterval`, `minRebalanceInterval`, `maxSwapBps` | Strategy bounds the contract enforces on the keeper. |

**Formatting rules that differ from the rest of `/v1`:** ALM USD and APR fields (`tvlUsd`, `aprRealized7d`, `aprEstimate`, `timeInRange7d`, history `tvlUsd` / `principalPerShareUsd` / `apr`, and `valueUsd` / `earnedUsd` on managed positions) are **JSON numbers or null**, not decimal strings. APRs and time-in-range are **annual fractions**: `0.12` displays as `12%`. Token and share amounts remain integer strings; shares use 18 decimals, token amounts their own decimals. Use `BigInt` / decimal arithmetic for raw amounts.

```ts
const apr = vault.aprRealized7d ?? vault.aprEstimate;
const aprLabel = vault.aprRealized7d !== null ? "Realized reward APR" : "Estimated reward APR";
const aprText = apr === null ? "—" : `${(apr * 100).toFixed(2)}%`;
```

Reward APR is a claimable-token yield, not APY, and it excludes the pool's swap-fee APR — do not add the two. History `apr` is that bucket's emissions estimate, not `aprRealized7d`; `principalPerShareUsd` excludes rewards and is not a total-return series. A current or open bucket, or an old price gap, is null (`meta.reasons` may carry `alm_historical_prices_unavailable`, with `meta.complete: false`); preserve gaps rather than substituting zero or today's price. Custom time-in-range must use differences of `cumulativeInRangeSeconds`, never sums of `inRangeSeconds`. One share transfer produces both a `TRANSFER_OUT` and a `TRANSFER_IN` action for the same transaction and log — two perspectives, not two deposits.

## A user's Auto Manage position

`GET /v1/accounts/{address}/portfolio` and `…/liquidity-positions` include managed positions by default (`chainIds=all` or a comma list; they appear with `custody=all` and are excluded by `custody=wallet|gauge`). Filter to them with `positionKinds=managed-cl-position&custody=vault`. This is an **ERC-20 vault-share position**, not a user-owned CL NFT and not a managed veNFT.

```bash
curl 'https://api.topazdex.com/v1/accounts/0xWALLET/portfolio?chainIds=56,4663,5042&include=liquidity,summary'
curl 'https://api.topazdex.com/v1/accounts/0xWALLET/liquidity-positions?chainIds=all&positionKinds=managed-cl-position&custody=vault'
```

| Field (`data.liquidityPositions[]`, `kind: "managed-cl-position"`) | Use |
|---|---|
| `liquidityId` (`chainId:vault`), `chainId`, `vault`, `strategy`, `pool` | Stable key and links |
| `shares` | User's raw vault-share balance, 18 decimals |
| `amount0`, `amount1`, `valueUsd` | Live underlying principal at the lens block and its USD value (number / null). Resolve token metadata from the vault. |
| `rewardToken`, `earned`, `earnedUsd` | Reward token address, live claimable raw amount, USD (number / null). Decimals come from the vault's `rewardToken`. |
| `range { tickLower, tickUpper }`, `inRange` | Main range and status at the lens block |
| `custody` | Always `vault` |
| `costBasis { deposited0, deposited1, withdrawn0, withdrawn1, rewardsClaimed }` | Indexed raw lifetime totals — not USD profit/loss and not transfer-adjusted |

The account `summary` already adds managed `valueUsd` into `liquidityValueUsd` and `earnedUsd` into `pendingRewardsUsd`; do not add them again. Summary USD fields are decimal strings while the managed member's USD fields are numbers. Requesting only the `rewards` section does not load managed positions — read `earned` from the liquidity member. Keep a claim action available when `shares` is zero but `earned` is positive. Shares and earned amounts come from the lens on every request (also with `freshness=indexed`), but indexed ownership discovery can lag a just-confirmed deposit: after the user's own transaction, `POST /v1/accounts/{address}/invalidate` then one `fresh=true` read.

On BNB the `topaz-ve` subgraph indexes the same ledger for GraphQL: `almVaults`, `almAccounts` (`account`, `vault`, `sharesRaw`, `deposited0Raw`, `deposited1Raw`, `withdrawn0Raw`, `withdrawn1Raw`, `rewardsClaimedRaw`), `almActions`, `almRebalances`, `almRewardCheckpoints`, `almVaultHourData` / `almVaultDayData`. Spoke vault data comes only from `/v1`.

## Transactions

Deposits, withdrawals and reward claims are calls on the vault contract (with an optional single-token zap contract), payable by the share owner after ERC-20 approvals to the vault. **This skill has no Auto Manage ABI, address catalog or builder yet**, so treat any such request the way `SKILL.md` treats other uncatalogued writes: explain the flow, read the gates (`live.depositsEnabled`, `live.isCalm`, `paused`, `globalPause`, gauge alive), confirm the vault / strategy / factory addresses from the API and on-chain (`strategy`, `factory` on the vault), obtain the exact deployed ABI from the project's published artifacts, simulate from the payer, and only then produce calldata with the user's explicit authorization. Withdrawals return token0 + token1 in kind — never promise a single-token exit without the zap. Never send native value to a vault on Arc; Arc uses ERC20 USDC only.

## Pitfalls

- **Not an NFT, not a relay.** A managed position is vault shares. `NonfungiblePositionManager` reads and `CLGauge.stakedValues(user)` will not find it; the strategy, not the user, owns the NFTs. It is unrelated to managed veTOPAZ relays.
- **Rewards are separate.** `tvlUsd` / `valueUsd` never include pending rewards; `earned` never includes principal.
- **Fractions, not percents; numbers, not strings.** Convert before display and keep exhaustive `kind` switches updated for `managed-cl-position`.
- **`listed` ≠ depositable.** Check the `live` block. Deposits pause during volatility (`isCalm: false`); withdrawals do not.
- **Do not double count TVL.** Managed liquidity is already in the pool's `tvlUsd`.
- **Spoke rewards are xTOPAZ.** Read `rewardToken`; see [multichain.md](multichain.md) for xTOPAZ semantics.
