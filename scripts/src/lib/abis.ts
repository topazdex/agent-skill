// Static JSON imports of the canonical ABI files under ../../references/abis/.
// Using `with { type: "json" }` (import attributes, TS 5.3+) so bundlers
// (vite, esbuild, webpack, rollup) can statically resolve which JSON files
// to include. Previously this module used `fs.readFileSync` which is
// Node-only and breaks browser/edge consumers of the skill.
//
// Every ABI file in this directory has the shape `{ "abi": [...] }`; the
// `extract` helper unwraps that consistently and returns a typed array.

import BribeVotingRewardJson from "../../../references/abis/BribeVotingReward.json" with { type: "json" };
import CLFactoryJson from "../../../references/abis/CLFactory.json" with { type: "json" };
import CLGaugeJson from "../../../references/abis/CLGauge.json" with { type: "json" };
import CLGaugeFactoryJson from "../../../references/abis/CLGaugeFactory.json" with { type: "json" };
import CLPoolJson from "../../../references/abis/CLPool.json" with { type: "json" };
import ERC20Json from "../../../references/abis/ERC20.json" with { type: "json" };
import FeesVotingRewardJson from "../../../references/abis/FeesVotingReward.json" with { type: "json" };
import GaugeJson from "../../../references/abis/Gauge.json" with { type: "json" };
import MinterJson from "../../../references/abis/Minter.json" with { type: "json" };
import MixedRouteQuoterV1Json from "../../../references/abis/MixedRouteQuoterV1.json" with { type: "json" };
import Multicall3Json from "../../../references/abis/Multicall3.json" with { type: "json" };
import NonfungiblePositionManagerJson from "../../../references/abis/NonfungiblePositionManager.json" with { type: "json" };
import PoolJson from "../../../references/abis/Pool.json" with { type: "json" };
import PoolFactoryJson from "../../../references/abis/PoolFactory.json" with { type: "json" };
import QuoterV2Json from "../../../references/abis/QuoterV2.json" with { type: "json" };
import RelayJson from "../../../references/abis/Relay.json" with { type: "json" };
import RewardJson from "../../../references/abis/Reward.json" with { type: "json" };
import RewardsDistributorJson from "../../../references/abis/RewardsDistributor.json" with { type: "json" };
import RouterJson from "../../../references/abis/Router.json" with { type: "json" };
import SwapRouterJson from "../../../references/abis/SwapRouter.json" with { type: "json" };
import VoterJson from "../../../references/abis/Voter.json" with { type: "json" };
import VotingEscrowJson from "../../../references/abis/VotingEscrow.json" with { type: "json" };

import type { JsonFragment } from "ethers";

interface AbiJsonWrapper {
  abi?: JsonFragment[];
}

const extract = (json: unknown): JsonFragment[] => {
  const wrapper = json as AbiJsonWrapper;
  if (Array.isArray(wrapper.abi)) return wrapper.abi;
  if (Array.isArray(json)) return json as JsonFragment[];
  throw new Error("ABI JSON did not contain an `abi` array or a top-level array");
};

export const ABIS = {
  ERC20: extract(ERC20Json),
  Router: extract(RouterJson),
  Pool: extract(PoolJson),
  PoolFactory: extract(PoolFactoryJson),
  VotingEscrow: extract(VotingEscrowJson),
  Voter: extract(VoterJson),
  Minter: extract(MinterJson),
  RewardsDistributor: extract(RewardsDistributorJson),
  Gauge: extract(GaugeJson),
  Reward: extract(RewardJson),
  BribeVotingReward: extract(BribeVotingRewardJson),
  FeesVotingReward: extract(FeesVotingRewardJson),
  CLFactory: extract(CLFactoryJson),
  CLPool: extract(CLPoolJson),
  CLGauge: extract(CLGaugeJson),
  CLGaugeFactory: extract(CLGaugeFactoryJson),
  NonfungiblePositionManager: extract(NonfungiblePositionManagerJson),
  SwapRouter: extract(SwapRouterJson),
  QuoterV2: extract(QuoterV2Json),
  MixedRouteQuoterV1: extract(MixedRouteQuoterV1Json),
  Multicall3: extract(Multicall3Json),
  Relay: extract(RelayJson),
} as const;

export type AbiName = keyof typeof ABIS;
