# Example — Swap on a v2 Volatile Pool (WBNB → USDT)

**Goal:** Sell 0.5 BNB for USDT through the WBNB/USDT volatile pool.

Tokens (see `references/tokens.md`):

- WBNB: `0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c` (18 dec)
- USDT (BSC): `0x55d398326f99059fF775485246999027B3197955` (18 dec)

## 1. Sanity-check the pool exists

```ts
import { ethers } from "ethers";
const pool = await poolFactory.getPool(WBNB, USDT, /* stable */ false);
if (pool === ethers.ZeroAddress) throw new Error("no volatile pool");
```

## 2. Quote

```ts
import { parseUnits, formatUnits } from "ethers";

const amountIn = parseUnits("0.5", 18);     // 0.5 BNB worth of WBNB
const routes = [{
  from: WBNB,
  to: USDT,
  stable: false,
  factory: POOL_FACTORY,           // 0x65E6cD0eF5D3467030103cf3d433034E570b5784
}];
const amounts = await router.getAmountsOut(amountIn, routes);
const expectedOut = amounts[amounts.length - 1];
console.log(`Expected: ${formatUnits(expectedOut, 18)} USDT`);
```

## 3. Apply slippage and execute (BNB-in path)

Because we're swapping native BNB (not pre-wrapped WBNB), use `swapExactETHForTokens`:

```ts
const SLIPPAGE_BPS = 50n;       // 0.50%
const amountOutMin = (expectedOut * (10_000n - SLIPPAGE_BPS)) / 10_000n;
const deadline = Math.floor(Date.now() / 1000) + 60 * 20;   // +20 min

const tx = await router.swapExactETHForTokens(
  amountOutMin,
  routes,
  recipient,
  deadline,
  { value: amountIn }
);
const receipt = await tx.wait();
console.log("swap mined", receipt.hash);
```

If you instead had pre-existing **WBNB ERC20** to swap, the flow is:

```ts
await wbnb.approve(ROUTER, amountIn);    // one-time per allowance
await router.swapExactTokensForTokens(amountIn, amountOutMin, routes, recipient, deadline);
```

## CLI shortcut

```bash
cd ~/topaz/topaz-skill/scripts
yarn tsx src/cli/swap.ts v2 \
  --in 0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c \
  --out 0x55d398326f99059fF775485246999027B3197955 \
  --amount 0.5 \
  --slippage 50
```

The CLI auto-routes BNB-in / BNB-out using the ETH variants when either side is WBNB and `--use-bnb` flag is present (default).

## Notes

- Volatile pools use `xy=k`. Price impact is significant for sizes beyond ~0.5% of one side's reserve. If you're moving size, check `Pool.getReserves()` first and compare your amount to `r0`/`r1`.
- The Router applies the pool's current fee (`PoolFactory.getFee(pool, false)`, default 30 = 0.30%) automatically — `expectedOut` is already net of fees.
