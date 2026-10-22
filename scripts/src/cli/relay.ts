import minimist from "minimist";
import { formatUnits, getAddress, parseUnits } from "ethers";
import {
  getRelays,
  getSpokeRelayPositions,
  getSpokeRelays,
  type SpokeRelayState,
} from "../read/relays.js";
import {
  claimRelayRewards,
  depositManaged,
  withdrawManaged,
} from "../write/relay.js";
import { deployment, isHubChain, requireHubChain } from "../config/deployments.js";
import { SPOKE_RELAYS, SPOKE_RELAY_CHAIN_IDS } from "../config/relays.js";
import { resolveTokenOnChain } from "../config/tokens.js";
import { CHAIN_FLAG_HELP, chainLabel, parseChainOption } from "../lib/chainOption.js";
import { senderAddress, signer, verifyChain } from "../lib/client.js";
import { getDecimals } from "../lib/erc20.js";
import { fmtEpoch } from "../lib/epoch.js";
import {
  buildSpokeRelayClaimDeferredTx,
  buildSpokeRelayClaimTx,
  buildSpokeRelayDepositTx,
  buildSpokeRelayWithdrawTx,
  buildSpokeRelayZapTx,
  openSpokeRelay,
  simulateSpokeRelayTx,
  type BuiltSpokeRelayAction,
} from "../lib/relayBuilders.js";
import { describeError, exitWithError } from "../lib/revertReason.js";

const USAGE = `
Usage:
  yarn tsx src/cli/relay.ts list [--chain <id|name>]     # every chain unless --chain is given

BNB Chain (56) — managed veTOPAZ:
  yarn tsx src/cli/relay.ts deposit  --id <veTokenId> --relay <maxi|reward-distribute|0xRelay>
  yarn tsx src/cli/relay.ts withdraw --id <veTokenId>
  yarn tsx src/cli/relay.ts claim    --id <veTokenId>

deposit/withdraw/claim broadcast and require PRIVATE_KEY in scripts/.env.
For wallet-ready calldata without broadcasting, use the builders in
src/lib/relayBuilders.ts (buildDepositManagedTx / buildWithdrawManagedTx / buildRelayClaimTx).

xTOPAZ spoke relays — --chain robinhood|arc|base|ethereum:
  yarn tsx src/cli/relay.ts position       --chain <spoke> [--address <owner>]
  yarn tsx src/cli/relay.ts deposit        --chain <spoke> --relay <maxi|converter> --amount <xTOPAZ>
  yarn tsx src/cli/relay.ts zap            --chain <spoke> --relay <maxi|converter> --token <native|USDC|USDG|WETH|0x…> --amount <human>
  yarn tsx src/cli/relay.ts withdraw       --chain <spoke> --relay <maxi|converter> [--owner <depositor>]
  yarn tsx src/cli/relay.ts claim-deferred --chain <spoke> --relay <maxi|converter>
  yarn tsx src/cli/relay.ts claim          --chain <spoke> --relay <maxi|converter> [--tokens 0x…,0x…]

Spoke builders take --from <owner> (default: the PRIVATE_KEY address) and optional
--slippage-bps (zap, default 100), print the approvals plus the call simulated from the
owner, and send nothing unless --execute is given (then they send with PRIVATE_KEY).
withdraw --owner lets an isApprovedForAll operator (--from) exit for the depositor,
who is still paid.
Arc has no native zap; pay with USDC there. Relays not yet deployed say so and stop.

  ${CHAIN_FLAG_HELP}
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

const json = (value: unknown) =>
  JSON.stringify(value, (_key, v) => (typeof v === "bigint" ? v.toString() : v), 2);

function printSpokeRelay(r: SpokeRelayState): void {
  console.log(`\n${r.displayName}  (${r.contractKind}) — ${chainLabel(r.chainId)}`);
  if (!r.deployed) {
    console.log(`  status:         ${r.unavailable}`);
    console.log(`  payout:         ${r.hasUserClaim ? `${r.payoutSymbol} (claimable) + compounded xTOPAZ on exit` : "compounded xTOPAZ, paid on exit (no claim)"}`);
    console.log(`  strategy:       ${r.strategy}`);
    return;
  }
  console.log(`  address:        ${r.address}`);
  console.log(`  escrow:         ${r.escrow}  managed id #${r.mTokenId}${r.deactivated ? "  DEACTIVATED (exits only)" : ""}`);
  console.log(`  managed:        ${formatUnits(r.managedBalance ?? 0n, 18)} xTOPAZ (deferred to exited depositors: ${formatUnits(r.deferredTotal ?? 0n, 18)})`);
  console.log(`  payout:         ${r.hasUserClaim ? `${r.payoutSymbol} (claimable) + compounded xTOPAZ on exit` : "compounded xTOPAZ, paid on exit (no claim)"}`);
  console.log(`  compounded (this epoch): ${formatUnits(r.compoundedThisEpoch ?? 0n, 18)} xTOPAZ`);
  if (r.distributedThisEpoch !== null) {
    console.log(`  distributed (this epoch): ${formatUnits(r.distributedThisEpoch, r.payoutDecimals)} ${r.payoutSymbol}`);
  }
  console.log(`  keeper last run: ${r.keeperLastRun ? fmtEpoch(r.keeperLastRun) : "never"}`);
  console.log(`  strategy:       ${r.strategy}`);
}

