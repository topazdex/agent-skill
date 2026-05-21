# Example — Mint a v3 CL Position (USDT/USDC at tickSpacing=1, ±0.1% range)

**Goal:** Create a concentrated USDT/USDC LP position spanning ±10 ticks (≈ ±0.10%) around the current price.

## 1. Find the pool & inspect current price

```ts
import { ethers, parseUnits, formatUnits } from "ethers";

const USDT = "0x55d398326f99059fF775485246999027B3197955";
const USDC = "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d";
const TICK_SPACING = 1;

const poolAddr = await clFactory.getPool(USDT, USDC, TICK_SPACING);
if (poolAddr === ethers.ZeroAddress) throw new Error("no pool — create with CLFactory.createPool");

const pool = clPool.attach(poolAddr);
const { sqrtPriceX96, tick: currentTick } = await pool.slot0();
const [token0, token1] = await Promise.all([pool.token0(), pool.token1()]);
```

**Note:** `token0 < token1` lexicographically. With USDT (`0x55...`) and USDC (`0x8A...`), `token0 = USDT` and `token1 = USDC`. Price (`token1/token0`) is roughly 1 USDC per USDT.

## 2. Pick the tick range

`tickSpacing = 1` means each tick is 1 = ~0.01% price step. For ±10 ticks (≈ ±0.10%):

```ts
import { nearestUsableTick } from "./lib/tickMath";
const tickLower = nearestUsableTick(Number(currentTick) - 10, TICK_SPACING);
const tickUpper = nearestUsableTick(Number(currentTick) + 10, TICK_SPACING);
```

For a wider range (e.g. ±100 ticks for safer mean reversion at the cost of less APR concentration), substitute accordingly.

## 3. Decide amounts

Since the position is at-the-current-price and the range is symmetric, you need roughly equal value of token0 and token1. To deposit exactly 1000 USDT and the matching USDC:

```ts
const amount0Desired = parseUnits("1000", 18);

// Compute exact matching amount1 for this range at the current price.
// Either use SugarHelper.estimateAmount1 (if you have its address) or local math from tickMath.ts:
import { getAmount1ForAmount0 } from "./lib/tickMath";
const amount1Desired = getAmount1ForAmount0(
  amount0Desired,
  sqrtPriceX96,
  TickMath.getSqrtRatioAtTick(tickLower),
  TickMath.getSqrtRatioAtTick(tickUpper),
);
```

For an out-of-range (one-sided) position, supply only the side that fits the range:
- If `tickUpper <= currentTick`: only token0 is consumed.
- If `tickLower >= currentTick`: only token1 is consumed.

## 4. Approve both tokens to the NPM

```ts
const NPM = "0xf8c30c3C362941C23025f2eA30B066A73C982f63";
await usdt.approve(NPM, amount0Desired);
await usdc.approve(NPM, amount1Desired);
```

## 5. Mint

```ts
const SLIPPAGE_BPS = 50n;     // 0.5% — stable pair, tight range
const amount0Min = (amount0Desired * (10_000n - SLIPPAGE_BPS)) / 10_000n;
const amount1Min = (amount1Desired * (10_000n - SLIPPAGE_BPS)) / 10_000n;
const deadline = Math.floor(Date.now() / 1000) + 60 * 20;

const tx = await npm.mint({
  token0,          // sorted: USDT
  token1,          // sorted: USDC
  tickSpacing: TICK_SPACING,
  tickLower,
  tickUpper,
  amount0Desired,
  amount1Desired,
  amount0Min,
  amount1Min,
  recipient,
  deadline,
  sqrtPriceX96,    // ignored if pool already initialized; required if creating a new pool
});
const receipt = await tx.wait();

// Decode the IncreaseLiquidity / Mint events to find your tokenId:
const event = receipt.logs.map(log => npm.interface.parseLog(log)).find(e => e?.name === "IncreaseLiquidity");
const tokenId = event.args.tokenId;
console.log("Minted NFT", tokenId);
```

## 6. (Optional) Stake in the CL gauge

```ts
const gauge = await voter.gauges(poolAddr);
if (gauge !== ethers.ZeroAddress && await voter.isAlive(gauge)) {
  await npm.approve(gauge, tokenId);
  await clGauge.attach(gauge).deposit(tokenId);
}
```

The NFT is now held by the gauge. Emissions accrue while the position is in range. Use `CLGauge.withdraw(tokenId)` to retrieve it (also auto-claims TOPAZ rewards).

## CLI shortcut

```bash
yarn tsx src/cli/lp.ts mint-v3 \
  --t0 0x55d398326f99059fF775485246999027B3197955 \
  --t1 0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d \
  --ts 1 \
  --range-ticks 10 \
  --amount0 1000 \
  --slippage 50 \
  --stake
```

`--range-ticks 10` produces `[currentTick-10, currentTick+10]` (you can override with explicit `--tick-lower / --tick-upper`). If you'd rather specify range as a percentage, use `--range-pct 0.10`.

## Inspecting the position

```bash
yarn tsx src/cli/stats.ts position --id <tokenId>
```

Prints: pool, tickLower/tickUpper, current price/tick, in-range yes/no, liquidity, principal (amount0/amount1 in tokens), pending fees, gauge status (staked or not), pending TOPAZ rewards, current emission APR / fee APR.

## Closing out

```bash
yarn tsx src/cli/lp.ts close-v3 --id <tokenId>
```

Runs (in order): `CLGauge.withdraw(tokenId)` if staked → `NPM.decreaseLiquidity({ liquidity: full, ... })` → `NPM.collect({ amountMax: max, ... })` → `NPM.burn(tokenId)`.
