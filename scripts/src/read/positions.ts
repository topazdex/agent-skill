import { Contract } from "ethers";
import { ABIS } from "../lib/abis.js";
import { provider } from "../lib/client.js";
import { ADDR } from "../config/addresses.js";
import { findV3Pool, getPoolV3 } from "./pools.js";

const npm = () =>
  new Contract(ADDR.NonfungiblePositionManager, ABIS.NonfungiblePositionManager, provider());

export interface PositionInfo {
  tokenId: bigint;
  token0: string;
  token1: string;
  tickSpacing: number;
  tickLower: number;
  tickUpper: number;
  liquidity: bigint;
  tokensOwed0: bigint;
  tokensOwed1: bigint;
  pool: string;
  inRange: boolean | null;
  currentTick: number | null;
}

export async function getPosition(tokenId: bigint): Promise<PositionInfo> {
  const pos = await npm().positions(tokenId);
  const [
    _nonce,
    _operator,
    token0,
    token1,
    tickSpacing,
    tickLower,
    tickUpper,
    liquidity,
    _fg0,
    _fg1,
    tokensOwed0,
    tokensOwed1,
  ] = pos as [
    bigint, string, string, string, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint
  ];

  const pool = await findV3Pool(token0, token1, Number(tickSpacing));
  let inRange: boolean | null = null;
  let currentTick: number | null = null;
  if (pool !== "0x0000000000000000000000000000000000000000") {
    const info = await getPoolV3(pool);
    currentTick = info.tick;
    inRange = info.tick >= Number(tickLower) && info.tick < Number(tickUpper);
  }

  return {
    tokenId,
    token0,
    token1,
    tickSpacing: Number(tickSpacing),
    tickLower: Number(tickLower),
    tickUpper: Number(tickUpper),
    liquidity,
    tokensOwed0,
    tokensOwed1,
    pool,
    inRange,
    currentTick,
  };
}

export async function listOwnerPositions(owner: string): Promise<bigint[]> {
  const count: bigint = await npm().balanceOf(owner);
  return await Promise.all(
    Array.from({ length: Number(count) }, (_, i) =>
      npm().tokenOfOwnerByIndex(owner, i) as Promise<bigint>
    )
  );
}
