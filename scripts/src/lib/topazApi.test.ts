import { afterEach, describe, expect, it, vi } from "vitest";
import { TopazApiRequestError, chainQualified, fetchV1, fetchV1Pages, v1Url } from "./topazApi.js";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

afterEach(() => vi.unstubAllGlobals());

describe("v1Url", () => {
  it("prefixes /v1, joins array filters with commas and drops empty values", () => {
    const url = new URL(v1Url("/pools", { chainIds: [56, 8453], limit: 5, curated: true, q: "", cursor: undefined, token: null }));
    expect(url.pathname).toBe("/v1/pools");
    expect(url.searchParams.get("chainIds")).toBe("56,8453");
    expect(url.searchParams.get("limit")).toBe("5");
    expect(url.searchParams.get("curated")).toBe("true");
    expect(url.searchParams.has("q")).toBe(false);
    expect(url.searchParams.has("cursor")).toBe(false);
    expect(url.searchParams.has("token")).toBe(false);
  });
  it("accepts an explicit /v1 path once and rejects full URLs or relative paths", () => {
    expect(new URL(v1Url("/v1/chains")).pathname).toBe("/v1/chains");
    expect(() => v1Url("https://api.topazdex.com/v1/chains")).toThrow(/route path/);
    expect(() => v1Url("chains")).toThrow(/start with/);
  });
  it("formats chain-qualified token identities in lowercase", () => {
    expect(chainQualified(56, "0xDF002282C1474C9592780618ADDA7EAA99998ABD")).toBe("56:0xdf002282c1474c9592780618adda7eaa99998abd");
    expect(() => chainQualified(0, "0xdf002282c1474c9592780618adda7eaa99998abd")).toThrow(/chainId/);
    expect(() => chainQualified(56, "0x1234")).toThrow(/address/);
  });
});

describe("fetchV1", () => {
  it("returns the envelope untouched on success", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ ok: true, data: { a: 1 }, meta: { generatedAt: "t" } }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await fetchV1<{ a: number }>("/protocol", { chainIds: "all" });
    expect(res.data.a).toBe(1);
    expect(res.meta.generatedAt).toBe("t");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain("/v1/protocol?chainIds=all");
  });
  it("throws a typed error carrying the API error code and HTTP status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ ok: false, error: { code: "market_not_found", message: "nope" } }, 404)));
    const err = await fetchV1("/pools/56/0x0000000000000000000000000000000000000001").catch((e) => e);
    expect(err).toBeInstanceOf(TopazApiRequestError);
    expect(err.code).toBe("market_not_found");
    expect(err.status).toBe(404);
  });
  it("surfaces gateway HTML instead of a JSON parse error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>502</html>", { status: 502 })));
    const err = await fetchV1("/health").catch((e) => e);
    expect(err).toBeInstanceOf(TopazApiRequestError);
    expect(err.code).toBe("non_json_response");
    expect(err.status).toBe(502);
  });
});

describe("fetchV1Pages", () => {
  it("follows nextCursor with unchanged filters and stops when hasNextPage is false", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ ok: true, data: [1, 2], meta: { first: true }, pageInfo: { hasNextPage: true, nextCursor: "c2" } }))
      .mockResolvedValueOnce(json({ ok: true, data: [3], meta: { first: false }, pageInfo: { hasNextPage: false, nextCursor: null } }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await fetchV1Pages<number>("/gauges", { chainIds: 56, limit: 2 });
    expect(res.data).toEqual([1, 2, 3]);
    expect(res.pages).toBe(2);
    expect(res.meta.first).toBe(true);
    const second = new URL(String(fetchMock.mock.calls[1][0]));
    expect(second.searchParams.get("cursor")).toBe("c2");
    expect(second.searchParams.get("chainIds")).toBe("56");
  });
  it("respects maxPages and rejects non-list routes", async () => {
    const page = { ok: true, data: [1], meta: {}, pageInfo: { hasNextPage: true, nextCursor: "next" } };
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => json(page)));
    expect((await fetchV1Pages("/votes", {}, { maxPages: 3 })).pages).toBe(3);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ ok: true, data: { not: "a list" }, meta: {} })));
    await expect(fetchV1Pages("/protocol")).rejects.toThrow(/paginated list/);
  });
});
