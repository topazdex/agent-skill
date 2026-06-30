import minimist from "minimist";
import { formatUnits } from "ethers";
import { getRelays } from "../read/relays.js";
import {
  claimRelayRewards,
  depositManaged,
  withdrawManaged,
} from "../write/relay.js";

const USAGE = `
Usage:
  yarn tsx src/cli/relay.ts list
  yarn tsx src/cli/relay.ts deposit  --id <veTokenId> --relay <maxi|reward-distribute|0xRelay>
  yarn tsx src/cli/relay.ts withdraw --id <veTokenId>
  yarn tsx src/cli/relay.ts claim    --id <veTokenId>

deposit/withdraw/claim broadcast and require PRIVATE_KEY in scripts/.env.
For wallet-ready calldata without broadcasting, use the builders in
src/lib/relayBuilders.ts (buildDepositManagedTx / buildWithdrawManagedTx / buildRelayClaimTx).
`.trim();

async function listRelays(): Promise<void> {
  const relays = await getRelays();
  for (const r of relays) {
    console.log(`\n${r.displayName}  (${r.contractKind})`);
    console.log(`  address:        ${r.address}`);
    console.log(`  managed veNFT:  #${r.mTokenId}`);
    console.log(`  voting power:   ${formatUnits(r.votingPower, 18)} ve`);
    console.log(`  payout:         ${r.hasUserClaim ? `${r.payoutSymbol} (claimable)` : "compounds in-place (no claim)"}`);
    console.log(`  compounded (this epoch): ${formatUnits(r.compoundedThisEpoch, 18)} TOPAZ`);
    if (r.distributedThisEpoch !== null) {
      console.log(`  distributed (this epoch): ${formatUnits(r.distributedThisEpoch, 18)} ${r.payoutSymbol}`);
    }
    console.log(`  strategy:       ${r.strategy}`);
  }
}

async function main(): Promise<void> {
  const argv = minimist(process.argv.slice(2), { string: ["_", "id", "relay"] });
  const cmd = argv._[0];

  if (!cmd || cmd === "help" || argv.h || argv.help) {
    console.log(USAGE);
    return;
  }

  switch (cmd) {
    case "list":
      await listRelays();
      return;
    case "deposit": {
      if (!argv.id || !argv.relay) throw new Error("deposit requires --id and --relay");
      const tx = await depositManaged(String(argv.id), String(argv.relay));
      await tx.wait();
      console.log("ok:", tx.hash);
      return;
    }
    case "withdraw": {
      if (!argv.id) throw new Error("withdraw requires --id");
      const tx = await withdrawManaged(String(argv.id));
      await tx.wait();
      console.log("ok:", tx.hash);
      return;
    }
    case "claim": {
      if (!argv.id) throw new Error("claim requires --id");
      const tx = await claimRelayRewards(String(argv.id));
      await tx.wait();
      console.log("ok:", tx.hash);
      return;
    }
    default:
      console.error(`unknown command: ${cmd}\n\n${USAGE}`);
      process.exit(1);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
