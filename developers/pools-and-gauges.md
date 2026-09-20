# Creating pools and gauges

Pool creation is permissionless; governance configuration is not. Select a chain and use its [factory ABIs and addresses](../references/deployments.md). Never substitute a BNB factory for a spoke factory. The absence of a convenience CLI does not make an on-chain function permissioned.

Before encoding, obtain explicit token addresses, decimals, pool type, chain and payer. Symbols alone are insufficient. Confirm tokens are distinct, nonzero deployed contracts. Check for an existing pool before creation. A new pool is not automatically liquid, incentivized, curated or safe.

## v2

Read `PoolFactory.getPool(tokenA, tokenB, stable)`. If absent, simulate and encode `PoolFactory.createPool(tokenA, tokenB, stable)` using the selected chain's ABI. Choose stable versus volatile intentionally; stable curves are not appropriate for every pair. Initial liquidity and its ratio are a separate action using that chain's Router. See [v2 liquidity](../references/liquidity-v2.md); its existing scripts and BNB examples must not be reused unchanged on spokes.

## Concentrated liquidity

Read `CLFactory.getPool(tokenA, tokenB, tickSpacing)` and confirm `tickSpacingToFee(tickSpacing) != 0`. An absent pool can be created through `CLFactory.createPool(tokenA, tokenB, tickSpacing, sqrtPriceX96)`.

The initial price is a required economic decision. Sort tokens by address into token0/token1; encode `sqrtPriceX96 = floor(sqrt(rawToken1 / rawToken0) * 2^96)`. Convert human prices using both token decimals and the sorted direction. Use integer/fixed-point arithmetic, validate pool price bounds, and independently display the resulting human price for confirmation. Do not invent a price from token symbols or use floating-point JavaScript arithmetic for transaction parameters. Creation initializes price but does not add liquidity.

Use the selected chain's NonfungiblePositionManager to mint a position with valid tick boundaries, minimum amounts, recipient and deadline. See [CL liquidity](../references/liquidity-v3.md). Arc accepts ERC20 legs only; its WETH compatibility address is not usable wrapped gas. CL Zap requires an existing pool and is a separate workflow.

## Gauge and incentives

Pool creation does not create its gauge. Read `Voter.gauges(pool)`. For an absent gauge, `Voter.createGauge(poolFactory, pool)` requires an approved factory path in FactoryRegistry. For a non-governor caller, the pool must belong to that factory and both pool tokens must be whitelisted by Voter. Read `isPoolFactoryApproved`, `isPool` and `isWhitelistedToken` before simulation. Do not propose a token-whitelisting or factory-approval transaction without explicit authority for that governance action.

After creation, re-read `gauges`, `isAlive`, `gaugeToFees` and `gaugeToBribe`. LP staking, voting and incentive deposits are independent actions. Verify the reward asset: BNB gauges emit TOPAZ; spoke gauges emit xTOPAZ. To incentivize voting, resolve the bribe contract from the chain's Voter, inspect its accepted reward tokens, approve only that spender, and use its deployed reward ABI. Do not confuse voter bribes with gauge LP rewards or send assets directly to the pool expecting incentive credit.

All examples describe construction, not permission to broadcast. Simulate from the actual caller, show chain/target/amounts and obtain wallet authorization for execution.
