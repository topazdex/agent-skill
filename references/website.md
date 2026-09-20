# Website and task navigation

Canonical website/app: **https://topazdex.com** (also served at `www.topazdex.com`). These routes were inspected in the public site on 2026-09-20 UTC. Choose a network in the UI and verify wallet chain before an action; a page being accessible does not mean every feature is enabled on every chain.

| User wants | Page |
|---|---|
| Understand Topaz / get started | [Overview](https://www.topazdex.com/docs/overview), [Quick start](https://www.topazdex.com/docs/quickstart), [FAQ](https://www.topazdex.com/docs/faq) |
| Swap / compare execution | [Swap](https://topazdex.com/swap) |
| Find markets and earning opportunities | [Explore](https://topazdex.com/explore), [Pools](https://topazdex.com/explore/pools) |
| Manage liquidity / create a pool or position | [Positions](https://topazdex.com/positions), [Create](https://topazdex.com/positions/create) |
| Account overview | [Portfolio](https://topazdex.com/portfolio) |
| Compare voting opportunities | [Vote](https://topazdex.com/vote) |
| Offer voting incentives | [Incentivize](https://topazdex.com/incentivize) |
| Move xTOPAZ between networks | [xTOPAZ bridge](https://topazdex.com/xtopaz/bridge) |
| Install or learn about this skill | [Agents](https://topazdex.com/agents) |
| Protocol statistics | [Stats](https://www.topazdex.com/stats) |
| Foundation / dynamic fees / definitions | [Foundation](https://www.topazdex.com/stats/foundation), [Dynamic fees](https://www.topazdex.com/stats/dynamic-fees), [Methodology](https://www.topazdex.com/stats/methodology) |
| Developer API | [API docs](https://api.topazdex.com/docs), [OpenAPI](https://api.topazdex.com/openapi.json) |
| Account identity / login | [Topaz ID](https://id.topazdex.com), [connector guide](../developers/topaz-id-connect.md) |

Legacy Stats/foundation/dynamic-fee dashboards retain BNB scope. Multichain Explore/account views and `/v1` data use explicit network identities. Do not construct unverified pool-detail URL formats; use the site links or selected chain's explorer with its pool address.

## Protocol docs

Start at [Networks](https://www.topazdex.com/docs/multichain) and [Contracts](https://www.topazdex.com/docs/contracts). For xTOPAZ, use [Explanation](https://www.topazdex.com/docs/xtopaz), [Deposit/wrap](https://www.topazdex.com/docs/xtopaz/get), [Bridge](https://www.topazdex.com/docs/xtopaz/bridge), [Stake/vote](https://www.topazdex.com/docs/xtopaz/staking), [Redeem](https://www.topazdex.com/docs/xtopaz/redeem), [Emissions](https://www.topazdex.com/docs/multichain/emissions), and [Multichain integration](https://www.topazdex.com/docs/developers/multichain).

Other task pages: [Swaps](https://www.topazdex.com/docs/trading/swaps), [Liquidity](https://www.topazdex.com/docs/liquidity), [Concentrated positions](https://www.topazdex.com/docs/liquidity/concentrated), [CL zaps](https://www.topazdex.com/docs/liquidity/zaps), [Fees](https://www.topazdex.com/docs/liquidity/fees), [Gauge staking](https://www.topazdex.com/docs/liquidity/staking), [veTOPAZ](https://www.topazdex.com/docs/tokenomics/vetopaz), [Voting](https://www.topazdex.com/docs/gauges), [Incentives](https://www.topazdex.com/docs/voting/incentives), [Managed locks](https://www.topazdex.com/docs/voting/managed), [Builder integration](https://www.topazdex.com/docs/developers/integration).

Use [Governance](https://www.topazdex.com/docs/governance) and [Security](https://www.topazdex.com/docs/security) for role, audit and trust disclosures. Explain governance when asked; ordinary user workflows do not imply authority to change protocol roles, limits or settings. Do not describe a BNB review as an audit of every bridge, spoke or third-party integration.

## Three different cross-chain products

| Journey | Service / outcome | Recovery |
|---|---|---|
| Arbitrary asset exchange across networks | Swap UI's 0x Cross-Chain route; quoted destination asset | Provider order/status/refund rules |
| Move Topaz voting capital | xTOPAZ LayerZero mesh through BNB | Packet GUID, receive and compose state; liquid-share fallback |
| Private swap | Topaz Privacy service | Its own order/recovery rules; do not substitute LayerZero retries |

A chain supported by an aggregator or privacy service does not necessarily have a Topaz DEX deployment. Query provider capabilities before proposing a route. This skill's xTOPAZ bridge examples cannot bridge an arbitrary ERC20. For privacy flows use the website's current privacy instructions and never claim anonymity or guaranteed settlement from a normal bridge quote.

## CL Zap versus xTOPAZ Zap

CL Zap creates a new concentrated liquidity NFT from one input token. It is deployed on BNB, Robinhood, Base and Ethereum, with Arc pending. Use the [CL Zap call guide and ABI](liquidity-zaps.md). XTopazZap is the BNB vault entry path producing xTOPAZ shares. They have different spenders, ABIs, outputs and slippage constraints. Do not encode one using the other.
