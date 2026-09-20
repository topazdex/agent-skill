# Build on all five Topaz networks

Install the skill's `scripts` dependencies with `yarn install --immutable`. The examples below are TypeScript run with `yarn tsx` from that directory. They build/read only and never load a private key. Read [architecture](../references/multichain.md), then the relevant [vault](../references/xtopaz-vault.md), [bridge](../references/bridging.md) or [spoke](../references/spoke-voting.md) guide before execution.

## Select a deployment and ABI

```ts
import { chainProvider, contractOnChain, encodeDeploymentCall, assertChain } from './src/lib/multichain.js';
import { deployedContract, deployment } from './src/config/deployments.js';

const chainId = 8453;
const provider = await chainProvider(chainId); // TOPAZ_RPC_8453 overrides public RPC
const voter = contractOnChain(chainId, 'Voter', provider);
const count = await voter.length();
console.log({chainId, poolCount: count.toString()});
provider.destroy();
```

`deployedContract(chainId,name)` returns an address and ABI reference; `deploymentInterface` loads the matching interface. The [catalog](../references/deployments.json) and all referenced ABI files ship in this skill. Missing chains/contracts/ABIs throw rather than falling back to BNB. Deployed ABI arrays include tuple components, events and custom errors; do not reconstruct signatures from guessed Solidity names. Legacy `ABIS` also supplies standard ERC20, per-pool Gauge/Reward and BNB relay interfaces.

`encodeDeploymentCall` is **encoding only**, not a precondition checker. On-chain simulation uses `{from:actualOwner,to,data,value}` on a verified source provider; an allowance failure means the required approval is missing, not that the transaction is ready. Recheck wallet identity, chain and review parameters after approvals. Keep the chain ID attached to each built call.

## Quote and build a swap

```ts
import { buildTopazSwapBatch } from './src/lib/topazSwap.js';
const account = '0x1111111111111111111111111111111111111111'; // replace with actual payer
const batch = await buildTopazSwapBatch({
  chainId: 8453,
  tokenIn: 'ETH',
  tokenOut: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // Base USDC, 6 decimals
  amountIn: 1_000_000_000_000_000n, // 0.001 native ETH
  slippageBps: 100,
  payer: account,
});
console.log(JSON.stringify(batch)); // built calldata, no broadcast
```

For Arc pass explicit USDC ERC20 `0x3600000000000000000000000000000000000000`, `amountIn:1_000_000n` for 1 USDC and the selected output address. Native aliases on Arc fail. On other chains, ETH/BNB/native/zero identify native input; a WETH/WBNB address always means ERC20.

The builder supports **exact input**, validates response chain/amounts/routes, reconstructs local calldata and uses the selected chain's Universal Router. ERC20 input returns the full signature-free Permit2 approval, swap and cleanup sequence with `atomicRequired:true`: only an account/wallet capable of executing all calls atomically as the same payer can use it. An EOA cannot send these calls individually and call that an atomic batch. Native input is a single payable router call. The payer is also the recipient.

The HTTP quote service also supports exact output, but this builder does not. For exact-output or ordinary EOA Permit2 signature execution, use the service's current integration contract and deployed UniversalRouter ABI, validate spender/chain/recipient and simulate. Stable v2 and mixed routes do not support exact output. Never reinterpret exact-output amounts as exact-input amounts. The old human-unit `buildBestSwapTx`, token aliases and CLI flows are BNB-only.

## BNB held shares → Base, optionally stake

```ts
import { Contract, ZeroAddress, parseUnits } from 'ethers';
import { ABIS } from './src/lib/abis.js';
import { chainProvider, contractOnChain, encodeDeploymentCall } from './src/lib/multichain.js';
import { bridgeRoute, deployedContract } from './src/config/deployments.js';

const owner = '0x1111111111111111111111111111111111111111'; // actual source owner
const receiver = owner;
const {source,destination} = bridgeRoute(56,8453);
const p = await chainProvider(source.chainId);
const shares = parseUnits('10',18);
const b = {dstEid:destination.lzEid,receiver,composer:ZeroAddress};
// For bridge-and-stake only: b.composer = deployedContract(8453,'SpokeStakeComposer').address;
const router = contractOnChain(56,'WrapRouter',p);
const token = new Contract(deployedContract(56,'XTopaz').address,ABIS.ERC20,p);
const spender = deployedContract(56,'WrapRouter').address;
const [nativeFee,amountSent] = await router.quoteBridge(shares,b);
if (amountSent === 0n) throw new Error('Below bridge precision');
if (await token.balanceOf(owner) < shares) throw new Error('Insufficient liquid shares');
const allowance = await token.allowance(owner,spender);
const approval = allowance < shares
  ? {chainId:56,to:await token.getAddress(),data:token.interface.encodeFunctionData('approve',[spender,shares]),value:'0'}
  : null;
const transaction = encodeDeploymentCall(56,'WrapRouter','bridge',[shares,b],nativeFee);
console.log({kind:approval?'approval-needed':'built calldata',approval,transaction,
  amountSent:amountSent.toString(),dust:(shares-amountSent).toString()});
// After approvals and the bridge-guide peer/pause/capacity checks, freshly quote and simulate:
if (!approval) await p.call({from:owner,to:transaction.to,data:transaction.data,value:BigInt(transaction.value)});
p.destroy();
```

