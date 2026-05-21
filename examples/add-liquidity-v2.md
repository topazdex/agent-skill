# Example — Add v2 Liquidity (WBNB/USDT volatile)

**Goal:** Provide liquidity to the WBNB/USDT volatile pool using 1 BNB + matching USDT, then stake the LP tokens in the gauge.

## 1. Find the pool & current ratio

```ts
const POOL = await poolFactory.getPool(WBNB, USDT, false);    // volatile

const [r0, r1] = await pool.attach(POOL).getReserves();      // bigint, bigint
const [token0, token1] = await Promise.all([pool.token0(), pool.token1()]);
// Sort matters: token0 < token1 lexicographically.
// reserve0/reserve1 are in token0/token1's own units.
```

## 2. Decide your input and compute the match

If you want to put in exactly 1 BNB worth (1 WBNB), compute the matching USDT from the pool's ratio:

```ts
const amountBNB = parseUnits("1", 18);
// price (USDT per WBNB) ≈ r_USDT / r_WBNB
const rWbnb = token0 === WBNB ? r0 : r1;
const rUsdt = token0 === WBNB ? r1 : r0;
const amountUsdt = (amountBNB * rUsdt) / rWbnb;
```

Or use the official quote:

```ts
const { amountA, amountB, liquidity } = await router.quoteAddLiquidity(
  WBNB, USDT, false, POOL_FACTORY, amountBNB, parseUnits("10000", 18) // very high desired-USDT cap
);
// amountA = WBNB to actually use, amountB = USDT to actually use, liquidity = LP minted
```

## 3. Approve + add liquidity (BNB-in variant for the WBNB side)

```ts
await usdt.approve(ROUTER, amountUsdt);

const SLIPPAGE_BPS = 100n;     // 1%
const wbnbMin = (amountBNB * (10_000n - SLIPPAGE_BPS)) / 10_000n;
const usdtMin = (amountUsdt * (10_000n - SLIPPAGE_BPS)) / 10_000n;
const deadline = Math.floor(Date.now() / 1000) + 60 * 20;

await router.addLiquidityETH(
  USDT,                   // the non-BNB token
  false,                  // stable=false (volatile pool)
  amountUsdt,             // amountTokenDesired
  usdtMin,                // amountTokenMin
  wbnbMin,                // amountETHMin (yes — this is amountWBNBMin)
  recipient,              // who receives the LP token
  deadline,
  { value: amountBNB }    // attach BNB; the Router wraps it to WBNB
);
```

If you already have WBNB ERC20 (not native), use `addLiquidity` instead:

```ts
await wbnb.approve(ROUTER, amountBNB);
await usdt.approve(ROUTER, amountUsdt);

await router.addLiquidity(
  WBNB, USDT, false,
  amountBNB, amountUsdt,
  wbnbMin, usdtMin,
  recipient, deadline
);
```

## 4. Stake the resulting LP in the gauge

The LP token contract IS the `pool` address itself (it's its own ERC20).

```ts
const gauge = await voter.gauges(POOL);
if (gauge === ethers.ZeroAddress) throw new Error("no gauge for this pool yet");

const lp = new ethers.Contract(POOL, erc20Abi, signer);
const lpBalance = await lp.balanceOf(recipient);

await lp.approve(gauge, lpBalance);
await gaugeContract.attach(gauge).deposit(lpBalance);
```

You'll now accrue TOPAZ at `rewardRate` per second proportional to your share of `gauge.totalSupply()`.

## CLI shortcut (combined add + stake)

```bash
yarn tsx src/cli/lp.ts add-v2 \
  --a 0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c \
  --b 0x55d398326f99059fF775485246999027B3197955 \
  --amount-a 1 \
  --slippage 100 \
  --stake
```

The CLI uses `addLiquidityETH` automatically if one side is WBNB and you didn't specify `--no-bnb`. `--stake` adds the gauge `deposit` as a follow-up transaction (or batched via multicall when available).

## Exiting

```bash
yarn tsx src/cli/lp.ts remove-v2 \
  --a 0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c \
  --b 0x55d398326f99059fF775485246999027B3197955 \
  --pct 100 \
  --slippage 100 \
  --unstake \
  --claim
```

Steps the CLI runs: `gauge.getReward(account)` → `gauge.withdraw(lp)` → `lp.approve(router, lp)` → `router.removeLiquidity[ETH](...)`.

## Notes

- Volatile pools are sensitive to the input ratio. If you supply off-ratio, one side is unused (you keep the surplus in your wallet, but the LP minted is smaller than possible). `quoteAddLiquidity` reports the actual usage.
- Stable pools' add-liquidity uses a different math: you typically don't think in terms of token ratio but in terms of equal value at the current internal price. Use `quoteStableLiquidityRatio` or the `quoteAddLiquidity` helper.
- Trading-fee yield for staked LPs **flows to voters**, not to LPs, once a gauge exists for the pool. To capture fees as an LP, leave the LP unstaked and call `Pool.claimFees()` periodically. Most LPs choose the gauge — emissions usually outweigh fee yield.
