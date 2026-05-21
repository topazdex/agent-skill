// CLI: yarn validate
// Static skill validation. Exits 0 on success, 1 if any error-level finding.
//
// Implements priority-1.A of README's foundational-quality TODO:
//   - SKILL.md frontmatter (name, description, length).
//   - Internal links resolve across SKILL/README/developers/references/examples.
//   - No hardcoded author-local paths (/Users/<x>/..., /home/<x>/...).
//   - No committed secrets or vendored deps.
//   - Address-set parity: scripts/src/config/addresses.ts ⊆ README.md ⊆ references/addresses.md.
//   - Subgraph URLs consistent across docs, config, and .env.example.

import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { getAddress } from "ethers";
import { BRAND } from "../config/brand.js";

const SELF_FILE = fileURLToPath(import.meta.url);
const SCRIPTS_DIR = path.resolve(path.dirname(SELF_FILE), "../..");
const REPO_ROOT = path.resolve(SCRIPTS_DIR, "..");

// Git-tracked files. The validator only inspects files git actually owns —
// untracked artifacts (node_modules, local .env, build output) are ignored
// regardless of where they sit on disk.
const TRACKED_FILES: Set<string> = (() => {
  const out = execSync("git ls-files", { cwd: REPO_ROOT, encoding: "utf8" });
  return new Set(
    out
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((rel) => path.resolve(REPO_ROOT, rel)),
  );
})();
const isTracked = (abs: string): boolean => TRACKED_FILES.has(path.resolve(abs));

type Severity = "error" | "warn";
interface Finding {
  severity: Severity;
  file: string;
  line?: number;
  msg: string;
}

const FINDINGS: Finding[] = [];

const repoRel = (abs: string): string =>
  path.relative(REPO_ROOT, abs) || path.basename(abs);

const error = (file: string, msg: string, line?: number): void => {
  FINDINGS.push({ severity: "error", file, msg, line });
};
const warn = (file: string, msg: string, line?: number): void => {
  FINDINGS.push({ severity: "warn", file, msg, line });
};

const readText = (abs: string): string => fs.readFileSync(abs, "utf8");

const walkDir = (
  dir: string,
  match: (name: string) => boolean,
  out: string[] = [],
  skip: Set<string> = new Set(["node_modules", ".git", "dist", "build", ".yarn"]),
): string[] => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skip.has(entry.name)) continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDir(abs, match, out, skip);
    } else if (entry.isFile() && match(entry.name)) {
      out.push(abs);
    }
  }
  return out;
};

const MD_FILES_TO_LINK_CHECK = (): string[] =>
  Array.from(TRACKED_FILES).filter((f) => f.endsWith(".md"));

const lineOf = (text: string, idx: number): number =>
  text.slice(0, idx).split("\n").length;

// --- A1. SKILL.md frontmatter ---
// Hermes/Anthropic Skills require name + description; description ≤ 1024 chars.
const SKILL_DESCRIPTION_MAX = 1024;

const parseFrontmatter = (md: string): { name?: string; description?: string; raw?: string } => {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!m) return {};
  const raw = m[1];
  const fields: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
    if (!kv) continue;
    fields[kv[1]] = kv[2].trim();
  }
  return { name: fields.name, description: fields.description, raw };
};

const checkFrontmatter = (): void => {
  const skillPath = path.join(REPO_ROOT, "SKILL.md");
  const md = readText(skillPath);
  const fm = parseFrontmatter(md);
  if (!fm.raw) {
    error(repoRel(skillPath), "missing YAML frontmatter (expected `---` … `---` at top of file)");
    return;
  }
  if (!fm.name) error(repoRel(skillPath), "frontmatter missing `name`");
  if (!fm.description) error(repoRel(skillPath), "frontmatter missing `description`");
  if (fm.description && fm.description.length > SKILL_DESCRIPTION_MAX) {
    error(
      repoRel(skillPath),
      `frontmatter \`description\` is ${fm.description.length} chars; limit is ${SKILL_DESCRIPTION_MAX}`,
    );
  }
};

// --- A2. Internal links resolve ---
// Markdown links: [text](url) — skip http/https/mailto/anchor-only/empty.
// Also scan inline backticked paths that look like internal refs.

