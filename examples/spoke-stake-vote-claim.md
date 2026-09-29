# Example — Swap, stake xTOPAZ, vote and claim on a spoke (Base)

**Goal:** A user on Base (8453) holds ETH and xTOPAZ. They want to swap some ETH to USDC, stake xTOPAZ to earn voting rewards, vote for a pool, and later claim. The same flow works on Robinhood (4663), Ethereum (1) and Arc (5042) with that chain's `--chain`.

A spoke has no veTOPAZ. Voting power is xTOPAZ staked in the local `XTopazVotingVault`, which issues **position ids**, not NFTs. See `references/spoke-voting.md`. Every command below is built or read for Base alone; nothing here touches BNB contracts.

## 0. Pre-checks

```bash
cd <topaz-skill>/scripts
yarn tsx src/cli/position.ts vault --chain base          # paused, minimumStake, lockEpochs, unlock date for a deposit now
yarn tsx src/cli/stats.ts v1 /accounts/0xYOU/portfolio --chainIds 8453
```

- The wallet pays its own gas in ETH on Base (Topaz ID smart wallets too; only BNB is sponsored).
- A stake made now unlocks at `epochStart(now) + (lockEpochs + 1)` weeks: 7–14 days with `lockEpochs = 1`.
- Arc: trade the USDC ERC20 `0x3600000000000000000000000000000000000000`; there is no native DEX leg.

## 1. Quote and build a swap (no broadcast)

```bash
yarn tsx src/cli/swap.ts quote --chain base --in ETH --out 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 --amount 0.05
yarn tsx src/cli/swap.ts best  --chain base --in ETH --out 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 --amount 0.05 --payer 0xYOU
```

`best --payer` prints a `TopazSwapBatch` with `chainId: 8453` and Base's Universal Router. Native ETH input is one payable call. ERC20 input yields the full Permit2 batch with `atomicRequired: true`, which must be submitted atomically (for Topaz ID: `sendCalls({ calls, atomicRequired })`).

## 2. Find a pool to vote for

```bash
yarn tsx src/cli/stats.ts v1 /pools --chainIds 8453 --scope all --sort emissionsApr --limit 10
yarn tsx src/cli/stats.ts gauge 0xPOOL --chain base      # confirms Voter.gauges(pool) and isAlive on Base
```

Vote with the **pool** address, not the gauge.

## 3. Stake and vote

In the library, build it without broadcasting:

```ts
import { encodeDeploymentCall, deployedContract } from "./src/index.js";
const vault = deployedContract(8453, "XTopazVotingVault").address;
// 1) approve xTOPAZ (deployedContract(8453, "XTopazOFT")) to `vault` for `amount`
// 2) the vault call:
const tx = encodeDeploymentCall(8453, "XTopazVotingVault", "stakeAndVote", [amount, [pool], [100n]]);
```

Or, only once the user has explicitly authorised broadcasting, with `PRIVATE_KEY` set:

```bash
yarn tsx src/cli/position.ts stake --chain base --amount 100 --pool 0xPOOL --weight 100
# → ok: 0x… position #12
```

`stake` checks that the vault is unpaused, the amount meets `minimumStake` and, with pools, that each gauge is alive and the normal voting window is open. It checks all of this before sending the approval. The new id comes from the `PositionOpened` event. Votes cast in the first hour after the Thursday 00:00 UTC flip, or in the final hour, revert. A position that already exists votes once per epoch:

```bash
yarn tsx src/cli/vote.ts cast --chain base --id 12 --pool 0xPOOL --weight 100
```

## 4. Claim

```bash
yarn tsx src/cli/stats.ts claimable --chain base --id 12 --address 0xYOU   # read first
yarn tsx src/cli/claim.ts all       --chain base --id 12                   # broadcast only when authorised
```

Fees and bribes are claimed through the vault (`claimFees(id, contracts, tokens)`) and paid to the position owner. Gauge emissions for staked LP are xTOPAZ (`claim.ts gauge-v2|gauge --chain base`). There is no rebase on a spoke; xTOPAZ already carries its backing appreciation.

## 5. Exit

```bash
yarn tsx src/cli/position.ts show    --chain base --id 12
yarn tsx src/cli/position.ts unstake --chain base --id 12              # after unlockAt; omit --amount to close
```

A full close fails if the position voted this epoch; retry after the next Thursday first hour. Adding with `position.ts add` extends the whole position's unlock date. To move xTOPAZ back to BNB, unstake first, then bridge (see `references/bridging.md`; there is no bridge CLI).
