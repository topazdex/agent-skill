# Example — Swap on a v3 CL Pool (TOPAZ → WBNB, single hop)

**Goal:** Swap 100 TOPAZ for WBNB through the TOPAZ/WBNB CL pool at `tickSpacing = 200`.

Tokens:
- TOPAZ: `0xdf002282C1474C9592780618Adda7EaA99998Abd` (18 dec)
- WBNB:  `0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c` (18 dec)

## 1. Find the pool & confirm it has liquidity

```ts
import { ethers, parseUnits, formatUnits } from "ethers";

const TICK_SPACING = 200;
const pool = await clFactory.getPool(TOPAZ, WBNB, TICK_SPACING);
if (pool === ethers.ZeroAddress) throw new Error("no CL pool at this tick spacing");

const slot0 = await clPool.attach(pool).slot0();
const liquidity = await clPool.attach(pool).liquidity();
if (liquidity === 0n) throw new Error("CL pool is dry — try a different tick spacing or v2");
```

## 2. Quote via QuoterV2 (off-chain only — use `.staticCall`)

```ts
const amountIn = parseUnits("100", 18);
const { amountOut, sqrtPriceX96After, initializedTicksCrossed, gasEstimate } =
  await quoterV2.quoteExactInputSingle.staticCall({
    tokenIn: TOPAZ,
    tokenOut: WBNB,
    amountIn,
    tickSpacing: TICK_SPACING,
    sqrtPriceLimitX96: 0n,    // no limit
  });

console.log(`Expected: ${formatUnits(amountOut, 18)} WBNB; ${initializedTicksCrossed} ticks crossed`);
```

## 3. Approve and execute

```ts
await topaz.approve(SWAP_ROUTER, amountIn);

const SLIPPAGE_BPS = 100n;    // 1.0%
const amountOutMinimum = (amountOut * (10_000n - SLIPPAGE_BPS)) / 10_000n;
const deadline = Math.floor(Date.now() / 1000) + 60 * 20;

await swapRouter.exactInputSingle({
  tokenIn: TOPAZ,
  tokenOut: WBNB,
  tickSpacing: TICK_SPACING,
  recipient,
  deadline,
  amountIn,
  amountOutMinimum,
  sqrtPriceLimitX96: 0n,
});
```

## 4. (Optional) BNB-out variant

To receive native BNB instead of WBNB, route to the SwapRouter and then unwrap with `multicall`:

```ts
const swapData = swapRouter.interface.encodeFunctionData("exactInputSingle", [{
  tokenIn: TOPAZ,
  tokenOut: WBNB,
  tickSpacing: TICK_SPACING,
  recipient: SWAP_ROUTER,        // hold WBNB in router temporarily
  deadline,
  amountIn,
  amountOutMinimum,
  sqrtPriceLimitX96: 0n,
}]);
const unwrapData = swapRouter.interface.encodeFunctionData("unwrapWETH9", [amountOutMinimum, recipient]);
await swapRouter.multicall([swapData, unwrapData]);
```

For BNB-in (TOPAZ → BNB doesn't apply here; for any X → Y where X is BNB):

```ts
// Wrap inside the multicall by sending msg.value
const swapData = swapRouter.interface.encodeFunctionData("exactInputSingle", [{
  tokenIn: WBNB,           // SwapRouter wraps msg.value to WBNB automatically
  tokenOut: USDT,
  tickSpacing: 200,
  recipient,
  deadline,
  amountIn: parseUnits("0.5", 18),
  amountOutMinimum,
  sqrtPriceLimitX96: 0n,
}]);
const refundData = swapRouter.interface.encodeFunctionData("refundETH", []);
await swapRouter.multicall([swapData, refundData], { value: parseUnits("0.5", 18) });
```

## CLI shortcut

```bash
yarn tsx src/cli/swap.ts v3 \
  --in 0xdf002282C1474C9592780618Adda7EaA99998Abd \
  --out 0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c \
  --amount 100 \
  --ts 200 \
  --slippage 100
```

## Picking the right tick spacing

If you don't know which `tickSpacing` to use, query the factory for all enabled spacings and pick whichever pool has the largest `liquidity`:

```ts
const spacings = await clFactory.tickSpacings();    // [1, 50, 100, 200, 2000]
const candidates = await Promise.all(spacings.map(async s => ({
  ts: Number(s),
  pool: await clFactory.getPool(TOPAZ, WBNB, s),
})));
const live = candidates.filter(c => c.pool !== ethers.ZeroAddress);
const withLiq = await Promise.all(live.map(async c => ({
  ...c,
  liquidity: await clPool.attach(c.pool).liquidity(),
})));
const best = withLiq.sort((a, b) => (b.liquidity > a.liquidity ? 1 : -1))[0];
console.log(`Best CL pool for TOPAZ/WBNB: tickSpacing=${best.ts}`);
```

`scripts/src/read/quotes.ts:topRoutes(tokenA, tokenB, amountIn, { allowMixed: false })` does this and additionally quotes each executable candidate to pick by output amount, not just by raw liquidity.
