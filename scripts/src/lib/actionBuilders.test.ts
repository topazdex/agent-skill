import { describe, it, expect, vi, beforeEach } from "vitest";
import { Interface, ZeroAddress, getAddress } from "ethers";
import { ADDR } from "../config/addresses.js";
import { TOKENS } from "../config/tokens.js";
import { ABIS } from "./abis.js";

vi.mock("ethers", async () => {
  const actual = await vi.importActual<typeof import("ethers")>("ethers");
  return {
    ...actual,
    Contract: vi.fn(),
  };
});

vi.mock("./client.js", () => ({
  provider: vi.fn(() => ({})),
}));

vi.mock("./erc20.js", () => ({
  allowance: vi.fn(async () => 0n),
  getDecimals: vi.fn(async () => 18),
}));

const { Contract } = await import("ethers");
const erc20 = await import("./erc20.js");
const { buildBribeDepositTx } = await import("./actionBuilders.js");

const mockContract = vi.mocked(Contract);
const mockAllowance = vi.mocked(erc20.allowance);

const pool = getAddress("0x35BF6c8375776EcE4399bc17159eD97AB5Dc5172");
const gauge = getAddress("0x14c93dDbC3bd299E70C8db932671883F96eC87eb");
const bribe = getAddress("0x970490c51358B28d31529666Aa01d9Aeaf4d844E");
const token = TOKENS.USDC.address;
const payer = getAddress("0x000000000000000000000000000000000000dEaD");

function wireContracts({
  gaugeAddress = gauge,
  alive = true,
  isReward = false,
  whitelisted = true,
}: {
  gaugeAddress?: string;
  alive?: boolean;
  isReward?: boolean;
  whitelisted?: boolean;
} = {}) {
  const voter = {
    gauges: vi.fn(async () => gaugeAddress),
    isAlive: vi.fn(async () => alive),
    gaugeToBribe: vi.fn(async () => bribe),
    isWhitelistedToken: vi.fn(async () => whitelisted),
  };
  const reward = {
    isReward: vi.fn(async () => isReward),
  };
  mockContract
    .mockImplementationOnce(() => voter as unknown as InstanceType<typeof Contract>)
    .mockImplementationOnce(() => reward as unknown as InstanceType<typeof Contract>);
  return { voter, reward };
}

beforeEach(() => {
  mockContract.mockReset();
  mockAllowance.mockReset();
  mockAllowance.mockResolvedValue(0n);
});

describe("buildBribeDepositTx", () => {
  it("builds approval + notifyRewardAmount calldata without broadcasting", async () => {
    wireContracts();

    const built = await buildBribeDepositTx({
      pool,
      token,
      amount: "100",
    });

    expect(built.pool).toBe(pool);
    expect(built.gauge).toBe(gauge);
    expect(built.bribe).toBe(bribe);
    expect(built.amount).toBe(100n * 10n ** 18n);
    expect(built.isRewardAlready).toBe(false);
    expect(built.isWhitelisted).toBe(true);
    expect(built.epochVoteEnd).toBeGreaterThan(built.epochStart);
    expect(built.builtAt).toBeGreaterThan(0);

    expect(built.approval).toEqual({
      token,
      spender: bribe,
      amount: 100n * 10n ** 18n,
      to: token,
      data: expect.any(String),
      value: 0n,
    });

    const erc20Iface = new Interface(ABIS.ERC20);
    const approve = erc20Iface.parseTransaction({ data: built.approval!.data, value: 0n });
    expect(approve?.name).toBe("approve");
    expect(approve?.args[0]).toBe(bribe);
    expect(approve?.args[1]).toBe(100n * 10n ** 18n);

    const rewardIface = new Interface(ABIS.Reward);
    const deposit = rewardIface.parseTransaction({ data: built.deposit.data, value: 0n });
    expect(built.deposit.to).toBe(bribe);
    expect(built.deposit.value).toBe(0n);
    expect(deposit?.name).toBe("notifyRewardAmount");
    expect(deposit?.args[0]).toBe(token);
    expect(deposit?.args[1]).toBe(100n * 10n ** 18n);
  });

  it("skips approval when payer allowance already covers the bribe amount", async () => {
    wireContracts();
    mockAllowance.mockResolvedValue(1_000n * 10n ** 18n);

    const built = await buildBribeDepositTx({
      pool,
      token,
      amount: "100",
      payer,
    });

    expect(built.approval).toBeUndefined();
    expect(mockAllowance).toHaveBeenCalledWith(token, payer, bribe);
  });

  it("accepts a token already registered as a reward even if whitelist is false", async () => {
    const { voter } = wireContracts({ isReward: true, whitelisted: false });

    const built = await buildBribeDepositTx({ pool, token, amount: 1n });

    expect(built.isRewardAlready).toBe(true);
    expect(built.isWhitelisted).toBe(false);
    expect(voter.isWhitelistedToken).toHaveBeenCalledWith(token);
  });

  it("rejects a pool without a gauge", async () => {
    wireContracts({ gaugeAddress: ZeroAddress });

    await expect(buildBribeDepositTx({ pool, token, amount: "100" }))
      .rejects.toThrow(/no gauge/);
  });

  it("rejects a killed gauge", async () => {
    wireContracts({ alive: false });

    await expect(buildBribeDepositTx({ pool, token, amount: "100" }))
      .rejects.toThrow(/gauge is killed/);
  });

  it("rejects an unregistered, non-whitelisted bribe token", async () => {
    wireContracts({ isReward: false, whitelisted: false });

    await expect(buildBribeDepositTx({ pool, token, amount: "100" }))
      .rejects.toThrow(/not whitelisted|would revert/);
  });

  it("rejects zero amounts before returning calldata", async () => {
    wireContracts();

    await expect(buildBribeDepositTx({ pool, token, amount: 0n }))
      .rejects.toThrow(/amount must be > 0/);
  });
});
