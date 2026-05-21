// Topaz Dex — BNB Mainnet (chain id 56).
// Canonical address set for this skill. The same values must appear in README.md and
// references/addresses.md; `yarn validate` (scripts/src/cli/validate.ts) enforces parity.

export const ADDR = {
  // Tokens
  TOPAZ: "0xdf002282C1474C9592780618Adda7EaA99998Abd",
  WBNB: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",

  // Core / v2 (topaz-contracts)
  VotingEscrow: "0xe951aC65EFE86682311ab0d8995E7A58750c5eB3",
  Voter: "0x2F80F810a114223AC69E34E84E735CaD515dAD67",
  Minter: "0x606794d37991A426a189fD9FA8664D339A77f8ae",
  RewardsDistributor: "0x85e15e7Ad4f20d5ca3A1104B1c2CcE72f5F683dB",
  PoolFactory: "0x65E6cD0eF5D3467030103cf3d433034E570b5784",
  PoolImpl: "0xdC942D8e37cC20BCf9aD1Fe0111eE6c5908f3678",
  Router: "0x1E98c8226e7d452e1888e3d3d2F929346321c6c3",
  GaugeFactory: "0xFc080D1EcD7c332022cebf942AEb62d5E1d4Cb08",
  VotingRewardsFactory: "0x4C303f7af7b8b05226440e4e12FF9a82F513716c",
  ManagedRewardsFactory: "0xe4b23F13b24232C1E68AD0575191216152AA9480",
  FactoryRegistry: "0x268d1C8a538Ecf6628838C11d581e1EABD13D6A4",
  Forwarder: "0xE79EB7c4D06ff38e6483921DE8e85A37eC7c731b",
  VeArtProxy: "0x9612305fe63DFb84Da8f6d6261169F6B85026601",
  AirdropDistributor: "0x7B1d8745079C85af80Ff7A7eA7C2C4769Eab5348",
  // Linked libraries used by VotingEscrow (read-only / power-user)
  BalanceLogicLibrary: "0xeF6724ad68Fd2f8526765e08afa6627850c8a589",
  DelegationLogicLibrary: "0xCb24e31896d7476EFB7B76A366566cfbcf375033",

  // Slipstream / v3
  CLFactory: "0x73DC984D9490286E735548f61dfCCec67Af82ed9",
  CLPoolImpl: "0x18e68051d1b1fB44cb539cA4436F112D28577AF7",
  CLGaugeFactory: "0xeD2ED418f104E18B1D11eA5C26236A1caa675839",
  CLGaugeImpl: "0xc2f777a2e9f54f195212a5a2d394399252958b97",
  NonfungiblePositionManager: "0xf8c30c3C362941C23025f2eA30B066A73C982f63",
  SwapRouter: "0x9B63CA87919617d042A89663492dB3c8686e0CaE",
  QuoterV2: "0x7CCB89bB9BdEF68688F39a2c22d249fD1D9759f1",
  MixedRouteQuoterV1: "0x47c3570b90e7234FE695Ad5F1bE69E21fe1a9ee2",
  NonfungibleTokenPositionDescriptor: "0xBa4C4f5Ca809C21286ff1a872b3c0CFb57AfE904",
  NonfungibleTokenPositionDescriptorV1: "0x81aCc35240D19948a56b8b68BcC8706F90baBAb5", // legacy, archived
  NFTDescriptor: "0x50f9756f631266686b9A7EBDF55998dB3dA5ca0a", // linked library
  NFTSVG: "0x21C9257dFCdf04154D34dF5A2204B9402Ef31d9a", // linked library
  CustomSwapFeeModule: "0xA0462a52af4f8cbF7766Efbba75355B30b6BCCe2",
  CustomUnstakedFeeModule: "0x3bad7F96cd1b51CE86e12C42541Ac7d559A78582",
  DynamicSwapFeeModule: "0x656cf5d2f1A70177E011e2c27DeafBeE4C7B0541",
} as const;

export type ContractName = keyof typeof ADDR;

// Tick spacing -> default fee (in pips, 1e6 = 100%)
export const TICK_SPACING_TO_FEE: Record<number, number> = {
  1: 100,
  50: 500,
  100: 1000,
  200: 3000,
  2000: 10000,
};

export const FEE_TO_TICK_SPACING: Record<number, number> = Object.fromEntries(
  Object.entries(TICK_SPACING_TO_FEE).map(([ts, fee]) => [fee, Number(ts)])
);

// All enabled tick spacings (mirrors CLFactory init)
export const TICK_SPACINGS = [1, 50, 100, 200, 2000] as const;

// v2 default fees (bps-style, where fee/10000 = bps; e.g. 30 = 0.30%)
export const V2_DEFAULT_VOLATILE_FEE = 30;
export const V2_DEFAULT_STABLE_FEE = 5;
export const V2_MAX_FEE = 300;
