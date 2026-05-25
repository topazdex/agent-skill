// Parses the machine-readable `assertions:` YAML block at the end of every
// `evals/*.md` file. Shared between `scripts/src/cli/validate.ts` (which only
// verifies the shape) and `scripts/src/cli/evals.ts` (which executes the
// assertions against a real Claude session).
//
// Schema (full description in evals/README.md). Two shapes:
//
//   1. Single-case:
//        assertions:
//          output_kind: <kind>
//          expected_tool_calls: [string]
//          forbidden_tool_calls: [string]
//          must_include: [string]
//          must_not_include: [string]
//
//   2. Multi-case (e.g. evals/08-safe-refusals.md):
//        assertions:
//          cases:
//            - id: <slug>
//              output_kind: <kind>
//              ... (same fields as single-case)
//
// The runner extracts the prompt from the first `> ` blockquote in the file
// (single-case) or from the first `> ` blockquote inside each section paired
// by order with `cases` (multi-case).

import * as fs from "node:fs";
import * as path from "node:path";

import yaml from "js-yaml";

export const OUTPUT_KINDS = [
  "quote",
  "built calldata",
  "approval-needed",
  "broadcast tx-hash",
  "refusal",
  "explanation",
] as const;

export type OutputKind = (typeof OUTPUT_KINDS)[number];

export interface EvalCase {
  id: string;
  prompt: string;
  outputKind: OutputKind[];
  expectedToolCalls: string[];
  forbiddenToolCalls: string[];
  mustInclude: string[];
  mustNotInclude: string[];
}

export interface EvalSpec {
  file: string;
  filename: string;
  cases: EvalCase[];
}

export class EvalSpecError extends Error {
  constructor(
    public readonly file: string,
    msg: string,
  ) {
    super(`${file}: ${msg}`);
    this.name = "EvalSpecError";
  }
}

interface RawCase {
  id?: unknown;
  output_kind?: unknown;
  expected_tool_calls?: unknown;
  forbidden_tool_calls?: unknown;
  must_include?: unknown;
  must_not_include?: unknown;
}

interface RawAssertions extends RawCase {
  cases?: unknown;
}

const FENCE_RE = /```yaml\s*\n([\s\S]*?)\n```/g;

const findAssertionsBlock = (md: string): string | null => {
  let last: string | null = null;
  for (const m of md.matchAll(FENCE_RE)) {
    const body = m[1];
    if (/^\s*assertions\s*:/m.test(body)) last = body;
  }
  return last;
};

const ensureStringArray = (
  v: unknown,
  field: string,
  file: string,
): string[] => {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) {
    throw new EvalSpecError(file, `\`${field}\` must be a YAML list of strings`);
  }
  return v.map((item, idx) => {
    if (typeof item !== "string") {
      throw new EvalSpecError(
        file,
        `\`${field}[${idx}]\` must be a string (got ${typeof item})`,
      );
    }
    return item;
  });
};

const parseOutputKind = (v: unknown, file: string): OutputKind[] => {
  if (typeof v !== "string" || v.trim() === "") {
    throw new EvalSpecError(file, "`output_kind` must be a non-empty string");
  }
  const kinds = v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean) as OutputKind[];
  for (const k of kinds) {
    if (!OUTPUT_KINDS.includes(k)) {
      throw new EvalSpecError(
        file,
        `unknown output_kind \`${k}\` — must be one of: ${OUTPUT_KINDS.join(", ")}`,
      );
    }
  }
  return kinds;
};

const parseCase = (
  raw: RawCase,
  defaultId: string,
  prompt: string,
  file: string,
): EvalCase => ({
  id: typeof raw.id === "string" ? raw.id : defaultId,
  prompt,
  outputKind: parseOutputKind(raw.output_kind, file),
  expectedToolCalls: ensureStringArray(
    raw.expected_tool_calls,
    "expected_tool_calls",
    file,
  ),
  forbiddenToolCalls: ensureStringArray(
    raw.forbidden_tool_calls,
    "forbidden_tool_calls",
    file,
  ),
  mustInclude: ensureStringArray(raw.must_include, "must_include", file),
  mustNotInclude: ensureStringArray(
    raw.must_not_include,
    "must_not_include",
    file,
  ),
});

