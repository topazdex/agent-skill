import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildBestSwapTx } from "./txBuilders.js";
import { buildTopazSwapBatch } from "./topazSwap.js";
import { TOPAZ_WBNB } from "./topazRouting.js";
vi.mock("./erc20.js", () => ({
  getDecimals: vi.fn(async () => 18),
  allowance: vi.fn(async () => 0n),
}));
vi.mock("./topazSwap.js", () => ({
  buildTopazSwapBatch: vi.fn(async (args) => ({ ...args, transactions: [] })),
}));
const OUT = "0xdf002282C1474C9592780618Adda7EaA99998Abd";
const recipient = "0x1111111111111111111111111111111111111111";
beforeEach(() => vi.clearAllMocks());
describe("default SDK swap builder", () => {
  it("parses human units and keeps WBNB as ERC20 by default", async () => {
    await buildBestSwapTx({
      tokenIn: TOPAZ_WBNB,
      tokenOut: OUT,
      amountIn: "0.5",
      recipient,
    });
    expect(buildTopazSwapBatch).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenIn: TOPAZ_WBNB,
        tokenOut: OUT,
        amountIn: 500000000000000000n,
        payer: recipient,
        recipient,
        slippageBps: 100,
      }),
    );
  });
  it("uses native BNB only when explicit and preserves raw bigint units", async () => {
    await buildBestSwapTx({
      tokenIn: TOPAZ_WBNB,
      tokenOut: OUT,
      amountIn: 100n,
      recipient,
      useBnb: true,
    });
    expect(buildTopazSwapBatch).toHaveBeenCalledWith(
      expect.objectContaining({ tokenIn: "BNB", amountIn: 100n }),
    );
  });
});
