// Folds an xtopaz-relay broadcast manifest (deployments/<network>.json, written by
// script/Deploy.s.sol) into references/spoke-relays.json. Dry-run manifests are never
// read: their addresses are simulated. Every address is cross-checked against the
// static protocol fields before anything is written.

import { ZeroAddress, getAddress } from "ethers";
import type { SpokeRelayChainManifest, SpokeRelayType } from "../config/relays.js";

interface BroadcastRelay {
  name: string;
  kind: string;
  address: string;
  factory: string;
  mTokenId: number;
  token: string;
  lockedManagedReward: string;
  freeManagedReward: string;
}

const KIND: Record<SpokeRelayType, { kind: string; factory: string }> = {
  maxi: { kind: "AUTO_COMPOUNDER", factory: "AutoCompounderFactory" },
  converter: { kind: "COMPOUND_CONVERTER", factory: "CompoundConverterFactory" },
};

const same = (a: string | null | undefined, b: string | null | undefined) =>
  (a ?? ZeroAddress).toLowerCase() === (b ?? ZeroAddress).toLowerCase();

function address(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(value) || same(value, ZeroAddress)) {
    throw new Error(`${label} is missing or not an address`);
  }
  return getAddress(value);
}

/** Older Deploy.s.sol runs serialized `relays` as a JSON string array; current ones as {maxi, converter}. */
function relaysByType(raw: unknown, network: string): Record<SpokeRelayType, BroadcastRelay> {
  const parsed: unknown = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (Array.isArray(parsed)) {
    const byKind = (kind: string) => parsed.find((r: BroadcastRelay) => r.kind === kind) as BroadcastRelay | undefined;
    const maxi = byKind(KIND.maxi.kind);
    const converter = byKind(KIND.converter.kind);
    if (!maxi || !converter) throw new Error(`${network}: relays must contain one AUTO_COMPOUNDER and one COMPOUND_CONVERTER`);
    return { maxi, converter };
  }
  if (!parsed || typeof parsed !== "object") throw new Error(`${network}: relays is missing`);
  const { maxi, converter } = parsed as Record<string, BroadcastRelay>;
  if (!maxi || !converter) throw new Error(`${network}: relays must have maxi and converter entries`);
  return { maxi, converter };
}

export function applySpokeRelayDeployment(chain: SpokeRelayChainManifest, raw: unknown): SpokeRelayChainManifest {
  const d = raw as {
    chainId?: number;
    network?: string;
    deployBlock?: number;
    contracts?: Record<string, string>;
    protocol?: Record<string, string>;
    relays?: unknown;
  };
  const net = chain.network;
  if (d.chainId !== chain.chainId || d.network !== net) {
    throw new Error(`${net}: manifest is for ${d.network} (${d.chainId}), expected ${net} (${chain.chainId})`);
  }
  const p = d.protocol ?? {};
  for (const key of ["vault", "voter", "xTopaz"] as const) {
    if (!same(p[key], chain.protocol[key])) throw new Error(`${net}: protocol.${key} ${p[key]} != ${chain.protocol[key]}`);
  }
  if (!same(p.stable, chain.protocol.stable.address)) throw new Error(`${net}: protocol.stable ${p.stable} != ${chain.protocol.stable.address}`);
  if (!same(p.weth, chain.protocol.weth)) throw new Error(`${net}: protocol.weth ${p.weth} != ${chain.protocol.weth ?? "none"}`);

  const contracts = Object.fromEntries(
    Object.keys(chain.contracts).map((name) => [name, address(d.contracts?.[name], `${net}: contracts.${name}`)]),
  );
  const broadcast = relaysByType(d.relays, net);
  const relays = {} as SpokeRelayChainManifest["relays"];
  for (const type of ["maxi", "converter"] as const) {
    const r = broadcast[type];
    const label = `${net}: relays.${type}`;
    const expectedToken = type === "maxi" ? chain.protocol.xTopaz : chain.protocol.stable.address;
    if (r.kind !== KIND[type].kind) throw new Error(`${label}.kind ${r.kind} != ${KIND[type].kind}`);
    if (!same(r.token, expectedToken)) throw new Error(`${label}.token ${r.token} != ${expectedToken}`);
    if (!same(r.factory, contracts[KIND[type].factory])) throw new Error(`${label}.factory is not ${KIND[type].factory}`);
    if (!Number.isInteger(r.mTokenId) || r.mTokenId <= 0) throw new Error(`${label}.mTokenId must be a positive integer`);
    relays[type] = {
      name: r.name,
      kind: r.kind,
      address: address(r.address, `${label}.address`),
      factory: address(r.factory, `${label}.factory`),
      mTokenId: r.mTokenId,
      token: getAddress(r.token),
      lockedManagedReward: address(r.lockedManagedReward, `${label}.lockedManagedReward`),
      freeManagedReward: address(r.freeManagedReward, `${label}.freeManagedReward`),
    };
  }
  if (!Number.isInteger(d.deployBlock)) throw new Error(`${net}: deployBlock is missing`);
  return { ...chain, status: "deployed", deployBlock: d.deployBlock as number, contracts, relays };
}
