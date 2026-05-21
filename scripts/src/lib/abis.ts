// Load minimal ABI JSON files shipped with this skill (../../references/abis/*.json).
// Each ABI is exposed both as the named export and via the `ABIS` map.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ABI_DIR = join(__dirname, "..", "..", "..", "references", "abis");

function loadAbi(name: string): any[] {
  const raw = readFileSync(join(ABI_DIR, `${name}.json`), "utf-8");
  const parsed = JSON.parse(raw);
  return parsed.abi ?? parsed;
}

export const ABIS = {
  ERC20: loadAbi("ERC20"),
  Router: loadAbi("Router"),
  Pool: loadAbi("Pool"),
  PoolFactory: loadAbi("PoolFactory"),
  VotingEscrow: loadAbi("VotingEscrow"),
  Voter: loadAbi("Voter"),
  Minter: loadAbi("Minter"),
  RewardsDistributor: loadAbi("RewardsDistributor"),
  Gauge: loadAbi("Gauge"),
  Reward: loadAbi("Reward"),
  BribeVotingReward: loadAbi("BribeVotingReward"),
  FeesVotingReward: loadAbi("FeesVotingReward"),
  CLFactory: loadAbi("CLFactory"),
  CLPool: loadAbi("CLPool"),
  CLGauge: loadAbi("CLGauge"),
  CLGaugeFactory: loadAbi("CLGaugeFactory"),
  NonfungiblePositionManager: loadAbi("NonfungiblePositionManager"),
  SwapRouter: loadAbi("SwapRouter"),
  QuoterV2: loadAbi("QuoterV2"),
  MixedRouteQuoterV1: loadAbi("MixedRouteQuoterV1"),
  Multicall3: loadAbi("Multicall3"),
} as const;

export type AbiName = keyof typeof ABIS;
