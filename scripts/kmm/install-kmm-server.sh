#!/usr/bin/env bash
# install-kmm-server.sh — deploy the KMM MCP HTTP server LaunchAgent (OMN-279).
#
# Installs a launchd plist (generated from the .template) to
# ~/Library/LaunchAgents on KMM, then (re)loads it. Idempotent: safe to
# re-run after editing the canonical sources. Mirrors
# scripts/ops/install-diagnose-schedule.sh's structure — see that script for
# the pattern this one follows (PATH detection, atomic bootstrap retry,
# explicit arg dispatch).
#
# Spec: docs/superpowers/specs/2026-07-02-kmm-test-ground-design.md §4.
#
# Usage:
#   scripts/kmm/install-kmm-server.sh              # install / reload
#   scripts/kmm/install-kmm-server.sh --verify      # also kickstart + check
#   scripts/kmm/install-kmm-server.sh --uninstall   # bootout + remove plist
#
# Required env vars (both — the installer refuses to run without them rather
# than silently deploying an unauthenticated or unreachable server):
#   TAILSCALE_IP     The Tailscale IP to bind the HTTP server to (the tailnet
#                     is the network boundary — spec's guard-posture decision).
#   MCP_AUTH_TOKEN   Bearer token for the server. OMN-236: auth is env-var-only,
#                     there is no --auth-token flag, and a missing token
#                     silently disables auth entirely — this script REQUIRES
#                     it rather than defaulting it.
#
# Optional env vars:
#   OF_MCP_REPO_DIR  (default ~/omnifocus-mcp)   repo checkout the server runs from
#   OF_MCP_KMM_PORT  (default 3111)              HTTP port
set -euo pipefail

