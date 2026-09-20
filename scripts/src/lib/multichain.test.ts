import { describe, expect, it, vi, afterEach } from "vitest";
import { AbiCoder, Interface } from "ethers";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { DEPLOYMENTS, bridgeRoute, deployedContract, deployment } from "../config/deployments.js";
import { deploymentInterface, encodeDeploymentCall, assertChain } from "./multichain.js";
import { buildTopazSwapBatch, encodeTopazSwap } from "./topazSwap.js";
import { isTopazNative, validateTopazQuote, wrappedTopazToken } from "./topazRouting.js";
import type { JsonRpcProvider } from "ethers";

const payer = "0x1111111111111111111111111111111111111111";
const token = "0x2222222222222222222222222222222222222222";
afterEach(() => vi.unstubAllGlobals());

describe("chain-bound deployments and ABIs", () => {
  it("keeps network and bridge identity distinct and forbids direct spoke routes", () => {
    expect(DEPLOYMENTS.map((c) => c.chainId).sort((a,b) => a-b)).toEqual([1,56,4663,5042,8453]);
    expect(bridgeRoute(56,8453).destination.lzEid).toBe(30184);
    expect(() => bridgeRoute(8453,1)).toThrow(/BNB/);
    expect(() => bridgeRoute(56,56)).toThrow();
    expect(() => deployment(97)).toThrow();
    expect(() => deployedContract(8453,"VotingEscrow")).toThrow();
    expect(deployedContract(1,"UniversalRouter").address).not.toBe(deployedContract(56,"UniversalRouter").address);
  });
  it("pins every recorded ABI digest and parses the selected interface", () => {
    for (const chain of DEPLOYMENTS) for (const [name,entry] of Object.entries(chain.contracts)) {
      if (!entry.abi) continue;
      const file = new URL(`../../../references/${entry.abi}`,import.meta.url);
      const abi = JSON.parse(readFileSync(file,"utf8"));
      if (entry.abiSha256) expect(createHash("sha256").update(JSON.stringify(abi)).digest("hex")).toBe(entry.abiSha256);
      expect(deploymentInterface(chain.chainId,name).fragments.length).toBeGreaterThan(0);
    }
  });
  it("encodes real spoke/vault entry points with the correct target", () => {
    const tx = encodeDeploymentCall(8453,"XTopazVotingVault","unstake",[12n,5n,payer]);
    expect(tx.chainId).toBe(8453);
    expect(tx.to).toBe(deployedContract(8453,"XTopazVotingVault").address);
    expect(deploymentInterface(8453,"XTopazVotingVault").decodeFunctionData("unstake",tx.data)[0]).toBe(12n);
    expect(deploymentInterface(56,"WrapRouter").getFunction("quoteBridge")).not.toBeNull();
    expect(deploymentInterface(56,"VeTopazVault").getFunction("XTOPAZ")).not.toBeNull();
  });
  it("rejects an RPC that reports the wrong network", async () => {
    const provider = { send: vi.fn().mockResolvedValue("0x38") } as Pick<JsonRpcProvider,"send">;
    await expect(assertChain(provider,8453)).rejects.toThrow(/mismatch/);
  });
  it("blocks Arc native DEX legs but allows native OFT messaging fees", () => {
    expect(() => isTopazNative("USDC",5042)).toThrow(/ERC20/);
    expect(() => wrappedTopazToken("native",5042)).toThrow();
    expect(wrappedTopazToken("0x3600000000000000000000000000000000000000",5042)).toContain("3600");
    expect(() => encodeDeploymentCall(5042,"Router","swapExactETHForTokens",[],1n)).toThrow(/token-only/);
    expect(deploymentInterface(5042,"XTopazOFT").getFunction("send")?.payable).toBe(true);
  });
});

describe("multichain swap execution", () => {
  for (const chain of DEPLOYMENTS) it(`binds quotes and router allowances on ${chain.chainId}`, async () => {
    const input = chain.wrappedNative ? chain.nativeSymbol : "0x3600000000000000000000000000000000000000";
    const q = { chainId: chain.chainId, blockNumber: 123, tradeType: "exactIn" as const,
      amount: "100", quote: "200", minimumAmountOut: "198", slippageBips: 100,
      routes: [{ protocol: "CL" as const,percent:100,amountIn:"100",amountOut:"200",
        hops:[{protocol:"cl" as const,address:token,tokenIn:wrappedTopazToken(input,chain.chainId),tokenOut:token,tickSpacing:200}] }] };
    const request = {chainId:chain.chainId,tokenIn:input,tokenOut:token,amountIn:100n,payer};
    const fetch = vi.fn().mockResolvedValue({ok:true,json:async()=>q});
    vi.stubGlobal("fetch",fetch);
    const batch = await buildTopazSwapBatch(request);
    expect(JSON.parse(fetch.mock.calls[0][1].body).chainId).toBe(chain.chainId);
    expect(batch.chainId).toBe(chain.chainId);
    const swap = batch.transactions.find((t)=>t.label==="Swap via Topaz API routing")!;
    expect(swap.to).toBe(deployedContract(chain.chainId,"UniversalRouter").address);
    expect(swap.value).toBe(chain.wrappedNative?"100":"0");
    const decoded = new Interface(["function execute(bytes,bytes[],uint256) payable"]).decodeFunctionData("execute",swap.data);
    expect(String(decoded[0]).startsWith(chain.wrappedNative?"0x0b":"0x00")).toBe(true);
    const min = AbiCoder.defaultAbiCoder().decode(["address","address","uint256"],decoded[1].at(-1));
    expect(min[2]).toBe(198n);
    if (!chain.wrappedNative) {
      expect(batch.atomicRequired).toBe(true);
      const approve = new Interface(["function approve(address,uint256)"]).decodeFunctionData("approve",batch.transactions[0].data);
      expect(approve[0]).toBe(deployedContract(chain.chainId,"UniversalRouter").address);
    }
    expect(()=>validateTopazQuote({...q,chainId:97},request)).toThrow(/chain/);
    expect(()=>encodeTopazSwap({...q,chainId:97},{...request,recipient:payer},12345)).toThrow(/chain/);
  });
});
