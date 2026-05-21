# Topaz Skill

Agent skill package for **Topaz Dex** — a ve(3,3) DEX on **BNB Chain Mainnet (chain id 56)** combining Solidly-style v2 pools (volatile + stable) with Uniswap-v3-style concentrated liquidity (Slipstream). The skill teaches Claude how to swap, manage liquidity (both v2 LP and v3 NFT positions), stake in gauges, manage veTOPAZ locks, vote, claim rewards, deposit bribes, and query analytics via on-chain reads and the official subgraphs.

Everything here is mainnet-only. Testnet and governance contracts (EpochGovernor/ProtocolGovernor) are intentionally out of scope.

## Entry points

- **For agents:** start at `SKILL.md`, then drill into `references/*.md` and `examples/*.md` as needed.
- **For developers:** start at `developers/DEVELOPERS.md` for app, SDK, calldata, dashboard, subgraph, and frontend integration guidance.
- **For humans doing ops:** address tables below, deeper docs under `references/`, runnable code under `scripts/`.

## Contract addresses (BNB Mainnet, chain id 56)

### Core / v2 (`topaz-contracts`)

| Contract | Address |
|---|---|
| TOPAZ (governance token, ERC20) | `0xdf002282C1474C9592780618Adda7EaA99998Abd` |
| WBNB | `0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c` |
| VotingEscrow (veTOPAZ, ERC721) | `0xe951aC65EFE86682311ab0d8995E7A58750c5eB3` |
| Voter | `0x2F80F810a114223AC69E34E84E735CaD515dAD67` |
| Minter | `0x606794d37991A426a189fD9FA8664D339A77f8ae` |
| RewardsDistributor (rebase) | `0x85e15e7Ad4f20d5ca3A1104B1c2CcE72f5F683dB` |
| PoolFactory (v2) | `0x65E6cD0eF5D3467030103cf3d433034E570b5784` |
| Pool implementation | `0xdC942D8e37cC20BCf9aD1Fe0111eE6c5908f3678` |
| Router (v2) | `0x1E98c8226e7d452e1888e3d3d2F929346321c6c3` |
| GaugeFactory | `0xFc080D1EcD7c332022cebf942AEb62d5E1d4Cb08` |
| VotingRewardsFactory | `0x4C303f7af7b8b05226440e4e12FF9a82F513716c` |
| ManagedRewardsFactory | `0xe4b23F13b24232C1E68AD0575191216152AA9480` |
| FactoryRegistry | `0x268d1C8a538Ecf6628838C11d581e1EABD13D6A4` |
| Forwarder (ERC-2771) | `0xE79EB7c4D06ff38e6483921DE8e85A37eC7c731b` |
| VeArtProxy | `0x9612305fe63DFb84Da8f6d6261169F6B85026601` |
| AirdropDistributor | `0x7B1d8745079C85af80Ff7A7eA7C2C4769Eab5348` |

### Slipstream / v3 (`topaz-slipstream`)

| Contract | Address |
|---|---|
| CLFactory | `0x73DC984D9490286E735548f61dfCCec67Af82ed9` |
| CLPool implementation | `0x18e68051d1b1fB44cb539cA4436F112D28577AF7` |
| NonfungiblePositionManager (NFT positions) | `0xf8c30c3C362941C23025f2eA30B066A73C982f63` |
| SwapRouter (v3) | `0x9B63CA87919617d042A89663492dB3c8686e0CaE` |
| QuoterV2 | `0x7CCB89bB9BdEF68688F39a2c22d249fD1D9759f1` |
| MixedRouteQuoterV1 (v2+v3 routes) | `0x47c3570b90e7234FE695Ad5F1bE69E21fe1a9ee2` |
| CLGaugeFactory | `0xeD2ED418f104E18B1D11eA5C26236A1caa675839` |
| CLGauge implementation | `0xc2f777a2e9f54f195212a5a2d394399252958b97` |
| NonfungibleTokenPositionDescriptor | `0xBa4C4f5Ca809C21286ff1a872b3c0CFb57AfE904` |
| NFTDescriptor (library) | `0x50f9756f631266686b9A7EBDF55998dB3dA5ca0a` |
| NFTSVG (library) | `0x21C9257dFCdf04154D34dF5A2204B9402Ef31d9a` |
| CustomSwapFeeModule | `0xA0462a52af4f8cbF7766Efbba75355B30b6BCCe2` |
| CustomUnstakedFeeModule | `0x3bad7F96cd1b51CE86e12C42541Ac7d559A78582` |
| DynamicSwapFeeModule | `0x656cf5d2f1A70177E011e2c27DeafBeE4C7B0541` |

Single source of truth: `~/topaz/topaz-contracts/deployments/bscMainnet/*.json` and `~/topaz/topaz-slipstream/deployments/bscMainnet/*.json`. The same values are mirrored in `references/addresses.md` and `scripts/src/config/addresses.ts`.

## Subgraph endpoints (Goldsky)

```
v2: https://api.goldsky.com/api/public/project_cmgzljqwl006c5np2gnao4li4/subgraphs/topaz-v2/v0.0.3/gn
v3: https://api.goldsky.com/api/public/project_cmgzljqwl006c5np2gnao4li4/subgraphs/topaz-v3/v0.0.1/gn
```