const isExternalOrAnchor = (url: string): boolean =>
  /^(?:https?:|mailto:|#|tel:|data:)/.test(url) || url === "" || url.startsWith("~/");

// Strip ?query / #anchor for filesystem resolution.
const stripQueryAndAnchor = (url: string): string => url.split(/[?#]/)[0];

// Replace fenced code blocks (```...```) with spaces of matching length so line numbers
// stay accurate but markdown-link / backtick-path scanning ignores embedded source.
const maskFencedCode = (text: string): string =>
  text.replace(/```[\s\S]*?```/g, (block) => block.replace(/[^\n]/g, " "));

const checkInternalLinks = (): void => {
  const linkRe = /\[([^\]]*)\]\(([^)]+)\)/g;
  const backtickRe = /`([^`\n]+)`/g;

  // Backticked content treated as a candidate path when it:
  //   - is not a URL, not a 0x... address, not a `~/...` source pointer, not a code snippet
  //   - looks like a real path (contains `/` and ends with .md/.ts/.json/.sol)
  // We only check paths inside `references/`, `developers/`, `examples/`, `scripts/` — relative paths
  // typed in nav tables.
  const isCandidateBacktickPath = (s: string): boolean => {
    if (s.startsWith("0x") || s.startsWith("~/") || s.startsWith("/")) return false;
    if (s.includes(" ")) return false; // not a path
    if (s.includes("://")) return false;
    if (s.includes("*")) return false; // glob describing a set, not a real path
    if (/^[A-Z_][A-Z0-9_]*$/.test(s)) return false; // CONSTANT
    if (/\(.*\)$/.test(s)) return false; // function call
    if (!s.includes("/")) return false;
    if (!/\.(md|ts|tsx|json|sol|py|graphql)$/.test(s)) return false;
    return /^(?:\.\/|\.\.\/)?(references|developers|examples|scripts|sdk)\//.test(s);
  };

  for (const file of MD_FILES_TO_LINK_CHECK()) {
    const raw = readText(file);
    const noFence = maskFencedCode(raw);
    // For link detection, also mask inline backtick spans so embedded code (which
    // can contain `[...](...)` shapes) doesn't trigger false positives.
    const linkText = noFence.replace(/`[^`\n]+`/g, (s) => s.replace(/[^\n]/g, " "));
    const dir = path.dirname(file);

    let m: RegExpExecArray | null;
    linkRe.lastIndex = 0;
    while ((m = linkRe.exec(linkText)) !== null) {
      const url = m[2].trim();
      if (isExternalOrAnchor(url)) continue;
      const target = stripQueryAndAnchor(url);
      const resolved = path.resolve(dir, target);
      if (!fs.existsSync(resolved)) {
        error(repoRel(file), `broken link → \`${url}\``, lineOf(linkText, m.index));
      }
    }

    backtickRe.lastIndex = 0;
    while ((m = backtickRe.exec(noFence)) !== null) {
      const candidate = m[1].trim();
      if (!isCandidateBacktickPath(candidate)) continue;
      const resolved = path.resolve(dir, candidate);
      if (!fs.existsSync(resolved)) {
        // Try resolving from repo root — many nav tables list paths relative to root.
        const alt = path.resolve(REPO_ROOT, candidate);
        if (!fs.existsSync(alt)) {
          error(repoRel(file), `backticked path does not resolve → \`${candidate}\``, lineOf(noFence, m.index));
        }
      }
    }
  }
};

// --- A3. No hardcoded author-local paths ---
// Allowed: ~/<...> shell shorthand. Banned: /Users/<real-name>/..., /home/<real-name>/...
// Placeholder usernames in meta-documentation (`foo`, `bar`, `someone`, `<name>`, ...) are skipped.
const AUTHOR_PATH_RE = /\/(?:Users|home)\/([A-Za-z0-9_.-]+|<[^>]+>)\//g;
const PLACEHOLDER_USERS = new Set([
  "foo", "bar", "baz", "qux", "someone", "someuser", "user", "username",
  "your-username", "you", "yourname",
]);

const checkAuthorPaths = (): void => {
  for (const file of TRACKED_FILES) {
    if (path.resolve(file) === path.resolve(SELF_FILE)) continue;
    if (!/\.(md|ts|tsx|json|sh|yaml|yml)$|\.env\.example$/.test(file)) continue;
    const text = readText(file);
    AUTHOR_PATH_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = AUTHOR_PATH_RE.exec(text)) !== null) {
      const user = m[1];
      if (user.startsWith("<") && user.endsWith(">")) continue; // <name> placeholder
      if (PLACEHOLDER_USERS.has(user)) continue;
      error(
        repoRel(file),
        `hardcoded author-local path \`${m[0]}\` (use \`~/\` or a project-relative path)`,
        lineOf(text, m.index),
      );
    }
  }
};

