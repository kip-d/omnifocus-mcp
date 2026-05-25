#!/usr/bin/env bash
# install-diagnose-schedule.sh — deploy the weekly diagnose-failures launchd job.
#
# Installs the canonical wrapper (scripts/ops/of-mcp-diagnose) to ~/bin and a
# launchd plist (generated from the .template) to ~/Library/LaunchAgents, then
# (re)loads the job. Idempotent: safe to re-run after editing the canonical
# sources. See docs/dev/mcp-failure-diagnosis.md § Scheduling.
#
# Usage:
#   scripts/ops/install-diagnose-schedule.sh            # install / reload
#   scripts/ops/install-diagnose-schedule.sh --verify   # also kickstart + check
#   scripts/ops/install-diagnose-schedule.sh --uninstall # bootout + remove plist
#
# Env overrides:
#   OF_MCP_BIN_DIR   (default ~/bin)             where the wrapper is installed
#   OF_MCP_REPO_DIR  (default ~/omnifocus-mcp)   prod checkout the job runs against
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LABEL="com.omnifocus-mcp.diagnose"
PLIST_NAME="$LABEL.plist"
TEMPLATE="$SCRIPT_DIR/$PLIST_NAME.template"
WRAPPER_SRC="$SCRIPT_DIR/of-mcp-diagnose"

BIN_DIR="${OF_MCP_BIN_DIR:-$HOME/bin}"
LAUNCH_AGENTS="$HOME/Library/LaunchAgents"
PLIST_DEST="$LAUNCH_AGENTS/$PLIST_NAME"
WRAPPER_DEST="$BIN_DIR/of-mcp-diagnose"
LAUNCHD_LOG="$HOME/.omnifocus-mcp/diagnose-failures-launchd.log"
GUI="gui/$(id -u)"

uninstall() {
  echo "Unloading $LABEL ..."
  launchctl bootout "$GUI/$LABEL" 2>/dev/null || echo "  (was not loaded)"
  rm -f "$PLIST_DEST" && echo "Removed $PLIST_DEST"
  echo "Wrapper left in place at $WRAPPER_DEST (delete manually if desired)."
  exit 0
}

[ "${1:-}" = "--uninstall" ] && uninstall

# --- Detect Homebrew bin dir so the baked PATH finds npm/node/npx -------------
BREW_BIN=""
for d in /opt/homebrew/bin /usr/local/bin; do
  if [ -x "$d/npm" ]; then BREW_BIN="$d"; break; fi
done
if [ -z "$BREW_BIN" ]; then
  echo "ERROR: npm not found in /opt/homebrew/bin or /usr/local/bin." >&2
  echo "       Install Node via Homebrew, or edit the PATH detection above." >&2
  exit 1
fi
PATH_VALUE="$BREW_BIN:/usr/bin:/bin:/usr/sbin:/sbin"

# --- 1. Install the wrapper ---------------------------------------------------
mkdir -p "$BIN_DIR"
install -m 0755 "$WRAPPER_SRC" "$WRAPPER_DEST"
echo "Installed wrapper → $WRAPPER_DEST"

# --- 2. Generate the plist from the template ----------------------------------
mkdir -p "$LAUNCH_AGENTS" "$(dirname "$LAUNCHD_LOG")"
sed -e "s|__WRAPPER_PATH__|$WRAPPER_DEST|g" \
    -e "s|__LAUNCHD_LOG__|$LAUNCHD_LOG|g" \
    -e "s|__PATH_VALUE__|$PATH_VALUE|g" \
    "$TEMPLATE" > "$PLIST_DEST"
plutil -lint "$PLIST_DEST" >/dev/null
echo "Installed plist   → $PLIST_DEST"
echo "  PATH = $PATH_VALUE"

# --- 3. (Re)load the job ------------------------------------------------------
launchctl bootout "$GUI/$LABEL" 2>/dev/null || true
launchctl bootstrap "$GUI" "$PLIST_DEST"
echo "Loaded job $LABEL (weekly, Sunday 09:00)."

# --- 4. Optional verification -------------------------------------------------
if [ "${1:-}" = "--verify" ]; then
  echo "Verifying via kickstart (runs the job now through launchd) ..."
  before="$(date +%s)"
  launchctl kickstart -p "$GUI/$LABEL"
  # Wait for the run to finish (triage doc regeneration), up to ~30s.
  for _ in $(seq 1 30); do
    sleep 1
    rc="$(launchctl list | awk -v l="$LABEL" '$3==l {print $2}')"
    [ "${rc:-}" = "0" ] && break
  done
  rc="$(launchctl list | awk -v l="$LABEL" '$3==l {print $2}')"
  echo "  last exit code = ${rc:-unknown} (0 = success; 127 = command not found / PATH bug)"
  if [ "${rc:-}" != "0" ]; then
    echo "  VERIFY FAILED — check $LAUNCHD_LOG and ~/.omnifocus-mcp/diagnose-failures.log" >&2
    exit 1
  fi
  echo "  OK."
  unset before
fi

echo
echo "Done. Inspect status:  launchctl list | grep diagnose"
echo "Manual run:            launchctl kickstart -p $GUI/$LABEL"
echo "Durable log:           ~/.omnifocus-mcp/diagnose-failures.log"
