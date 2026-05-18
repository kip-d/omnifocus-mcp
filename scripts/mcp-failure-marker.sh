#!/usr/bin/env bash
# scripts/mcp-failure-marker.sh — Tier-2 PostToolUse marker hook
#
# CHEAP appender: writes one timestamped line to the marker file per call.
# NEVER spawns an agent process (no agent spawn, no subshell to Claude CLI) —
# this is called on EVERY MCP tool use and must not trigger a recursive launch.
#
# Usage:
#   mcp-failure-marker.sh <tool_name>
#
# Env:
#   OMN37_MARKER  — path to the marker TSV (default: ~/.omnifocus-mcp/fresh-failures.tsv)
#
# Called by .claude/settings.local.json hooks.PostToolUse (gitignored, local only).
# The marker file is read by `npm run diagnose-failures` to surface recent failures.

printf '%s\t%s\n' "$(date -u +%FT%TZ)" "$1" >> "${OMN37_MARKER:-$HOME/.omnifocus-mcp/fresh-failures.tsv}"
