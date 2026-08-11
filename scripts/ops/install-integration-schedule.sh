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
  # `wc -l < "$RUN_LOG" 2>/dev/null` does NOT keep this quiet: the failure is the
  # SHELL's input redirection, which happens before wc runs and before its
  # stderr is redirected. On a first-ever install the log does not exist yet, so
  # that form printed "No such file or directory" into the install output
  # (observed on the first real install, 2026-08-06). Test for the file instead
  # of trying to silence the redirect.
  #
  # What that form did NOT do is leave before_lines empty. An earlier version of
  # this comment said it did; that was INFERRED from the leaked stderr line
  # rather than measured, and it is false. Re-tested under `set -euo pipefail`:
  # the `|| echo 0` fires and before_lines comes back "0" for a missing file, a
  # missing parent directory, and an unreadable one — identically in bash 3.2.57
  # (what `#!/usr/bin/env bash` resolves to here), /bin/sh, dash, zsh and ksh. So
  # the mark was never actually wrong, and the reason to prefer a file test is
  # the stderr noise in the install output, not a corrupted offset.
  #
  # Use -r (readable), not -f (exists). -f is true for a file the caller cannot
  # read — created by a prior root/sudo run, or a stray chmod — and then the
  # unguarded `wc` fails on the SHELL's redirection and `set -e` kills the whole
  # install before kickstart is even reached. That was a regression introduced by
  # the first version of this fix, which handled "missing" and broke "present but
  # unreadable": the mirror-image half of the same problem. Keep the `|| echo 0`
  # too, so the race between testing and reading degrades instead of aborting.
  if [ -r "$RUN_LOG" ]; then
    before_lines="$(wc -l < "$RUN_LOG" 2>/dev/null || echo 0)"
  else
    before_lines=0
  fi
  before_lines="${before_lines// /}"
  # Backstop for a case we have NOT demonstrated, kept deliberately rather than
  # removed with the claim that motivated it. What it protects is the consumer
  # below — `tail -n "+$((before_lines + 1))"`. An empty value there expands to
  # `+1`, which scans the log from line 1 and can accept a PREVIOUS run's STATUS
  # line as this run's verdict: precisely the stale read the mark-and-scan design
  # above exists to prevent. Cheap insurance against a silent wrong answer.
  [ -n "$before_lines" ] || before_lines=0

  launchctl kickstart -k "$GUI/$LABEL"

  # DERIVE the budgets from the wrapper's own timeouts instead of hardcoding
  # them. A fixed 360x5s = 30 min was shorter than the wrapper's worst case
  # (build 600 + suite 2700 + cleanup 600 = 65 min), so a merely-slow-but-
  # healthy run — still well inside its own SUITE_TIMEOUT, not hung — was
  # reported as "VERIFY FAILED: the job did not execute" while it ran on
  # unattended against the live database.
  #
  # The wrapper SOURCE is the authority for the defaults: the plist bakes no
  # OF_MCP_* variables, so the launchd-spawned job always runs on the wrapper's
  # own defaults, and an edited default there would silently desync a copy
  # hardcoded here. Parse each default out of the wrapper source; env vars
  # still override (an operator exporting one for --verify is asserting it
  # matches how they run the wrapper manually — the same contract as before).
  # The literal fallback only fires if the wrapper line ever stops matching.
  wrapper_default() { # <NAME> <fallback> — reads NAME="${OF_MCP_NAME:-N}" from the wrapper
    local v
    v="$(sed -n "s/^${1}=\"\\\${OF_MCP_${1}:-\\([0-9][0-9]*\\)}\"\$/\\1/p" "$WRAPPER_SRC")"
    if [ -n "$v" ]; then printf '%s' "$v"; else
      # Never fall back silently: a reformatted wrapper line plus a bumped
      # default would otherwise desync this budget invisibly, and the first
      # symptom would be a false VERIFY FAILED on a healthy long run.
      echo "  WARNING: could not parse ${1} default from $WRAPPER_SRC; using baked fallback ${2}s" >&2
      printf '%s' "$2"
    fi
  }
  preflight_t="${OF_MCP_PREFLIGHT_TIMEOUT:-$(wrapper_default PREFLIGHT_TIMEOUT 30)}"
  build_t="${OF_MCP_BUILD_TIMEOUT:-$(wrapper_default BUILD_TIMEOUT 600)}"
  suite_t="${OF_MCP_SUITE_TIMEOUT:-$(wrapper_default SUITE_TIMEOUT 2700)}"
  cleanup_t="${OF_MCP_CLEANUP_TIMEOUT:-$(wrapper_default CLEANUP_TIMEOUT 600)}"

  # One slack formula for every wait budget: (phase timeouts + one SIGKILL
  # grace per run_bounded phase) + 20% — the `timeout -k` grace is a fixed
  # cost, so it goes inside the proportional slack, and with small tuned
  # timeouts the slack alone is thinner than the kill window. Preflight bounds
  # itself with an exact watchdog (no grace), so it contributes no grace count.
  # The grace is parsed from run_bounded's own `timeout -k Ns` invocation —
  # same source-is-authority rule as wrapper_default, same loud fallback.
  KILL_GRACE="$(sed -n 's/^.*"\$TIMEOUT_CMD" -k \([0-9][0-9]*\)s .*$/\1/p' "$WRAPPER_SRC" | head -1)"
  if [ -z "$KILL_GRACE" ]; then
    echo "  WARNING: could not parse run_bounded's 'timeout -k' grace from $WRAPPER_SRC; using baked fallback 30s" >&2
    KILL_GRACE=30
  fi
  budget_with_slack() { # <sum-of-phase-timeouts> <run_bounded-phase-count>
    printf '%s' $(( ($1 + $2 * KILL_GRACE) * 12 / 10 ))
  }

  # Poll PREDICATE every 5s until it succeeds (0) or BUDGET seconds are
  # exhausted (1). Both waits below share this: two hand-rolled copies of the
  # same cadence math is how one copy gets a fix and the other keeps the bug.
  poll_for() { # <budget-seconds> <predicate...>
    local budget="$1"; shift
    local _i
    for _i in $(seq 1 $(( budget / 5 + 1 ))); do
      "$@" && return 0
      sleep 5
    done
    return 1
  }
  status_appeared() {
    new_region="$(tail -n "+$((before_lines + 1))" "$RUN_LOG" 2>/dev/null || true)"
    printf '%s' "$new_region" | grep -qaE '^STATUS: '
  }
  # NOT `launchctl print | grep -q`: under pipefail, grep -q exiting at the
  # first match can SIGPIPE a still-writing launchctl and turn a running job
  # into a non-zero pipeline — i.e. a false "terminated" on iteration 1, the
  # same stale-read defect by another road. Capture, then match against a
  # herestring (no writer left to kill).
  # A failing `launchctl print` is NOT evidence of termination: for a loaded
  # job the command succeeds whether or not an instance is running (the pid
  # line just disappears), so a failure is a transient launchctl error — and
  # treating its empty output as "no pid line" would report terminated while
  # cleanup still mutates the live database. Only a successful print with no
  # pid line counts; on failure keep polling, and if the failure persists the
  # budget exhausts into the honest "cleanup still running" message.
  # Records whether the most recent probe could ask launchd at all, so the
  # budget-exhausted message can distinguish "cleanup is still running" from
  # "launchctl itself could not be queried" — different diagnoses, and the
  # wrong one sends the operator to the wrong place.
  job_probe_failed=""
  job_terminated() {
    local out
    if ! out="$(launchctl print "$GUI/$LABEL" 2>/dev/null)"; then
      job_probe_failed=1
      return 1
    fi
    job_probe_failed=""
    ! grep -qE '^[[:space:]]*pid =' <<< "$out"
  }

  # In the normal path STATUS is written only after preflight plus all three
  # run_bounded phases return, so the budget covers all four — three of them
  # with the kill grace.
  verify_budget="$(budget_with_slack $(( preflight_t + build_t + suite_t + cleanup_t )) 3)"
  echo "  waiting up to $((verify_budget / 60)) min for this run's STATUS line ..."
  if ! poll_for "$verify_budget" status_appeared; then
    # status_appeared leaves the last (non-matching) tail in new_region; the
    # failure branch below keys off emptiness, so clear it explicitly.
    new_region=""
  fi

  if [ -z "$new_region" ]; then
    echo "  VERIFY FAILED — no STATUS line appeared in $RUN_LOG within the budget;" >&2
    echo "  the job either never executed or is still running. Check $LAUNCHD_LOG." >&2
    exit 1
  fi

  # A STATUS line exists, but the wrapper is NOT done. In the mid-suite WEDGED
  # path it logs STATUS first and THEN runs the leak scan, which has its own
  # budget of up to CLEANUP_TIMEOUT before the LEAK: line appears; launchd
  # likewise only updates "last exit code" once the process actually
  # terminates. Reading either too early sees an empty or previous-run value.
  # (Detecting STATUS closed the read-too-early-after-SPAWN half of this race;
  # this closes the read-too-early-before-TERMINATION half.)
  #
  # Wait for the job to leave launchd's running set. `pid =` is present only
  # while an instance is alive, so its absence is the termination signal. The
  # wait budget must cover cleanup's own budget: a hardcoded 60s here was a
  # tenth of it, and when cleanup ran longer the fall-through reused the log
  # region captured at STATUS time and printed the reassuring
  # "LEAK: (none recorded)" while cleanup was still running against the live
  # database (OMN-304).
  term_budget="$(budget_with_slack "$cleanup_t" 1)"
  echo "  STATUS seen; waiting up to $((term_budget / 60)) min for the job to finish (cleanup may still be running) ..."
  terminated=""
  if poll_for "$term_budget" job_terminated; then
    terminated=1
  fi

  # Re-read this run's region now that the run is over. Anything the wrapper
  # wrote AFTER its STATUS line — the LEAK: line, in the WEDGED path — is
  # invisible to the region captured at STATUS-detection time; reusing that
  # stale capture was the other half of OMN-304.
  new_region="$(tail -n "+$((before_lines + 1))" "$RUN_LOG" 2>/dev/null || true)"

  # `|| true` inside the substitution: under pipefail a failing launchctl (or
  # an awk SIGPIPE) would otherwise fail the assignment and set -e would kill
  # the whole verify with no verdict printed at all — observed via the
  # launchctl-down harness scenario. An empty rc already prints as "unknown".
  rc="$(launchctl print "$GUI/$LABEL" 2>/dev/null | awk '/last exit code/{print $NF; exit}' || true)"
  echo "  last exit code = ${rc:-unknown} (0 = suite passed; 127 = PATH bug)"

  # Read the verdict ONLY from this run's region of the log.
  status_line="$(printf '%s' "$new_region" | grep -aE '^STATUS: ' | tail -1 || true)"
  leak_line="$(printf '%s' "$new_region" | grep -aE '^LEAK: ' | tail -1 || true)"
  if [ -z "$leak_line" ]; then
    # No LEAK line is two different facts, and neither may print the old
    # clean-looking "(none recorded)" default (which read as "scan ran,
    # nothing found"): either the job is still deciding the question, or it
    # ended down a path that never runs the scan (build failure, preflight
    # wedge) — say which.
    if [ -z "$terminated" ]; then
      if [ -n "$job_probe_failed" ]; then
        leak_line="LEAK: unknown — launchctl could not be queried, so termination was never observed; check launchd and $RUN_LOG"
      else
        leak_line="LEAK: unknown — cleanup still running after ${term_budget}s; check $RUN_LOG once it settles"
      fi
    else
      leak_line="LEAK: not scanned — this run ended without a leak scan (see STATUS above)"
    fi
  fi
  echo "  ${status_line:-STATUS: (none recorded)}"
  echo "  $leak_line"

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
