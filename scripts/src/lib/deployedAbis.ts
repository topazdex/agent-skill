// ABI variants are bound to deployments, never selected by name alone.
import type { InterfaceAbi } from "ethers";
import relayManagerAbi from "../../../references/abis/deployed/RelayManager.json" with { type: "json" };
import clZapAbi from "../../../references/abis/deployed/CLZap.json" with { type: "json" };
import abi0 from "../../../references/abis/deployed/EpochCoordinator-4a04dcf0.json" with { type: "json" };
import abi1 from "../../../references/abis/deployed/FactoryRegistry-75e428f0.json" with { type: "json" };
import abi2 from "../../../references/abis/deployed/HubUnwrapComposer-846fb636.json" with { type: "json" };
import abi3 from "../../../references/abis/deployed/Minter-fad3f7b1.json" with { type: "json" };
import abi4 from "../../../references/abis/deployed/PoolFactory-4096928a.json" with { type: "json" };
import abi5 from "../../../references/abis/deployed/RewardsDistributor-8b4babba.json" with { type: "json" };
import abi6 from "../../../references/abis/deployed/Router-ddffb82c.json" with { type: "json" };
import abi7 from "../../../references/abis/deployed/SystemDummyTokenA-c97256c3.json" with { type: "json" };
import abi8 from "../../../references/abis/deployed/SystemDummyTokenB-c97256c3.json" with { type: "json" };
import abi9 from "../../../references/abis/deployed/SystemGauge-aa63119a.json" with { type: "json" };
import abi10 from "../../../references/abis/deployed/SystemGaugeFactory-342447d9.json" with { type: "json" };
import abi11 from "../../../references/abis/deployed/SystemGaugeStrategy-1f8c2746.json" with { type: "json" };
import abi12 from "../../../references/abis/deployed/SystemPool-7a8ace0b.json" with { type: "json" };
import abi13 from "../../../references/abis/deployed/SystemPoolBootstrap-ca627496.json" with { type: "json" };
import abi14 from "../../../references/abis/deployed/SystemPoolFactory-4096928a.json" with { type: "json" };
import abi15 from "../../../references/abis/deployed/Topaz-d014ee15.json" with { type: "json" };
import abi16 from "../../../references/abis/deployed/VeTopazVault-5477083e.json" with { type: "json" };
import abi17 from "../../../references/abis/deployed/Voter-19456e5a.json" with { type: "json" };
import abi18 from "../../../references/abis/deployed/VotingEscrow-5eec94af.json" with { type: "json" };
import abi19 from "../../../references/abis/deployed/VotingRewardsFactory-2f196ac8.json" with { type: "json" };
import abi20 from "../../../references/abis/deployed/WrapRouter-e9c3f95b.json" with { type: "json" };
import abi21 from "../../../references/abis/deployed/XTopaz-143546bc.json" with { type: "json" };
import abi22 from "../../../references/abis/deployed/XTopazOFTAdapter-acf95c08.json" with { type: "json" };
import abi23 from "../../../references/abis/deployed/XTopazZap-ccda6067.json" with { type: "json" };
import abi24 from "../../../references/abis/deployed/CLFactory-d0ad6e33.json" with { type: "json" };
import abi25 from "../../../references/abis/deployed/CLGauge-58301f73.json" with { type: "json" };
import abi26 from "../../../references/abis/deployed/CLGaugeFactory-7c1194af.json" with { type: "json" };
import abi27 from "../../../references/abis/deployed/CLPool-eef316ee.json" with { type: "json" };
import abi28 from "../../../references/abis/deployed/CustomSwapFeeModule-4d7df8e0.json" with { type: "json" };
import abi29 from "../../../references/abis/deployed/CustomUnstakedFeeModule-4d7df8e0.json" with { type: "json" };
import abi30 from "../../../references/abis/deployed/DynamicSwapFeeModule-2ee04b19.json" with { type: "json" };
import abi31 from "../../../references/abis/deployed/MixedRouteQuoterV1-df3f80c3.json" with { type: "json" };
import abi32 from "../../../references/abis/deployed/NFTDescriptor-2c62783e.json" with { type: "json" };
import abi33 from "../../../references/abis/deployed/NFTSVG-02770c5a.json" with { type: "json" };
import abi34 from "../../../references/abis/deployed/NonfungiblePositionManager-4f7e8ab1.json" with { type: "json" };
import abi35 from "../../../references/abis/deployed/NonfungibleTokenPositionDescriptor-e5d817ef.json" with { type: "json" };
import abi36 from "../../../references/abis/deployed/PositionBurnHelper-ab59405c.json" with { type: "json" };
import abi37 from "../../../references/abis/deployed/QuoterV2-1e478f28.json" with { type: "json" };
import abi38 from "../../../references/abis/deployed/SwapRouter-6723eb22.json" with { type: "json" };
import abi39 from "../../../references/abis/deployed/TopazSlipstreamStateMulticall-528c9eb2.json" with { type: "json" };
import abi40 from "../../../references/abis/deployed/UniversalRouter.json" with { type: "json" };
import abi41 from "../../../references/abis/Multicall3.json" with { type: "json" };
import abi42 from "../../../references/abis/deployed/SpokeBudgetComposer-b6773a3c.json" with { type: "json" };
import abi43 from "../../../references/abis/deployed/SpokeStakeComposer-54ed51ad.json" with { type: "json" };
import abi44 from "../../../references/abis/deployed/XTopazOFT-7f2afbed.json" with { type: "json" };
import abi45 from "../../../references/abis/deployed/GaugeFactory-7a2a5e1a.json" with { type: "json" };
import abi46 from "../../../references/abis/deployed/ManagedRewardsFactory-8dace021.json" with { type: "json" };
import abi47 from "../../../references/abis/deployed/Pool-7a8ace0b.json" with { type: "json" };
import abi48 from "../../../references/abis/deployed/ProtocolForwarder-5b9de979.json" with { type: "json" };
import abi49 from "../../../references/abis/deployed/SpokeEmissionReceiver-37f32161.json" with { type: "json" };
import abi50 from "../../../references/abis/deployed/XTopazVotingVault-67434da3.json" with { type: "json" };
import abi51 from "../../../references/abis/deployed/CLInterfaceMulticall-e21ccbab.json" with { type: "json" };
import abi52 from "../../../references/abis/deployed/PositionBurnHelper-a77f546d.json" with { type: "json" };
import abi53 from "../../../references/abis/deployed/SugarHelper-7d78a37a.json" with { type: "json" };

