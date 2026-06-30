# Relays — Managed veTOPAZ (mveTOPAZ) reward automation

A **Relay** is an automated reward manager for a **managed veTOPAZ lock (mveTOPAZ)**. A managed veNFT aggregates many depositors' veTOPAZ voting power into a single position; the relay harvests that position's rewards each epoch and either **compounds** them back into the lock or **redistributes** them to depositors — automatically, permissionlessly, with on-chain slippage protection. Rewards are swapped through Topaz's Slipstream (CL) pools. (It's a maintained fork of Velodrome's Relay system, reworked for Topaz.)

Deposit once and the relay handles the weekly grind — claim fees + bribes + rebase, swap, vote, compound — instead of you doing it by hand every epoch.

## The two live relays (BNB Mainnet)

| Relay | Type / contract | Address | Managed veNFT | What a depositor gets |
|---|---|---|---|---|
| **veTOPAZ Maxi** | `AutoCompounder` | `0xC3b3d7037DA1216A1770b3aC5cB8e2D4241AF251` | `mTokenId` 3083 | All rewards are swapped to TOPAZ and compounded **into the lock**. Value accrues in-place — **no claim step**. To realize gains, withdraw. |
| **Reward & Distribute** | `CompoundConverter` | `0xb30d44B5E6Ab16494EA2B8455BB430926A935b84` | `mTokenId` 3087 | TOPAZ is compounded into the lock **and** the rest is swapped to **USDT** and streamed to depositors. **You claim USDT.** |

Infrastructure (factories / registries / keeper) is listed in `addresses.md`. A third relay type (`AutoConverter`, "Rewards") exists in the contracts but is **not deployed on BNB Chain** — ignore it here.

New relays may be deployed over time. The two above are the current live BSC set; enumerate any others on-chain via the factories' `relays()` or the `RelayFactoryRegistry`.

## Mental model

- **Escrow types** (`VotingEscrow.escrowType(tokenId)`): `0 = NORMAL` (an ordinary lock), `1 = LOCKED` (your lock while it's deposited in a relay), `2 = MANAGED` (the relay-owned managed veNFT itself). Only a **NORMAL** lock can be deposited.
- **Depositor operations go through Topaz core (`Voter` / `VotingEscrow` / `FreeManagedReward`), not the relay contract.** You never call the `AutoCompounder` / `CompoundConverter` directly; keepers and public callers do that.
- After you deposit, your veNFT becomes `LOCKED` and `VotingEscrow.idToManaged(tokenId)` returns the relay's `mTokenId`. The relay votes with the aggregated weight — **you forfeit your own manual vote** for as long as you're deposited.
- **`FreeManagedReward` and `LockedManagedReward` are not fixed addresses** — resolve them per managed lock: `ve.managedToFree(mTokenId)` (where depositor USDT lands) and `ve.managedToLocked(mTokenId)` (the compounded-TOPAZ share).
- **Epoch-gated like voting.** `depositManaged` / `withdrawManaged` are once-per-epoch and blocked in the final hour before the epoch flip (Thursday 00:00 UTC). You can't withdraw in the same epoch you deposited. See `epoch-timing.md`.

## Depositor operations

### Deposit a lock into a relay

```solidity
Voter.depositManaged(uint256 _tokenId, uint256 _mTokenId)
```

`_tokenId` is your NORMAL veTOPAZ lock; `_mTokenId` is the relay's managed veNFT (3083 for Maxi, 3087 for Reward & Distribute). Pre-checks: you own (or are approved on) the veNFT, it's NORMAL, it hasn't voted/deposited this epoch, and you're not in the final-hour window.

No-broadcast builder (preferred):

```ts
import { buildDepositManagedTx } from "../scripts/src/index.js";

const built = await buildDepositManagedTx({ tokenId: 1234, relay: "maxi" });
// built.tx -> { to: Voter, data, value: 0n }  (depositManaged(1234, 3083))
```

`relay` accepts `"maxi"`, `"reward-distribute"`, a display name, or a relay address.

### Withdraw a lock from a relay

```solidity
Voter.withdrawManaged(uint256 _tokenId)
```

Pulls your weight back out. The returned lock is **re-locked to the maximum (4 years)** from the withdrawal time, and carries the compounded gains (for Maxi, this is how you realize them). Cannot be called in the same epoch as the deposit.

```ts
import { buildWithdrawManagedTx } from "../scripts/src/index.js";
const built = await buildWithdrawManagedTx({ tokenId: 1234 });
// built.tx -> Voter.withdrawManaged(1234)
```

### Claim USDT (Reward & Distribute only)

```solidity
FreeManagedReward.getReward(uint256 _tokenId, address[] _tokens)   // _tokens = [USDT]
```

Maxi has nothing to claim (it compounds in-place). For Reward & Distribute, the builder resolves the `FreeManagedReward` for your managed lock, checks `earned`, and builds the claim:

```ts
import { buildRelayClaimTx } from "../scripts/src/index.js";
const built = await buildRelayClaimTx({ tokenId: 1234 });
// built.earned        -> claimable USDT (wei)
// built.payoutToken   -> USDT
// built.tx            -> FreeManagedReward.getReward(1234, [USDT])
```

Preview without building: `FreeManagedReward.earned(USDT, tokenId)`, where `FreeManagedReward = ve.managedToFree(ve.idToManaged(tokenId))`.

## CLI

```bash
yarn tsx src/cli/relay.ts list                                  # live state of both relays
yarn tsx src/cli/relay.ts deposit  --id <veTokenId> --relay maxi
yarn tsx src/cli/relay.ts withdraw --id <veTokenId>
yarn tsx src/cli/relay.ts claim    --id <veTokenId>
```

`deposit` / `withdraw` / `claim` broadcast and require `PRIVATE_KEY`. Use them only after the user explicitly authorizes execution; otherwise hand back the builder calldata above. `list` is a read and needs only `BSC_RPC_URL`.

## Reading relay state

`scripts/src/read/relays.ts` exposes `getRelays()` → for each relay: managed-veNFT voting power (`ve.balanceOfNFT(mTokenId)`) and the TOPAZ `compoundedThisEpoch` / USDT `distributedThisEpoch` (`amountCompounded` / `amountDistributed` keyed by the current epoch start). Static metadata (type, payout token, claim semantics, `mTokenId`) lives in `scripts/src/config/relays.ts` as `RELAYS`.

## Choosing a relay

- **veTOPAZ Maxi** — maximum veTOPAZ growth, fully hands-off, never sells. Best for users who want to grow voting power and don't need cash flow. Gains are illiquid until you withdraw (which re-locks 4 years).
- **Reward & Distribute** — partial compounding plus a weekly USDT stream you can claim. Best for users who want some yield in stable form without fully unwinding.

Compare against **manual** veTOPAZ management (vote + claim fees/bribes/rebase yourself, `voting.md` + `rewards-claiming.md`): manual keeps your own vote and full control but costs gas and attention every epoch; relays trade that control for automation.

## Gotchas

- **Maxi has no claim.** If a user asks to "claim from veTOPAZ Maxi," explain it compounds in-place; the way to take profit is `withdrawManaged` (which re-locks to max).
- **Depositing forfeits your manual vote** for the duration — the relay votes the aggregated weight.
- **Once per epoch, not in the final hour.** Surface `epochStart` / window timing if a deposit/withdraw is rejected (`epoch-timing.md`).
- **`FreeManagedReward` is dynamic** — never hardcode it; resolve via `ve.managedToFree(mTokenId)`.
- **No relay subgraph.** Relay live state is read on-chain; underlying gauge/pool APRs come from the Stats API (`analytics-stats-api.md`).