// --- A3b. No external-repo source pointers ---
// Pointers like `~/topaz/topaz-{contracts,slipstream,interface,v2-subgraph,v3-subgraph}/...`
// are valid only on the author's machine. They belong in `.claude/INTERNAL-SOURCE-POINTERS.md`
// (gitignored), not in public skill files. `~/topaz/topaz-skill/...` is permitted because that
// is THIS skill (users can install it under that path or elsewhere).
const EXTERNAL_REPO_RE = /~\/topaz\/topaz-(contracts|slipstream|interface|v2-subgraph|v3-subgraph)\//g;

const checkNoExternalRepoPointers = (): void => {
  for (const file of TRACKED_FILES) {
    if (path.resolve(file) === path.resolve(SELF_FILE)) continue;
    if (!/\.(md|ts|tsx|json|sh|yaml|yml)$|\.env\.example$/.test(file)) continue;
    const text = readText(file);
    EXTERNAL_REPO_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = EXTERNAL_REPO_RE.exec(text)) !== null) {
      error(
        repoRel(file),
        `external-repo source pointer \`${m[0]}\` — move to .claude/INTERNAL-SOURCE-POINTERS.md (gitignored)`,
        lineOf(text, m.index),
      );
    }
  }
};

// --- A4. No committed secrets / vendored deps ---
const SECRET_BASENAMES = /^(\.env|\.env\.[^.]+|id_rsa(\.pub)?|id_ed25519(\.pub)?|.*\.pem|.*\.key|.*\.keystore)$/;
const VENDOR_BASENAMES_DIR = new Set(["node_modules"]);
const VENDOR_FILE_RE = /^\.pnp\..+$/;

// Yarn 4 caches under .yarn/ that should never be committed (releases/plugins/patches are OK).
const YARN_CACHE_PATHS = [
  /(?:^|\/)\.yarn\/cache(?:\/|$)/,
  /(?:^|\/)\.yarn\/unplugged(?:\/|$)/,
  /(?:^|\/)\.yarn\/build-state\.yml$/,
  /(?:^|\/)\.yarn\/install-state\.gz$/,
];

const checkSecretsAndVendored = (): void => {
  for (const abs of TRACKED_FILES) {
    const base = path.basename(abs);
    const rel = path.relative(REPO_ROOT, abs);
    if (base === ".env.example") continue;
    if (SECRET_BASENAMES.test(base)) {
      error(repoRel(abs), `secret-shaped tracked file (\`${base}\`)`);
    }
    if (VENDOR_FILE_RE.test(base)) {
      error(repoRel(abs), `vendored dep artifact tracked in git (\`${base}\`)`);
    }
    const parts = rel.split(path.sep);
    if (parts.some((p) => VENDOR_BASENAMES_DIR.has(p))) {
      error(repoRel(abs), "tracked file inside a vendored-dependency directory");
    }
    if (YARN_CACHE_PATHS.some((re) => re.test(rel))) {
      error(repoRel(abs), "yarn cache artifact tracked in git (should be gitignored)");
    }
  }
};

// --- A5. Address-set parity ---
// addresses.ts is canonical. Every address declared there MUST appear in both README.md and
// references/addresses.md (case-insensitive). Docs may carry extra addresses (libraries, legacy)
// that the TS config does not export — those are warnings, not errors.

const ADDR_RE = /0x[a-fA-F0-9]{40}/g;
const ADDR_KV_RE = /^\s*([A-Za-z_][\w]*)\s*:\s*["'](0x[a-fA-F0-9]{40})["']/gm;

const parseAddrConfig = (): Map<string, string> => {
  const file = path.join(SCRIPTS_DIR, "src/config/addresses.ts");
  const text = readText(file);
  const out = new Map<string, string>();
  ADDR_KV_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ADDR_KV_RE.exec(text)) !== null) {
    out.set(m[1], m[2].toLowerCase());
  }
  return out;
};

const extractAddressesFromMarkdown = (file: string): Set<string> => {
  const text = readText(file);
  const set = new Set<string>();
  let m: RegExpExecArray | null;
  ADDR_RE.lastIndex = 0;
  while ((m = ADDR_RE.exec(text)) !== null) {
    set.add(m[0].toLowerCase());
  }
  return set;
};

