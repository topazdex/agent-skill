import { beforeEach, describe, expect, it, vi } from "vitest";
import { Interface, getAddress, type InterfaceAbi } from "ethers";

// Fixture addresses only; the real manifest stays pending until a broadcast is synced.
const RAW = vi.hoisted(() => {
  const a = (byte: string) => "0x" + byte.repeat(20);
  return {
    rhEscrow: a("a1"), rhZap: a("a2"), rhMaxi: a("a3"), rhConverter: a("a4"),
    rhLockedMaxi: a("a5"), rhFreeMaxi: a("a6"), rhLockedConv: a("a7"), rhFreeConv: a("a8"),
    arcEscrow: a("b1"), arcZap: a("b2"), arcMaxi: a("b3"), arcConverter: a("b4"),
    arcLocked: a("b5"), arcFree: a("b6"),
  };
});

vi.mock("../../../references/spoke-relays.json", async (importOriginal) => {
  const real = (await importOriginal<{ default: typeof import("../../../references/spoke-relays.json") }>()).default;
  const manifest = structuredClone(real);
  const fill = (network: string, escrow: string, zap: string, maxi: string[], converter: string[]) => {
    const chain = manifest.chains.find((c) => c.network === network)!;
    Object.assign(chain, { status: "deployed", deployBlock: 1 });
    Object.assign(chain.contracts, { ManagedEscrow: escrow, RelayEntryZap: zap });
    Object.assign(chain.relays.maxi, { address: maxi[0], mTokenId: 1, lockedManagedReward: maxi[1], freeManagedReward: maxi[2] });
    Object.assign(chain.relays.converter, { address: converter[0], mTokenId: 2, lockedManagedReward: converter[1], freeManagedReward: converter[2] });
  };
  fill("robinhood", RAW.rhEscrow, RAW.rhZap, [RAW.rhMaxi, RAW.rhLockedMaxi, RAW.rhFreeMaxi], [RAW.rhConverter, RAW.rhLockedConv, RAW.rhFreeConv]);
  fill("arc", RAW.arcEscrow, RAW.arcZap, [RAW.arcMaxi, RAW.arcLocked, RAW.arcFree], [RAW.arcConverter, RAW.arcLocked, RAW.arcFree]);
  return { default: manifest };
});
vi.mock("ethers", async () => {
  const actual = await vi.importActual<typeof import("ethers")>("ethers");
  return { ...actual, Contract: vi.fn() };
});

const WEEK = 604_800;
const EPOCH = 2810 * WEEK;
const clock = { now: EPOCH + 3 * 86_400 };
const balances = { native: 10n ** 18n };
vi.mock("./client.js", () => ({
  provider: vi.fn(() => ({
    getBlock: async () => ({ timestamp: clock.now }),
    getBalance: async () => balances.native,
  })),
}));
const quote = { out: 1_000n * 10n ** 18n };
vi.mock("../read/quotes.js", () => ({ quoteV3Path: vi.fn(async () => quote.out) }));

const { Contract } = await import("ethers");
const mockContract = vi.mocked(Contract);
const { spokeRelayAbi } = await import("../read/relays.js");
const {
  buildSpokeRelayClaimDeferredTx,
  buildSpokeRelayClaimTx,
  buildSpokeRelayDepositTx,
  buildSpokeRelayWithdrawTx,
  buildSpokeRelayZapTx,
} = await import("./relayBuilders.js");

const addr = (byte: string) => getAddress("0x" + byte.repeat(20));
const FIX = Object.fromEntries(Object.entries(RAW).map(([k, v]) => [k, getAddress(v)])) as typeof RAW;
const OWNER = addr("0e");
const XTOPAZ = getAddress("0x1aA89C4Ab9884Cb65B759A3Cc3A1690744d687a6");
const USDG = getAddress("0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168");
const WETH = getAddress("0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73");
const ARC_USDC = getAddress("0x3600000000000000000000000000000000000000");
const VAULT = getAddress("0x35D7Ac512f465F48D2bCb4C7322dd34c7BB7c777");
const E18 = 10n ** 18n;

let registry: Map<string, Record<string, ReturnType<typeof vi.fn>>>;
function fake(address: string, methods: Record<string, unknown>): void {
  registry.set(address.toLowerCase(), Object.fromEntries(
    Object.entries(methods).map(([name, value]) => [name, vi.fn(async () => (typeof value === "function" ? value() : value))]),
  ));
}

