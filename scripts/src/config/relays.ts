// Topaz Relays — automated reward managers for managed veTOPAZ (mveTOPAZ).
// A managed veNFT aggregates many depositors' voting power into one position; a Relay
// harvests that position's rewards each epoch and either compounds them back into the
// lock or redistributes them to depositors. Two relays are live on BNB Chain.
//
// Addresses live in `addresses.ts` (parity-checked); this file carries the non-address
// metadata (managed-veNFT id, payout token, claim semantics) the builders need.
// xTOPAZ spoke relays are below the BNB set.

import { getAddress } from "ethers";
import spokeManifest from "../../../references/spoke-relays.json" with { type: "json" };
import { ADDR } from "./addresses.js";
import { deployment } from "./deployments.js";
import { TOKENS } from "./tokens.js";

export type RelayType = "maxi" | "reward-distribute";

export interface RelayConfig {
  type: RelayType;
  /** The relay contract that owns the managed veNFT. */
  address: string;
  /** The managed veNFT (`mTokenId`) this relay owns and votes with. */
  mTokenId: number;
  displayName: string;
  contractKind: "AutoCompounder" | "CompoundConverter";
  /** Token a depositor ultimately receives. Maxi compounds TOPAZ in-place (no claim). */
  payoutToken: string;
  payoutSymbol: string;
  /** Reward & Distribute streams USDT to depositors; Maxi accrues value in the lock. */
  hasUserClaim: boolean;
  strategy: string;
}

export const RELAYS: readonly RelayConfig[] = [
  {
    type: "maxi",
    address: ADDR.RelayMaxi,
    mTokenId: 3083,
    displayName: "veTOPAZ Maxi",
    contractKind: "AutoCompounder",
    payoutToken: ADDR.TOPAZ,
    payoutSymbol: "TOPAZ",
    hasUserClaim: false,
    strategy:
      "Claims all rewards, swaps everything to TOPAZ, and compounds it into the managed lock. Value accrues in-place — there is nothing for a depositor to claim.",
  },
  {
    type: "reward-distribute",
    address: ADDR.RelayRewardDistribute,
    mTokenId: 3087,
    displayName: "Reward & Distribute",
    contractKind: "CompoundConverter",
    payoutToken: TOKENS.USDT.address,
    payoutSymbol: "USDT",
    hasUserClaim: true,
    strategy:
      "Compounds TOPAZ into the managed lock and swaps the remaining rewards to USDT, streaming USDT to depositors via the lock's FreeManagedReward. Depositors claim USDT.",
  },
] as const;

const ALIASES: Record<string, RelayType> = {
  "maxi": "maxi",
  "vetopaz maxi": "maxi",
  "autocompounder": "maxi",
  "compounder": "maxi",
  "reward-distribute": "reward-distribute",
  "reward & distribute": "reward-distribute",
  "reward and distribute": "reward-distribute",
  "compoundconverter": "reward-distribute",
  "converter": "reward-distribute",
};

/** Resolve a relay by type alias ("maxi" / "reward-distribute" / display name) or address. */
export function resolveRelay(selector: string): RelayConfig | undefined {
  const s = selector.trim().toLowerCase();
  const type = ALIASES[s];
  if (type) return RELAYS.find((r) => r.type === type);
  if (s.startsWith("0x") && s.length === 42) {
    return RELAYS.find((r) => r.address.toLowerCase() === s);
  }
  return undefined;
}

/** Resolve the relay that owns a given managed veNFT id. */
export function relayByMTokenId(mTokenId: number | bigint): RelayConfig | undefined {
  const id = Number(mTokenId);
  return RELAYS.find((r) => r.mTokenId === id);
}

// xTOPAZ spoke relays — the same two products on Robinhood, Arc, Base and Ethereum. Spokes have no
// veNFTs: a per-chain ManagedEscrow pools depositors' liquid xTOPAZ into XTopazVotingVault positions
// ("lots") and gives each depositor one non-transferable deposit id per relay. Addresses come from
// `references/spoke-relays.json`, synced from the xtopaz-relay deployment manifests; null means the
// chain has no broadcast deployment yet, and every reader and builder says so instead of guessing.

