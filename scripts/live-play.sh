#!/usr/bin/env bash
# Interactive playground. Opens the SAME gnome-shell-test-tool session the test suite
# uses (a clickable window in your session), loaded with the PRODUCTION extension
# against your REAL Codex/Claude logins, and keeps it open so you can click around the
# panel item, popup, history chart, range selector, and settings. Close the window to
# end it. Uses only the tool's --extension flag — it does NOT touch your real GNOME
# session, dconf, or installed extensions.
#
#   npm run validate:play      (run from a terminal in your graphical session)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
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
  --out-dir "$WORK" \
  extension >/dev/null

# Seed a little history so the trajectory chart has something to draw immediately;
# live refreshes then extend it. Timestamps are relative to now.
HIST="$WORK/history"
mkdir -p "$HIST"
node -e '
  const fs = require("fs");
  const now = Date.now();
  const at = h => now - h * 3600 * 1000;
  // Points spanning ~40 days so every range (1h..30d) has coverage on open.
  const hours = [960, 192, 24, 6, 3, 1];
  const curve = base => hours.map((h, i) => [at(h), Math.round(base + i * 4)]);
  fs.writeFileSync(process.argv[1], JSON.stringify({
    version: 1,
    windows: {
      "claude:short": curve(52),
      "claude:weekly": curve(4),
      "codex:weekly": curve(20),
    },
  }));
' "$HIST/history.json"

echo "opening playground window — close it to exit"
CODEX_HOME="${CODEX_HOME:-$HOME/.codex}" \
CLAUDE_CONFIG_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}" \
CLAUDEX_HISTORY_DIR="$HIST" \
  dbus-run-session -- gnome-shell-test-tool --devkit \
    --extension "$WORK/claudex-usage@hugo.local.shell-extension.zip" \
    scripts/live-play.journey.js
