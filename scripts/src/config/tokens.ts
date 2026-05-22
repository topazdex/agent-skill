// Common BSC mainnet tokens used on Topaz. Symbol/name/decimals were
// cross-verified against the Topaz v2/v3 Goldsky subgraphs and on-chain
// IERC20 calls. To refresh after a whitelist change, query the subgraph
// for each address (see `references/analytics-subgraph.md`).
//
// IMPORTANT (BSC quirks):
//   - USDT, USDC, USD1, FDUSD are 18 decimals on BSC (Ethereum's are 6).
//   - DOGE is 8 decimals, BLUE is 9 decimals. Most others are 18.
//   - "BNB" is the native gas asset; for ERC20 routing it maps to WBNB.
//     Router helpers (`swapExactETHForTokens`, `unwrapWETH9`) wrap/unwrap
//     transparently, so callers can pass `BNB` and the builder substitutes
//     WBNB internally.

export interface TokenMeta {
  address: `0x${string}`;
  symbol: string;
  name: string;
  decimals: number;
  /** Optional comma-separated aliases callers can pass instead of the canonical symbol. */
  aliases?: string[];
}

export const TOKENS: Record<string, TokenMeta> = {
  // --- native + protocol ---
  WBNB: {
    address: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
    symbol: "WBNB",
    name: "Wrapped BNB",
    decimals: 18,
    aliases: ["BNB"],
  },
  TOPAZ: {
    address: "0xdf002282C1474C9592780618Adda7EaA99998Abd",
    symbol: "TOPAZ",
    name: "Topaz",
    decimals: 18,
  },

  // --- stables ---
  USDT: {
    address: "0x55d398326f99059fF775485246999027B3197955",
    symbol: "USDT",
    name: "Tether USD",
    decimals: 18,
  },
  USDC: {
    address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
    symbol: "USDC",
    name: "USD Coin",
    decimals: 18,
  },
  USD1: {
    address: "0x8d0D000Ee44948FC98c9B98A4FA4921476f08B0d",
    symbol: "USD1",
    name: "World Liberty Financial USD",
    decimals: 18,
  },
  FDUSD: {
    address: "0xc5f0f7b66764F6ec8C8Dff7BA683102295E16409",
    symbol: "FDUSD",
    name: "First Digital USD",
    decimals: 18,
  },

  // --- bluechips ---
  BTCB: {
    address: "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c",
    symbol: "BTCB",
    name: "BTCB Token",
    decimals: 18,
  },
  ETH: {
    address: "0x2170Ed0880ac9A755fd29B2688956BD959F933F8",
    symbol: "ETH",
    name: "Ethereum Token",
    decimals: 18,
  },
  SOL: {
    address: "0x570A5D26f7765Ecb712C0924E4De545B89fD43dF",
    symbol: "SOL",
    name: "SOLANA",
    decimals: 18,
  },
  XRP: {
    address: "0x1D2F0da169ceB9fC7B3144628dB156f3F6c60dBE",
    symbol: "XRP",
    name: "XRP Token",
    decimals: 18,
  },
  CAKE: {
    address: "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82",
    symbol: "CAKE",
    name: "PancakeSwap Token",
    decimals: 18,
  },
  DOGE: {
    address: "0xbA2aE424d960c26247Dd6c32edC70B295c744C43",
    symbol: "DOGE",
    name: "Dogecoin",
    decimals: 8,
  },

  // --- other whitelisted (live on Topaz pools) ---
  BLUE: {
    address: "0xa90298e5B1203A2DD0006A75EABE158989C406Fb",
    symbol: "BLUE",
    name: "Blue Protocol",
    decimals: 9,
  },
  GBLUE: {
    address: "0x158ff17474D7ACd29C13f26C5D27B293Ef0A1410",
    symbol: "gBLUE",
    name: "Governance Blue",
    decimals: 18,
  },
  BOOK: {
    address: "0xC9Ad421f96579AcE066eC188a7Bba472fB83017F",
    symbol: "BOOK",
    name: "Book of Binance",
    decimals: 18,
  },
  BUD: {
    address: "0xc28957E946AC244612BcB205C899844Cbbcb093D",
    symbol: "BUD",
    name: "BOOKUSD",
    decimals: 18,
  },
  BROCCOLI: {
    address: "0x12B4356C65340Fb02cdff01293F95FEBb1512F3b",
    symbol: "Broccoli",
    name: "Broccoli",
    decimals: 18,
  },
  CAPTAINBNB: {
    address: "0x47A1EB0b825b73e6A14807BEaECAFef199d5477c",
    symbol: "CaptainBNB",
    name: "CaptainBNB",
    decimals: 18,
  },
  CLIPX: {
    address: "0xc269d59a0D608EA0bd672F2F4616C372d8554444",
    symbol: "ClipX",
    name: "ClipX",
    decimals: 18,
  },
  EARN: {
    address: "0x2aC895fEba458B42884DCbCB47D57e44c3a303c8",
    symbol: "EARN",
    name: "HOLD",
    decimals: 18,
  },
  RISE: {
    address: "0x64FDD8a6c19d66a5b917a015868c5611261C4444",
    symbol: "$RISE",
    name: "1st Moon Mascot",
    decimals: 18,
    aliases: ["RISE"],
  },
  TRUSTY: {
    address: "0x65aea108c21439693468FCD542D81C29E8df4444",
    symbol: "Trusty",
    name: "TWT Mascot",
    decimals: 18,
  },
  BIBI: {
    address: "0x9212cF1f9f4A9c69Bb010146Ba5b0725169D4444",
    symbol: "bibi",
    name: "Binance bibi",
    decimals: 18,
  },
  NIANNIAN: {
    address: "0x9C27c4072738CF4b7B0B7071af0ad5666BdDC096",
    symbol: "NianNian",
    name: "NianNian",
    decimals: 18,
  },
};

// Default intermediaries used by best-route search. Ordered by liquidity depth
// observed on Topaz at deploy: WBNB is the dominant hop, USDT/USDC for stable
// legs, BTCB for bluechip legs.
export const HOP_TOKENS: TokenMeta[] = [TOKENS.WBNB, TOKENS.USDT, TOKENS.USDC, TOKENS.BTCB];

// Look up by symbol (case-insensitive), by alias (e.g. BNB → WBNB), or by
// address (checksummed or lowercase).
export function findToken(query: string): TokenMeta | undefined {
  const q = query.trim();
  const upper = q.toUpperCase();
  // Symbol match (case-insensitive) against canonical or actual symbol field.
  for (const meta of Object.values(TOKENS)) {
    if (meta.symbol.toUpperCase() === upper) return meta;
    if (meta.aliases?.some((a) => a.toUpperCase() === upper)) return meta;
  }
  // Map-key fallback (case-insensitive) — supports historical lookups like TOKENS.BLUE.
  const byKey = TOKENS[upper];
  if (byKey) return byKey;
  // Address lookup (case-insensitive).
  const ql = q.toLowerCase();
  return Object.values(TOKENS).find((t) => t.address.toLowerCase() === ql);
}
