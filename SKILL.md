---
name: topaz
description: This skill should be used whenever the user asks to do anything on Topaz, Topaz Dex, or veTOPAZ — a ve(3,3) DEX on BNB Chain (BSC) mainnet that combines Solidly-style v2 pools (volatile and stable) with Uniswap-v3-style concentrated liquidity (Slipstream). Trigger on requests like "swap on topaz", "swap WBNB for USDT on topaz", "what's the best price for X on topaz", "add liquidity on topaz", "create a concentrated liquidity position", "mint a CL position", "stake my LP / position in a topaz gauge", "claim my topaz rewards", "lock TOPAZ", "extend my veTOPAZ", "vote with veTOPAZ", "reset my vote", "claim bribes / claim fees / claim rebase", "deposit a bribe / incentive for a topaz pool", "what's the APR on the X/Y gauge", "show me topaz pool stats / TVL / volume", and any query about the TOPAZ token, veTOPAZ NFT locks, voter, gauges, bribes, or the Topaz v2/v3 subgraphs.
---

# Topaz Dex Skill

Topaz is a ve(3,3) DEX on **BNB Chain Mainnet (chain id 56)** combining:

- **v2** — Solidly-style pools: volatile (xy=k) and stable (x³y+xy³=k). Liquidity is an ERC20 LP token; stakable in a v2 `Gauge` for TOPAZ emissions.
- **v3 / Slipstream** — Uniswap-v3-style concentrated liquidity. Positions are ERC721 NFTs minted via the `NonfungiblePositionManager`; stakable in a `CLGauge` for TOPAZ emissions (only in-range liquidity earns).
- **ve(3,3) layer** — Shared `Voter`, `VotingEscrow` (veTOPAZ NFT, max lock 4 years), `Minter`, `RewardsDistributor` across both v2 and v3 gauges.

Read `README.md` for the architecture diagram and full address tables. Use this file plus the references and examples below for everything else.

## Mental model in one screen

- **Epoch = 1 week, starts Thursday 00:00 UTC.** Voting window: Thu 01:00 UTC of the current epoch through Thu 23:00 UTC of the same week (you can re-vote only after a new epoch begins). Emissions distribute at epoch flip.
- **Two pool types per pair, three pool types total per pair in practice**:
  - v2 volatile pool, identified by `(tokenA, tokenB, stable=false)` via `PoolFactory.getPool`
  - v2 stable pool, `(tokenA, tokenB, stable=true)` via `PoolFactory.getPool`
  - any number of v3 CL pools, one per `tickSpacing`, via `CLFactory.getPool(tokenA, tokenB, tickSpacing)`
- **Fees**: v2 fee in basis-points-style (`fee / 10000` = bps, e.g. 5 = 0.05% stable default, 30 = 0.30% volatile default). v3 fee in **pips** = 1e-6 (e.g. 100 pips = 0.01%). Tick spacing → default fee map (v3): `1→100`, `50→500`, `100→1000`, `200→3000`, `2000→10000`.
- **Gauges** are 1:1 with pools (after `Voter.createGauge`). For each gauge `Voter.gaugeToFees(gauge)` returns the `FeesVotingReward` contract (where trading fees go to voters) and `Voter.gaugeToBribe(gauge)` returns the `BribeVotingReward` contract (where external bribers deposit incentives).
- **Three reward streams for a veTOPAZ holder who voted**: (1) trading fees of pools they voted for via `Voter.claimFees(...)`; (2) bribes posted on those pools via `Voter.claimBribes(...)`; (3) weekly rebase regardless of voting via `RewardsDistributor.claim(tokenId)`. LP stakers separately earn TOPAZ emissions from the gauge via `Gauge.getReward(account)` or `CLGauge.getReward(tokenId)`.

## Address quick reference

Core contracts (BNB Mainnet):

| | |
|---|---|
| `TOPAZ` | `0xdf002282C1474C9592780618Adda7EaA99998Abd` |
| `WBNB` | `0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c` |
| `Voter` | `0x2F80F810a114223AC69E34E84E735CaD515dAD67` |
| `VotingEscrow` (veTOPAZ NFT) | `0xe951aC65EFE86682311ab0d8995E7A58750c5eB3` |
| `Minter` | `0x606794d37991A426a189fD9FA8664D339A77f8ae` |
| `RewardsDistributor` | `0x85e15e7Ad4f20d5ca3A1104B1c2CcE72f5F683dB` |
| `PoolFactory` (v2) | `0x65E6cD0eF5D3467030103cf3d433034E570b5784` |
| `Router` (v2) | `0x1E98c8226e7d452e1888e3d3d2F929346321c6c3` |
| `CLFactory` (v3) | `0x73DC984D9490286E735548f61dfCCec67Af82ed9` |
| `SwapRouter` (v3) | `0x9B63CA87919617d042A89663492dB3c8686e0CaE` |
| `QuoterV2` (v3) | `0x7CCB89bB9BdEF68688F39a2c22d249fD1D9759f1` |
| `NonfungiblePositionManager` (v3) | `0xf8c30c3C362941C23025f2eA30B066A73C982f63` |
| `MixedRouteQuoterV1` (v2+v3) | `0x47c3570b90e7234FE695Ad5F1bE69E21fe1a9ee2` |
| `GaugeFactory` (v2) | `0xFc080D1EcD7c332022cebf942AEb62d5E1d4Cb08` |
| `CLGaugeFactory` (v3) | `0xeD2ED418f104E18B1D11eA5C26236A1caa675839` |
| `VotingRewardsFactory` | `0x4C303f7af7b8b05226440e4e12FF9a82F513716c` |
| `FactoryRegistry` | `0x268d1C8a538Ecf6628838C11d581e1EABD13D6A4` |

