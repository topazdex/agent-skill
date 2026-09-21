# TOPAZ, veTOPAZ and xTOPAZ in plain language

Read this to **explain** the token system or answer a "can I / when can I / what happens if" question. For building the transaction, go on to [xtopaz-vault.md](xtopaz-vault.md), [bridging.md](bridging.md) and [spoke-voting.md](spoke-voting.md). Every rule here was taken from the deployed hub and spoke contracts and the protocol's economics and epoch documents; live gates, pauses and limits still have to be read on-chain before promising anything.

## The three assets

| Asset | Where | What it is | Votes for | Earns | Exit |
|---|---|---|---|---|---|
| **TOPAZ** | BNB | The protocol token, 18 decimals | Nothing until locked | Nothing by itself | Liquid; sell on a market |
| **veTOPAZ** | BNB | An ERC721 lock NFT you own; voting power decays unless permanent | BNB pools, chosen by you | BNB fees, bribes and the weekly rebase | Withdraw TOPAZ when the lock expires |
| **xTOPAZ** | BNB and every spoke | A fungible ERC20 share of one big permanent veTOPAZ lock the vault owns | Nothing while liquid; spoke pools once staked on that spoke | Backing growth per share; spoke fees and bribes once staked and voting | Redeem on BNB for a **new permanent veTOPAZ NFT** |

xTOPAZ is not a renamed relay and not a managed veNFT. The aggregate is a normal permanent lock, and shares are an ordinary transferable token. Holding liquid xTOPAZ does nothing on its own: it does not vote anywhere, does not earn voter fees, and its balance never rebases upward. What changes is the amount of TOPAZ each share represents.

## Why xTOPAZ exists

Topaz kept TOPAZ issuance, veTOPAZ locks, the rebase and governance on BNB. The spokes (Robinhood Chain, Base, Ethereum, Arc) needed a voting asset that is fungible, bridgeable and backed by real locked TOPAZ without minting a second token. xTOPAZ is that asset. Spoke LP emissions are paid in xTOPAZ, which comes from a share of BNB's weekly TOPAZ emissions locked into the vault. There is no separate inflation schedule for spokes.

## How to get xTOPAZ

Two BNB-only entry paths, both minting shares at the vault's current rate:

1. **Deposit liquid TOPAZ.** Approve TOPAZ to the WrapRouter and deposit. You can also zap from BNB or another token through the XTopazZap, which swaps to TOPAZ first.
2. **Wrap a veTOPAZ NFT you own.** The vault merges your NFT into the aggregate and burns it. You receive shares equal to your NFT's locked TOPAZ amount at the current rate, not its decayed voting power.

Either path can bridge to a spoke in the same source transaction.

There is no vault entry on a spoke. To hold xTOPAZ on Base you get it on BNB and bridge it, or receive it as a spoke LP emission, or buy it on a local market if one exists.

### Which veTOPAZ NFTs can be wrapped

| Condition | Wrap allowed? |
|---|---|
| Normal lock, still unexpired | Yes, even a short lock |
| Normal lock, permanent | Yes. The vault turns permanent off itself during the merge, so you do **not** call `unlockPermanent` first. This is the one exception to the ordinary "a permanent lock cannot be a merge source" rule |
| Lock has expired | No. Withdraw the TOPAZ and deposit it instead |
| NFT voted in the **current** epoch | No. Wait for the next epoch (Thursday 00:00 UTC). A vote from a previous epoch is fine; the vault resets it for you, but not during Thursday's first hour |
| NFT is deposited in a relay or managed lock (escrow type LOCKED) | No. Withdraw it from the relay first |
| The managed NFT itself (escrow type MANAGED) | No |
| Vault entry paused, or the current epoch has not been settled | No. Read `canEnter()` |
| Your NFT still has more than fifty weeks of unclaimed rebase | No, until the backlog is drained by repeated rebase claims |

Wrapping is optional. Nobody has to wrap; ordinary veTOPAZ keeps working exactly as before on BNB.

### What you give up by wrapping

- Your individual NFT and its BNB gauge votes. The aggregate votes for the system pool only, under the protocol's strategy.
- Your own rebase claims. The vault claims the aggregate's rebase and it shows up as a higher TOPAZ-per-share rate instead.
- The ability to withdraw TOPAZ on your original schedule. See "Getting back to liquid TOPAZ".
- Any fees or bribes you did not claim before the burn. The wrap router claims what you list; unlisted historical rewards are lost with the NFT.

### What you keep

Exposure to your locked TOPAZ at full weight, plus a share of every rebase and every unassigned emission the vault locks. Your shares can be transferred, bridged and staked on a spoke.

## Is one xTOPAZ one TOPAZ?

