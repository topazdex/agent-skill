#!/usr/bin/env bash
# Topaz Dex agent skill — update checker.
#
# Compares the local SKILL.md version against the remote skill.json manifest.
# Exit code: 0 = up to date, 10 = update available, 1 = error.
#
# Usage:
#   bash tools/check_update.sh
#   MANIFEST_URL=https://raw.githubusercontent.com/topazdex/agent-skill/main/skill.json bash tools/check_update.sh

set -euo pipefail

MANIFEST_URL="${MANIFEST_URL:-https://raw.githubusercontent.com/topazdex/agent-skill/main/skill.json}"
SKILL_FILE="${SKILL_FILE:-SKILL.md}"

command -v curl >/dev/null 2>&1 || { echo "curl is required"; exit 1; }

if [ ! -f "$SKILL_FILE" ]; then
  echo "no $SKILL_FILE in current directory — run this from the installed skill root"
  exit 1
fi

LOCAL_VERSION="$(grep -E '^version:' "$SKILL_FILE" | head -1 | awk '{print $2}' || true)"
if [ -z "$LOCAL_VERSION" ]; then
  echo "could not read local version from $SKILL_FILE (expected a \`version: X.Y.Z\` line in the frontmatter)"
  exit 1
fi

REMOTE_JSON="$(curl -fsSL "$MANIFEST_URL")" || { echo "failed to fetch $MANIFEST_URL"; exit 1; }

# Prefer jq when available; fall back to a small grep+sed parse if not.
if command -v jq >/dev/null 2>&1; then
  REMOTE_VERSION="$(printf '%s' "$REMOTE_JSON" | jq -r '.version')"
else
  REMOTE_VERSION="$(printf '%s' "$REMOTE_JSON" | grep -E '"version"[[:space:]]*:' | head -1 | sed -E 's/.*"version"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/')"
fi

if [ -z "$REMOTE_VERSION" ] || [ "$REMOTE_VERSION" = "null" ]; then
  echo "could not parse .version from $MANIFEST_URL"
  exit 1
fi

echo "local=$LOCAL_VERSION"
echo "remote=$REMOTE_VERSION"

if [ "$LOCAL_VERSION" = "$REMOTE_VERSION" ]; then
  echo "Topaz skill is up to date."
  exit 0
fi

echo "Topaz skill update available: $LOCAL_VERSION -> $REMOTE_VERSION"
echo "Run: bash update.sh   (or: git pull --ff-only)"
exit 10
