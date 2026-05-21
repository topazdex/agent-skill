// CLI: yarn release <patch|minor|major|x.y.z> [--apply] [--allow-dirty] [--dry-run]
//
// Atomically bumps the skill's version across all artifacts:
//   - SKILL.md frontmatter `version`
//   - skill.json `version`
//   - CHANGELOG.md: promotes everything under `## [Unreleased]` into a new
//     `## [x.y.z] — YYYY-MM-DD` section and updates the bottom comparison links.
//
// Runs the validator + tsc + tests after editing so a broken release can't slip through.
//
// Default behavior writes the files and prints the commit/tag/push commands. Pass
// `--apply` to run those commands automatically.
//
// Flags:
//   --apply        run `git add … && git commit && git tag && git push --follow-tags`
//   --allow-dirty  skip the clean-working-tree check
//   --dry-run      compute the new version + show what would change, write nothing
//   --branch <n>   expected branch (default: main)

import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SELF_FILE = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(SELF_FILE), "../../..");

const SKILL_MD = path.join(REPO_ROOT, "SKILL.md");
const SKILL_JSON = path.join(REPO_ROOT, "skill.json");
const CHANGELOG = path.join(REPO_ROOT, "CHANGELOG.md");
const README = path.join(REPO_ROOT, "README.md");

// --- arg parsing ---
interface Args {
  bump: string;
  apply: boolean;
  allowDirty: boolean;
  dryRun: boolean;
  branch: string;
}

const parseArgs = (argv: string[]): Args => {
  const args: Args = {
    bump: "",
    apply: false,
    allowDirty: false,
    dryRun: false,
    branch: "main",
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--apply") args.apply = true;
    else if (a === "--allow-dirty") args.allowDirty = true;
    else if (a === "--dry-run") args.dryRun = true;
    else if (a === "--branch") args.branch = argv[++i] ?? "main";
    else if (!args.bump) args.bump = a;
    else die(`unknown arg: ${a}`);
  }
  if (!args.bump) {
    die("usage: yarn release <patch|minor|major|x.y.z> [--apply] [--allow-dirty] [--dry-run] [--branch <name>]");
  }
  return args;
};

const die = (msg: string): never => {
  console.error(`release: ${msg}`);
  process.exit(1);
};

const ok = (msg: string): void => console.log(`release: ${msg}`);

// --- version math ---
const VERSION_RE = /^(\d+)\.(\d+)\.(\d+)$/;

const parseVersion = (v: string): [number, number, number] => {
  const m = v.match(VERSION_RE);
  if (!m) die(`not a semver: ${v}`);
  return [Number(m![1]), Number(m![2]), Number(m![3])];
};

const computeNext = (current: string, bump: string): string => {
  if (VERSION_RE.test(bump)) return bump; // explicit version
  const [maj, min, pat] = parseVersion(current);
  switch (bump) {
    case "patch": return `${maj}.${min}.${pat + 1}`;
    case "minor": return `${maj}.${min + 1}.0`;
    case "major": return `${maj + 1}.0.0`;
    default:      return die(`bump must be patch/minor/major or an explicit x.y.z, got: ${bump}`);
  }
};

// --- file readers ---
const readSkillMdVersion = (): string => {
  const md = fs.readFileSync(SKILL_MD, "utf8");
  const fm = md.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fm) die("SKILL.md has no frontmatter");
  const m = fm![1].match(/^version:\s*(\S+)\s*$/m);
  if (!m) die("SKILL.md frontmatter is missing a `version:` line");
  return m![1];
};

const readSkillJsonVersion = (): string => {
  const j = JSON.parse(fs.readFileSync(SKILL_JSON, "utf8")) as { version?: string };
  if (!j.version) die("skill.json is missing `version`");
  return j.version!;
};

// --- file writers ---
const bumpSkillMd = (newVersion: string): void => {
  const md = fs.readFileSync(SKILL_MD, "utf8");
  const updated = md.replace(/^(version:\s*)\S+\s*$/m, `$1${newVersion}`);
  if (updated === md) die("SKILL.md `version:` line was not updated (regex miss)");
  fs.writeFileSync(SKILL_MD, updated);
};

