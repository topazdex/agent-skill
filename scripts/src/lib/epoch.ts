export const WEEK = 7 * 24 * 60 * 60;
export const HOUR = 60 * 60;

export function epochStart(ts: number): number {
  return Math.floor(ts / WEEK) * WEEK;
}

export function epochNext(ts: number): number {
  return epochStart(ts) + WEEK;
}

export function epochVoteStart(ts: number): number {
  return epochStart(ts) + HOUR;
}

export function epochVoteEnd(ts: number): number {
  return epochNext(ts) - HOUR;
}

export function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

export function canVoteNow(lastVoted: bigint | number, now: number = nowSec()): boolean {
  return Number(lastVoted) < epochStart(now);
}

export function fmtEpoch(ts: number): string {
  return new Date(ts * 1000).toISOString().replace("T", " ").replace(".000Z", " UTC");
}