export type SpokeRelayType = "maxi" | "converter";
export type SpokeRelayKind = "AUTO_COMPOUNDER" | "COMPOUND_CONVERTER";
export type SpokeRelayContractName =
  | "ManagedEscrow"
  | "RelayEntryZap"
  | "AutoCompounderFactory"
  | "CompoundConverterFactory"
  | "AutoCompounder"
  | "CompoundConverter"
  | "LockedManagedReward"
  | "FreeManagedReward";

interface ManifestRelay {
  name: string;
  kind: string;
  address: string | null;
  factory: string | null;
  mTokenId: number | null;
  token: string;
  lockedManagedReward: string | null;
  freeManagedReward: string | null;
}

export interface SpokeZapRoute {
  /** "native" for the chain's ETH (sent as value), otherwise the ERC20 the caller pays with. */
  tokenIn: string;
  symbol: string;
  decimals: number;
  tokens: string[];
  tickSpacings: number[];
}

export interface SpokeRelayChainManifest {
  chainId: number;
  network: string;
  stage: string;
  stageNote?: string;
  status: string;
  deployBlock: number | null;
  protocol: {
    vault: string;
    voter: string;
    xTopaz: string;
    swapRouter: string;
    weth: string | null;
    stable: { address: string; symbol: string; decimals: number };
  };
  contracts: Record<string, string | null>;
  relays: Record<SpokeRelayType, ManifestRelay>;
  zapRoutes: SpokeZapRoute[];
}

export interface SpokeRelayManifest {
  schemaVersion: number;
  source: string;
  sync: string;
  abis: Record<SpokeRelayContractName, { abi: string; abiSha256: string }>;
  chains: SpokeRelayChainManifest[];
}

export const SPOKE_RELAY_MANIFEST: SpokeRelayManifest = spokeManifest;

export interface SpokeRelayConfig {
  chainId: number;
  network: string;
  type: SpokeRelayType;
  kind: SpokeRelayKind;
  contractKind: "AutoCompounder" | "CompoundConverter";
  /** On-chain relay name, e.g. "Topaz Maxi" or "Topaz Compound + USDG". */
  displayName: string;
  /** "staged" chains wait on a precondition (see `stageNote`) before anything is deployed. */
  stage: "launch" | "staged";
  stageNote: string | null;
  address: string | null;
  mTokenId: number | null;
  escrow: string | null;
  zap: string | null;
  factory: string | null;
  lockedManagedReward: string | null;
  freeManagedReward: string | null;
  vault: string;
  xTopaz: string;
  /** Maxi pays in compounded xTOPAZ on exit; the converter also streams the chain's stable. */
  payoutToken: string;
  payoutSymbol: string;
  payoutDecimals: number;
  hasUserClaim: boolean;
  strategy: string;
  /** Configured entry routes into xTOPAZ; Arc has no native leg. */
  zapRoutes: SpokeZapRoute[];
}

export interface DeployedSpokeRelay extends SpokeRelayConfig {
  address: string;
  mTokenId: number;
  escrow: string;
  lockedManagedReward: string;
  freeManagedReward: string;
}

const checksum = (address: string | null | undefined): string | null => (address ? getAddress(address) : null);

