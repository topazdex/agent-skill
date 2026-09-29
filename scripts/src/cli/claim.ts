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
import { CHAIN_FLAG_HELP, selectChain } from "../lib/chainOption.js";

const USAGE = `
Usage: yarn tsx src/cli/claim.ts <cmd> [--chain <id|name>] [options]

  all          --id <id> [--address <addr>]
  gauge-v2     [--address <addr>]                    # batch all v2 gauges you're staked in
  gauge        --gauge <addr> --tokenId <id>         # CL gauge: claim emissions for one staked position
  fees         --id <id> --pool 0xA [--pool 0xB ...]
  bribes       --id <id> --pool 0xA [--pool 0xB ...]
  rebase       --id <tokenId>                        # BNB Chain only

  ${CHAIN_FLAG_HELP}

--id is a veTOPAZ NFT id on BNB Chain and an XTopazVotingVault position id on a
spoke (fees/bribes are claimed through the vault and paid to the position owner).
Gauge emissions are TOPAZ on BNB Chain and xTOPAZ on a spoke. Spokes have no
rebase: xTOPAZ backing appreciation is already in the share price.
`.trim();

function pools(argv: any): string[] {
  if (!argv.pool) return [];
  return Array.isArray(argv.pool) ? argv.pool.map(String) : [String(argv.pool)];
}

async function main() {
  const argv = minimist(process.argv.slice(2), { string: ["_", "chain", "in", "out", "pool", "gauge", "address", "amount", "amount-a", "amount-b", "amount0", "amount1", "id", "tokenId", "token", "a", "b", "t0", "t1", "from", "to", "lower-price", "upper-price", "duration"] });
  const cmd = argv._[0];
  if (!cmd || cmd === "help" || argv.h || argv.help) {
    console.log(USAGE);
    return;
  }
  const chainId = await selectChain(argv.chain);
  switch (cmd) {
    case "all": {
      const account = argv.address ?? (await signer(chainId).getAddress());
      const res = await claimAll({ chainId, tokenId: BigInt(argv.id), account });
      console.log(JSON.stringify(res, null, 2));
      break;
    }
    case "gauge-v2": {
      const account = argv.address ?? (await signer(chainId).getAddress());
      const gauges = await v2StakedGaugesForAccount(account, chainId);
      const tx = await claimGaugeRewardsV2({ chainId, gauges });
      if (!tx) {
        console.log("nothing to claim");
        return;
      }
      await tx.wait();
      console.log("ok:", tx.hash);
      break;
    }
    case "gauge": {
      if (argv.tokenId === undefined) throw new Error("--tokenId required (CLGauge.getReward(uint256))");
      const tx = await claimGaugeRewardV3({
        chainId,
        gauge: argv.gauge,
        tokenId: BigInt(argv.tokenId),
      });
      await tx.wait();
      console.log("ok:", tx.hash);
      break;
    }
    case "fees": {
      const tx = await claimFees({ chainId, tokenId: BigInt(argv.id), pools: pools(argv) });
      if (!tx) {
        console.log("nothing to claim");
        return;
      }
      await tx.wait();
      console.log("ok:", tx.hash);
      break;
    }
    case "bribes": {
      const tx = await claimBribes({ chainId, tokenId: BigInt(argv.id), pools: pools(argv) });
      if (!tx) {
        console.log("nothing to claim");
        return;
      }
      await tx.wait();
      console.log("ok:", tx.hash);
      break;
    }
    case "rebase": {
      const tx = await claimRebase(BigInt(argv.id), chainId);
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
