#!/usr/bin/env bash
# Interactive live session. Installs the PRODUCTION extension into a throwaway XDG
# sandbox and opens a nested GNOME Shell window — real Codex/Claude logins, real
# endpoints — that you can click around in (panel item, popup, history chart, range
# switch, settings) WITHOUT touching your real GNOME session or logging out.
#
# Run from a terminal inside your graphical session:
#   bash scripts/live-nested.sh      (or: npm run validate:nested)
# Close the nested Shell window to end the session; the sandbox is then removed.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SANDBOX="$(mktemp -d)"
echo "sandbox: $SANDBOX (removed on exit)"
trap 'rm -rf "$SANDBOX"' EXIT

# Isolate config/data so the install and its enablement never reach the real session.
export XDG_DATA_HOME="$SANDBOX/data"
export XDG_CONFIG_HOME="$SANDBOX/config"
export XDG_CACHE_HOME="$SANDBOX/cache"
export XDG_STATE_HOME="$SANDBOX/state"
mkdir -p "$XDG_DATA_HOME" "$XDG_CONFIG_HOME" "$XDG_CACHE_HOME" "$XDG_STATE_HOME"

# Real credentials; /proc and endpoints stay real. This is the whole passthrough.
export CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"
export CLAUDE_CONFIG_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"

cd "$ROOT"
gnome-extensions pack --force \
  --schema=schemas/org.gnome.shell.extensions.claudex-usage.gschema.xml \
  --extra-source=surface-controller.js \
  --extra-source=panel-preferences.js \
  --extra-source=codex-contract.js --extra-source=codex-runtime.js \
  --extra-source=claude-contract.js --extra-source=claude-runtime.js \
  --extra-source=history-store.js --extra-source=history-runtime.js \
  --extra-source=shared \
  --extra-source=../design/system/tokens.json \
  --extra-source=../design/direction-lab/icons \
  --out-dir "$SANDBOX" \
  extension >/dev/null

gnome-extensions install --force \
  "$SANDBOX/claudex-usage@hugo.local.shell-extension.zip"
gsettings set org.gnome.shell enabled-extensions "['claudex-usage@hugo.local']"
gsettings set org.gnome.shell disable-extension-version-validation true

echo "launching nested GNOME Shell — close its window to exit"
dbus-run-session -- gnome-shell --nested --wayland
