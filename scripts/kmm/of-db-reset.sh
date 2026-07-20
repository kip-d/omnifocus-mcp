#!/usr/bin/env bash
# of-db-reset.sh — restore KMM's OmniFocus database to the frozen golden
# snapshot (OMN-279, spec docs/superpowers/specs/2026-07-02-kmm-test-ground-design.md §3).
#
# Runs ON KMM (the physical test-ground Mac), invoked over SSH:
#   ssh kmm of-db-reset
# Must work even when the MCP server is wedged — it has no dependency on it,
# only on OmniFocus and the golden snapshot.
#
# Steps (spec §3, verbatim):
#   1. Quit OmniFocus gracefully via osascript; fall back to pkill after a timeout.
#   2. Unzip the golden snapshot and restore the extracted .ofocus over the
#      OmniFocus 4 container database path — the golden copy is stored
#      zipped, never copy the archive itself onto the container path.
#   3. Relaunch OmniFocus.
#   4. Poll osascript until the default document answers (bounded retries).
#   5. Verify: read task/project counts and diff against PROVENANCE.md
#      numbers; fail loudly on mismatch.
#
# UNVERIFIED PENDING KMM'S PHYSICAL EXISTENCE (OMN-279's explicit scope
# boundary — see the ticket). Two things this script cannot know until a real
# KMM machine exists and OMN-280 (manual setup) runs:
#   - OF_CONTAINER_PATH: OmniFocus 4's actual on-disk database container path.
#     Apple's App Sandbox convention places it under
#     ~/Library/Containers/com.omnigroup.OmniFocus4/Data/... but the exact
#     leaf path depends on the installed OmniFocus 4 version and is NOT
#     guessed here — confirm it on the real machine (e.g. `lsof` the app
#     while it has a document open, or check Console.app for its sandbox
#     container path) and set OF_CONTAINER_PATH explicitly. Guessing wrong
#     and silently no-op'ing would be worse than failing loud, so this script
#     REQUIRES the env var rather than defaulting it.
#   - PROVENANCE.md's exact format: OMN-280 (golden-database creation) is
#     the ticket that actually writes this file. This script defines the
#     machine-readable contract it depends on (see parse_provenance_counts
#     below) — simple `key: value` lines, `tasks: N` and `projects: N` at
#     minimum. OMN-280 must produce a PROVENANCE.md matching this format, or
#     update this script's parser to match whatever format it actually uses.
#
# Env vars (all required except the *_TIMEOUT/*_RETRIES tuning knobs):
#   OF_GOLDEN_DIR        Dir containing the zipped golden snapshot + PROVENANCE.md
#                         (spec: snapshot lives at ~/of-golden/, read-only).
#   OF_GOLDEN_ZIP_NAME    Zip filename inside OF_GOLDEN_DIR (default: golden.ofocus.zip)
#   OF_CONTAINER_PATH     OmniFocus 4's live database container path (no default — see above)
#   OF_QUIT_TIMEOUT_S     Seconds to wait for graceful quit before pkill (default: 15)
#   OF_RELAUNCH_RETRIES   Poll attempts waiting for the relaunched doc to answer (default: 30)
#   OF_RELAUNCH_INTERVAL_S  Seconds between relaunch poll attempts (default: 2)
#   OF_VERIFY_RETRIES     Count-read attempts before a mismatch is treated as real (default: 10)
#   OF_VERIFY_INTERVAL_S  Seconds between count-read attempts (default: 3)
set -euo pipefail

