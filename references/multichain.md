# Topaz across five networks

Read this before any non-BNB action or xTOPAZ question. Addresses and exact deployed ABIs are in [deployments.md](deployments.md) and [deployments.json](deployments.json). Reviewed 2026-09-20 UTC; live gates and feature readiness can change.

| Network | EVM chain ID | LayerZero EID | Role | Gas |
|---|---|---|---|---|
| BNB Chain | 56 | 30102 | Hub | BNB |
| Robinhood Chain | 4663 | 30416 | Spoke | ETH |
| Base | 8453 | 30184 | Spoke | ETH |
| Ethereum | 1 | 30101 | Spoke | ETH |
| Arc | 5042 | 30417 | Spoke | USDC |

Use EVM IDs for RPC/wallet selection and EIDs for LayerZero destinations. Identify a token by `(chainId,address)`, a liquidity NFT by `(chainId,positionManager,tokenId)`, and a vote by `(chainId,votingContract,positionId)`. Identical addresses across chains can name completely different contracts.

## One economy, local markets

BNB retains TOPAZ issuance, veTOPAZ ERC721 locks, rebases and its existing v2/CL gauges. `VeTopazVault` holds an aggregate **normal permanent veTOPAZ lock**, and `XTopaz` represents fungible shares of that backing. Depositing TOPAZ or wrapping an eligible veNFT mints shares. Wrapping merges and burns the original NFT: discover and claim its historical fees/bribes first. The aggregate NFT ID changes on redemption; always read `aggregateTokenId()`.

Each spoke has local v2/CL factories, routers, gauges, rewards, a Voter, `XTopazOFT`, `XTopazVotingVault` and `SpokeEmissionReceiver`. Spoke LP emissions are **xTOPAZ**, not newly issued TOPAZ. A spoke voting position is **not an ERC721** and is not transferable; its ID is a counter, not the wallet address cast to an integer. BNB managed locks/relays, rebase claims and veNFT operations are not spoke workflows.

The bridge is a hub-only mesh: BNB ↔ each spoke. Canonical BNB xTOPAZ is locked/unlocked by `XTopazOFTAdapter`; spoke representations mint/burn through the local OFT. A spoke-to-spoke journey requires two independent transfers through BNB and a new fee quote after the first arrives. No local swap route crosses chains.

```text
TOPAZ or eligible veTOPAZ (BNB)
           ↓ deposit/wrap
   permanent aggregate veNFT ← backing → xTOPAZ shares
                                           ↕ BNB OFT adapter
                      ┌────────────────────┼──────────────┐
                 Robinhood       Base / Ethereum        Arc
                      ↓                    ↓              ↓
               local voting positions → local pool votes
               local LP gauges receive xTOPAZ budgets
```

## Backing, price and supply

Both TOPAZ and xTOPAZ use 18 decimals. Let `A = vault.totalAssets()` and `S = vault.totalShares()`. `convertToShares(assets) = floor(assets*S/A)`; `convertToAssets(shares) = floor(shares*A/S)`. Initial seed shares remain held by the vault. Rebases and unminted settlement assets increase backing per share. Bridge movement does not change this ratio. xTOPAZ is not guaranteed to trade at that backing value in a local market.

Canonical supply already includes shares locked in the adapter. Do not add it to all spoke supplies to calculate global economic supply. `adapter.supplyByEid(eid)` includes pending outbound sends and returns not yet credited on BNB. It is the hub accounting boundary, not a count of only delivered wallet tokens. Keep native gas balances, ERC20 balances, backing, local market prices and vote weights separate.

## Weekly settlement

Epochs start Thursday 00:00 UTC (`floor(unixSeconds/604800)*604800`). The configured strategy normally votes its aggregate for the system pool Wednesday 18:00–22:00 UTC. Redemption closes when that vote is actually cast; deposits/wraps remain possible while voted in a settled epoch.

After rollover, entry waits for `EpochCoordinator.finalize()`. In one transaction it updates the BNB Minter, distributes to the non-streaming `SystemGauge`, claims the strategy's TOPAZ, syncs rebase, snapshots supply, computes budgets, locks the TOPAZ and mints the exact shares allocated to spokes. No pre-funded or streamed system-gauge estimate is substituted for settlement.

For settlement assets `B`, pre-lock `budgetShares = floor(B*S/A)`, and enabled spoke `e`:

```text
chainBudget[e] = floor(budgetShares * supplyByEid[e] / canonicalSupply)
mintedShares  = sum(chainBudget[e])
```

The entire `B` is locked; only `mintedShares` are minted. BNB's unassigned portion raises backing for every share. `budgetTopaz` includes donations/migrated balances held by the strategy, so call it total settlement assets, not necessarily pure gauge emissions.

`send(epoch,eid)` sends the budget with a LayerZero native fee to the spoke budget composer. `SpokeEmissionReceiver` holds funds until local total voting weight is nonzero; local Voter distribution then starts gauge emissions. Delivery, funding, notification and gauge distribution are separate states. `sent` on BNB does not prove destination completion. Older budgets remain sendable, subject to balance, route state and six-decimal OFT precision; less than `1e12` raw shares per budget can remain as dust.

After successful finalize and the first-hour voting restriction, strategy reset normally reopens redemption. Read `canEnter()`, `canUnwrap()`, `isSettled()`, pause flags and actual vote state; do not promise opening at a wall-clock time. An unvoted vault can redeem during settlement pending if `canUnwrap()` and the other redemption conditions permit it. Permissionless maintenance calls still spend gas and require the user's authorization to send.

## Arc exception

Arc has no wrapped native. Gas uses an 18-decimal native USDC balance; the **same balance** exposes a 6-decimal ERC20 interface at `0x3600000000000000000000000000000000000000`. Do not double-count them. Leave a native gas reserve when spending ERC20 USDC.

Arc DEX routers/position manager have a reverting WETH stub. Never use it as a token, invent WUSDC, offer wrap/unwrap, call `*ETH` liquidity/swap methods, or send native `value` to a DEX router. Use token-only functions and USDC approvals. LayerZero `send` is different: its messaging fee is payable in native USDC, in 18-decimal native units. CL Zap availability is separate from DEX/bridge/voting; the reviewed public site says Arc CL Zap is not yet available.

## Other protocol interactions

V2/CL pool, liquidity, gauge and bribe mechanics use the existing references with the **selected chain's** addresses, token decimals and ABI. Resolve pool and gauge existence/aliveness live; read custom/dynamic fees instead of treating tick spacing as a fixed fee. Use `Gauge.rewardToken()` / `CLGauge.rewardToken()` for the emitted asset. Never call BNB's Minter or RewardsDistributor to service a spoke.

Staked liquidity earns gauge emissions; unstaked liquidity earns LP fees under that pool's fee rules. For CL, only in-range liquidity earns. Listing APRs are scenarios, not promised returns; use the API's actual `aprScenario` and price/coverage metadata. The system pool is accounting infrastructure and should not appear as a normal investment opportunity.

Next: [BNB entry/redemption](xtopaz-vault.md), [bridge and recovery](bridging.md), [spoke stake/vote/claims](spoke-voting.md), [multichain API](analytics-multichain.md), [website guide](website.md).
