// Read-only deployment checks. No signer, approvals, or financial transactions.
import { keccak256, zeroPadValue } from "ethers";
import { DEPLOYMENTS, deployedContract } from "../config/deployments.js";
import { chainProvider, contractOnChain, assertChain } from "../lib/multichain.js";

const ids = process.argv.slice(2).map(Number);
for (const id of ids) if (!DEPLOYMENTS.some((c) => c.chainId === id)) throw new Error(`Unknown chain ${id}`);
let failures = 0;
async function readWithRetry<T>(read: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await read(); } catch (error) {
      if (attempt === 2) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }
}
for (const chain of DEPLOYMENTS.filter((c) => !ids.length || ids.includes(c.chainId))) {
  const provider = await readWithRetry(() => chainProvider(chain.chainId));
  try {
    const block = await provider.getBlockNumber();
    const issues: string[] = [];
    const entries = Object.entries(chain.contracts);
    for (let i = 0; i < entries.length; i += 2) {
      await Promise.all(entries.slice(i, i + 2).map(async ([name, entry]) => {
        try {
          const code = await readWithRetry(() => provider.getCode(entry.address, block));
          if (code === "0x") issues.push(`${name}: no code`);
          else if (entry.runtimeCodeHash && keccak256(code) !== entry.runtimeCodeHash) issues.push(`${name}: runtime hash mismatch`);
        } catch (error) { issues.push(`${name}: ${String(error)}`); }
      }));
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    const check = async (name: string, method: string, expected: string, args: unknown[] = []) => {
      try {
        const actual = String(await readWithRetry(() => contractOnChain(chain.chainId, name, provider).getFunction(method)(...args, { blockTag: block })));
        if (actual.toLowerCase() !== expected.toLowerCase()) issues.push(`${name}.${method}: ${actual}, expected ${expected}`);
      } catch (error) { issues.push(`${name}.${method}: ${String(error)}`); }
    };
    const addr = (name: string) => deployedContract(chain.chainId, name).address;
    await check("CLFactory", "poolImplementation", addr("CLPool"));
    await check("CLFactory", "voter", addr("Voter"));
    await check("CLFactory", "swapFeeModule", addr("DynamicSwapFeeModule"));
    await check("PoolFactory", "implementation", addr("Pool"));
    if (chain.role === "hub") {
      await check("VeTopazVault", "XTOPAZ", addr("XTopaz"));
      await check("WrapRouter", "VAULT", addr("VeTopazVault"));
      await check("WrapRouter", "ADAPTER", addr("XTopazOFTAdapter"));
      await check("RelayManager", "ve", addr("VotingEscrow"));
      await check("RelayManager", "voter", addr("Voter"));
      await check("RelayManager", "topaz", addr("Topaz"));
      for (const spoke of DEPLOYMENTS.filter((c) => c.role === "spoke")) {
        await check("XTopazOFTAdapter", "peers", zeroPadValue(deployedContract(spoke.chainId, "XTopazOFT").address, 32), [spoke.lzEid]);
      }
    } else {
      await check("XTopazVotingVault", "token", addr("XTopazOFT"));
      await check("XTopazVotingVault", "voter", addr("Voter"));
      await check("SpokeEmissionReceiver", "voter", addr("Voter"));
      await check("SpokeEmissionReceiver", "xTopaz", addr("XTopazOFT"));
      await check("SpokeStakeComposer", "VOTING_VAULT", addr("XTopazVotingVault"));
      await check("SpokeStakeComposer", "OAPP", addr("XTopazOFT"));
      await check("SpokeBudgetComposer", "RECEIVER", addr("SpokeEmissionReceiver"));
      await check("SpokeBudgetComposer", "OAPP", addr("XTopazOFT"));
      await check("XTopazOFT", "peers", zeroPadValue(deployedContract(56, "XTopazOFTAdapter").address, 32), [30102]);
    }
    const weth = chain.wrappedNative ?? "0x8bcEaA40B9AcdfAedF85AdF4FF01F5Ad6517937f";
    await check("NonfungiblePositionManager", "WETH9", weth);
    await check("NonfungiblePositionManager", "tokenDescriptor", addr("NonfungibleTokenPositionDescriptor"));
    if (chain.contracts.CLZap) {
      await check("CLZap", "CL_FACTORY", addr("CLFactory"));
      await check("CLZap", "NPM", addr("NonfungiblePositionManager"));
      await check("CLZap", "WRAPPED_NATIVE", weth);
    }
    await assertChain(provider, chain.chainId);
    failures += issues.length;
    console.log(JSON.stringify({ chainId: chain.chainId, block, contractsChecked: entries.length, issues }));
  } finally { provider.destroy(); }
}
if (failures) process.exitCode = 1;
