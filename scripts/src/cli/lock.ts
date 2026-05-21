import minimist from "minimist";
import {
  createLock,
  increaseAmount,
  increaseUnlockTime,
  withdrawLock,
  mergeLocks,
  splitLock,
  lockPermanent,
  unlockPermanent,
} from "../write/lock.js";

const USAGE = `
Usage: yarn tsx src/cli/lock.ts <cmd> [options]

  create     --amount <n> --duration <SECS|2y|1w|...>
  add        --id <tokenId> --amount <n>
  extend     --id <tokenId> --duration <SECS|...>
  merge      --from <id> --to <id>
  split      --id <tokenId> --amount <n>
  permanent  --id <tokenId> [--off]
  withdraw   --id <tokenId>     # only after lock expires
`.trim();

function parseDuration(s: string): number {
  const m = String(s).match(/^(\d+)([smhdwy]?)$/i);
  if (!m) return Number(s);
  const n = Number(m[1]);
  const u = m[2].toLowerCase() || "s";
  const mult = { s: 1, m: 60, h: 3600, d: 86400, w: 7 * 86400, y: 365 * 86400 }[u];
  if (!mult) throw new Error(`bad duration: ${s}`);
  return n * mult;
}

async function main() {
  const argv = minimist(process.argv.slice(2), { string: ["_", "in", "out", "pool", "gauge", "address", "amount", "amount-a", "amount-b", "amount0", "amount1", "id", "tokenId", "token", "a", "b", "t0", "t1", "from", "to", "lower-price", "upper-price", "duration"] });
  const cmd = argv._[0];
  if (!cmd || cmd === "help" || argv.h || argv.help) {
    console.log(USAGE);
    return;
  }
  switch (cmd) {
    case "create": {
      const tx = await createLock({
        amount: String(argv.amount),
        durationSec: parseDuration(String(argv.duration)),
      });
      const r = await tx.wait();
      console.log("ok:", r?.hash);
      // Print the new tokenId by parsing logs (Transfer from address(0))
      console.log("Look up your new tokenId via stats.ts or by inspecting the receipt logs (Transfer from 0x0).");
      break;
    }
    case "add": {
      const tx = await increaseAmount({
        tokenId: BigInt(argv.id),
        amount: String(argv.amount),
      });
      await tx.wait();
      console.log("ok:", tx.hash);
      break;
    }
    case "extend": {
      const tx = await increaseUnlockTime({
        tokenId: BigInt(argv.id),
        newDurationSec: parseDuration(String(argv.duration)),
      });
      await tx.wait();
      console.log("ok:", tx.hash);
      break;
    }
    case "merge": {
      const tx = await mergeLocks({ from: BigInt(argv.from), to: BigInt(argv.to) });
      await tx.wait();
      console.log("ok:", tx.hash);
      break;
    }
    case "split": {
      const tx = await splitLock({ tokenId: BigInt(argv.id), amount: String(argv.amount) });
      await tx.wait();
      console.log("ok:", tx.hash);
      break;
    }
    case "permanent": {
      const id = BigInt(argv.id);
      const tx = argv.off ? await unlockPermanent(id) : await lockPermanent(id);
      await tx.wait();
      console.log("ok:", tx.hash);
      break;
    }
    case "withdraw": {
      const tx = await withdrawLock(BigInt(argv.id));
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