const checkAddressParity = (): void => {
  const config = parseAddrConfig();
  if (config.size === 0) {
    error("scripts/src/config/addresses.ts", "no addresses parsed — ADDR object missing or regex mismatch");
    return;
  }
  const readmeAddrs = extractAddressesFromMarkdown(path.join(REPO_ROOT, "README.md"));
  const refAddrs = extractAddressesFromMarkdown(path.join(REPO_ROOT, "references/addresses.md"));

  for (const [name, addr] of config) {
    if (!readmeAddrs.has(addr)) {
      error(
        "README.md",
        `address for \`ADDR.${name}\` (${addr}) is in scripts/src/config/addresses.ts but not in README.md`,
      );
    }
    if (!refAddrs.has(addr)) {
      error(
        "references/addresses.md",
        `address for \`ADDR.${name}\` (${addr}) is in scripts/src/config/addresses.ts but not in references/addresses.md`,
      );
    }
  }

  // Doc-only addresses (libraries, legacy) → warn so we notice drift.
  const configAddrs = new Set(Array.from(config.values()));
  for (const a of readmeAddrs) {
    if (!configAddrs.has(a)) {
      warn("README.md", `address \`${a}\` appears in README.md but not in scripts/src/config/addresses.ts`);
    }
  }
  for (const a of refAddrs) {
    if (!configAddrs.has(a)) {
      warn(
        "references/addresses.md",
        `address \`${a}\` appears in references/addresses.md but not in scripts/src/config/addresses.ts`,
      );
    }
  }
};

// --- A5b. EIP-55 checksum validity ---
// Every mixed-case 0x-address in the canonical files must be a valid EIP-55 checksum.
// All-lowercase or all-uppercase variants are skipped (legal per spec, just not checksummed).
const CHECKSUM_TARGET_FILES = [
  "scripts/src/config/addresses.ts",
  "scripts/src/config/tokens.ts",
  "README.md",
  "references/addresses.md",
  "references/tokens.md",
  "SKILL.md",
];

const isMixedCaseHex = (a: string): boolean => {
  const hex = a.slice(2);
  return /[a-f]/.test(hex) && /[A-F]/.test(hex);
};

const checkChecksums = (): void => {
  for (const rel of CHECKSUM_TARGET_FILES) {
    const abs = path.join(REPO_ROOT, rel);
    if (!fs.existsSync(abs)) continue;
    const text = readText(abs);
    const seen = new Set<string>();
    ADDR_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = ADDR_RE.exec(text)) !== null) {
      const a = m[0];
      if (!isMixedCaseHex(a)) continue;
      if (seen.has(a)) continue;
      seen.add(a);
      try {
        const canonical = getAddress(a.toLowerCase());
        if (a !== canonical) {
          error(
            rel,
            `bad EIP-55 checksum \`${a}\` — should be \`${canonical}\``,
            lineOf(text, m.index),
          );
        }
      } catch {
        error(rel, `invalid address \`${a}\``, lineOf(text, m.index));
      }
    }
  }
};

// --- A6. Subgraph URL consistency ---
const SUBGRAPH_V2_RE = /https:\/\/api\.goldsky\.com\/api\/public\/[^\s)`'"]+subgraphs\/topaz-v2\/[^\s)`'"]+/g;
const SUBGRAPH_V3_RE = /https:\/\/api\.goldsky\.com\/api\/public\/[^\s)`'"]+subgraphs\/topaz-v3\/[^\s)`'"]+/g;

const REQUIRED_SUBGRAPH_FILES = [
  "README.md",
  "SKILL.md",
  "scripts/.env.example",
  "scripts/src/lib/subgraph.ts",
  "developers/subgraph-recipes.md",
  "developers/DEVELOPERS.md",
  "references/analytics-subgraph.md",
];

