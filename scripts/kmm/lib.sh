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
