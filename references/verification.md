# Deployment review and verification

Reviewed 2026-09-20 UTC. This is evidence for a snapshot, not a claim that every future transaction will work or that every contract is audited.

## Checks performed

- Reconciled the five-chain deployment records, deployed ABI variants, contract implementations and public API/site documentation. Bundled 205 chain-qualified contract entries; repeated addresses on different chains remain separate entries.
- Read deployed bytecode on all five networks; compared runtime hashes wherever recorded. Checked pool implementations, CL voter/fee-module wiring, xTOPAZ vault/router bindings, hub/spoke peers, spoke receivers/composers, NPM wrapped-native/descriptor bindings and CL Zap immutables.
- Successfully fetched live exact-input swap quotes with explicit chain identity on all five networks, including ERC20 USDC input on Arc. Quoted BNB xTOPAZ bridge sends to all four spoke EIDs.
- Found and corrected stale BNB PositionBurnHelper and NPM descriptor addresses. Included RelayManager's distinct custody flow and current user-facing CL Zap interfaces.
- Type-checked the helpers and ran 205 unit tests, including deployed-ABI digest/parsing, wrong-chain rejection, chain-specific router selection, spoke-route restrictions and Arc handling. Ran repository link, address, manifest and eval-definition validation.

Successful deployment checks used blocks BNB 122920825 (62 contracts, including RelayManager), Robinhood 67629260 (36), Base 51543315 (36), Ethereum 26016125 (36) and Arc 21777070 (35). Re-run the command below for a fresh block and per-chain result.

## Reproduce safely

From `scripts/`, run `yarn build`, `yarn test`, `yarn validate` and `yarn verify:deployments`. Pass chain IDs to restrict the last command, e.g. `yarn verify:deployments 56 8453`. It uses no signer and does not approve, send or deploy anything. Each result reports block, number of contracts checked and issues. RPC URLs may be overridden with `TOPAZ_RPC_<chainId>`; chain identity is checked independently. If the default Ethereum endpoint fails TLS or rate limits, a tested alternative is `TOPAZ_RPC_1=https://eth.drpc.org`. Public RPCs can fail transiently; a failed read is not proof that the deployment is wrong.

## What these checks do not prove

No funded swaps, approvals, bridge deliveries, fallback claims, liquidity mints, votes or epoch-rollover transactions were broadcast in this review. Unit tests and read-only quotes do not establish end-to-end execution. Code presence alone does not establish authenticity or safety; entries without a recorded runtime hash receive only a code-presence check. Some legacy BNB administrative entries have no bundled ABI and are explicitly not executable through the ABI helper. CL Zap and Universal Router include user-facing interfaces, not a promise of exhaustive administrative introspection.

Before moving value, verify current chain, caller/beneficiary, spender, balances, allowances, protocol gates, quote freshness, slippage, bridge peers/options/limits and destination availability. Simulate the exact calls from the actual payer, obtain execution authorization, and monitor both destination receive and compose where relevant. A source-chain receipt alone is not bridge completion. Governance, emergency-role changes and production deployment actions require their own verified interfaces and explicit authority.
