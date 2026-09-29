import { beforeEach, describe, expect, it, vi } from "vitest";
import { ZeroAddress, getAddress } from "ethers";

// Contracts are resolved by address, so each test wires the fakes it expects to
// be called and anything else throws — a spoke call reaching the BNB Voter fails loudly.
vi.mock("ethers", async () => {
  const actual = await vi.importActual<typeof import("ethers")>("ethers");
  return { ...actual, Contract: vi.fn() };
});

vi.mock("../lib/client.js", () => ({
  provider: vi.fn(() => ({})),
  signer: vi.fn(() => ({ getAddress: async () => OWNER })),
}));

const OWNER = getAddress("0x" + "0a".repeat(20));
const POOL = getAddress("0x" + "11".repeat(20));
const GAUGE = getAddress("0x" + "22".repeat(20));
const FEES = getAddress("0x" + "33".repeat(20));
const TOKEN0 = getAddress("0x" + "44".repeat(20));
const TOKEN1 = getAddress("0x" + "55".repeat(20));

const { Contract } = await import("ethers");
const mockContract = vi.mocked(Contract);
const { contractAddress } = await import("../config/deployments.js");
const { vote, resetVote } = await import("./vote.js");
const { claimFees, claimRebase } = await import("./claim.js");

type Fake = Record<string, ReturnType<typeof vi.fn>>;
let registry: Map<string, Fake>;

function wire(address: string, fake: Fake): Fake {
  registry.set(address.toLowerCase(), fake);
  return fake;
}

function voterFake(): Fake {
  return {
    gauges: vi.fn(async () => GAUGE),
    isAlive: vi.fn(async () => true),
    lastVoted: vi.fn(async () => 0n),
    epochStart: vi.fn(async () => 1n),
    gaugeToFees: vi.fn(async () => FEES),
    vote: vi.fn(async () => ({ hash: "0xhubvote" })),
    reset: vi.fn(async () => ({ hash: "0xhubreset" })),
    claimFees: vi.fn(async () => ({ hash: "0xhubfees" })),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  registry = new Map();
  mockContract.mockImplementation((address) => {
    const fake = registry.get(String(address).toLowerCase());
    if (!fake) throw new Error(`unexpected contract ${String(address)}`);
    return fake as unknown as InstanceType<typeof Contract>;
  });
  wire(POOL, { token0: vi.fn(async () => TOKEN0), token1: vi.fn(async () => TOKEN1) });
});

describe("spoke voting goes through XTopazVotingVault", () => {
  it("validates on the local Voter and sends vote/reset through the local vault", async () => {
    const voter = wire(contractAddress(8453, "Voter"), voterFake());
    const vault = wire(contractAddress(8453, "XTopazVotingVault"), {
      vote: vi.fn(async () => ({ hash: "0xspokevote" })),
      reset: vi.fn(async () => ({ hash: "0xspokereset" })),
    });

    const tx = await vote({ chainId: 8453, tokenId: 7n, allocations: [{ pool: POOL, weight: 100n }] });
    await resetVote(7n, 8453);

    expect(tx.hash).toBe("0xspokevote");
    expect(voter.gauges).toHaveBeenCalledWith(POOL);
    expect(voter.lastVoted).toHaveBeenCalledWith(7n);
    expect(vault.vote).toHaveBeenCalledWith(7n, [POOL], [100n]);
    expect(vault.reset).toHaveBeenCalledWith(7n);
    expect(voter.vote).not.toHaveBeenCalled();
  });

  it("keeps BNB votes on the BNB Voter", async () => {
    const voter = wire(contractAddress(56, "Voter"), voterFake());
    const tx = await vote({ chainId: 56, tokenId: 42n, allocations: [{ pool: POOL, weight: 1n }] });
    expect(tx.hash).toBe("0xhubvote");
    expect(voter.vote).toHaveBeenCalledWith(42n, [POOL], [1n]);
  });

  it("rejects a vote whose gauge is missing before anything is sent", async () => {
    const voter = wire(contractAddress(1, "Voter"), { ...voterFake(), gauges: vi.fn(async () => ZeroAddress) });
    const vault = wire(contractAddress(1, "XTopazVotingVault"), { vote: vi.fn() });
    await expect(vote({ chainId: 1, tokenId: 1n, allocations: [{ pool: POOL, weight: 1n }] })).rejects.toThrow(/no gauge/);
    expect(voter.gauges).toHaveBeenCalled();
    expect(vault.vote).not.toHaveBeenCalled();
  });
});

