import { afterEach, describe, expect, it, vi } from "vitest";
import { getAddress } from "ethers";
import { ADDR } from "../config/addresses.js";
import {
  DEPLOYMENTS,
  contractAddress,
  deployedContract,
  isHubChain,
  requireHubChain,
  requireSpokeChain,
} from "../config/deployments.js";
import { ARC_USDC, TOKENS, hopTokens, isWrappedNative, resolveTokenOnChain } from "../config/tokens.js";
import { parseChainOption } from "./chainOption.js";
import { provider } from "./client.js";
import { rpcUrl } from "./multichain.js";

const SPOKES = [4663, 8453, 1, 5042];
const CORE = [
  "Router",
  "SwapRouter",
  "NonfungiblePositionManager",
  "CLFactory",
  "PoolFactory",
  "QuoterV2",
  "MixedRouteQuoterV1",
  "Voter",
  "VotingEscrow",
  "RewardsDistributor",
  "Minter",
  "UniversalRouter",
  "Permit2",
] as const;

afterEach(() => vi.unstubAllEnvs());

describe("chain-scoped contract addresses", () => {
  it("resolves BNB core contracts to the same addresses as the canonical ADDR table", () => {
    for (const name of CORE) expect(getAddress(contractAddress(56, name))).toBe(getAddress(ADDR[name]));
  });

  it("gives every spoke its own DEX, Voter and voting vault, and no veTOPAZ", () => {
    for (const chainId of SPOKES) {
      for (const name of ["Router", "SwapRouter", "NonfungiblePositionManager", "CLFactory", "PoolFactory", "Voter", "XTopazVotingVault", "XTopazOFT", "Multicall3"]) {
        expect(contractAddress(chainId, name)).toMatch(/^0x[0-9a-fA-F]{40}$/);
      }
      expect(getAddress(contractAddress(chainId, "Voter"))).not.toBe(getAddress(ADDR.Voter));
      for (const hubOnly of ["VotingEscrow", "RewardsDistributor", "Minter", "RelayManager", "VeTopazVault"]) {
        expect(() => deployedContract(chainId, hubOnly)).toThrow(/not deployed/);
      }
    }
  });

  it("gates hub-only and spoke-only features with actionable errors", () => {
    expect(isHubChain(56)).toBe(true);
    expect(() => requireHubChain(56, "veTOPAZ")).not.toThrow();
    for (const chainId of SPOKES) {
      expect(isHubChain(chainId)).toBe(false);
      expect(() => requireHubChain(chainId, "veTOPAZ")).toThrow(/only on BNB Chain \(56\).*XTopazVotingVault/);
      expect(() => requireSpokeChain(chainId, "stake")).not.toThrow();
    }
    expect(() => requireSpokeChain(56, "stake")).toThrow(/veTOPAZ NFTs/);
    expect(() => requireHubChain(97, "x")).toThrow(/Unsupported Topaz chain 97/);
  });
});

describe("resolveTokenOnChain", () => {
  it("keeps the curated BNB symbols and flags only the native alias as native", () => {
    expect(resolveTokenOnChain("TOPAZ", 56)).toEqual({ address: TOKENS.TOPAZ.address, native: false });
    expect(resolveTokenOnChain("BNB", 56)).toEqual({ address: getAddress(TOKENS.WBNB.address), native: true });
    expect(resolveTokenOnChain("WBNB", 56)).toEqual({ address: TOKENS.WBNB.address, native: false });
  });

  it("maps ETH / WETH / xTOPAZ to each ETH-gas spoke's own contracts", () => {
    for (const chainId of [4663, 8453, 1]) {
      const wrapped = DEPLOYMENTS.find((c) => c.chainId === chainId)!.wrappedNative!;
      expect(resolveTokenOnChain("ETH", chainId)).toEqual({ address: getAddress(wrapped), native: true });
      expect(resolveTokenOnChain("weth", chainId)).toEqual({ address: getAddress(wrapped), native: false });
      expect(resolveTokenOnChain("xTOPAZ", chainId).address).toBe(getAddress(contractAddress(chainId, "XTopazOFT")));
      expect(isWrappedNative(wrapped, chainId)).toBe(true);
    }
  });

  it("never resolves BNB symbols on a spoke", () => {
    expect(() => resolveTokenOnChain("TOPAZ", 8453)).toThrow(/unknown token "TOPAZ" on Base.*chainIds=8453/);
    expect(() => resolveTokenOnChain("USDT", 1)).toThrow(/pass a 0x address/);
    expect(() => resolveTokenOnChain("BNB", 4663)).toThrow();
  });

  it("treats Arc USDC as the 6-decimal ERC20 and refuses a native alias", () => {
    expect(resolveTokenOnChain("USDC", 5042)).toEqual({ address: ARC_USDC, native: false });
    expect(() => resolveTokenOnChain("native", 5042)).toThrow(/no wrapped native/);
    expect(isWrappedNative(ARC_USDC, 5042)).toBe(false);
  });

  it("accepts any checksummable address and rejects the zero address", () => {
    const lower = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
    expect(resolveTokenOnChain(lower, 8453)).toEqual({ address: getAddress(lower), native: false });
    expect(() => resolveTokenOnChain("0x0000000000000000000000000000000000000000", 8453)).toThrow(/zero address/);
  });

  it("uses chain-local hop tokens for the on-chain route search", () => {
    expect(hopTokens(56)).toContain(TOKENS.USDT.address);
    expect(hopTokens(8453)).toEqual([
      getAddress("0x4200000000000000000000000000000000000006"),
      getAddress(contractAddress(8453, "XTopazOFT")),
    ]);
    expect(hopTokens(5042)).toEqual([ARC_USDC, getAddress(contractAddress(5042, "XTopazOFT"))]);
  });
});

describe("--chain option", () => {
  it("accepts ids and catalog slugs, defaults to BNB and fails closed", () => {
    expect(parseChainOption(undefined)).toBe(56);
    expect(parseChainOption("8453")).toBe(8453);
    expect(parseChainOption(4663)).toBe(4663);
    expect(parseChainOption("Arc")).toBe(5042);
    expect(parseChainOption("ethereum")).toBe(1);
    expect(() => parseChainOption("97")).toThrow(/Unsupported/);
    expect(() => parseChainOption("polygon")).toThrow(/unknown --chain/);
  });
});

describe("per-chain RPC selection", () => {
  it("keeps BSC_RPC_URL for BNB and TOPAZ_RPC_<id> everywhere else", () => {
    vi.stubEnv("BSC_RPC_URL", "https://bnb.example");
    vi.stubEnv("TOPAZ_RPC_8453", "https://base.example");
    expect(rpcUrl(56)).toBe("https://bnb.example");
    expect(rpcUrl(8453)).toBe("https://base.example");
    expect(rpcUrl(1)).toBe(DEPLOYMENTS.find((c) => c.chainId === 1)!.rpcUrl);
  });

  it("caches one provider per chain, declared with that chain's id", () => {
    expect(provider(8453)).toBe(provider(8453));
    expect(provider(8453)).not.toBe(provider(56));
    expect(provider(5042)._network.chainId).toBe(5042n);
    // A stale shared nonce read broke approve-then-act flows on sub-second chains.
    expect((provider(4663) as unknown as { _getOption(k: string): number })._getOption("cacheTimeout")).toBe(-1);
  });
});
