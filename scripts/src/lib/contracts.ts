import { Contract, type ContractRunner } from "ethers";
import { ABIS } from "./abis.js";
import { provider } from "./client.js";
import { CHAIN_ID } from "../config/chain.js";
import { contractAddress } from "../config/deployments.js";

/** Singleton contracts whose legacy ABI is a subset of the deployed ABI on every chain. */
export type CoreContract =
  | "Router"
  | "SwapRouter"
  | "NonfungiblePositionManager"
  | "CLFactory"
  | "PoolFactory"
  | "QuoterV2"
  | "MixedRouteQuoterV1"
  | "Voter"
  | "VotingEscrow"
  | "RewardsDistributor"
  | "Minter";

/** Address from the chain's deployment catalog; throws where the contract does not exist. */
export function coreContract(
  name: CoreContract,
  chainId: number = CHAIN_ID,
  runner: ContractRunner = provider(chainId),
): Contract {
  return new Contract(contractAddress(chainId, name), ABIS[name], runner);
}
