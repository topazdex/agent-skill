// Read live state for the Topaz Relays: voting power of each managed veNFT plus the
// amount compounded / distributed in the current epoch. Static metadata comes from
// `config/relays.ts`; everything here is an on-chain read.

import { Contract } from "ethers";
import { ADDR } from "../config/addresses.js";
import { ABIS } from "../lib/abis.js";
import { provider } from "../lib/client.js";
import { epochStart, nowSec } from "../lib/epoch.js";
import { RELAYS, type RelayConfig } from "../config/relays.js";

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
