import { describe, it, expect, vi, beforeEach } from "vitest";
import { Interface, getAddress, ZeroAddress } from "ethers";
import { slip, normalizeAndValidate } from "./txBuilders.js";
import { ADDR } from "../config/addresses.js";
import { TOKENS } from "../config/tokens.js";
import { ABIS } from "./abis.js";

const WBNB = TOKENS.WBNB.address;
const TOPAZ = TOKENS.TOPAZ.address;
const USDT = TOKENS.USDT.address;
const recipient = getAddress("0x000000000000000000000000000000000000dead");

const futureDeadline = () => Math.floor(Date.now() / 1000) + 60 * 20;

describe("slip", () => {
  it("0 bps slippage is a no-op", () => {
    expect(slip(10_000n, 0n)).toBe(10_000n);
    expect(slip(1n, 0n)).toBe(1n);
  });

  it("10000 bps (100%) reduces output to zero", () => {
    expect(slip(10_000n, 10_000n)).toBe(0n);
    expect(slip(1_000_000n, 10_000n)).toBe(0n);
  });

  it("50 bps (0.5%) drops 0.5% of the amount", () => {
    expect(slip(10_000n, 50n)).toBe(9_950n);
    expect(slip(1_000_000n, 50n)).toBe(995_000n);
  });

  it("100 bps (1%) drops 1%", () => {
    expect(slip(10_000n, 100n)).toBe(9_900n);
  });

  it("uses integer-division rounding (floor) so the user is never given more than quoted", () => {
    // 9999n * (10000n - 1n) / 10000n = 99980001 / 10000 = 9998 (floor)
    expect(slip(9_999n, 1n)).toBe(9_998n);
  });

  it("handles realistic wei amounts without precision loss", () => {
    const oneEth = 10n ** 18n;
    expect(slip(oneEth, 50n)).toBe(995n * 10n ** 15n);
  });
});

describe("normalizeAndValidate", () => {
  const baseArgs = {
    tokenIn: WBNB,
    tokenOut: TOPAZ,
    recipient,
    defaultSlippageBps: 100n,
    deadline: futureDeadline(),
  };

  it("checksums tokenIn, tokenOut, recipient, and payer", () => {
    const r = normalizeAndValidate({
      ...baseArgs,
      tokenIn: WBNB.toLowerCase(),
      tokenOut: TOPAZ.toLowerCase(),
      recipient: recipient.toLowerCase(),
      payer: WBNB.toLowerCase(),
    });
    expect(r.tokenIn).toBe(WBNB);
    expect(r.tokenOut).toBe(TOPAZ);
    expect(r.recipient).toBe(recipient);
    expect(r.payer).toBe(WBNB);
  });

  it("rejects self-swap (tokenIn === tokenOut)", () => {
    expect(() =>
      normalizeAndValidate({ ...baseArgs, tokenOut: WBNB }),
    ).toThrow(/tokenIn and tokenOut must differ/);
  });

  it("rejects self-swap regardless of case", () => {
    expect(() =>
      normalizeAndValidate({ ...baseArgs, tokenOut: WBNB.toLowerCase() }),
    ).toThrow(/tokenIn and tokenOut must differ/);
  });

  it("rejects zero recipient", () => {
    expect(() =>
      normalizeAndValidate({ ...baseArgs, recipient: ZeroAddress }),
    ).toThrow(/recipient cannot be the zero address/);
  });

  it("rejects slippage > 10000", () => {
    expect(() =>
      normalizeAndValidate({ ...baseArgs, slippageBps: 10_001n }),
    ).toThrow(/slippageBps must be 0\.\.10000/);
  });

  it("rejects negative slippage", () => {
    expect(() =>
      normalizeAndValidate({ ...baseArgs, slippageBps: -1n }),
    ).toThrow(/slippageBps must be 0/);
  });

  it("accepts boundary slippage values 0 and 10000", () => {
    expect(() => normalizeAndValidate({ ...baseArgs, slippageBps: 0n })).not.toThrow();
    expect(() => normalizeAndValidate({ ...baseArgs, slippageBps: 10_000n })).not.toThrow();
  });

  it("rejects past deadlines", () => {
    expect(() =>
      normalizeAndValidate({ ...baseArgs, deadline: 1 }),
    ).toThrow(/deadline must be in the future/);
  });

  it("rejects malformed addresses", () => {
    expect(() =>
      normalizeAndValidate({ ...baseArgs, tokenIn: "not-an-address" }),
    ).toThrow();
    expect(() =>
      normalizeAndValidate({ ...baseArgs, recipient: "0x123" }),
    ).toThrow();
  });

  it("uses defaultSlippageBps when slippageBps is omitted", () => {
    const r = normalizeAndValidate({ ...baseArgs, defaultSlippageBps: 75n });
    expect(r.slippageBps).toBe(75n);
  });

  it("defaults useBnb to true", () => {
    expect(normalizeAndValidate(baseArgs).useBnb).toBe(true);
    expect(normalizeAndValidate({ ...baseArgs, useBnb: false }).useBnb).toBe(false);
  });
});

// --- buildBestSwapTx calldata shape, with mocked quoters/pool lookups ---
//
// We hijack the read-side modules so no RPC is needed. Each route type (v2, v3-single,
// v3-path) returns a canned `bestQuote` and the builder produces real calldata against
// the real Router / SwapRouter ABIs. We then decode the calldata and assert shape.

