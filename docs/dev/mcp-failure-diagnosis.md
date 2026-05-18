# MCP Failure Diagnosis — Operator Guide

Covers the full failure-diagnosis pipeline: what it does, how to run it, how to configure it, and how to schedule it.

---

## Pipeline Overview

```
MCP tool use
    │
    ▼
src/tools/base.ts (logToolFailure) ← writes ~/.omnifocus-mcp/tool-failures/failures-YYYY-MM-DD.jsonl
    │
    ▼
scripts/analyze-tool-failures.ts  ← npm run analyze-failures   (read-only analysis, stdout)
    │
    ▼
scripts/diagnose-failures.ts      ← npm run diagnose-failures  (classify + write triage doc + ledger)
    │
    ├── src/diagnostics/clustering.ts        (fingerprint + escalation thresholds)
    ├── src/diagnostics/schema-drift.ts      (deterministic SCHEMA_DRIFT / COERCION_MISSING)
    ├── src/diagnostics/ledger.ts            (seen-patterns dedup)
    ├── src/diagnostics/triage-doc.ts        (render docs/dev/mcp-failure-triage.md)
    └── src/diagnostics/linear-filer.ts      (optional auto-Linear filing, cap-guarded)
```

---

## npm Scripts

| Script                                         | Description                                                                                                                                                              |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm run analyze-failures`                     | Read-only. Clusters and summarizes failures from the JSONL logs. No writes.                                                                                              |
| `npm run diagnose-failures`                    | Classifies escalated clusters, writes `docs/dev/mcp-failure-triage.md`, updates ledger.                                                                                  |
| `npm run diagnose-failures -- --create-issues` | Same, plus notes that SCHEMA_DRIFT rows are ready for manual or Claude-runtime filing. Auto-filing requires the Linear MCP `graphql` action (Claude-runtime-only in v1). |

### Threshold flags (passed to `runDiagnosis`)

| Flag             | Default | Meaning                                          |
| ---------------- | ------- | ------------------------------------------------ |
| `--days=N`       | 90      | How many days of JSONL logs to scan.             |
| `minOccurrences` | 3       | Cluster must have ≥ N occurrences to escalate.   |
| `minSpanDays`    | 2       | Cluster must span ≥ N calendar days to escalate. |

Thresholds are currently hard-coded in the CLI wrapper in `scripts/diagnose-failures.ts`. Change them there or inject
via `runDiagnosis` opts in tests.

---

## File Locations

| Path                                                       | Description                                                                                     |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `~/.omnifocus-mcp/tool-failures/failures-YYYY-MM-DD.jsonl` | Per-day failure log written by the MCP server.                                                  |
| `~/.omnifocus-mcp/diagnosed-patterns.json`                 | Seen-patterns ledger (sibling of `tool-failures/`). Deduplicates across runs.                   |
| `~/.omnifocus-mcp/fresh-failures.tsv`                      | Tier-2 marker file written by `scripts/mcp-failure-marker.sh` (one line per PostToolUse event). |
| `docs/dev/mcp-failure-triage.md`                           | Committed triage doc updated by `npm run diagnose-failures`.                                    |

---

## Tier-2 PostToolUse Marker Hook (local only)

`scripts/mcp-failure-marker.sh` is a cheap shell appender — one `ISO8601<TAB>tool` line per MCP tool use. It is called
by the `hooks.PostToolUse` entry in `.claude/settings.local.json`.

**This hook is local-only and gitignored.** Only `scripts/mcp-failure-marker.sh` ships in the repo. The settings file is
never committed.

To activate the hook, add the following to `.claude/settings.local.json` (create it if absent):

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "mcp__omnifocus__*",
        "hooks": [
          {
            "type": "command",
            "command": "bash scripts/mcp-failure-marker.sh"
          }
        ]
      }
    ]
  }
}
```

> **Do not add a positional `$TOOL_NAME` arg.** Claude Code command-type hooks do NOT export `$TOOL_NAME`; they deliver
> a JSON payload on **stdin** (with a `tool_name` field). The marker script parses `tool_name` from that stdin JSON via
> `jq` — see https://code.claude.com/docs/en/hooks.

The marker file (`~/.omnifocus-mcp/fresh-failures.tsv`) is a lightweight complement to the JSONL log. It records every
tool call (not just failures), enabling faster "did anything unusual happen recently?" queries without parsing JSONL.

---

## Agent-Based Classification

Clusters not resolved by the deterministic path (schema-drift / coercion check) are routed to the
`.claude/agents/mcp-failure-diagnoser.md` agent. The agent adjudicates between `DESCRIPTION_GAP` and `LLM_EXPLORATION`.

The agent is **only invoked from inside the Claude runtime** (e.g., via `npm run diagnose-failures` run under Claude
Code). The standalone CLI marks unresolved clusters `NEEDS_LLM` and skips them.

### Classification legend