Full list (incl. governance/airdrop/fee modules): `references/addresses.md` or `README.md`.

Subgraphs (Goldsky):
- v2: `https://api.goldsky.com/api/public/project_cmgzljqwl006c5np2gnao4li4/subgraphs/topaz-v2/v0.0.3/gn`
- v3: `https://api.goldsky.com/api/public/project_cmgzljqwl006c5np2gnao4li4/subgraphs/topaz-v3/v0.0.1/gn`

## Where to look next

| Task | File |
|---|---|
| Swap on a v2 pool (volatile or stable) | `references/swapping-v2.md` |
| Swap on a v3 CL pool (single or multi-hop) | `references/swapping-v3.md` |
| Quote a cross-stack route (v2 ↔ v3) | `references/swapping-mixed.md` |
| Add / remove v2 liquidity | `references/liquidity-v2.md` |
| Mint, modify, collect, or burn a v3 position | `references/liquidity-v3.md` |
| Stake/unstake in a gauge, claim emissions | `references/gauges.md` |
| Create / extend / withdraw / merge / split a veTOPAZ lock | `references/ve-locks.md` |
| Vote, reset, poke; pool↔gauge lookups | `references/voting.md` |
| Claim gauge emissions, fees, bribes, rebase | `references/rewards-claiming.md` |
| Deposit a bribe / incentive on a pool | `references/bribes-deposit.md` |
| Query the subgraphs (entities + example queries) | `references/analytics-subgraph.md` |
| On-chain reads for live stats | `references/analytics-onchain.md` |
| Compute gauge / fee / voting APRs | `references/apr-calculations.md` |
| Epoch boundaries, voting window, distribute() | `references/epoch-timing.md` |
| Common mistakes & gotchas | `references/pitfalls.md` |
| Mainnet addresses (canonical) | `references/addresses.md` |
| WBNB + common tokens with decimals | `references/tokens.md` |

Worked walkthroughs (each pairs a scenario with the exact CLI/script call):

- `examples/swap-v2-volatile.md`, `examples/swap-v2-stable.md`
- `examples/swap-v3-single-hop.md`, `examples/swap-mixed-route.md`
- `examples/add-liquidity-v2.md`, `examples/mint-v3-position.md`
- `examples/stake-position-cl-gauge.md`
- `examples/create-and-vote-with-lock.md`
- `examples/claim-all-rewards.md`, `examples/deposit-bribe.md`
- `examples/query-pool-stats.md`

## Running anything

All write-capable code lives under `scripts/`. Common shape:

```bash
cd /home/aaron/topaz/topaz-skill/scripts
cp .env.example .env   # set BSC_RPC_URL; PRIVATE_KEY only needed for writes
yarn install
yarn tsx src/cli/<cmd>.ts <args>...
```

CLIs available: `stats`, `swap`, `lp`, `lock`, `vote`, `claim`, `bribe`. Each is a thin wrapper over the corresponding module in `src/read/` or `src/write/` — for one-off scripts, import those library functions directly. ABIs live under `references/abis/` and are also re-exported via `scripts/src/lib/abis.ts`.

## Operating principles for the agent

- **Never write before reading.** Always quote (`Router.getAmountsOut` / `QuoterV2.quoteExactInput*` / `MixedRouteQuoterV1.quoteExactInput`) before executing a swap, and check `slot0` / `getReserves` / `Pool.metadata` before constructing liquidity transactions.
- **Slippage is mandatory.** Never pass `amountOutMin = 0`, `amount{0,1}Min = 0`, or default `sqrtPriceLimitX96 = 0` for user-facing operations. Defaults: 0.5% for v2 swaps, 1% for v3 swaps and liquidity adds (relative to the quote). Document the slippage you applied.
- **Deadlines** default to `now + 20 minutes` unless the user specifies.
- **Verify the pool exists before swapping.** `PoolFactory.getPool(a, b, stable)` returns `address(0)` if none — same for `CLFactory.getPool(a, b, tickSpacing)`. Fail loudly rather than constructing a route through a non-existent pool.
- **Voting is once per epoch.** `Voter.reset(tokenId)` and `Voter.vote(tokenId, ...)` both revert if called in the same epoch as a prior `vote`. Read `Voter.lastVoted(tokenId)` and compare with the current epoch start (`Voter.epochStart(now)`) before attempting.
- **Bribes are paid for votes _in the same epoch_.** When depositing a bribe, the rewards count for that epoch's voters; deposit before the voting window closes (Thu 23:00 UTC). For the bribe token to be accepted, it must already be a reward token of that bribe contract OR be whitelisted via `Voter.isWhitelistedToken(token)`.
- **CL positions must be in-range to earn emissions.** Out-of-range liquidity is staked but receives no `CLGauge` rewards.
- **NFT approvals.** Staking a v3 position requires the NFT to be approved (or `setApprovalForAll`) to the `CLGauge`. Voting/claiming requires `VotingEscrow.isApprovedOrOwner(msg.sender, tokenId)`.

When unsure, re-read the relevant `references/*.md`. When the user asks for something unusual (governance proposals, BSC testnet, deploying new pools as a protocol operator), it is out of scope for this skill — say so and stop.
