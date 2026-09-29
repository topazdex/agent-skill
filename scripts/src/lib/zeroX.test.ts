import { describe, expect, it } from "vitest";
import { Interface, getAddress } from "ethers";
import { ALLOWANCE_HOLDER, findSplit, validateFirmQuote, type ZeroXQuote } from "./zeroX.js";

const SELL = getAddress("0x55d398326f99059fF775485246999027B3197955");
const BUY = getAddress("0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c");
const SETTLER = getAddress("0x" + "5e".repeat(20));
const OLD_SETTLER = getAddress("0x" + "4e".repeat(20));
const SELL_AMOUNT = 100n * 10n ** 18n;
const ah = new Interface(["function exec(address,address,uint256,address,bytes)"]);

function quote(overrides: Partial<ZeroXQuote> = {}, exec: [string, string, bigint, string] = [SETTLER, SELL, SELL_AMOUNT, SETTLER]): ZeroXQuote {
  return {
    liquidityAvailable: true,
    sellToken: SELL.toLowerCase(),
    buyToken: BUY.toLowerCase(),
    sellAmount: SELL_AMOUNT.toString(),
    buyAmount: "130000000000000000",
    minBuyAmount: "128700000000000000",
    allowanceTarget: ALLOWANCE_HOLDER.toLowerCase(),
    transaction: { to: ALLOWANCE_HOLDER, data: ah.encodeFunctionData("exec", [...exec, "0x" + "ab".repeat(40)]), value: "0" },
    issues: { simulationIncomplete: false, invalidSourcesPassed: [], allowance: { spender: ALLOWANCE_HOLDER } },
    tokenMetadata: { buyToken: { buyTaxBps: "0", sellTaxBps: "0", transferTaxBps: null }, sellToken: { buyTaxBps: "0", sellTaxBps: "0" } },
    fees: {
      integratorFee: { amount: "600000000000000000", token: SELL.toLowerCase(), type: "volume" },
      integratorFees: [{ amount: "600000000000000000", token: SELL.toLowerCase(), type: "volume" }],
      zeroExFee: { amount: "150000000000000000", token: SELL.toLowerCase(), type: "volume" },
      gasFee: null,
    },
    zid: "0x1",
    ...overrides,
  };
}
const ctx = { sellToken: SELL, buyToken: BUY, sellAmount: SELL_AMOUNT, currentSettler: SETTLER, previousSettler: OLD_SETTLER };

