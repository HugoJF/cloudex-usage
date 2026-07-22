#!/usr/bin/env bash
# Live validation (headless). Packs the PRODUCTION extension and runs it in a
# throwaway gnome-shell-test-tool session against the REAL Codex/Claude logins,
# processes, and endpoints, printing live usage over three refresh cycles.
#
# Makes real authenticated requests with your existing tokens. Non-deterministic,
# so this is NOT part of `npm test`. Credentials pass through via CODEX_HOME /
# CLAUDE_CONFIG_DIR (defaulting to your real dirs); /proc and endpoints are real.
#
#   npm run validate:live
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PKG="$(mktemp -d)"
trap 'rm -rf "$PKG"' EXIT
cd "$ROOT"

gnome-extensions pack --force \
  --schema=schemas/org.gnome.shell.extensions.cloudex-usage.gschema.xml \
  --extra-source=surface-controller.js \
  --extra-source=panel-preferences.js \
  --extra-source=codex-contract.js --extra-source=codex-runtime.js \
  --extra-source=claude-contract.js --extra-source=claude-runtime.js \
  --extra-source=history-store.js --extra-source=history-runtime.js \
  --extra-source=shared \
  --extra-source=../design/system/tokens.json \
  --extra-source=../design/direction-lab/icons \
  --out-dir "$PKG" \
  extension >/dev/null

CODEX_HOME="${CODEX_HOME:-$HOME/.codex}" \
CLAUDE_CONFIG_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}" \
  dbus-run-session -- gnome-shell-test-tool --devkit --disable-animations \
    --extension "$PKG/cloudex-usage@hugo.local.shell-extension.zip" \
    scripts/live-monitor.journey.js 2>&1 \
  | grep --line-buffered "^LIVE:" || {
      echo "no LIVE output — the extension did not report; rerun to see full logs" >&2
      exit 1
  }