describe("fee claims use each chain's argument order", () => {
  it("spoke: vault.claimFees(positionId, contracts, tokens)", async () => {
    wire(contractAddress(4663, "Voter"), voterFake());
    const vault = wire(contractAddress(4663, "XTopazVotingVault"), {
      claimFees: vi.fn(async () => ({ hash: "0xspokefees" })),
    });
    const tx = await claimFees({ chainId: 4663, tokenId: 3n, pools: [POOL] });
    expect(tx?.hash).toBe("0xspokefees");
    expect(vault.claimFees).toHaveBeenCalledWith(3n, [FEES], [[TOKEN0, TOKEN1]]);
  });

  it("BNB: Voter.claimFees(contracts, tokens, veNFT id)", async () => {
    const voter = wire(contractAddress(56, "Voter"), voterFake());
    await claimFees({ chainId: 56, tokenId: 9n, pools: [POOL] });
    expect(voter.claimFees).toHaveBeenCalledWith([FEES], [[TOKEN0, TOKEN1]], 9n);
  });

  it("refuses a rebase claim on a spoke", async () => {
    await expect(claimRebase(3n, 5042)).rejects.toThrow(/only on BNB Chain/);
  });
});

describe("spoke guards fire before any approval", () => {
  const vaultState = {
    paused: vi.fn(async () => false),
    minimumStake: vi.fn(async () => 10n ** 18n),
    lockUntil: vi.fn(async () => 0n),
    lockEpochs: vi.fn(async () => 1n),
  };

  it("refuses to add to a position the signer neither owns nor operates", async () => {
    const { addToSpokePosition } = await import("./spokePosition.js");
    wire(contractAddress(8453, "XTopazVotingVault"), { ...vaultState, isApprovedOrOwner: vi.fn(async () => false) });
    await expect(addToSpokePosition({ chainId: 8453, id: 5n, amount: 10n ** 18n })).rejects.toThrow(/neither the owner nor the vote operator/);
  });

  it("refuses to open below the vault minimum", async () => {
    const { stakeSpoke } = await import("./spokePosition.js");
    wire(contractAddress(8453, "XTopazVotingVault"), { ...vaultState });
    await expect(stakeSpoke({ chainId: 8453, amount: 1n })).rejects.toThrow(/minimumStake/);
  });
});

describe("getVote", () => {
  it("stops at the out-of-bounds revert but surfaces RPC failures", async () => {
    const { getVote } = await import("../read/votes.js");
    const { makeError } = await vi.importActual<typeof import("ethers")>("ethers");
    const revert = makeError("execution reverted", "CALL_EXCEPTION", { action: "call", data: "0x", reason: null, transaction: { to: null, data: "0x" }, invocation: null, revert: null });
    const base = { usedWeights: vi.fn(async () => 1n), lastVoted: vi.fn(async () => 0n), votes: vi.fn(async () => 1n) };
    wire(contractAddress(8453, "Voter"), {
      ...base,
      poolVote: vi.fn(async (_id: bigint, i: bigint) => { if (i === 0n) return POOL; throw revert; }),
    });
    expect((await getVote(2n, 8453)).allocations).toEqual([{ pool: POOL, weight: 1n }]);

    wire(contractAddress(8453, "Voter"), { ...base, poolVote: vi.fn(async () => { throw new Error("over rate limit"); }) });
    await expect(getVote(2n, 8453)).rejects.toThrow(/rate limit/);
  });
});
