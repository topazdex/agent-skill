# Topaz — Mainnet Addresses (BNB Chain, id 56)

All addresses below are the **only** authoritative on-chain identifiers for Topaz Dex on BNB Mainnet. Within this skill, the same set is mirrored in `scripts/src/config/addresses.ts` and `README.md`; the validator (`yarn validate` in `scripts/`) enforces parity.

## Chain

| | |
|---|---|
| Chain | BNB Smart Chain Mainnet |
| Chain ID | 56 |
| Default public RPC | `https://bsc-dataseed.binance.org`, `https://bsc-rpc.publicnode.com`, `https://1rpc.io/bnb` |
| Block explorer | https://bscscan.com |
| Native currency | BNB (18 dec) |
| Wrapped native | WBNB `0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c` |

## Tokens

| Symbol | Address | Decimals |
|---|---|---|
| TOPAZ | `0xdf002282C1474C9592780618Adda7EaA99998Abd` | 18 |
| WBNB | `0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c` | 18 |

For a list of whitelisted bribe tokens and common quote assets (USDT, USDC, BTCB, etc.), see `tokens.md`.

## Core / v2 contracts

| Contract | Address | Notes |
|---|---|---|
| Topaz | `0xdf002282C1474C9592780618Adda7EaA99998Abd` | ERC20 emissions token |
| VotingEscrow | `0xe951aC65EFE86682311ab0d8995E7A58750c5eB3` | veTOPAZ NFT, 4-year max lock |
| Voter | `0x2F80F810a114223AC69E34E84E735CaD515dAD67` | Vote, claim bribes/fees, createGauge, distribute |
| Minter | `0x606794d37991A426a189fD9FA8664D339A77f8ae` | Weekly emissions; `updatePeriod()` advances epoch |
| RewardsDistributor | `0x85e15e7Ad4f20d5ca3A1104B1c2CcE72f5F683dB` | veTOPAZ rebase, `claim(tokenId)` / `claimMany(tokenIds)` |
| PoolFactory | `0x65E6cD0eF5D3467030103cf3d433034E570b5784` | v2 pools: `getPool(a, b, stable)` / `createPool` |
| Pool (impl) | `0xdC942D8e37cC20BCf9aD1Fe0111eE6c5908f3678` | Clone target — do **not** call directly |
| Router | `0x1E98c8226e7d452e1888e3d3d2F929346321c6c3` | v2 swaps + addLiquidity + zap |
| GaugeFactory | `0xFc080D1EcD7c332022cebf942AEb62d5E1d4Cb08` | Creates v2 `Gauge` contracts (per pool) |
| VotingRewardsFactory | `0x4C303f7af7b8b05226440e4e12FF9a82F513716c` | Creates the paired `FeesVotingReward` + `BribeVotingReward` |
| ManagedRewardsFactory | `0xe4b23F13b24232C1E68AD0575191216152AA9480` | Creates Free/LockedManagedReward (managed-NFT system) |
| FactoryRegistry | `0x268d1C8a538Ecf6628838C11d581e1EABD13D6A4` | Whitelists pool/gauge factory pairs |
| Forwarder | `0xE79EB7c4D06ff38e6483921DE8e85A37eC7c731b` | ERC-2771 metatransaction forwarder |
| VeArtProxy | `0x9612305fe63DFb84Da8f6d6261169F6B85026601` | On-chain art for veTOPAZ NFT |
| AirdropDistributor | `0x7B1d8745079C85af80Ff7A7eA7C2C4769Eab5348` | Initial airdrop distributor |
| BalanceLogicLibrary | `0xeF6724ad68Fd2f8526765e08afa6627850c8a589` | Linked library (read-only) |
| DelegationLogicLibrary | `0xCb24e31896d7476EFB7B76A366566cfbcf375033` | Linked library (read-only) |

Governance (`EpochGovernor`, `ProtocolGovernor`) is intentionally **not** documented in this skill — out of scope.

## Slipstream / v3 contracts

| Contract | Address | Notes |
|---|---|---|
| CLFactory | `0x73DC984D9490286E735548f61dfCCec67Af82ed9` | `createPool(a, b, tickSpacing, sqrtPriceX96)` / `getPool` |
| CLPool (impl) | `0x18e68051d1b1fB44cb539cA4436F112D28577AF7` | Clone target — do **not** call directly |
| CLGaugeFactory | `0xeD2ED418f104E18B1D11eA5C26236A1caa675839` | Creates `CLGauge` instances (called by Voter) |
| CLGauge (impl) | `0xc2f777a2e9f54f195212a5a2d394399252958b97` | Clone target — do **not** call directly |
| NonfungiblePositionManager | `0xf8c30c3C362941C23025f2eA30B066A73C982f63` | Mint / increase / decrease / collect / burn v3 positions; ERC721 |
| SwapRouter | `0x9B63CA87919617d042A89663492dB3c8686e0CaE` | v3 `exactInput[Single]`, `exactOutput[Single]`, `multicall` |
| QuoterV2 | `0x7CCB89bB9BdEF68688F39a2c22d249fD1D9759f1` | Quote v3 swaps (revert-and-decode pattern — non-view) |
| MixedRouteQuoterV1 | `0x47c3570b90e7234FE695Ad5F1bE69E21fe1a9ee2` | Quote routes that mix v2 (stable/volatile) and v3 hops |
| NonfungibleTokenPositionDescriptor | `0xBa4C4f5Ca809C21286ff1a872b3c0CFb57AfE904` | NFT URI generator |
| NonfungibleTokenPositionDescriptor_V1 | `0x81aCc35240D19948a56b8b68BcC8706F90baBAb5` | Legacy descriptor (archived) |
| NFTDescriptor (library) | `0x50f9756f631266686b9A7EBDF55998dB3dA5ca0a` | |
| NFTSVG (library) | `0x21C9257dFCdf04154D34dF5A2204B9402Ef31d9a` | |
| CustomSwapFeeModule | `0xA0462a52af4f8cbF7766Efbba75355B30b6BCCe2` | Per-pool flat swap fee override (MAX_FEE = 30,000 pips = 3%) |
| CustomUnstakedFeeModule | `0x3bad7F96cd1b51CE86e12C42541Ac7d559A78582` | Unstaked-position fee override (MAX_FEE = 500,000 pips = 50%; default 100,000 = 10%) |
| DynamicSwapFeeModule | `0x656cf5d2f1A70177E011e2c27DeafBeE4C7B0541` | TWAP-volatility-scaled fees |
| PositionBurnHelper | `0x8EA90c6711bcA4203C689bF0dd6f08E43377e3C5` | Bulk-burns the caller's empty/dead CL position NFTs; bound to the NonfungiblePositionManager |

