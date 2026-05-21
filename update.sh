#!/usr/bin/env bash
# Topaz Dex agent skill — updater.
#
# Usage:
#   bash update.sh                # update the install at ~/.claude/skills/topaz
#   bash update.sh <dest>         # update a custom install location
#   DEST=<dest> bash update.sh    # same, via env

set -euo pipefail

DEST="${1:-${DEST:-$HOME/.claude/skills/topaz}}"
DEST="${DEST/#\~/$HOME}"

say() { printf '\033[1;34m[topaz-skill]\033[0m %s\n' "$*"; }
ok()  { printf '\033[1;32m[topaz-skill]\033[0m %s\n' "$*"; }
warn(){ printf '\033[1;33m[topaz-skill]\033[0m %s\n' "$*" >&2; }
err() { printf '\033[1;31m[topaz-skill]\033[0m %s\n' "$*" >&2; }

if [ ! -d "$DEST/.git" ]; then
  err "no git repo at $DEST — run install.sh first"
  exit 1
fi

cd "$DEST"

BEFORE="$(grep -E '^version:' SKILL.md | head -1 | awk '{print $2}' || echo unknown)"
say "current version: $BEFORE"

say "fetching tags from origin"
git fetch --tags origin

LATEST_TAG="$(git tag --sort=-v:refname | head -1 || true)"
[ -n "$LATEST_TAG" ] && say "latest remote tag: $LATEST_TAG"

say "fast-forwarding current branch"
git pull --ff-only

AFTER="$(grep -E '^version:' SKILL.md | head -1 | awk '{print $2}' || echo unknown)"
say "updated version: $AFTER"

if command -v yarn >/dev/null 2>&1 && [ -f scripts/package.json ]; then
  say "refreshing scripts/ dependencies (yarn install --immutable)"
  ( cd scripts && yarn install --immutable )

  say "running validator"
  ( cd scripts && yarn validate )

  if [ -f scripts/.env ] || [ -n "${BSC_RPC_URL:-}" ]; then
    say "running smoke test"
    ( cd scripts && yarn smoke ) || warn "smoke reported issues — review output above"
  else
    warn "skipping yarn smoke — no scripts/.env and no BSC_RPC_URL in env."
  fi
else
  warn "yarn not found — skipping JS validate/smoke. SKILL.md and references/ are still up to date."
fi

if [ "$BEFORE" = "$AFTER" ]; then
  ok "Topaz skill already on the latest version ($AFTER)"
else
  ok "Topaz skill updated: $BEFORE -> $AFTER"
fi
