// Broadcast wrappers for the Topaz Relay depositor flow. These reuse the validated
// builders in lib/relayBuilders.ts and send the resulting calldata with the configured
// signer. Only call these after the user has explicitly authorized broadcasting.

import { type TransactionResponse } from "ethers";
import { senderAddress, signer } from "../lib/client.js";
import {
  buildDepositManagedTx,
  buildRelayClaimTx,
  buildWithdrawManagedTx,
  type BuiltRelayTx,
} from "../lib/relayBuilders.js";

async function send(built: BuiltRelayTx): Promise<TransactionResponse> {
  return signer().sendTransaction({ to: built.to, data: built.data, value: built.value });
}

export async function depositManaged(
  tokenId: string | number | bigint,
  relay: string,
): Promise<TransactionResponse> {
  const built = await buildDepositManagedTx({ tokenId, relay, owner: await senderAddress() });
  return send(built.tx);
}

export async function withdrawManaged(
  tokenId: string | number | bigint,
): Promise<TransactionResponse> {
  const built = await buildWithdrawManagedTx({ tokenId, owner: await senderAddress() });
  return send(built.tx);
}

export async function claimRelayRewards(
  tokenId: string | number | bigint,
): Promise<TransactionResponse> {
  const built = await buildRelayClaimTx({ tokenId });
  return send(built.tx);
}
