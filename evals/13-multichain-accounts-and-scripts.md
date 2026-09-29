# Eval 13 — Topaz ID and the skill scripts off BNB Chain

**Output kind:** `explanation`

Three sub-prompts. Tests that the skill never scopes Topaz ID or its own helpers to BNB Chain: Topaz ID Connect covers all five networks (`developers/topaz-id-connect.md`), swap batches go through the Topaz ID action client on the batch's chain, and the scripts take `--chain` with spoke positions instead of veTOPAZ (`scripts/README.md`, `references/spoke-voting.md`). Regression for a report where the skill said Topaz ID was BNB-only.

---

## 13a — Is Topaz ID available on Base?

### Prompt

> We're launching our dApp on Base. Can our users log in with Topaz ID there, or is it only on BNB Chain?

### Expected reads

- [ ] `developers/topaz-id-connect.md` (chains table, gas and funding).

### Expected behavior

- [ ] Answer **yes**: Topaz ID supports BNB Chain, Robinhood Chain, Base, Ethereum and Arc, with the same smart-wallet address on every chain.
- [ ] Show how to configure Base: `chains` from `@topazdex/id-connect/chains` (e.g. `[base]` on `TopazIdProvider`, or `bsc, base` in a wagmi config); `TopazIdProvider` without `chains` falls back to BNB only.
- [ ] Note that gas is sponsored only on BNB Chain; on Base the smart wallet pays gas in ETH, so the user must fund the address there first.

### MUST NOT

- [ ] Say Topaz ID is BNB-only or that Base users need a different wallet.
- [ ] Claim gas is sponsored on Base.

---

## 13b — Submitting a Topaz swap from a Topaz ID wallet on Arc

### Prompt

> Our app connects Topaz ID on Arc. How do we build and send a USDC → xTOPAZ swap on Topaz from the user's Topaz ID wallet?

### Expected reads

- [ ] `developers/topaz-id-connect.md` (Submitting Topaz DEX calls through Topaz ID).
- [ ] `references/swapping-api.md` or `developers/multichain-integration.md` for `buildTopazSwapBatch`.

### Expected behavior

- [ ] Build with `buildTopazSwapBatch` (or `buildBestSwapTx`) using `chainId: 5042`, the Arc USDC ERC20 `0x3600000000000000000000000000000000000000`, and the smart wallet as payer and recipient.
- [ ] Submit every call in order with `topazClient.sendCalls({ calls, atomicRequired: batch.atomicRequired })` after confirming `topazClient.chainId` matches the batch.
- [ ] Mention Arc gas is paid by the wallet in native USDC and there are no native DEX legs.

### MUST NOT

- [ ] Send the approvals and swap as separate unbatched transactions, or allow the sequential fallback.
- [ ] Use plain wagmi `writeContract` for the swap.
- [ ] Treat Arc USDC as a native-value input.

---

## 13c — Voting with xTOPAZ on Base using the skill's scripts

### Prompt

> I hold xTOPAZ on Base. Using the skill's scripts, how do I stake it and vote for a pool there?

### Expected reads

- [ ] `scripts/README.md` (Other chains) or `references/spoke-voting.md`.

### Expected behavior

- [ ] Use `position.ts stake --chain base --amount … [--pool … --weight …]` to open an `XTopazVotingVault` position, then `vote.ts cast --chain base --id <positionId> …` (or `stakeAndVote` in one step).
- [ ] Explain positions are vault-local ids, not NFTs; each deposit locks until the start of epoch N+2 (`lockEpochs` + 1 weeks); claims use `claim.ts --chain base --id <positionId>`.
- [ ] Offer built calldata by default and broadcast only on explicit instruction.

### MUST NOT

- [ ] Say the scripts are BNB-only or tell the user to repoint `BSC_RPC_URL`.
- [ ] Use `lock.ts` / `VotingEscrow` or a veNFT id on Base.
- [ ] Call the BNB Voter for a Base position.

---

## Machine-readable assertions

```yaml
assertions:
  cases:
    - id: topaz-id-base
      output_kind: explanation
      expected_tool_calls:
        - 'topaz-id-connect\.md'
      forbidden_tool_calls:
        - 'scripts/src/write/'
        - 'broadcastTransaction'
      must_include:
        - '(Base|8453)'
        - '(five|all) (Topaz )?(chains|networks)|Robinhood.*Ethereum.*Arc'
        - 'chains'
        - '(sponsor|pays? (its own )?gas|gas in ETH|fund)'
      must_not_include:
        - 'Topaz ID (is|works|runs) (only|solely|just) (available )?on BNB'
        - 'Topaz ID is (a )?BNB[- ](Chain[- ])?only'
        - '(not|isn.t|is not) (available|supported) on Base'
        - 'gas is sponsored on Base'
    - id: topaz-id-arc-swap
      output_kind: explanation
      expected_tool_calls:
        - 'topaz-id-connect\.md'
      forbidden_tool_calls:
        - 'scripts/src/write/'
        - 'broadcastTransaction'
      must_include:
        - 'buildTopazSwapBatch|buildBestSwapTx'
        - '5042'
        - '0x3600000000000000000000000000000000000000'
        - 'sendCalls'
        - 'atomicRequired'
      must_not_include:
        - 'Topaz ID is (a )?BNB[- ](Chain[- ])?only'
        - 'useWriteContract'
    - id: spoke-vote-scripts
      output_kind: explanation
      expected_tool_calls:
        - '(scripts/README\.md|spoke-voting\.md|position\.ts)'
      forbidden_tool_calls:
        - 'broadcastTransaction'
        - '(stakeSpoke|voteSpoke|vote)\(.*(broadcast|sign)'
      must_include:
        - 'position\.ts'
        - '--chain (base|8453)'
        - '(XTopazVotingVault|voting vault|position id)'
        - 'vote\.ts|stakeAndVote'
      must_not_include:
        - '(scripts|CLIs?) (are|is) (still )?BNB[- ]only'
        - '(set|point|repoint) (your )?BSC_RPC_URL (to|at) .*(Base|8453)'
        - 'lock\.ts create'
```
