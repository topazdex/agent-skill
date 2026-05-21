import { describe, it, expect, vi, beforeEach } from "vitest";
import { Interface, getAddress, ZeroAddress } from "ethers";
import { slip, normalizeAndValidate, isStale } from "./txBuilders.js";
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
const { buildBestSwapTx, buildV3SwapTx, buildV3PathSwapTx } = await import("./txBuilders.js");

const mockBestQuote = vi.mocked(quotes.bestQuote);
const mockQuoteV3Single = vi.mocked(quotes.quoteV3Single);
const mockQuoteV3Path = vi.mocked(quotes.quoteV3Path);
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

describe("buildV3SwapTx — native-BNB-out", () => {
  // Standard v3 swap-and-unwrap pattern: the SwapRouter is the recipient of
  // exactInputSingle (so it keeps the WBNB), then a follow-up unwrapWETH9 call
  // in the same multicall sends native BNB to the user. amountOutMin is enforced
  // at the unwrap boundary, not in the inner exactInputSingle.
  const amountIn = 100n * 10n ** 18n;
  const expectedOut = 99n * 10n ** 17n; // 9.9 WBNB worth

  it("wraps exactInputSingle + unwrapWETH9 in a multicall when tokenOut is WBNB and useBnb is true (default)", async () => {
    // #given a TOPAZ → WBNB swap with the default useBnb behavior
    mockFindV3Pool.mockResolvedValue("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    mockQuoteV3Single.mockResolvedValue(expectedOut);

    // #when
    const built = await buildV3SwapTx({
      tokenIn: TOPAZ,
      tokenOut: WBNB,
      amountIn,
      tickSpacing: 200,
      recipient,
      slippageBps: 100n,
    });

    // #then the outer call is multicall, value is 0 (no native-BNB-in)
    expect(built.to).toBe(ADDR.SwapRouter);
    expect(built.value).toBe(0n);
    expect(built.amountOutMin).toBe(slip(expectedOut, 100n));
    expect(built.route).toMatch(/unwrap to BNB/);

    const iface = new Interface(ABIS.SwapRouter);
    const outer = iface.parseTransaction({ data: built.data, value: built.value });
    expect(outer?.name).toBe("multicall");

    // and the inner calls are exactInputSingle(recipient=Router, amountOutMinimum=0)
    // followed by unwrapWETH9(amountMinimum=amountOutMin, recipient=user)
    const calls = outer?.args[0] as string[];
    expect(calls).toHaveLength(2);
    const innerInput = iface.parseTransaction({ data: calls[0], value: 0n });
    expect(innerInput?.name).toBe("exactInputSingle");
    expect(innerInput?.args[0].recipient).toBe(ADDR.SwapRouter);
    expect(innerInput?.args[0].amountOutMinimum).toBe(0n);
    const innerUnwrap = iface.parseTransaction({ data: calls[1], value: 0n });
    expect(innerUnwrap?.name).toBe("unwrapWETH9");
    expect(innerUnwrap?.args[0]).toBe(built.amountOutMin);
    expect(innerUnwrap?.args[1]).toBe(recipient);
  });

  it("falls back to plain exactInputSingle when useBnb is false (user explicitly wants WBNB)", async () => {
    // #given useBnb explicitly disabled
    mockFindV3Pool.mockResolvedValue("0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
    mockQuoteV3Single.mockResolvedValue(expectedOut);

    // #when
    const built = await buildV3SwapTx({
      tokenIn: TOPAZ,
      tokenOut: WBNB,
      amountIn,
      tickSpacing: 200,
      recipient,
      useBnb: false,
    });

    // #then no multicall wrapper, recipient is the user directly
    const iface = new Interface(ABIS.SwapRouter);
    const outer = iface.parseTransaction({ data: built.data, value: built.value });
    expect(outer?.name).toBe("exactInputSingle");
    expect(outer?.args[0].recipient).toBe(recipient);
    expect(outer?.args[0].amountOutMinimum).toBe(built.amountOutMin);
    expect(built.route).not.toMatch(/unwrap/);
  });

  it("still propagates approval for the input token (unwrap doesn't change input approval)", async () => {
    // #given
    mockFindV3Pool.mockResolvedValue("0xcccccccccccccccccccccccccccccccccccccccc");
    mockQuoteV3Single.mockResolvedValue(expectedOut);
    mockAllowance.mockResolvedValue(0n);

    // #when
    const built = await buildV3SwapTx({
      tokenIn: TOPAZ,
      tokenOut: WBNB,
      amountIn,
      tickSpacing: 200,
      recipient,
      payer: recipient,
    });

    // #then approval still required for TOPAZ
    expect(built.approval).toEqual({
      token: TOPAZ,
      spender: ADDR.SwapRouter,
      amount: amountIn,
    });
  });
});

describe("buildV3PathSwapTx — native-BNB-out", () => {
  const amountIn = 100n * 10n ** 18n;
  const expectedOut = 1n * 10n ** 18n;

  it("wraps exactInput + unwrapWETH9 in a multicall when the path ends in WBNB", async () => {
    // #given a TOPAZ → USDT → WBNB v3 path
    mockQuoteV3Path.mockResolvedValue(expectedOut);

    // #when
    const built = await buildV3PathSwapTx({
      tokens: [TOPAZ, USDT, WBNB],
      spacings: [1, 200],
      amountIn,
      recipient,
      slippageBps: 150n,
    });

    // #then
    expect(built.to).toBe(ADDR.SwapRouter);
    expect(built.value).toBe(0n);
    expect(built.amountOutMin).toBe(slip(expectedOut, 150n));
    expect(built.route).toMatch(/unwrap to BNB/);

    const iface = new Interface(ABIS.SwapRouter);
    const outer = iface.parseTransaction({ data: built.data, value: built.value });
    expect(outer?.name).toBe("multicall");
    const calls = outer?.args[0] as string[];
    expect(calls).toHaveLength(2);
    const innerInput = iface.parseTransaction({ data: calls[0], value: 0n });
    expect(innerInput?.name).toBe("exactInput");
    expect(innerInput?.args[0].recipient).toBe(ADDR.SwapRouter);
    expect(innerInput?.args[0].amountOutMinimum).toBe(0n);
    const innerUnwrap = iface.parseTransaction({ data: calls[1], value: 0n });
    expect(innerUnwrap?.name).toBe("unwrapWETH9");
    expect(innerUnwrap?.args[0]).toBe(built.amountOutMin);
  });

  it("falls back to plain exactInput when useBnb is false", async () => {
    // #given a path that ends in WBNB but the caller wants WBNB output, not native
    mockQuoteV3Path.mockResolvedValue(expectedOut);

    // #when
    const built = await buildV3PathSwapTx({
      tokens: [TOPAZ, USDT, WBNB],
      spacings: [1, 200],
      amountIn,
      recipient,
      useBnb: false,
    });

    // #then
    const iface = new Interface(ABIS.SwapRouter);
    const outer = iface.parseTransaction({ data: built.data, value: built.value });
    expect(outer?.name).toBe("exactInput");
    expect(outer?.args[0].recipient).toBe(recipient);
    expect(outer?.args[0].amountOutMinimum).toBe(built.amountOutMin);
    expect(built.route).not.toMatch(/unwrap/);
  });
});

describe("isStale", () => {
  const t0 = 1_000_000;

  it("treats a freshly built tx as not stale", () => {
    // #given
    const tx = { quotedAt: t0, deadline: t0 + 1200 };

    // #when checking immediately
    const result = isStale(tx, 30, t0);

    // #then
    expect(result).toBe(false);
  });

  it("treats a tx aged exactly maxAgeSeconds as not stale (boundary)", () => {
    // #given a 30-second window
    const tx = { quotedAt: t0, deadline: t0 + 1200 };

    // #when exactly at the boundary
    const result = isStale(tx, 30, t0 + 30);

    // #then it is not stale (strict greater-than)
    expect(result).toBe(false);
  });

  it("treats a tx older than maxAgeSeconds as stale", () => {
    // #given
    const tx = { quotedAt: t0, deadline: t0 + 1200 };

    // #when checked 31 seconds later with default 30s window
    const result = isStale(tx, 30, t0 + 31);

    // #then
    expect(result).toBe(true);
  });

  it("respects a custom maxAgeSeconds", () => {
    // #given a 60-second window
    const tx = { quotedAt: t0, deadline: t0 + 1200 };

    // #when 45 seconds in
    const result = isStale(tx, 60, t0 + 45);

    // #then still fresh under the wider window
    expect(result).toBe(false);
  });

  it("treats a tx whose deadline has passed as stale even if the quote is fresh", () => {
    // #given a tx whose quote is brand-new but deadline already expired
    const tx = { quotedAt: t0 + 10, deadline: t0 + 5 };

    // #when checked at t0+15 (only 5s after quotedAt, but past deadline)
    const result = isStale(tx, 30, t0 + 15);

    // #then
    expect(result).toBe(true);
  });

  it("treats a tx whose deadline equals now as stale (strict)", () => {
    // #given
    const tx = { quotedAt: t0, deadline: t0 + 100 };

    // #when checked exactly at the deadline
    const result = isStale(tx, 30, t0 + 100);

    // #then deadline is passed-by-equality (deadline <= now is stale)
    expect(result).toBe(true);
  });

  it("clamps negative maxAgeSeconds to 0", () => {
    // #given a freshly built tx
    const tx = { quotedAt: t0, deadline: t0 + 1200 };

    // #when checked with a nonsense negative window
    const result = isStale(tx, -5, t0);

    // #then the window is clamped to 0 — same-second is still fresh
    expect(result).toBe(false);
  });

  it("returns true on any age when maxAgeSeconds=0 and any time has passed", () => {
    // #given
    const tx = { quotedAt: t0, deadline: t0 + 1200 };

    // #when checked 1 second after quotedAt
    const result = isStale(tx, 0, t0 + 1);

    // #then
    expect(result).toBe(true);
  });
});
