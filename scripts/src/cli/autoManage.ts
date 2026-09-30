// CLI: yarn tsx src/cli/autoManage.ts <cmd> --chain <bnb|robinhood|arc|id> [options]
// Topaz Auto Manage (ALM) vaults on BNB, Robinhood and Arc. Reads need no key;
// builders print the approvals and call, simulated from --from. --execute sends
// them with PRIVATE_KEY.

import minimist from "minimist";
import { formatUnits, getAddress, parseUnits } from "ethers";
import { senderAddress, signer } from "../lib/client.js";
import { CHAIN_FLAG_HELP, chainLabel, selectChain } from "../lib/chainOption.js";
import { deployment } from "../config/deployments.js";
import { resolveTokenOnChain } from "../config/tokens.js";
import { getDecimals } from "../lib/erc20.js";
import { describeError, exitWithError } from "../lib/revertReason.js";
import {
  depositBlocker,
  getAutoManagePositions,
  getAutoManageVault,
  listAutoManageVaults,
  requireAutoManage,
  type AutoManageVaultState,
} from "../read/autoManage.js";
import {
  buildAutoManageClaimTx,
  buildAutoManageDepositTx,
  buildAutoManageRedeemTx,
  buildAutoManageZapInTx,
  buildAutoManageZapOutTx,
  simulateBuiltTx,
  type BuiltAutoManageAction,
} from "../lib/autoManageBuilders.js";

const USAGE = `
Usage: yarn tsx src/cli/autoManage.ts <cmd> --chain <bnb|robinhood|arc|id> [options]

  vaults                                           # every vault the factory registered, with deposit status
  vault      --vault <addr>
  positions  [--address <owner>]                   # shares, principal and claimable rewards
  deposit    --vault <addr> [--amount0 <human>] [--amount1 <human>]   # one side is matched to the vault ratio
  withdraw   --vault <addr> [--shares <human> | --percent <1-100>]    # both tokens in kind; never paused
  claim      --vault <addr>
  zap-in     --vault <addr> --token <symbol|0x…|native> --amount <human>
  zap-out    --vault <addr> --token <symbol|0x…|native> [--shares <human> | --percent <1-100>]

Builders take --from <owner> (default: the PRIVATE_KEY address), optional
--slippage-bps (default 100), and print approvals plus the call, simulated from
the owner once approvals are in place. Add --execute to send them with PRIVATE_KEY.

  ${CHAIN_FLAG_HELP}

Vaults exist on BNB (56), Robinhood (4663) and Arc (5042). Zaps swap through 0x
via the Topaz website proxy (0.6% Topaz fee plus the 0x fee, disclosed per leg).
Arc has no native input; zap with ERC20s such as USDC there. Rewards (TOPAZ on BNB,
xTOPAZ on spokes) are claimed separately and never compounded.
`.trim();

const json = (value: unknown) =>
  JSON.stringify(value, (_key, v) => (typeof v === "bigint" ? v.toString() : v), 2);

function printVault(v: AutoManageVaultState): void {
  const status = depositBlocker(v) ?? "deposits open";
  console.log(
    `${v.vault}  ${v.symbol0}/${v.symbol1} ts=${v.tickSpacing}  ` +
      `${formatUnits(v.total0, v.decimals0)} ${v.symbol0} + ${formatUnits(v.total1, v.decimals1)} ${v.symbol1}  ` +
      `${v.inRange ? "in range" : "OUT OF RANGE"}  ${status}`,
  );
}

/** A vault token symbol, the native coin (null), or any token the chain resolver knows. */
function parseToken(query: string, vault: AutoManageVaultState, chainId: number): string | null {
  const q = query.trim();
  if (q.toLowerCase() === "native" || q.toUpperCase() === deployment(chainId).nativeSymbol.toUpperCase()) {
    if (!deployment(chainId).wrappedNative) return getAddress(resolveTokenOnChain(q, chainId).address);
    return null;
  }
  if (q.toUpperCase() === vault.symbol0.toUpperCase()) return vault.token0;
  if (q.toUpperCase() === vault.symbol1.toUpperCase()) return vault.token1;
  const resolved = resolveTokenOnChain(q, chainId);
  return resolved.native ? null : resolved.address;
}