No. The vault started at a one-to-one seed rate, and the rate only rises. Assets per share equals locked TOPAZ in the aggregate divided by total xTOPAZ supply. Rounding always favours the vault by at most one unit. The rate is an accounting figure, not a market price: a DEX pool can trade xTOPAZ above or below backing. Read the live rate from the vault or from `GET /v1/xtopaz`.

Backing grows two ways. Every weekly rebase is claimed into the aggregate without minting shares. Every week the part of the system gauge's emissions that belongs to shares held on BNB is locked without minting shares. Both raise the rate for every holder on every chain, including shares sitting on a spoke.

## Redeeming xTOPAZ

Redemption happens on BNB only. Approve xTOPAZ to the vault and call redeem. The vault burns your shares, splits the matching TOPAZ out of the aggregate and hands you a **new permanent veTOPAZ NFT**. It does not pay liquid TOPAZ and it cannot return the NFT you originally wrapped.

Shares on a spoke must be bridged back first. Shares inside a spoke voting position must be unstaked before they can bridge. The contracts also support a "bridge back and redeem" compose in one journey; if redemption is closed when the packet lands, you simply receive liquid xTOPAZ on BNB and redeem later.

### When redemption is closed

| Reason | Reopens when |
|---|---|
| The aggregate has voted this epoch. The contract window is Wednesday 18:00 to 22:00 UTC, and the keeper casts the vote at the **start** of it, so treat **Wednesday 18:00 UTC** as the cutoff | After Thursday's finalize and the first-hour restriction, once someone calls the strategy reset, usually shortly after Thursday 01:00 UTC |
| Unwrap paused by the pauser | When the pause is lifted |
| Redeeming would take the aggregate below the protected seed | Only smaller amounts; the seed is never redeemable |
| Rebase backlog after a sync | After the backlog is drained by repeated `claimRebase()` calls |

Read `canUnwrap()`; never promise reopening at a wall-clock time. In practice redemption is open from roughly Thursday 01:00 UTC until Wednesday 18:00 UTC, and closed from that vote until the Thursday reset. Anything a user wants to redeem in a given week should be submitted well before Wednesday 18:00 UTC.

## Getting back to liquid TOPAZ

This is the question most people actually mean by "unwrap". The full path:

1. Bridge shares to BNB if they are on a spoke (unstake first if needed).
2. Redeem on BNB during an open window. You now own a permanent veTOPAZ NFT.
3. Call `unlockPermanent` on that NFT (requires its votes to be reset first). This turns it into a decaying lock with a **fresh four-year** term.
4. Wait four years, then withdraw the TOPAZ.

So wrapping into xTOPAZ is effectively a four-year commitment on the TOPAZ itself. The two faster exits are selling xTOPAZ on a market, or selling the redeemed veTOPAZ NFT. Neither is guaranteed to price at backing. Never tell a user they can "unwrap to TOPAZ".

## The weekly clock

All times UTC. Epochs start Thursday 00:00. The same clock applies on every chain.

| When | What happens | Effect on you |
|---|---|---|
| Wednesday 18:00 | The keeper votes the aggregate for the system pool (contract window runs to 22:00) | Redemption closes for the week. Deposits and wraps still work |
| Wednesday 23:00 | Last hour of the epoch: ordinary voting closes on BNB and every spoke | Spoke votes and BNB votes must be in before this |
| Thursday 00:00 | Epoch rollover | Deposits, wraps and vote resets close until finalize |
| Thursday 00:00 onward | Anyone calls finalize: mints the week's TOPAZ, claims the system gauge and rebase, computes each spoke's xTOPAZ budget, locks it all | Deposits and wraps reopen |
| Thursday 00:00 to 01:00 | Distribute window: vote, reset and poke revert everywhere | Nothing voting-related works |
| Thursday 01:00 onward | Strategy reset; spoke keepers distribute; budgets are sent | Redemption reopens; spoke gauges start streaming xTOPAZ; spoke positions can be closed |

A skipped week is settled by the next finalize. Anyone can call finalize, reset and claimRebase; they only cost gas.

## Bridging

