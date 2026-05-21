# Liquidity — v3 (Concentrated Liquidity / Slipstream)

v3 positions are **NFTs** (ERC721) minted by `NonfungiblePositionManager` at `0xf8c30c3C362941C23025f2eA30B066A73C982f63`. Each position is a tuple `(pool, owner, tickLower, tickUpper, liquidity)`.

## Tick math

Concentrated liquidity uses ticks to represent prices.

- `tick = ⌊ log(price) / log(1.0001) ⌋` where `price = token1 / token0` (both in their base units, not human-readable — decimals matter).
- `sqrtPriceX96 = sqrt(price) * 2**96` (Q64.96 fixed point).
- `MIN_TICK = -887272`, `MAX_TICK = 887272`.
- `MIN_SQRT_RATIO = 4295128739`, `MAX_SQRT_RATIO = 1461446703485210103287273052203988822378723970342`.

**`tickLower` and `tickUpper` must be multiples of the pool's `tickSpacing`.** Floor/ceil accordingly:

```ts
const floor = (t: number, sp: number) => Math.floor(t / sp) * sp;
const ceil  = (t: number, sp: number) => Math.ceil(t / sp) * sp;
```

Helpers in `scripts/src/lib/tickMath.ts`:

```ts
priceToTick(price: number, dec0: number, dec1: number): number;
tickToPrice(tick: number, dec0: number, dec1: number): number;
sqrtPriceX96ToPrice(sqrtPriceX96: bigint, dec0: number, dec1: number): number;
priceToSqrtPriceX96(price: number, dec0: number, dec1: number): bigint;
getSqrtRatioAtTick(tick: number): bigint;
getTickAtSqrtRatio(sqrtPriceX96: bigint): number;
nearestUsableTick(tick: number, tickSpacing: number): number;
```

For a position centered at the current price with ±X% width:

```ts
const slot0 = await pool.slot0();
const currentTick = Number(slot0.tick);
const halfWidth = 50;       // ±50 ticks ≈ ±0.5% — small for ts=1, large for ts=200
const tickLower = nearestUsableTick(currentTick - halfWidth, tickSpacing);
const tickUpper = nearestUsableTick(currentTick + halfWidth, tickSpacing);
```

## Creating a position

```solidity
struct MintParams {
    address token0;
    address token1;
    int24   tickSpacing;
    int24   tickLower;
    int24   tickUpper;
    uint256 amount0Desired;
    uint256 amount1Desired;
    uint256 amount0Min;        // slippage protection
    uint256 amount1Min;
    address recipient;
    uint256 deadline;
    uint160 sqrtPriceX96;      // *initial* price if pool needs creating (else ignored)
}
function mint(MintParams calldata params)
    external payable returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1);
```

**Rules:**

- `token0 < token1` (lexicographic). Use `Router.sortTokens` or sort yourself.
- Both `amount0Desired` and `amount1Desired` must be approved to the position manager beforehand (use `ERC20.approve(npm, amount)`).
- Slippage: pick `amountXMin = amountXDesired * (1 - slippage)` with slippage 0.5–1%.
- If the position is fully out of range (`tickUpper <= currentTick` or `tickLower >= currentTick`), only one token is consumed — the other is unused. This is correct.
- Returns: `tokenId` is your NFT.

### Computing matched amounts

If you specify `amount0Desired` and want the matching `amount1Desired` at the current price for a given range:

```ts
import { ethers } from "ethers";
// SugarHelper is a periphery helper for these conversions (see slipstream periphery)
const amount1 = await sugarHelper.estimateAmount1(amount0, pool, sqrtPriceX96, tickLower, tickUpper);
```

Or compute locally in `tickMath.ts` via the standard Uniswap V3 formulas.

## Reading a position

```solidity
function positions(uint256 tokenId) external view returns (
    uint96 nonce,
    address operator,
    address token0,
    address token1,
    int24 tickSpacing,
    int24 tickLower,
    int24 tickUpper,
    uint128 liquidity,
    uint256 feeGrowthInside0LastX128,
    uint256 feeGrowthInside1LastX128,
    uint128 tokensOwed0,
    uint128 tokensOwed1
);
```

`tokensOwed0/1` are fees that have been "settled" by a prior `collect()`. To see pending uncollected fees, you need to compute them from `feeGrowthInside0LastX128` vs current `pool.feeGrowthGlobal0X128` — `scripts/src/read/positions.ts:getPositionWithFees(tokenId)` does this for you.

To list a user's positions: enumerate via `NonfungiblePositionManager.tokenOfOwnerByIndex(owner, i)` from `i = 0` to `balanceOf(owner) - 1`.