# Resolve symlinks so SCRIPT_DIR is the real scripts/kmm/ directory even when
# this script is invoked via a PATH symlink (the `ssh kmm of-db-reset`
# convention) — the lib.sh lookup below breaks otherwise. This bootstrap
# stays inline (not in lib.sh) because it is what locates lib.sh.
SCRIPT_SOURCE="${BASH_SOURCE[0]}"
while [ -h "$SCRIPT_SOURCE" ]; do
  SCRIPT_DIR="$(cd -P "$(dirname "$SCRIPT_SOURCE")" && pwd)"
  SCRIPT_SOURCE="$(readlink "$SCRIPT_SOURCE")"
  case "$SCRIPT_SOURCE" in /*) ;; *) SCRIPT_SOURCE="$SCRIPT_DIR/$SCRIPT_SOURCE" ;; esac
done
SCRIPT_DIR="$(cd -P "$(dirname "$SCRIPT_SOURCE")" && pwd)"

OF_KMM_LOG_TAG="of-db-reset"
# shellcheck source=scripts/kmm/lib.sh
. "$SCRIPT_DIR/lib.sh"

# Sets GOLDEN_ZIP/PROVENANCE/timing globals from env vars, applying defaults.
# Split from validate_inputs so a test can construct paths without also
# requiring the referenced files to exist on disk.
set_derived_paths() {
  GOLDEN_ZIP_NAME="${OF_GOLDEN_ZIP_NAME:-golden.ofocus.zip}"
  GOLDEN_ZIP="$OF_GOLDEN_DIR/$GOLDEN_ZIP_NAME"
  PROVENANCE="$OF_GOLDEN_DIR/PROVENANCE.md"
  QUIT_TIMEOUT_S="${OF_QUIT_TIMEOUT_S:-15}"
  RELAUNCH_RETRIES="${OF_RELAUNCH_RETRIES:-30}"
  RELAUNCH_INTERVAL_S="${OF_RELAUNCH_INTERVAL_S:-2}"
  VERIFY_RETRIES="${OF_VERIFY_RETRIES:-10}"
  VERIFY_INTERVAL_S="${OF_VERIFY_INTERVAL_S:-3}"
}

# Required env vars + required-file existence checks. Kept as its own
# function (rather than top-level script code) so sourcing this file for
# testing individual functions doesn't immediately die on a missing env var
# or fixture file — only `main` (guarded below) runs this.
validate_inputs() {
  require_env OF_GOLDEN_DIR
  require_env OF_CONTAINER_PATH
  set_derived_paths
  [ -f "$GOLDEN_ZIP" ] || die "golden snapshot not found: $GOLDEN_ZIP"
  [ -f "$PROVENANCE" ] || die "PROVENANCE.md not found: $PROVENANCE (OMN-280 must create it alongside the golden snapshot)"
}

# --- Step 1: quit OmniFocus gracefully, escalate to pkill ---------------------
quit_omnifocus() {
  if ! pgrep -x "OmniFocus" >/dev/null 2>&1; then
    # A quit AppleEvent LAUNCHES the target app if it isn't running (the
    # Apple Event Manager must start it to deliver the event) — skip the
    # pointless launch-then-quit when there's nothing to quit.
    log "OmniFocus is not running — nothing to quit."
    return 0
  fi

  log "Quitting OmniFocus gracefully..."
  # Backgrounded: a wedged OmniFocus (modal dialog) can block the AppleEvent
  # send for up to the ~2-minute AppleScript timeout, and this script must
  # work even against a wedged app — the bounded poll loop below owns the
  # timeout, and pkill escalation must not wait behind a stuck osascript.
  osascript -e 'tell application "OmniFocus" to quit' >/dev/null 2>&1 &
  local quit_pid=$!

  local waited=0
  while pgrep -x "OmniFocus" >/dev/null 2>&1; do
    if [ "$waited" -ge "$QUIT_TIMEOUT_S" ]; then
      log "OmniFocus did not quit within ${QUIT_TIMEOUT_S}s — escalating to pkill."
      kill "$quit_pid" 2>/dev/null || true
      pkill -x "OmniFocus" || true
      # pkill sends SIGTERM, and a large document can legitimately take more
      # than a moment to tear down — wait (bounded) for the process to exit
      # rather than dying on a still-shutting-down OmniFocus one second later.
      local pkill_waited=0
      while pgrep -x "OmniFocus" >/dev/null 2>&1 && [ "$pkill_waited" -lt "$QUIT_TIMEOUT_S" ]; do
        sleep 1
        pkill_waited=$((pkill_waited + 1))
      done
      break
    fi
    sleep 1
    waited=$((waited + 1))
  done

  if pgrep -x "OmniFocus" >/dev/null 2>&1; then
    die "OmniFocus is still running after quit + pkill — refusing to touch its database while it may be writing."
  fi
  log "OmniFocus quit confirmed."
}

# Picks the single .ofocus bundle inside the extraction dir ($1), at any
# depth — zips are easily built with a wrapper directory (zip -r of a parent
# folder), and requiring a top-level bundle would false-fail on a valid
# snapshot. -prune stops find descending INTO a matched bundle. Fails loud
# on zero OR multiple matches — find's ordering is unspecified, so silently
# taking the first of several bundles could restore the wrong database (the
# exact guess-wrong-silently failure the OF_CONTAINER_PATH handling above
# refuses to risk).
select_extracted_bundle() {
  local dir="$1" matches count
  matches="$(find "$dir" -name '*.ofocus' -prune)"
  count="$(printf '%s' "$matches" | grep -c '^' || true)"
  [ "$count" -eq 1 ] || die "expected exactly one .ofocus bundle inside the golden zip, found $count"
  printf '%s\n' "$matches"
}

# --- Step 2: unzip golden snapshot, restore over the container path -----------
restore_golden() {
  log "Restoring golden snapshot from $GOLDEN_ZIP ..."
  local tmp_dir
  tmp_dir="$(mktemp -d "${TMPDIR:-/tmp}/of-db-reset.XXXXXX")"
  # Cleanup on any exit path from this point on. A RETURN trap does NOT fire
  # when die() below calls `exit` (only on normal function return), so this
  # uses EXIT instead — and the path is substituted into the trap command
  # immediately, since $tmp_dir (a `local`) goes out of scope once this
  # function returns and the trap would later see it unset.
  trap "rm -rf '$tmp_dir'" EXIT

  unzip -q "$GOLDEN_ZIP" -d "$tmp_dir" || die "failed to unzip $GOLDEN_ZIP"

  local extracted
  extracted="$(select_extracted_bundle "$tmp_dir")"

  # The golden copy is stored zipped and is never modified in place (spec
  # §2) — we operate on the freshly extracted copy in $tmp_dir, never the
  # archive itself, so a failed restore never corrupts the golden source.
  #
  # Move-aside, not rm -rf: destroying the live container before the
  # replacement mv is confirmed would leave NO database at all if the mv
  # fails (disk full, permissions). Instead the old container is renamed
  # aside first, restored on mv failure, and deleted only after success.
  local old_container=""
  if [ -e "$OF_CONTAINER_PATH" ]; then
    old_container="${OF_CONTAINER_PATH}.pre-reset.$$"
    log "Moving existing container aside to $old_container ..."
    mv "$OF_CONTAINER_PATH" "$old_container" \
      || die "failed to move the existing container aside — live database left untouched at $OF_CONTAINER_PATH."
  fi
  mkdir -p "$(dirname "$OF_CONTAINER_PATH")"
  if ! mv "$extracted" "$OF_CONTAINER_PATH"; then
    if [ -n "$old_container" ]; then
      # A partway-failed mv (e.g. cross-device copy hitting disk-full) can
      # leave a partial directory AT the container path — and `mv src dst`
      # with an existing dst directory would nest the pre-reset database
      # INSIDE it instead of restoring it at the path. Clear the partial
      # result first so the rollback lands where the log says it does.
      rm -rf "${OF_CONTAINER_PATH:?}"
      mv "$old_container" "$OF_CONTAINER_PATH" \
        || die "failed to move the golden snapshot into place AND rollback failed — pre-reset database is at $old_container, container path is empty. Manual intervention required."
      die "failed to move the golden snapshot into place — pre-reset database rolled back to $OF_CONTAINER_PATH."
    fi
    die "failed to move the golden snapshot into place at $OF_CONTAINER_PATH."
  fi
  if [ -n "$old_container" ]; then
    rm -rf "$old_container"
  fi
  log "Golden snapshot restored to $OF_CONTAINER_PATH."
}

# --- Step 3 + 4: relaunch, poll until the default document answers ------------
relaunch_and_wait() {
  log "Relaunching OmniFocus..."
  open -a "OmniFocus"

  local attempt=0
  while [ "$attempt" -lt "$RELAUNCH_RETRIES" ]; do
    if osascript -e 'tell application "OmniFocus" to get name of default document' >/dev/null 2>&1; then
      log "OmniFocus is responsive (attempt $((attempt + 1))/$RELAUNCH_RETRIES)."
      return 0
    fi
    attempt=$((attempt + 1))
    sleep "$RELAUNCH_INTERVAL_S"
  done
  die "OmniFocus did not become responsive after $RELAUNCH_RETRIES attempts (${RELAUNCH_INTERVAL_S}s apart)."
}

# --- Step 5: verify counts against PROVENANCE.md -------------------------------
# PROVENANCE.md contract (defined by this script — OMN-280 must match it):
# simple `key: value` lines, at minimum:
#   tasks: 1523
#   projects: 87
# Extra lines/keys are ignored. Whitespace around the colon is tolerant.
parse_provenance_count() {
  local key="$1"
  local value
  # grep exits 1 when the key is absent, which under pipefail + set -e would
  # kill the script here instead of reaching the die() below that reports it
  # properly — the `|| true` defers that check to the explicit -n test.
  # Trailing [[:space:]] strip covers trailing spaces AND a CR from a
  # CRLF-terminated PROVENANCE.md (grep keeps the \r; POSIX [[:space:]]
  # includes it) — otherwise "tasks: 1523\r" fails the integer check below.
  value="$(grep -E "^${key}:" "$PROVENANCE" | head -n 1 | sed -E "s/^${key}:[[:space:]]*//; s/[[:space:]]*\$//" || true)"
  [ -n "$value" ] || die "PROVENANCE.md has no '$key:' line (checked $PROVENANCE)"
  [[ "$value" =~ ^[0-9]+$ ]] || die "PROVENANCE.md's '$key:' value is not a plain integer: '$value'"
  echo "$value"
}

