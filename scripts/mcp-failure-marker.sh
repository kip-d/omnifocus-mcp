#!/usr/bin/env bash
# scripts/mcp-failure-marker.sh — Tier-2 PostToolUse marker hook
#
# CHEAP appender: writes one timestamped line to the marker file per call.
# NEVER spawns an agent process (no agent spawn, no subshell to Claude CLI) —
# this is called on EVERY MCP tool use and must not trigger a recursive launch.
#
# Invoked by the .claude/settings.local.json hooks.PostToolUse entry (gitignored,
# local only). Claude Code command-type hooks deliver a JSON payload on STDIN
# (NOT as env vars / positional args). The PostToolUse payload includes a
# `tool_name` field — see https://code.claude.com/docs/en/hooks.
#
#   { "hook_event_name": "PostToolUse", "tool_name": "mcp__omnifocus__...", ... }
#
# Env:
#   OMN37_MARKER  — path to the marker TSV (default: ~/.omnifocus-mcp/fresh-failures.tsv)
#
# The marker file is read by `npm run diagnose-failures` to surface recent failures.
#
# A hook that errors degrades EVERY tool call, so every step fails silent (|| true)
# and the script always exits 0.

MARKER="${OMN37_MARKER:-$HOME/.omnifocus-mcp/fresh-failures.tsv}"

# Parse the tool name from the stdin JSON payload. Empty / non-JSON / missing
# field → empty string (still appended; never errors).
tool_name="$(jq -r '.tool_name // ""' 2>/dev/null || true)"

mkdir -p "$(dirname "$MARKER")" 2>/dev/null || true
printf '%s\t%s\n' "$(date -u +%FT%TZ)" "$tool_name" >> "$MARKER" 2>/dev/null || true

exit 0
