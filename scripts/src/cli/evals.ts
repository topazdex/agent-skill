// CLI: yarn evals
// Automated agent eval runner. For each `evals/NN-*.md`, replays the prompt
// against a Claude session with the Topaz skill mounted as a system prompt
// and a stubbed RPC tool that serves fixtures from `evals/fixtures/`. Grades
// the recorded tool-call trace + final answer against the YAML assertion
// block at the end of each eval file. Exits non-zero on any failure.
//
// Without an ANTHROPIC_API_KEY the runner prints a skip notice and exits 0,
// so it's safe to include in local-only verification flows.
//
// Flags (parsed with minimist):
//   --single <N>     run only `evals/NN-*.md` (e.g. --single 01)
//   --dry-run        parse specs + mount skill, no API calls
//   --model <id>     override default model (claude-haiku-4-5)
//   --verbose        print each tool call as it happens
//   --max-turns <n>  cap conversation turns per case (default 12)

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import Anthropic from "@anthropic-ai/sdk";
import minimist from "minimist";

import {
  parseAllEvalSpecs,
  parseEvalSpec,
  type EvalCase,
  type EvalSpec,
} from "../lib/evalSpec.js";
import { lookupFixture } from "../lib/evalFixtures.js";

const SELF_FILE = fileURLToPath(import.meta.url);
const SCRIPTS_DIR = path.resolve(path.dirname(SELF_FILE), "../..");
const REPO_ROOT = path.resolve(SCRIPTS_DIR, "..");
const EVALS_DIR = path.join(REPO_ROOT, "evals");
const FIXTURES_DIR = path.join(EVALS_DIR, "fixtures");

const DEFAULT_MODEL = "claude-haiku-4-5";
const DEFAULT_MAX_TURNS = 12;

interface CliArgs {
  single?: string;
  "dry-run"?: boolean;
  model?: string;
  verbose?: boolean;
  "max-turns"?: number;
  help?: boolean;
}

const args = minimist(process.argv.slice(2), {
  string: ["single", "model"],
  boolean: ["dry-run", "verbose", "help"],
  alias: { h: "help" },
  default: { "max-turns": DEFAULT_MAX_TURNS },
}) as unknown as CliArgs & { _: string[] };

if (args.help) {
  console.log(`yarn evals [options]

Options:
  --single <N>       Run only evals/NN-*.md (e.g. --single 01)
  --dry-run          Parse specs + mount skill, no API calls
  --model <id>       Override default model (default: ${DEFAULT_MODEL})
  --verbose          Print every tool call as it happens
  --max-turns <n>    Max turns per case (default: ${DEFAULT_MAX_TURNS})
  -h, --help         Show this message

Without ANTHROPIC_API_KEY, prints a skip notice and exits 0.`);
  process.exit(0);
}

// --- Skill mount ---
// We concat SKILL.md + a short eval-runner-only system note describing the
// two tools (`topaz_read`, `read_file`). References live on disk; the agent
// pulls them via `read_file` when it needs more depth (same navigation
// pattern as a production runtime).
const buildSystemPrompt = (): string => {
  const skill = fs.readFileSync(path.join(REPO_ROOT, "SKILL.md"), "utf8");
  const runnerNote = `
---

# Eval-runner environment

You are running inside an automated eval harness. Two tools are available:

- **topaz_read({ function, args })** — your only way to read on-chain state and to invoke builder helpers (\`bestQuote\`, \`bestQuoteBundle\`, \`buildBestSwapTx\`, \`buildBribeDepositTx\`, \`Voter.gauges\`, \`Voter.lastVoted\`, \`epochStart\`, \`claimableSummary\`, etc.). Pass the function name as a string and an args object. Use the same names documented in SKILL.md / references / scripts/src/index.ts.
- **read_file({ path })** — read any tracked file in this repo (SKILL.md, references/*.md, developers/*.md, examples/*.md, scripts/src/**/*.ts). Use this when you need more detail than SKILL.md provides.

There is no \`bash\`, no \`signer\`, no \`broadcastTransaction\`. **Do not** offer to broadcast — only quote and build calldata, per the Operating principles above. When a task is out of scope (testnet, governance, deploy-new-pool), refuse cleanly without making any tool calls.
`;
  return skill + runnerNote;
};

// --- Tool definitions ---
interface ToolUseRecord {
  name: string;
  input: unknown;
}

