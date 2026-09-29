import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAddress } from "ethers";

vi.mock("ethers", async () => {
  const actual = await vi.importActual<typeof import("ethers")>("ethers");
  return { ...actual, Contract: vi.fn() };
});
vi.mock("../lib/client.js", () => ({
  provider: vi.fn(() => ({})),
  signer: vi.fn(() => ({ getAddress: async () => getAddress("0x" + "0a".repeat(20)) })),
}));
vi.mock("../lib/erc20.js", () => ({
  approveIfNeeded: vi.fn(async () => undefined),
  getDecimals: vi.fn(async () => 18),
}));
vi.mock("../read/pools.js", () => ({
  findV3Pool: vi.fn(async () => getAddress("0x" + "cc".repeat(20))),
  getPoolV3: vi.fn(async () => ({ tick: 0, sqrtPriceX96: 2n ** 96n, decimals0: 18, decimals1: 18 })),
}));

const { Contract } = await import("ethers");
const mint = vi.fn(async () => ({ hash: "0xmint" }));
vi.mocked(Contract).mockImplementation(() => ({ mint }) as unknown as InstanceType<typeof Contract>);
const erc20 = await import("../lib/erc20.js");
const { mintPosition } = await import("./liquidityV3.js");
const { contractAddress } = await import("../config/deployments.js");

beforeEach(() => mint.mockClear());

describe("mintPosition", () => {
  it("passes sqrtPriceX96 = 0 so NPM.mint does not try to create an existing pool", async () => {
    await mintPosition({
      chainId: 8453,
      tokenA: "0x" + "11".repeat(20),
      tokenB: "0x" + "22".repeat(20),
      tickSpacing: 50,
      rangeTicks: 500,
      amountA: 10n ** 18n,
    });
    const params = (mint.mock.calls[0] as unknown[])[0] as { sqrtPriceX96: bigint; amount0Desired: bigint };
    expect(params.sqrtPriceX96).toBe(0n);
    expect(params.amount0Desired).toBe(10n ** 18n);
    expect(vi.mocked(erc20.approveIfNeeded)).toHaveBeenCalledWith(
      expect.any(String),
      contractAddress(8453, "NonfungiblePositionManager"),
      expect.any(BigInt),
      { chainId: 8453 },
    );
  });
});
