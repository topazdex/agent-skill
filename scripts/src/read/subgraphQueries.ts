import { gql } from "graphql-request";
import { v2Client, v3Client } from "../lib/subgraph.js";

const TOP_V2 = gql`
  query TopV2($n: Int!) {
    pairs(first: $n, orderBy: reserveUSD, orderDirection: desc, where: { reserveUSD_gt: "0" }) {
      id stable fee customFee reserveUSD volumeUSD feesUSD
      token0 { id symbol decimals } token1 { id symbol decimals }
    }
  }
`;

const TOP_V3 = gql`
  query TopV3($n: Int!) {
    pools(first: $n, orderBy: totalValueLockedUSD, orderDirection: desc, where: { totalValueLockedUSD_gt: "0" }) {
      id tickSpacing fee feeTier customFee dynamicFee
      totalValueLockedUSD volumeUSD feesUSD liquidity sqrtPrice tick
      token0 { id symbol decimals } token1 { id symbol decimals }
    }
  }
`;

export interface SgV2Pair {
  id: string; stable: boolean; fee: string; customFee: boolean;
  reserveUSD: string; volumeUSD: string; feesUSD: string;
  token0: { id: string; symbol: string; decimals: string };
  token1: { id: string; symbol: string; decimals: string };
}
export interface SgV3Pool {
  id: string; tickSpacing: string; fee: string; feeTier: string;
  customFee: boolean; dynamicFee: boolean;
  totalValueLockedUSD: string; volumeUSD: string; feesUSD: string;
  liquidity: string; sqrtPrice: string; tick: string;
  token0: { id: string; symbol: string; decimals: string };
  token1: { id: string; symbol: string; decimals: string };
}

export async function topV2Pools(n = 10): Promise<SgV2Pair[]> {
  const r = await v2Client.request<{ pairs: SgV2Pair[] }>(TOP_V2, { n });
  return r.pairs;
}

export async function topV3Pools(n = 10): Promise<SgV3Pool[]> {
  const r = await v3Client.request<{ pools: SgV3Pool[] }>(TOP_V3, { n });
  return r.pools;
}

const POOL_DETAIL_V3 = gql`
  query($id: ID!) {
    pool(id: $id) {
      id tickSpacing fee feeTier customFee dynamicFee dynamicFeeCap
      totalValueLockedUSD volumeUSD feesUSD liquidity sqrtPrice tick
      token0 { id symbol decimals } token1 { id symbol decimals }
    }
    poolDayDatas(first: 14, orderBy: date, orderDirection: desc, where: { pool: $id }) {
      date volumeUSD feesUSD tvlUSD open high low close
    }
  }
`;

const POOL_DETAIL_V2 = gql`
  query($id: ID!) {
    pair(id: $id) {
      id stable fee customFee reserveUSD volumeUSD feesUSD
      reserve0 reserve1 totalSupply
      token0 { id symbol decimals } token1 { id symbol decimals }
    }
    pairDayDatas(first: 14, orderBy: date, orderDirection: desc, where: { pairAddress: $id }) {
      date dailyVolumeUSD dailyFeesUSD reserveUSD
    }
  }
`;

export async function poolDetail(pool: string, type: "v2" | "v3"): Promise<unknown> {
  if (type === "v3")
    return await v3Client.request(POOL_DETAIL_V3, { id: pool.toLowerCase() });
  return await v2Client.request(POOL_DETAIL_V2, { id: pool.toLowerCase() });
}

const GLOBAL_DAILY_V3 = gql`
  query($n: Int!) {
    uniswapDayDatas(first: $n, orderBy: date, orderDirection: desc) {
      date volumeUSD feesUSD tvlUSD txCount
    }
  }
`;

export async function globalDailyV3(n = 30): Promise<{ date: number; volumeUSD: string; feesUSD: string; tvlUSD: string; txCount: string }[]> {
  const r = await v3Client.request<{ uniswapDayDatas: any[] }>(GLOBAL_DAILY_V3, { n });
  return r.uniswapDayDatas;
}
