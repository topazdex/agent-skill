import minimist from "minimist";
import { depositBribe } from "../write/bribe.js";
import { findToken } from "../config/tokens.js";

const USAGE = `
Usage: yarn tsx src/cli/bribe.ts deposit --pool <addr> --token <addr|sym> --amount <human>
`.trim();

function resolveToken(query: string): string {
  const t = findToken(query);
  if (t) return t.address;
  if (query.startsWith("0x") && query.length === 42) return query;
  throw new Error(`unknown token: ${query}`);
}

async function main() {
  const argv = minimist(process.argv.slice(2), { string: ["_", "in", "out", "pool", "gauge", "address", "amount", "amount-a", "amount-b", "amount0", "amount1", "id", "tokenId", "token", "a", "b", "t0", "t1", "from", "to", "lower-price", "upper-price", "duration"] });
  const cmd = argv._[0];
  if (!cmd || cmd === "help" || argv.h || argv.help) {
    console.log(USAGE);
    return;
  }
  if (cmd !== "deposit") {
    console.error(`unknown command: ${cmd}\n\n${USAGE}`);
    process.exit(1);
  }
  const tx = await depositBribe({
    pool: argv.pool,
    token: resolveToken(String(argv.token)),
    amount: String(argv.amount),
  });
  await tx.wait();
  console.log("ok:", tx.hash);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
