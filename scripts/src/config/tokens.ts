// Common BSC mainnet tokens. Decimals confirmed from on-chain.
// NOTE: USDT and USDC on BSC are 18 decimals (unlike Ethereum's 6).

export interface TokenMeta {
  address: `0x${string}`;
  symbol: string;
  name: string;
  decimals: number;
}

export const TOKENS: Record<string, TokenMeta> = {
  WBNB: {
    address: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
    symbol: "WBNB",
    name: "Wrapped BNB",
    decimals: 18,
  },
  TOPAZ: {
    address: "0xdf002282C1474C9592780618Adda7EaA99998Abd",
    symbol: "TOPAZ",
    name: "Topaz",
    decimals: 18,
  },
  USDT: {
    address: "0x55d398326f99059fF775485246999027B3197955",
    symbol: "USDT",
    name: "Binance-Peg USD Tether",
    decimals: 18,
  },
  USDC: {
    address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
    symbol: "USDC",
    name: "Binance-Peg USD Coin",
    decimals: 18,
  },
  BTCB: {
    address: "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c",
    symbol: "BTCB",
    name: "Binance-Peg BTC",
    decimals: 18,
  },
  ETH: {
    address: "0x2170Ed0880ac9A755fd29B2688956BD959F933F8",
    symbol: "ETH",
    name: "Binance-Peg Ethereum",
    decimals: 18,
  },
  WETH: {
    address: "0x570A5D26f7765Ecb712C0924E4De545B89fD43dF",
    symbol: "WETH",
    name: "Wrapped Ether (alt)",
    decimals: 18,
  },
  CAKE: {
    address: "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82",
    symbol: "CAKE",
    name: "PancakeSwap Token",
    decimals: 18,
  },
  EGB: {
    address: "0x8d0D000Ee44948FC98c9B98A4FA4921476f08B0d",
    symbol: "EGB",
    name: "EGB",
    decimals: 18,
  },
};

// Default intermediaries used by best-route search.
export const HOP_TOKENS: TokenMeta[] = [TOKENS.WBNB, TOKENS.USDT, TOKENS.USDC, TOKENS.BTCB];

// Look up by symbol (case-insensitive) or by address (checksummed or lowercase).
export function findToken(query: string): TokenMeta | undefined {
  const q = query.trim();
  const bySymbol = TOKENS[q.toUpperCase()];
  if (bySymbol) return bySymbol;
  const ql = q.toLowerCase();
  return Object.values(TOKENS).find((t) => t.address.toLowerCase() === ql);
}
