import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { getAddress } from "ethers";

vi.mock("./client.js", () => ({
  provider: vi.fn(() => {
    throw new Error("pending relays must not touch the RPC");
  }),
}));

const {
  RELAYS,
  SPOKE_RELAYS,
  SPOKE_RELAY_MANIFEST,
  resolveSpokeRelay,
  spokeRelayUnavailable,
} = await import("../config/relays.js");
const { DEPLOYED_ABIS } = await import("./deployedAbis.js");
const { getSpokeRelays } = await import("../read/relays.js");
const { applySpokeRelayDeployment } = await import("./spokeRelayManifest.js");

const addr = (byte: string) => getAddress("0x" + byte.repeat(20));
const robinhood = () => structuredClone(SPOKE_RELAY_MANIFEST.chains.find((c) => c.network === "robinhood")!);

// Fixture broadcast shaped like Deploy.s.sol's output; addresses are placeholders.
function broadcast(overrides: Record<string, unknown> = {}) {
  const chain = robinhood();
  const contracts = Object.fromEntries(Object.keys(chain.contracts).map((name, i) => [name, addr((0x10 + i).toString(16))]));
  return {
    chainId: 4663,
    network: "robinhood",
    deployBlock: 123,
    contracts,
    protocol: { ...chain.protocol, stable: chain.protocol.stable.address },
    relays: {
      maxi: { name: "Topaz Maxi", kind: "AUTO_COMPOUNDER", address: addr("c1"), factory: contracts.AutoCompounderFactory, mTokenId: 1, token: chain.protocol.xTopaz, lockedManagedReward: addr("c2"), freeManagedReward: addr("c3") },
      converter: { name: "Topaz Compound + USDG", kind: "COMPOUND_CONVERTER", address: addr("c4"), factory: contracts.CompoundConverterFactory, mTokenId: 2, token: chain.protocol.stable.address, lockedManagedReward: addr("c5"), freeManagedReward: addr("c6") },
    },
    ...overrides,
  };
}

describe("spoke relay registry", () => {
  it("lists both products on every spoke and keeps the BNB relays as they were", () => {
    expect(SPOKE_RELAYS.map((r) => `${r.chainId}:${r.type}`)).toEqual([
      "4663:maxi", "4663:converter", "5042:maxi", "5042:converter",
      "8453:maxi", "8453:converter", "1:maxi", "1:converter",
    ]);
    expect(RELAYS.map((r) => [r.type, r.mTokenId])).toEqual([["maxi", 3083], ["reward-distribute", 3087]]);
    expect(SPOKE_RELAYS.find((r) => r.chainId === 4663 && r.type === "converter")?.payoutSymbol).toBe("USDG");
    expect(SPOKE_RELAYS.find((r) => r.chainId === 5042 && r.type === "converter")?.payoutDecimals).toBe(6);
  });

  it("reports every relay as not yet deployed, with the staged reason on Base and Ethereum", () => {
    for (const relay of SPOKE_RELAYS) {
      expect(relay.address).toBeNull();
      expect(spokeRelayUnavailable(relay)).toMatch(/is not yet deployed/);
    }
    const base = SPOKE_RELAYS.find((r) => r.chainId === 8453)!;
    expect(spokeRelayUnavailable(base)).toMatch(/staged: .*xTOPAZ/);
  });

  it("offers a native zap on Robinhood only through WETH and never on Arc", () => {
    const rh = SPOKE_RELAYS.find((r) => r.chainId === 4663)!;
    const native = rh.zapRoutes.find((r) => r.tokenIn === "native")!;
    expect(native.tickSpacings).toEqual([2000]);
    expect(getAddress(native.tokens[0])).toBe(getAddress("0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73"));
    const arc = SPOKE_RELAYS.find((r) => r.chainId === 5042)!;
    expect(arc.zapRoutes.some((r) => r.tokenIn === "native")).toBe(false);
    expect(arc.zapRoutes.map((r) => r.symbol)).toEqual(["USDC"]);
  });

  it("resolves aliases per chain and keeps BNB-only names out", () => {
    expect(resolveSpokeRelay("maxi", 5042)?.displayName).toBe("Topaz Maxi");
    expect(resolveSpokeRelay("compound-stable", 4663)?.displayName).toBe("Topaz Compound + USDG");
    expect(resolveSpokeRelay("Topaz Compound + USDC", 5042)?.type).toBe("converter");
    expect(resolveSpokeRelay("reward-distribute", 4663)).toBeUndefined();
    expect(resolveSpokeRelay("maxi", 56)).toBeUndefined();
  });

  it("returns pending state without any RPC call", async () => {
    const states = await getSpokeRelays(4663);
    expect(states.map((s) => s.deployed)).toEqual([false, false]);
    expect(states[0].managedBalance).toBeNull();
  });

  it("pins every spoke relay ABI digest and bundles the file", () => {
    for (const entry of Object.values(SPOKE_RELAY_MANIFEST.abis)) {
      const abi = JSON.parse(readFileSync(new URL(`../../../references/${entry.abi}`, import.meta.url), "utf8"));
      expect(createHash("sha256").update(JSON.stringify(abi)).digest("hex")).toBe(entry.abiSha256);
      expect(DEPLOYED_ABIS[entry.abi]).toBeDefined();
    }
  });
});

describe("applySpokeRelayDeployment", () => {
  it("fills addresses, ids and the deploy block from a broadcast manifest", () => {
    const next = applySpokeRelayDeployment(robinhood(), broadcast());
    expect(next.status).toBe("deployed");
    expect(next.deployBlock).toBe(123);
    expect(next.relays.maxi).toMatchObject({ address: addr("c1"), mTokenId: 1, freeManagedReward: addr("c3") });
    expect(next.relays.converter.mTokenId).toBe(2);
    expect(next.contracts.ManagedEscrow).toMatch(/^0x/);
    expect(next.zapRoutes).toEqual(robinhood().zapRoutes);
  });

  it("accepts the older string-array relays serialization", () => {
    const b = broadcast();
    const next = applySpokeRelayDeployment(robinhood(), { ...b, relays: JSON.stringify(Object.values(b.relays)) });
    expect(next.relays.converter.address).toBe(addr("c4"));
  });

  it("rejects a manifest for another chain, a wrong payout token or a missing contract", () => {
    expect(() => applySpokeRelayDeployment(robinhood(), broadcast({ chainId: 5042 }))).toThrow(/expected robinhood/);
    const b = broadcast();
    b.relays.converter.token = addr("dd");
    expect(() => applySpokeRelayDeployment(robinhood(), b)).toThrow(/relays.converter.token/);
    const c = broadcast();
    delete (c.contracts as Record<string, string>).RelayEntryZap;
    expect(() => applySpokeRelayDeployment(robinhood(), c)).toThrow(/contracts.RelayEntryZap/);
  });
});
