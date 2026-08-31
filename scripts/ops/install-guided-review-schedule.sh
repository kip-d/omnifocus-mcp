#!/usr/bin/env bash
# install-guided-review-schedule.sh — deploy the guided-review inbox-push launchd job (OMN-314).
#
# Installs the canonical wrapper (scripts/ops/of-mcp-guided-review) to ~/bin and a
# launchd plist (generated from the .template) to ~/Library/LaunchAgents, then
# (re)loads the job. Idempotent: safe to re-run after editing the canonical
# sources. Sibling of install-diagnose-schedule.sh and deliberately shaped the
# same way. See docs/dev/guided-review-push.md.
#
# Usage:
#   scripts/ops/install-guided-review-schedule.sh            # install / reload
#   scripts/ops/install-guided-review-schedule.sh --verify   # also kickstart + check
#   scripts/ops/install-guided-review-schedule.sh --uninstall # bootout + remove plist
#
# Env overrides:
#   OF_MCP_BIN_DIR   (default ~/bin)             where the wrapper is installed
#   OF_MCP_REPO_DIR  (default ~/omnifocus-mcp)   prod checkout the job runs against
#
# NOTE: --verify runs the push once through launchd (seconds) and creates/updates
# one inbox item, writing to the real OmniFocus database. It is the only way to
# prove the job actually works — a plist that loads is not a job that runs.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LABEL="com.omnifocus-mcp.guided-review"
PLIST_NAME="$LABEL.plist"
TEMPLATE="$SCRIPT_DIR/$PLIST_NAME.template"
WRAPPER_SRC="$SCRIPT_DIR/of-mcp-guided-review"

BIN_DIR="${OF_MCP_BIN_DIR:-$HOME/bin}"
# Resolved here (not just consumed by the wrapper's own default) because it is
# baked into the plist — see the EnvironmentVariables comment in the template.
REPO_DIR="${OF_MCP_REPO_DIR:-$HOME/omnifocus-mcp}"
# Also baked into the plist (see the template's OF_MCP_REVIEW_ITEM_PREFIX
# comment): defaults to "Review: "; a dev/verify install overrides it to
# "__TEST__ Review: " because the guarded dev server rejects any other prefix.
# Mind the trailing space in the default — quoted throughout so it survives.
ITEM_PREFIX_VALUE="${OF_MCP_REVIEW_ITEM_PREFIX:-Review: }"
# Also baked into the plist (see the template's OF_MCP_GUIDED_REVIEW_TIMEOUT
# comment) so the deployed job's run_bounded timeout and this script's
# --verify poll budget (below) can never disagree — both are derived from
# this one resolved value, never read independently from the environment
# twice.
RUN_TIMEOUT_VALUE="${OF_MCP_GUIDED_REVIEW_TIMEOUT:-600}"
case "$RUN_TIMEOUT_VALUE" in
  ''|*[!0-9]*|0|0[0-9]*)
    echo "ERROR: OF_MCP_GUIDED_REVIEW_TIMEOUT must be a positive integer with no leading zero (got \"$RUN_TIMEOUT_VALUE\")." >&2
    exit 1 ;;
esac
LAUNCH_AGENTS="$HOME/Library/LaunchAgents"
PLIST_DEST="$LAUNCH_AGENTS/$PLIST_NAME"
WRAPPER_DEST="$BIN_DIR/of-mcp-guided-review"
LAUNCHD_LOG="$HOME/.omnifocus-mcp/guided-review-launchd.log"
RUN_LOG="$HOME/.omnifocus-mcp/guided-review.log"
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
# Every substituted value is escaped for sed's replacement text before use —
# not just the operator-supplied ITEM_PREFIX_VALUE. Most of the others are
# $HOME-rooted absolute paths that are unlikely to contain '&' or '#' in
# practice, but "unlikely" isn't a guarantee (a HOME with an '&' in it, an
# unusual BIN_DIR override), and escaping unconditionally costs nothing here —
# so every value goes through escape_sed_repl and every substitution uses the
# same '#' delimiter, rather than trusting some values and not others.
escape_sed_repl() {
  # Order matters: backslash first, so the escapes this adds for & or # aren't
  # themselves re-escaped by a later pass.
  printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/&/\\&/g' -e 's/#/\\#/g'
}
WRAPPER_DEST_ESCAPED="$(escape_sed_repl "$WRAPPER_DEST")"
LAUNCHD_LOG_ESCAPED="$(escape_sed_repl "$LAUNCHD_LOG")"
PATH_VALUE_ESCAPED="$(escape_sed_repl "$PATH_VALUE")"
REPO_DIR_ESCAPED="$(escape_sed_repl "$REPO_DIR")"
ITEM_PREFIX_ESCAPED="$(escape_sed_repl "$ITEM_PREFIX_VALUE")"
RUN_TIMEOUT_ESCAPED="$(escape_sed_repl "$RUN_TIMEOUT_VALUE")"
sed -e "s#__WRAPPER_PATH__#$WRAPPER_DEST_ESCAPED#g" \
    -e "s#__LAUNCHD_LOG__#$LAUNCHD_LOG_ESCAPED#g" \
    -e "s#__PATH_VALUE__#$PATH_VALUE_ESCAPED#g" \
    -e "s#__REPO_DIR__#$REPO_DIR_ESCAPED#g" \
    -e "s#__ITEM_PREFIX__#$ITEM_PREFIX_ESCAPED#g" \
    -e "s#__RUN_TIMEOUT__#$RUN_TIMEOUT_ESCAPED#g" \
    "$TEMPLATE" > "$PLIST_DEST"
