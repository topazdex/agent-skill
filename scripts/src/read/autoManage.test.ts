import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAddress } from "ethers";

vi.mock("ethers", async () => {
  const actual = await vi.importActual<typeof import("ethers")>("ethers");
  return { ...actual, Contract: vi.fn() };
});
vi.mock("../lib/client.js", () => ({ provider: vi.fn(() => ({})) }));

const { Contract } = await import("ethers");
const mockContract = vi.mocked(Contract);
const { contractAddress } = await import("../config/deployments.js");
const {
  AUTO_MANAGE_CHAIN_IDS,
  depositBlocker,
  getAutoManagePositions,
  getAutoManageVault,
  listAutoManageVaults,
} = await import("./autoManage.js");

const VAULT = getAddress("0x" + "a1".repeat(20));
const OWNER = getAddress("0x" + "0b".repeat(20));
const addr = (byte: string) => getAddress("0x" + byte.repeat(20));

const lensVault = (overrides: Record<string, unknown> = {}) => ({
  vault: VAULT, strategy: addr("b2"), pool: addr("c3"), gauge: addr("d4"),
  token0: addr("e5"), token1: addr("f6"), rewardToken: addr("17"),
  decimals0: 18n, decimals1: 6n, symbol0: "WETH", symbol1: "USDC", tickSpacing: 100n,
  totalSupply: 10n ** 18n, total0: 5n * 10n ** 17n, total1: 1_000_000_000n, tick: -200_000n,
  isCalm: true, depositsEnabled: true, paused: false, globalPause: false,
  gaugeAlive: true, inRange: true, rewardFeeBps: 1000n,
  ...overrides,
});

let registry: Map<string, Record<string, ReturnType<typeof vi.fn>>>;
beforeEach(() => {
  registry = new Map();
  mockContract.mockImplementation((address) => {
    const fake = registry.get(String(address).toLowerCase());
    if (!fake) throw new Error(`unexpected contract ${String(address)}`);
    return fake as unknown as InstanceType<typeof Contract>;
  });
});
const wire = (chainId: number, name: string, fake: Record<string, ReturnType<typeof vi.fn>>) =>
  registry.set(contractAddress(chainId, name).toLowerCase(), fake);

describe("Auto Manage reads", () => {
  it("is catalogued on BNB, Robinhood and Arc only", () => {
    expect([...AUTO_MANAGE_CHAIN_IDS].sort((a, b) => a - b)).toEqual([56, 4663, 5042]);
  });

  it("lists vaults from the lens for the chain's own factory", async () => {
    const getVaults = vi.fn(async () => [lensVault()]);
    wire(4663, "AutoManageLens", { getVaults });
    const vaults = await listAutoManageVaults(4663);
    expect(getVaults).toHaveBeenCalledWith(contractAddress(4663, "AutoManageFactory"));
    expect(vaults[0]).toMatchObject({ vault: VAULT, decimals1: 6, tickSpacing: 100, rewardFeeBps: 1000 });
  });

  it("fails closed on chains without Auto Manage", async () => {
    await expect(listAutoManageVaults(8453)).rejects.toThrow(/no deployment on Base/);
  });

  it("rejects an address the factory did not register", async () => {
    wire(56, "AutoManageFactory", { isVault: vi.fn(async () => false) });
    await expect(getAutoManageVault(56, VAULT)).rejects.toThrow(/not a Topaz Auto Manage vault/);
  });

  it("drops vaults where the wallet has neither shares nor rewards", async () => {
    wire(5042, "AutoManageLens", {
      getUserPositions: vi.fn(async () => [
        { vault: VAULT, shares: 0n, amount0: 0n, amount1: 0n, earned: 0n },
        { vault: addr("a2"), shares: 0n, amount0: 0n, amount1: 0n, earned: 7n },
      ]),
    });
    expect(await getAutoManagePositions(5042, OWNER)).toEqual([
      { vault: addr("a2"), shares: 0n, amount0: 0n, amount1: 0n, earned: 7n },
    ]);
  });

  it("names the deposit gate that is closed", async () => {
    const state = async (o: Record<string, unknown>) => {
      wire(56, "AutoManageFactory", { isVault: vi.fn(async () => true) });
      wire(56, "AutoManageLens", { getVault: vi.fn(async () => lensVault(o)) });
      return depositBlocker(await getAutoManageVault(56, VAULT));
    };
    expect(await state({})).toBeNull();
    expect(await state({ globalPause: true })).toMatch(/protocol-wide/);
    expect(await state({ depositsEnabled: false })).toMatch(/paused/);
    expect(await state({ isCalm: false })).toMatch(/calm band/);
  });
});