async function output(built: BuiltAutoManageAction, owner: string, execute: boolean): Promise<void> {
  let simulated: string;
  if (built.approvals.length > 0) {
    simulated = "skipped: confirm the approvals first, then rebuild";
  } else {
    simulated = await simulateBuiltTx(built.tx, owner).then(() => "ok", (e) => `reverted: ${describeError(e)}`);
  }
  console.log(json({ kind: built.kind, chainId: built.chainId, vault: built.vault.vault, details: built.details, approvals: built.approvals, tx: built.tx, simulated }));
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

async function main() {
  const argv = minimist(process.argv.slice(2), {
    string: ["_", "chain", "vault", "address", "from", "amount0", "amount1", "amount", "shares", "token"],
    boolean: ["execute"],
  });
  const cmd = argv._[0];
  if (!cmd || cmd === "help" || argv.h || argv.help) {
    console.log(USAGE);
    return;
  }
  const chainId = await selectChain(argv.chain);
  requireAutoManage(chainId);

  if (cmd === "vaults") {
    const vaults = await listAutoManageVaults(chainId);
    console.log(`${vaults.length} Auto Manage vaults on ${chainLabel(chainId)}`);
    vaults.forEach(printVault);
    console.log("\nAPR, TVL and history: yarn tsx src/cli/stats.ts v1 /auto-manage/vaults --chainId " + chainId);
    return;
  }
  if (!["positions"].includes(cmd) && !argv.vault) throw new Error(`${cmd} needs --vault <addr>`);

  if (cmd === "vault") {
    const v = await getAutoManageVault(chainId, argv.vault);
    printVault(v);
    console.log(json(v));
    return;
  }
  if (cmd === "positions") {
    const owner = getAddress(argv.address ?? (await senderAddress(chainId)));
    const positions = await getAutoManagePositions(chainId, owner);
    if (positions.length === 0) console.log(`No Auto Manage positions for ${owner} on ${chainLabel(chainId)}`);
    console.log(json(positions));
    return;
  }

  const owner = getAddress(argv.from ?? (await senderAddress(chainId)));
  const slippageBps = argv["slippage-bps"] !== undefined ? Number(argv["slippage-bps"]) : undefined;
  const execute = Boolean(argv.execute);
  const vault = await getAutoManageVault(chainId, argv.vault);
  const shares = argv.shares ? parseUnits(String(argv.shares), 18) : undefined;
  const percent = argv.percent !== undefined ? Number(argv.percent) : undefined;

  switch (cmd) {
    case "deposit":
      return output(await buildAutoManageDepositTx({
        chainId, vault: vault.vault, owner, slippageBps,
        amount0Max: argv.amount0 ? parseUnits(String(argv.amount0), vault.decimals0) : undefined,
        amount1Max: argv.amount1 ? parseUnits(String(argv.amount1), vault.decimals1) : undefined,
      }), owner, execute);
    case "withdraw":
      return output(await buildAutoManageRedeemTx({ chainId, vault: vault.vault, owner, shares, percent, slippageBps }), owner, execute);
    case "claim":
      return output(await buildAutoManageClaimTx({ chainId, vault: vault.vault, owner }), owner, execute);
    case "zap-in": {
      if (!argv.token || !argv.amount) throw new Error("zap-in needs --token and --amount");
      const tokenIn = parseToken(String(argv.token), vault, chainId);
      const decimals = tokenIn === null ? deployment(chainId).nativeDecimals : await getDecimals(tokenIn, chainId);
      return output(await buildAutoManageZapInTx({
        chainId, vault: vault.vault, owner, tokenIn, amountIn: parseUnits(String(argv.amount), decimals),
        swapSlippageBps: slippageBps, shareSlippageBps: slippageBps,
      }), owner, execute);
    }
    case "zap-out": {
      if (!argv.token) throw new Error("zap-out needs --token");
      const tokenOut = parseToken(String(argv.token), vault, chainId);
      return output(await buildAutoManageZapOutTx({ chainId, vault: vault.vault, owner, tokenOut, shares, percent, swapSlippageBps: slippageBps }), owner, execute);
    }
    default:
      console.error(`unknown command: ${cmd}\n\n${USAGE}`);
      process.exit(1);
  }
}

main().catch(exitWithError);