vi.mock("../read/quotes.js", async () => {
  const actual = await vi.importActual<typeof import("../read/quotes.js")>("../read/quotes.js");
  return {
    ...actual,
    bestQuote: vi.fn(),
    quoteV2: vi.fn(),
    quoteV2Route: vi.fn(),
    quoteV3Single: vi.fn(),
    quoteV3Path: vi.fn(),
  };
});

vi.mock("../read/pools.js", () => ({
  findV2Pool: vi.fn(),
  findV3Pool: vi.fn(),
  getPool: vi.fn(),
}));

vi.mock("./erc20.js", () => ({
  allowance: vi.fn(async () => 0n),
  getDecimals: vi.fn(async () => 18),
  getSymbol: vi.fn(async () => "MOCK"),
}));

const quotes = await import("../read/quotes.js");
const pools = await import("../read/pools.js");
const erc20 = await import("./erc20.js");
const { buildBestSwapTx } = await import("./txBuilders.js");

const mockBestQuote = vi.mocked(quotes.bestQuote);
const mockQuoteV3Single = vi.mocked(quotes.quoteV3Single);
const mockFindV3Pool = vi.mocked(pools.findV3Pool);
const mockAllowance = vi.mocked(erc20.allowance);

beforeEach(() => {
  vi.clearAllMocks();
  mockAllowance.mockResolvedValue(0n);
});

describe("buildBestSwapTx — calldata shape (mocked quoters)", () => {
  it("produces v3-single calldata against SwapRouter with the right selector and decoded args", async () => {
    const amountIn = 10n ** 18n; // 1 WBNB
    const expectedOut = 5_000n * 10n ** 18n; // 5000 TOPAZ
    mockBestQuote.mockResolvedValue({
      route: "v3 direct ts=200",
      exec: { type: "v3-single", tokenIn: WBNB, tokenOut: TOPAZ, tickSpacing: 200 },
      amountOut: expectedOut,
    });
    mockFindV3Pool.mockResolvedValue("0x1111111111111111111111111111111111111111");
    mockQuoteV3Single.mockResolvedValue(expectedOut);

    const built = await buildBestSwapTx({
      tokenIn: WBNB,
      tokenOut: TOPAZ,
      amountIn,
      recipient,
      slippageBps: 100n,
    });

    expect(built.to).toBe(ADDR.SwapRouter);
    expect(built.expectedOut).toBe(expectedOut);
    expect(built.amountOutMin).toBe(slip(expectedOut, 100n));
    expect(built.value).toBe(amountIn); // useBnb defaults true, tokenIn is WBNB → native value
    expect(built.deadline).toBeGreaterThan(Math.floor(Date.now() / 1000));
    expect(built.quotedAt).toBeGreaterThan(0);

    const iface = new Interface(ABIS.SwapRouter);
    const parsed = iface.parseTransaction({ data: built.data, value: built.value });
    expect(parsed?.name).toBe("exactInputSingle");
    const params = parsed?.args[0];
    expect(params.tokenIn).toBe(WBNB);
    expect(params.tokenOut).toBe(TOPAZ);
    expect(params.tickSpacing).toBe(200n);
    expect(params.recipient).toBe(recipient);
    expect(params.amountIn).toBe(amountIn);
    expect(params.amountOutMinimum).toBe(built.amountOutMin);
  });

  it("omits value (=0) for token→token v3 swaps", async () => {
    const amountIn = 100n * 10n ** 18n;
    const expectedOut = 99n * 10n ** 18n;
    mockBestQuote.mockResolvedValue({
      route: "v3 direct ts=1",
      exec: { type: "v3-single", tokenIn: USDT, tokenOut: TOPAZ, tickSpacing: 1 },
      amountOut: expectedOut,
    });
    mockFindV3Pool.mockResolvedValue("0x2222222222222222222222222222222222222222");
    mockQuoteV3Single.mockResolvedValue(expectedOut);

    const built = await buildBestSwapTx({
      tokenIn: USDT,
      tokenOut: TOPAZ,
      amountIn,
      recipient,
    });

    expect(built.value).toBe(0n);
    expect(built.approval?.token).toBe(USDT);
    expect(built.approval?.spender).toBe(ADDR.SwapRouter);
    expect(built.approval?.amount).toBe(amountIn);
  });

  it("propagates a payer's existing allowance and skips approval when allowance covers amountIn", async () => {
    const amountIn = 100n * 10n ** 18n;
    const expectedOut = 99n * 10n ** 18n;
    mockBestQuote.mockResolvedValue({
      route: "v3 direct ts=1",
      exec: { type: "v3-single", tokenIn: USDT, tokenOut: TOPAZ, tickSpacing: 1 },
      amountOut: expectedOut,
    });
    mockFindV3Pool.mockResolvedValue("0x3333333333333333333333333333333333333333");
    mockQuoteV3Single.mockResolvedValue(expectedOut);
    mockAllowance.mockResolvedValue(2n * amountIn); // payer already approved 2x

    const built = await buildBestSwapTx({
      tokenIn: USDT,
      tokenOut: TOPAZ,
      amountIn,
      recipient,
      payer: recipient,
    });

    expect(built.approval).toBeUndefined();
  });

  it("rejects bad input before calling bestQuote (fails fast)", async () => {
    await expect(
      buildBestSwapTx({
        tokenIn: WBNB,
        tokenOut: WBNB, // self-swap
        amountIn: 1n,
        recipient,
      }),
    ).rejects.toThrow(/tokenIn and tokenOut must differ/);
    expect(mockBestQuote).not.toHaveBeenCalled();
  });
});
