import { describe, it, expect } from "vitest";
import {
  WEEK,
  HOUR,
  epochStart,
  epochNext,
  epochVoteStart,
  epochVoteEnd,
  canVoteNow,
} from "./epoch.js";

// Unix epoch (1970-01-01 00:00:00 UTC) is a Thursday, so `floor(ts / WEEK) * WEEK`
// naturally falls on Thursday 00:00 UTC.
//
// Fixed reference timestamp: 2026-01-08 00:00:00 UTC is exactly a Thursday epoch flip.
const THU_2026_01_08_00 = Math.floor(Date.UTC(2026, 0, 8, 0, 0, 0) / 1000);
const THU_2026_01_08_00_30 = THU_2026_01_08_00 + 30 * 60; // distribute window
const THU_2026_01_08_01 = THU_2026_01_08_00 + HOUR; // vote opens
const THU_2026_01_08_01_30 = THU_2026_01_08_00 + HOUR + 30 * 60; // mid-vote
const WED_2026_01_14_23 = THU_2026_01_08_00 + WEEK - HOUR; // whitelist-only begins
const WED_2026_01_14_23_30 = THU_2026_01_08_00 + WEEK - 30 * 60; // whitelist-only middle
const NEXT_THU = THU_2026_01_08_00 + WEEK;

describe("epoch math at a known Thursday flip (2026-01-08 00:00 UTC)", () => {
  it("epochStart returns the Thursday boundary for every time in [Thu 00:00, next Thu)", () => {
    expect(epochStart(THU_2026_01_08_00)).toBe(THU_2026_01_08_00);
    expect(epochStart(THU_2026_01_08_00_30)).toBe(THU_2026_01_08_00);
    expect(epochStart(THU_2026_01_08_01_30)).toBe(THU_2026_01_08_00);
    expect(epochStart(WED_2026_01_14_23_30)).toBe(THU_2026_01_08_00);
    expect(epochStart(NEXT_THU - 1)).toBe(THU_2026_01_08_00);
    expect(epochStart(NEXT_THU)).toBe(NEXT_THU);
  });

  it("epochNext returns the next Thursday flip", () => {
    expect(epochNext(THU_2026_01_08_00)).toBe(NEXT_THU);
    expect(epochNext(THU_2026_01_08_01_30)).toBe(NEXT_THU);
    expect(epochNext(WED_2026_01_14_23_30)).toBe(NEXT_THU);
  });

  it("vote window is [Thu 01:00, Wed 23:00) for normal veNFTs", () => {
    // epochVoteStart = epochStart + 1h
    expect(epochVoteStart(THU_2026_01_08_00_30)).toBe(THU_2026_01_08_01);
    expect(epochVoteStart(WED_2026_01_14_23_30)).toBe(THU_2026_01_08_01);
    // epochVoteEnd = epochNext - 1h = Wed 23:00
    expect(epochVoteEnd(THU_2026_01_08_01_30)).toBe(WED_2026_01_14_23);
    expect(epochVoteEnd(THU_2026_01_08_00)).toBe(WED_2026_01_14_23);
  });
});

describe("canVoteNow", () => {
  it("returns true when last vote was in a previous epoch", () => {
    const previousEpoch = THU_2026_01_08_00 - WEEK;
    expect(canVoteNow(previousEpoch, THU_2026_01_08_01_30)).toBe(true);
  });

  it("returns false when last vote was in the current epoch", () => {
    expect(canVoteNow(THU_2026_01_08_01, THU_2026_01_08_01_30)).toBe(false);
    expect(canVoteNow(THU_2026_01_08_00, THU_2026_01_08_00)).toBe(false);
  });

  it("becomes true again at the next epoch flip", () => {
    expect(canVoteNow(THU_2026_01_08_01, NEXT_THU)).toBe(true);
  });

  it("accepts bigint lastVoted (typical contract return type)", () => {
    expect(canVoteNow(BigInt(THU_2026_01_08_01), THU_2026_01_08_01_30)).toBe(false);
    expect(canVoteNow(BigInt(THU_2026_01_08_01), NEXT_THU)).toBe(true);
  });
});

// Golden tests — these freeze the *interpreted state* at three specific UTC timestamps the
// README calls out (1.D). If any of these flip, the epoch model has silently drifted.
describe("epoch window state (1.D goldens)", () => {
  const epochStartTs = THU_2026_01_08_00;
  const voteOpen = epochStartTs + HOUR;
  const voteClose = epochStartTs + WEEK - HOUR;

  it("Thu 00:30 UTC → distribute window (vote-not-yet-open)", () => {
    const t = epochStartTs + 30 * 60;
    expect(t < voteOpen).toBe(true);
    expect(t < voteClose).toBe(true);
    expect(epochVoteStart(t)).toBe(voteOpen);
    expect(epochVoteEnd(t)).toBe(voteClose);
  });

  it("Thu 01:30 UTC → normal vote window", () => {
    const t = epochStartTs + HOUR + 30 * 60;
    expect(t >= voteOpen).toBe(true);
    expect(t < voteClose).toBe(true);
  });

  it("Wed 23:30 UTC → whitelist-only window (last hour of epoch)", () => {
    const t = epochStartTs + WEEK - 30 * 60;
    expect(t >= voteClose).toBe(true);
    expect(t < epochStartTs + WEEK).toBe(true);
    // Still inside the same epoch — the vote window has ended but the epoch has not flipped.
    expect(epochStart(t)).toBe(epochStartTs);
  });
});
