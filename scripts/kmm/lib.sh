# lib.sh — shared helpers for scripts/kmm/ (sourced, never executed directly).
#
# Callers set OF_KMM_LOG_TAG to their script name BEFORE sourcing so log/die
# output carries the right prefix, then source this file via their resolved
# SCRIPT_DIR. The symlink-resolving SCRIPT_DIR bootstrap deliberately stays
# inline in each caller — the resolved directory is needed to FIND this lib,
# so that loop is the one piece of boilerplate that cannot live here.
# shellcheck shell=bash

log() { echo "[${OF_KMM_LOG_TAG:-kmm}] $*"; }
die() { echo "[${OF_KMM_LOG_TAG:-kmm}] ERROR: $*" >&2; exit 1; }

require_env() {
  local name="$1"
  if [ -z "${!name:-}" ]; then
    die "$name is required and not set. See this script's header for what it must be."
  fi
}

# --- plist/sed escaping (used by install-kmm-server.sh; here so tests can
# --- source and exercise them directly — the installer has top-level side
# --- effects and cannot be sourced safely) ------------------------------------
# Every substituted value lands inside a plist <string> element, so it must
# be valid XML content first — a raw '&', '<', or '>' (e.g. inside
# MCP_AUTH_TOKEN) produces an invalid plist. THEN, independently, sed's
# REPLACEMENT text has its own metacharacters (an unescaped '&' means
# "insert the whole match", '\N' is a backreference) — xml_escape's output
# itself contains '&' (from "&amp;" etc.), so it must be re-escaped for sed
# on top of the XML escaping, not instead of it.
xml_escape() {
  printf '%s' "$1" | sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g'
}
sed_escape_replacement() {
  printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/&/\\\&/g'
}
plist_value() {
  sed_escape_replacement "$(xml_escape "$1")"
}
