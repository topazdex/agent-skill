// Topaz Auto Manage (ALM): keeper-managed CL vaults with transferable ERC-20 shares.
// Vaults are discovered on-chain through the lens (every vault the factory
// registered), never from a copied list. APR, TVL and history come from
// /v1/auto-manage. See references/auto-manage.md.

import { Contract, getAddress, type ContractRunner, type InterfaceAbi } from "ethers";
import { provider } from "../lib/client.js";
import { contractOnChain } from "../lib/multichain.js";
import { DEPLOYED_ABIS } from "../lib/deployedAbis.js";
import { DEPLOYMENTS, contractAddress, deployment } from "../config/deployments.js";

/** Every vault is a clone of one implementation, so one ABI covers all of them. */
export const AUTO_MANAGE_VAULT_ABI: InterfaceAbi = DEPLOYED_ABIS["abis/deployed/TopazManagedCLVault-95f2825b.json"];

export const AUTO_MANAGE_CHAIN_IDS: readonly number[] = DEPLOYMENTS
  .filter((chain) => chain.contracts.AutoManageFactory)
  .map((chain) => chain.chainId);

export interface AutoManageVaultState {
  vault: string;
  strategy: string;
  pool: string;
  gauge: string;
  token0: string;
  token1: string;
  rewardToken: string;
  decimals0: number;
  decimals1: number;
  symbol0: string;
  symbol1: string;
  tickSpacing: number;
  totalSupply: bigint;
  total0: bigint;
  total1: bigint;
  tick: number;
  isCalm: boolean;
  depositsEnabled: boolean;
  paused: boolean;
  globalPause: boolean;
  gaugeAlive: boolean;
  inRange: boolean;
  rewardFeeBps: number;
}

export interface AutoManagePosition {
  vault: string;
  shares: bigint;
  amount0: bigint;
  amount1: bigint;
  earned: bigint;
}

export function requireAutoManage(chainId: number): void {
  if (AUTO_MANAGE_CHAIN_IDS.includes(chainId)) return;
  const live = AUTO_MANAGE_CHAIN_IDS.map((id) => `${deployment(id).name} (${id})`).join(", ");
  throw new Error(`Auto Manage has no deployment on ${deployment(chainId).name} (${chainId}); it runs on ${live}`);
}

export function autoManageVault(chainId: number, vault: string, runner: ContractRunner = provider(chainId)): Contract {
  return new Contract(getAddress(vault), AUTO_MANAGE_VAULT_ABI, runner);
}

type LensVault = Record<string, unknown>;

function toVaultState(raw: LensVault): AutoManageVaultState {
  return {
    vault: getAddress(raw.vault as string),
    strategy: getAddress(raw.strategy as string),
    pool: getAddress(raw.pool as string),
    gauge: getAddress(raw.gauge as string),
    token0: getAddress(raw.token0 as string),
    token1: getAddress(raw.token1 as string),
    rewardToken: getAddress(raw.rewardToken as string),
    decimals0: Number(raw.decimals0),
    decimals1: Number(raw.decimals1),
    symbol0: String(raw.symbol0),
    symbol1: String(raw.symbol1),
    tickSpacing: Number(raw.tickSpacing),
    totalSupply: BigInt(raw.totalSupply as bigint),
    total0: BigInt(raw.total0 as bigint),
    total1: BigInt(raw.total1 as bigint),
    tick: Number(raw.tick),
    isCalm: Boolean(raw.isCalm),
    depositsEnabled: Boolean(raw.depositsEnabled),
    paused: Boolean(raw.paused),
    globalPause: Boolean(raw.globalPause),
    gaugeAlive: Boolean(raw.gaugeAlive),
    inRange: Boolean(raw.inRange),
    rewardFeeBps: Number(raw.rewardFeeBps),
  };
}

/** Every vault the chain's factory registered, with live lens state. */
export async function listAutoManageVaults(chainId: number): Promise<AutoManageVaultState[]> {
  requireAutoManage(chainId);
  const lens = contractOnChain(chainId, "AutoManageLens", provider(chainId));
  const raw = (await lens.getVaults(contractAddress(chainId, "AutoManageFactory"))) as LensVault[];
  return raw.map(toVaultState);
}

/** Live state for one vault; throws unless the chain's factory registered it. */
export async function getAutoManageVault(chainId: number, vault: string): Promise<AutoManageVaultState> {
  requireAutoManage(chainId);
  const address = getAddress(vault);
  const factory = contractOnChain(chainId, "AutoManageFactory", provider(chainId));
  if (!(await factory.isVault(address))) {
    throw new Error(`${address} is not a Topaz Auto Manage vault on ${deployment(chainId).name} (${chainId})`);
  }
  const lens = contractOnChain(chainId, "AutoManageLens", provider(chainId));
  return toVaultState((await lens.getVault(address)) as LensVault);
}

/** Why deposits are blocked right now, or null when they are open. Withdrawals never pause. */
export function depositBlocker(state: AutoManageVaultState): string | null {
  if (state.globalPause) return "Auto Manage deposits are paused protocol-wide";
  if (state.paused || !state.depositsEnabled) return `Deposits into the ${state.symbol0}/${state.symbol1} vault are paused`;
  if (!state.isCalm) return "The pool price is outside the vault's calm band, so deposits are temporarily blocked";
  return null;
}

/** A wallet's shares, principal and claimable rewards in every vault on the chain. */
export async function getAutoManagePositions(chainId: number, owner: string): Promise<AutoManagePosition[]> {
  requireAutoManage(chainId);
  const lens = contractOnChain(chainId, "AutoManageLens", provider(chainId));
  const raw = (await lens.getUserPositions(contractAddress(chainId, "AutoManageFactory"), getAddress(owner))) as LensVault[];
  return raw
    .map((p) => ({
      vault: getAddress(p.vault as string),
      shares: BigInt(p.shares as bigint),
      amount0: BigInt(p.amount0 as bigint),
      amount1: BigInt(p.amount1 as bigint),
      earned: BigInt(p.earned as bigint),
    }))
    .filter((p) => p.shares > 0n || p.earned > 0n);
}
