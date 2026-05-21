import minimist from "minimist";
import { vote, resetVote, pokeVote } from "../write/vote.js";

const USAGE = `
Usage: yarn tsx src/cli/vote.ts <cmd> [options]

  cast   --id <tokenId> --pool 0xA --weight 60 [--pool 0xB --weight 30 ...]
  reset  --id <tokenId>
  poke   --id <tokenId>

Pool/weight pairs are repeated and matched in order. Weights are relative.
`.trim();

function pairFromFlag(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") return [value];
  if (typeof value === "number") return [String(value)];
  return [];
}

async function main() {
  const argv = minimist(process.argv.slice(2), { string: ["_", "in", "out", "pool", "gauge", "address", "amount", "amount-a", "amount-b", "amount0", "amount1", "id", "tokenId", "token", "a", "b", "t0", "t1", "from", "to", "lower-price", "upper-price", "duration"] });
  const cmd = argv._[0];
  if (!cmd || cmd === "help" || argv.h || argv.help) {
    console.log(USAGE);
    return;
  }
  switch (cmd) {
    case "cast": {
      const pools = pairFromFlag(argv.pool);
      const weights = pairFromFlag(argv.weight);
      if (pools.length !== weights.length || pools.length === 0)
        throw new Error("pool/weight count mismatch");
      const allocations = pools.map((pool, i) => ({ pool, weight: BigInt(weights[i]) }));
      const tx = await vote({ tokenId: BigInt(argv.id), allocations });
      await tx.wait();
      console.log("ok:", tx.hash);
      break;
    }
    case "reset": {
      const tx = await resetVote(BigInt(argv.id));
      await tx.wait();
      console.log("ok:", tx.hash);
      break;
    }
    case "poke": {
      const tx = await pokeVote(BigInt(argv.id));
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
