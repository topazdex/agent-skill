# Example — Swap on a v2 Stable Pool (USDT → USDC)

**Goal:** Swap 1000 USDT for USDC through the stable curve pool.

Tokens (BSC, both 18 dec):
- USDT: `0x55d398326f99059fF775485246999027B3197955`
- USDC: `0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d`

## 1. Confirm a stable pool exists

```ts
const pool = await poolFactory.getPool(USDT, USDC, /* stable */ true);
if (pool === ethers.ZeroAddress) {
  // Fall back to volatile or v3 — see swapping-mixed.md
}
```

## 2. Quote both stable and volatile, pick the best

```ts
const amountIn = parseUnits("1000", 18);

const stableRoute = [{ from: USDT, to: USDC, stable: true,  factory: POOL_FACTORY }];
const volatileRoute = [{ from: USDT, to: USDC, stable: false, factory: POOL_FACTORY }];

const [stableOut, volatileOut] = await Promise.all([
  router.getAmountsOut(amountIn, stableRoute).catch(() => [0n, 0n]),
  router.getAmountsOut(amountIn, volatileRoute).catch(() => [0n, 0n]),
]).then(results => results.map(arr => arr[arr.length - 1]));

const useStable = stableOut >= volatileOut;
const routes = useStable ? stableRoute : volatileRoute;
const expectedOut = useStable ? stableOut : volatileOut;
console.log(`Best: ${useStable ? "stable" : "volatile"} — ${formatUnits(expectedOut, 18)} USDC`);
```

## 3. Approve & swap

```ts
await usdt.approve(ROUTER, amountIn);

const SLIPPAGE_BPS = 20n;     // 0.20% — stable pools are tight, can use less
const amountOutMin = (expectedOut * (10_000n - SLIPPAGE_BPS)) / 10_000n;
const deadline = Math.floor(Date.now() / 1000) + 60 * 20;

await router.swapExactTokensForTokens(amountIn, amountOutMin, routes, recipient, deadline);
```

## CLI shortcut

```bash
yarn tsx src/cli/swap.ts v2 \
  --in 0x55d398326f99059fF775485246999027B3197955 \
  --out 0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d \
  --amount 1000 \
  --stable \
  --slippage 20
```

## Why bother with the stable curve?

For correlated assets, the `x³y + xy³ = k` curve has dramatically lower price impact in the middle of the price range than `xy=k`. Within a few cents of $1, the stable curve might give 10–100× better effective price than the volatile pool — but only while the pegs hold. If one stablecoin depegs significantly, the stable curve produces large losses for one side; the protocol's `quoteStableLiquidityRatio` and the math in `Pool._k` handle this internally but it means **always quote both and take the larger output**.

For an even tighter quote on the same pair, also check the v3 `ts=1` pool (often the best venue at small-to-medium sizes for stablecoins). See `references/swapping-v3.md` and `examples/swap-v3-single-hop.md`.
