import { ADDR } from "../config/addresses.js";
import { v3Client } from "./subgraph.js";
import { gql } from "graphql-request";

const cache = new Map<string, { px: number; ts: number }>();
const TTL_MS = 60_000;

const TOKEN_PRICE_QUERY = gql`
  query TokenPrice($id: Bytes!) {
    token(id: $id) { derivedETH }
    bundle(id: "1") { ethPriceUSD }
  }
`;

interface TokenPriceResp {
  token: { derivedETH: string } | null;
  bundle: { ethPriceUSD: string } | null;
}

/**
 * USD price of one whole token (i.e. 1 unit at full decimals) via v3 subgraph.
 * Returns 0 if the token isn't indexed.
 */
export async function getUsdPrice(address: string): Promise<number> {
  const key = address.toLowerCase();
  const cached = cache.get(key);
  if (cached && Date.now() - cached.ts < TTL_MS) return cached.px;

  const data = await v3Client.request<TokenPriceResp>(TOKEN_PRICE_QUERY, { id: key });
  const derived = parseFloat(data.token?.derivedETH ?? "0");
  const bnbUsd = parseFloat(data.bundle?.ethPriceUSD ?? "0");
  const px = derived * bnbUsd;
  cache.set(key, { px, ts: Date.now() });
  return px;
}

export async function getTopazUsdPrice(): Promise<number> {
  const pair = process.env.DEXSCREENER_TOPAZ_PAIR;
  if (pair) {
    try {
      const res = await fetch(`https://api.dexscreener.com/latest/dex/pairs/bsc/${pair}`);
      const data = (await res.json()) as { pair?: { priceUsd?: string } };
      const px = parseFloat(data.pair?.priceUsd ?? "0");
      if (px > 0) return px;
    } catch {
      /* fall through */
    }
  }
  return await getUsdPrice(ADDR.TOPAZ);
}

export async function getBnbUsdPrice(): Promise<number> {
  return await getUsdPrice(ADDR.WBNB);
}
