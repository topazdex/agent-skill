import { beforeEach, describe, expect, it, vi } from "vitest";
import { Interface, getAddress } from "ethers";

vi.mock("ethers", async () => {
  const actual = await vi.importActual<typeof import("ethers")>("ethers");
  return { ...actual, Contract: vi.fn() };
});
vi.mock("./client.js", () => ({
  provider: vi.fn(() => ({
    getBlock: async () => ({ timestamp: 1_800_000_000 }),
    getBalance: async () => 10n ** 30n,
  })),
}));

const OWNER = getAddress("0x" + "0a".repeat(20));
const VAULT = getAddress("0x" + "a1".repeat(20));
const TOKEN0 = getAddress("0x" + "e5".repeat(20));
const TOKEN1 = getAddress("0x" + "f6".repeat(20));
const OTHER = getAddress("0x" + "77".repeat(20));

const vaultState = (overrides: Record<string, unknown> = {}) => ({
  vault: VAULT, strategy: VAULT, pool: VAULT, gauge: VAULT, token0: TOKEN0, token1: TOKEN1, rewardToken: OTHER,
  decimals0: 18, decimals1: 18, symbol0: "AAA", symbol1: "BBB", tickSpacing: 50,
  totalSupply: 10n ** 18n, total0: 1000n * 10n ** 18n, total1: 2000n * 10n ** 18n, tick: 0,
  isCalm: true, depositsEnabled: true, paused: false, globalPause: false, gaugeAlive: true, inRange: true, rewardFeeBps: 0,
  ...overrides,
});
let state = vaultState();
vi.mock("../read/autoManage.js", async () => {
  const actual = await vi.importActual<typeof import("../read/autoManage.js")>("../read/autoManage.js");
  return { ...actual, getAutoManageVault: vi.fn(async () => state) };
});

const firmSwapLeg = vi.fn();
vi.mock("./zeroX.js", async () => {
  const actual = await vi.importActual<typeof import("./zeroX.js")>("./zeroX.js");
  return {
    ...actual,
    indicativeBuyAmount: vi.fn(async (_c: number, _s: string, _b: string, amount: bigint) => amount),
    firmSwapLeg: (...args: unknown[]) => firmSwapLeg(...args),
  };
});

const { Contract } = await import("ethers");
const mockContract = vi.mocked(Contract);
const { contractAddress } = await import("../config/deployments.js");
const { DEPLOYED_ABIS } = await import("./deployedAbis.js");
const {
  ZAP_OUT_SELL_HAIRCUT_BPS,
  buildAutoManageClaimTx,
  buildAutoManageDepositTx,
  buildAutoManageRedeemTx,
  buildAutoManageZapInTx,
  buildAutoManageZapOutTx,
} = await import("./autoManageBuilders.js");

const vaultIface = new Interface(DEPLOYED_ABIS["abis/deployed/TopazManagedCLVault-95f2825b.json"]);
const zapIface = new Interface(DEPLOYED_ABIS["abis/deployed/TopazManagedCLZap-82800bad.json"]);
const erc20Iface = new Interface(["function approve(address,uint256)"]);

let allowances: Record<string, bigint>;
let vaultFake: Record<string, ReturnType<typeof vi.fn>>;
beforeEach(() => {
  state = vaultState();
  allowances = {};
  firmSwapLeg.mockReset();
  firmSwapLeg.mockImplementation(async (leg: { sellToken: string; buyToken: string; sellAmount: bigint }) => ({
    sellToken: leg.sellToken, buyToken: leg.buyToken, sellAmount: leg.sellAmount,
    buyAmount: leg.sellAmount, minBuyAmount: (leg.sellAmount * 99n) / 100n, allowanceHolderCalldata: "0xfeed", fees: [], zid: null,
  }));
  vaultFake = {
    previewDeposit: vi.fn(async (a0: bigint, a1: bigint) => [a0 + a1, a0, a1]),
    previewRedeem: vi.fn(async (shares: bigint) => [shares * 3n, shares * 5n]),
    balanceOf: vi.fn(async () => 1_000n),
    earned: vi.fn(async () => 42n),
    interface: vaultIface as unknown as ReturnType<typeof vi.fn>,
  };
  mockContract.mockImplementation((address) => {
    if (String(address).toLowerCase() === VAULT.toLowerCase()) {
      return { ...vaultFake, allowance: vi.fn(async () => allowances[VAULT] ?? 0n) } as unknown as InstanceType<typeof Contract>;
    }
    return {
      allowance: vi.fn(async () => allowances[String(address)] ?? 0n),
      balanceOf: vi.fn(async () => 10n ** 30n),
    } as unknown as InstanceType<typeof Contract>;
  });
});