export function spokeRelaysFromManifest(manifest: SpokeRelayManifest): SpokeRelayConfig[] {
  return manifest.chains.flatMap((chain) => {
    if (chain.stage !== "launch" && chain.stage !== "staged") {
      throw new Error(`spoke-relays.json: unknown stage "${chain.stage}" for ${chain.network}`);
    }
    const stage = chain.stage;
    const stable = chain.protocol.stable;
    return (["maxi", "converter"] as const).map((type): SpokeRelayConfig => {
      const relay = chain.relays[type];
      const maxi = type === "maxi";
      return {
        chainId: chain.chainId,
        network: chain.network,
        type,
        kind: maxi ? "AUTO_COMPOUNDER" : "COMPOUND_CONVERTER",
        contractKind: maxi ? "AutoCompounder" : "CompoundConverter",
        displayName: relay.name,
        stage,
        stageNote: chain.stageNote ?? null,
        address: checksum(relay.address),
        mTokenId: relay.mTokenId,
        escrow: checksum(chain.contracts.ManagedEscrow),
        zap: checksum(chain.contracts.RelayEntryZap),
        factory: checksum(relay.factory),
        lockedManagedReward: checksum(relay.lockedManagedReward),
        freeManagedReward: checksum(relay.freeManagedReward),
        vault: getAddress(chain.protocol.vault),
        xTopaz: getAddress(chain.protocol.xTopaz),
        payoutToken: getAddress(maxi ? chain.protocol.xTopaz : stable.address),
        payoutSymbol: maxi ? "xTOPAZ" : stable.symbol,
        payoutDecimals: maxi ? 18 : stable.decimals,
        hasUserClaim: !maxi,
        strategy: maxi
          ? "Claims the relay's fees and bribes, swaps them to xTOPAZ and books it to depositors by weight. It stays staked and voting; exit pays principal plus compounded xTOPAZ as liquid xTOPAZ."
          : `Compounds rewards that arrive as xTOPAZ into the managed position and swaps every other reward to ${stable.symbol}, streamed to depositors through FreeManagedReward. Depositors claim ${stable.symbol}, before or after exit.`,
        zapRoutes: chain.zapRoutes,
      };
    });
  });
}

export const SPOKE_RELAYS: readonly SpokeRelayConfig[] = spokeRelaysFromManifest(SPOKE_RELAY_MANIFEST);

export const SPOKE_RELAY_CHAIN_IDS: readonly number[] = [...new Set(SPOKE_RELAYS.map((r) => r.chainId))];

export function spokeRelaysOnChain(chainId: number): SpokeRelayConfig[] {
  return SPOKE_RELAYS.filter((r) => r.chainId === chainId);
}

export function isDeployedSpokeRelay(relay: SpokeRelayConfig): relay is DeployedSpokeRelay {
  return (
    relay.address !== null &&
    relay.mTokenId !== null &&
    relay.escrow !== null &&
    relay.lockedManagedReward !== null &&
    relay.freeManagedReward !== null
  );
}

/** Why a spoke relay cannot be used yet, or null once its deployment is recorded. */
export function spokeRelayUnavailable(relay: SpokeRelayConfig): string | null {
  if (isDeployedSpokeRelay(relay)) return null;
  const where = `${deployment(relay.chainId).name} (${relay.chainId})`;
  const staged = relay.stage === "staged" && relay.stageNote ? ` (staged: ${relay.stageNote})` : "";
  return `${relay.displayName} on ${where} is not yet deployed${staged}`;
}

export function requireDeployedSpokeRelay(relay: SpokeRelayConfig): DeployedSpokeRelay {
  if (isDeployedSpokeRelay(relay)) return relay;
  throw new Error(spokeRelayUnavailable(relay) ?? `${relay.displayName} is not deployed`);
}

const SPOKE_ALIASES: Record<string, SpokeRelayType> = {
  "maxi": "maxi",
  "topaz maxi": "maxi",
  "autocompounder": "maxi",
  "auto_compounder": "maxi",
  "compounder": "maxi",
  "converter": "converter",
  "compound": "converter",
  "compound-stable": "converter",
  "compound + stable": "converter",
  "topaz compound + stable": "converter",
  "compoundconverter": "converter",
  "compound_converter": "converter",
};

/**
 * Resolve a spoke relay on one chain by alias ("maxi" / "converter" / on-chain name) or relay
 * address. The BNB aliases "reward-distribute" do not apply: spokes have no Reward & Distribute.
 */
export function resolveSpokeRelay(selector: string, chainId: number): SpokeRelayConfig | undefined {
  const s = selector.trim().toLowerCase();
  const onChain = spokeRelaysOnChain(chainId);
  const type = SPOKE_ALIASES[s];
  if (type) return onChain.find((r) => r.type === type);
  const byName = onChain.find((r) => r.displayName.toLowerCase() === s);
  if (byName) return byName;
  if (s.startsWith("0x") && s.length === 42) {
    return onChain.find((r) => r.address !== null && r.address.toLowerCase() === s);
  }
  return undefined;
}
