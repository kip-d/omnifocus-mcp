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

# Explicit arg dispatch — reject unknowns so a typo (e.g. --verfiy) can't
# silently skip verification and exit 0 (the silent-success class this fixes).
MODE="install"
case "${1:-}" in
  "")          MODE="install" ;;
  --verify)    MODE="verify" ;;
  --uninstall) uninstall ;;
  *) echo "Unknown argument: $1" >&2
     echo "Usage: $(basename "$0") [--verify | --uninstall]" >&2
     exit 2 ;;
esac

# --- Detect Homebrew bin dir(s) so the baked PATH finds npm/node/npx ----------
# Include every prefix that actually has npm, /opt/homebrew first — same order
# as the wrapper's runtime PATH prepend, so scheduled and manual runs agree.
brew_dirs=()
for d in /opt/homebrew/bin /usr/local/bin; do
  [ -x "$d/npm" ] && brew_dirs+=("$d")
done
if [ ${#brew_dirs[@]} -eq 0 ]; then
  echo "ERROR: npm not found in /opt/homebrew/bin or /usr/local/bin." >&2
  echo "       Install Node via Homebrew, or edit the PATH detection above." >&2
  exit 1
fi
PATH_VALUE="$(IFS=:; printf '%s' "${brew_dirs[*]}"):/usr/bin:/bin:/usr/sbin:/sbin"

# --- 1. Install the wrapper ---------------------------------------------------
mkdir -p "$BIN_DIR"
install -m 0755 "$WRAPPER_SRC" "$WRAPPER_DEST"
echo "Installed wrapper → $WRAPPER_DEST"

# --- 2. Generate the plist from the template ----------------------------------
mkdir -p "$LAUNCH_AGENTS" "$(dirname "$LAUNCHD_LOG")"
# Substituted values are all $HOME-rooted absolute paths and a PATH string of
# the same — none can contain '|' (the sed delimiter), '&', or newlines on
# macOS, so these s||| replacements are safe. Re-check if a less-controlled
# value (e.g. a user-supplied label) is ever substituted here.
sed -e "s|__WRAPPER_PATH__|$WRAPPER_DEST|g" \
    -e "s|__LAUNCHD_LOG__|$LAUNCHD_LOG|g" \
    -e "s|__PATH_VALUE__|$PATH_VALUE|g" \
    "$TEMPLATE" > "$PLIST_DEST"
plutil -lint "$PLIST_DEST" >/dev/null
echo "Installed plist   → $PLIST_DEST"
echo "  PATH = $PATH_VALUE"

# --- 3. (Re)load the job ------------------------------------------------------
# bootout is async; bootstrap can race it and fail ("already bootstrapped" /
# I/O error). Poll until the old instance is gone, then bootstrap with one retry
# so a transient launchd hiccup doesn't abort an otherwise-idempotent install.
launchctl bootout "$GUI/$LABEL" 2>/dev/null || true
for _ in $(seq 1 10); do
  launchctl print "$GUI/$LABEL" >/dev/null 2>&1 || break
  sleep 0.5
done
launchctl bootstrap "$GUI" "$PLIST_DEST" || { sleep 1; launchctl bootstrap "$GUI" "$PLIST_DEST"; }
echo "Loaded job $LABEL (weekly, Sunday 09:00)."

# --- 4. Optional verification -------------------------------------------------
if [ "$MODE" = "verify" ]; then
  echo "Verifying via kickstart (runs the job now through launchd) ..."
  triage="${OF_MCP_REPO_DIR:-$HOME/omnifocus-mcp}/docs/dev/mcp-failure-triage.md"
  before_mtime="$(stat -f %m "$triage" 2>/dev/null || echo 0)"

  launchctl kickstart -k "$GUI/$LABEL"
  # kickstart returns once the job is SPAWNED, not when it exits — and launchd's
  # "last exit code" persists from the PRIOR run until this one ends. So reading
  # the exit code immediately would latch onto a stale value (e.g. a stale 0,
  # masking the very 127 PATH bug --verify exists to catch). Wait for the
  # spawned instance to disappear, then read the exit code.
  pid="$(launchctl print "$GUI/$LABEL" 2>/dev/null | awk '/^[[:space:]]*pid =/{print $NF; exit}')"
  for _ in $(seq 1 60); do
    { [ -n "${pid:-}" ] && kill -0 "$pid" 2>/dev/null; } || break
    sleep 1
  done

  rc="$(launchctl print "$GUI/$LABEL" 2>/dev/null | awk '/last exit code/{print $NF; exit}')"
  after_mtime="$(stat -f %m "$triage" 2>/dev/null || echo 0)"
  echo "  last exit code = ${rc:-unknown} (0 = success; 127 = command not found / PATH bug)"
  if [ "${rc:-}" != "0" ]; then
    echo "  VERIFY FAILED — check $LAUNCHD_LOG and ~/.omnifocus-mcp/diagnose-failures.log" >&2
    exit 1
  fi
  # Corroborate: a real run regenerates the triage doc. exit 0 with an unchanged
  # doc means nothing actually executed (stale exit code) — treat as a failure.
  if [ "$after_mtime" = "$before_mtime" ]; then
    echo "  VERIFY FAILED — exit 0 but triage doc unchanged ($triage); run did not execute." >&2
    exit 1
  fi
  echo "  OK (job exited 0 and regenerated the triage doc)."
fi

echo
echo "Done. Inspect status:  launchctl list | grep diagnose"
echo "Manual run:            launchctl kickstart -p $GUI/$LABEL"
echo "Durable log:           ~/.omnifocus-mcp/diagnose-failures.log"
