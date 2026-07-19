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
set -euo pipefail

log() { echo "[of-db-reset] $*"; }
die() { echo "[of-db-reset] ERROR: $*" >&2; exit 1; }

require_env() {
  local name="$1"
  if [ -z "${!name:-}" ]; then
    die "$name is required and not set. See this script's header for what it must be."
  fi
}

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
  log "Quitting OmniFocus gracefully..."
  osascript -e 'tell application "OmniFocus" to quit' >/dev/null 2>&1 || true

  local waited=0
  while pgrep -x "OmniFocus" >/dev/null 2>&1; do
    if [ "$waited" -ge "$QUIT_TIMEOUT_S" ]; then
      log "OmniFocus did not quit within ${QUIT_TIMEOUT_S}s — escalating to pkill."
      pkill -x "OmniFocus" || true
      sleep 1
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
  extracted="$(find "$tmp_dir" -maxdepth 1 -name '*.ofocus' | head -n 1)"
  [ -n "$extracted" ] || die "no .ofocus bundle found inside $GOLDEN_ZIP (expected exactly one at the zip's top level)"

  # The golden copy is stored zipped and is never modified in place (spec
  # §2) — we operate on the freshly extracted copy in $tmp_dir, never the
  # archive itself, so a failed restore never corrupts the golden source.
  if [ -e "$OF_CONTAINER_PATH" ]; then
    log "Removing existing container contents at $OF_CONTAINER_PATH ..."
    rm -rf "${OF_CONTAINER_PATH:?}"
  fi
  mkdir -p "$(dirname "$OF_CONTAINER_PATH")"
  mv "$extracted" "$OF_CONTAINER_PATH"
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
  value="$(grep -E "^${key}:" "$PROVENANCE" | head -n 1 | sed -E "s/^${key}:[[:space:]]*//" || true)"
  [ -n "$value" ] || die "PROVENANCE.md has no '$key:' line (checked $PROVENANCE)"
  [[ "$value" =~ ^[0-9]+$ ]] || die "PROVENANCE.md's '$key:' value is not a plain integer: '$value'"
  echo "$value"
}

verify_counts() {
  log "Verifying restored counts against PROVENANCE.md..."
  local expected_tasks expected_projects actual_tasks actual_projects
  expected_tasks="$(parse_provenance_count tasks)"
  expected_projects="$(parse_provenance_count projects)"

  local counts_json
  counts_json="$(osascript -l JavaScript -e '
    (function () {
      const app = Application("OmniFocus");
      const doc = app.defaultDocument;
      const tasks = doc.flattenedTasks().length;
      const projects = doc.flattenedProjects().length;
      return JSON.stringify({ tasks: tasks, projects: projects });
    })();
  ')" || die "failed to read task/project counts from OmniFocus via JXA"

  local counts_pair
  counts_pair="$(echo "$counts_json" | node -e '
    const c = JSON.parse(require("fs").readFileSync(0, "utf8"));
    process.stdout.write(c.tasks + " " + c.projects);
  ')"
  read -r actual_tasks actual_projects <<< "$counts_pair"

  local mismatch=0
  if [ "$actual_tasks" != "$expected_tasks" ]; then
    echo "[of-db-reset] MISMATCH: tasks expected=$expected_tasks actual=$actual_tasks" >&2
    mismatch=1
  fi
  if [ "$actual_projects" != "$expected_projects" ]; then
    echo "[of-db-reset] MISMATCH: projects expected=$expected_projects actual=$actual_projects" >&2
    mismatch=1
  fi

  if [ "$mismatch" -ne 0 ]; then
    die "restored database does not match PROVENANCE.md — the restore may have failed or the golden snapshot is stale."
  fi
  log "Verified: tasks=$actual_tasks projects=$actual_projects (matches PROVENANCE.md)."
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
