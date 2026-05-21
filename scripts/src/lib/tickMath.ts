// Standard Uniswap V3 tick math, ported to BigInt.
// Reference: @uniswap/v3-sdk TickMath / SqrtPriceMath.

export const MIN_TICK = -887272;
export const MAX_TICK = 887272;
export const MIN_SQRT_RATIO = 4295128739n;
export const MAX_SQRT_RATIO = 1461446703485210103287273052203988822378723970342n;
export const Q96 = 1n << 96n;
export const Q128 = 1n << 128n;
export const Q192 = 1n << 192n;

function mulShift(val: bigint, mulBy: bigint): bigint {
  return (val * mulBy) >> 128n;
}

const POWERS_OF_2: [number, bigint][] = [
  [128, 0xffffffffffffffffffffffffffffffffn],
  [64, 0xffffffffffffffffn],
  [32, 0xffffffffn],
  [16, 0xffffn],
  [8, 0xffn],
  [4, 0xfn],
  [2, 0x3n],
  [1, 0x1n],
];

export function getSqrtRatioAtTick(tick: number): bigint {
  const absTick = Math.abs(tick);
  if (absTick > MAX_TICK) throw new Error("tick out of range");
  let ratio: bigint =
    (absTick & 0x1) !== 0
      ? 0xfffcb933bd6fad37aa2d162d1a594001n
      : 0x100000000000000000000000000000000n;
  if ((absTick & 0x2) !== 0) ratio = mulShift(ratio, 0xfff97272373d413259a46990580e213an);
  if ((absTick & 0x4) !== 0) ratio = mulShift(ratio, 0xfff2e50f5f656932ef12357cf3c7fdccn);
  if ((absTick & 0x8) !== 0) ratio = mulShift(ratio, 0xffe5caca7e10e4e61c3624eaa0941cd0n);
  if ((absTick & 0x10) !== 0) ratio = mulShift(ratio, 0xffcb9843d60f6159c9db58835c926644n);
  if ((absTick & 0x20) !== 0) ratio = mulShift(ratio, 0xff973b41fa98c081472e6896dfb254c0n);
  if ((absTick & 0x40) !== 0) ratio = mulShift(ratio, 0xff2ea16466c96a3843ec78b326b52861n);
  if ((absTick & 0x80) !== 0) ratio = mulShift(ratio, 0xfe5dee046a99a2a811c461f1969c3053n);
  if ((absTick & 0x100) !== 0) ratio = mulShift(ratio, 0xfcbe86c7900a88aedcffc83b479aa3a4n);
  if ((absTick & 0x200) !== 0) ratio = mulShift(ratio, 0xf987a7253ac413176f2b074cf7815e54n);
  if ((absTick & 0x400) !== 0) ratio = mulShift(ratio, 0xf3392b0822b70005940c7a398e4b70f3n);
  if ((absTick & 0x800) !== 0) ratio = mulShift(ratio, 0xe7159475a2c29b7443b29c7fa6e889d9n);
  if ((absTick & 0x1000) !== 0) ratio = mulShift(ratio, 0xd097f3bdfd2022b8845ad8f792aa5825n);
  if ((absTick & 0x2000) !== 0) ratio = mulShift(ratio, 0xa9f746462d870fdf8a65dc1f90e061e5n);
  if ((absTick & 0x4000) !== 0) ratio = mulShift(ratio, 0x70d869a156d2a1b890bb3df62baf32f7n);
  if ((absTick & 0x8000) !== 0) ratio = mulShift(ratio, 0x31be135f97d08fd981231505542fcfa6n);
  if ((absTick & 0x10000) !== 0) ratio = mulShift(ratio, 0x9aa508b5b7a84e1c677de54f3e99bc9n);
  if ((absTick & 0x20000) !== 0) ratio = mulShift(ratio, 0x5d6af8dedb81196699c329225ee604n);
  if ((absTick & 0x40000) !== 0) ratio = mulShift(ratio, 0x2216e584f5fa1ea926041bedfe98n);
  if ((absTick & 0x80000) !== 0) ratio = mulShift(ratio, 0x48a170391f7dc42444e8fa2n);

  if (tick > 0) ratio = (1n << 256n) / ratio;

  // back to Q96, round up
  return (ratio >> 32n) + (ratio % (1n << 32n) === 0n ? 0n : 1n);
}

export function getTickAtSqrtRatio(sqrtPriceX96: bigint): number {
  if (sqrtPriceX96 < MIN_SQRT_RATIO || sqrtPriceX96 >= MAX_SQRT_RATIO) {
    throw new Error("sqrtPriceX96 out of range");
  }
  const sqrtPriceX128 = sqrtPriceX96 << 32n;
  let r = sqrtPriceX128;
  let msb = 0;
  for (const [bit, mask] of POWERS_OF_2) {
    // `bit` already encodes the magnitude (128, 64, ...); the Solidity reference
    // uses `shl(7, gt(...))` etc. where 7,6,... map to those same magnitudes.
    // JS `1 << 128` overflows to 1 (32-bit shift), so we must use `bit` directly.
    const f = r > mask ? bit : 0;
    msb |= f;
    r >>= BigInt(f);
  }
  if (msb >= 128) r = sqrtPriceX128 >> BigInt(msb - 127);
  else r = sqrtPriceX128 << BigInt(127 - msb);
  let log_2: bigint = (BigInt(msb) - 128n) << 64n;
  for (let i = 0; i < 14; i++) {
    r = (r * r) >> 127n;
    const f2 = r >> 128n;
    log_2 |= f2 << BigInt(63 - i);
    r >>= f2;
  }
  const log_sqrt10001 = log_2 * 255738958999603826347141n;
  const tickLow = Number((log_sqrt10001 - 3402992956809132418596140100660247210n) >> 128n);
  const tickHigh = Number((log_sqrt10001 + 291339464771989622907027621153398088495n) >> 128n);
  if (tickLow === tickHigh) return tickLow;
  return getSqrtRatioAtTick(tickHigh) <= sqrtPriceX96 ? tickHigh : tickLow;
}

