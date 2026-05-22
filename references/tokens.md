# Tokens — common BSC assets used on Topaz

These are tokens already routed on Topaz at launch (whitelisted in `Voter.isWhitelistedToken`, allowed as bribe assets without further governance). Decimals matter — always read `IERC20.decimals()` when in doubt. Every symbol/name/decimals value below was cross-verified against the Topaz v2/v3 Goldsky subgraphs and direct `IERC20` calls; the canonical machine-readable copy lives in `scripts/src/config/tokens.ts`.

## Native + protocol

| Symbol | Address | Decimals | Notes |
|---|---|---|---|
| BNB | (native) | 18 | Use WBNB for ERC20 routing; `Router.swapExactETHForTokens` and `unwrapWETH9` handle the wrap/unwrap automatically. `findToken("BNB")` resolves to WBNB. |
| WBNB | `0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c` | 18 | Canonical wrapped BNB on BSC. Acts as the WETH9 of the v3 stack (`SwapRouter.unwrapWETH9` etc. operate on this). |
| TOPAZ | `0xdf002282C1474C9592780618Adda7EaA99998Abd` | 18 | Protocol token (gauge emissions, rebase, lock). |

## Stables

| Symbol | Address | Decimals | Notes |
|---|---|---|---|
| USDT | `0x55d398326f99059fF775485246999027B3197955` | 18 | Tether USD (Binance-Peg). |
| USDC | `0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d` | 18 | USD Coin (Binance-Peg). |
| USD1 | `0x8d0D000Ee44948FC98c9B98A4FA4921476f08B0d` | 18 | World Liberty Financial USD. |
| FDUSD | `0xc5f0f7b66764F6ec8C8Dff7BA683102295E16409` | 18 | First Digital USD. |

> **BSC quirk**: USDT, USDC, USD1, and FDUSD are all **18 decimals**, unlike Ethereum (6). Always read decimals from the token if you're unsure.

## Bluechips

| Symbol | Address | Decimals | Notes |
|---|---|---|---|
| BTCB | `0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c` | 18 | Binance-Peg BTC. |
| ETH | `0x2170Ed0880ac9A755fd29B2688956BD959F933F8` | 18 | Binance-Peg Ethereum. |
| SOL | `0x570A5D26f7765Ecb712C0924E4De545B89fD43dF` | 18 | Binance-Peg SOLANA. **Previously mislabeled "WETH" in this skill (pre-2.3.1) — if you have a cached/older copy, re-pull.** |
| XRP | `0x1D2F0da169ceB9fC7B3144628dB156f3F6c60dBE` | 18 | XRP Token (Binance-Peg). |
| CAKE | `0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82` | 18 | PancakeSwap Token. |
| DOGE | `0xbA2aE424d960c26247Dd6c32edC70B295c744C43` | **8** | Dogecoin (Binance-Peg). **Non-18 decimals — common foot-gun.** |

## Other whitelisted (small-cap / community)

These are pool-tradable today but lower liquidity. Verify against the live subgraph before relying on them for routing.

| Symbol | Address | Decimals | Notes |
|---|---|---|---|
| BLUE | `0xa90298e5B1203A2DD0006A75EABE158989C406Fb` | **9** | Blue Protocol. **Non-18 decimals.** |
| gBLUE | `0x158ff17474D7ACd29C13f26C5D27B293Ef0A1410` | 18 | Governance Blue. |
| BOOK | `0xC9Ad421f96579AcE066eC188a7Bba472fB83017F` | 18 | Book of Binance. |
| BUD | `0xc28957E946AC244612BcB205C899844Cbbcb093D` | 18 | BOOKUSD. |
| Broccoli | `0x12B4356C65340Fb02cdff01293F95FEBb1512F3b` | 18 | Broccoli. |
| CaptainBNB | `0x47A1EB0b825b73e6A14807BEaECAFef199d5477c` | 18 | CaptainBNB. |
| ClipX | `0xc269d59a0D608EA0bd672F2F4616C372d8554444` | 18 | ClipX. |
| EARN | `0x2aC895fEba458B42884DCbCB47D57e44c3a303c8` | 18 | HOLD. |
| $RISE | `0x64FDD8a6c19d66a5b917a015868c5611261C4444` | 18 | 1st Moon Mascot. `findToken("RISE")` also resolves. |
| Trusty | `0x65aea108c21439693468FCD542D81C29E8df4444` | 18 | TWT Mascot. |
| bibi | `0x9212cF1f9f4A9c69Bb010146Ba5b0725169D4444` | 18 | Binance bibi. |
| NianNian | `0x9C27c4072738CF4b7B0B7071af0ad5666BdDC096` | 18 | NianNian. |

The whitelist can change over time. Always confirm via on-chain `Voter.isWhitelistedToken(token)` before relying on it for bribes, and re-pull token metadata from the subgraph (`references/analytics-subgraph.md`) if you see an unfamiliar address.

## Why the whitelist matters

- **Bribes** (`BribeVotingReward.notifyRewardAmount(token, amount)`) reject `token` if it's not whitelisted in `Voter.isWhitelistedToken(token)` AND not already a reward token of that bribe contract. Whitelisting is governance-controlled.
- **veTOPAZ holders** can have a managed NFT whitelisted via `Voter.whitelistNFT(tokenId, true)` for treasury / DAO use.

## Refreshing this list from the subgraph

When tokens are added/removed from the whitelist, regenerate this table from the indexer rather than guessing:

```graphql
query Tokens($ids: [ID!]!) {
  tokens(where: { id_in: $ids }) {
    id
    symbol
    name
    decimals
    totalValueLockedUSD
    volumeUSD
  }
}
```

Run against both `SUBGRAPH_V2_URL` and `SUBGRAPH_V3_URL` and union the results — neither subgraph indexes every whitelisted token in isolation, since a token has to appear in at least one indexed pool. For any whitelist entry that returns nothing, fall back to direct `IERC20.symbol()`/`name()`/`decimals()` calls via the public BSC RPC.

## Decimals helper

Always normalize amounts using:

```ts
import { parseUnits, formatUnits } from "ethers";

const amountWei = parseUnits("1.5", 18);            // for an 18-decimals token
const human = formatUnits(amountWei, 18);            // back to "1.5"
```

`scripts/src/lib/erc20.ts` exposes `getDecimals(tokenAddress)` with an LRU cache so you don't re-query the chain for the same token in a loop. **Never hardcode `18`** when handling DOGE (8) or BLUE (9) — use the cached lookup.
