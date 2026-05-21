import { Contract, ZeroAddress, getAddress } from "ethers";
import { ABIS } from "../lib/abis.js";
import { provider } from "../lib/client.js";
import { ADDR, TICK_SPACINGS } from "../config/addresses.js";
import { getDecimals, getSymbol } from "../lib/erc20.js";

export type PoolType = "v2" | "v3";

export interface PoolInfoV2 {
  type: "v2";
  address: string;
  token0: string;
  token1: string;
  decimals0: number;
  decimals1: number;
  symbol0: string;
  symbol1: string;
  reserve0: bigint;
  reserve1: bigint;
  stable: boolean;
  fee: number; // bps-style (30 = 0.30%)
  totalSupply: bigint;
}

export interface PoolInfoV3 {
  type: "v3";
  address: string;
  token0: string;
  token1: string;
  decimals0: number;
  decimals1: number;
  symbol0: string;
  symbol1: string;
  tickSpacing: number;
  fee: number; // pips (1e-6)
  unstakedFee: number;
  sqrtPriceX96: bigint;
  tick: number;
  liquidity: bigint;
  stakedLiquidity: bigint;
}

export type PoolInfo = PoolInfoV2 | PoolInfoV3;

const poolFactory = () => new Contract(ADDR.PoolFactory, ABIS.PoolFactory, provider());
const clFactory = () => new Contract(ADDR.CLFactory, ABIS.CLFactory, provider());
const poolC = (addr: string) => new Contract(addr, ABIS.Pool, provider());
const clPoolC = (addr: string) => new Contract(addr, ABIS.CLPool, provider());

export async function detectPoolType(address: string): Promise<PoolType> {
  const a = getAddress(address);
  const [isV2, isV3] = await Promise.all([
    poolFactory().isPool(a).catch(() => false),
    clFactory().isPool(a).catch(() => false),
  ]);
  if (isV2) return "v2";
  if (isV3) return "v3";
  throw new Error(`address ${a} is not a Topaz v2 or v3 pool`);
}

export async function getPoolV2(address: string): Promise<PoolInfoV2> {
  const a = getAddress(address);
  const c = poolC(a);
  const [tokens, reserves, stable, totalSupply] = await Promise.all([
    c.tokens() as Promise<[string, string]>,
    c.getReserves() as Promise<[bigint, bigint, bigint]>,
    c.stable() as Promise<boolean>,
    c.totalSupply() as Promise<bigint>,
  ]);
  const [t0, t1] = tokens;
  const [r0, r1] = reserves;
  const fee: bigint = await poolFactory().getFee(a, stable);
  const [d0, d1, s0, s1] = await Promise.all([
    getDecimals(t0),
    getDecimals(t1),
    getSymbol(t0),
    getSymbol(t1),
  ]);
  return {
    type: "v2",
    address: a,
    token0: t0,
    token1: t1,
    decimals0: d0,
    decimals1: d1,
    symbol0: s0,
    symbol1: s1,
    reserve0: r0,
    reserve1: r1,
    stable,
    fee: Number(fee),
    totalSupply,
  };
}

export async function getPoolV3(address: string): Promise<PoolInfoV3> {
  const a = getAddress(address);
  const c = clPoolC(a);
  const [token0, token1, slot0, liquidity, stakedLiquidity, tickSpacing, fee, unstakedFee] =
    await Promise.all([
      c.token0() as Promise<string>,
      c.token1() as Promise<string>,
      c.slot0() as Promise<
        [bigint, bigint, bigint, bigint, bigint, boolean]
      >,
      c.liquidity() as Promise<bigint>,
      c.stakedLiquidity() as Promise<bigint>,
      c.tickSpacing() as Promise<bigint>,
      c.fee() as Promise<bigint>,
      c.unstakedFee() as Promise<bigint>,
    ]);
  const [d0, d1, s0, s1] = await Promise.all([
    getDecimals(token0),
    getDecimals(token1),
    getSymbol(token0),
    getSymbol(token1),
  ]);
  return {
    type: "v3",
    address: a,
    token0,
    token1,
    decimals0: d0,
    decimals1: d1,
    symbol0: s0,
    symbol1: s1,
    tickSpacing: Number(tickSpacing),
    fee: Number(fee),
    unstakedFee: Number(unstakedFee),
    sqrtPriceX96: slot0[0],
    tick: Number(slot0[1]),
    liquidity,
    stakedLiquidity,
  };
}

export async function getPool(address: string): Promise<PoolInfo> {
  const type = await detectPoolType(address);
  return type === "v2" ? getPoolV2(address) : getPoolV3(address);
}

export async function findV2Pool(
  tokenA: string,
  tokenB: string,
  stable: boolean
): Promise<string> {
  return await poolFactory().getPool(tokenA, tokenB, stable);
}

export async function findV3Pool(
  tokenA: string,
  tokenB: string,
  tickSpacing: number
): Promise<string> {
  return await clFactory().getPool(tokenA, tokenB, tickSpacing);
}

export async function listV3PoolsForPair(
  tokenA: string,
  tokenB: string
): Promise<{ tickSpacing: number; pool: string }[]> {
  const results = await Promise.all(
    TICK_SPACINGS.map(async (ts) => ({
      tickSpacing: ts,
      pool: await clFactory().getPool(tokenA, tokenB, ts),
    }))
  );
  return results.filter((r) => r.pool !== ZeroAddress);
}

export async function listAllV2Pools(): Promise<string[]> {
  const len: bigint = await poolFactory().allPoolsLength();
  return await Promise.all(
    Array.from({ length: Number(len) }, (_, i) => poolFactory().allPools(i) as Promise<string>)
  );
}