describe("Auto Manage deposit, redeem and claim", () => {
  it("matches the missing side to the vault's composition and approves both tokens to the vault", async () => {
    allowances[TOKEN1] = 1n;
    const built = await buildAutoManageDepositTx({ chainId: 56, vault: VAULT, owner: OWNER, amount0Max: 10n ** 18n });
    const [max0, max1, minShares, receiver, deadline] = vaultIface.decodeFunctionData("deposit", built.tx.data);
    expect([max0, max1]).toEqual([10n ** 18n, 2n * 10n ** 18n + 1n]);
    expect(minShares).toBe(((3n * 10n ** 18n + 1n) * 9_900n) / 10_000n);
    expect([receiver, deadline]).toEqual([OWNER, 1_800_000_600n]);
    expect(built.approvals.map((a) => [a.to, a.label])).toEqual([
      [TOKEN0, "Approve AAA"],
      [TOKEN1, "Reset BBB allowance"],
      [TOKEN1, "Approve BBB"],
    ]);
    expect(erc20Iface.decodeFunctionData("approve", built.approvals[1].data)[1]).toBe(0n);
  });

  it("refuses deposits while a gate is closed but still builds a redeem", async () => {
    state = vaultState({ isCalm: false });
    await expect(buildAutoManageDepositTx({ chainId: 56, vault: VAULT, owner: OWNER, amount0Max: 1n })).rejects.toThrow(/calm band.*withdrawals stay open/);
    const built = await buildAutoManageRedeemTx({ chainId: 56, vault: VAULT, owner: OWNER, percent: 50 });
    const [shares, min0, min1, receiver, owner] = vaultIface.decodeFunctionData("redeem", built.tx.data);
    expect([shares, min0, min1, receiver, owner]).toEqual([500n, 1485n, 2475n, OWNER, OWNER]);
    expect(built.approvals).toEqual([]);
  });

  it("claims only when something has accrued", async () => {
    const built = await buildAutoManageClaimTx({ chainId: 4663, vault: VAULT, owner: OWNER });
    expect(vaultIface.decodeFunctionData("claimRewards", built.tx.data)[0]).toBe(OWNER);
    vaultFake.earned = vi.fn(async () => 0n);
    await expect(buildAutoManageClaimTx({ chainId: 4663, vault: VAULT, owner: OWNER })).rejects.toThrow(/Nothing to claim/);
  });
});

describe("Auto Manage zaps", () => {
  it("zaps a pool token in with one 0x leg, keeps the rest and sets minShares from firm minimums", async () => {
    const built = await buildAutoManageZapInTx({ chainId: 56, vault: VAULT, owner: OWNER, tokenIn: TOKEN0, amountIn: 900n });
    expect(built.tx.to).toBe(contractAddress(56, "AutoManageZap"));
    const [z] = zapIface.decodeFunctionData("zapIn", built.tx.data);
    // Equal rates, vault holds twice as much token1: a third stays token0, two thirds buy token1.
    expect(z.swap0.sellAmount).toBe(0n);
    expect(z.swap0.data).toBe("0x");
    expect(z.swap1.sellToken).toBe(TOKEN0);
    expect(z.swap1.sellAmount).toBe(600n);
    expect(z.minShares).toBe(((300n + 594n) * 9_900n) / 10_000n);
    expect(firmSwapLeg).toHaveBeenCalledTimes(1);
    expect(firmSwapLeg.mock.calls[0][0]).toMatchObject({ zap: contractAddress(56, "AutoManageZap"), txOrigin: OWNER });
    expect(built.approvals.map((a) => a.to)).toEqual([TOKEN0]);
    expect(built.tx.value).toBe(0n);
  });

  it("zaps native in as value with the wrapped native as tokenIn and no approval", async () => {
    const built = await buildAutoManageZapInTx({ chainId: 56, vault: VAULT, owner: OWNER, tokenIn: null, amountIn: 900n });
    const [z] = zapIface.decodeFunctionData("zapInNative", built.tx.data);
    expect(z.tokenIn).toBe(getAddress("0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c"));
    expect(built.tx.value).toBe(900n);
    expect(built.approvals).toEqual([]);
  });

  it("refuses native zaps on Arc", async () => {
    await expect(buildAutoManageZapInTx({ chainId: 5042, vault: VAULT, owner: OWNER, tokenIn: null, amountIn: 1n }))
      .rejects.toThrow(/Arc has no wrapped native/);
  });

  it("zaps out selling slightly less than the previewed redemption and approves shares to the zap", async () => {
    const built = await buildAutoManageZapOutTx({ chainId: 4663, vault: VAULT, owner: OWNER, tokenOut: TOKEN1, shares: 100n });
    const [z] = zapIface.decodeFunctionData("zapOut", built.tx.data);
    const sold = (300n * (10_000n - ZAP_OUT_SELL_HAIRCUT_BPS)) / 10_000n;
    expect(z.swap0.sellAmount).toBe(sold);
    expect(z.swap1.sellAmount).toBe(0n);
    expect(z.minOut).toBe((500n * 9_900n) / 10_000n + (sold * 99n) / 100n);
    expect(built.approvals.map((a) => a.to)).toEqual([VAULT]);
  });
});
