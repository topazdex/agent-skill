# Liquidity — v3 (Concentrated Liquidity / Slipstream)

v3 positions are **NFTs** (ERC721) minted by `NonfungiblePositionManager` at `0xf8c30c3C362941C23025f2eA30B066A73C982f63`. Each position is a tuple `(pool, owner, tickLower, tickUpper, liquidity)`.

If the user would rather not pick and maintain a range, Topaz **Auto Manage** vaults hold a keeper-managed CL position and issue ERC-20 shares instead of an NFT — see [auto-manage.md](auto-manage.md). Everything below is the self-managed NFT path.

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
    uint160 sqrtPriceX96;      // 0 for an existing pool; nonzero = create the pool at this price first (reverts if it exists)
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

`tokensOwed0/1` are fees that have been "settled" by a prior `collect()`. To see pending uncollected fees, you need to compute them from `feeGrowthInside0LastX128` vs current `pool.feeGrowthGlobal0X128` — or simulate `NPM.collect({ tokenId, recipient: owner, amount0Max: 2^128-1, amount1Max: 2^128-1 })` as a `staticCall` from the owner, which returns the collectable amounts (unstaked positions; a staked position's NFT is held by the gauge).

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

Set `amount0Min` / `amount1Min` from a fresh quote or `staticCall` result with slippage applied. A zero min is only acceptable for a leg whose expected amount is actually zero.

`burn(tokenId)` requires `liquidity == 0 && tokensOwed0 == 0 && tokensOwed1 == 0`.

## BNB handling

`NonfungiblePositionManager` has the same `multicall` + `unwrapWETH9` + `refundETH` + `sweepToken` helpers as `SwapRouter`. For BNB-in (`token{0,1}` includes WBNB):

```ts
const mintData = npm.interface.encodeFunctionData("mint", [{ ... }]);
const refundData = npm.interface.encodeFunctionData("refundETH", []);
await npm.multicall([mintData, refundData], { value: amountBNB });
```

For native-out, see [exit with native unwrap](#exit-with-native-unwrap) below.

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

## Position lifecycle

Verified on a BNB fork (2026-09-29) against the deployed NonfungiblePositionManager and CLGauge. The same calls apply on every chain; spoke gauges pay xTOPAZ instead of TOPAZ. On Arc there is no native leg, so skip the unwrap pattern there.

### Staked positions

While staked, the **gauge owns the NFT**, and `CLGauge` has no `increaseStakedLiquidity` or `decreaseStakedLiquidity`. So NPM changes to a staked position revert: `increaseLiquidity` with `NG` (only the gauge may add to a staked position), and `decreaseLiquidity` / `collect` / `burn` with `Not approved` (the gauge, not the user, owns the NFT). Before an increase, partial or full exit, or rebalance:

1. `CLGauge.withdraw(tokenId)`. It also collects fees to the owner and pays pending emissions, so there is no separate claim first.
2. Make the NPM change.
3. Restake: `NPM.approve(gauge, tokenId)`, then `CLGauge.deposit(tokenId)`. `deposit` requires a live gauge (`Voter.isAlive`) and a position in that gauge's pool.

Claims differ by state. Staked: `CLGauge.getReward(tokenId)` pays emissions, and trading fees go to voters, not the LP. Unstaked: `NPM.collect` pays trading fees, and there are no emissions.

### Rebalance in one transaction

Move an unstaked position to a new range with one `NPM.multicall`:

```ts
const calls = [
  npm.interface.encodeFunctionData("decreaseLiquidity", [{ tokenId, liquidity: position.liquidity, amount0Min, amount1Min, deadline }]),
  npm.interface.encodeFunctionData("collect", [{ tokenId, recipient: owner, amount0Max: MAX_U128, amount1Max: MAX_U128 }]),
  npm.interface.encodeFunctionData("burn", [tokenId]),
  npm.interface.encodeFunctionData("mint", [{
    token0, token1, tickSpacing, tickLower: newLower, tickUpper: newUpper,
    amount0Desired: proceeds0, amount1Desired: proceeds1,   // decreased principal + tokensOwed
    amount0Min: mintMin0, amount1Min: mintMin1, recipient: owner, deadline, sqrtPriceX96: 0n,
  }]),
];
await npm.multicall(calls);
```

- `collect` pays the owner, then `mint` pulls from the owner in the same transaction. So the owner needs **ERC20 allowances to the NPM** for both proceeds before sending; check and approve first.
- Take `proceeds0/1` from a `staticCall` of the decrease plus collect (or position math plus `tokensOwed`). Derive the mint minimums from the new range at the current price, not from the proceeds.
- Nothing is swapped. The new range uses what it can, and the rest stays in the owner's wallet, not in the NPM. The new position starts unstaked; read its id from the mint's `Transfer` from `address(0)`, then restake.
- A staked position must be unstaked in an earlier transaction, because the gauge owns the NFT.

### Exit with native unwrap

To receive native BNB/ETH instead of the wrapped token, collect into the NPM and pay out from there:

```ts
await npm.multicall([
  npm.interface.encodeFunctionData("decreaseLiquidity", [{ tokenId, liquidity, amount0Min, amount1Min, deadline }]),
  npm.interface.encodeFunctionData("collect", [{ tokenId, recipient: ZeroAddress, amount0Max: MAX_U128, amount1Max: MAX_U128 }]),
  npm.interface.encodeFunctionData("unwrapWETH9", [minWrapped, owner]),
  npm.interface.encodeFunctionData("sweepToken", [otherToken, minOther, owner]),
  npm.interface.encodeFunctionData("burn", [tokenId]),   // full exit only
]);
```

`collect` with `recipient = address(0)` leaves the tokens in the NPM. `unwrapWETH9` pays the wrapped side as native, and `sweepToken` pays the other token. Set both minimums from the decrease minimums plus fees owed, never zero on a leg you expect to receive. Arc's `WETH9()` is a reverting placeholder, so use a plain `collect` to the owner there.

### Range presets

The Topaz AI Wallet and agent service size ranges in tick spacings around the current tick, centred on `round(tick / tickSpacing) * tickSpacing`:

| Preset | Range |
|---|---|
| narrow | ±5 tick spacings |
| medium (default) | ±20 tick spacings |
| wide | ±60 tick spacings |
| full | the lowest and highest usable ticks for the spacing |

Clamp both bounds to the usable tick range for the spacing. Narrow ranges earn more per dollar while in range but go out of range sooner. Presets are a starting point, not advice for a specific pool.

See `gauges.md` for `CLGauge` specifics and `examples/mint-v3-position.md` + `examples/stake-position-cl-gauge.md` for walkthroughs.

## Scripts

| Operation | Where |
|---|---|
| Compute ticks for range | `scripts/src/lib/tickMath.ts` |
| Mint | `scripts/src/write/liquidityV3.ts` — `mintPosition({ tokenA, tokenB, tickSpacing, rangeTicks? \| lowerPrice + upperPrice, amountA? , amountB?, slippageBps?, chainId? })` — give one amount and the other is derived from the range |
| Increase | `increaseLiquidity({ tokenId, amount0Desired, amount1Desired, slippageBps?, chainId? })` (wei) |
| Decrease | `decreaseLiquidity({ tokenId, liquidityPct? \| liquidity?, slippageBps?, chainId? })` |
| Collect | `collectFees({ tokenId, recipient?, chainId? })` |
| Burn | `burnPosition(tokenId, chainId?)` |
| Read position | `scripts/src/read/positions.ts` — `getPosition(tokenId, chainId?)` (range, liquidity, `tokensOwed`, in-range), `listOwnerPositions(owner, chainId?)` |
| CLI | `yarn tsx src/cli/lp.ts mint-v3 --t0 <addr> --t1 <addr> --ts 200 --lower-price 1.2 --upper-price 1.8 --amount0 100` etc. — add `--chain <id\|name>` for Robinhood, Base, Ethereum or Arc |