interface EscrowOpts {
  depositId?: bigint;
  escrowType?: bigint;
  weight?: bigint;
  unlockAt?: bigint;
  deferred?: bigint;
  withdrawable?: bigint;
  deactivated?: boolean;
  approvedForAll?: boolean;
}

function wire(escrow: string, opts: EscrowOpts = {}, extra: { allowance?: bigint; balance?: bigint; earned?: bigint; freeEarned?: bigint } = {}) {
  fake(escrow, {
    deactivated: opts.deactivated ?? false,
    isApprovedForAll: opts.approvedForAll ?? false,
    depositIdOf: opts.depositId ?? 0n,
    escrowType: opts.escrowType ?? 1n,
    weights: opts.weight ?? 10n * E18,
    unlockAt: opts.unlockAt ?? BigInt(EPOCH),
    deferred: opts.deferred ?? 0n,
    withdrawable: opts.withdrawable ?? 100n * E18,
  });
  const token = { allowance: extra.allowance ?? 0n, balanceOf: extra.balance ?? 100n * E18 };
  for (const t of [XTOPAZ, USDG, WETH, ARC_USDC]) fake(t, token);
  fake(VAULT, { lockUntil: BigInt(EPOCH + 2 * WEEK) });
  for (const zap of [FIX.rhZap, FIX.arcZap]) fake(zap, {});
  for (const locked of [FIX.rhLockedMaxi, FIX.rhLockedConv, FIX.arcLocked]) fake(locked, { earned: extra.earned ?? 2n * E18 });
  for (const free of [FIX.rhFreeMaxi, FIX.rhFreeConv, FIX.arcFree]) {
    fake(free, { rewardsListLength: 1n, rewards: free === FIX.rhFreeMaxi ? XTOPAZ : USDG, earned: extra.freeEarned ?? 0n });
  }
}

beforeEach(() => {
  clock.now = EPOCH + 3 * 86_400;
  registry = new Map();
  mockContract.mockReset();
  mockContract.mockImplementation((address, abi) => {
    const methods = registry.get(String(address).toLowerCase());
    if (!methods) throw new Error(`unexpected contract ${String(address)}`);
    const iface = abi instanceof Interface ? abi : new Interface(abi as InterfaceAbi);
    return { ...methods, interface: iface } as unknown as InstanceType<typeof Contract>;
  });
});

const escrowIface = () => new Interface(spokeRelayAbi("ManagedEscrow"));