describe("validateFirmQuote", () => {
  it("accepts a quote with Topaz and 0x fees charged in the sell token", () => {
    const leg = validateFirmQuote(quote(), ctx);
    expect(leg.minBuyAmount).toBe(128700000000000000n);
    expect(leg.fees.map((f) => [f.kind, f.amount])).toEqual([["integratorFee", 6n * 10n ** 17n], ["zeroExFee", 15n * 10n ** 16n]]);
  });

  it("accepts fees charged in the buy token, capped against the gross buy amount", () => {
    const net = 755_671_375_230_928_911_625n;
    const q = quote({
      buyAmount: net.toString(),
      minBuyAmount: (net - net / 100n).toString(),
      fees: {
        integratorFee: { amount: "4568290429607630702", token: BUY },
        zeroExFee: { amount: "1142072607401907676", token: BUY },
      },
    });
    expect(validateFirmQuote(q, ctx).fees).toHaveLength(2);
  });

  it("rejects a fee above its cap", () => {
    const q = quote({ fees: { integratorFee: { amount: "700000000000000000", token: SELL } } });
    expect(() => validateFirmQuote(q, ctx)).toThrow(/Unexpected 0x integratorFee/);
  });

  it("rejects a fee in an unrelated token or of an unknown kind", () => {
    expect(() => validateFirmQuote(quote({ fees: { zeroExFee: { amount: "1", token: SETTLER } } }), ctx)).toThrow(/unrelated token/);
    expect(() => validateFirmQuote(quote({ fees: { surpriseFee: { amount: "1", token: SELL } } }), ctx)).toThrow(/surpriseFee/);
  });

  it("rejects a quote that does not match the request", () => {
    expect(() => validateFirmQuote(quote({ sellAmount: "1" }), ctx)).toThrow(/do not match/);
    expect(() => validateFirmQuote(quote({ liquidityAvailable: false }), ctx)).toThrow(/do not match/);
    expect(() => validateFirmQuote(quote({ minBuyAmount: undefined }), ctx)).toThrow(/do not match/);
  });

  it("rejects a non-AllowanceHolder entry point or native value", () => {
    const q = quote();
    expect(() => validateFirmQuote({ ...q, transaction: { ...q.transaction!, to: SETTLER } }, ctx)).toThrow(/entry point/);
    expect(() => validateFirmQuote({ ...q, transaction: { ...q.transaction!, value: "1" } }, ctx)).toThrow(/native value/);
  });

  it("rejects incomplete simulation and taxed tokens", () => {
    expect(() => validateFirmQuote(quote({ issues: { simulationIncomplete: true } }), ctx)).toThrow(/simulation/);
    expect(() => validateFirmQuote(quote({ tokenMetadata: { buyToken: { buyTaxBps: "100" } } }), ctx)).toThrow(/Taxed/);
  });

  it("accepts the previous Settler but not an unregistered one", () => {
    expect(() => validateFirmQuote(quote({}, [OLD_SETTLER, SELL, SELL_AMOUNT, OLD_SETTLER]), ctx)).not.toThrow();
    const rogue = getAddress("0x" + "66".repeat(20));
    expect(() => validateFirmQuote(quote({}, [rogue, SELL, SELL_AMOUNT, rogue]), ctx)).toThrow(/unregistered Settler/);
    expect(() => validateFirmQuote(quote({}, [SETTLER, SELL, SELL_AMOUNT - 1n, SETTLER]), ctx)).toThrow(/envelope/);
  });
});

describe("findSplit", () => {
  const T0 = getAddress("0x" + "01".repeat(20));
  const T1 = getAddress("0x" + "02".repeat(20));
  const IN = getAddress("0x" + "03".repeat(20));
  const linear = (c0: bigint | null, c1: bigint | null) => (a0: bigint, a1: bigint): [bigint | null, bigint | null] =>
    [c0 === null ? null : a0 * c0, c1 === null ? null : a1 * c1];

  it("splits evenly when rates and capacities are equal", async () => {
    const split = await findSplit({ input: IN, token0: T0, token1: T1, amountIn: 1000n, capacity: linear(1n, 1n), quote: async (_b, a) => a });
    expect(split).toEqual({ toToken0: 500n, toToken1: 500n });
  });

  it("balances the filled capacity when one token is worth more", async () => {
    // One input buys 2 token0 or 1 token1; the target needs equal token0 and token1 units.
    const quoteFn = async (buy: string, a: bigint) => (buy === T0 ? 2n * a : a);
    const { toToken0, toToken1 } = await findSplit({ input: IN, token0: T0, token1: T1, amountIn: 3000n, capacity: linear(1n, 1n), quote: quoteFn });
    expect([toToken0, toToken1]).toEqual([1000n, 2000n]);
    expect(2n * toToken0).toBe(toToken1);
  });

  it("puts everything on one side when the target takes only that token", async () => {
    const noQuote = async () => { throw new Error("should not quote"); };
    expect(await findSplit({ input: IN, token0: T0, token1: T1, amountIn: 9n, capacity: linear(1n, null), quote: noQuote }))
      .toEqual({ toToken0: 9n, toToken1: 0n });
    expect(await findSplit({ input: IN, token0: T0, token1: T1, amountIn: 9n, capacity: linear(0n, 1n), quote: noQuote }))
      .toEqual({ toToken0: 0n, toToken1: 9n });
  });

  it("does not quote the input token against itself", async () => {
    const quoted: string[] = [];
    await findSplit({ input: T0, token0: T0, token1: T1, amountIn: 100n, capacity: linear(1n, 1n), quote: async (b, a) => { quoted.push(b); return a; } });
    expect(quoted).toEqual([T1]);
  });
});
