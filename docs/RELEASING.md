# Releasing the Topaz Agent Skill

Releases are fully automated. The only human action is choosing the bump type.

## One command

```bash
cd scripts
yarn release patch --apply         # 1.0.0 -> 1.0.1, then commit + tag + push
yarn release minor --apply         # 1.0.0 -> 1.1.0
yarn release major --apply         # 1.0.0 -> 2.0.0
yarn release 1.2.3 --apply         # explicit version
```

That's it. The CLI:

1. Checks the working tree is clean and you're on `main`.
2. Reads the current version from `SKILL.md` + `skill.json` (refuses to release if they disagree).
3. Bumps the version in **`SKILL.md`** frontmatter, **`skill.json`**, and **`CHANGELOG.md`** (promotes `## [Unreleased]` into the new `## [X.Y.Z] — YYYY-MM-DD` section and updates the comparison links at the bottom).
4. Runs `yarn validate`, `yarn build`, `yarn test`.
5. With `--apply`: stages the three files, commits as `release: vX.Y.Z`, tags `vX.Y.Z`, and pushes `main --follow-tags`.

GitHub Actions takes over from there (`.github/workflows/release.yml`):

1. Re-runs `yarn validate`, `yarn build`, `yarn test` against the tagged commit.
2. Re-verifies that the tag, `SKILL.md`, `skill.json`, and `README.md` all agree on the version.
3. Extracts release notes from `CHANGELOG.md` for the tagged version.
4. Appends install instructions to the notes.
5. Creates (or updates) the GitHub Release.

That's the whole flow. The website (`topazdex.com`) auto-fetches `SKILL.md` and `skill.json` from `raw.githubusercontent.com` on its own schedule, so once the release is published the site picks up the new version automatically — no handshake from this workflow required.

## Without `--apply`

`yarn release patch` (no `--apply`) writes the files and prints the exact commands you'd need to run by hand. Useful if you want to review the diff before pushing:

```bash
yarn release patch
git diff SKILL.md skill.json README.md CHANGELOG.md
# happy with it? then:
git add SKILL.md skill.json README.md CHANGELOG.md
git commit -m "release: v2.1.1"
git tag -a v2.1.1 -m "Topaz agent skill v2.1.1"
git push origin main --follow-tags
```

## Other flags

- `--dry-run` — print what the new version would be without writing anything.
- `--allow-dirty` — skip the working-tree-clean guard (rarely useful; mostly for re-running after a tag-only retry).
- `--branch <name>` — release from a branch other than `main`.

## What changes between releases

In CHANGELOG.md, accumulate changes under the `## [Unreleased]` heading as you merge PRs. When you cut the release, the CLI promotes everything under `## [Unreleased]` into the new versioned section automatically. If `## [Unreleased]` is empty when you release, the new section will be empty too — the CLI prints a warning, but doesn't refuse.

## Versioning policy

See `CHANGELOG.md` top matter for the patch/minor/major rules. Summary:

- **patch** — typo/link/address-metadata fixes; non-breaking doc clarifications.
- **minor** — new helpers, new workflows, new examples, new evals, additive ABI/address entries.
- **major** — breaking helper APIs, renamed install paths, manifest schema bumps, removal of previously documented workflows.

## Website propagation

The website (`topazdex.com`) auto-fetches `SKILL.md` and `skill.json` from `raw.githubusercontent.com` on its own schedule. After a release lands here, the site picks up the new version on its next pull — no action needed from this repo.

If a future deployment wants webhook-driven sync instead of polling, `docs/website-sync.yml.example` has a copy-paste-ready GitHub Actions template that listens for a `repository_dispatch` event. Not wired into the current `release.yml`; uncomment and add the appropriate secret/variable if you want it.

## Recovering from a bad release

If you tagged a release and CI catches a problem:

1. Delete the bad tag locally and remotely:
   ```bash
   git tag -d vX.Y.Z
   git push origin :refs/tags/vX.Y.Z
   ```
2. Delete the GitHub release if it was created (`gh release delete vX.Y.Z`).
3. Fix the problem on `main`.
4. Re-run `yarn release <same-version> --apply --allow-dirty` (if the version-bump commit is still on main, you can just re-tag and push: `git tag vX.Y.Z && git push origin --tags`).

Never rewrite a tag that's already been consumed downstream — bump the patch number instead.
