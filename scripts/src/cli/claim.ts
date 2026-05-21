import minimist from "minimist";
import {
  claimAll,
  claimFees,
  claimBribes,
  claimRebase,
  claimGaugeRewardsV2,
  claimGaugeRewardV3,
} from "../write/claim.js";
import { signer } from "../lib/client.js";
import { v2StakedGaugesForAccount } from "../read/gauges.js";

const USAGE = `
Usage: yarn tsx src/cli/claim.ts <cmd> [options]

  all          --id <tokenId> [--address <addr>]
  gauge-v2     [--address <addr>]                    # batch all v2 gauges you're staked in
  gauge        --gauge <addr> [--tokenId <id>]       # CL: claim by tokenId (or by account if omitted)
  fees         --id <tokenId> --pool 0xA [--pool 0xB ...]
  bribes       --id <tokenId> --pool 0xA [--pool 0xB ...]
  rebase       --id <tokenId>
`.trim();

function pools(argv: any): string[] {
  if (!argv.pool) return [];
  return Array.isArray(argv.pool) ? argv.pool.map(String) : [String(argv.pool)];
}

async function main() {
  const argv = minimist(process.argv.slice(2), { string: ["_", "in", "out", "pool", "gauge", "address", "amount", "amount-a", "amount-b", "amount0", "amount1", "id", "tokenId", "token", "a", "b", "t0", "t1", "from", "to", "lower-price", "upper-price", "duration"] });
  const cmd = argv._[0];
  if (!cmd || cmd === "help" || argv.h || argv.help) {
    console.log(USAGE);
    return;
  }
  switch (cmd) {
    case "all": {
      const account = argv.address ?? (await signer().getAddress());
      const res = await claimAll({ tokenId: BigInt(argv.id), account });
      console.log(JSON.stringify(res, null, 2));
      break;
    }
    case "gauge-v2": {
      const account = argv.address ?? (await signer().getAddress());
      const gauges = await v2StakedGaugesForAccount(account);
      const tx = await claimGaugeRewardsV2({ gauges });
      if (!tx) {
        console.log("nothing to claim");
        return;
      }
      await tx.wait();
      console.log("ok:", tx.hash);
      break;
    }
    case "gauge": {
      const tx = await claimGaugeRewardV3({
        gauge: argv.gauge,
        tokenId: argv.tokenId !== undefined ? BigInt(argv.tokenId) : undefined,
      });
      await tx.wait();
      console.log("ok:", tx.hash);
      break;
    }
    case "fees": {
      const tx = await claimFees({ tokenId: BigInt(argv.id), pools: pools(argv) });
      if (!tx) {
        console.log("nothing to claim");
        return;
      }
      await tx.wait();
      console.log("ok:", tx.hash);
      break;
    }
    case "bribes": {
      const tx = await claimBribes({ tokenId: BigInt(argv.id), pools: pools(argv) });
      if (!tx) {
        console.log("nothing to claim");
        return;
      }
      await tx.wait();
      console.log("ok:", tx.hash);
      break;
    }
    case "rebase": {
      const tx = await claimRebase(BigInt(argv.id));
      if (!tx) {
        console.log("nothing to claim");
        return;
      }
      await tx.wait();
      console.log("ok:", tx.hash);
      break;
    }
    default:
      console.error(`unknown command: ${cmd}\n\n${USAGE}`);
      process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
