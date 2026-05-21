# Example — Stake an Existing v3 Position in its CL Gauge

**Goal:** You already own a v3 position NFT (tokenId = 1234). Stake it in the corresponding `CLGauge` to start earning TOPAZ emissions while in range.

## 1. Read the position and find the gauge

```ts
import { ethers } from "ethers";

const tokenId = 1234n;
const npm = new ethers.Contract(NPM_ADDR, npmAbi, signer);
const voter = new ethers.Contract(VOTER_ADDR, voterAbi, signer);
const clFactory = new ethers.Contract(CLFACTORY_ADDR, clFactoryAbi, signer);

const pos = await npm.positions(tokenId);
const { token0, token1, tickSpacing, liquidity, tickLower, tickUpper } = pos;

if (liquidity === 0n) throw new Error("position has no liquidity — nothing to stake");

const poolAddr = await clFactory.getPool(token0, token1, tickSpacing);
const gauge = await voter.gauges(poolAddr);
if (gauge === ethers.ZeroAddress) throw new Error("pool has no gauge");
if (!(await voter.isAlive(gauge))) throw new Error("gauge is killed — no rewards");

// Range check
const { tick: currentTick } = await clPool.attach(poolAddr).slot0();
const inRange = currentTick >= tickLower && currentTick < tickUpper;
if (!inRange) console.warn("position is OUT OF RANGE — staked but earning 0 until tick re-enters");
```

## 2. Approve the NFT to the gauge

Two options:

```ts
// (a) Single-NFT approval — required minimum, scoped tightly
await npm.approve(gauge, tokenId);

// (b) Or, blanket approval — convenient if you plan to stake several positions in this gauge
await npm.setApprovalForAll(gauge, true);
```

## 3. Deposit

```ts
const tx = await clGauge.attach(gauge).deposit(tokenId);
await tx.wait();
console.log(`Position ${tokenId} now staked in gauge ${gauge}`);
```

The NFT is transferred from your wallet into the gauge. While staked you **cannot** call `NPM.increaseLiquidity`, `decreaseLiquidity`, `collect`, or `burn` on this tokenId — you must `withdraw` first.

## 4. Check pending rewards

```ts
const pending = await clGauge.attach(gauge).earned(account, tokenId);
console.log(`Pending TOPAZ: ${formatUnits(pending, 18)}`);
```

`account` here is the owner that called `deposit` (i.e. the original NFT owner — recorded on stake).

## 5. Claim without unstaking

```ts
await clGauge.attach(gauge).getReward(tokenId);    // sends TOPAZ to position owner
```

There is no user-callable batch overload — `CLGauge.getReward(address)` is voter-only. To claim across multiple of your staked tokenIds, loop:

```ts
const tokenIds = await clGauge.attach(gauge).stakedValues(account);
for (const id of tokenIds) await clGauge.attach(gauge)["getReward(uint256)"](id);
```

## 6. Unstake (auto-claims)

```ts
await clGauge.attach(gauge).withdraw(tokenId);
// NFT returned to your wallet; pending TOPAZ also paid out.
```

## CLI shortcuts

```bash
yarn tsx src/cli/lp.ts stake --tokenId 1234
yarn tsx src/cli/claim.ts gauge --tokenId 1234
yarn tsx src/cli/lp.ts unstake --tokenId 1234
```

`stats.ts position --id 1234` shows staked-vs-unstaked, in-range vs out-of-range, and current emission APR for that specific position based on its liquidity share of `pool.stakedLiquidity`.

## Things to watch

- **In-range only.** Out-of-range NFTs are staked but earn 0. If yours moves out, decide: leave it (wait for price), unstake → withdraw liquidity → mint a new position at the current range → restake.
- **Fees on staked positions go to voters**, not to you. While staked, your trading-fee yield is 0; you earn only emissions. Unstake first if you want to `collect()` fees.
- **One owner per stake.** `deposit` records `msg.sender` as the owner. If a contract stakes on a user's behalf, that contract becomes the owner for reward purposes — be careful.
- **`withdraw` cannot be partial.** It removes the whole NFT. To "reduce" exposure, withdraw the NFT, `decreaseLiquidity` partially, then re-stake the same (now smaller) tokenId.
