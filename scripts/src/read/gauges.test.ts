import { describe, it, expect, vi, beforeEach } from "vitest";
import { ZeroAddress, getAddress } from "ethers";

// We have to set up the mocks before importing the module under test, because
// `listGaugesForPair` constructs ethers Contracts at call time using the
// `provider` / `ABIS` / `ADDR` modules. Mocking the constructed Contract
// instances would be brittle; mocking `ethers.Contract` directly gives us a
// clean seam.

vi.mock("ethers", async () => {
  const actual = await vi.importActual<typeof import("ethers")>("ethers");
  return {
    ...actual,
    Contract: vi.fn(),
  };
});

vi.mock("../lib/client.js", () => ({
  provider: vi.fn(() => ({})),
}));

const { Contract } = await import("ethers");
const mockContract = vi.mocked(Contract);
const { listGaugesForPair } = await import("./gauges.js");
const { ADDR, TICK_SPACINGS } = await import("../config/addresses.js");

beforeEach(() => {
  vi.clearAllMocks();
});

const tokenA = getAddress("0x" + "11".repeat(20));
const tokenB = getAddress("0x" + "22".repeat(20));

// Helper to script Contract construction in order:
// 1st call → PoolFactory (v2)
// 2nd call → CLFactory (v3)
// 3rd call → Voter
const wireFactories = ({
  v2Volatile,
  v2Stable,
  v3PoolsByTickSpacing,
  voterMap,
  isAliveMap,
}: {
  v2Volatile: string;
  v2Stable: string;
  v3PoolsByTickSpacing: Record<number, string>;
  voterMap: Record<string, string>;
  isAliveMap: Record<string, boolean>;
}) => {
  const poolFactory = {
    getPool: vi.fn(async (a: string, b: string, stable: boolean) => {
      void a; void b;
      return stable ? v2Stable : v2Volatile;
    }),
  };
  const clFactory = {
    getPool: vi.fn(async (a: string, b: string, ts: number) => {
      void a; void b;
      return v3PoolsByTickSpacing[ts] ?? ZeroAddress;
    }),
  };
  const voter = {
    gauges: vi.fn(async (pool: string) => voterMap[pool.toLowerCase()] ?? ZeroAddress),
    isAlive: vi.fn(async (gauge: string) => isAliveMap[gauge.toLowerCase()] ?? false),
  };

  mockContract
    .mockImplementationOnce(() => poolFactory as unknown as InstanceType<typeof Contract>)
    .mockImplementationOnce(() => clFactory as unknown as InstanceType<typeof Contract>)
    .mockImplementationOnce(() => voter as unknown as InstanceType<typeof Contract>);

  return { poolFactory, clFactory, voter };
};

