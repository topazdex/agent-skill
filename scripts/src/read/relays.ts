// Read live state for the Topaz Relays: voting power of each managed veNFT plus the
// amount compounded / distributed in the current epoch, and for xTOPAZ spoke relays the
// pooled balance and a depositor's position. Static metadata comes from
// `config/relays.ts`; everything here is an on-chain read. Spoke relays that are not
// yet deployed are returned with `deployed: false` and never touch the RPC.

import { Contract, getAddress, type ContractRunner, type InterfaceAbi } from "ethers";
import { ADDR } from "../config/addresses.js";
import { ABIS } from "../lib/abis.js";
import { provider } from "../lib/client.js";
import { DEPLOYED_ABIS } from "../lib/deployedAbis.js";
import { epochStart, nowSec } from "../lib/epoch.js";
import {
  RELAYS,
  SPOKE_RELAYS,
  SPOKE_RELAY_MANIFEST,
  isDeployedSpokeRelay,
  requireDeployedSpokeRelay,
  spokeRelayUnavailable,
  spokeRelaysOnChain,
  type DeployedSpokeRelay,
  type RelayConfig,
  type SpokeRelayConfig,
  type SpokeRelayContractName,
} from "../config/relays.js";

export interface RelayState extends RelayConfig {
  /** veTOPAZ voting power of the relay's managed veNFT (`ve.balanceOfNFT(mTokenId)`). */
  votingPower: bigint;
  /** TOPAZ compounded into the lock this epoch. */
  compoundedThisEpoch: bigint;
  /** USDT streamed to depositors this epoch (null for Maxi — it never distributes). */
  distributedThisEpoch: bigint | null;
}

export async function getRelays(): Promise<RelayState[]> {
  const ve = new Contract(ADDR.VotingEscrow, ABIS.VotingEscrow, provider());
  const epoch = epochStart(nowSec());

  return Promise.all(
    RELAYS.map(async (r): Promise<RelayState> => {
      const relay = new Contract(r.address, ABIS.Relay, provider());
      const [votingPower, compoundedThisEpoch] = await Promise.all([
        ve.balanceOfNFT(r.mTokenId).catch(() => 0n) as Promise<bigint>,
        relay.amountCompounded(epoch).catch(() => 0n) as Promise<bigint>,
      ]);
      const distributedThisEpoch = r.hasUserClaim
        ? ((await relay.amountDistributed(epoch).catch(() => 0n)) as bigint)
        : null;
      return { ...r, votingPower, compoundedThisEpoch, distributedThisEpoch };
    }),
  );
}

/** ManagedEscrow.escrowType values; a deposit id is LOCKED while it holds weight in a relay. */
export const SPOKE_ESCROW_LOCKED = 1;

export function spokeRelayAbi(name: SpokeRelayContractName): InterfaceAbi {
  const entry = SPOKE_RELAY_MANIFEST.abis[name];
  const abi = DEPLOYED_ABIS[entry.abi];
  if (!abi) throw new Error(`No bundled ABI for spoke relay contract ${name} (${entry.abi})`);
  return abi;
}

export function spokeRelayContract(
  chainId: number,
  name: SpokeRelayContractName,
  address: string,
  runner: ContractRunner = provider(chainId),
): Contract {
  return new Contract(getAddress(address), spokeRelayAbi(name), runner);
}

export function spokeEscrow(relay: DeployedSpokeRelay, runner?: ContractRunner): Contract {
  return spokeRelayContract(relay.chainId, "ManagedEscrow", relay.escrow, runner);
}

export interface SpokeRelayState extends SpokeRelayConfig {
  deployed: boolean;
  /** Why the relay cannot be used yet ("… is not yet deployed"), or null when it is live. */
  unavailable: string | null;
  /** xTOPAZ attributable to current depositors (`escrow.balanceOfNFT(mTokenId)`). Null until deployed. */
  managedBalance: bigint | null;
  /** xTOPAZ compounded this epoch (`relay.amountCompounded(epochStart)`). */
  compoundedThisEpoch: bigint | null;
  /** Stable streamed to depositors this epoch; null for Maxi, which never distributes. */
  distributedThisEpoch: bigint | null;
  /** xTOPAZ owed to exited depositors and excluded from `managedBalance`. */
  deferredTotal: bigint | null;
  /** Deposits below the vault minimum, waiting for the next lot. */
  buffered: bigint | null;
  liveLots: bigint[] | null;
  deactivated: boolean | null;
  keeperLastRun: number | null;
}

function pendingState(relay: SpokeRelayConfig): SpokeRelayState {
  return {
    ...relay,
    deployed: false,
    unavailable: spokeRelayUnavailable(relay),
    managedBalance: null,
    compoundedThisEpoch: null,
    distributedThisEpoch: null,
    deferredTotal: null,
    buffered: null,
    liveLots: null,
    deactivated: null,
    keeperLastRun: null,
  };
}

