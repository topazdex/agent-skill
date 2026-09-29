import { describe, expect, it } from "vitest";
import { makeError } from "ethers";
import { decodeRevert, describeError } from "./revertReason.js";

const callException = (data: string) =>
  makeError("execution reverted (unknown custom error)", "CALL_EXCEPTION", {
    action: "estimateGas", data, reason: null, transaction: { to: null, data: "0x" }, invocation: null, revert: null,
  });

describe("revert decoding", () => {
  it("names custom errors from any bundled ABI", () => {
    expect(decodeRevert(callException("0x7c9a1cf9"))).toBe("AlreadyVoted()"); // VotingEscrow
    expect(decodeRevert(callException("0xa932492f"))).toBe("K()"); // v2 Pool invariant
    expect(describeError(callException("0x8f66ec14"))).toBe("execution reverted — InsufficientAmountA()");
  });

  it("finds revert data nested in provider errors", () => {
    const nested = { shortMessage: "missing revert data", info: { error: { data: "0x69a21f2a" } } };
    expect(decodeRevert(nested)).toBe("PermanentLock()");
  });

  it("keeps require-string reasons and plain errors readable", () => {
    const withReason = makeError("execution reverted", "CALL_EXCEPTION", {
      action: "estimateGas", data: "0x08c379a0", reason: "PSC", transaction: { to: null, data: "0x" }, invocation: null, revert: null,
    });
    expect(describeError(withReason)).toBe("execution reverted: PSC");
    expect(describeError(new Error("unknown token"))).toBe("unknown token");
    expect(decodeRevert(callException("0xdeadbeef"))).toBeUndefined();
  });
});