// Extracts prompt blockquotes ("> ..." lines, possibly multi-line) from
// markdown.
//
// Returns:
//   - `firstAnywhere`: the first blockquote in the document, regardless of
//     section. Used for single-case evals where the prompt is conventionally
//     inside a `## Prompt` section.
//   - `bySection`: top-level `## <heading>` sections that contain at least one
//     blockquote. For multi-case evals, this is paired by order with the
//     `cases` YAML array (one section per case, in document order).
const extractPrompts = (md: string): { firstAnywhere: string | null; bySection: string[] } => {
  const lines = md.split(/\r?\n/);
  const sections: string[][] = [];
  let currentSection: string[] | null = null;
  const preSection: string[] = [];
  for (const line of lines) {
    if (/^##\s+/.test(line)) {
      if (currentSection) sections.push(currentSection);
      currentSection = [];
    } else if (currentSection) {
      currentSection.push(line);
    } else {
      preSection.push(line);
    }
  }
  if (currentSection) sections.push(currentSection);

  const collectBlockquote = (block: string[]): string | null => {
    const buf: string[] = [];
    let inQuote = false;
    for (const line of block) {
      if (/^>\s?/.test(line)) {
        inQuote = true;
        buf.push(line.replace(/^>\s?/, ""));
      } else if (inQuote && line.trim() === "") {
        buf.push("");
      } else if (inQuote) {
        break;
      }
    }
    const out = buf.join("\n").trim();
    return out === "" ? null : out;
  };

  const fromPre = collectBlockquote(preSection);
  const bySection: string[] = [];
  for (const section of sections) {
    const q = collectBlockquote(section);
    if (q !== null) bySection.push(q);
  }
  const firstAnywhere = fromPre ?? bySection[0] ?? null;
  return { firstAnywhere, bySection };
};

export const parseEvalSpec = (absPath: string): EvalSpec => {
  const file = path.basename(absPath);
  const md = fs.readFileSync(absPath, "utf8");
  const yamlBody = findAssertionsBlock(md);
  if (yamlBody === null) {
    throw new EvalSpecError(file, "no ```yaml assertions: ...``` block found");
  }

  let doc: unknown;
  try {
    doc = yaml.load(yamlBody);
  } catch (e) {
    throw new EvalSpecError(file, `YAML parse error: ${(e as Error).message}`);
  }
  if (typeof doc !== "object" || doc === null || !("assertions" in doc)) {
    throw new EvalSpecError(file, "YAML must contain a top-level `assertions:` key");
  }
  const a = (doc as { assertions: RawAssertions }).assertions;
  if (typeof a !== "object" || a === null) {
    throw new EvalSpecError(file, "`assertions:` must be a mapping");
  }

  const { firstAnywhere, bySection } = extractPrompts(md);

  if (a.cases !== undefined) {
    if (!Array.isArray(a.cases)) {
      throw new EvalSpecError(file, "`assertions.cases` must be a list");
    }
    if (a.cases.length === 0) {
      throw new EvalSpecError(file, "`assertions.cases` is empty");
    }
    // Skip the very first blockquote-containing section if it's a global
    // intro (no per-case heading like `## 8a`), so cases pair correctly.
    // Heuristic: filter to sections whose heading starts with a digit or letter
    // followed by alphanumeric — we don't have section headings here so use
    // length match as the guide. If we have more sections than cases, take the
    // last N (per-case headings come after intro headings).
    const prompts =
      bySection.length === a.cases.length
        ? bySection
        : bySection.slice(bySection.length - a.cases.length);
    if (prompts.length !== a.cases.length) {
      throw new EvalSpecError(
        file,
        `assertions.cases has ${a.cases.length} entries but ${bySection.length} section-level prompts found`,
      );
    }
    const cases = (a.cases as RawCase[]).map((raw, i) =>
      parseCase(raw, `case-${i + 1}`, prompts[i], file),
    );
    return { file: absPath, filename: file, cases };
  }

  if (firstAnywhere === null) {
    throw new EvalSpecError(file, "no `> ` prompt blockquote found anywhere in the file");
  }
  const single = parseCase(a, "default", firstAnywhere, file);
  return { file: absPath, filename: file, cases: [single] };
};

export const discoverEvalFiles = (evalsDir: string): string[] => {
  return fs
    .readdirSync(evalsDir)
    .filter((name) => /^\d/.test(name) && name.endsWith(".md"))
    .sort()
    .map((name) => path.join(evalsDir, name));
};

export const parseAllEvalSpecs = (evalsDir: string): EvalSpec[] =>
  discoverEvalFiles(evalsDir).map(parseEvalSpec);