const bumpSkillJson = (newVersion: string): void => {
  // Preserve formatting by doing a string replace on the version line rather than
  // re-stringifying the whole object (which would lose comments-style ordering).
  const raw = fs.readFileSync(SKILL_JSON, "utf8");
  const updated = raw.replace(/("version"\s*:\s*")[^"]+(")/, `$1${newVersion}$2`);
  if (updated === raw) die("skill.json `version` was not updated (regex miss)");
  // Sanity check: result must still parse.
  JSON.parse(updated) as unknown;
  fs.writeFileSync(SKILL_JSON, updated);
};

// Catches the `**Current version:** \`X.Y.Z\`` line at the top of README.md.
// Historically (v2.0.0 + v2.1.0) this stayed stale because the release CLI
// only bumped SKILL.md + skill.json + CHANGELOG. The validator now enforces
// parity, but the writer keeps it from drifting in the first place.
const bumpReadme = (newVersion: string): void => {
  const raw = fs.readFileSync(README, "utf8");
  const re = /(\*\*Current version:\*\*\s+`)[^`]+(`)/;
  if (!re.test(raw)) {
    die("README.md is missing the `**Current version:** \\`X.Y.Z\\`` marker that release.ts updates");
  }
  const updated = raw.replace(re, `$1${newVersion}$2`);
  if (updated === raw) die("README.md `Current version:` line was not updated (regex miss)");
  fs.writeFileSync(README, updated);
};

const today = (): string => {
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const bumpChangelog = (newVersion: string, previousVersion: string): void => {
  const raw = fs.readFileSync(CHANGELOG, "utf8");

  // Locate the `## [Unreleased]` heading and the next `## [` heading after it.
  const unreleasedHeadingRe = /^## \[Unreleased\]\s*$/m;
  const headingMatch = unreleasedHeadingRe.exec(raw);
  if (!headingMatch) {
    die("CHANGELOG.md is missing a `## [Unreleased]` heading");
    return;
  }

  const headingStart = headingMatch.index;
  const headingEnd = headingStart + headingMatch[0].length;

  // Find the next `## [` heading after Unreleased (or end of file).
  const tail = raw.slice(headingEnd);
  const nextHeadingRel = tail.search(/\n## \[/);
  const sectionEndAbs = nextHeadingRel === -1 ? raw.length : headingEnd + nextHeadingRel;
  const unreleasedBody = raw.slice(headingEnd, sectionEndAbs).replace(/^\s+/, "").replace(/\s+$/, "");

  if (!unreleasedBody) {
    console.warn(`release: warning — CHANGELOG.md \`## [Unreleased]\` section is empty. The new \`## [${newVersion}]\` section will have no notes.`);
  }

  const newSection = `## [${newVersion}] — ${today()}\n\n${unreleasedBody}${unreleasedBody ? "\n\n" : ""}`;

  // Replace the Unreleased section with: empty Unreleased + new versioned section.
  const before = raw.slice(0, headingEnd);
  const after = raw.slice(sectionEndAbs);
  let updated = `${before}\n\n${newSection}${after.startsWith("\n") ? "" : "\n"}${after}`;

  // Update / add the comparison link footer.
  //   [Unreleased]: …/compare/v<newVersion>...HEAD
  //   [<newVersion>]: …/compare/v<previousVersion>...v<newVersion>  (or release/tag/v<newVersion> if first)
  const repo = "https://github.com/topazdex/agent-skill";
  const unreleasedLinkRe = /^\[Unreleased\]:.*$/m;
  const newUnreleasedLink = `[Unreleased]: ${repo}/compare/v${newVersion}...HEAD`;
  if (unreleasedLinkRe.test(updated)) {
    updated = updated.replace(unreleasedLinkRe, newUnreleasedLink);
  } else {
    updated = `${updated.trimEnd()}\n\n${newUnreleasedLink}\n`;
  }

  const newVersionLink = previousVersion === "0.0.0"
    ? `[${newVersion}]: ${repo}/releases/tag/v${newVersion}`
    : `[${newVersion}]: ${repo}/compare/v${previousVersion}...v${newVersion}`;
  // Insert the new version link right after the [Unreleased] line.
  updated = updated.replace(
    unreleasedLinkRe,
    `${newUnreleasedLink}\n${newVersionLink}`,
  );

  fs.writeFileSync(CHANGELOG, updated);
};

// --- git helpers ---
const git = (cmd: string): string =>
  execSync(`git ${cmd}`, { cwd: REPO_ROOT, encoding: "utf8" }).trim();

const ensureCleanTree = (): void => {
  const status = git("status --porcelain");
  if (status) {
    die(
      `working tree not clean — commit or stash first (or pass --allow-dirty):\n${status}`,
    );
  }
};

const ensureBranch = (expected: string): void => {
  const current = git("rev-parse --abbrev-ref HEAD");
  if (current !== expected) {
    die(`expected branch \`${expected}\`, currently on \`${current}\` (override with --branch)`);
  }
};

const ensureTagFree = (newVersion: string): void => {
  const tags = git("tag --list").split("\n").filter(Boolean);
  if (tags.includes(`v${newVersion}`)) {
    die(`git tag v${newVersion} already exists`);
  }
};

// --- main ---
const main = (): void => {
  const args = parseArgs(process.argv.slice(2));

  const skillMdVersion = readSkillMdVersion();
  const skillJsonVersion = readSkillJsonVersion();
  if (skillMdVersion !== skillJsonVersion) {
    die(
      `version drift before release: SKILL.md=${skillMdVersion}, skill.json=${skillJsonVersion} — resolve manually before bumping`,
    );
  }

  const currentVersion = skillMdVersion;
  const newVersion = computeNext(currentVersion, args.bump);

  ok(`bump ${args.bump} → ${currentVersion} → ${newVersion}${args.dryRun ? " (dry-run)" : ""}`);

  if (!args.allowDirty && !args.dryRun) ensureCleanTree();
  if (!args.dryRun) ensureBranch(args.branch);
  if (!args.dryRun) ensureTagFree(newVersion);

  if (args.dryRun) {
    ok("dry-run: no files written");
    return;
  }

  bumpSkillMd(newVersion);
  bumpSkillJson(newVersion);
  bumpReadme(newVersion);
  bumpChangelog(newVersion, currentVersion);
  ok("wrote SKILL.md, skill.json, README.md, CHANGELOG.md");

  ok("running validator");
  execSync("yarn validate", { cwd: path.join(REPO_ROOT, "scripts"), stdio: "inherit" });

  ok("running type-check");
  execSync("yarn build", { cwd: path.join(REPO_ROOT, "scripts"), stdio: "inherit" });

  ok("running unit tests");
  execSync("yarn test", { cwd: path.join(REPO_ROOT, "scripts"), stdio: "inherit" });

  ok(`✓ release artifacts updated to v${newVersion}`);

  if (args.apply) {
    ok("applying: commit + tag + push --follow-tags");
    execSync(`git add SKILL.md skill.json README.md CHANGELOG.md`, { cwd: REPO_ROOT, stdio: "inherit" });
    execSync(`git commit -m "release: v${newVersion}"`, { cwd: REPO_ROOT, stdio: "inherit" });
    execSync(`git tag -a v${newVersion} -m "Topaz agent skill v${newVersion}"`, { cwd: REPO_ROOT, stdio: "inherit" });
    execSync(`git push origin ${args.branch} --follow-tags`, { cwd: REPO_ROOT, stdio: "inherit" });
    ok(`pushed v${newVersion}; GitHub Actions will create the release.`);
  } else {
    console.log("\nNext steps (review the diff first, then run):\n");
    console.log(`  git diff SKILL.md skill.json README.md CHANGELOG.md`);
    console.log(`  git add SKILL.md skill.json README.md CHANGELOG.md`);
    console.log(`  git commit -m "release: v${newVersion}"`);
    console.log(`  git tag -a v${newVersion} -m "Topaz agent skill v${newVersion}"`);
    console.log(`  git push origin ${args.branch} --follow-tags`);
    console.log(`\nOr re-run with --apply to do all of that automatically.`);
  }
};

main();
