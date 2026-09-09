import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AbiCoder, Interface } from "ethers";
import { buildTopazSwapBatch } from "./topazSwap.js";
import {
  TOPAZ_PERMIT2,
  TOPAZ_UNIVERSAL_ROUTER,
  TOPAZ_WBNB,
} from "./topazRouting.js";
const OUT = "0xdf002282C1474C9592780618Adda7EaA99998Abd";
const MID = "0x55d398326f99059fF775485246999027B3197955";
const PAYER = "0x1111111111111111111111111111111111111111";
const router = new Interface([
  "function execute(bytes commands,bytes[] inputs,uint256 deadline) payable",
]);
const permit = new Interface([
  "function approve(address token,address spender,uint160 amount,uint48 expiration)",
]);
const erc20 = new Interface([
  "function approve(address spender,uint256 amount) returns(bool)",
]);
const coder = AbiCoder.defaultAbiCoder();
const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockImplementation(async (_url, init) => {
    const req = JSON.parse(init.body);
    return {
      ok: true,
      json: async () => ({
        blockNumber: 123,
        tradeType: "exactIn",
        amount: "100",
        quote: "200",
        minimumAmountOut: "198",
        slippageBips: 100,
        // Deliberately hostile opaque calldata: execution must use validated routes instead.
        methodParameters: { to: MID, calldata: "0xdeadbeef", value: "999" },
        routes: [
          {
            protocol: "MIXED",
            percent: 60,
            amountIn: "60",
            amountOut: "120",
            hops: [
              {
                protocol: "v2-stable",
                address: MID,
                tokenIn: req.tokenIn === "BNB" ? TOPAZ_WBNB : req.tokenIn,
                tokenOut: MID,
              },
              {
                protocol: "cl",
                address: OUT,
                tokenIn: MID,
                tokenOut: req.tokenOut === "BNB" ? TOPAZ_WBNB : req.tokenOut,
                tickSpacing: 50,
              },
            ],
          },
          {
            protocol: "CL",
            percent: 40,
            amountIn: "40",
            amountOut: "80",
            hops: [
              {
                protocol: "cl",
                address: OUT,
                tokenIn: req.tokenIn === "BNB" ? TOPAZ_WBNB : req.tokenIn,
                tokenOut: req.tokenOut === "BNB" ? TOPAZ_WBNB : req.tokenOut,
                tickSpacing: 200,
              },
            ],
          },
        ],
      }),
    };
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
describe("signature-free Topaz swap batch", () => {
  it("returns all grants before a mixed/split swap with a final aggregate minimum", async () => {
    const batch = await buildTopazSwapBatch({
      tokenIn: TOPAZ_WBNB,
      tokenOut: OUT,
      amountIn: 100n,
      payer: PAYER,
    });
    expect(batch.atomicRequired).toBe(true);
    expect(batch.permit2SignatureRequired).toBe(false);
    const tx = batch.transactions;
    expect(tx).toHaveLength(6);
    expect(permit.decodeFunctionData("approve", tx[4].data).amount).toBe(0n);
    expect(erc20.decodeFunctionData("approve", tx[5].data).amount).toBe(0n);
    expect(erc20.decodeFunctionData("approve", tx[0].data).amount).toBe(0n);
    expect(erc20.decodeFunctionData("approve", tx[1].data).amount).toBe(100n);
    expect(tx[1].to).toBe(TOPAZ_WBNB);
    expect(tx[2].to).toBe(TOPAZ_PERMIT2);
    const grant = permit.decodeFunctionData("approve", tx[2].data);
    expect(grant.spender).toBe(TOPAZ_UNIVERSAL_ROUTER);
    expect(grant.expiration).toBe(BigInt(batch.deadline));
    expect(tx[3].to).toBe(TOPAZ_UNIVERSAL_ROUTER);
    expect(tx[3].value).toBe("0");
    const swap = router.decodeFunctionData("execute", tx[3].data);
    expect(swap.commands).toBe("0x08000004");
    const middle = coder.decode(
      ["address", "uint256", "uint256", "bytes", "bool"],
      swap.inputs[1],
    );
    expect(middle[1]).toBe(1n << 255n);
    expect(middle[4]).toBe(false);
    const sweep = coder.decode(
      ["address", "address", "uint256"],
      swap.inputs[3],
    );
    expect(sweep[1]).toBe(PAYER);
    expect(sweep[2]).toBe(198n);
    expect(
      JSON.parse(fetchMock.mock.calls[0][1].body).permitGrantedInBatch,
    ).toBe(true);
  });
  it("uses native value and no allowances for BNB input", async () => {
    const batch = await buildTopazSwapBatch({
      tokenIn: "BNB",
      tokenOut: OUT,
      amountIn: 100n,
      payer: PAYER,
    });
    expect(batch.atomicRequired).toBe(false);
    expect(batch.transactions).toHaveLength(1);
    expect(batch.transactions[0].value).toBe("100");
    const swap = router.decodeFunctionData(
      "execute",
      batch.transactions[0].data,
    );
    expect(swap.commands).toBe("0x0b08000004");
    expect(
      coder.decode(
        [
          "address",
          "uint256",
          "uint256",
          "tuple(address,address,bool)[]",
          "bool",
        ],
        swap.inputs[1],
      )[4],
    ).toBe(false);
  });
  it("unwraps native output to the payer", async () => {
    const batch = await buildTopazSwapBatch({
      tokenIn: OUT,
      tokenOut: "BNB",
      amountIn: 100n,
      payer: PAYER,
    });
    const swap = router.decodeFunctionData(
      "execute",
      batch.transactions[3].data,
    );
    expect(swap.commands).toBe("0x0800000c");
    expect(coder.decode(["address", "uint256"], swap.inputs[3])[0]).toBe(PAYER);
  });
  it("rejects other chains, zero payer and third-party recipients", async () => {
    const request = {
      tokenIn: TOPAZ_WBNB,
      tokenOut: OUT,
      amountIn: 100n,
      payer: PAYER,
    };
    await expect(
      buildTopazSwapBatch({ ...request, chainId: 1 }),
    ).rejects.toThrow();
    await expect(
      buildTopazSwapBatch({
        ...request,
        payer: "0x0000000000000000000000000000000000000000",
      }),
    ).rejects.toThrow();
    await expect(
      buildTopazSwapBatch({ ...request, recipient: MID }),
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