export const DEPLOYED_ABIS: Record<string, InterfaceAbi> = {
  "abis/deployed/RelayManager.json": relayManagerAbi,
  "abis/deployed/CLZap.json": clZapAbi,
  "abis/deployed/EpochCoordinator-4a04dcf0.json": abi0,
  "abis/deployed/FactoryRegistry-75e428f0.json": abi1,
  "abis/deployed/HubUnwrapComposer-846fb636.json": abi2,
  "abis/deployed/Minter-fad3f7b1.json": abi3,
  "abis/deployed/PoolFactory-4096928a.json": abi4,
  "abis/deployed/RewardsDistributor-8b4babba.json": abi5,
  "abis/deployed/Router-ddffb82c.json": abi6,
  "abis/deployed/SystemDummyTokenA-c97256c3.json": abi7,
  "abis/deployed/SystemDummyTokenB-c97256c3.json": abi8,
  "abis/deployed/SystemGauge-aa63119a.json": abi9,
  "abis/deployed/SystemGaugeFactory-342447d9.json": abi10,
  "abis/deployed/SystemGaugeStrategy-1f8c2746.json": abi11,
  "abis/deployed/SystemPool-7a8ace0b.json": abi12,
  "abis/deployed/SystemPoolBootstrap-ca627496.json": abi13,
  "abis/deployed/SystemPoolFactory-4096928a.json": abi14,
  "abis/deployed/Topaz-d014ee15.json": abi15,
  "abis/deployed/VeTopazVault-5477083e.json": abi16,
  "abis/deployed/Voter-19456e5a.json": abi17,
  "abis/deployed/VotingEscrow-5eec94af.json": abi18,
  "abis/deployed/VotingRewardsFactory-2f196ac8.json": abi19,
  "abis/deployed/WrapRouter-e9c3f95b.json": abi20,
  "abis/deployed/XTopaz-143546bc.json": abi21,
  "abis/deployed/XTopazOFTAdapter-acf95c08.json": abi22,
  "abis/deployed/XTopazZap-ccda6067.json": abi23,
  "abis/deployed/CLFactory-d0ad6e33.json": abi24,
  "abis/deployed/CLGauge-58301f73.json": abi25,
  "abis/deployed/CLGaugeFactory-7c1194af.json": abi26,
  "abis/deployed/CLPool-eef316ee.json": abi27,
  "abis/deployed/CustomSwapFeeModule-4d7df8e0.json": abi28,
  "abis/deployed/CustomUnstakedFeeModule-4d7df8e0.json": abi29,
  "abis/deployed/DynamicSwapFeeModule-2ee04b19.json": abi30,
  "abis/deployed/MixedRouteQuoterV1-df3f80c3.json": abi31,
  "abis/deployed/NFTDescriptor-2c62783e.json": abi32,
  "abis/deployed/NFTSVG-02770c5a.json": abi33,
  "abis/deployed/NonfungiblePositionManager-4f7e8ab1.json": abi34,
  "abis/deployed/NonfungibleTokenPositionDescriptor-e5d817ef.json": abi35,
  "abis/deployed/PositionBurnHelper-ab59405c.json": abi36,
  "abis/deployed/QuoterV2-1e478f28.json": abi37,
  "abis/deployed/SwapRouter-6723eb22.json": abi38,
  "abis/deployed/TopazSlipstreamStateMulticall-528c9eb2.json": abi39,
  "abis/deployed/UniversalRouter.json": abi40,
  "abis/Multicall3.json": abi41.abi,
  "abis/deployed/SpokeBudgetComposer-b6773a3c.json": abi42,
  "abis/deployed/SpokeStakeComposer-54ed51ad.json": abi43,
  "abis/deployed/XTopazOFT-7f2afbed.json": abi44,
  "abis/deployed/GaugeFactory-7a2a5e1a.json": abi45,
  "abis/deployed/ManagedRewardsFactory-8dace021.json": abi46,
  "abis/deployed/Pool-7a8ace0b.json": abi47,
  "abis/deployed/ProtocolForwarder-5b9de979.json": abi48,
  "abis/deployed/SpokeEmissionReceiver-37f32161.json": abi49,
  "abis/deployed/XTopazVotingVault-67434da3.json": abi50,
  "abis/deployed/CLInterfaceMulticall-e21ccbab.json": abi51,
  "abis/deployed/PositionBurnHelper-a77f546d.json": abi52,
  "abis/deployed/SugarHelper-7d78a37a.json": abi53,
};
