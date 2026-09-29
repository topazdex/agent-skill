import manifest from "../../../references/deployments.json" with { type: "json" };

export interface DeploymentContract {
  address: string;
  abi?: string;
  abiSha256?: string;
  transactionHash?: string | null;
  blockNumber?: number | null;
  runtimeCodeHash?: string;
}
export interface TopazDeployment {
  chainId: number;
  slug: string;
  name: string;
  role: string;
  lzEid: number;
  nativeSymbol: string;
  nativeDecimals: number;
  rpcUrl: string;
  explorer: string;
  wrappedNative: string | null;
  nativeRouterLegs: boolean;
  contracts: Record<string, DeploymentContract>;
}

export const DEPLOYMENTS: readonly TopazDeployment[] = manifest.chains.map((chain) => ({
  ...chain,
  contracts: Object.fromEntries(Object.entries(chain.contracts).filter(([, entry]) => entry !== undefined)),
}));

/** No BNB fallback: an unknown execution chain must fail closed. */
export function deployment(chainId: number): TopazDeployment {
  const found = DEPLOYMENTS.find((chain) => chain.chainId === chainId);
  if (!found) throw new Error(`Unsupported Topaz chain ${chainId}`);
  return found;
}

export function deployedContract(chainId: number, name: string): DeploymentContract {
  const found = deployment(chainId).contracts[name];
  if (!found) throw new Error(`${name} is not deployed in this catalog on ${chainId}`);
  return found;
}

export function bridgeRoute(sourceChainId: number, destinationChainId: number) {
  const source = deployment(sourceChainId);
  const destination = deployment(destinationChainId);
  if (source.chainId === destination.chainId) throw new Error("Bridge chains must differ");
  if (source.role !== "hub" && destination.role !== "hub") {
    throw new Error("Spoke-to-spoke requires two separately confirmed legs through BNB (56)");
  }
  return { source, destination };
}

export const HUB_CHAIN_ID = 56;

export function contractAddress(chainId: number, name: string): string {
  return deployedContract(chainId, name).address;
}

export function isHubChain(chainId: number): boolean {
  return deployment(chainId).role === "hub";
}

/** veTOPAZ locks, relays, rebases and the xTOPAZ vault exist only on the hub. */
export function requireHubChain(chainId: number, feature: string): void {
  if (isHubChain(chainId)) return;
  throw new Error(
    `${feature} exists only on BNB Chain (56); ${deployment(chainId).name} (${chainId}) uses xTOPAZ positions in XTopazVotingVault instead`,
  );
}

/** Rejected on spokes: stake/vote/claim there are keyed by XTopazVotingVault position ids. */
export function requireSpokeChain(chainId: number, feature: string): void {
  if (!isHubChain(chainId)) return;
  throw new Error(`${feature} is a spoke XTopazVotingVault action; BNB Chain (56) uses veTOPAZ NFTs instead`);
}