## Relays (mveTOPAZ reward automation)

Automated reward managers for **managed veTOPAZ** locks. Full workflow + concept in `relays.md`. `FreeManagedReward` / `LockedManagedReward` are **not** fixed — resolve them per relay via `VotingEscrow.managedToFree(mTokenId)` / `managedToLocked(mTokenId)`.

| Contract | Address | Notes |
|---|---|---|
| RelayFactoryRegistry | `0x987097eF2fBd740436166f49700a40ac5eD49FE4` | Whitelists relay factories |
| AutoCompounderFactory | `0x717bB82888F103A1Ff8E07A0f96aD6497744feeA` | Deploys `AutoCompounder` (Maxi) relays |
| CompoundConverterFactory | `0x64FaeF44D4b9bF1AbeF56878D0188084355fd5Ad` | Deploys `CompoundConverter` (Reward & Distribute) relays |
| Optimizer | `0x62B3cea3C6028029E56A880E71b659aF523F06B6` | Swap-route optimizer used by relays |
| OptimizerRegistry | `0x70008f088e60DE590ca63F93814692503e96Fcbd` | Whitelists optimizers |
| KeeperRegistry | `0xDB93DCfd7a560fB0757857787b6B3c2dBF6E56aA` | Whitelists keepers that trigger compounding |
| veTOPAZ Maxi (`AutoCompounder`) | `0xC3b3d7037DA1216A1770b3aC5cB8e2D4241AF251` | Compounds all rewards into TOPAZ; managed veNFT `mTokenId` 3083. No user claim |
| Reward & Distribute (`CompoundConverter`) | `0xb30d44B5E6Ab16494EA2B8455BB430926A935b84` | Compounds TOPAZ + streams USDT to depositors; managed veNFT `mTokenId` 3087. Users claim USDT |

New relays may be deployed over time — enumerate them on-chain via the factories (`relays()`) or `RelayFactoryRegistry`; the two above are the live BSC set as of this release.

## Per-gauge addresses are dynamic

Gauges, `FeesVotingReward` and `BribeVotingReward` contracts are deployed per-pool and not in the deployments folder. Look them up on demand:

```solidity
address gauge      = IVoter(Voter).gauges(pool);          // 0x0 if no gauge yet
address feeReward  = IVoter(Voter).gaugeToFees(gauge);    // trading-fees-to-voters contract
address bribeReward = IVoter(Voter).gaugeToBribe(gauge);  // external-bribes-to-voters contract
address pool       = IVoter(Voter).poolForGauge(gauge);   // reverse lookup
bool    live       = IVoter(Voter).isAlive(gauge);        // false if killed
```

Same lookup works for both v2 pools and v3 CL pools — the gauge type is determined when `Voter.createGauge(poolFactory, pool)` is called.

## v3 tick-spacing → default fee tier

Configured in `CLFactory` constructor. Fees are in **pips** (1e-6, so 100 pips = 0.01%):

| tickSpacing | default fee (pips) | bps | typical use |
|---|---|---|---|
| 1 | 100 | 0.01% | Tightly correlated stables (USDC/USDT) |
| 50 | 500 | 0.05% | Low-volatility pairs |
| 100 | 1000 | 0.10% | Moderate volatility |
| 200 | 3000 | 0.30% | High volatility (typical for ETH/USDC, BNB/USDT) |
| 2000 | 10000 | 1.00% | Very high volatility / exotic |

Per-pool overrides via the fee modules above are possible — read live with `CLFactory.getSwapFee(pool)` and `CLFactory.getUnstakedFee(pool)` instead of assuming the default.

## v2 default fees

Read live from `PoolFactory.getFee(pool, stable)`. Defaults:

| pool type | default | source |
|---|---|---|
| volatile | 30 = 0.30% | `PoolFactory.volatileFee` |
| stable | 5 = 0.05% | `PoolFactory.stableFee` |

`PoolFactory.MAX_FEE = 300` (3%). Custom per-pool fee can be set via `setCustomFee`.
