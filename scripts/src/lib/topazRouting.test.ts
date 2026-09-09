import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchTopazQuote,
  validateTopazQuote,
  TOPAZ_WBNB,
  MAX_PERMIT2_AMOUNT,
  type TopazQuoteRequest,
} from "./topazRouting.js";

const out = "0xdf002282C1474C9592780618Adda7EaA99998Abd";
const intermediate = "0x55d398326f99059fF775485246999027B3197955";
const request: TopazQuoteRequest = {
  tokenIn: TOPAZ_WBNB,
  tokenOut: out,
  amountIn: 100n,
  slippageBps: 100,
};
function fixture() {
  return {
    blockNumber: 123,
    tradeType: "exactIn",
    amount: "100",
    quote: "200",
    minimumAmountOut: "198",
    slippageBips: 100,
    routes: [
      {
        protocol: "MIXED",
        percent: 100,
        amountIn: "100",
        amountOut: "200",
        hops: [
          {
            protocol: "v2-stable",
            address: intermediate,
            tokenIn: TOPAZ_WBNB,
            tokenOut: intermediate,
          },
          {
            protocol: "cl",
            address: out,
            tokenIn: intermediate,
            tokenOut: out,
            tickSpacing: 50,
          },
        ],
      },
    ],
  };
}
afterEach(() => vi.unstubAllGlobals());
describe("Topaz API wire validation", () => {
  it("accepts mixed routes and split totals", () => {
    const q = fixture();
    q.routes[0].percent = 50;
    q.routes[0].amountIn = "50";
    q.routes[0].amountOut = "100";
    q.routes.push(structuredClone(q.routes[0]));
    expect(validateTopazQuote(q, request).routes).toHaveLength(2);
  });
  it.each([
    (q: ReturnType<typeof fixture>) => {
      q.tradeType = "exactOut";
    },
    (q: ReturnType<typeof fixture>) => {
      q.amount = "101";
    },
    (q: ReturnType<typeof fixture>) => {
      q.slippageBips = 500;
    },
    (q: ReturnType<typeof fixture>) => {
      q.minimumAmountOut = "0";
    },
    (q: ReturnType<typeof fixture>) => {
      q.minimumAmountOut = "197";
    },
    (q: ReturnType<typeof fixture>) => {
      q.minimumAmountOut = "201";
    },
    (q: ReturnType<typeof fixture>) => {
      q.routes[0].amountIn = "99";
    },
    (q: ReturnType<typeof fixture>) => {
      q.routes[0].hops[1].tokenIn = out;
    },
    (q: ReturnType<typeof fixture>) => {
      q.routes[0].hops[1].tokenOut = TOPAZ_WBNB;
    },
    (q: ReturnType<typeof fixture>) => {
      q.routes[0].hops[1].protocol = "permit2";
    },
    (q: ReturnType<typeof fixture>) => {
      q.routes[0].hops[1].tickSpacing = 0;
    },
  ])("rejects malformed or mismatched route data", (mutate) => {
    const q = fixture();
    mutate(q);
    expect(() => validateTopazQuote(q, request)).toThrow();
  });
  it("requests fresh signature-free batch quotes", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => fixture() });
    vi.stubGlobal("fetch", fetchMock);
    expect((await fetchTopazQuote(request)).quote).toBe("200");
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toMatchObject({
      type: "exactIn",
      amount: "100",
      permitGrantedInBatch: true,
      skipCache: true,
    });
    expect(body).not.toHaveProperty("permit");
  });
  it("fails closed on outage and invalid inputs", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 503 }),
    );
    await expect(fetchTopazQuote(request)).rejects.toThrow("503");
    for (const amountIn of [0n, -1n, MAX_PERMIT2_AMOUNT + 1n])
      await expect(fetchTopazQuote({ ...request, amountIn })).rejects.toThrow(
        "uint160",
      );
    await expect(
      fetchTopazQuote({ ...request, slippageBps: 501 }),
    ).rejects.toThrow();
    await expect(
      fetchTopazQuote({ ...request, tokenOut: TOPAZ_WBNB }),
    ).rejects.toThrow("must differ");
  });
});