const checkSubgraphUrls = (): void => {
  const v2Found = new Map<string, Set<string>>();
  const v3Found = new Map<string, Set<string>>();
  for (const rel of REQUIRED_SUBGRAPH_FILES) {
    const abs = path.join(REPO_ROOT, rel);
    if (!fs.existsSync(abs)) {
      error(rel, "expected file does not exist (subgraph-consistency check)");
      continue;
    }
    const text = readText(abs);
    const v2 = new Set<string>(text.match(SUBGRAPH_V2_RE) ?? []);
    const v3 = new Set<string>(text.match(SUBGRAPH_V3_RE) ?? []);
    if (v2.size === 0) warn(rel, "no v2 subgraph URL found");
    if (v3.size === 0) warn(rel, "no v3 subgraph URL found");
    v2Found.set(rel, v2);
    v3Found.set(rel, v3);
  }
  const uniqV2 = new Set<string>();
  const uniqV3 = new Set<string>();
  for (const set of v2Found.values()) for (const u of set) uniqV2.add(u);
  for (const set of v3Found.values()) for (const u of set) uniqV3.add(u);
  if (uniqV2.size > 1) {
    error("subgraph", `v2 subgraph URL drift: ${Array.from(uniqV2).join(" | ")}`);
  }
  if (uniqV3.size > 1) {
    error("subgraph", `v3 subgraph URL drift: ${Array.from(uniqV3).join(" | ")}`);
  }
};

// --- A7. Brand URL parity ---
// Channel URLs (web/docs/socials/github/assetsRepo) must appear in every "front door"
// surface — README.md, SKILL.md, and references/brand.md.
// Asset deep-links (logoPng, logoSvg, ...) only need to appear in references/brand.md;
// requiring them in README/SKILL would just be clutter.
const BRAND_FRONT_DOOR_FILES = ["README.md", "SKILL.md", "references/brand.md"];
const BRAND_ASSET_HOME = "references/brand.md";

const collectChannelUrls = (): string[] => {
  const out: string[] = [];
  for (const [key, v] of Object.entries(BRAND)) {
    if (key === "assets") continue;
    if (typeof v === "string" && v.startsWith("http")) out.push(v);
  }
  return out;
};

const collectAssetUrls = (): string[] =>
  Object.values(BRAND.assets).filter((v) => typeof v === "string" && v.startsWith("http"));

const checkBrandUrls = (): void => {
  const channelUrls = collectChannelUrls();
  for (const rel of BRAND_FRONT_DOOR_FILES) {
    const abs = path.join(REPO_ROOT, rel);
    if (!fs.existsSync(abs)) {
      error(rel, "expected file does not exist (brand-URL parity check)");
      continue;
    }
    const text = readText(abs);
    for (const url of channelUrls) {
      if (!text.includes(url)) {
        error(rel, `BRAND channel URL \`${url}\` is in scripts/src/config/brand.ts but not in ${rel}`);
      }
    }
  }

  const assetText = fs.existsSync(path.join(REPO_ROOT, BRAND_ASSET_HOME))
    ? readText(path.join(REPO_ROOT, BRAND_ASSET_HOME))
    : "";
  for (const url of collectAssetUrls()) {
    if (!assetText.includes(url)) {
      error(
        BRAND_ASSET_HOME,
        `BRAND asset URL \`${url}\` is in scripts/src/config/brand.ts but not in ${BRAND_ASSET_HOME}`,
      );
    }
  }
};

// --- Run ---
const sectionHeader = (label: string): void => {
  console.log(`\n— ${label} —`);
};

sectionHeader("Frontmatter");
checkFrontmatter();
sectionHeader("Internal links");
checkInternalLinks();
sectionHeader("Author-local paths");
checkAuthorPaths();
sectionHeader("External-repo source pointers");
checkNoExternalRepoPointers();
sectionHeader("Secrets and vendored deps");
checkSecretsAndVendored();
sectionHeader("Address parity");
checkAddressParity();
sectionHeader("EIP-55 checksums");
checkChecksums();
sectionHeader("Subgraph URLs");
checkSubgraphUrls();
sectionHeader("Brand URLs");
checkBrandUrls();

// --- Report ---
const errors = FINDINGS.filter((f) => f.severity === "error");
const warnings = FINDINGS.filter((f) => f.severity === "warn");

const fmt = (f: Finding): string => {
  const at = f.line !== undefined ? `${f.file}:${f.line}` : f.file;
  const tag = f.severity === "error" ? "ERR" : "warn";
  return `  [${tag}] ${at} — ${f.msg}`;
};

console.log("");
if (warnings.length > 0) {
  console.log(`Warnings (${warnings.length}):`);
  for (const w of warnings) console.log(fmt(w));
  console.log("");
}
if (errors.length > 0) {
  console.log(`Errors (${errors.length}):`);
  for (const e of errors) console.log(fmt(e));
  console.log("");
  console.log(`FAIL: ${errors.length} error(s), ${warnings.length} warning(s)`);
  process.exit(1);
}
console.log(`OK: 0 errors, ${warnings.length} warning(s)`);
process.exit(0);
