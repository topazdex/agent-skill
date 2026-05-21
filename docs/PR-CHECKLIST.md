# Topaz Skill — PR Checklist

Reviewer-facing checklist. Every box below must be ticked before a PR merges to `main`. The list mirrors the closed-out priority-1 items in [`../README.md`](../README.md).

Run from the repo root unless otherwise noted.

## Required for every PR

- [ ] **`SKILL.md` frontmatter validates** — `name` + `description` present, description ≤ 1024 chars. Covered by `yarn validate` (frontmatter section).
- [ ] **No secrets, vendored deps, or build artifacts staged** — no `.env`, no private keys, no `node_modules/`, no `.pnp.*`, no `.yarn/{cache,unplugged,build-state.yml,install-state.gz}`. Covered by `yarn validate` (secrets-and-vendored section).
- [ ] **No author-local paths or external-repo source pointers** — no `/Users/<x>/...`, no `/home/<x>/...`, no `~/topaz/topaz-{contracts,slipstream,interface,v2-subgraph,v3-subgraph}/...`. Those live in `.claude/INTERNAL-SOURCE-POINTERS.md` (gitignored). Covered by `yarn validate`.
- [ ] **`yarn install --immutable` succeeds from the lockfile** — run inside `scripts/`. No lockfile drift, no missing peers.
- [ ] **`yarn build` clean** — `tsc --noEmit` exits 0 inside `scripts/`. No `any`, no `@ts-ignore`, no suppressed errors.
- [ ] **`yarn validate` clean** — 0 errors, 0 warnings across all 9 categories (frontmatter, internal links, author-local paths, external-repo pointers, secrets/vendored, address parity, EIP-55 checksums, subgraph URLs, brand URLs).
- [ ] **`yarn test` passes** — every vitest suite green, no `.skip`, no `.todo` introduced without justification.
- [ ] **`yarn smoke` passes against a live BSC RPC** — all 9 checks PASS. If any FAIL, fix the underlying drift (stale address, broken RPC, dead gauge) before merging.
- [ ] **Golden tests pass** — `quotes.test.ts`, `apr.test.ts`, `epoch.test.ts`, `path.test.ts`. Bumping a golden requires a one-line justification in the PR description.

## Required when the PR touches canonical data

- [ ] **Address tables agree across `scripts/src/config/addresses.ts`, `README.md`, and `references/addresses.md`** — case-insensitive, byte-for-byte. Enforced by `yarn validate` (address-parity + EIP-55 sections).
- [ ] **New addresses use the correct EIP-55 checksum** — `ethers.getAddress(addr) === addr`. Enforced by `yarn validate`.
- [ ] **Subgraph URLs match across `README.md`, `SKILL.md`, `scripts/.env.example`, `scripts/src/lib/subgraph.ts`, `developers/subgraph-recipes.md`, `developers/DEVELOPERS.md`, `references/analytics-subgraph.md`** — enforced by `yarn validate`.
- [ ] **`BRAND` channel URLs (web/docs/X/TG/GitHub/assetsRepo) appear in `README.md`, `SKILL.md`, and `references/brand.md`; asset URLs appear in `references/brand.md`** — enforced by `yarn validate`.

## Required when the PR touches docs or examples

- [ ] **All `developers/*.md`, `references/*.md`, `examples/*.md`, `evals/*.md` links resolve** — markdown links + backticked relative paths. Enforced by `yarn validate`.
- [ ] **Eval prompts reviewed** — if the PR changes builder shape, route selection, write CLIs, or refusal scope, re-read `evals/PROMPTS.md` and confirm the expected behavior still matches. Manual until automation lands.

## Required when the PR touches write paths or risky surface

- [ ] **Default path is read/quote/calldata, not broadcast** — any new write helper requires explicit `PRIVATE_KEY` and explicit user confirmation (or `--yes` on CLIs).
- [ ] **New `BuiltSwapTx`-shaped return values carry `quotedAt` and `deadline`** so frontends can detect stale quotes.
- [ ] **Slippage cannot default to zero on a user-facing path** — `normalizeAndValidate` already enforces `0 ≤ slippageBps ≤ 10000`; if you add a new builder, route it through the same normalizer.

## Recommended (not blocking)

- [ ] Fresh install into a temp directory and run `yarn install && yarn validate && yarn test && yarn smoke`. Catches lockfile-only-on-CI failures.
- [ ] Spot-check one read CLI (`yarn tsx src/cli/stats.ts pool 0x<known-pool>`) on a real address.
- [ ] If you bumped an ABI, confirm `scripts/src/lib/abis.ts` re-loads the new JSON (FS-based loader, no rebuild needed).

## Bumping a golden

Goldens (`apr.test.ts`, `quotes.test.ts`, `epoch.test.ts`, `path.test.ts`'s "encodes the expected hex layout") freeze invariants. Changing one means either:

1. The underlying formula or contract behavior intentionally changed → update the golden and explain in the PR description.
2. You introduced a bug → fix the code, not the test.

Never update a golden "to make CI green" without identifying which of (1) or (2) applies.
