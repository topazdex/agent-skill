import { describe, it, expect } from "vitest";
import { getAddress } from "ethers";
import { encodePath, encodeMixedPath, decodePath, V2_VOLATILE, V2_STABLE } from "./path.js";
import { TOKENS } from "../config/tokens.js";

const WBNB = TOKENS.WBNB.address;
const TOPAZ = TOKENS.TOPAZ.address;
const USDT = TOKENS.USDT.address;

describe("encodePath / decodePath", () => {
  it("round-trips a 2-hop v3 path", () => {
    const tokens = [WBNB, TOPAZ];
    const spacings = [200];
    const hex = encodePath(tokens, spacings);
    expect(hex).toHaveLength(2 + 20 * 2 * 2 + 3 * 2); // 0x + 20-byte tokens + 3-byte spacing
    const decoded = decodePath(hex);
    expect(decoded.tokens).toEqual(tokens.map(getAddress));
    expect(decoded.spacings).toEqual(spacings);
  });

  it("round-trips a 3-hop v3 path", () => {
    const tokens = [WBNB, USDT, TOPAZ];
    const spacings = [100, 200];
    const hex = encodePath(tokens, spacings);
    const decoded = decodePath(hex);
    expect(decoded.tokens).toEqual(tokens.map(getAddress));
    expect(decoded.spacings).toEqual(spacings);
  });

  it("rejects mismatched lengths", () => {
    expect(() => encodePath([WBNB, USDT, TOPAZ], [200])).toThrow(/bad path/);
    expect(() => encodePath([WBNB], [])).not.toThrow();
    // decodePath rejects bad length (truncated path)
    expect(() => decodePath("0x" + "ab".repeat(21))).toThrow(/bad length/);
  });

  it("encodes the expected hex layout for a fixed input", () => {
    // Golden: WBNB → TOPAZ at tickSpacing 200 should be
    // 0x | <WBNB 20 bytes> | 000000c8 truncated to 3 = 0000c8 | <TOPAZ 20 bytes>
    const hex = encodePath([WBNB, TOPAZ], [200]);
    const expected =
      "0x" +
      WBNB.slice(2).toLowerCase() +
      "0000c8" +
      TOPAZ.slice(2).toLowerCase();
    expect(hex.toLowerCase()).toBe(expected);
  });
});

describe("encodeMixedPath sentinels", () => {
  it("V2_VOLATILE encodes as 0xffffff (24-bit two's complement of -1)", () => {
    const hex = encodeMixedPath([WBNB, TOPAZ], [V2_VOLATILE]);
    expect(hex.toLowerCase()).toContain("ffffff");
    const decoded = decodePath(hex);
    expect(decoded.spacings).toEqual([V2_VOLATILE]);
  });

  it("V2_STABLE encodes as 0xfffffe (24-bit two's complement of -2)", () => {
    const hex = encodeMixedPath([WBNB, TOPAZ], [V2_STABLE]);
    expect(hex.toLowerCase()).toContain("fffffe");
    const decoded = decodePath(hex);
    expect(decoded.spacings).toEqual([V2_STABLE]);
  });

  it("mixes v3 spacing + v2 sentinels in one path", () => {
    const tokens = [TOPAZ, WBNB, USDT];
    const spacings = [200, V2_STABLE];
    const hex = encodeMixedPath(tokens, spacings);
    const decoded = decodePath(hex);
    expect(decoded.tokens).toEqual(tokens.map(getAddress));
    expect(decoded.spacings).toEqual(spacings);
  });
});
