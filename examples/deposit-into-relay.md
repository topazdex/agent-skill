# Example — Deposit a veTOPAZ lock into a Relay (and claim)

**Goal:** A user holds veTOPAZ lock `#1234` and wants to stop managing it by hand. They want the **Reward & Distribute** relay so they keep earning but get a weekly USDT stream they can claim. Later, they want to claim that USDT.

Relays automate the weekly veTOPAZ grind (claim fees + bribes + rebase → swap → vote → compound) for a **managed veTOPAZ lock**. See `references/relays.md`.

## 0. Pre-checks

- veNFT: `#1234`, owned by the user
- Target relay: **Reward & Distribute** (`CompoundConverter`), managed veNFT `mTokenId` 3087, pays out **USDT**
- The lock must be a **NORMAL** lock (`escrowType == 0`), must not have voted/deposited this epoch, and we must not be in the final hour before the Thursday 00:00 UTC epoch flip.

> Depositing **forfeits your own vote** while the lock is in the relay — the relay votes the aggregated weight. To go back to manual voting, withdraw first.

## 1. Build the deposit (no broadcast)

```ts
import { buildDepositManagedTx } from "../scripts/src/index.js";

const built = await buildDepositManagedTx({
  tokenId: 1234,
  relay: "reward-distribute",   // or "maxi", a display name, or a relay address
});

// built.tx       -> { to: Voter, data, value: 0n }   // Voter.depositManaged(1234, 3087)
// built.mTokenId -> 3087
```

The builder reads the chain and rejects loudly if the lock isn't NORMAL, already acted this epoch, or owned by someone else. Hand `built.tx` to the wallet to sign. After it lands, `VotingEscrow.escrowType(1234)` becomes `1` (LOCKED) and `idToManaged(1234)` returns `3087`.

## 2. (Alternative) Broadcast via CLI

Only after the user says "send it":

```bash
yarn tsx src/cli/relay.ts deposit --id 1234 --relay reward-distribute
```

Requires `PRIVATE_KEY` in `scripts/.env`. Prints the tx hash on success.

## 3. Later — preview and claim the USDT

Maxi has nothing to claim (it compounds in-place). Reward & Distribute streams USDT you claim from the lock's `FreeManagedReward`:

```ts
import { buildRelayClaimTx } from "../scripts/src/index.js";

const claim = await buildRelayClaimTx({ tokenId: 1234 });
// claim.earned      -> claimable USDT (wei)
// claim.payoutToken -> USDT
// claim.tx          -> FreeManagedReward.getReward(1234, [USDT])
```

To just preview without building, read on-chain:

```ts
import { ethers } from "ethers";
const ve = new ethers.Contract(VOTING_ESCROW, veAbi, provider);
const mTokenId = await ve.idToManaged(1234);                 // 3087
const free = await ve.managedToFree(mTokenId);               // FreeManagedReward (dynamic!)
const reward = new ethers.Contract(free, rewardAbi, provider);
const earned = await reward.earned(USDT, 1234);              // claimable USDT
```

CLI form:

```bash
yarn tsx src/cli/relay.ts claim --id 1234
```

## 4. Exiting

To leave the relay and reclaim full control (and, for Maxi, realize the compounded gains):

```ts
import { buildWithdrawManagedTx } from "../scripts/src/index.js";
const exit = await buildWithdrawManagedTx({ tokenId: 1234 });   // Voter.withdrawManaged(1234)
```

The returned lock is **re-locked to the maximum (4 years)** from the withdrawal time. You cannot withdraw in the same epoch you deposited.

## Notes

- **Which relay?** Maxi = maximum veTOPAZ growth, no cash flow, illiquid until withdraw. Reward & Distribute = partial compounding + claimable USDT. See the comparison in `references/relays.md`.
- **Relay state:** `yarn tsx src/cli/relay.ts list` shows each relay's voting power and what it compounded / distributed this epoch.
- **Timing:** deposit/withdraw are once-per-epoch and blocked in the final hour — see `references/epoch-timing.md`.