describe("spoke relays that are not deployed", () => {
  it("say so before any RPC call", async () => {
    // #given Base is staged with no deployment recorded
    // #when building a deposit there
    // #then it fails with the not-yet-deployed reason and constructs no contract
    await expect(buildSpokeRelayDepositTx({ chainId: 8453, relay: "maxi", owner: OWNER, amount: E18 }))
      .rejects.toThrow(/Topaz Maxi on Base \(8453\) is not yet deployed \(staged:/);
    expect(mockContract).not.toHaveBeenCalled();
  });

  it("reject an unknown selector with the chain's options", async () => {
    await expect(buildSpokeRelayDepositTx({ chainId: 4663, relay: "reward-distribute", owner: OWNER, amount: E18 }))
      .rejects.toThrow(/unknown relay "reward-distribute".*"maxi".*"converter"/);
  });
});

describe("buildSpokeRelayDepositTx", () => {
  it("approves xTOPAZ to the escrow and encodes depositManaged(mTokenId, amount)", async () => {
    wire(FIX.rhEscrow);
    const built = await buildSpokeRelayDepositTx({ chainId: 4663, relay: "converter", owner: OWNER, amount: 5n * E18 });

    expect(built.kind).toBe("spoke-deposit");
    expect(built.approvals).toHaveLength(1);
    expect(built.approvals[0].to).toBe(XTOPAZ);
    expect(new Interface(["function approve(address,uint256)"]).decodeFunctionData("approve", built.approvals[0].data))
      .toEqual([FIX.rhEscrow, 5n * E18]);
    expect(built.tx.to).toBe(FIX.rhEscrow);
    expect(built.tx.value).toBe(0n);
    const decoded = escrowIface().parseTransaction({ data: built.tx.data });
    expect(decoded?.name).toBe("depositManaged");
    expect(decoded?.args.toArray()).toEqual([2n, 5n * E18]);
    expect(built.details.unlockAt).toBe(EPOCH + 2 * WEEK);
  });

  it("skips the approval when the allowance already covers it", async () => {
    wire(FIX.rhEscrow, {}, { allowance: 5n * E18 });
    const built = await buildSpokeRelayDepositTx({ chainId: 4663, relay: "maxi", owner: OWNER, amount: 5n * E18 });
    expect(built.approvals).toEqual([]);
  });

  it("builds any positive amount, as BNB does; sub-lot deposits are buffered on-chain", async () => {
    wire(FIX.rhEscrow);
    const built = await buildSpokeRelayDepositTx({ chainId: 4663, relay: "maxi", owner: OWNER, amount: 1n });
    expect(escrowIface().parseTransaction({ data: built.tx.data })?.args.toArray()).toEqual([1n, 1n]);
    await expect(buildSpokeRelayDepositTx({ chainId: 4663, relay: "maxi", owner: OWNER, amount: 0n })).rejects.toThrow(/positive/);
  });

  it("enforces deactivation and both closed windows", async () => {
    wire(FIX.rhEscrow);
    clock.now = EPOCH + 1_800;
    await expect(buildSpokeRelayDepositTx({ chainId: 4663, relay: "maxi", owner: OWNER, amount: E18 }))
      .rejects.toThrow(/first hour/);

    clock.now = EPOCH + WEEK - 1_800;
    await expect(buildSpokeRelayDepositTx({ chainId: 4663, relay: "maxi", owner: OWNER, amount: E18 }))
      .rejects.toThrow(/Wednesday 23:00 UTC/);

    clock.now = EPOCH + 3 * 86_400;
    wire(FIX.rhEscrow, { deactivated: true });
    await expect(buildSpokeRelayDepositTx({ chainId: 4663, relay: "maxi", owner: OWNER, amount: E18 }))
      .rejects.toThrow(/deactivated/);
  });
});

describe("buildSpokeRelayZapTx", () => {
  it("zaps native ETH on Robinhood through WETH → xTOPAZ (ts 2000) with value and a slipped minimum", async () => {
    wire(FIX.rhEscrow);
    const built = await buildSpokeRelayZapTx({ chainId: 4663, relay: "maxi", owner: OWNER, tokenIn: null, amountIn: E18 / 10n });

    expect(built.approvals).toEqual([]);
    expect(built.tx.to).toBe(FIX.rhZap);
    expect(built.tx.value).toBe(E18 / 10n);
    const decoded = new Interface(spokeRelayAbi("RelayEntryZap")).parseTransaction({ data: built.tx.data, value: built.tx.value });
    expect(decoded?.name).toBe("zapInETH");
    expect(decoded?.args[0]).toBe(1n);
    expect(String(decoded?.args[1]).toLowerCase()).toBe(
      (WETH + "0007d0" + XTOPAZ.slice(2)).toLowerCase(),
    );
    expect(decoded?.args[2]).toBe((quote.out * 9_900n) / 10_000n);
  });

  it("never offers a native zap on Arc", async () => {
    wire(FIX.arcEscrow);
    await expect(buildSpokeRelayZapTx({ chainId: 5042, relay: "maxi", owner: OWNER, tokenIn: null, amountIn: E18 }))
      .rejects.toThrow(/Arc has no native leg/);
  });

  it("zaps Arc USDC with zapInToken after approving the zap", async () => {
    wire(FIX.arcEscrow);
    const built = await buildSpokeRelayZapTx({ chainId: 5042, relay: "converter", owner: OWNER, tokenIn: ARC_USDC, amountIn: 25_000_000n });

    expect(built.approvals.map((a) => a.to)).toEqual([ARC_USDC]);
    expect(built.tx.value).toBe(0n);
    const decoded = new Interface(spokeRelayAbi("RelayEntryZap")).parseTransaction({ data: built.tx.data });
    expect(decoded?.name).toBe("zapInToken");
    expect(decoded?.args[0]).toBe(2n);
    expect(decoded?.args[1]).toBe(ARC_USDC);
    expect(decoded?.args[2]).toBe(25_000_000n);
    expect(String(decoded?.args[3]).toLowerCase()).toBe((ARC_USDC + "0007d0" + XTOPAZ.slice(2)).toLowerCase());
  });

});

describe("buildSpokeRelayWithdrawTx", () => {
  it("refuses before unlockAt and reports the unlock time", async () => {
    wire(FIX.rhEscrow, { depositId: 7n, unlockAt: BigInt(EPOCH + WEEK) });
    await expect(buildSpokeRelayWithdrawTx({ chainId: 4663, relay: "maxi", owner: OWNER }))
      .rejects.toThrow(/locked until/);
  });

  it("encodes withdrawManaged(depositId) and forecasts the deferred part", async () => {
    wire(FIX.rhEscrow, { depositId: 7n, weight: 10n * E18, withdrawable: 8n * E18 });
    const built = await buildSpokeRelayWithdrawTx({ chainId: 4663, relay: "maxi", owner: OWNER });

    const decoded = escrowIface().parseTransaction({ data: built.tx.data });
    expect(decoded?.name).toBe("withdrawManaged");
    expect(decoded?.args[0]).toBe(7n);
    expect(built.details.owed).toBe(12n * E18);
    expect(built.details.expectedDeferred).toBe(4n * E18);
  });

  it("lets an isApprovedForAll operator build the exit for the owner", async () => {
    const operator = addr("0f");
    wire(FIX.rhEscrow, { depositId: 7n, approvedForAll: true });
    const built = await buildSpokeRelayWithdrawTx({ chainId: 4663, relay: "maxi", owner: OWNER, caller: operator });
    expect(built.details.caller).toBe(operator);
    expect(escrowIface().parseTransaction({ data: built.tx.data })?.args[0]).toBe(7n);

    wire(FIX.rhEscrow, { depositId: 7n, approvedForAll: false });
    await expect(buildSpokeRelayWithdrawTx({ chainId: 4663, relay: "maxi", owner: OWNER, caller: operator }))
      .rejects.toThrow(/approved operator/);
  });

  it("is closed only in the first hour of the epoch", async () => {
    wire(FIX.rhEscrow, { depositId: 7n });
    clock.now = EPOCH + WEEK - 1_800;
    await expect(buildSpokeRelayWithdrawTx({ chainId: 4663, relay: "maxi", owner: OWNER })).resolves.toBeDefined();
    clock.now = EPOCH + 1_800;
    await expect(buildSpokeRelayWithdrawTx({ chainId: 4663, relay: "maxi", owner: OWNER })).rejects.toThrow(/first hour/);
  });

  it("points an exited deposit with deferred xTOPAZ at claimDeferred", async () => {
    wire(FIX.rhEscrow, { depositId: 7n, escrowType: 0n, deferred: E18 });
    await expect(buildSpokeRelayWithdrawTx({ chainId: 4663, relay: "maxi", owner: OWNER })).rejects.toThrow(/claimDeferred/);
  });
});

describe("buildSpokeRelayClaimDeferredTx", () => {
  it("encodes claimDeferred(depositId) when something is owed and payable", async () => {
    wire(FIX.rhEscrow, { depositId: 7n, escrowType: 0n, deferred: 3n * E18, withdrawable: E18 });
    const built = await buildSpokeRelayClaimDeferredTx({ chainId: 4663, relay: "maxi", owner: OWNER });
    expect(escrowIface().parseTransaction({ data: built.tx.data })?.name).toBe("claimDeferred");
    expect(built.details.expectedPaid).toBe(E18);
  });

  it("refuses when nothing is deferred", async () => {
    wire(FIX.rhEscrow, { depositId: 7n });
    await expect(buildSpokeRelayClaimDeferredTx({ chainId: 4663, relay: "maxi", owner: OWNER })).rejects.toThrow(/no deferred/);
  });
});

describe("buildSpokeRelayClaimTx", () => {
  it("claims the converter's stable from FreeManagedReward", async () => {
    wire(FIX.rhEscrow, { depositId: 9n }, { freeEarned: 4_000_000n });
    const built = await buildSpokeRelayClaimTx({ chainId: 4663, relay: "converter", owner: OWNER });

    expect(built.tx.to).toBe(FIX.rhFreeConv);
    const decoded = new Interface(spokeRelayAbi("FreeManagedReward")).parseTransaction({ data: built.tx.data });
    expect(decoded?.name).toBe("getReward");
    expect(decoded?.args[0]).toBe(9n);
    expect(decoded?.args[1]).toEqual([USDG]);
  });

  it("explains that Maxi pays on exit when nothing is claimable", async () => {
    wire(FIX.rhEscrow, { depositId: 9n });
    await expect(buildSpokeRelayClaimTx({ chainId: 4663, relay: "maxi", owner: OWNER })).rejects.toThrow(/paid on exit/);
  });

  it("refuses an account with no deposit", async () => {
    wire(FIX.rhEscrow, { depositId: 0n });
    await expect(buildSpokeRelayClaimTx({ chainId: 4663, relay: "converter", owner: OWNER })).rejects.toThrow(/has no deposit/);
  });
});
