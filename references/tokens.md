# Tokens — common BSC assets used on Topaz

These are tokens already routed on Topaz at launch (whitelisted in `Voter.isWhitelistedToken`, allowed as bribe assets without further governance). Decimals matter — always read `IERC20.decimals()` when in doubt.

## Native + protocol

| Symbol | Address | Decimals | Notes |
|---|---|---|---|
| BNB | (native) | 18 | Use WBNB for ERC20 routing; `Router.swapExactETHForTokens` wraps for you |
| WBNB | `0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c` | 18 | Canonical wrapped BNB on BSC |
| TOPAZ | `0xdf002282C1474C9592780618Adda7EaA99998Abd` | 18 | Protocol token (gauge emissions, rebase, lock) |

## Stable / pegged

| Symbol | Address | Decimals |
|---|---|---|
| USDT | `0x55d398326f99059fF775485246999027B3197955` | 18 |
| USDC | `0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d` | 18 |
| EGB | `0x8d0D000Ee44948FC98c9B98A4FA4921476f08B0d` | 18 |

> **BSC quirk**: USDT and USDC on BSC are both **18 decimals**, unlike Ethereum (6). Always read decimals from the token if you're unsure.

## Bluechips

| Symbol | Address | Decimals |
|---|---|---|
| BTCB (Binance-Peg BTC) | `0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c` | 18 |
| ETH (Binance-Peg) | `0x2170Ed0880ac9A755fd29B2688956BD959F933F8` | 18 |
| WETH (alternate pegged) | `0x570A5D26f7765Ecb712C0924E4De545B89fD43dF` | 18 |
| CAKE | `0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82` | 18 |

## Additional whitelisted

The full whitelist (effective at deploy) — sourced from `topaz-contracts/config/bscMainnet.json`:

```
0x55d398326f99059fF775485246999027B3197955  USDT
0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c  WBNB
0x8d0D000Ee44948FC98c9B98A4FA4921476f08B0d  EGB
0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d  USDC
0x2170Ed0880ac9A755fd29B2688956BD959F933F8  ETH
0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c  BTCB
0x570A5D26f7765Ecb712C0924E4De545B89fD43dF  WETH
0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82  CAKE
0xc5f0f7b66764F6ec8C8Dff7BA683102295E16409  (look up live via IERC20.symbol/name)
0xbA2aE424d960c26247Dd6c32edC70B295c744C43
0x1D2F0da169ceB9fC7B3144628dB156f3F6c60dBE
0xC9Ad421f96579AcE066eC188a7Bba472fB83017F
0xa90298e5B1203A2DD0006A75EABE158989C406Fb
0x158ff17474D7ACd29C13f26C5D27B293Ef0A1410
0xc269d59a0D608EA0bd672F2F4616C372d8554444
0xc28957E946AC244612BcB205C899844Cbbcb093D
0x9212cF1f9f4A9c69Bb010146Ba5b0725169D4444
0x12B4356C65340Fb02cdff01293F95FEBb1512F3b
0x47A1EB0b825b73e6A14807BEaECAFef199d5477c
0x9C27c4072738CF4b7B0B7071af0ad5666BdDC096
0x64FDD8a6c19d66a5b917a015868c5611261C4444
0x65aea108c21439693468FCD542D81C29E8df4444
0x2aC895fEba458B42884DCbCB47D57e44c3a303c8
```

The whitelist can change over time. Always confirm via on-chain `Voter.isWhitelistedToken(token)` before relying on it.

## Why the whitelist matters

- **Bribes** (`BribeVotingReward.notifyRewardAmount(token, amount)`) reject `token` if it's not whitelisted in `Voter.isWhitelistedToken(token)` AND not already a reward token of that bribe contract. Whitelisting is governance-controlled.
- **veTOPAZ holders** can have a managed NFT whitelisted via `Voter.whitelistNFT(tokenId, true)` for treasury / DAO use.

## Decimals helper

Always normalize amounts using:

```ts
import { parseUnits, formatUnits } from "ethers";

const amountWei = parseUnits("1.5", 18);            // for an 18-decimals token
const human = formatUnits(amountWei, 18);            // back to "1.5"
```

`scripts/src/lib/erc20.ts` exposes `getDecimals(tokenAddress)` with an LRU cache so you don't re-query the chain for the same token in a loop.
