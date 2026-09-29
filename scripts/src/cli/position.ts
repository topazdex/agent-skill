// CLI: yarn tsx src/cli/position.ts <cmd> --chain <spoke> [options]
// Spoke xTOPAZ positions in XTopazVotingVault — the Robinhood/Base/Ethereum/Arc
// counterpart of BNB veTOPAZ locks (lock.ts).

import minimist from "minimist";
import { formatUnits, type TransactionReceipt } from "ethers";
import { signer } from "../lib/client.js";
import { CHAIN_FLAG_HELP, chainLabel, parseChainOption, selectChain } from "../lib/chainOption.js";
import { requireSpokeChain } from "../config/deployments.js";
import { getSpokePosition, getSpokeVaultState, listSpokePositions, votingVault, type SpokePositionInfo } from "../read/spokePositions.js";
import {
  addToSpokePosition,
  mergeSpokePositions,
  setSpokeVoteOperator,
  stakeSpoke,
  unstakeSpoke,
} from "../write/spokePosition.js";
import { exitWithError } from "../lib/revertReason.js";

const USAGE = `
Usage: yarn tsx src/cli/position.ts <cmd> --chain <robinhood|base|ethereum|arc|id> [options]

  vault                                            # paused, minimumStake, lockUntil, lockEpochs
  list      [--address <owner>]                    # every position (closed ones keep claimable rewards)
  show      --id <positionId>
  stake     --amount <xTOPAZ> [--pool 0xA --weight 60 ...]   # opens a NEW position (stakeAndVote with pools)
  add       --id <positionId> --amount <xTOPAZ>    # extends the whole position's unlock date
  unstake   --id <positionId> [--amount <xTOPAZ>] [--receiver <addr>]   # omit --amount to close
  merge     --from <positionId> --to <positionId>
  operator  --address <operator>                   # can add/vote/merge/claim, never withdraw

  ${CHAIN_FLAG_HELP}

Positions are vault-local ids, not NFTs, and cannot be transferred. Each deposit at
time t unlocks at epochStart(t) + (lockEpochs + 1) weeks. Vote, reset, poke and
claim with vote.ts / claim.ts using the same --chain and the position id.
BNB Chain uses veTOPAZ locks instead: see lock.ts. Amounts are xTOPAZ (18 decimals).
`.trim();

function list(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (value === undefined) return [];
  return [String(value)];
}

function printPosition(p: SpokePositionInfo): void {
  const unlockAt = new Date(Number(p.unlockAt) * 1000).toISOString();
  console.log(
    `#${p.id}  ${formatUnits(p.amount, 18)} xTOPAZ  owner ${p.owner}  unlockAt ${unlockAt}` +
      `  ${p.unlocked ? "unlocked" : "locked"}${p.hasActiveVote ? "  voting" : ""}`,
  );
}

async function openedPositionId(receipt: TransactionReceipt | null, chainId: number): Promise<bigint | null> {
  if (!receipt) return null;
  const vault = votingVault(chainId);
  const vaultAddress = (await vault.getAddress()).toLowerCase();
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== vaultAddress) continue;
    const parsed = vault.interface.parseLog(log);
    if (parsed?.name === "PositionOpened") return parsed.args[0] as bigint;
  }
  return null;
}

async function main() {
  const argv = minimist(process.argv.slice(2), {
    string: ["_", "chain", "id", "amount", "pool", "weight", "receiver", "address", "from", "to"],
  });
  const cmd = argv._[0];
  if (!cmd || cmd === "help" || argv.h || argv.help) {
    console.log(USAGE);
    return;
  }
  requireSpokeChain(parseChainOption(argv.chain), "position.ts");
  const chainId = await selectChain(argv.chain);

  switch (cmd) {
    case "vault": {
      const state = await getSpokeVaultState(chainId);
      console.log(`XTopazVotingVault on ${chainLabel(chainId)}`);
      console.log(`  paused:        ${state.paused}`);
      console.log(`  minimumStake:  ${formatUnits(state.minimumStake, 18)} xTOPAZ`);
      console.log(`  lockEpochs:    ${state.lockEpochs}`);
      console.log(`  deposit now unlocks at ${new Date(Number(state.lockUntil) * 1000).toISOString()}`);
      return;
    }
    case "list": {
      const owner = argv.address ?? (await signer(chainId).getAddress());
      const positions = await listSpokePositions(owner, chainId);
      if (positions.length === 0) console.log(`no positions for ${owner} on ${chainLabel(chainId)}`);
      positions.forEach(printPosition);
      return;
    }
    case "show": {
      if (!argv.id) throw new Error("show requires --id");
      const position = await getSpokePosition(BigInt(argv.id), chainId);
      if (/^0x0{40}$/i.test(position.owner)) throw new Error(`unknown position ${argv.id} on ${chainLabel(chainId)}`);
      printPosition(position);
      return;
    }
    case "stake": {
      if (!argv.amount) throw new Error("stake requires --amount");
      const pools = list(argv.pool);
      const weights = list(argv.weight);
      if (pools.length !== weights.length) throw new Error("pool/weight count mismatch");
      const tx = await stakeSpoke({
        chainId,
        amount: String(argv.amount),
        allocations: pools.map((pool, i) => ({ pool, weight: BigInt(weights[i]) })),
      });
      const receipt = await tx.wait();
      const id = await openedPositionId(receipt, chainId);
      console.log("ok:", tx.hash, id === null ? "" : `position #${id}`);
      return;
    }
    case "add": {
      if (!argv.id || !argv.amount) throw new Error("add requires --id and --amount");
      const tx = await addToSpokePosition({ chainId, id: BigInt(argv.id), amount: String(argv.amount) });
      await tx.wait();
      console.log("ok:", tx.hash);
      return;
    }
    case "unstake": {
      if (!argv.id) throw new Error("unstake requires --id");
      const tx = await unstakeSpoke({
        chainId,
        id: BigInt(argv.id),
        amount: argv.amount === undefined ? undefined : String(argv.amount),
        receiver: argv.receiver,
      });
      await tx.wait();
      console.log("ok:", tx.hash);
      return;
    }
    case "merge": {
      if (!argv.from || !argv.to) throw new Error("merge requires --from and --to");
      const tx = await mergeSpokePositions({ chainId, from: BigInt(argv.from), to: BigInt(argv.to) });
      await tx.wait();
      console.log("ok:", tx.hash);
      return;
    }
    case "operator": {
      if (!argv.address) throw new Error("operator requires --address");
      const tx = await setSpokeVoteOperator({ chainId, operator: String(argv.address) });
      await tx.wait();
      console.log("ok:", tx.hash);
      return;
    }
    default:
      console.error(`unknown command: ${cmd}\n\n${USAGE}`);
      process.exit(1);
  }
}

main().catch(exitWithError);
