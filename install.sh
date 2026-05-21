#!/usr/bin/env bash
# Topaz Dex agent skill — installer.
#
# This repo IS the skill package. Any agent that can read a SKILL.md plus a directory
# of references and scripts can consume it. The destination directory below is just
# where the script writes the clone — pick whatever your agent reads skills from.
#
# Usage:
#   bash install.sh                            # auto-detect dest from existing agent dirs
#   bash install.sh <dest>                     # custom dest
#   DEST=<dest> bash install.sh                # same, via env
#
# Auto-detection (when no arg/env given) checks for existing agent skill directories
# in alphabetical order: ~/.claude/skills, ~/.config/opencode/skills, ~/.hermes/skills.
# If none exist, falls back to ~/.local/share/topaz-skill and prints a notice that
# you'll need to tell your agent where to find it.
#
# Common conventions per runtime:
#   Claude Code (user-wide)      ~/.claude/skills/topaz
#   Claude Code (project-local)  <your-project>/.claude/skills/topaz
#   Hermes                       ~/.hermes/skills/defi/topaz
#   OpenCode                     ~/.config/opencode/skills/topaz
#   Codex / generic / standalone anywhere — point your agent at the path explicitly
#
# Or, directly from the web:
#   curl -fsSL https://raw.githubusercontent.com/topazdex/agent-skill/main/install.sh | bash
#   curl -fsSL https://raw.githubusercontent.com/topazdex/agent-skill/main/install.sh | bash -s -- /path/of/your/choice

set -euo pipefail

REPO="${REPO:-https://github.com/topazdex/agent-skill.git}"

say() { printf '\033[1;34m[topaz-skill]\033[0m %s\n' "$*"; }
ok()  { printf '\033[1;32m[topaz-skill]\033[0m %s\n' "$*"; }
warn(){ printf '\033[1;33m[topaz-skill]\033[0m %s\n' "$*" >&2; }
err() { printf '\033[1;31m[topaz-skill]\033[0m %s\n' "$*" >&2; }

# Auto-detect destination based on which agent's skill directory already exists.
# Order is alphabetical to avoid favoring any one runtime. Explicit arg or DEST env
# always wins.
#
# Writes both DEST and DEST_REASON as globals (no subshell — needed so we can
# echo the reason back to the user further down).
detect_dest() {
  if [ -d "$HOME/.claude/skills" ]; then
    DEST="$HOME/.claude/skills/topaz"
    DEST_REASON="auto-detected ~/.claude/skills/"
    return
  fi
  if [ -d "$HOME/.config/opencode/skills" ]; then
    DEST="$HOME/.config/opencode/skills/topaz"
    DEST_REASON="auto-detected ~/.config/opencode/skills/"
    return
  fi
  if [ -d "$HOME/.hermes/skills" ]; then
    DEST="$HOME/.hermes/skills/defi/topaz"
    DEST_REASON="auto-detected ~/.hermes/skills/"
    return
  fi
  # No agent skill directory found — fall back to a generic location.
  DEST="$HOME/.local/share/topaz-skill"
  DEST_REASON="fallback (no recognized agent skill dir found)"
}

if [ $# -gt 0 ]; then
  DEST="$1"
  DEST_REASON="explicit (positional arg)"
elif [ -n "${DEST:-}" ]; then
  DEST_REASON="explicit (DEST env)"
else
  detect_dest
fi

# Expand ~ in DEST if a user passed it quoted.
DEST="${DEST/#\~/$HOME}"

say "destination: $DEST  (${DEST_REASON})"

command -v git >/dev/null 2>&1 || { err "git is required but not found"; exit 1; }

mkdir -p "$(dirname "$DEST")"

if [ -d "$DEST/.git" ]; then
  say "skill already installed at $DEST — fast-forwarding"
  git -C "$DEST" fetch --tags origin
  git -C "$DEST" pull --ff-only
else
  say "cloning $REPO -> $DEST"
  git clone "$REPO" "$DEST"
fi

cd "$DEST"

# Optional: install yarn deps + run validator + smoke if yarn is available.
# Users with a read-only skill consumer (e.g. Hermes loading SKILL.md only) can skip this.
if command -v yarn >/dev/null 2>&1 && [ -f scripts/package.json ]; then
  say "installing scripts/ dependencies (yarn install --immutable)"
  ( cd scripts && yarn install --immutable )

  say "running validator (yarn validate)"
  ( cd scripts && yarn validate )

  if [ -f scripts/.env ] || [ -n "${BSC_RPC_URL:-}" ]; then
    say "running smoke test (yarn smoke)"
    ( cd scripts && yarn smoke ) || warn "smoke test reported issues — review output above"
  else
    warn "skipping yarn smoke — no scripts/.env and no BSC_RPC_URL in env. Run \`cd $DEST/scripts && cp .env.example .env\`, set BSC_RPC_URL, then \`yarn smoke\`."
  fi
else
  warn "yarn not found or scripts/package.json missing — skipping JS install + smoke. The agent will still be able to read SKILL.md and references/."
fi

VERSION="$(grep -E '^version:' SKILL.md | head -1 | awk '{print $2}' || true)"
ok "Topaz agent skill installed at: $DEST"
[ -n "$VERSION" ] && ok "version: $VERSION"

case "$DEST" in
  "$HOME/.claude/skills/topaz")
    ok "next: Claude Code reads ~/.claude/skills/* automatically — no further config needed."
    ;;
  "$HOME/.config/opencode/skills/topaz")
    ok "next: point OpenCode at $DEST (see your OpenCode skill loader docs)."
    ;;
  "$HOME/.hermes/skills/defi/topaz")
    ok "next: load via Hermes — the skill is at $DEST."
    ;;
  "$HOME/.local/share/topaz-skill")
    warn "no recognized agent skill directory exists on this host, so the skill landed at $DEST."
    warn "either symlink/move it into your agent's skill directory, or configure your agent to read from $DEST."
    warn "common targets: ~/.claude/skills/topaz, ~/.config/opencode/skills/topaz, ~/.hermes/skills/defi/topaz."
    ;;
  *)
    ok "next: configure your agent to load skills from $DEST."
    ;;
esac