Entity catalogs and example queries: `references/analytics-subgraph.md`.

## Architecture overview

Topaz is two pool stacks (v2 and v3) sharing one ve(3,3) governance layer.

```
                    ┌─────────────────────────────┐
                    │   TOPAZ ERC20 (emissions)   │
                    └──────────────┬──────────────┘
                                   │ mint weekly
                    ┌──────────────▼──────────────┐
                    │           Minter            │
                    └──────┬───────────────┬──────┘
              60% to Voter │               │ 40% to RewardsDistributor (rebase)
                    ┌──────▼──────┐ ┌──────▼──────┐
                    │    Voter    │ │ RewardsDistributor │  → claimed by veTOPAZ holders
                    └──────┬──────┘ └─────────────┘
                           │ distribute() per-epoch (per pool weight)
        ┌──────────────────┴──────────────────┐
        │                                     │
┌───────▼────────┐                  ┌─────────▼────────┐
│  Gauge (v2)    │                  │   CLGauge (v3)   │
│  stake LP ERC20│                  │   stake NFT pos  │
└───────┬────────┘                  └─────────┬────────┘
        │                                     │
┌───────▼────────┐                  ┌─────────▼────────┐
│   Pool (v2)    │                  │   CLPool (v3)    │
│  xy=k / stable │                  │ concentrated liq │
└────────────────┘                  └──────────────────┘

Voting:
   veTOPAZ holders ─vote()─▶ Voter ─_deposit()─▶ FeesVotingReward[gauge]
                                  └_deposit()─▶ BribeVotingReward[gauge]

   Pool trading fees ─claimFees()─▶ FeesVotingReward (distributed to voters)
   External bribers ─notifyRewardAmount(token, amt)─▶ BribeVotingReward (paid to voters)
```

- **Pools** generate trading fees. Fees that accrue to gauges flow into `FeesVotingReward` (one per gauge, mapped via `Voter.gaugeToFees(gauge)`).
- **Gauges** receive TOPAZ emissions proportional to vote weight; LPs stake to earn emissions.
- **Voters** allocate veTOPAZ weight across gauges, earning a share of that gauge's trading fees + any bribes.
- **Bribers** add reward tokens to `BribeVotingReward` (mapped via `Voter.gaugeToBribe(gauge)`) to attract votes.
- **veTOPAZ holders** also receive a weekly rebase (anti-dilution) via `RewardsDistributor.claim(tokenId)`.

Epochs are weekly, starting **Thursday 00:00:00 UTC**. Voting window opens at +1h and closes at the next epoch boundary -1h. See `references/epoch-timing.md`.

## Repository layout

```
topaz-skill/
├── README.md                # This file
├── SKILL.md                 # Agent entry (frontmatter + nav)
├── references/              # Topic docs (loaded on demand)
│   ├── addresses.md
│   ├── tokens.md
│   ├── epoch-timing.md
│   ├── swapping-{v2,v3,mixed}.md
│   ├── liquidity-{v2,v3}.md
│   ├── gauges.md
│   ├── ve-locks.md
│   ├── voting.md
│   ├── rewards-claiming.md
│   ├── bribes-deposit.md
│   ├── analytics-{subgraph,onchain}.md
│   ├── apr-calculations.md
│   ├── pitfalls.md
│   └── abis/                # JSON ABIs for ethers/web3
├── developers/              # Builder guides: app integration, calldata, subgraphs, dashboards
├── sdk/                     # SDK layer notes; public exports currently live under scripts/src
├── examples/                # Narrative walkthroughs
└── scripts/                 # TypeScript + ethers v6 helpers
    ├── package.json
    └── src/
        ├── config/          # addresses, chain, tokens
        ├── lib/             # client, erc20, subgraph, tickMath, path, pricing, epoch
        ├── read/            # quotes, pools, gauges, locks, votes, claimable, apr, ...
        ├── write/           # swap, liquidity, gauge, lock, vote, claim, bribe
        └── cli/             # `yarn tsx src/cli/<cmd>.ts ...` entry points
```

## Using the scripts

```bash
cd scripts
cp .env.example .env
# edit .env: BSC_RPC_URL (required), PRIVATE_KEY (required only for write ops)
yarn install
yarn tsx src/cli/stats.ts pool 0x<pool-address>    # read-only example
```

Full env + per-CLI usage in `scripts/README.md`.

## Developer guides

If you are building an app or SDK on top of Topaz, start with `developers/DEVELOPERS.md`. It links to focused guides for quote widgets, wallet-ready swap calldata, subgraph recipes, position dashboards, gauges/APR, and frontend integration.

## Pointers to source

| What | Where |
|---|---|
| Core contracts | `~/topaz/topaz-contracts/contracts/` |
| CL contracts | `~/topaz/topaz-slipstream/contracts/` |
| Frontend reference patterns | `~/topaz/topaz-interface/src/hooks/` |
| v2 subgraph schema | `~/topaz/topaz-v2-subgraph/src/v2/schema.graphql` |
| v3 subgraph schema | `~/topaz/topaz-v3-subgraph/src/v3/schema.graphql` |
