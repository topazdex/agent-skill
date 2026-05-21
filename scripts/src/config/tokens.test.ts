import { describe, it, expect } from "vitest";
import { findToken, TOKENS } from "./tokens.js";

describe("findToken", () => {
  it("looks up by exact symbol", () => {
    expect(findToken("TOPAZ")?.address).toBe(TOKENS.TOPAZ.address);
    expect(findToken("WBNB")?.symbol).toBe("WBNB");
  });

  it("symbol lookup is case-insensitive", () => {
    expect(findToken("topaz")?.symbol).toBe("TOPAZ");
    expect(findToken("Topaz")?.symbol).toBe("TOPAZ");
    expect(findToken("USDT")?.symbol).toBe("USDT");
    expect(findToken("usdt")?.symbol).toBe("USDT");
  });

  it("looks up by checksummed address", () => {
    expect(findToken(TOKENS.TOPAZ.address)?.symbol).toBe("TOPAZ");
    expect(findToken(TOKENS.WBNB.address)?.symbol).toBe("WBNB");
  });

  it("looks up by lowercase address", () => {
    expect(findToken(TOKENS.TOPAZ.address.toLowerCase())?.symbol).toBe("TOPAZ");
    expect(findToken(TOKENS.USDT.address.toLowerCase())?.symbol).toBe("USDT");
  });

  it("trims whitespace", () => {
    expect(findToken("  topaz  ")?.symbol).toBe("TOPAZ");
  });

  it("returns undefined for unknown queries", () => {
    expect(findToken("DOES_NOT_EXIST")).toBeUndefined();
    expect(findToken("0x0000000000000000000000000000000000000000")).toBeUndefined();
  });
});