## Increasing liquidity

```solidity
struct IncreaseLiquidityParams {
    uint256 tokenId;
    uint256 amount0Desired;
    uint256 amount1Desired;
    uint256 amount0Min;
    uint256 amount1Min;
    uint256 deadline;
}
function increaseLiquidity(IncreaseLiquidityParams calldata params)
    external payable returns (uint128 liquidity, uint256 amount0, uint256 amount1);
```

The range stays the same. Approve both tokens first. **Cannot be called while the NFT is staked in a `CLGauge` — withdraw first.**

## Decreasing liquidity

```solidity
struct DecreaseLiquidityParams {
    uint256 tokenId;
    uint128 liquidity;        // amount of liquidity to remove
    uint256 amount0Min;
    uint256 amount1Min;
    uint256 deadline;
}
function decreaseLiquidity(DecreaseLiquidityParams calldata params)
    external payable returns (uint256 amount0, uint256 amount1);
```

This **does not transfer tokens to you**. It moves them into `tokensOwed{0,1}`. You then call `collect` to pull them out.

To remove 100% of liquidity, pass the full `liquidity` from `positions()`.

## Collecting fees and principal

```solidity
struct CollectParams {
    uint256 tokenId;
    address recipient;
    uint128 amount0Max;     // type(uint128).max = collect everything owed
    uint128 amount1Max;
}
function collect(CollectParams calldata params)
    external payable returns (uint256 amount0, uint256 amount1);
```

This is how both **fees** and **decreased-but-not-yet-collected principal** are transferred to `recipient`. Two-step pattern:

```ts
// Just collect fees (don't change liquidity)
await npm.collect({ tokenId, recipient: user, amount0Max: MAX_U128, amount1Max: MAX_U128 });

// Withdraw all and burn
await npm.decreaseLiquidity({ tokenId, liquidity: position.liquidity, amount0Min, amount1Min, deadline });
await npm.collect({ tokenId, recipient: user, amount0Max: MAX_U128, amount1Max: MAX_U128 });
await npm.burn(tokenId);    // optional: delete the empty NFT
```

`burn(tokenId)` requires `liquidity == 0 && tokensOwed0 == 0 && tokensOwed1 == 0`.

## BNB handling

`NonfungiblePositionManager` has the same `multicall` + `unwrapWETH9` + `refundETH` + `sweepToken` helpers as `SwapRouter`. For BNB-in (`token{0,1}` includes WBNB):

```ts
const mintData = npm.interface.encodeFunctionData("mint", [{ ... }]);
const refundData = npm.interface.encodeFunctionData("refundETH", []);
await npm.multicall([mintData, refundData], { value: amountBNB });
```

For BNB-out on `collect`/`decreaseLiquidity`, route to `recipient = NPMAddress`, then `unwrapWETH9(min, user)`.

## Sequence: mint + stake in CL gauge

```
1. ERC20.approve(NPM, amount) for both token0 and token1
2. NPM.mint({ ... }) → tokenId
3. NPM.approve(clGauge, tokenId)
4. CLGauge.deposit(tokenId)
```

To exit:

```
5. CLGauge.withdraw(tokenId)    // auto-claims TOPAZ rewards; NFT returns to your wallet
6. NPM.collect(...)              // pull accumulated fees
7. NPM.decreaseLiquidity(...) + collect(...)   // unwind principal
8. NPM.burn(tokenId)             // optional cleanup
```

See `gauges.md` for `CLGauge` specifics and `examples/mint-v3-position.md` + `examples/stake-position-cl-gauge.md` for walkthroughs.

## Scripts

| Operation | Where |
|---|---|
| Compute ticks for range | `scripts/src/lib/tickMath.ts` |
| Mint | `scripts/src/write/liquidityV3.ts` — `mintPosition({ token0, token1, tickSpacing, lowerPrice, upperPrice, amount0, amount1, slippageBps })` |
| Increase | `increaseLiquidity({ tokenId, amount0, amount1, slippageBps })` |
| Decrease | `decreaseLiquidity({ tokenId, liquidityPct, slippageBps })` |
| Collect | `collectFees({ tokenId, recipient })` |
| Burn | `burnPosition(tokenId)` |
| Read position | `scripts/src/read/positions.ts` — `getPositionWithFees(tokenId)`, `listOwnerPositions(owner)` |
| CLI | `yarn tsx src/cli/lp.ts mint-v3 --t0 <addr> --t1 <addr> --ts 200 --lower-price 1.2 --upper-price 1.8 --amount0 100` etc. |