export async function getSpokeRelayState(relay: SpokeRelayConfig): Promise<SpokeRelayState> {
  if (!isDeployedSpokeRelay(relay)) return pendingState(relay);
  const escrow = spokeEscrow(relay);
  const contract = spokeRelayContract(relay.chainId, relay.contractKind, relay.address);
  const block = await provider(relay.chainId).getBlock("latest");
  const epoch = epochStart(block ? block.timestamp : nowSec());
  const id = BigInt(relay.mTokenId);
  const [managedBalance, deferredTotal, buffered, liveLots, deactivated, keeperLastRun, compoundedThisEpoch] =
    await Promise.all([
      escrow.balanceOfNFT(id) as Promise<bigint>,
      escrow.deferredTotal(id) as Promise<bigint>,
      escrow.buffered(id) as Promise<bigint>,
      escrow.liveLots(id) as Promise<bigint[]>,
      escrow.deactivated(id) as Promise<boolean>,
      contract.keeperLastRun() as Promise<bigint>,
      contract.amountCompounded(epoch) as Promise<bigint>,
    ]);
  const distributedThisEpoch = relay.hasUserClaim ? ((await contract.amountDistributed(epoch)) as bigint) : null;
  return {
    ...relay,
    deployed: true,
    unavailable: null,
    managedBalance,
    compoundedThisEpoch,
    distributedThisEpoch,
    deferredTotal,
    buffered,
    liveLots: [...liveLots],
    deactivated,
    keeperLastRun: Number(keeperLastRun),
  };
}

/** Every spoke relay, or one chain's, with live state where deployed. */
export async function getSpokeRelays(chainId?: number): Promise<SpokeRelayState[]> {
  const relays = chainId === undefined ? SPOKE_RELAYS : spokeRelaysOnChain(chainId);
  return Promise.all(relays.map(getSpokeRelayState));
}

export interface SpokeRelayReward {
  token: string;
  earned: bigint;
}

export interface SpokeRelayPosition {
  chainId: number;
  relay: DeployedSpokeRelay;
  account: string;
  /** One non-transferable id per (account, relay), reused across re-entries. */
  depositId: bigint;
  /** True while the id holds weight in the relay (escrowType LOCKED). */
  active: boolean;
  /** xTOPAZ deposited and still in the relay. */
  weight: bigint;
  /** Exit opens at this timestamp: `vault.lockUntil()` at the last deposit, the start of epoch N+2. */
  unlockAt: number;
  /** Compounded xTOPAZ earned so far (`LockedManagedReward.earned(xTOPAZ, id)`), paid on exit. */
  earnedXTopaz: bigint;
  /** xTOPAZ from a past exit still owed; paid by `claimDeferred(id)`. */
  deferred: bigint;
  /** Claimable FreeManagedReward balances (the converter's stable), any token with earned > 0. */
  freeRewards: SpokeRelayReward[];
}

async function freeRewardsOf(relay: DeployedSpokeRelay, depositId: bigint): Promise<SpokeRelayReward[]> {
  const reward = spokeRelayContract(relay.chainId, "FreeManagedReward", relay.freeManagedReward);
  const count = Number((await reward.rewardsListLength()) as bigint);
  const tokens = (await Promise.all(
    Array.from({ length: count }, (_, i) => reward.rewards(i) as Promise<string>),
  )).map((t) => getAddress(t));
  const earned = await Promise.all(tokens.map((token) => reward.earned(token, depositId) as Promise<bigint>));
  return tokens.map((token, i) => ({ token, earned: earned[i] })).filter((r) => r.earned > 0n);
}

/** An account's position in one spoke relay, or null when it never deposited there. */
export async function getSpokeRelayPosition(
  relay: SpokeRelayConfig,
  account: string,
): Promise<SpokeRelayPosition | null> {
  const live = requireDeployedSpokeRelay(relay);
  const owner = getAddress(account);
  const escrow = spokeEscrow(live);
  const mTokenId = BigInt(live.mTokenId);
  const depositId = (await escrow.depositIdOf(owner, mTokenId)) as bigint;
  if (depositId === 0n) return null;
  const locked = spokeRelayContract(live.chainId, "LockedManagedReward", live.lockedManagedReward);
  const [escrowType, weight, unlockAt, deferred, earnedXTopaz, freeRewards] = await Promise.all([
    escrow.escrowType(depositId) as Promise<bigint>,
    escrow.weights(depositId, mTokenId) as Promise<bigint>,
    escrow.unlockAt(depositId) as Promise<bigint>,
    escrow.deferred(depositId) as Promise<bigint>,
    locked.earned(live.xTopaz, depositId) as Promise<bigint>,
    freeRewardsOf(live, depositId),
  ]);
  return {
    chainId: live.chainId,
    relay: live,
    account: owner,
    depositId,
    active: Number(escrowType) === SPOKE_ESCROW_LOCKED,
    weight,
    unlockAt: Number(unlockAt),
    earnedXTopaz,
    deferred,
    freeRewards,
  };
}

/** Positions in every deployed relay on the chain; relays not yet deployed are skipped. */
export async function getSpokeRelayPositions(chainId: number, account: string): Promise<SpokeRelayPosition[]> {
  const live = spokeRelaysOnChain(chainId).filter(isDeployedSpokeRelay);
  const positions = await Promise.all(live.map((relay) => getSpokeRelayPosition(relay, account)));
  return positions.filter((p): p is SpokeRelayPosition => p !== null);
}