const TOOLS: Anthropic.Tool[] = [
  {
    name: "topaz_read",
    description:
      "Read on-chain Topaz state or invoke a builder helper. `function` is the helper name (e.g. 'bestQuote', 'bestQuoteBundle', 'buildBestSwapTx', 'buildBribeDepositTx', 'Voter.gauges', 'Voter.lastVoted', 'epochStart', 'claimableSummary', 'quoteHuman', 'Voter.isWhitelistedToken', 'BribeVotingReward.isReward', 'VotingEscrow.isApprovedOrOwner', 'txReceipt'). `args` is the function's argument object.",
    input_schema: {
      type: "object",
      properties: {
        function: { type: "string" },
        args: { type: "object" },
      },
      required: ["function"],
    },
  },
  {
    name: "read_file",
    description: "Read any tracked file in the repo by repo-relative path.",
    input_schema: {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"],
    },
  },
];

const handleToolCall = (
  toolName: string,
  input: unknown,
  caseId: string,
): { isError: boolean; content: string } => {
  if (toolName === "topaz_read") {
    const fnInput = input as { function?: unknown; args?: unknown };
    if (typeof fnInput.function !== "string") {
      return { isError: true, content: "topaz_read: `function` must be a string" };
    }
    const result = lookupFixture(FIXTURES_DIR, { caseId, function: fnInput.function });
    if (!result.ok) {
      return {
        isError: true,
        content: `no fixture for \`${fnInput.function}\` (case=${caseId}). Available functions: see evals/fixtures/${caseId}/responses.json. If this read is needed, add a fixture entry.`,
      };
    }
    return { isError: false, content: JSON.stringify(result.result, null, 2) };
  }
  if (toolName === "read_file") {
    const fnInput = input as { path?: unknown };
    if (typeof fnInput.path !== "string") {
      return { isError: true, content: "read_file: `path` must be a string" };
    }
    const abs = path.resolve(REPO_ROOT, fnInput.path);
    if (!abs.startsWith(REPO_ROOT + path.sep)) {
      return { isError: true, content: `read_file: path escapes repo (${fnInput.path})` };
    }
    if (!fs.existsSync(abs)) {
      return { isError: true, content: `read_file: not found — ${fnInput.path}` };
    }
    const stat = fs.statSync(abs);
    if (stat.isDirectory()) {
      return { isError: true, content: `read_file: is a directory — ${fnInput.path}` };
    }
    if (stat.size > 200_000) {
      return {
        isError: true,
        content: `read_file: file too large (${stat.size} bytes) — pick a smaller file or a specific section`,
      };
    }
    return { isError: false, content: fs.readFileSync(abs, "utf8") };
  }
  return { isError: true, content: `unknown tool: ${toolName}` };
};

// --- Conversation loop ---
interface RunResult {
  toolCalls: ToolUseRecord[];
  finalText: string;
  stopReason: string | null;
  turns: number;
}

const runCase = async (
  client: Anthropic,
  model: string,
  systemPrompt: string,
  caseId: string,
  prompt: string,
  maxTurns: number,
  verbose: boolean,
): Promise<RunResult> => {
  const toolCalls: ToolUseRecord[] = [];
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: prompt }];
  let turns = 0;
  let stopReason: string | null = null;
  let finalText = "";

  while (turns < maxTurns) {
    turns++;
    const resp: Anthropic.Message = await client.messages.create({
      model,
      max_tokens: 4096,
      system: systemPrompt,
      tools: TOOLS,
      messages,
    });
    stopReason = resp.stop_reason ?? null;

    const toolUses = resp.content.filter(
      (c): c is Anthropic.ToolUseBlock => c.type === "tool_use",
    );
    const textBlocks = resp.content.filter(
      (c): c is Anthropic.TextBlock => c.type === "text",
    );

    if (verbose) {
      for (const tu of toolUses) {
        console.log(`    [tool] ${tu.name}(${JSON.stringify(tu.input)})`);
      }
    }

    for (const tu of toolUses) {
      toolCalls.push({ name: tu.name, input: tu.input });
    }

    if (toolUses.length === 0 || resp.stop_reason === "end_turn") {
      finalText = textBlocks.map((b) => b.text).join("\n");
      break;
    }

    messages.push({ role: "assistant", content: resp.content });
    const toolResults: Anthropic.ToolResultBlockParam[] = toolUses.map((tu) => {
      const r = handleToolCall(tu.name, tu.input, caseId);
      return {
        type: "tool_result",
        tool_use_id: tu.id,
        is_error: r.isError,
        content: r.content,
      };
    });
    messages.push({ role: "user", content: toolResults });
  }

  return { toolCalls, finalText, stopReason, turns };
};

// --- Grading ---
interface CaseResult {
  specFile: string;
  caseId: string;
  passed: boolean;
  failures: string[];
  toolCallCount: number;
  turns: number;
}

const compileRegex = (pattern: string): RegExp => new RegExp(pattern, "i");