| Classification      | Meaning                                                                                                               |
| ------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `SCHEMA_DRIFT`      | Advertised `inputSchema` diverged from Zod validation — deterministic.                                                |
| `COERCION_MISSING`  | Numeric field present in advertised schema, Zod rejects string input — deterministic.                                 |
| `DESCRIPTION_GAP`   | Tool description unclear; LLM-adjudicated.                                                                            |
| `LLM_EXPLORATION`   | No-op: LLM is probing the API; no fix required.                                                                       |
| `DATA_ERROR`        | No-op: bad caller data; not a schema issue.                                                                           |
| `NEEDS_LLM`         | Agent not configured or unavailable — manual investigation required.                                                  |
| `CAP_GUARD_TRIPPED` | Auto-Linear filing skipped because open issue count >= cap threshold.                                                 |
| `FILE_FAILED`       | One or more SCHEMA_DRIFT clusters could not be filed to Linear (createIssue rejected); successes were still ledgered. |

---

## Auto-Filing to Linear (`--create-issues`)

**v1 limitation:** `--create-issues` is recognized by the standalone CLI but does NOT auto-file. The concrete
`LinearClient` implementation uses the Linear MCP `graphql` action, which is only callable from inside an MCP client
(Claude's runtime). Introducing a direct Linear HTTP credential is explicitly out of scope for v1.

When `--create-issues` is passed from the standalone CLI, `diagnose-failures` logs a clear message explaining this and
outputs the triage doc with `SCHEMA_DRIFT` rows ready for manual filing.

Auto-filing guards (enforced by `src/diagnostics/linear-filer.ts`):

| Guard             | Behavior                                                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Class filter      | Only `SCHEMA_DRIFT` clusters are eligible for filing.                                                                          |
| Cap threshold     | If open issue count >= `capThreshold` (default 230), no issues are created; `CAP_GUARD_TRIPPED` row appears in the triage doc. |
| Fingerprint dedup | Searches for existing issues with the cluster fingerprint in the body; skips if found.                                         |
| Per-run limit     | At most `perRunLimit` (default 3) issues created per run.                                                                      |

---

## Scheduling: `~/bin/of-mcp-diagnose` (NOT committed — machine-specific)

> This recipe is **not committed to the repo**. It is a local ops script, following the same convention as
> `~/bin/of-mcp-redeploy`.

Create `~/bin/of-mcp-diagnose`:

```bash
#!/usr/bin/env bash
# ~/bin/of-mcp-diagnose — local cron/launchd wrapper for diagnose-failures
# NOT committed; machine-specific. See docs/dev/mcp-failure-diagnosis.md.
set -euo pipefail

REPO_DIR="$HOME/omnifocus-mcp"
LOG="$HOME/.omnifocus-mcp/diagnose-failures.log"

cd "$REPO_DIR"
npm run diagnose-failures -- --days=90 >> "$LOG" 2>&1
```

Make it executable:

```bash
chmod +x ~/bin/of-mcp-diagnose
```

### launchd plist (weekly, Sunday 09:00)

> launchd does NOT expand `$HOME` or `~` in `ProgramArguments` — substitute your own absolute username path (replace
> `/Users/kip/...` below). The cron alternative further down uses `$HOME` and is fine as-is.

Save as `~/Library/LaunchAgents/com.omnifocus-mcp.diagnose.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>com.omnifocus-mcp.diagnose</string>
    <key>ProgramArguments</key>
    <array>
      <string>/bin/bash</string>
      <string>/Users/kip/bin/of-mcp-diagnose</string>
    </array>
    <key>StartCalendarInterval</key>
    <dict>
      <key>Weekday</key>
      <integer>0</integer>
      <key>Hour</key>
      <integer>9</integer>
      <key>Minute</key>
      <integer>0</integer>
    </dict>
    <key>RunAtLoad</key>
    <false/>
    <key>StandardOutPath</key>
    <string>/Users/kip/.omnifocus-mcp/diagnose-failures-launchd.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/kip/.omnifocus-mcp/diagnose-failures-launchd.log</string>
  </dict>
</plist>
```

Load it:

```bash
launchctl load ~/Library/LaunchAgents/com.omnifocus-mcp.diagnose.plist
```

### cron alternative (weekly, Sunday 09:00)

```cron
0 9 * * 0 $HOME/bin/of-mcp-diagnose
```

Add via `crontab -e`.

---

## Tool Schema Registry

`src/diagnostics/tool-schema-registry.ts` exports `TOOL_SCHEMA_REGISTRY` — the list of tools whose schemas are compared
by the drift checker. When a new tool is added, add an entry here so its schema stays under CI drift-gate coverage.

---

## Related Docs

| Doc                              | Purpose                                                     |
| -------------------------------- | ----------------------------------------------------------- |
| `docs/dev/mcp-failure-triage.md` | Live triage output, updated by `npm run diagnose-failures`. |
| `docs/dev/PATTERNS.md`           | Symptom lookup for debugging.                               |
