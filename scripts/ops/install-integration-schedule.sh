#!/usr/bin/env bash
# install-integration-schedule.sh — deploy the weekly integration-suite launchd job.
#
# Installs the canonical wrapper (scripts/ops/of-mcp-integration) to ~/bin and a
# launchd plist (generated from the .template) to ~/Library/LaunchAgents, then
# (re)loads the job. Idempotent: safe to re-run after editing the canonical
# sources. Sibling of install-diagnose-schedule.sh and deliberately shaped the
# same way. See docs/dev/integration-scheduling.md.
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
# Resolved here (not just consumed by the wrapper's own default) because it is
# baked into the plist — see the EnvironmentVariables comment in the template.
REPO_DIR="${OF_MCP_REPO_DIR:-$HOME/omnifocus-mcp}"
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
    -e "s|__REPO_DIR__|$REPO_DIR|g" \
    "$TEMPLATE" > "$PLIST_DEST"
plutil -lint "$PLIST_DEST" >/dev/null
echo "Installed plist   → $PLIST_DEST"
echo "  PATH = $PATH_VALUE"
echo "  repo = $REPO_DIR"

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

  # WAIT ON THIS RUN'S OWN OUTPUT, not on a pid.
  #
  # Every previous approach here keyed off `launchctl print`'s pid, and every one
  # was only probabilistic: kickstart returns when the spawn is ACCEPTED, so the
  # pid may not be registered yet; retrying merely narrows that window. Whenever
  # the pid came back empty, the wait loop broke on iteration 1 and verification
  # read `last exit code`, `STATUS:` and `LEAK:` seconds after kickstart — all of
  # which persist from the PREVIOUS run. That reports last week's verdict for a
  # job still running unsupervised against the live database, and it can report
  # PASS just as easily as FAIL.
  #
  # The wrapper writes exactly one `STATUS:` line, at the very end of a run. So
  # remember where the log ends now, and wait for a STATUS line to appear BEYOND
  # that point. That is this run's completion signal by construction — no pid, no
  # race, and stale content is unreadable because we only ever look past the mark.
  # `wc -l < "$RUN_LOG" 2>/dev/null` does NOT guard this: the failure is the
  # SHELL's input redirection, which happens before wc runs and before its
  # stderr is redirected. On a first-ever install the log does not exist yet, so
  # that form printed "No such file or directory" into the install output and
  # left before_lines EMPTY rather than 0 (observed on the first real install,
  # 2026-08-06). Test for the file instead of trying to silence the redirect.
  if [ -f "$RUN_LOG" ]; then
    before_lines="$(wc -l < "$RUN_LOG")"
  else
    before_lines=0
  fi
  before_lines="${before_lines// /}"

  launchctl kickstart -k "$GUI/$LABEL"

  # DERIVE the budget from the wrapper's own timeouts instead of hardcoding one.
  # A fixed 360x5s = 30 min was shorter than the wrapper's worst case (build 600
  # + suite 2700 + cleanup 600 = 65 min), so a merely-slow-but-healthy run —
  # still well inside its own SUITE_TIMEOUT, not hung — was reported as
  # "VERIFY FAILED: the job did not execute" while it ran on unattended against
  # the live database. Read the same env vars with the same defaults, sum them,
  # and add 20% slack; a hardcoded number here silently rots the moment any of
  # those defaults change.
  verify_budget=$(( (${OF_MCP_BUILD_TIMEOUT:-600} + ${OF_MCP_SUITE_TIMEOUT:-2700} + ${OF_MCP_CLEANUP_TIMEOUT:-600}) * 12 / 10 ))
  verify_polls=$(( verify_budget / 5 + 1 ))
  echo "  waiting up to $((verify_budget / 60)) min for this run's STATUS line ..."
  new_region=""
  for _ in $(seq 1 "$verify_polls"); do
    new_region="$(tail -n "+$((before_lines + 1))" "$RUN_LOG" 2>/dev/null || true)"
    printf '%s' "$new_region" | grep -qaE '^STATUS: ' && break
    new_region=""
    sleep 5
  done

  if [ -z "$new_region" ]; then
    echo "  VERIFY FAILED — no STATUS line appeared in $RUN_LOG within the budget;" >&2
    echo "  the job either never executed or is still running. Check $LAUNCHD_LOG." >&2
    exit 1
  fi

  # A STATUS line exists, but the wrapper is NOT done: it still writes the LEAK:
  # line and then exits, and launchd only updates "last exit code" once the
  # process actually terminates. Reading it here would race that exit and see an
  # empty or previous-run value — reporting VERIFY FAILED for a run that passed.
  # (Detecting STATUS closed the read-too-early-after-SPAWN half of this race;
  # this closes the read-too-early-before-TERMINATION half.)
  #
  # Wait for the job to leave launchd's running set. `pid =` is present only
  # while an instance is alive, so its absence is the termination signal.
  for _ in $(seq 1 60); do
    launchctl print "$GUI/$LABEL" 2>/dev/null | grep -qE '^[[:space:]]*pid =' || break
    sleep 1
  done

  rc="$(launchctl print "$GUI/$LABEL" 2>/dev/null | awk '/last exit code/{print $NF; exit}')"
  echo "  last exit code = ${rc:-unknown} (0 = suite passed; 127 = PATH bug)"

  # Read the verdict ONLY from this run's region of the log.
  status_line="$(printf '%s' "$new_region" | grep -aE '^STATUS: ' | tail -1 || true)"
  leak_line="$(printf '%s' "$new_region" | grep -aE '^LEAK: ' | tail -1 || true)"
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

  # Judge on the STATUS line the wrapper WROTE for this run, not on launchd's
  # cached exit code. The wrapper is the authority: it computed the verdict and
  # recorded it in the region we just read. rc is corroboration — and it can
  # legitimately be unreadable (launchd may not surface it promptly, or at all,
  # for a job that has already exited), which must not by itself manufacture a
  # failure for a run whose own STATUS says PASS. The "did it run at all?" case
  # is already handled above: no STATUS line means we exited 1 before reaching
  # here, so rc can no longer be a stale value standing in for a run that never
  # happened.
  case "$status_line" in
    *"STATUS: PASS"*)
      if [ -n "${rc:-}" ] && [ "$rc" != "0" ]; then
        echo "  VERIFY FAILED — the wrapper logged PASS but launchd reports exit $rc;" >&2
        echo "  these disagree, so the run is not trustworthy. See $RUN_LOG and $LAUNCHD_LOG" >&2
        exit 1
      fi
      echo "  OK (job executed and the suite passed)." ;;
    *)
      echo "  VERIFY FAILED — see $RUN_LOG and $LAUNCHD_LOG" >&2
      exit 1 ;;
  esac
fi

echo
echo "Done. Inspect status:  launchctl list | grep integration"
echo "Manual run:            launchctl kickstart -p $GUI/$LABEL"
echo "Durable log:           $RUN_LOG"
echo "Clean up leaks:        (cd ${OF_MCP_REPO_DIR:-$HOME/omnifocus-mcp} && npm run test:cleanup -- --apply)"
