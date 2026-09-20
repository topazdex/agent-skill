# Five-chain deployment catalog

Reviewed 2026-09-20 UTC. [deployments.json](deployments.json) is the machine-readable catalog: every contract is keyed by EVM chain ID and role, with deployed ABI variant, deployment transaction/block and ABI digest where recorded. Entries without a bundled ABI are address references, not callable through the ABI helper. ABI paths are relative to this reference directory. The deployed ABIs are plain arrays; older ABI files may wrap the array in `abi`.

Use [multichain.md](multichain.md) for architecture, [bridging.md](bridging.md) for sends, and [multichain-integration.md](../developers/multichain-integration.md) for executable examples. The older [BNB address book](addresses.md) retains relay and token detail. Matching addresses on different chains do not imply matching roles.

This snapshot is not an availability oracle. Compare the [public address book](https://www.topazdex.com/docs/contracts) and [indexed registry](https://api.topazdex.com/v1/deployments), then verify RPC chain identity, code and wiring. The API registry intentionally omits some execution periphery. Use `yarn verify:deployments` to repeat read-only checks; no signer is used.

## BNB Chain

EVM ID **56**; LayerZero EID **30102**; hub. Gas: BNB, 18 native decimals. RPC: https://bsc-rpc.publicnode.com. Explorer: https://bscscan.com.

Wrapped native: `0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c`.

| Contract | Address | ABI |
|---|---|---|
| RelayManager | `0x243846421d3c9bf34a3db4982344a23cf171397c` | [JSON](abis/deployed/RelayManager.json) |
| CLZap | `0x475FEe1722e7F56A9d341492A67DB830d3A3A7DE` | [Interface ABI](abis/deployed/CLZap.json) |
| EpochCoordinator | `0x7A8F5eEDC0136a76Dbffa209f00622074e29C01B` | [JSON](abis/deployed/EpochCoordinator-4a04dcf0.json) |
| FactoryRegistry | `0x268d1C8a538Ecf6628838C11d581e1EABD13D6A4` | [JSON](abis/deployed/FactoryRegistry-75e428f0.json) |
| HubUnwrapComposer | `0x64540da4816abf969E7C5c520924dd3d6A5ACb58` | [JSON](abis/deployed/HubUnwrapComposer-846fb636.json) |
| Minter | `0x606794d37991A426a189fD9FA8664D339A77f8ae` | [JSON](abis/deployed/Minter-fad3f7b1.json) |
| PoolFactory | `0x65E6cD0eF5D3467030103cf3d433034E570b5784` | [JSON](abis/deployed/PoolFactory-4096928a.json) |
| RewardsDistributor | `0x85e15e7Ad4f20d5ca3A1104B1c2CcE72f5F683dB` | [JSON](abis/deployed/RewardsDistributor-8b4babba.json) |
| Router | `0x1E98c8226e7d452e1888e3d3d2F929346321c6c3` | [JSON](abis/deployed/Router-ddffb82c.json) |
| SystemDummyTokenA | `0xAaFa47d89342EcA6cC3E56273278a5BbBC90c195` | [JSON](abis/deployed/SystemDummyTokenA-c97256c3.json) |
| SystemDummyTokenB | `0x41BF6c044B2B39F68A4d4D54Ec3e2ec46C93114b` | [JSON](abis/deployed/SystemDummyTokenB-c97256c3.json) |
| SystemGauge | `0xB12A5E332131091a226a23652418b54F80b2cda9` | [JSON](abis/deployed/SystemGauge-aa63119a.json) |
| SystemGaugeFactory | `0x36E9c2d819CBEFc316C400e74185273308D3273c` | [JSON](abis/deployed/SystemGaugeFactory-342447d9.json) |
| SystemGaugeStrategy | `0x32431D0E4E17868b19850Df9d13c15f8aC090C8f` | [JSON](abis/deployed/SystemGaugeStrategy-1f8c2746.json) |
| SystemPool | `0x8b29025838dCBe9098DE563C063233a51B3Dd5A1` | [JSON](abis/deployed/SystemPool-7a8ace0b.json) |
| SystemPoolBootstrap | `0x84C8c77a894C4992c1F345Bdec7F89Ca7447622F` | [JSON](abis/deployed/SystemPoolBootstrap-ca627496.json) |
| SystemPoolFactory | `0x0A0483F8623BFEE18B7f31FE1Ea027367b5Cb15e` | [JSON](abis/deployed/SystemPoolFactory-4096928a.json) |
| Topaz | `0xdf002282C1474C9592780618Adda7EaA99998Abd` | [JSON](abis/deployed/Topaz-d014ee15.json) |
| VeTopazVault | `0x875Acc3f094f10F9a7A8c32C79D509c13A3DE5B8` | [JSON](abis/deployed/VeTopazVault-5477083e.json) |
| Voter | `0x2F80F810a114223AC69E34E84E735CaD515dAD67` | [JSON](abis/deployed/Voter-19456e5a.json) |
| VotingEscrow | `0xe951aC65EFE86682311ab0d8995E7A58750c5eB3` | [JSON](abis/deployed/VotingEscrow-5eec94af.json) |
| VotingRewardsFactory | `0x4C303f7af7b8b05226440e4e12FF9a82F513716c` | [JSON](abis/deployed/VotingRewardsFactory-2f196ac8.json) |
| WrapRouter | `0xB12D10065bcD591D9C9FF2f12B3CBF1d9741D885` | [JSON](abis/deployed/WrapRouter-e9c3f95b.json) |
| XTopaz | `0xf7aDFfE50D6369eF19dF3aF8d4dDbC15Ace175FD` | [JSON](abis/deployed/XTopaz-143546bc.json) |
| XTopazOFTAdapter | `0x7947b32E4B30413c83ee3602996eDF97F6093748` | [JSON](abis/deployed/XTopazOFTAdapter-acf95c08.json) |
| XTopazZap | `0xdA75765e4Eb2D0ebABA24bBb4a4359c88C8C229B` | [JSON](abis/deployed/XTopazZap-ccda6067.json) |
| CLFactory | `0x73DC984D9490286E735548f61dfCCec67Af82ed9` | [JSON](abis/deployed/CLFactory-d0ad6e33.json) |
| CLGauge | `0xc2f777a2e9f54f195212a5a2d394399252958b97` | [JSON](abis/deployed/CLGauge-58301f73.json) |
| CLGaugeFactory | `0xeD2ED418f104E18B1D11eA5C26236A1caa675839` | [JSON](abis/deployed/CLGaugeFactory-7c1194af.json) |
| CLPool | `0x18e68051d1b1fB44cb539cA4436F112D28577AF7` | [JSON](abis/deployed/CLPool-eef316ee.json) |
| CustomSwapFeeModule | `0xA0462a52af4f8cbF7766Efbba75355B30b6BCCe2` | [JSON](abis/deployed/CustomSwapFeeModule-4d7df8e0.json) |
| CustomUnstakedFeeModule | `0x3bad7F96cd1b51CE86e12C42541Ac7d559A78582` | [JSON](abis/deployed/CustomUnstakedFeeModule-4d7df8e0.json) |
| DynamicSwapFeeModule | `0x656cf5d2f1A70177E011e2c27DeafBeE4C7B0541` | [JSON](abis/deployed/DynamicSwapFeeModule-2ee04b19.json) |
| MixedRouteQuoterV1 | `0x47c3570b90e7234FE695Ad5F1bE69E21fe1a9ee2` | [JSON](abis/deployed/MixedRouteQuoterV1-df3f80c3.json) |
| NFTDescriptor | `0xdE9A5d34A9fe0177544E8a70C691c3f1F9c9c63a` | [JSON](abis/deployed/NFTDescriptor-2c62783e.json) |
| NFTSVG | `0x2427C741f45E7e232e06fd2b60279A771d634Fb0` | [JSON](abis/deployed/NFTSVG-02770c5a.json) |
| NonfungiblePositionManager | `0xf8c30c3C362941C23025f2eA30B066A73C982f63` | [JSON](abis/deployed/NonfungiblePositionManager-4f7e8ab1.json) |
| NonfungibleTokenPositionDescriptor | `0x239BD25E86e4A3B931B1C6Cf7849C27cA9f0498A` | [JSON](abis/deployed/NonfungibleTokenPositionDescriptor-e5d817ef.json) |
| PositionBurnHelper | `0x2764db7bca0ccf98a1611f36879ebffd06ffc02b` | [JSON](abis/deployed/PositionBurnHelper-ab59405c.json) |
| QuoterV2 | `0x7CCB89bB9BdEF68688F39a2c22d249fD1D9759f1` | [JSON](abis/deployed/QuoterV2-1e478f28.json) |
| SwapRouter | `0x9B63CA87919617d042A89663492dB3c8686e0CaE` | [JSON](abis/deployed/SwapRouter-6723eb22.json) |
| TopazSlipstreamStateMulticall | `0xa1941194be7c2607FfbC27DE23B1aCA357C45e3D` | [JSON](abis/deployed/TopazSlipstreamStateMulticall-528c9eb2.json) |
| UniversalRouter | `0x691e6171e0a434FfE5C9f1759621D05b9efcF6A6` | [JSON](abis/deployed/UniversalRouter.json) |
| Permit2 | `0x000000000022D473030F116dDEE9F6B43aC78BA3` | Standard token/infrastructure or legacy BNB reference |
| Multicall3 | `0xcA11bde05977b3631167028862bE2a173976CA11` | [JSON](abis/Multicall3.json) |
| WrappedNative | `0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c` | Standard token/infrastructure or legacy BNB reference |
| Pool | `0xdC942D8e37cC20BCf9aD1Fe0111eE6c5908f3678` | Standard token/infrastructure or legacy BNB reference |
| GaugeFactory | `0xFc080D1EcD7c332022cebf942AEb62d5E1d4Cb08` | Standard token/infrastructure or legacy BNB reference |
| ManagedRewardsFactory | `0xe4b23F13b24232C1E68AD0575191216152AA9480` | Standard token/infrastructure or legacy BNB reference |
| Forwarder | `0xE79EB7c4D06ff38e6483921DE8e85A37eC7c731b` | Standard token/infrastructure or legacy BNB reference |
| VeArtProxy | `0x9612305fe63DFb84Da8f6d6261169F6B85026601` | Standard token/infrastructure or legacy BNB reference |
| AirdropDistributor | `0x7B1d8745079C85af80Ff7A7eA7C2C4769Eab5348` | Standard token/infrastructure or legacy BNB reference |
| BalanceLogicLibrary | `0xeF6724ad68Fd2f8526765e08afa6627850c8a589` | Standard token/infrastructure or legacy BNB reference |
| DelegationLogicLibrary | `0xCb24e31896d7476EFB7B76A366566cfbcf375033` | Standard token/infrastructure or legacy BNB reference |
| RelayFactoryRegistry | `0x987097eF2fBd740436166f49700a40ac5eD49FE4` | Standard token/infrastructure or legacy BNB reference |
| AutoCompounderFactory | `0x717bB82888F103A1Ff8E07A0f96aD6497744feeA` | Standard token/infrastructure or legacy BNB reference |
| CompoundConverterFactory | `0x64FaeF44D4b9bF1AbeF56878D0188084355fd5Ad` | Standard token/infrastructure or legacy BNB reference |
| RelayOptimizer | `0x62B3cea3C6028029E56A880E71b659aF523F06B6` | Standard token/infrastructure or legacy BNB reference |
| RelayOptimizerRegistry | `0x70008f088e60DE590ca63F93814692503e96Fcbd` | Standard token/infrastructure or legacy BNB reference |
| RelayKeeperRegistry | `0xDB93DCfd7a560fB0757857787b6B3c2dBF6E56aA` | Standard token/infrastructure or legacy BNB reference |
| RelayMaxi | `0xC3b3d7037DA1216A1770b3aC5cB8e2D4241AF251` | Standard token/infrastructure or legacy BNB reference |
| RelayRewardDistribute | `0xb30d44B5E6Ab16494EA2B8455BB430926A935b84` | Standard token/infrastructure or legacy BNB reference |

## Robinhood Chain

EVM ID **4663**; LayerZero EID **30416**; spoke. Gas: ETH, 18 native decimals. RPC: https://rpc.mainnet.chain.robinhood.com. Explorer: https://robin.etherscan.io.

Wrapped native: `0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73`.

| Contract | Address | ABI |
|---|---|---|
| CLZap | `0x0B8aD16647d392F5f34A88097Cb01d2f074334AE` | [Interface ABI](abis/deployed/CLZap.json) |
| SpokeBudgetComposer | `0x5DA6456fa2560071DD29871ca045908f98932865` | [JSON](abis/deployed/SpokeBudgetComposer-b6773a3c.json) |
| SpokeStakeComposer | `0xbba1C3b415cF8212Cf3Ce11e726ab62125BDc6dB` | [JSON](abis/deployed/SpokeStakeComposer-54ed51ad.json) |
| XTopazOFT | `0x1aA89C4Ab9884Cb65B759A3Cc3A1690744d687a6` | [JSON](abis/deployed/XTopazOFT-7f2afbed.json) |
| FactoryRegistry | `0x6f701F163a7372C27275e76Af21b6cF06ca6D498` | [JSON](abis/deployed/FactoryRegistry-75e428f0.json) |
| GaugeFactory | `0x60E60B6D0B77f3Af83Fd6Ed35Db6D0664693E39A` | [JSON](abis/deployed/GaugeFactory-7a2a5e1a.json) |
| ManagedRewardsFactory | `0xab2df5A1C8bB46a28D26a74c64eeAfFE89eD3714` | [JSON](abis/deployed/ManagedRewardsFactory-8dace021.json) |
| Pool | `0x8776BE6cd50BB78414c655bc8bF9e86A0989722F` | [JSON](abis/deployed/Pool-7a8ace0b.json) |
| PoolFactory | `0x1E3aC31cF96b20619c913384C9bf6010A824fB95` | [JSON](abis/deployed/PoolFactory-4096928a.json) |
| ProtocolForwarder | `0xcaFA164098cE984799413daA2Ee7579Eb9f471DF` | [JSON](abis/deployed/ProtocolForwarder-5b9de979.json) |
| Router | `0x18226f64a850163C0f0ABA453653Cc206EaE99f3` | [JSON](abis/deployed/Router-ddffb82c.json) |
| SpokeEmissionReceiver | `0xb6286AaE59580F504471Bf5031A2Aa688C5aC140` | [JSON](abis/deployed/SpokeEmissionReceiver-37f32161.json) |
| Voter | `0xb509071a8a33fC2184B169dfc029B3dE3CF5172B` | [JSON](abis/deployed/Voter-19456e5a.json) |
| VotingRewardsFactory | `0x28e686ffA9CAF74411FBa0923dC3729CD513e3D4` | [JSON](abis/deployed/VotingRewardsFactory-2f196ac8.json) |
| XTopazVotingVault | `0x35D7Ac512f465F48D2bCb4C7322dd34c7BB7c777` | [JSON](abis/deployed/XTopazVotingVault-67434da3.json) |
| CLFactory | `0xaa5865dC3A60b25D305226d66fd573021f0D8fFB` | [JSON](abis/deployed/CLFactory-d0ad6e33.json) |
| CLGauge | `0xE6ab7AA7cCe6C3e11E709408BD985828a98b6553` | [JSON](abis/deployed/CLGauge-58301f73.json) |
| CLGaugeFactory | `0xc99B3e03e8dE70318f705155a3195c18d6344dFE` | [JSON](abis/deployed/CLGaugeFactory-7c1194af.json) |
| CLInterfaceMulticall | `0x1b4c8adC09D4c2940C0e536fF11266013D15B38a` | [JSON](abis/deployed/CLInterfaceMulticall-e21ccbab.json) |
| CLPool | `0x2DaA7cF731334b4Cd1c2E4E01E97Ca67F4B9C6AE` | [JSON](abis/deployed/CLPool-eef316ee.json) |
| CustomSwapFeeModule | `0x3Ae3642ECebB720e48Fe3F8fefF5F7B5C50F98f6` | [JSON](abis/deployed/CustomSwapFeeModule-4d7df8e0.json) |
| CustomUnstakedFeeModule | `0xCe6BE50Cf7a6a868E5993Aaa505b905B31c011e0` | [JSON](abis/deployed/CustomUnstakedFeeModule-4d7df8e0.json) |
| DynamicSwapFeeModule | `0x0Dca13b1039277d82B27ADd86d06195B8E9BBfDb` | [JSON](abis/deployed/DynamicSwapFeeModule-2ee04b19.json) |
| MixedRouteQuoterV1 | `0x39A344d192D1D34a6Bee24DCF11093e93Fbb3993` | [JSON](abis/deployed/MixedRouteQuoterV1-df3f80c3.json) |
| NFTDescriptor | `0xf09d42Dbd9F867422339F13F40A936Fc54B28133` | [JSON](abis/deployed/NFTDescriptor-2c62783e.json) |
| NFTSVG | `0x1328cfCcB9d670fa478f0D5249f41A38f23aF592` | [JSON](abis/deployed/NFTSVG-02770c5a.json) |
| NonfungiblePositionManager | `0x522bf4b5c9280BB6bB719f2CE7f514Dd63c8c0C5` | [JSON](abis/deployed/NonfungiblePositionManager-4f7e8ab1.json) |
| NonfungibleTokenPositionDescriptor | `0xB17cd823450ec44462399ED02f8c72Dce1Bf1D5f` | [JSON](abis/deployed/NonfungibleTokenPositionDescriptor-e5d817ef.json) |
| PositionBurnHelper | `0xc2f7F923CAd652038DbD5cb8acAd60BE0b840bf5` | [JSON](abis/deployed/PositionBurnHelper-a77f546d.json) |
| QuoterV2 | `0xA9Cd3aC90513663197E7Fd6c932f63f0C40701be` | [JSON](abis/deployed/QuoterV2-1e478f28.json) |
| SugarHelper | `0x8C29f85a151E16c94BC845D14A7A4Cd44345F168` | [JSON](abis/deployed/SugarHelper-7d78a37a.json) |
| SwapRouter | `0x2e7395A6E0De6eE1f390bEcE891069Cd18Ff8572` | [JSON](abis/deployed/SwapRouter-6723eb22.json) |
| TopazSlipstreamStateMulticall | `0x8Bc9B86eBCd30A724bf486536507B7f6bf1A5a46` | [JSON](abis/deployed/TopazSlipstreamStateMulticall-528c9eb2.json) |
| UniversalRouter | `0x268d1C8a538Ecf6628838C11d581e1EABD13D6A4` | [JSON](abis/deployed/UniversalRouter.json) |
| Permit2 | `0x000000000022D473030F116dDEE9F6B43aC78BA3` | Standard token/infrastructure or legacy BNB reference |
| Multicall3 | `0xcA11bde05977b3631167028862bE2a173976CA11` | [JSON](abis/Multicall3.json) |

## Base

EVM ID **8453**; LayerZero EID **30184**; spoke. Gas: ETH, 18 native decimals. RPC: https://mainnet.base.org. Explorer: https://basescan.org.

Wrapped native: `0x4200000000000000000000000000000000000006`.

| Contract | Address | ABI |
|---|---|---|
| CLZap | `0x8C29f85a151E16c94BC845D14A7A4Cd44345F168` | [Interface ABI](abis/deployed/CLZap.json) |
| SpokeBudgetComposer | `0xbba1C3b415cF8212Cf3Ce11e726ab62125BDc6dB` | [JSON](abis/deployed/SpokeBudgetComposer-b6773a3c.json) |
| SpokeStakeComposer | `0x2c359C5C680e2b1BcA465e63d1904afac6b308F1` | [JSON](abis/deployed/SpokeStakeComposer-54ed51ad.json) |
| XTopazOFT | `0x1aA89C4Ab9884Cb65B759A3Cc3A1690744d687a6` | [JSON](abis/deployed/XTopazOFT-7f2afbed.json) |
| FactoryRegistry | `0x6f701F163a7372C27275e76Af21b6cF06ca6D498` | [JSON](abis/deployed/FactoryRegistry-75e428f0.json) |
| GaugeFactory | `0x60E60B6D0B77f3Af83Fd6Ed35Db6D0664693E39A` | [JSON](abis/deployed/GaugeFactory-7a2a5e1a.json) |
| ManagedRewardsFactory | `0xab2df5A1C8bB46a28D26a74c64eeAfFE89eD3714` | [JSON](abis/deployed/ManagedRewardsFactory-8dace021.json) |
| Pool | `0x8776BE6cd50BB78414c655bc8bF9e86A0989722F` | [JSON](abis/deployed/Pool-7a8ace0b.json) |
| PoolFactory | `0x1E3aC31cF96b20619c913384C9bf6010A824fB95` | [JSON](abis/deployed/PoolFactory-4096928a.json) |
| ProtocolForwarder | `0xcaFA164098cE984799413daA2Ee7579Eb9f471DF` | [JSON](abis/deployed/ProtocolForwarder-5b9de979.json) |
| Router | `0x18226f64a850163C0f0ABA453653Cc206EaE99f3` | [JSON](abis/deployed/Router-ddffb82c.json) |
| SpokeEmissionReceiver | `0xb6286AaE59580F504471Bf5031A2Aa688C5aC140` | [JSON](abis/deployed/SpokeEmissionReceiver-37f32161.json) |
| Voter | `0xb509071a8a33fC2184B169dfc029B3dE3CF5172B` | [JSON](abis/deployed/Voter-19456e5a.json) |
| VotingRewardsFactory | `0x28e686ffA9CAF74411FBa0923dC3729CD513e3D4` | [JSON](abis/deployed/VotingRewardsFactory-2f196ac8.json) |
| XTopazVotingVault | `0x35D7Ac512f465F48D2bCb4C7322dd34c7BB7c777` | [JSON](abis/deployed/XTopazVotingVault-67434da3.json) |
| CLFactory | `0xaa5865dC3A60b25D305226d66fd573021f0D8fFB` | [JSON](abis/deployed/CLFactory-d0ad6e33.json) |
| CLGauge | `0xE6ab7AA7cCe6C3e11E709408BD985828a98b6553` | [JSON](abis/deployed/CLGauge-58301f73.json) |
| CLGaugeFactory | `0xc99B3e03e8dE70318f705155a3195c18d6344dFE` | [JSON](abis/deployed/CLGaugeFactory-7c1194af.json) |
| CLInterfaceMulticall | `0x7F128593d76D9df3a6e6d1Aec414602aFF11804d` | [JSON](abis/deployed/CLInterfaceMulticall-e21ccbab.json) |
| CLPool | `0x2DaA7cF731334b4Cd1c2E4E01E97Ca67F4B9C6AE` | [JSON](abis/deployed/CLPool-eef316ee.json) |
| CustomSwapFeeModule | `0xCe6BE50Cf7a6a868E5993Aaa505b905B31c011e0` | [JSON](abis/deployed/CustomSwapFeeModule-4d7df8e0.json) |
| CustomUnstakedFeeModule | `0x5E29d449199e1c2e5A5557145075ccBAE0Be0920` | [JSON](abis/deployed/CustomUnstakedFeeModule-4d7df8e0.json) |
| DynamicSwapFeeModule | `0x8Bc9B86eBCd30A724bf486536507B7f6bf1A5a46` | [JSON](abis/deployed/DynamicSwapFeeModule-2ee04b19.json) |
| MixedRouteQuoterV1 | `0xA9Cd3aC90513663197E7Fd6c932f63f0C40701be` | [JSON](abis/deployed/MixedRouteQuoterV1-df3f80c3.json) |
| NFTDescriptor | `0xf09d42Dbd9F867422339F13F40A936Fc54B28133` | [JSON](abis/deployed/NFTDescriptor-2c62783e.json) |
| NFTSVG | `0x1328cfCcB9d670fa478f0D5249f41A38f23aF592` | [JSON](abis/deployed/NFTSVG-02770c5a.json) |
| NonfungiblePositionManager | `0x522bf4b5c9280BB6bB719f2CE7f514Dd63c8c0C5` | [JSON](abis/deployed/NonfungiblePositionManager-4f7e8ab1.json) |
| NonfungibleTokenPositionDescriptor | `0xB17cd823450ec44462399ED02f8c72Dce1Bf1D5f` | [JSON](abis/deployed/NonfungibleTokenPositionDescriptor-e5d817ef.json) |
| PositionBurnHelper | `0x1b4c8adC09D4c2940C0e536fF11266013D15B38a` | [JSON](abis/deployed/PositionBurnHelper-a77f546d.json) |
| QuoterV2 | `0x2e7395A6E0De6eE1f390bEcE891069Cd18Ff8572` | [JSON](abis/deployed/QuoterV2-1e478f28.json) |
| SugarHelper | `0x0Dca13b1039277d82B27ADd86d06195B8E9BBfDb` | [JSON](abis/deployed/SugarHelper-7d78a37a.json) |
| SwapRouter | `0x5DA6456fa2560071DD29871ca045908f98932865` | [JSON](abis/deployed/SwapRouter-6723eb22.json) |
| TopazSlipstreamStateMulticall | `0xc2f7F923CAd652038DbD5cb8acAd60BE0b840bf5` | [JSON](abis/deployed/TopazSlipstreamStateMulticall-528c9eb2.json) |
| UniversalRouter | `0xe4b23F13b24232C1E68AD0575191216152AA9480` | [JSON](abis/deployed/UniversalRouter.json) |
| Permit2 | `0x000000000022D473030F116dDEE9F6B43aC78BA3` | Standard token/infrastructure or legacy BNB reference |
| Multicall3 | `0xcA11bde05977b3631167028862bE2a173976CA11` | [JSON](abis/Multicall3.json) |

## Ethereum

EVM ID **1**; LayerZero EID **30101**; spoke. Gas: ETH, 18 native decimals. RPC: https://ethereum-rpc.publicnode.com. Explorer: https://etherscan.io.

Wrapped native: `0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2`.

| Contract | Address | ABI |
|---|---|---|
| CLZap | `0x1b4c8adC09D4c2940C0e536fF11266013D15B38a` | [Interface ABI](abis/deployed/CLZap.json) |
| SpokeBudgetComposer | `0x5DA6456fa2560071DD29871ca045908f98932865` | [JSON](abis/deployed/SpokeBudgetComposer-b6773a3c.json) |
| SpokeStakeComposer | `0xbba1C3b415cF8212Cf3Ce11e726ab62125BDc6dB` | [JSON](abis/deployed/SpokeStakeComposer-54ed51ad.json) |
| XTopazOFT | `0x1aA89C4Ab9884Cb65B759A3Cc3A1690744d687a6` | [JSON](abis/deployed/XTopazOFT-7f2afbed.json) |
| FactoryRegistry | `0x6f701F163a7372C27275e76Af21b6cF06ca6D498` | [JSON](abis/deployed/FactoryRegistry-75e428f0.json) |
| GaugeFactory | `0x60E60B6D0B77f3Af83Fd6Ed35Db6D0664693E39A` | [JSON](abis/deployed/GaugeFactory-7a2a5e1a.json) |
| ManagedRewardsFactory | `0xab2df5A1C8bB46a28D26a74c64eeAfFE89eD3714` | [JSON](abis/deployed/ManagedRewardsFactory-8dace021.json) |
| Pool | `0x8776BE6cd50BB78414c655bc8bF9e86A0989722F` | [JSON](abis/deployed/Pool-7a8ace0b.json) |
| PoolFactory | `0x1E3aC31cF96b20619c913384C9bf6010A824fB95` | [JSON](abis/deployed/PoolFactory-4096928a.json) |
| ProtocolForwarder | `0xcaFA164098cE984799413daA2Ee7579Eb9f471DF` | [JSON](abis/deployed/ProtocolForwarder-5b9de979.json) |
| Router | `0x18226f64a850163C0f0ABA453653Cc206EaE99f3` | [JSON](abis/deployed/Router-ddffb82c.json) |
| SpokeEmissionReceiver | `0xb6286AaE59580F504471Bf5031A2Aa688C5aC140` | [JSON](abis/deployed/SpokeEmissionReceiver-37f32161.json) |
| Voter | `0xb509071a8a33fC2184B169dfc029B3dE3CF5172B` | [JSON](abis/deployed/Voter-19456e5a.json) |
| VotingRewardsFactory | `0x28e686ffA9CAF74411FBa0923dC3729CD513e3D4` | [JSON](abis/deployed/VotingRewardsFactory-2f196ac8.json) |
| XTopazVotingVault | `0x35D7Ac512f465F48D2bCb4C7322dd34c7BB7c777` | [JSON](abis/deployed/XTopazVotingVault-67434da3.json) |
| CLFactory | `0xaa5865dC3A60b25D305226d66fd573021f0D8fFB` | [JSON](abis/deployed/CLFactory-d0ad6e33.json) |
| CLGauge | `0xE6ab7AA7cCe6C3e11E709408BD985828a98b6553` | [JSON](abis/deployed/CLGauge-58301f73.json) |
| CLGaugeFactory | `0xc99B3e03e8dE70318f705155a3195c18d6344dFE` | [JSON](abis/deployed/CLGaugeFactory-7c1194af.json) |
| CLInterfaceMulticall | `0xc2f7F923CAd652038DbD5cb8acAd60BE0b840bf5` | [JSON](abis/deployed/CLInterfaceMulticall-e21ccbab.json) |
| CLPool | `0x2DaA7cF731334b4Cd1c2E4E01E97Ca67F4B9C6AE` | [JSON](abis/deployed/CLPool-eef316ee.json) |
| CustomSwapFeeModule | `0x3Ae3642ECebB720e48Fe3F8fefF5F7B5C50F98f6` | [JSON](abis/deployed/CustomSwapFeeModule-4d7df8e0.json) |
| CustomUnstakedFeeModule | `0xCe6BE50Cf7a6a868E5993Aaa505b905B31c011e0` | [JSON](abis/deployed/CustomUnstakedFeeModule-4d7df8e0.json) |
| DynamicSwapFeeModule | `0x8C29f85a151E16c94BC845D14A7A4Cd44345F168` | [JSON](abis/deployed/DynamicSwapFeeModule-2ee04b19.json) |
| MixedRouteQuoterV1 | `0x39A344d192D1D34a6Bee24DCF11093e93Fbb3993` | [JSON](abis/deployed/MixedRouteQuoterV1-df3f80c3.json) |
| NFTDescriptor | `0xf09d42Dbd9F867422339F13F40A936Fc54B28133` | [JSON](abis/deployed/NFTDescriptor-2c62783e.json) |
| NFTSVG | `0x1328cfCcB9d670fa478f0D5249f41A38f23aF592` | [JSON](abis/deployed/NFTSVG-02770c5a.json) |
| NonfungiblePositionManager | `0x522bf4b5c9280BB6bB719f2CE7f514Dd63c8c0C5` | [JSON](abis/deployed/NonfungiblePositionManager-4f7e8ab1.json) |
| NonfungibleTokenPositionDescriptor | `0xB17cd823450ec44462399ED02f8c72Dce1Bf1D5f` | [JSON](abis/deployed/NonfungibleTokenPositionDescriptor-e5d817ef.json) |
| PositionBurnHelper | `0x8Bc9B86eBCd30A724bf486536507B7f6bf1A5a46` | [JSON](abis/deployed/PositionBurnHelper-a77f546d.json) |
| QuoterV2 | `0xA9Cd3aC90513663197E7Fd6c932f63f0C40701be` | [JSON](abis/deployed/QuoterV2-1e478f28.json) |
| SugarHelper | `0x0B8aD16647d392F5f34A88097Cb01d2f074334AE` | [JSON](abis/deployed/SugarHelper-7d78a37a.json) |
| SwapRouter | `0x2e7395A6E0De6eE1f390bEcE891069Cd18Ff8572` | [JSON](abis/deployed/SwapRouter-6723eb22.json) |
| TopazSlipstreamStateMulticall | `0x0Dca13b1039277d82B27ADd86d06195B8E9BBfDb` | [JSON](abis/deployed/TopazSlipstreamStateMulticall-528c9eb2.json) |
| UniversalRouter | `0x606794d37991A426a189fD9FA8664D339A77f8ae` | [JSON](abis/deployed/UniversalRouter.json) |
| Permit2 | `0x000000000022D473030F116dDEE9F6B43aC78BA3` | Standard token/infrastructure or legacy BNB reference |
| Multicall3 | `0xcA11bde05977b3631167028862bE2a173976CA11` | [JSON](abis/Multicall3.json) |

## Arc

EVM ID **5042**; LayerZero EID **30417**; spoke. Gas: USDC, 18 native decimals. RPC: https://rpc.mainnet.arc.io. Explorer: https://arcscan.app.

No wrapped native. USDC ERC20 is `0x3600000000000000000000000000000000000000`, 6 decimals. The WETH stub is not a token. Use token-only router paths; bridge messaging fees still use native USDC units.

| Contract | Address | ABI |
|---|---|---|
| SpokeBudgetComposer | `0x5DA6456fa2560071DD29871ca045908f98932865` | [JSON](abis/deployed/SpokeBudgetComposer-b6773a3c.json) |
| SpokeStakeComposer | `0xbba1C3b415cF8212Cf3Ce11e726ab62125BDc6dB` | [JSON](abis/deployed/SpokeStakeComposer-54ed51ad.json) |
| XTopazOFT | `0x1aA89C4Ab9884Cb65B759A3Cc3A1690744d687a6` | [JSON](abis/deployed/XTopazOFT-7f2afbed.json) |
| FactoryRegistry | `0x6f701F163a7372C27275e76Af21b6cF06ca6D498` | [JSON](abis/deployed/FactoryRegistry-75e428f0.json) |
| GaugeFactory | `0x60E60B6D0B77f3Af83Fd6Ed35Db6D0664693E39A` | [JSON](abis/deployed/GaugeFactory-7a2a5e1a.json) |
| ManagedRewardsFactory | `0xab2df5A1C8bB46a28D26a74c64eeAfFE89eD3714` | [JSON](abis/deployed/ManagedRewardsFactory-8dace021.json) |
| Pool | `0x8776BE6cd50BB78414c655bc8bF9e86A0989722F` | [JSON](abis/deployed/Pool-7a8ace0b.json) |
| PoolFactory | `0x1E3aC31cF96b20619c913384C9bf6010A824fB95` | [JSON](abis/deployed/PoolFactory-4096928a.json) |
| ProtocolForwarder | `0xcaFA164098cE984799413daA2Ee7579Eb9f471DF` | [JSON](abis/deployed/ProtocolForwarder-5b9de979.json) |
| Router | `0x18226f64a850163C0f0ABA453653Cc206EaE99f3` | [JSON](abis/deployed/Router-ddffb82c.json) |
| SpokeEmissionReceiver | `0xb6286AaE59580F504471Bf5031A2Aa688C5aC140` | [JSON](abis/deployed/SpokeEmissionReceiver-37f32161.json) |
| Voter | `0xb509071a8a33fC2184B169dfc029B3dE3CF5172B` | [JSON](abis/deployed/Voter-19456e5a.json) |
| VotingRewardsFactory | `0x28e686ffA9CAF74411FBa0923dC3729CD513e3D4` | [JSON](abis/deployed/VotingRewardsFactory-2f196ac8.json) |
| XTopazVotingVault | `0x35D7Ac512f465F48D2bCb4C7322dd34c7BB7c777` | [JSON](abis/deployed/XTopazVotingVault-67434da3.json) |
| CLFactory | `0xaa5865dC3A60b25D305226d66fd573021f0D8fFB` | [JSON](abis/deployed/CLFactory-d0ad6e33.json) |
| CLGauge | `0xE6ab7AA7cCe6C3e11E709408BD985828a98b6553` | [JSON](abis/deployed/CLGauge-58301f73.json) |
| CLGaugeFactory | `0xc99B3e03e8dE70318f705155a3195c18d6344dFE` | [JSON](abis/deployed/CLGaugeFactory-7c1194af.json) |
| CLInterfaceMulticall | `0xc2f7F923CAd652038DbD5cb8acAd60BE0b840bf5` | [JSON](abis/deployed/CLInterfaceMulticall-e21ccbab.json) |
| CLPool | `0x2DaA7cF731334b4Cd1c2E4E01E97Ca67F4B9C6AE` | [JSON](abis/deployed/CLPool-eef316ee.json) |
| CustomSwapFeeModule | `0x3Ae3642ECebB720e48Fe3F8fefF5F7B5C50F98f6` | [JSON](abis/deployed/CustomSwapFeeModule-4d7df8e0.json) |
| CustomUnstakedFeeModule | `0xCe6BE50Cf7a6a868E5993Aaa505b905B31c011e0` | [JSON](abis/deployed/CustomUnstakedFeeModule-4d7df8e0.json) |
| DynamicSwapFeeModule | `0x8C29f85a151E16c94BC845D14A7A4Cd44345F168` | [JSON](abis/deployed/DynamicSwapFeeModule-2ee04b19.json) |
| MixedRouteQuoterV1 | `0x39A344d192D1D34a6Bee24DCF11093e93Fbb3993` | [JSON](abis/deployed/MixedRouteQuoterV1-df3f80c3.json) |
| NFTDescriptor | `0xf09d42Dbd9F867422339F13F40A936Fc54B28133` | [JSON](abis/deployed/NFTDescriptor-2c62783e.json) |
| NFTSVG | `0x1328cfCcB9d670fa478f0D5249f41A38f23aF592` | [JSON](abis/deployed/NFTSVG-02770c5a.json) |
| NonfungiblePositionManager | `0x522bf4b5c9280BB6bB719f2CE7f514Dd63c8c0C5` | [JSON](abis/deployed/NonfungiblePositionManager-4f7e8ab1.json) |
| NonfungibleTokenPositionDescriptor | `0xB17cd823450ec44462399ED02f8c72Dce1Bf1D5f` | [JSON](abis/deployed/NonfungibleTokenPositionDescriptor-e5d817ef.json) |
| PositionBurnHelper | `0x8Bc9B86eBCd30A724bf486536507B7f6bf1A5a46` | [JSON](abis/deployed/PositionBurnHelper-a77f546d.json) |
| QuoterV2 | `0xA9Cd3aC90513663197E7Fd6c932f63f0C40701be` | [JSON](abis/deployed/QuoterV2-1e478f28.json) |
| SugarHelper | `0x0B8aD16647d392F5f34A88097Cb01d2f074334AE` | [JSON](abis/deployed/SugarHelper-7d78a37a.json) |
| SwapRouter | `0x2e7395A6E0De6eE1f390bEcE891069Cd18Ff8572` | [JSON](abis/deployed/SwapRouter-6723eb22.json) |
| TopazSlipstreamStateMulticall | `0x0Dca13b1039277d82B27ADd86d06195B8E9BBfDb` | [JSON](abis/deployed/TopazSlipstreamStateMulticall-528c9eb2.json) |
| UniversalRouter | `0x7B1d8745079C85af80Ff7A7eA7C2C4769Eab5348` | [JSON](abis/deployed/UniversalRouter.json) |
| Permit2 | `0x000000000022D473030F116dDEE9F6B43aC78BA3` | Standard token/infrastructure or legacy BNB reference |
| Multicall3 | `0xcA11bde05977b3631167028862bE2a173976CA11` | [JSON](abis/Multicall3.json) |

## Dynamic instances

Pool/gauge/reward contracts are discovered on the selected chain, not copied from this table. `PoolFactory.getPool(a,b,stable)` and `CLFactory.getPool(a,b,tickSpacing)` find pools; `Voter.gauges(pool)`, `gaugeToFees(gauge)`, `gaugeToBribe(gauge)`, `poolForGauge(gauge)` and `isAlive(gauge)` resolve incentives. Zero means absent. `Pool` and `CLPool` entries are implementations; `CLGauge` is an implementation unless explicitly identified as a per-pool gauge. System-pool contracts are protocol accounting infrastructure, not user markets.
