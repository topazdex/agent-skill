import { Contract, FetchRequest, Interface, JsonRpcProvider, type ContractRunner } from "ethers";
import { deployedContract, deployment } from "../config/deployments.js";
import { DEPLOYED_ABIS } from "./deployedAbis.js";

export function deploymentInterface(chainId: number, name: string): Interface {
  const entry = deployedContract(chainId, name);
  if (!entry.abi || !DEPLOYED_ABIS[entry.abi]) {
    throw new Error(`No deployed ABI for ${name} on ${chainId}; use the documented standard/legacy ABI`);
  }
  return new Interface(DEPLOYED_ABIS[entry.abi]);
}

/** Dynamic network detection is intentional; never trust an RPC URL's name. */
export async function chainProvider(chainId: number, rpcUrl?: string): Promise<JsonRpcProvider> {
  const chain = deployment(chainId);
  const request = new FetchRequest(rpcUrl ?? process.env[`TOPAZ_RPC_${chainId}`] ?? chain.rpcUrl);
  request.timeout = 15_000;
  const provider = new JsonRpcProvider(request, undefined, { batchMaxCount: 1 });
  try {
    await assertChain(provider, chainId);
    return provider;
  } catch (error) {
    provider.destroy();
    throw error;
  }
}

export async function assertChain(provider: Pick<JsonRpcProvider, "send">, chainId: number): Promise<void> {
  const actual = Number(BigInt(await provider.send("eth_chainId", [])));
  if (actual !== chainId) throw new Error(`RPC chain mismatch: expected ${chainId}, got ${actual}`);
}

export function contractOnChain(chainId: number, name: string, runner: ContractRunner): Contract {
  return new Contract(deployedContract(chainId, name).address, deploymentInterface(chainId, name), runner);
}

/** Encoding only: caller must read gates, allowances and simulate before execution. */
export function encodeDeploymentCall(
  chainId: number, name: string, method: string, args: readonly unknown[], value = 0n,
) {
  if (value < 0n) throw new Error("Negative transaction value");
  if (chainId === 5042 && value !== 0n && ["Router", "SwapRouter", "UniversalRouter", "NonfungiblePositionManager"].includes(name)) {
    throw new Error("Arc DEX contracts accept token-only paths, not native value");
  }
  return { chainId, to: deployedContract(chainId, name).address,
    data: deploymentInterface(chainId, name).encodeFunctionData(method, args), value: value.toString() };
}
