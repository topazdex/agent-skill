# Example — Deposit a Bribe on a Pool

**Goal:** As a protocol/treasury, post 5000 USDC as a bribe on the WBNB/MYTOKEN v3 pool to incentivize voters to direct emissions there in the current epoch.

## 0. Pre-checks

- Pool address: `0xPOOL`
- Bribe token: USDC (`0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d`), 18 dec on BSC
- Amount: 5000 USDC

The bribe must be posted **before Thursday 23:00 UTC** to count toward voters of the current epoch. If you miss the window, it rolls to next week's voters.

## 1. Resolve the bribe contract

```ts
import { ethers, parseUnits } from "ethers";

const POOL = "0xPOOL";
const USDC = "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d";

const voter = new ethers.Contract(VOTER, voterAbi, signer);
const gauge = await voter.gauges(POOL);
if (gauge === ethers.ZeroAddress) throw new Error("pool has no gauge; cannot bribe");
if (!(await voter.isAlive(gauge))) throw new Error("gauge is killed; bribes will not flow");

const bribeAddr = await voter.gaugeToBribe(gauge);
console.log("Bribing contract:", bribeAddr);
```

## 2. Whitelist check

```ts
const bribe = new ethers.Contract(bribeAddr, rewardAbi, signer);
const alreadyAccepted = await bribe.isReward(USDC);

if (!alreadyAccepted) {
  const whitelisted = await voter.isWhitelistedToken(USDC);
  if (!whitelisted) {
    throw new Error("USDC is not a reward for this bribe contract and not whitelisted by Voter — would revert");
  }
}
```

For USDC this will almost always pass (it's whitelisted). For exotic tokens you may need governance to whitelist first.

## 3. Approve and bribe

```ts
const usdc = new ethers.Contract(USDC, erc20Abi, signer);
const amount = parseUnits("5000", 18);    // BSC USDC is 18 decimals

const allowance = await usdc.allowance(signer.address, bribeAddr);
if (allowance < amount) {
  await (await usdc.approve(bribeAddr, amount)).wait();
}

const tx = await bribe.notifyRewardAmount(USDC, amount);
const receipt = await tx.wait();
console.log("Bribe posted in tx", receipt.hash);
```

That's it. The 5000 USDC is pulled from your wallet into the bribe contract and accrues to `tokenRewardsPerEpoch[USDC][currentEpoch]`. Anyone who has voted for `POOL` during this epoch will share it proportionally to their vote weight; they can claim via `Voter.claimBribes(...)` starting in the next epoch.

## 4. (Optional) Verify

```ts
const epochStart = await voter.epochStart(BigInt(Math.floor(Date.now() / 1000)));
const credited = await bribe.tokenRewardsPerEpoch(USDC, epochStart);
console.log(`Bribe contract holds ${formatUnits(credited, 18)} USDC for this epoch's voters`);
```

If you've added an existing reward token, this should be exactly what you sent (it accumulates atomically). If `credited` looks wrong, you're either looking at the wrong epoch (off-by-one timezone error) or a previous briber added too.

## CLI shortcut

```bash
yarn tsx src/cli/bribe.ts deposit \
  --pool 0xPOOL \
  --token 0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d \
  --amount 5000
```

The CLI runs the pre-checks above, prints the bribe contract address, the current epoch start (Thursday 00:00 UTC), and how long is left in the voting window. It requires your `PRIVATE_KEY` in `.env`.

## Reading existing bribes on a pool

To see what's already posted on this pool for this epoch and what's been credited historically:

```bash
yarn tsx src/cli/stats.ts bribes --pool 0xPOOL
```

Output:

```
Bribe contract: 0xBRIBE
Reward tokens (active): USDC, WBNB, MYTOKEN
This epoch (starts <ts> Thu 00:00 UTC):
  USDC    → 7500.00 (≈ $7500.00)
  WBNB    →    1.20 (≈   $720.00)
  MYTOKEN →  100.00 (≈    $35.00)
  TOTAL   → ≈ $8255.00
Pool vote weight this epoch: 1.42M ve
Bribe density: $5.81 per 1k vote weight   (compare across pools to pick where to vote)
```

## Bribe strategy notes

Bribers want maximum vote flow. Some heuristics:

1. **Bribe what voters already want to vote for.** Adding a bribe to a pool with strong organic momentum compounds vote share, where adding to a fundamentally unwanted pool just rewards a small clique.
2. **Time at the start of the epoch (Thursday 00:00–02:00 UTC).** Voters check Wednesday/early Thursday to plan; bribes posted later get less attention.
3. **Bribe density matters.** Voters rationally allocate to maximize `bribesUsd / voteWeight`. Make sure your `(amount * tokenUsd) / currentWeight` is competitive with comparable pools.
4. **Variety helps narratives** — posting multiple smaller reward tokens (rather than one big stable) can attract more voter attention and create more memorable allocations, even at the same USD value.

None of this is enforced by the contract; it's market behavior.
