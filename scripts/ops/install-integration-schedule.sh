#!/usr/bin/env bash
# install-integration-schedule.sh — deploy the weekly integration-suite launchd job.
#
# Installs the canonical wrapper (scripts/ops/of-mcp-integration) to ~/bin and a
# launchd plist (generated from the .template) to ~/Library/LaunchAgents, then
# (re)loads the job. Idempotent: safe to re-run after editing the canonical
# sources. Sibling of install-diagnose-schedule.sh and deliberately shaped the
# same way. See tests/integration/README.md § Scheduled runs (OMN-302).
#
# Usage:
#   scripts/ops/install-integration-schedule.sh            # install / reload
#   scripts/ops/install-integration-schedule.sh --verify   # also kickstart + check
#   scripts/ops/install-integration-schedule.sh --uninstall # bootout + remove plist
#
# Env overrides:
#   OF_MCP_BIN_DIR   (default ~/bin)             where the wrapper is installed
#   OF_MCP_REPO_DIR  (default ~/omnifocus-mcp)   prod checkout the job runs against
#
# NOTE: --verify runs the FULL suite through launchd (~15 min) and writes to the
# real OmniFocus database. It is the only way to prove the job actually works —
# a plist that loads is not a job that runs — but it is not a quick check.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LABEL="com.omnifocus-mcp.integration"
PLIST_NAME="$LABEL.plist"
TEMPLATE="$SCRIPT_DIR/$PLIST_NAME.template"
WRAPPER_SRC="$SCRIPT_DIR/of-mcp-integration"

BIN_DIR="${OF_MCP_BIN_DIR:-$HOME/bin}"
LAUNCH_AGENTS="$HOME/Library/LaunchAgents"
PLIST_DEST="$LAUNCH_AGENTS/$PLIST_NAME"
WRAPPER_DEST="$BIN_DIR/of-mcp-integration"
LAUNCHD_LOG="$HOME/.omnifocus-mcp/integration-launchd.log"
RUN_LOG="$HOME/.omnifocus-mcp/integration.log"
GUI="gui/$(id -u)"

uninstall() {
  echo "Unloading $LABEL ..."
  launchctl bootout "$GUI/$LABEL" 2>/dev/null || echo "  (was not loaded)"
  rm -f "$PLIST_DEST" && echo "Removed $PLIST_DEST"
  echo "Wrapper left in place at $WRAPPER_DEST (delete manually if desired)."
  exit 0
}

# Explicit arg dispatch — reject unknowns so a typo (e.g. --verfiy) can't
# silently skip verification and exit 0 (the silent-success class this guards).
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
# Same order as the wrapper's runtime PATH prepend, so scheduled and manual runs
# resolve to the same prefix.
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
# Substituted values are all $HOME-rooted absolute paths and a PATH string of the
# same — none can contain '|' (the sed delimiter), '&', or newlines on macOS.
sed -e "s|__WRAPPER_PATH__|$WRAPPER_DEST|g" \
    -e "s|__LAUNCHD_LOG__|$LAUNCHD_LOG|g" \
    -e "s|__PATH_VALUE__|$PATH_VALUE|g" \
    "$TEMPLATE" > "$PLIST_DEST"
plutil -lint "$PLIST_DEST" >/dev/null
echo "Installed plist   → $PLIST_DEST"
echo "  PATH = $PATH_VALUE"

# --- 3. (Re)load the job ------------------------------------------------------
# bootout is async; bootstrap can race it. Poll until the old instance is gone,
# then bootstrap with one retry so a transient hiccup doesn't abort the install.
launchctl bootout "$GUI/$LABEL" 2>/dev/null || true
for _ in $(seq 1 10); do
  launchctl print "$GUI/$LABEL" >/dev/null 2>&1 || break
  sleep 0.5
done
launchctl bootstrap "$GUI" "$PLIST_DEST" || { sleep 1; launchctl bootstrap "$GUI" "$PLIST_DEST"; }
echo "Loaded job $LABEL (weekly, Saturday 08:00)."

# --- 4. Optional verification -------------------------------------------------
if [ "$MODE" = "verify" ]; then
  echo "Verifying via kickstart (runs the FULL suite now through launchd, ~15 min) ..."
  before_mtime="$(stat -f %m "$RUN_LOG" 2>/dev/null || echo 0)"

  launchctl kickstart -k "$GUI/$LABEL"
  # kickstart returns once the job is SPAWNED, not when it exits — and launchd's
  # "last exit code" persists from the PRIOR run until this one ends. Reading it
  # immediately would latch a stale value (e.g. a stale 0, masking the very 127
  # PATH bug --verify exists to catch). Wait for the instance to disappear first.
  # Budget covers build + ~15 min suite + cleanup scan, polled at 5s.
  pid="$(launchctl print "$GUI/$LABEL" 2>/dev/null | awk '/^[[:space:]]*pid =/{print $NF; exit}')"
  for _ in $(seq 1 360); do
    { [ -n "${pid:-}" ] && kill -0 "$pid" 2>/dev/null; } || break
    sleep 5
  done

  rc="$(launchctl print "$GUI/$LABEL" 2>/dev/null | awk '/last exit code/{print $NF; exit}')"
  after_mtime="$(stat -f %m "$RUN_LOG" 2>/dev/null || echo 0)"
  echo "  last exit code = ${rc:-unknown} (0 = suite passed; 127 = PATH bug)"

  # Corroborate execution BEFORE judging the code. An unchanged run log means
  # nothing executed, so a 0 here is stale rather than green — check this first
  # so "exit 0 + didn't run" can never read as success.
  if [ "$after_mtime" = "$before_mtime" ]; then
    echo "  VERIFY FAILED — run log unchanged ($RUN_LOG); the job did not execute." >&2
    exit 1
  fi

  status_line="$(grep -aE '^STATUS: ' "$RUN_LOG" | tail -1 || true)"
  leak_line="$(grep -aE '^LEAK: ' "$RUN_LOG" | tail -1 || true)"
  echo "  ${status_line:-STATUS: (none recorded)}"
  echo "  ${leak_line:-LEAK: (none recorded)}"

  # A WEDGED run is not a pass and not a failure: the job worked, the
  # environment didn't. Say so plainly rather than reporting green.
  case "$status_line" in
    *WEDGED*)
      echo "  VERIFY INCONCLUSIVE — OmniFocus was unreachable, so the suite never ran." >&2
      echo "  The job itself is installed and executed correctly. Re-verify once OmniFocus responds." >&2
      exit 3 ;;
  esac

  if [ "${rc:-}" != "0" ]; then
    echo "  VERIFY FAILED — see $RUN_LOG and $LAUNCHD_LOG" >&2
    exit 1
  fi
  echo "  OK (job executed and the suite passed)."
fi

echo
echo "Done. Inspect status:  launchctl list | grep integration"
echo "Manual run:            launchctl kickstart -p $GUI/$LABEL"
echo "Durable log:           $RUN_LOG"
echo "Clean up leaks:        (cd ${OF_MCP_REPO_DIR:-$HOME/omnifocus-mcp} && npm run test:cleanup -- --apply)"