This example shows the source transaction; it does not assert destination readiness. Read both peers and capacity, and simulate again after an authorized approval confirms. Standard nonzero-allowance-reset tokens may require approval to zero before a new exact allowance. No cross-chain transaction is atomic with its destination action.

## Spoke → BNB send parameters

```ts
import { AbiCoder, zeroPadValue } from 'ethers';
import { chainProvider, contractOnChain, encodeDeploymentCall } from './src/lib/multichain.js';
import { deployedContract } from './src/config/deployments.js';

const sourceChainId = 8453;
const owner = '0x1111111111111111111111111111111111111111'; // actual owner
const p = await chainProvider(sourceChainId);
const oft = contractOnChain(sourceChainId,'XTopazOFT',p);
const amount = 10n ** 18n;
const rate = await oft.decimalConversionRate();
const sendable = amount / rate * rate;
const redeemAfterDelivery = false;
const target = redeemAfterDelivery ? deployedContract(56,'HubUnwrapComposer').address : owner;
const send = {dstEid:30102,to:zeroPadValue(target,32),amountLD:amount,minAmountLD:sendable,
  extraOptions:'0x',composeMsg:redeemAfterDelivery?AbiCoder.defaultAbiCoder().encode(['address'],[owner]):'0x',oftCmd:'0x'};
// Inspect enforcedOptions(30102, redeemAfterDelivery ? 2 : 1), peers, pauses and hub inbound capacity first.
const fee = await oft.quoteSend(send,false);
const transaction = encodeDeploymentCall(sourceChainId,'XTopazOFT','send',
  [send,{nativeFee:fee.nativeFee,lzTokenFee:fee.lzTokenFee},owner],fee.nativeFee);
await p.call({from:owner,to:transaction.to,data:transaction.data,value:BigInt(transaction.value)});
console.log(transaction); // built calldata
p.destroy();
```

Unstake first if shares are in a voting position. Plain transfer delivers shares; composed redemption may deliver a permanent NFT or fallback liquid shares. See [bridge recovery](../references/bridging.md) for receipts/GUIDs.

## Stake/vote and ordinary pool actions

Use `contractOnChain(chainId,'XTopazVotingVault',provider)` to read `minimumStake`, `paused`, `lockUntil`, `position(id)` and `isUnlocked(id)`. Approve the chain's XTopazOFT to that vault, then encode `stake(amount)` or `stakeAndVote(amount,pools,weights)`. Read the actual new ID from `PositionOpened`; do not guess `nextId`. Claims use `claimFees(id,contracts,tokens)` / `claimBribes(id,contracts,tokens)` and pay the position owner.

For v2/CL pools, follow the existing liquidity/gauge references using explicit chain-specific `Contract` instances and the deployed ABI catalog. Read actual `getPool`, token order/decimals, reserves or six-field `slot0`, spacing, fees, ownership, custody and gauge state. V2 routes passed to the v2 Router include `factory`; Universal Router v2 commands have their own three-field route tuple. They are not interchangeable.

CL mint/decrease minima must follow a price-bound calculation over the selected range. Near a boundary the honest minimum for one token can be zero; do not substitute arbitrary positive dust. Enforce a meaningful bound on the complete position outcome, plus deadline and fresh pool state. CL mint structs are Topaz-specific and include fields absent from stock Uniswap ABIs.

## API and validation

Use [multichain data](../references/analytics-multichain.md) for markets/accounts and [website routes](../references/website.md) for user navigation. The API is read/discovery infrastructure, not a source of arbitrary transaction authority.

Run `yarn validate`, `yarn build`, `yarn test`, and `yarn verify:deployments` (or append selected EVM IDs). Live checks require working RPCs; use `TOPAZ_RPC_56`, `TOPAZ_RPC_4663`, `TOPAZ_RPC_8453`, `TOPAZ_RPC_1`, `TOPAZ_RPC_5042` to override defaults. A failed network check is not proof that a deployment is absent. Never treat a static ABI/address check as successful funded transaction execution.