# Reads "tasks projects" from the live OmniFocus document via JXA. Returns
# non-zero if OmniFocus doesn't answer. Deliberately emits a plain
# space-separated pair straight from JXA — no node/JSON round-trip — so this
# script's only runtime dependency is /usr/bin/osascript, which is always on
# PATH. A `node` dependency here would hit the launchd/non-interactive-SSH
# PATH footgun (Homebrew bin dirs absent → exit 127) AFTER the destructive
# restore has already happened, misreporting a successful reset as a failure.
read_live_counts() {
  osascript -l JavaScript -e '
    (function () {
      const app = Application("OmniFocus");
      const doc = app.defaultDocument;
      return doc.flattenedTasks().length + " " + doc.flattenedProjects().length;
    })();
  '
}

verify_counts() {
  log "Verifying restored counts against PROVENANCE.md..."
  local expected_tasks expected_projects actual_tasks actual_projects
  expected_tasks="$(parse_provenance_count tasks)"
  expected_projects="$(parse_provenance_count projects)"

  # OmniFocus can answer the relaunch JXA ping while still loading/indexing
  # the freshly restored document, so the first count read may see a partial
  # tree. Retry until the counts match PROVENANCE.md or the budget runs out —
  # only a mismatch that persists across all attempts is treated as real.
  local attempt=1 counts_pair
  while :; do
    # A failed read consumes retry budget instead of dying outright — right
    # after relaunch, flattenedTasks()/flattenedProjects() can throw while
    # OmniFocus is still indexing, even though the relaunch ping succeeded.
    if ! counts_pair="$(read_live_counts)"; then
      if [ "$attempt" -ge "$VERIFY_RETRIES" ]; then
        die "failed to read task/project counts from OmniFocus via JXA after $VERIFY_RETRIES attempts (${VERIFY_INTERVAL_S}s apart)."
      fi
      log "Count read failed (OmniFocus may still be loading) — retrying in ${VERIFY_INTERVAL_S}s (attempt $attempt/$VERIFY_RETRIES)."
      attempt=$((attempt + 1))
      sleep "$VERIFY_INTERVAL_S"
      continue
    fi
    read -r actual_tasks actual_projects <<< "$counts_pair"

    if [ "$actual_tasks" = "$expected_tasks" ] && [ "$actual_projects" = "$expected_projects" ]; then
      log "Verified: tasks=$actual_tasks projects=$actual_projects (matches PROVENANCE.md, attempt $attempt/$VERIFY_RETRIES)."
      return 0
    fi

    if [ "$attempt" -ge "$VERIFY_RETRIES" ]; then
      if [ "$actual_tasks" != "$expected_tasks" ]; then
        echo "[of-db-reset] MISMATCH: tasks expected=$expected_tasks actual=$actual_tasks" >&2
      fi
      if [ "$actual_projects" != "$expected_projects" ]; then
        echo "[of-db-reset] MISMATCH: projects expected=$expected_projects actual=$actual_projects" >&2
      fi
      die "restored database does not match PROVENANCE.md after $VERIFY_RETRIES reads (${VERIFY_INTERVAL_S}s apart) — the restore may have failed or the golden snapshot is stale."
    fi

    log "Counts not settled yet (tasks=$actual_tasks/$expected_tasks projects=$actual_projects/$expected_projects) — retrying in ${VERIFY_INTERVAL_S}s (attempt $attempt/$VERIFY_RETRIES)."
    attempt=$((attempt + 1))
    sleep "$VERIFY_INTERVAL_S"
  done
}

main() {
  validate_inputs
  quit_omnifocus
  restore_golden
  relaunch_and_wait
  verify_counts
  log "Reset complete."
}

# Sourcing guard: only run main when executed directly, not when sourced
# (e.g. by tests that source this file to call individual functions).
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
