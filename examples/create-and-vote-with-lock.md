# Example — Create a veTOPAZ Lock and Vote

**Goal:** Lock 10,000 TOPAZ for 4 years (max), then vote 60/30/10 across three pools.

## 1. Lock TOPAZ

```ts
import { parseUnits } from "ethers";

const TOPAZ = "0xdf002282C1474C9592780618Adda7EaA99998Abd";
const VE    = "0xe951aC65EFE86682311ab0d8995E7A58750c5eB3";
const FOUR_YEARS = 4 * 365 * 86400;     // = 126_144_000

const topaz = new ethers.Contract(TOPAZ, erc20Abi, signer);
const ve    = new ethers.Contract(VE, veAbi, signer);

const amount = parseUnits("10000", 18);
const allowance = await topaz.allowance(signer.address, VE);
if (allowance < amount) {
  await (await topaz.approve(VE, amount)).wait();
}

const tx = await ve.createLock(amount, FOUR_YEARS);
const receipt = await tx.wait();

// Find the new tokenId — emitted in Transfer(address(0), recipient, tokenId)
const transferTopic = ethers.id("Transfer(address,address,uint256)");
const mintLog = receipt.logs.find(l =>
  l.address.toLowerCase() === VE.toLowerCase() &&
  l.topics[0] === transferTopic &&
  l.topics[1] === ethers.zeroPadValue("0x", 32)        // from = 0
);
const tokenId = BigInt(mintLog.topics[3]);
console.log("veNFT minted:", tokenId);
```

A 4-year lock from "now" actually unlocks at the next Thursday 00:00 UTC after `now + 4 years`, rounded down (so it can be up to 7 days *less* than 4 full years).

Check your current voting power:

```ts
const power = await ve.balanceOfNFT(tokenId);
console.log(`Voting power: ${formatUnits(power, 18)} ve-units`);
// For a max-lock, this is roughly equal to the locked amount.
```

## 2. Decide what to vote for

Look up gauges and pick three pools you want to direct emissions to:

```bash
yarn tsx src/cli/stats.ts gauges --limit 20
```

Outputs `pool, gauge, type (v2|v3), token0/token1, current weight%, last-epoch APR, current bribe USD`. Pick three pool addresses.

For this example, say you've chosen:

```
POOL_A = 0xpoolA...   // TOPAZ/WBNB v3 ts=200
POOL_B = 0xpoolB...   // WBNB/USDT v2 volatile
POOL_C = 0xpoolC...   // USDT/USDC v3 ts=1
```

## 3. Vote

```ts
const voter = new ethers.Contract(VOTER, voterAbi, signer);

// Sanity: not already voted this epoch
const lastVoted = await voter.lastVoted(tokenId);
const epochStart = await voter.epochStart(BigInt(Math.floor(Date.now() / 1000)));
if (lastVoted >= epochStart) throw new Error("already voted this epoch — wait for next Thursday 00:00 UTC");

// Sanity: gauges exist & alive
for (const p of [POOL_A, POOL_B, POOL_C]) {
  const g = await voter.gauges(p);
  if (g === ethers.ZeroAddress) throw new Error(`no gauge for ${p}`);
  if (!(await voter.isAlive(g))) throw new Error(`gauge for ${p} killed — votes wasted`);
}

const tx = await voter.vote(tokenId, [POOL_A, POOL_B, POOL_C], [60n, 30n, 10n]);
await tx.wait();
console.log("voted!");
```

Weights are relative; `[60, 30, 10]` == `[6, 3, 1]`. The contract scales by your current `balanceOfNFT`.

## 4. After voting

This automatically does the following inside the Voter:

- Increments `weights[POOL_A/B/C]` and `totalWeight`.
- Records `votes[tokenId][pool] = your share`, `usedWeights[tokenId] = sum`.
- Calls `_deposit(yourShare, tokenId)` on each gauge's `FeesVotingReward` and `BribeVotingReward` so you're registered to receive **this epoch's** trading fees and bribes for those pools.

You **cannot** change your allocation in the current epoch. Wait for Thursday 00:00 UTC to `vote` again with different weights.

## 5. Modifying the lock mid-epoch

If you want to increase your voting power *before* the next epoch, you can:

```ts
// Add more TOPAZ
await topaz.approve(VE, parseUnits("1000", 18));
await ve.increaseAmount(tokenId, parseUnits("1000", 18));

// Then re-apply your existing vote allocation at the new (higher) balance:
await voter.poke(tokenId);
```

`poke` is NOT gated by `onlyNewEpoch` — call it any time after `increaseAmount` or `increaseUnlockTime` to refresh.

## CLI shortcut

```bash
yarn tsx src/cli/lock.ts create --amount 10000 --duration 4y
# ...prints tokenId

yarn tsx src/cli/vote.ts cast \
  --id <tokenId> \
  --pool 0xpoolA --weight 60 \
  --pool 0xpoolB --weight 30 \
  --pool 0xpoolC --weight 10
```

To reset before re-voting (in a *new* epoch):

```bash
yarn tsx src/cli/vote.ts reset --id <tokenId>
```

## Next: claiming bribes/fees (in the *following* epoch)

After Thursday 00:00 UTC has passed, the bribes/fees you earned for last week's vote become claimable:

```bash
yarn tsx src/cli/claim.ts all --id <tokenId>
```

See `examples/claim-all-rewards.md` for the full breakdown.
