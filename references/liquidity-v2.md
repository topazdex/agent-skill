# Liquidity — v2 (volatile + stable pools)

v2 LP is a single fungible ERC20 token per pool. Mint via `Router.addLiquidity`, redeem via `Router.removeLiquidity`. The LP token doubles as the deposit token for the gauge — see `gauges.md`.

## Discovery

```ts
const pool = await poolFactory.getPool(tokenA, tokenB, stable);
// 0x0 if no pool yet; create with poolFactory.createPool(tokenA, tokenB, stable)
```

For a freshly created pool, the first `addLiquidity` defines the initial price (constrained to the formula). For an existing pool, the ratio is determined by current reserves.

## Quoting

```solidity
function quoteAddLiquidity(
    address tokenA,
    address tokenB,
    bool stable,
    address _factory,
    uint256 amountADesired,
    uint256 amountBDesired
) external view returns (uint256 amountA, uint256 amountB, uint256 liquidity);

function quoteRemoveLiquidity(
    address tokenA,
    address tokenB,
    bool stable,
    address _factory,
    uint256 liquidity
) external view returns (uint256 amountA, uint256 amountB);

function quoteStableLiquidityRatio(
    address tokenA,
    address tokenB,
    address _factory
) external view returns (uint256 ratio);
```

`quoteAddLiquidity` returns the **actual** amounts that will be used and the LP tokens minted — if your desired ratio is off, it will give you the smaller proportional amounts and report a smaller `liquidity`. The leftover token sits in the contract during the call but is not transferred back when the real `addLiquidity` runs — it's never taken from you.

## Adding liquidity

```solidity
function addLiquidity(
    address tokenA,
    address tokenB,
    bool stable,
    uint256 amountADesired,
    uint256 amountBDesired,
    uint256 amountAMin,
    uint256 amountBMin,
    address to,
    uint256 deadline
) external returns (uint256 amountA, uint256 amountB, uint256 liquidity);

// BNB-in variant
function addLiquidityETH(
    address token,
    bool stable,
    uint256 amountTokenDesired,
    uint256 amountTokenMin,
    uint256 amountETHMin,
    address to,
    uint256 deadline
) external payable returns (uint256 amountToken, uint256 amountETH, uint256 liquidity);
```

Standard slippage pattern: `amountAMin = quotedAmountA * (1 - slippage)`, same for B. Default slippage: 1% for add/remove on v2.

## Removing liquidity

```solidity
function removeLiquidity(
    address tokenA,
    address tokenB,
    bool stable,
    uint256 liquidity,
    uint256 amountAMin,
    uint256 amountBMin,
    address to,
    uint256 deadline
) external returns (uint256 amountA, uint256 amountB);

function removeLiquidityETH(...);
function removeLiquidityETHSupportingFeeOnTransferTokens(...);
```

The LP token must first be `approve`d to the Router. If the LP token is currently staked in a Gauge, you must `gauge.withdraw(amount)` first (which also claims pending TOPAZ rewards).

## Zaps

`Router` includes a zap that swaps one side of a pair to balance the input before adding liquidity:

```solidity
struct Zap {
    address tokenA;
    address tokenB;
    bool stable;
    address factory;
    uint256 amountOutMinA;
    uint256 amountOutMinB;
    uint256 amountAMin;
    uint256 amountBMin;
}

function zapIn(
    address tokenIn,
    uint256 amountInA,
    uint256 amountInB,
    Zap calldata zapInPool,
    Route[] calldata routesA,
    Route[] calldata routesB,
    address to,
    bool stake
) external payable returns (uint256 liquidity);

function zapOut(
    address tokenOut,
    uint256 liquidity,
    Zap calldata zapOutPool,
    Route[] calldata routesA,
    Route[] calldata routesB
) external;

function generateZapInParams(...) external view returns (...);   // pre-compute Zap params
function generateZapOutParams(...) external view returns (...);
```

Use `generateZapInParams` to compute the right `Zap` struct given desired input. Zaps are useful when you only have one token but want to LP a pair. The `stake` flag, when `true`, auto-stakes the resulting LP in the gauge for that pool — if it exists.

## Pool internals worth knowing

`Pool.metadata()` returns `(dec0, dec1, r0, r1, stable, t0, t1)` — convenient for normalized math.

`Pool.claimFees()` is callable by an LP and returns trading fees owed to that LP (separate from the gauge-distributed fees). Note: in the v(3,3) design, **once a pool has a gauge, all trading fees flow to the gauge / fee voting reward instead of accruing to LPs**. So LP-side fee claiming is only meaningful for pools without a live gauge.

## Sequence to LP and stake

```
1. router.addLiquidity(...)              // mint LP tokens to user
2. lpToken.approve(gauge, lpAmount)
3. gauge.deposit(lpAmount)               // stake → earn TOPAZ emissions
```

To exit and collect everything:

```
4. gauge.getReward(account)              // collect TOPAZ
5. gauge.withdraw(lpAmount)              // unstake LP
6. lpToken.approve(router, lpAmount)
7. router.removeLiquidity(...)           // burn LP → receive tokens
```

`scripts/src/write/liquidityV2.ts` exposes `addAndStake(...)` and `unstakeAndRemove(...)` that combine these.

## Scripts

| Operation | Where |
|---|---|
| Add | `scripts/src/write/liquidityV2.ts` — `addLiquidityV2({ tokenA, tokenB, stable, amounts, slippageBps })` |
| Remove | `removeLiquidityV2({ tokenA, tokenB, stable, liquidity, slippageBps })` |
| Quote add | `scripts/src/read/quotes.ts` — `quoteAddLiquidityV2(...)` |
| CLI | `yarn tsx src/cli/lp.ts add-v2 --a <addr> --b <addr> --amount-a <n> --amount-b <n> [--stable] [--slippage 100]` |

See `examples/add-liquidity-v2.md`.
