import { describe, it, expect } from "vitest";
import { findToken, TOKENS } from "./tokens.js";

describe("findToken", () => {
  it("looks up by exact symbol", () => {
    // #given known canonical symbols
    // #when finding by uppercase symbol
    // #then returns the canonical TokenMeta
    expect(findToken("TOPAZ")?.address).toBe(TOKENS.TOPAZ.address);
    expect(findToken("WBNB")?.symbol).toBe("WBNB");
    expect(findToken("USD1")?.symbol).toBe("USD1");
    expect(findToken("FDUSD")?.symbol).toBe("FDUSD");
  });

  it("symbol lookup is case-insensitive", () => {
    expect(findToken("topaz")?.symbol).toBe("TOPAZ");
    expect(findToken("Topaz")?.symbol).toBe("TOPAZ");
    expect(findToken("USDT")?.symbol).toBe("USDT");
    expect(findToken("usdt")?.symbol).toBe("USDT");
    expect(findToken("sol")?.symbol).toBe("SOL");
  });

  it("resolves the BNB alias to WBNB", () => {
    // #given BNB is the native gas asset and not a real ERC20
    // #when a caller passes "BNB"
    // #then findToken returns the WBNB metadata so router builders can
    //       substitute WBNB and the wrap helpers (`unwrapWETH9`) take over
    expect(findToken("BNB")?.address).toBe(TOKENS.WBNB.address);
    expect(findToken("bnb")?.symbol).toBe("WBNB");
  });

  it("resolves the $RISE / RISE alias", () => {
    // #given $RISE has a leading $ in its on-chain symbol
    // #when a caller passes RISE without the prefix
    // #then findToken still returns the same token
    expect(findToken("$RISE")?.address).toBe(TOKENS.RISE.address);
    expect(findToken("RISE")?.address).toBe(TOKENS.RISE.address);
  });

  it("recognizes SOL at the correct address (regression: was mislabeled WETH)", () => {
    // #given the pre-2.3.1 skill mislabeled 0x570A5D…F as WETH; it is actually
    //       Binance-Peg SOLANA (verified against the v3 subgraph + BscScan)
    // #when an agent looks up SOL by symbol or by address
    // #then the lookup returns SOL, not the old WETH stub
    const byAddr = findToken("0x570A5D26f7765Ecb712C0924E4De545B89fD43dF");
    expect(byAddr?.symbol).toBe("SOL");
    expect(byAddr?.name).toBe("SOLANA");
    expect(findToken("SOL")?.address.toLowerCase()).toBe(
      "0x570a5d26f7765ecb712c0924e4de545b89fd43df",
    );
    expect(findToken("WETH")).toBeUndefined();
  });

  it("recognizes USD1 at the correct address (regression: was mislabeled EGB)", () => {
    // #given the pre-2.3.1 skill mislabeled 0x8d0D000…d as EGB; it is actually
    //       World Liberty Financial USD (verified against the v3 subgraph)
    // #when an agent looks up USD1 or the address
    // #then the lookup returns USD1, not the old EGB stub
    const byAddr = findToken("0x8d0D000Ee44948FC98c9B98A4FA4921476f08B0d");
    expect(byAddr?.symbol).toBe("USD1");
    expect(byAddr?.name).toBe("World Liberty Financial USD");
    expect(findToken("EGB")).toBeUndefined();
  });

  it("captures DOGE's 8 decimals (BSC quirk)", () => {
    // #given DOGE on BSC is 8 decimals while almost everything else is 18
    // #when reading TOKENS.DOGE
    // #then decimals is 8 so `parseUnits(amount, decimals)` is correct
    expect(TOKENS.DOGE.decimals).toBe(8);
    expect(findToken("DOGE")?.decimals).toBe(8);
  });

  it("captures BLUE's 9 decimals", () => {
    expect(TOKENS.BLUE.decimals).toBe(9);
    expect(findToken("BLUE")?.decimals).toBe(9);
  });

  it("looks up by checksummed address", () => {
    expect(findToken(TOKENS.TOPAZ.address)?.symbol).toBe("TOPAZ");
    expect(findToken(TOKENS.WBNB.address)?.symbol).toBe("WBNB");
    expect(findToken(TOKENS.SOL.address)?.symbol).toBe("SOL");
  });

  it("looks up by lowercase address", () => {
    expect(findToken(TOKENS.TOPAZ.address.toLowerCase())?.symbol).toBe("TOPAZ");
    expect(findToken(TOKENS.USDT.address.toLowerCase())?.symbol).toBe("USDT");
    expect(findToken(TOKENS.USD1.address.toLowerCase())?.symbol).toBe("USD1");
  });

  it("trims whitespace", () => {
    expect(findToken("  topaz  ")?.symbol).toBe("TOPAZ");
  });

  it("returns undefined for unknown queries", () => {
    expect(findToken("DOES_NOT_EXIST")).toBeUndefined();
    expect(findToken("0x0000000000000000000000000000000000000000")).toBeUndefined();
  });
});
