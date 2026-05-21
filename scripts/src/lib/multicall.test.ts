import { describe, it, expect, vi } from "vitest";
import { aggregate3, type MulticallRequest } from "./multicall.js";

const fakeCalls: MulticallRequest[] = [
  { target: "0x" + "1".repeat(40), callData: "0xdeadbeef" },
  { target: "0x" + "2".repeat(40), callData: "0xcafebabe" },
];

const synthSuccess = (n: number): Array<[boolean, string]> =>
  Array.from({ length: n }, (_, i) => [true, `0x${(i + 1).toString(16).padStart(2, "0")}`]);

describe("aggregate3 — retry policy", () => {
  it("returns empty array immediately when no calls are passed (no exec)", async () => {
    // #given
    const exec = vi.fn();

    // #when
    const result = await aggregate3([], { exec });

    // #then
    expect(result).toEqual([]);
    expect(exec).not.toHaveBeenCalled();
  });

  it("succeeds on the first attempt without retrying", async () => {
    // #given
    const exec = vi.fn(async () => synthSuccess(2));

    // #when
    const result = await aggregate3(fakeCalls, { exec, retryBackoffMs: 0 });

    // #then
    expect(exec).toHaveBeenCalledTimes(1);
    expect(result).toEqual([
      { success: true, returnData: "0x01" },
      { success: true, returnData: "0x02" },
    ]);
  });

  it("retries once after a transient error and returns the second result", async () => {
    // #given exec fails once then succeeds
    const exec = vi
      .fn(async (): Promise<Array<[boolean, string]>> => synthSuccess(2))
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockResolvedValueOnce(synthSuccess(2));

    // #when
    const result = await aggregate3(fakeCalls, { exec, retryBackoffMs: 0 });

    // #then
    expect(exec).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(2);
    expect(result[0].success).toBe(true);
  });

  it("propagates the last error when all attempts fail", async () => {
    // #given exec fails every time
    const fatal = new Error("provider 502");
    const exec = vi.fn(async () => {
      throw fatal;
    });

    // #when / #then
    await expect(aggregate3(fakeCalls, { exec, retryBackoffMs: 0 })).rejects.toThrow("provider 502");
    expect(exec).toHaveBeenCalledTimes(2); // default retries=2 (one retry)
  });

  it("disables retry when retries=1 — one attempt then throw", async () => {
    // #given
    const exec = vi.fn(async () => {
      throw new Error("nope");
    });

    // #when / #then
    await expect(aggregate3(fakeCalls, { exec, retries: 1, retryBackoffMs: 0 })).rejects.toThrow("nope");
    expect(exec).toHaveBeenCalledTimes(1);
  });

  it("honors a higher retries cap", async () => {
    // #given exec fails twice then succeeds
    const exec = vi
      .fn(async (): Promise<Array<[boolean, string]>> => synthSuccess(2))
      .mockRejectedValueOnce(new Error("a"))
      .mockRejectedValueOnce(new Error("b"))
      .mockResolvedValueOnce(synthSuccess(2));

    // #when retries=3 (two retries allowed)
    const result = await aggregate3(fakeCalls, { exec, retries: 3, retryBackoffMs: 0 });

    // #then
    expect(exec).toHaveBeenCalledTimes(3);
    expect(result).toHaveLength(2);
  });

  it("passes allowFailure=true by default into the exec payload", async () => {
    // #given
    let captured: Array<{ target: string; allowFailure: boolean; callData: string }> = [];
    const exec = vi.fn(async (formatted: typeof captured) => {
      captured = formatted;
      return synthSuccess(formatted.length);
    });

    // #when one call omits allowFailure
    await aggregate3(
      [
        { target: fakeCalls[0].target, callData: fakeCalls[0].callData }, // implicit
        { target: fakeCalls[1].target, callData: fakeCalls[1].callData, allowFailure: false },
      ],
      { exec, retryBackoffMs: 0 },
    );

    // #then
    expect(captured[0].allowFailure).toBe(true);
    expect(captured[1].allowFailure).toBe(false);
  });
});