async function listSpokeRelays(chainId?: number): Promise<void> {
  const relays = await getSpokeRelays(chainId);
  for (const id of new Set(relays.filter((r) => r.deployed).map((r) => r.chainId))) await verifyChain(id);
  console.log(`\nxTOPAZ spoke relays${chainId === undefined ? "" : ` on ${chainLabel(chainId)}`}`);
  relays.forEach(printSpokeRelay);
}

async function outputSpoke(built: BuiltSpokeRelayAction, owner: string, execute: boolean): Promise<void> {
  const simulated = built.approvals.length > 0
    ? "skipped: confirm the approvals first, then rebuild"
    : await simulateSpokeRelayTx(built.tx, owner).then(() => "ok", (e) => `reverted: ${describeError(e)}`);
  console.log(json({ kind: built.kind, chainId: built.chainId, relay: built.relay.displayName, details: built.details, approvals: built.approvals, tx: built.tx, simulated }));
  if (!execute) return;
  if (simulated.startsWith("reverted")) throw new Error(`not sending: ${simulated}`);
  const wallet = signer(built.chainId);
  if (getAddress(await wallet.getAddress()) !== getAddress(owner)) throw new Error("--execute sends from PRIVATE_KEY; --from must match it");
  for (const step of [...built.approvals, built.tx]) {
    const sent = await wallet.sendTransaction({ to: step.to, data: step.data, value: step.value });
    const receipt = await sent.wait();
    console.log(`${step.label}: ${receipt?.hash} (status ${receipt?.status})`);
    if (receipt?.status !== 1) throw new Error(`${step.label} reverted`);
  }
}

/** A configured route symbol, the native coin (null), or any token the chain resolver knows. */
function spokeZapToken(query: string, chainId: number, relay: string): { token: string | null; decimals: number | null } {
  const q = query.trim();
  const chain = deployment(chainId);
  // Route symbols first: Arc's native symbol is USDC, which there is the ERC20 route, not a native leg.
  const route = openSpokeRelay(chainId, relay).zapRoutes.find((r) => r.symbol.toUpperCase() === q.toUpperCase());
  if (route) return { token: route.tokenIn === "native" ? null : getAddress(route.tokenIn), decimals: route.decimals };
  if (q.toLowerCase() === "native" || (chain.wrappedNative && q.toUpperCase() === chain.nativeSymbol.toUpperCase())) {
    if (!chain.wrappedNative) throw new Error(`${chain.name} has no native zap; pay with the USDC ERC20 instead`);
    return { token: null, decimals: chain.nativeDecimals };
  }
  const resolved = resolveTokenOnChain(q, chainId);
  return { token: resolved.native ? null : resolved.address, decimals: null };
}