- Every route goes through BNB. BNB to any spoke is one transfer. Spoke to BNB is one transfer. Spoke to spoke is two separate transfers with a wait for BNB delivery in between.
- Only liquid xTOPAZ bridges. veTOPAZ NFTs, LP tokens and staked positions do not.
- Backing stays on BNB. Bridging changes where the share lives, never what it is worth.
- The bridge carries six decimals. Amounts below a multiple of a millionth of an xTOPAZ are left on the source as dust. Quote and show the real sent amount.
- You pay a LayerZero messaging fee in the **source chain's native gas** plus normal gas. On Arc that is native USDC in 18-decimal units even though ERC20 USDC has six.
- A confirmed source transaction is not delivery. Track the LayerZero packet identifier on LayerZero Scan or `GET /v1/bridge/{guid}`. No delivery time is guaranteed; do not quote one.
- Returns to BNB are rate-limited per spoke: a 24-hour linearly replenishing capacity, configured per route and reviewed as supply grows. If a return exceeds the remaining capacity the packet waits and is retried; nothing is lost. Read `inboundAvailable(eid)` on the adapter before a large return.
- Bridge-and-stake and bridge-and-redeem are optional composed actions. If the destination action cannot run, the composer delivers liquid xTOPAZ to the recipient instead. That is a successful delivery, not a failure and not a loss.
- Do not confuse this with the swap page's cross-chain aggregator routes or the private swap service. Those move other assets under other rules.

## Using xTOPAZ on a spoke

Staking is the only way xTOPAZ votes. On Robinhood, Base, Ethereum or Arc, stake liquid xTOPAZ in that chain's voting vault. Each stake is a **position** with an integer ID, an amount, a vote allocation and a withdrawal date. It is not an NFT, cannot be transferred, and IDs mean nothing on any other chain.

- **Voting power** equals the staked amount, immediately, with no decay and no backing multiplier. Vote once per epoch for local pools; weights are relative.
- **Rewards** are the voted pools' trading fees and any incentives posted on them, claimable after the epoch ends. LP emissions on a spoke are xTOPAZ and belong to gauge stakers, which is a separate action.
- **No rebase claim on a spoke.** Backing growth is already inside each share.
- **Withdrawal lock.** Money that enters a position sets its unlock to the start of the epoch after the next full one. With the launch setting of one full epoch, stake placed in epoch N can leave from Thursday 01:00 UTC of epoch N+2, roughly one to two weeks. Voting, re-voting and claiming never move the date. Adding to an old position relocks the whole position; opening a new position locks only the new money.
- **Closing** a position that voted this epoch waits for the next epoch's first hour to pass. Partial withdrawals from an unlocked position work any time outside that hour and shrink the vote.
- **Minimum stake** is a per-chain setting (contract default one xTOPAZ); read `minimumStake()` live. A vote operator can vote, add, merge and claim for you but never withdraw.

On BNB there is no xTOPAZ voting vault. xTOPAZ on BNB is only liquid: hold it, transfer it, bridge it, redeem it, or trade it if a pool exists.

## Quick answers

| Question | Answer |
|---|---|
| Do I have to convert my veTOPAZ? | No. Wrapping is optional and irreversible for that NFT. |
| Can I unwrap back to my original NFT? | No. Redemption creates a new permanent NFT. |
| Can I get liquid TOPAZ out? | Only by redeeming, turning permanent off and waiting four years, or by selling shares or the NFT on a market. |
| Can I wrap a permanent lock? | Yes. The vault handles the permanent flag itself. |
| Can I wrap an expired lock? | No. Withdraw and deposit the TOPAZ instead. |
| Can I wrap an NFT that voted this week? | Not until next Thursday. Last week's vote is fine outside Thursday's first hour. |
| Can I wrap a relay-deposited NFT? | Withdraw it from the relay first. |
| Is there a deposit or redemption fee? | No protocol fee. Rounding costs at most one unit; you pay gas and, when bridging, the messaging fee. |
| Why did I get fewer xTOPAZ than TOPAZ? | The rate is above one-to-one once backing has grown. Your shares represent the same TOPAZ. |
| Does xTOPAZ earn the rebase? | Yes, as a rising backing rate rather than a growing balance, on every chain. |
| Can I vote on BNB pools with xTOPAZ? | No. BNB voting is veTOPAZ only. |
| Can I bridge staked xTOPAZ? | No. Unstake first, after its date and vote gates allow. |
| Can I bridge Base to Robinhood directly? | No. Bridge to BNB, wait for delivery, then bridge to Robinhood. |
| When can I redeem? | Any time the aggregate is not voting and unwrap is not paused: roughly Thursday 01:00 UTC until Wednesday 18:00 UTC, when the weekly system vote is cast. Check `canUnwrap()`. |
| When can I deposit or wrap? | Any time except between Thursday rollover and that week's finalize, and never while entry is paused. Check `canEnter()`. |
| Where does spoke xTOPAZ come from? | The BNB system gauge's share of weekly TOPAZ emissions, locked and minted as shares in proportion to each spoke's bridged supply. |
| Is there an audit of the xTOPAZ system? | The published BNB review does not cover the vault, bridge, coordinator or spoke vault. Point to the website's security page and do not overstate. |

Next: [entry and redemption calls](xtopaz-vault.md), [bridge calls and recovery](bridging.md), [spoke position calls](spoke-voting.md), [settlement math](multichain.md), [website links](website.md).
