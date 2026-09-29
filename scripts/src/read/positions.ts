import { coreContract } from "../lib/contracts.js";
import { CHAIN_ID } from "../config/chain.js";
import { findV3Pool, getPoolV3 } from "./pools.js";

const npm = (chainId: number) => coreContract("NonfungiblePositionManager", chainId);

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

export async function getPosition(tokenId: bigint, chainId: number = CHAIN_ID): Promise<PositionInfo> {
  const pos = await npm(chainId).positions(tokenId);
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

  const pool = await findV3Pool(token0, token1, Number(tickSpacing), chainId);
  let inRange: boolean | null = null;
  let currentTick: number | null = null;
  if (pool !== "0x0000000000000000000000000000000000000000") {
    const info = await getPoolV3(pool, chainId);
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

export async function listOwnerPositions(owner: string, chainId: number = CHAIN_ID): Promise<bigint[]> {
  const manager = npm(chainId);
  const count: bigint = await manager.balanceOf(owner);
  return await Promise.all(
    Array.from({ length: Number(count) }, (_, i) =>
      manager.tokenOfOwnerByIndex(owner, i) as Promise<bigint>
    )
  );
}