async function spokeCommand(cmd: string, chainId: number, argv: minimist.ParsedArgs): Promise<void> {
  if (!SPOKE_RELAY_CHAIN_IDS.includes(chainId)) throw new Error(`${chainLabel(chainId)} has no xTOPAZ spoke relays`);
  if (cmd === "position" || cmd === "positions") {
    const pending = (await getSpokeRelays(chainId)).filter((r) => !r.deployed);
    for (const r of pending) console.log(r.unavailable);
    if (pending.length === SPOKE_RELAYS.filter((r) => r.chainId === chainId).length) return;
    await verifyChain(chainId);
    const owner = getAddress(argv.address ?? argv.from ?? (await senderAddress(chainId)));
    const positions = await getSpokeRelayPositions(chainId, owner);
    if (positions.length === 0) console.log(`No spoke relay deposits for ${owner} on ${chainLabel(chainId)}`);
    for (const p of positions) {
      console.log(json({
        relay: p.relay.displayName,
        depositId: p.depositId,
        active: p.active,
        weight: p.weight,
        earnedXTopaz: p.earnedXTopaz,
        deferred: p.deferred,
        unlockAt: p.unlockAt,
        unlockAtUtc: p.unlockAt > 0 ? fmtEpoch(p.unlockAt) : null,
        freeRewards: p.freeRewards,
      }));
    }
    return;
  }
  if (!argv.relay) throw new Error(`${cmd} needs --relay <maxi|converter>`);
  const relay = String(argv.relay);
  openSpokeRelay(chainId, relay);
  await verifyChain(chainId);
  const owner = getAddress(argv.from ?? (await senderAddress(chainId)));
  const execute = Boolean(argv.execute);
  const target = { chainId, relay, owner };
  switch (cmd) {
    case "deposit":
      if (!argv.amount) throw new Error("deposit needs --amount <xTOPAZ>");
      return outputSpoke(await buildSpokeRelayDepositTx({ ...target, amount: parseUnits(String(argv.amount), 18) }), owner, execute);
    case "zap": {
      if (!argv.token || !argv.amount) throw new Error("zap needs --token and --amount");
      const { token, decimals } = spokeZapToken(String(argv.token), chainId, relay);
      const amountIn = parseUnits(String(argv.amount), decimals ?? (await getDecimals(token as string, chainId)));
      const slippageBps = argv["slippage-bps"] !== undefined ? Number(argv["slippage-bps"]) : undefined;
      return outputSpoke(await buildSpokeRelayZapTx({ ...target, tokenIn: token, amountIn, slippageBps }), owner, execute);
    }
    case "withdraw": {
      const depositor = argv.owner ? getAddress(String(argv.owner)) : owner;
      return outputSpoke(await buildSpokeRelayWithdrawTx({ ...target, owner: depositor, caller: owner }), owner, execute);
    }
    case "claim-deferred":
      return outputSpoke(await buildSpokeRelayClaimDeferredTx(target), owner, execute);
    case "claim": {
      const tokens = argv.tokens ? String(argv.tokens).split(",").map((t) => t.trim()).filter(Boolean) : undefined;
      return outputSpoke(await buildSpokeRelayClaimTx({ ...target, tokens }), owner, execute);
    }
    default:
      console.error(`unknown command: ${cmd}\n\n${USAGE}`);
      process.exit(1);
  }
}

async function main(): Promise<void> {
  const argv = minimist(process.argv.slice(2), {
    string: ["_", "chain", "id", "relay", "address", "from", "owner", "amount", "token", "tokens"],
    boolean: ["execute"],
  });
  const cmd = argv._[0];

  if (!cmd || cmd === "help" || argv.h || argv.help) {
    console.log(USAGE);
    return;
  }
  if (cmd === "list" && argv.chain === undefined) {
    await listRelays();
    await listSpokeRelays();
    return;
  }
  const chainId = parseChainOption(argv.chain);
  if (!isHubChain(chainId)) {
    if (cmd === "list") return listSpokeRelays(chainId);
    return spokeCommand(cmd, chainId, argv);
  }
  requireHubChain(chainId, "Relays (managed veTOPAZ)");

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

main().catch(exitWithError);