plutil -lint "$PLIST_DEST" >/dev/null
echo "Installed plist   → $PLIST_DEST"
echo "  PATH = $PATH_VALUE"
echo "  repo = $REPO_DIR"
echo "  item prefix = \"$ITEM_PREFIX_VALUE\"$([ "$ITEM_PREFIX_VALUE" = "Review: " ] || echo "  <-- NOT the default; verify this is intentional for a prod install")"
echo "  run timeout = ${RUN_TIMEOUT_VALUE}s"

# --- 3. (Re)load the job ------------------------------------------------------
# bootout is async; bootstrap can race it. Poll until the old instance is gone,
# then bootstrap with one retry so a transient hiccup doesn't abort the install.
launchctl bootout "$GUI/$LABEL" 2>/dev/null || true
for _ in $(seq 1 10); do
  launchctl print "$GUI/$LABEL" >/dev/null 2>&1 || break
  sleep 0.5
done
launchctl bootstrap "$GUI" "$PLIST_DEST" || { sleep 1; launchctl bootstrap "$GUI" "$PLIST_DEST"; }
echo "Loaded job $LABEL (Mon–Sat 07:00; Saturday = deep mode)."

# --- 4. Optional verification -------------------------------------------------
if [ "$MODE" = "verify" ]; then
  echo "Verifying via kickstart (runs the push now through launchd, seconds) ..."

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

  # DERIVE the budget from RUN_TIMEOUT_VALUE — the SAME resolved value baked
  # into the plist above, not a second independent read of the env var. The
  # guided-review wrapper has a single bounded step (the push itself, via
  # run_bounded), unlike the integration suite's build+suite+cleanup phases —
  # so there is one number to derive from here, not three. Add 20% slack; a
  # hardcoded number here silently rots the moment that default changes, and
  # reading the env var independently here (rather than reusing
  # RUN_TIMEOUT_VALUE) could let the poll budget and the deployed timeout
  # disagree if the variable changed between the two reads.
  verify_budget=$(( 10#$RUN_TIMEOUT_VALUE * 12 / 10 ))
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
  echo "  last exit code = ${rc:-unknown} (0 = push succeeded; 127 = PATH bug)"

  # Read the verdict ONLY from this run's region of the log. This job never
  # emits a LEAK: line (unlike of-mcp-integration, it creates no test
  # fixtures) — there is nothing to grep for or hint at cleaning up here.
  status_line="$(printf '%s' "$new_region" | grep -aE '^STATUS: ' | tail -1 || true)"
  echo "  ${status_line:-STATUS: (none recorded)}"

  # SKIPPED (OmniFocus not running at all) and WEDGED (the push timed out) are
  # both "the push never ran" — not a pass and not a failure, the environment
  # blocked it. SKIPPED gets its own message because it means --verify proved
  # NOTHING: unlike WEDGED, there was no attempt, so this must exit non-zero
  # too — a silent-success --verify that never actually ran the push would be
  # exactly the failure mode this flag exists to catch.
  case "$status_line" in
    *SKIPPED*)
      echo "  VERIFY NOT RUN — OmniFocus was not running when the job fired, so nothing was pushed or verified." >&2
      echo "  Start OmniFocus and re-run --verify." >&2
      exit 4 ;;
    *WEDGED*)
      echo "  VERIFY INCONCLUSIVE — OmniFocus was unreachable, so the push never ran." >&2
      echo "  The job itself is installed and executed correctly. Re-verify once OmniFocus responds." >&2
      exit 3 ;;
  esac

  # Judge on the STATUS line the wrapper WROTE for this run, not on launchd's
  # cached exit code. The wrapper is the authority: it computed the verdict and
  # recorded it in the region we just read. rc is corroboration — and it can
  # legitimately be unreadable (launchd may not surface it promptly, or at all,
  # for a job that has already exited), which must not by itself manufacture a
  # failure for a run whose own STATUS says OK. The "did it run at all?" case
  # is already handled above: no STATUS line means we exited 1 before reaching
  # here, so rc can no longer be a stale value standing in for a run that never
  # happened.
  case "$status_line" in
    *"STATUS: OK"*)
      if [ -n "${rc:-}" ] && [ "$rc" != "0" ]; then
        echo "  VERIFY FAILED — the wrapper logged OK but launchd reports exit $rc;" >&2
        echo "  these disagree, so the run is not trustworthy. See $RUN_LOG and $LAUNCHD_LOG" >&2
        exit 1
      fi
      echo "  OK (job executed and the push succeeded)." ;;
    *)
      echo "  VERIFY FAILED — see $RUN_LOG and $LAUNCHD_LOG" >&2
      exit 1 ;;
  esac
fi

echo
echo "Done. Inspect status:  launchctl list | grep guided-review"
echo "Manual run:            launchctl kickstart -p $GUI/$LABEL"
echo "Durable log:           $RUN_LOG"
