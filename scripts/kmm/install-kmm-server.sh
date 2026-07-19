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

log() { echo "[install-kmm-server] $*"; }
die() { echo "[install-kmm-server] ERROR: $*" >&2; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
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

# Explicit arg dispatch — reject unknowns so a typo can't silently skip
# verification and exit 0 (mirrors install-diagnose-schedule.sh's rationale).
MODE="install"
case "${1:-}" in
  "")          MODE="install" ;;
  --verify)    MODE="verify" ;;
  --uninstall) uninstall ;;
  *) echo "Unknown argument: $1" >&2
     echo "Usage: $(basename "$0") [--verify | --uninstall]" >&2
     exit 2 ;;
esac

[ -n "${TAILSCALE_IP:-}" ] || die "TAILSCALE_IP is required. See this script's header."
[ -n "${MCP_AUTH_TOKEN:-}" ] || die "MCP_AUTH_TOKEN is required. See this script's header."
[ -d "$REPO_DIR" ] || die "repo checkout not found: $REPO_DIR (set OF_MCP_REPO_DIR)"
[ -f "$REPO_DIR/dist/index.js" ] || die "$REPO_DIR/dist/index.js not found — run 'npm run build' in $REPO_DIR first"

# --- Detect Homebrew bin dir(s) and the node binary ---------------------------
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
# but MCP_AUTH_TOKEN is caller-supplied — reject anything containing the sed
# delimiter or a literal newline outright rather than let it silently corrupt
# the generated plist.
for val in "$TAILSCALE_IP" "$MCP_AUTH_TOKEN" "$PORT"; do
  case "$val" in
    *'|'*|*$'\n'*) die "a substituted value contains '|' or a newline — refusing to generate a possibly-corrupt plist." ;;
  esac
done
sed -e "s|__NODE_PATH__|$NODE_PATH|g" \
    -e "s|__REPO_DIR__|$REPO_DIR|g" \
    -e "s|__PORT__|$PORT|g" \
    -e "s|__TAILSCALE_IP__|$TAILSCALE_IP|g" \
    -e "s|__MCP_AUTH_TOKEN__|$MCP_AUTH_TOKEN|g" \
    -e "s|__LAUNCHD_LOG__|$LAUNCHD_LOG|g" \
    -e "s|__PATH_VALUE__|$PATH_VALUE|g" \
    "$TEMPLATE" > "$PLIST_DEST"
plutil -lint "$PLIST_DEST" >/dev/null
chmod 600 "$PLIST_DEST" # contains the bearer token — not world-readable
log "Installed plist   → $PLIST_DEST (mode 600, contains MCP_AUTH_TOKEN)"
log "  node = $NODE_PATH, repo = $REPO_DIR, http://$TAILSCALE_IP:$PORT"

# --- (Re)load the job ------------------------------------------------------------
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
  log "  Checking unauthenticated requests are rejected..."
  unauth_status="$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE_URL" \
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
  auth_response="$(curl -s -X POST "$BASE_URL" \
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
