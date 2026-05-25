// Frozen fixtures for the eval runner. The runner exposes a single tool to
// the model (`topaz_read({ function, args })`) and uses this module to map
// each call to a canned response.
//
// Fixtures are intentionally tiny and shape-realistic — not byte-accurate
// snapshots of mainnet. Evals grade the agent's **decision logic** (does it
// call bestQuote, does it remember slippage, does it refuse out-of-scope
// work), not the library's correctness (which is covered by `yarn test`).
//
// File layout under evals/fixtures/:
//
//   <case-id>/responses.json
//     {
//       "bestQuoteBundle": { ...canned response... },
//       "buildBestSwapTx": { ...canned response... },
//       ...
//     }
//
// `case-id` matches the eval file's basename without extension for single-case
// evals (e.g. `01-quote`), or `<file>--<case.id>` for multi-case evals (e.g.
// `08-safe-refusals--testnet`).

import * as fs from "node:fs";
import * as path from "node:path";

export interface FixtureLookupKey {
  caseId: string;
  function: string;
}

export interface FixtureResult {
  ok: true;
  result: unknown;
}

export interface FixtureMissing {
  ok: false;
  reason: "fixture-missing-for-function" | "fixture-file-missing";
  caseId: string;
  function: string;
}

export type FixtureResponse = FixtureResult | FixtureMissing;

export const fixturePathFor = (fixturesDir: string, caseId: string): string =>
  path.join(fixturesDir, caseId, "responses.json");

const memo = new Map<string, Record<string, unknown> | null>();

const loadFixtureFile = (
  fixturesDir: string,
  caseId: string,
): Record<string, unknown> | null => {
  const key = `${fixturesDir}::${caseId}`;
  if (memo.has(key)) return memo.get(key) ?? null;
  const abs = fixturePathFor(fixturesDir, caseId);
  if (!fs.existsSync(abs)) {
    memo.set(key, null);
    return null;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(abs, "utf8")) as Record<string, unknown>;
    memo.set(key, parsed);
    return parsed;
  } catch (e) {
    throw new Error(`fixture file ${abs}: ${(e as Error).message}`);
  }
};

export const lookupFixture = (
  fixturesDir: string,
  { caseId, function: fn }: FixtureLookupKey,
): FixtureResponse => {
  const data = loadFixtureFile(fixturesDir, caseId);
  if (data === null) {
    return { ok: false, reason: "fixture-file-missing", caseId, function: fn };
  }
  if (!(fn in data)) {
    return { ok: false, reason: "fixture-missing-for-function", caseId, function: fn };
  }
  return { ok: true, result: data[fn] };
};

// Reset the memo cache. Useful in tests; the eval runner is a one-shot CLI
// so production code doesn't need this.
export const _resetFixtureMemo = (): void => {
  memo.clear();
};
