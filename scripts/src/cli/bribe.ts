import minimist from "minimist";
import { depositBribe } from "../write/bribe.js";
import { resolveTokenOnChain } from "../config/tokens.js";
import { CHAIN_FLAG_HELP, selectChain } from "../lib/chainOption.js";
import { exitWithError } from "../lib/revertReason.js";

const USAGE = `
Usage: yarn tsx src/cli/bribe.ts deposit [--chain <id|name>] --pool <addr> --token <addr|sym> --amount <human>

  ${CHAIN_FLAG_HELP}

The pool, its gauge, the bribe contract and the token whitelist are all local to
the selected chain. Bribes pay that chain's voters (veTOPAZ on BNB, xTOPAZ
positions on a spoke) for the current epoch.
`.trim();

async function main() {
  const argv = minimist(process.argv.slice(2), { string: ["_", "chain", "in", "out", "pool", "gauge", "address", "amount", "amount-a", "amount-b", "amount0", "amount1", "id", "tokenId", "token", "a", "b", "t0", "t1", "from", "to", "lower-price", "upper-price", "duration"] });
  const cmd = argv._[0];
  if (!cmd || cmd === "help" || argv.h || argv.help) {
    console.log(USAGE);
    return;
  }
  if (cmd !== "deposit") {
    console.error(`unknown command: ${cmd}\n\n${USAGE}`);
    process.exit(1);
  }
  const chainId = await selectChain(argv.chain);
  const tx = await depositBribe({
    chainId,
    pool: argv.pool,
    token: resolveTokenOnChain(String(argv.token), chainId).address,
    amount: String(argv.amount),
  });
  await tx.wait();
  console.log("ok:", tx.hash);
}

main().catch(exitWithError);
