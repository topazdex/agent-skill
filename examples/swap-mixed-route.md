# Example — Quote a Mixed Route (TOPAZ → WBNB v3, WBNB → USDT v2 stable)

**Goal:** Quote selling 100 TOPAZ for USDT via a 2-hop route that uses the v3 CL pool for TOPAZ→WBNB and the v2 stable pool for WBNB→USDT. (Why? Sometimes the deepest pool for `TOPAZ` is v3 against WBNB, and the deepest WBNB↔USDT is a v2 pool — hybrid wins.)

We use `MixedRouteQuoterV1` for the quote, then execute as two separate transactions (no atomic mixed-route executor is deployed).

## 1. Encode the mixed path

Special sentinels for v2 hops (see `references/swapping-mixed.md`):

| hop type | encoded value |
|---|---|
| v3 with tickSpacing N | the int24 N (1, 50, 100, 200, 2000) |
| v2 volatile | -1 (encoded as `0xFFFFFF`) |
| v2 stable | -2 (encoded as `0xFFFFFE`) |

```ts
import { encodeMixedPath, V2_STABLE } from "./lib/path";

const TOPAZ = "0xdf002282C1474C9592780618Adda7EaA99998Abd";
const WBNB  = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c";
const USDT  = "0x55d398326f99059fF775485246999027B3197955";

const path = encodeMixedPath([TOPAZ, WBNB, USDT], [200, V2_STABLE]);
```

## 2. Quote

```ts
const amountIn = parseUnits("100", 18);
const [amountOut] = await mixedRouteQuoter.quoteExactInput.staticCall(path, amountIn);
console.log(`Mixed route output: ${formatUnits(amountOut, 18)} USDT`);
```

Compare against the pure-v3 route (if it exists) and the pure-v2 multihop. Pick the largest:

```ts
const v3Direct = await quoterV2.quoteExactInputSingle.staticCall({
  tokenIn: TOPAZ, tokenOut: USDT, amountIn, tickSpacing: 200, sqrtPriceLimitX96: 0n,
}).catch(() => ({ amountOut: 0n })).then(r => r.amountOut);

const v2Multihop = await router.getAmountsOut(amountIn, [
  { from: TOPAZ, to: WBNB, stable: false, factory: POOL_FACTORY },
  { from: WBNB,  to: USDT, stable: true,  factory: POOL_FACTORY },
]).catch(() => [0n, 0n, 0n]).then(arr => arr[arr.length - 1]);

const best = [
  { name: "v3-direct",       out: v3Direct },
  { name: "v2-multihop",     out: v2Multihop },
  { name: "mixed (v3+v2)",   out: amountOut },
].sort((a, b) => (b.out > a.out ? 1 : -1))[0];

console.log(`Winner: ${best.name} → ${formatUnits(best.out, 18)} USDT`);
```

## 3. Execute the chosen mixed route as two TXs

```ts
// Pre-quote per-leg so we can set sensible slippage on each
const [legOut1] = await quoterV2.quoteExactInputSingle.staticCall({
  tokenIn: TOPAZ, tokenOut: WBNB, amountIn, tickSpacing: 200, sqrtPriceLimitX96: 0n,
});

// Leg 1: TOPAZ → WBNB via v3
await topaz.approve(SWAP_ROUTER, amountIn);
const tx1 = await swapRouter.exactInputSingle({
  tokenIn: TOPAZ, tokenOut: WBNB, tickSpacing: 200,
  recipient,
  deadline: Math.floor(Date.now() / 1000) + 60 * 20,
  amountIn,
  amountOutMinimum: (legOut1 * 9900n) / 10_000n,    // 1% slippage on leg 1
  sqrtPriceLimitX96: 0n,
});
await tx1.wait();

// Leg 2: WBNB → USDT via v2 stable
await wbnb.approve(ROUTER, legOut1);
const tx2 = await router.swapExactTokensForTokens(
  legOut1,
  (amountOut * 9900n) / 10_000n,    // 1% slippage on the **overall** end-to-end output
  [{ from: WBNB, to: USDT, stable: true, factory: POOL_FACTORY }],
  recipient,
  Math.floor(Date.now() / 1000) + 60 * 20,
);
await tx2.wait();
```

Risk: between the two txs, the market can move. Set generous slippage on the second leg if you cannot atomically batch.

## CLI shortcut (quote-only)

```bash
yarn tsx src/cli/swap.ts best \
  --in 0xdf002282C1474C9592780618Adda7EaA99998Abd \
  --out 0x55d398326f99059fF775485246999027B3197955 \
  --amount 100
```

This prints the best route across direct v2 volatile / v2 stable / v3 (each enabled tick spacing) / 2-hop via WBNB & USDT (every v2/v3 combination). To execute, add `--execute` and the CLI will dispatch the best single-stack route automatically (mixed-stack routes require manual two-tx execution per the script above; the CLI prints the leg breakdown for you to confirm).
