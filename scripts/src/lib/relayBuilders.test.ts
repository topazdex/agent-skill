import { describe, it, expect, vi, beforeEach } from "vitest";
import { Interface, getAddress } from "ethers";
import { ADDR } from "../config/addresses.js";
import { TOKENS } from "../config/tokens.js";
import { ABIS } from "./abis.js";

vi.mock("ethers", async () => {
  const actual = await vi.importActual<typeof import("ethers")>("ethers");
  return { ...actual, Contract: vi.fn() };
});

vi.mock("./client.js", () => ({
  provider: vi.fn(() => ({})),
}));

// Pin "now" to a deterministic mid-epoch timestamp so the once-per-epoch and
// final-hour guards behave the same on every run (512000s into the week).
vi.mock("./epoch.js", async () => {
  const actual = await vi.importActual<typeof import("./epoch.js")>("./epoch.js");
  return { ...actual, nowSec: () => 1_700_000_000 };
});

const { Contract } = await import("ethers");
const {
  buildDepositManagedTx,
  buildWithdrawManagedTx,
  buildRelayClaimTx,
} = await import("./relayBuilders.js");

const mockContract = vi.mocked(Contract);

const tokenId = 42n;
const owner = getAddress("0x000000000000000000000000000000000000dEaD");
const freeReward = getAddress("0x970490c51358B28d31529666Aa01d9Aeaf4d844E");

interface WireOpts {
  escrowType?: bigint;
  lastVoted?: bigint;
  ownerOf?: string;
  idToManaged?: bigint;
  managedToFree?: string;
  earned?: bigint;
}

function wire(opts: WireOpts = {}): void {
  const obj = {
    escrowType: vi.fn(async () => opts.escrowType ?? 0n),
    lastVoted: vi.fn(async () => opts.lastVoted ?? 0n),
    ownerOf: vi.fn(async () => opts.ownerOf ?? owner),
    idToManaged: vi.fn(async () => opts.idToManaged ?? 0n),
    managedToFree: vi.fn(async () => opts.managedToFree ?? freeReward),
    earned: vi.fn(async () => opts.earned ?? 0n),
  };
  mockContract.mockImplementation(() => obj as unknown as InstanceType<typeof Contract>);
}

beforeEach(() => {
  mockContract.mockReset();
});

describe("buildDepositManagedTx", () => {
  it("builds Voter.depositManaged calldata for the Maxi relay without broadcasting", async () => {
    // #given a NORMAL veNFT that has not voted this epoch
    wire({ escrowType: 0n });

    // #when building a deposit into "maxi"
    const built = await buildDepositManagedTx({ tokenId, relay: "maxi" });

    // #then it targets the Voter with depositManaged(tokenId, 3083)
    expect(built.kind).toBe("deposit-managed");
    expect(built.relay.type).toBe("maxi");
    expect(built.mTokenId).toBe(3083);
    expect(built.tx.to).toBe(ADDR.Voter);
    expect(built.tx.value).toBe(0n);

    const decoded = new Interface(ABIS.Voter).parseTransaction({ data: built.tx.data });
    expect(decoded?.name).toBe("depositManaged");
    expect(decoded?.args[0]).toBe(tokenId);
    expect(decoded?.args[1]).toBe(3083n);
  });

  it("resolves the reward-distribute relay to mTokenId 3087", async () => {
    wire({ escrowType: 0n });
    const built = await buildDepositManagedTx({ tokenId, relay: "reward-distribute" });
    expect(built.mTokenId).toBe(3087);
  });

  it("rejects an unknown relay selector", async () => {
    await expect(buildDepositManagedTx({ tokenId, relay: "bogus" })).rejects.toThrow(/unknown relay/);
  });

  it("rejects a veNFT that is not a NORMAL lock", async () => {
    wire({ escrowType: 2n });
    await expect(buildDepositManagedTx({ tokenId, relay: "maxi" })).rejects.toThrow(/not a NORMAL lock/);
  });

  it("rejects a veNFT that already voted/deposited this epoch", async () => {
    wire({ escrowType: 0n, lastVoted: 1_700_000_000n });
    await expect(buildDepositManagedTx({ tokenId, relay: "maxi" })).rejects.toThrow(/already voted or deposited/);
  });

  it("rejects an owner mismatch when owner is asserted", async () => {
    wire({ escrowType: 0n, ownerOf: owner });
    await expect(
      buildDepositManagedTx({ tokenId, relay: "maxi", owner: getAddress("0x0000000000000000000000000000000000000001") }),
    ).rejects.toThrow(/owned by/);
  });
});

describe("buildWithdrawManagedTx", () => {
  it("builds Voter.withdrawManaged calldata for a locked-into-managed veNFT", async () => {
    // #given a LOCKED veNFT currently inside managed lock 3083
    wire({ escrowType: 1n, idToManaged: 3083n });

    const built = await buildWithdrawManagedTx({ tokenId });

    expect(built.kind).toBe("withdraw-managed");
    expect(built.tx.to).toBe(ADDR.Voter);
    const decoded = new Interface(ABIS.Voter).parseTransaction({ data: built.tx.data });
    expect(decoded?.name).toBe("withdrawManaged");
    expect(decoded?.args[0]).toBe(tokenId);
  });

  it("rejects a veNFT that is not currently in a managed lock", async () => {
    wire({ escrowType: 0n, idToManaged: 0n });
    await expect(buildWithdrawManagedTx({ tokenId })).rejects.toThrow(/not currently deposited/);
  });
});

describe("buildRelayClaimTx", () => {
  it("builds FreeManagedReward.getReward calldata for a Reward & Distribute depositor", async () => {
    // #given the veNFT is deposited into the reward-distribute managed lock (3087) with USDT earned
    wire({ idToManaged: 3087n, managedToFree: freeReward, earned: 100n * 10n ** 18n });

    const built = await buildRelayClaimTx({ tokenId });

    expect(built.kind).toBe("relay-claim");
    expect(built.freeManagedReward).toBe(freeReward);
    expect(built.payoutToken).toBe(TOKENS.USDT.address);
    expect(built.earned).toBe(100n * 10n ** 18n);
    expect(built.tx.to).toBe(freeReward);

    const decoded = new Interface(ABIS.Reward).parseTransaction({ data: built.tx.data });
    expect(decoded?.name).toBe("getReward");
    expect(decoded?.args[0]).toBe(tokenId);
    expect(decoded?.args[1]).toEqual([TOKENS.USDT.address]);
  });

  it("refuses to claim from the in-place-compounding Maxi relay", async () => {
    wire({ idToManaged: 3083n });
    await expect(buildRelayClaimTx({ tokenId })).rejects.toThrow(/compounds rewards in-place/);
  });

  it("rejects a veNFT not deposited into any managed lock", async () => {
    wire({ idToManaged: 0n });
    await expect(buildRelayClaimTx({ tokenId })).rejects.toThrow(/not deposited into any managed lock/);
  });

  it("rejects when there is nothing claimable", async () => {
    wire({ idToManaged: 3087n, managedToFree: freeReward, earned: 0n });
    await expect(buildRelayClaimTx({ tokenId })).rejects.toThrow(/nothing claimable/);
  });
});