# Resolve symlinks so SCRIPT_DIR is the real scripts/kmm/ directory even when
# this script is invoked via a PATH symlink — the lib.sh and plist-template
# lookups below break otherwise. Stays inline (not in lib.sh) because it is
# what locates lib.sh.
SCRIPT_SOURCE="${BASH_SOURCE[0]}"
while [ -h "$SCRIPT_SOURCE" ]; do
  SCRIPT_DIR="$(cd -P "$(dirname "$SCRIPT_SOURCE")" && pwd)"
  SCRIPT_SOURCE="$(readlink "$SCRIPT_SOURCE")"
  case "$SCRIPT_SOURCE" in /*) ;; *) SCRIPT_SOURCE="$SCRIPT_DIR/$SCRIPT_SOURCE" ;; esac
done
SCRIPT_DIR="$(cd -P "$(dirname "$SCRIPT_SOURCE")" && pwd)"

OF_KMM_LOG_TAG="install-kmm-server"
# shellcheck source=scripts/kmm/lib.sh
. "$SCRIPT_DIR/lib.sh"
LABEL="com.omnifocus-mcp.kmm-server"
PLIST_NAME="$LABEL.plist"
TEMPLATE="$SCRIPT_DIR/$PLIST_NAME.template"

LAUNCH_AGENTS="$HOME/Library/LaunchAgents"
PLIST_DEST="$LAUNCH_AGENTS/$PLIST_NAME"
LAUNCHD_LOG="$HOME/.omnifocus-mcp/kmm-server-launchd.log"
GUI="gui/$(id -u)"

REPO_DIR="${OF_MCP_REPO_DIR:-$HOME/omnifocus-mcp}"
PORT="${OF_MCP_KMM_PORT:-3111}"

uninstall() {
  log "Unloading $LABEL ..."
  launchctl bootout "$GUI/$LABEL" 2>/dev/null || echo "  (was not loaded)"
  rm -f "$PLIST_DEST" && log "Removed $PLIST_DEST"
  exit 0
}

# Explicit arg dispatch — reject unknowns (and trailing extras past the first
# argument) so a typo can't silently skip verification and exit 0 (mirrors
# install-diagnose-schedule.sh's rationale).
if [ "$#" -gt 1 ]; then
  echo "Unexpected extra argument: $2" >&2
  echo "Usage: $(basename "$0") [--verify | --uninstall]" >&2
  exit 2
fi
MODE="install"
case "${1:-}" in
  "")          MODE="install" ;;
  --verify)    MODE="verify" ;;
  --uninstall) uninstall ;;
  *) echo "Unknown argument: $1" >&2
     echo "Usage: $(basename "$0") [--verify | --uninstall]" >&2
     exit 2 ;;
esac

require_env TAILSCALE_IP
require_env MCP_AUTH_TOKEN
[ -d "$REPO_DIR" ] || die "repo checkout not found: $REPO_DIR (set OF_MCP_REPO_DIR)"
[ -f "$REPO_DIR/dist/index.js" ] || die "$REPO_DIR/dist/index.js not found — run 'npm run build' in $REPO_DIR first"

# --- Detect Homebrew bin dir(s) and the node binary ---------------------------
# Deliberately MIRRORS (not shares) scripts/ops/install-diagnose-schedule.sh's
# detection loop: extracting a cross-directory lib for two consumers in
# different script families would couple scripts/kmm to scripts/ops for ~6
# lines. Revisit if a third consumer appears.
brew_dirs=()
for d in /opt/homebrew/bin /usr/local/bin; do
  [ -x "$d/node" ] && brew_dirs+=("$d")
done
if [ ${#brew_dirs[@]} -eq 0 ]; then
  die "node not found in /opt/homebrew/bin or /usr/local/bin. Install Node via Homebrew, or edit the PATH detection above."
fi
NODE_PATH="${brew_dirs[0]}/node"
PATH_VALUE="$(IFS=:; printf '%s' "${brew_dirs[*]}"):/usr/bin:/bin:/usr/sbin:/sbin"

# --- Generate the plist from the template --------------------------------------
mkdir -p "$LAUNCH_AGENTS" "$(dirname "$LAUNCHD_LOG")"
# Substituted values: absolute paths, a PATH string, an IP, a port number, and
# a bearer token. None of these should contain '|' or newlines in normal use,
# but several (MCP_AUTH_TOKEN, TAILSCALE_IP, and REPO_DIR via OF_MCP_REPO_DIR)
# are caller-supplied — every value that goes through the `s|__X__|...|g`
# substitution below must be checked, not just the obviously-external ones, or
# a stray '|' silently truncates that sed expression and either aborts the
# installer or writes a malformed plist.
for val in "$NODE_PATH" "$REPO_DIR" "$PORT" "$TAILSCALE_IP" "$MCP_AUTH_TOKEN" "$LAUNCHD_LOG" "$PATH_VALUE"; do
  case "$val" in
    *'|'*|*$'\n'*) die "a substituted value contains '|' or a newline — refusing to generate a possibly-corrupt plist." ;;
  esac
done
# Every substituted value lands inside a plist <string> element, so it must
# be valid XML content first — a raw '&', '<', or '>' (e.g. inside
# MCP_AUTH_TOKEN) produces an invalid plist that plutil -lint below rejects.
# THEN, independently, sed's REPLACEMENT text has its own metacharacters (an
# unescaped '&' means "insert the whole match", '\N' is a backreference) —
# xml_escape's output itself contains '&' (from "&amp;" etc.), so it must be
# re-escaped for sed on top of the XML escaping, not instead of it.
xml_escape() {
  printf '%s' "$1" | sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g'
}
sed_escape_replacement() {
  printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/&/\\\&/g'
}
plist_value() {
  sed_escape_replacement "$(xml_escape "$1")"
}
sed -e "s|__NODE_PATH__|$(plist_value "$NODE_PATH")|g" \
    -e "s|__REPO_DIR__|$(plist_value "$REPO_DIR")|g" \
    -e "s|__PORT__|$(plist_value "$PORT")|g" \
    -e "s|__TAILSCALE_IP__|$(plist_value "$TAILSCALE_IP")|g" \
    -e "s|__MCP_AUTH_TOKEN__|$(plist_value "$MCP_AUTH_TOKEN")|g" \
    -e "s|__LAUNCHD_LOG__|$(plist_value "$LAUNCHD_LOG")|g" \
    -e "s|__PATH_VALUE__|$(plist_value "$PATH_VALUE")|g" \
    "$TEMPLATE" > "$PLIST_DEST"
plutil -lint "$PLIST_DEST" >/dev/null
chmod 600 "$PLIST_DEST" # contains the bearer token — not world-readable
log "Installed plist   → $PLIST_DEST (mode 600, contains MCP_AUTH_TOKEN)"
log "  node = $NODE_PATH, repo = $REPO_DIR, http://$TAILSCALE_IP:$PORT"

# --- (Re)load the job ------------------------------------------------------------
# bootout is async — poll until the old job is gone, then bootstrap with one
# retry. Deliberately MIRRORS (not shares) install-diagnose-schedule.sh's
# sequence — same cross-family-lib tradeoff as the Homebrew detection above.
launchctl bootout "$GUI/$LABEL" 2>/dev/null || true
for _ in $(seq 1 10); do
  launchctl print "$GUI/$LABEL" >/dev/null 2>&1 || break
  sleep 0.5
done
launchctl bootstrap "$GUI" "$PLIST_DEST" || { sleep 1; launchctl bootstrap "$GUI" "$PLIST_DEST"; }
log "Loaded job $LABEL (RunAtLoad + KeepAlive)."

# --- Optional verification ---------------------------------------------------
if [ "$MODE" = "verify" ]; then
  log "Verifying: waiting for the server to come up..."
  sleep 3
  BASE_URL="http://$TAILSCALE_IP:$PORT/mcp"

  # 1. Confirm auth is actually enforced — a missing/blank MCP_AUTH_TOKEN
  #    silently disables auth entirely (OMN-236), so this is the one check
  #    that catches that specific footgun rather than just "server answers".
  # Both curls carry explicit timeouts: without them, a LaunchAgent that
  # failed to bind (port conflict) or hung after bootstrap leaves curl
  # waiting forever — hanging the whole of-kmm-redeploy pipeline instead of
  # failing loud through the diagnostics below.
  CURL_TIMEOUT_ARGS=(--connect-timeout 5 --max-time 30)

  log "  Checking unauthenticated requests are rejected..."
  unauth_status="$(curl -s "${CURL_TIMEOUT_ARGS[@]}" -o /dev/null -w '%{http_code}' -X POST "$BASE_URL" \
    -H 'Content-Type: application/json' \
    -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' || echo "000")"
  if [ "$unauth_status" != "401" ]; then
    die "unauthenticated request got HTTP $unauth_status, expected 401 — auth may be silently disabled (OMN-236 footgun). Check MCP_AUTH_TOKEN was actually set in the plist."
  fi
  log "  OK — unauthenticated request rejected (401)."

  # 2. Confirm an authenticated request actually gets through. NOTE:
  #    verify-deploy.ts is NOT used here — it drives a server over stdio by
  #    spawning its own child process, so it cannot exercise the actual
  #    running HTTP LaunchAgent instance. A real authenticated HTTP request
  #    is the only thing that tests the deployed server itself.
  log "  Checking an authenticated request succeeds..."
  # curl failing (e.g. connection refused) would otherwise kill the script
  # here under set -e before the diagnostic checks below can report it —
  # `|| true` lets an empty $auth_response fall through to those checks.
  auth_response="$(curl -s "${CURL_TIMEOUT_ARGS[@]}" -X POST "$BASE_URL" \
    -H 'Content-Type: application/json' \
    -H "Authorization: Bearer $MCP_AUTH_TOKEN" \
    -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"install-kmm-server-verify","version":"1.0.0"}}}' || true)"
  if ! echo "$auth_response" | node -e 'JSON.parse(require("fs").readFileSync(0,"utf8"))' >/dev/null 2>&1; then
    die "authenticated request did not return valid JSON. Response: $auth_response"
  fi
  if ! echo "$auth_response" | grep -q '"result"'; then
    die "authenticated request did not return a JSON-RPC result. Response: $auth_response"
  fi
  log "  OK — authenticated request succeeded."
fi

echo
echo "Done. Inspect status:  launchctl list | grep kmm-server"
echo "Manual restart:        launchctl kickstart -k $GUI/$LABEL"
echo "Durable log:           $LAUNCHD_LOG"
