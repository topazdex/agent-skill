# Depositing Bribes / Incentives

A **bribe** (a.k.a. "incentive") is a reward token that you, an outside party, post on a specific pool's `BribeVotingReward` contract to attract veTOPAZ voters. In return, those voters direct gauge emissions toward your pool — increasing TOPAZ rewards for LPs in your pool, which in turn deepens liquidity and lowers slippage for your token.

A protocol or token issuer with budget can use bribes to bootstrap or sustain liquidity at favorable cost vs. paying LM rewards directly.

## Where the bribe lives

For a given pool `P`:

```ts
const gauge   = await voter.gauges(P);              // 0x0 if no gauge yet
const bribe   = await voter.gaugeToBribe(gauge);    // the BribeVotingReward contract
```

`bribe` is the contract you call to deposit. (`gaugeToFees(gauge)` is the *separate* contract that holds trading fees — you do **not** post bribes there.)

## Function signature

```solidity
// in BribeVotingReward (extends VotingReward / Reward)
function notifyRewardAmount(address token, uint256 amount) external nonReentrant;
```

That's it. Pull-only side effects:

1. `safeTransferFrom(msg.sender, address(this), amount)` — bribe contract pulls the token from your wallet.
2. If `token` was not previously a reward token of this bribe contract, the contract checks `Voter.isWhitelistedToken(token)`. If false, reverts with `NotWhitelisted`. Once whitelisted (or already present), the token is added to the bribe contract's `rewards[]` list.
3. Accrues `amount` to `tokenRewardsPerEpoch[token][currentEpochStart]`. **The reward is for the epoch in which the call is made**, NOT the next one.

## Token approval

You must `IERC20(token).approve(bribe, amount)` before `notifyRewardAmount`. Approving more (e.g. `MAX_UINT256`) lets you bribe repeatedly without re-approving.

## Whitelisting

`Voter.isWhitelistedToken(token)` is governance-controlled (see `references/tokens.md` for the current whitelist). If you want to bribe with a token that isn't whitelisted:

- If it's an existing reward token of *that* bribe contract (someone already bribed with it previously and was whitelisted at the time), `notifyRewardAmount` will succeed.
- Otherwise, governance must whitelist the token first. This is a per-token global setting, not per-pool.

Check before sending the tx: `await voter.isWhitelistedToken(yourToken)` or `await bribe.isReward(yourToken)`.

## Timing

The bribe accrues to **the current epoch's** voter set. Concretely:

| When you call `notifyRewardAmount(token, amount)` | Who receives the bribe |
|---|---|
| Anywhere between Thursday 00:00 UTC and Wednesday 23:00 UTC | Voters of epoch [Thu, next Thu) |
| After Wednesday 23:00 UTC, during the whitelist-only final hour | Normal veNFT voting is already closed; for safety, bribe **before Wednesday 23:00 UTC** to target the current epoch's normal voter set |

When the next epoch begins, this epoch's voter set is fixed and the pool's voters can claim their proportional share via `Voter.claimBribes`. New bribes posted after the flip belong to the *new* epoch.

## Recipe

```ts
import { Contract, parseUnits } from "ethers";

const POOL = "0x...";   // pool you want to bribe
const TOKEN = "0x55d398326f99059fF775485246999027B3197955";   // USDT
const AMOUNT = parseUnits("5000", 18);                          // 5000 USDT (18 dec on BSC)

const voter = new Contract(VOTER, voterAbi, signer);
const gauge = await voter.gauges(POOL);
if (gauge === ethers.ZeroAddress) throw new Error("No gauge for that pool");
if (!(await voter.isAlive(gauge))) throw new Error("Gauge is killed; bribes would be wasted");
const bribeAddr = await voter.gaugeToBribe(gauge);

// Pre-check
const bribe = new Contract(bribeAddr, rewardAbi, signer);
const alreadyReward = await bribe.isReward(TOKEN);
const whitelisted = await voter.isWhitelistedToken(TOKEN);
if (!alreadyReward && !whitelisted) throw new Error("Token not whitelisted by governance; would revert");

// Approve and bribe
const token = new Contract(TOKEN, erc20Abi, signer);
const allowance = await token.allowance(signer.address, bribeAddr);
if (allowance < AMOUNT) await (await token.approve(bribeAddr, AMOUNT)).wait();

await (await bribe.notifyRewardAmount(TOKEN, AMOUNT)).wait();
```

## Reading a pool's current and historical bribes

```ts
const length = await bribe.rewardsListLength();
const rewardTokens = await Promise.all([...Array(Number(length))].map((_, i) => bribe.rewards(i)));

// Per-epoch breakdown:
const epochStart = Number(await voter.epochStart(BigInt(Math.floor(Date.now() / 1000))));
const perToken = await Promise.all(rewardTokens.map(t =>
  bribe.tokenRewardsPerEpoch(t, BigInt(epochStart))
));
```

These two arrays zip into `{ token, amountThisEpoch }[]`. To get the USD value for an "incentive density" calculation:

```
incentiveUsdPerEpoch = sum over tokens of (amount * tokenPriceUsd)
voteWeightThisEpoch = await voter.weights(pool)
bribeReturnPerVote  = incentiveUsdPerEpoch / voteWeightThisEpoch   // USD per ve-weight unit
```

Higher `bribeReturnPerVote` = more attractive to voters. Used in voting strategies; see `apr-calculations.md`.

## Scripts

| Operation | Where |
|---|---|
| Check whitelist + reward set | `scripts/src/read/gauges.ts` — `getBribeInfo(pool)` returns bribeContract, rewardTokens, perEpochAmounts |
| Build approval + bribe calldata | `scripts/src/lib/actionBuilders.ts` — `buildBribeDepositTx({ pool, token, amount })` |
| Deposit bribe | `scripts/src/write/bribe.ts` — `depositBribe({ pool, token, amount })` |
| CLI | `yarn tsx src/cli/bribe.ts deposit --pool 0xPOOL --token 0xUSDT --amount 5000` |

See `examples/deposit-bribe.md` for a full walkthrough.