export function nearestUsableTick(tick: number, tickSpacing: number): number {
  const rounded = Math.round(tick / tickSpacing) * tickSpacing;
  if (rounded < MIN_TICK) return rounded + tickSpacing;
  if (rounded > MAX_TICK) return rounded - tickSpacing;
  return rounded;
}

// price = token1 / token0 (in raw units before decimal-adjustment)
export function sqrtPriceX96ToPriceRaw(sqrtPriceX96: bigint): number {
  const ratio = (Number(sqrtPriceX96) / Number(Q96)) ** 2;
  return ratio;
}

export function sqrtPriceX96ToPrice(sqrtPriceX96: bigint, dec0: number, dec1: number): number {
  return sqrtPriceX96ToPriceRaw(sqrtPriceX96) * 10 ** (dec0 - dec1);
}

export function priceToSqrtPriceX96(price: number, dec0: number, dec1: number): bigint {
  const adjusted = price * 10 ** (dec1 - dec0);
  const sqrtRatio = Math.sqrt(adjusted);
  return BigInt(Math.floor(sqrtRatio * Number(Q96)));
}

export function priceToTick(price: number, dec0: number, dec1: number): number {
  return getTickAtSqrtRatio(priceToSqrtPriceX96(price, dec0, dec1));
}

export function tickToPrice(tick: number, dec0: number, dec1: number): number {
  return sqrtPriceX96ToPrice(getSqrtRatioAtTick(tick), dec0, dec1);
}

// Liquidity <-> amount helpers (Uniswap V3 LiquidityMath).
// amount0 = L * (sqrtB - sqrtA) / (sqrtA * sqrtB) * Q96; amount1 = L * (sqrtB - sqrtA) / Q96
export function getAmount0ForLiquidity(
  sqrtA: bigint,
  sqrtB: bigint,
  liquidity: bigint
): bigint {
  if (sqrtA > sqrtB) [sqrtA, sqrtB] = [sqrtB, sqrtA];
  const numerator1 = liquidity << 96n;
  const numerator2 = sqrtB - sqrtA;
  return (numerator1 * numerator2) / sqrtB / sqrtA;
}

export function getAmount1ForLiquidity(
  sqrtA: bigint,
  sqrtB: bigint,
  liquidity: bigint
): bigint {
  if (sqrtA > sqrtB) [sqrtA, sqrtB] = [sqrtB, sqrtA];
  return (liquidity * (sqrtB - sqrtA)) / Q96;
}

export function getAmountsForLiquidity(
  sqrtPrice: bigint,
  sqrtLower: bigint,
  sqrtUpper: bigint,
  liquidity: bigint
): { amount0: bigint; amount1: bigint } {
  if (sqrtPrice <= sqrtLower) {
    return {
      amount0: getAmount0ForLiquidity(sqrtLower, sqrtUpper, liquidity),
      amount1: 0n,
    };
  } else if (sqrtPrice < sqrtUpper) {
    return {
      amount0: getAmount0ForLiquidity(sqrtPrice, sqrtUpper, liquidity),
      amount1: getAmount1ForLiquidity(sqrtLower, sqrtPrice, liquidity),
    };
  }
  return {
    amount0: 0n,
    amount1: getAmount1ForLiquidity(sqrtLower, sqrtUpper, liquidity),
  };
}

export function getLiquidityForAmount0(
  sqrtA: bigint,
  sqrtB: bigint,
  amount0: bigint
): bigint {
  if (sqrtA > sqrtB) [sqrtA, sqrtB] = [sqrtB, sqrtA];
  const intermediate = (sqrtA * sqrtB) / Q96;
  return (amount0 * intermediate) / (sqrtB - sqrtA);
}

export function getLiquidityForAmount1(
  sqrtA: bigint,
  sqrtB: bigint,
  amount1: bigint
): bigint {
  if (sqrtA > sqrtB) [sqrtA, sqrtB] = [sqrtB, sqrtA];
  return (amount1 * Q96) / (sqrtB - sqrtA);
}

export function getLiquidityForAmounts(
  sqrtPrice: bigint,
  sqrtLower: bigint,
  sqrtUpper: bigint,
  amount0: bigint,
  amount1: bigint
): bigint {
  if (sqrtPrice <= sqrtLower) {
    return getLiquidityForAmount0(sqrtLower, sqrtUpper, amount0);
  } else if (sqrtPrice < sqrtUpper) {
    const liq0 = getLiquidityForAmount0(sqrtPrice, sqrtUpper, amount0);
    const liq1 = getLiquidityForAmount1(sqrtLower, sqrtPrice, amount1);
    return liq0 < liq1 ? liq0 : liq1;
  }
  return getLiquidityForAmount1(sqrtLower, sqrtUpper, amount1);
}

/**
 * Given an `amount0` to deposit at the current sqrtPrice across [lower, upper],
 * compute the matching `amount1` so the deposit uses both sides at the implied ratio.
 */
export function matchedAmount1(
  amount0: bigint,
  sqrtPrice: bigint,
  sqrtLower: bigint,
  sqrtUpper: bigint
): bigint {
  if (sqrtPrice <= sqrtLower) return 0n;
  if (sqrtPrice >= sqrtUpper) {
    // Position is fully token1 — caller should pass amount1 instead.
    return 0n;
  }
  const liquidity = getLiquidityForAmount0(sqrtPrice, sqrtUpper, amount0);
  return getAmount1ForLiquidity(sqrtLower, sqrtPrice, liquidity);
}
