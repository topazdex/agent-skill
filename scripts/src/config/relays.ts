// Topaz Relays — automated reward managers for managed veTOPAZ (mveTOPAZ).
// A managed veNFT aggregates many depositors' voting power into one position; a Relay
// harvests that position's rewards each epoch and either compounds them back into the
// lock or redistributes them to depositors. Two relays are live on BNB Mainnet.
//
// Addresses live in `addresses.ts` (parity-checked); this file carries the non-address
// metadata (managed-veNFT id, payout token, claim semantics) the builders need.

import { ADDR } from "./addresses.js";
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