const gradeCase = (
  c: EvalCase,
  result: RunResult,
): { passed: boolean; failures: string[] } => {
  const failures: string[] = [];
  const traceText = result.toolCalls
    .map((tc) => `${tc.name}(${JSON.stringify(tc.input)})`)
    .join("\n");

  for (const p of c.expectedToolCalls) {
    if (!compileRegex(p).test(traceText)) {
      failures.push(`expected tool-call pattern not matched: /${p}/`);
    }
  }
  for (const p of c.forbiddenToolCalls) {
    if (compileRegex(p).test(traceText)) {
      failures.push(`forbidden tool-call pattern matched: /${p}/`);
    }
  }
  for (const p of c.mustInclude) {
    if (!compileRegex(p).test(result.finalText)) {
      failures.push(`must_include pattern not matched in final answer: /${p}/`);
    }
  }
  for (const p of c.mustNotInclude) {
    if (compileRegex(p).test(result.finalText)) {
      failures.push(`must_not_include pattern matched in final answer: /${p}/`);
    }
  }
  return { passed: failures.length === 0, failures };
};

// --- Discovery + filtering ---
const collectSpecs = (singleArg?: string): EvalSpec[] => {
  if (singleArg !== undefined) {
    const match = fs
      .readdirSync(EVALS_DIR)
      .find((name) => name.startsWith(`${singleArg}-`) || name.startsWith(`${singleArg}.`));
    if (!match) {
      console.error(`No eval file found matching '${singleArg}'`);
      process.exit(2);
    }
    return [parseEvalSpec(path.join(EVALS_DIR, match))];
  }
  return parseAllEvalSpecs(EVALS_DIR);
};

const caseFixtureId = (spec: EvalSpec, c: EvalCase): string => {
  const base = path.basename(spec.filename, ".md");
  return spec.cases.length === 1 ? base : `${base}--${c.id}`;
};

// --- Main ---
const main = async (): Promise<void> => {
  const specs = collectSpecs(args.single);
  if (specs.length === 0) {
    console.error("No eval specs found");
    process.exit(2);
  }
  console.log(`Parsed ${specs.length} eval file(s):`);
  for (const s of specs) {
    const cases = s.cases.length === 1 ? "" : ` (${s.cases.length} cases)`;
    console.log(`  - ${s.filename}${cases}`);
  }

  if (args["dry-run"]) {
    console.log(`\nDRY-RUN: ${specs.length} spec(s) parsed cleanly. No API calls made.`);
    process.exit(0);
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.log(
      "\nSKIPPED: ANTHROPIC_API_KEY not set. Set it to run the live eval harness. Exiting 0.",
    );
    process.exit(0);
  }

  const client = new Anthropic({ apiKey });
  const model = args.model ?? DEFAULT_MODEL;
  const maxTurns = Number(args["max-turns"]) || DEFAULT_MAX_TURNS;
  const systemPrompt = buildSystemPrompt();

  console.log(`\nRunning evals with model=${model}, maxTurns=${maxTurns}\n`);
  const results: CaseResult[] = [];

  for (const spec of specs) {
    for (const c of spec.cases) {
      const fixtureId = caseFixtureId(spec, c);
      const label = `${spec.filename}${spec.cases.length === 1 ? "" : ` :: ${c.id}`}`;
      process.stdout.write(`  ${label} ... `);
      try {
        const run = await runCase(
          client,
          model,
          systemPrompt,
          fixtureId,
          c.prompt,
          maxTurns,
          args.verbose ?? false,
        );
        const grade = gradeCase(c, run);
        results.push({
          specFile: spec.filename,
          caseId: c.id,
          passed: grade.passed,
          failures: grade.failures,
          toolCallCount: run.toolCalls.length,
          turns: run.turns,
        });
        process.stdout.write(grade.passed ? "PASS" : "FAIL");
        console.log(` (${run.toolCalls.length} tool calls, ${run.turns} turns)`);
        if (!grade.passed) {
          for (const f of grade.failures) console.log(`      - ${f}`);
        }
      } catch (e) {
        results.push({
          specFile: spec.filename,
          caseId: c.id,
          passed: false,
          failures: [`runtime error: ${(e as Error).message}`],
          toolCallCount: 0,
          turns: 0,
        });
        console.log(`ERROR — ${(e as Error).message}`);
      }
    }
  }

  console.log("\n— Summary —");
  const passed = results.filter((r) => r.passed).length;
  const failed = results.length - passed;
  console.log(`  ${passed}/${results.length} passed, ${failed} failed`);
  if (failed > 0) {
    console.log("\nFailed cases:");
    for (const r of results.filter((rr) => !rr.passed)) {
      console.log(`  ${r.specFile} :: ${r.caseId}`);
      for (const f of r.failures) console.log(`    - ${f}`);
    }
    process.exit(1);
  }
  process.exit(0);
};

main().catch((e) => {
  console.error(`evals fatal: ${(e as Error).message}`);
  process.exit(1);
});