describe("listGaugesForPair", () => {
  it("returns every variant that has a non-zero gauge (the WBNB/BTCB shape)", async () => {
    // #given a pair with v2 volatile + v3 ts=50, no v2 stable, no other v3 tick spacings
    const v2VolPool = "0x35BF6c8375776EcE4399bc17159eD97AB5Dc5172";
    const v3Ts50Pool = "0xfdA4eF2829C5ad5E8434AfDBe478841d289b14A5";
    const v2VolGauge = "0x14c93dDbC3bd299E70C8db932671883F96eC87eb";
    const v3Ts50Gauge = "0xa9F8A05FdEdACd4aFCf975FC81c3760Db2553737";
    wireFactories({
      v2Volatile: v2VolPool,
      v2Stable: ZeroAddress,
      v3PoolsByTickSpacing: { 50: v3Ts50Pool },
      voterMap: {
        [v2VolPool.toLowerCase()]: v2VolGauge,
        [v3Ts50Pool.toLowerCase()]: v3Ts50Gauge,
      },
      isAliveMap: {
        [v2VolGauge.toLowerCase()]: true,
        [v3Ts50Gauge.toLowerCase()]: true,
      },
    });

    // #when
    const result = await listGaugesForPair(tokenA, tokenB);

    // #then
    expect(result).toHaveLength(2);
    expect(result.map((e) => e.kind).sort()).toEqual(["v2-volatile", "v3-ts-50"]);
    const vol = result.find((e) => e.kind === "v2-volatile")!;
    expect(vol).toMatchObject({ type: "v2", pool: v2VolPool, gauge: v2VolGauge, alive: true });
    const v3 = result.find((e) => e.kind === "v3-ts-50")!;
    expect(v3).toMatchObject({ type: "v3", pool: v3Ts50Pool, gauge: v3Ts50Gauge, alive: true });
  });

  it("filters out variants whose gauge is ZeroAddress (pool exists, gauge not created)", async () => {
    // #given a v2 pool exists but Voter.createGauge has never been called
    const pool = "0x35BF6c8375776EcE4399bc17159eD97AB5Dc5172";
    wireFactories({
      v2Volatile: pool,
      v2Stable: ZeroAddress,
      v3PoolsByTickSpacing: {},
      voterMap: {
        [pool.toLowerCase()]: ZeroAddress,
      },
      isAliveMap: {},
    });

    // #when
    const result = await listGaugesForPair(tokenA, tokenB);

    // #then
    expect(result).toEqual([]);
  });

  it("preserves alive=false when a gauge has been killed (still returned, not silently dropped)", async () => {
    // #given a killed gauge — we want callers to know it exists but is dead, not pretend it doesn't exist
    const pool = "0x35BF6c8375776EcE4399bc17159eD97AB5Dc5172";
    const gauge = "0x14c93dDbC3bd299E70C8db932671883F96eC87eb";
    wireFactories({
      v2Volatile: pool,
      v2Stable: ZeroAddress,
      v3PoolsByTickSpacing: {},
      voterMap: { [pool.toLowerCase()]: gauge },
      isAliveMap: { [gauge.toLowerCase()]: false },
    });

    // #when
    const result = await listGaugesForPair(tokenA, tokenB);

    // #then
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ kind: "v2-volatile", gauge, alive: false });
  });

  it("returns an empty array when no pool exists for any variant", async () => {
    // #given no pools at all
    wireFactories({
      v2Volatile: ZeroAddress,
      v2Stable: ZeroAddress,
      v3PoolsByTickSpacing: {},
      voterMap: {},
      isAliveMap: {},
    });

    // #when
    const result = await listGaugesForPair(tokenA, tokenB);

    // #then
    expect(result).toEqual([]);
  });

  it("rejects self-lookup (tokenA === tokenB)", async () => {
    // #given
    // no factory wiring needed — we should throw before any RPC

    // #when / #then
    await expect(listGaugesForPair(tokenA, tokenA)).rejects.toThrow(/tokenA and tokenB must differ/);
  });

  it("issues exactly 2 + TICK_SPACINGS.length pool lookups (one per variant)", async () => {
    // #given
    const { poolFactory, clFactory } = wireFactories({
      v2Volatile: ZeroAddress,
      v2Stable: ZeroAddress,
      v3PoolsByTickSpacing: {},
      voterMap: {},
      isAliveMap: {},
    });

    // #when
    await listGaugesForPair(tokenA, tokenB);

    // #then — no skipping the stable variant or any tick spacing
    expect(poolFactory.getPool).toHaveBeenCalledTimes(2);
    expect(clFactory.getPool).toHaveBeenCalledTimes(TICK_SPACINGS.length);
    expect(mockContract).toHaveBeenNthCalledWith(1, ADDR.PoolFactory, expect.anything(), expect.anything());
    expect(mockContract).toHaveBeenNthCalledWith(2, ADDR.CLFactory, expect.anything(), expect.anything());
    expect(mockContract).toHaveBeenNthCalledWith(3, ADDR.Voter, expect.anything(), expect.anything());
  });
});
