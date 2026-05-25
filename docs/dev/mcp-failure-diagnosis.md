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

## Scheduling: weekly launchd job

The wrapper and launchd plist are **committed** under `scripts/ops/` and deployed by a script — the runtime locations
(`~/bin`, `~/Library/LaunchAgents`) are install targets, not the source of truth. Edit the canonical files and re-run
the installer; never hand-edit the deployed copies.

| Committed source                                        | Deployed to                                               | Role                                          |
| ------------------------------------------------------- | --------------------------------------------------------- | --------------------------------------------- |
| `scripts/ops/of-mcp-diagnose`                           | `~/bin/of-mcp-diagnose`                                   | cron/launchd wrapper for `diagnose-failures`. |
| `scripts/ops/com.omnifocus-mcp.diagnose.plist.template` | `~/Library/LaunchAgents/com.omnifocus-mcp.diagnose.plist` | launchd job definition (paths substituted).   |
| `scripts/ops/install-diagnose-schedule.sh`              | —                                                         | Installs both, (re)loads the job.             |

### Deploy

```bash
scripts/ops/install-diagnose-schedule.sh            # install / reload
scripts/ops/install-diagnose-schedule.sh --verify   # also kickstart + assert exit 0
scripts/ops/install-diagnose-schedule.sh --uninstall # bootout + remove the plist
```

The installer is idempotent: it copies the wrapper to `~/bin`, generates the plist from the template (substituting
absolute paths — launchd does NOT expand `$HOME`/`~`), validates it with `plutil`, and reloads via
`launchctl bootout`/`bootstrap`. Schedule is weekly, **Sunday 09:00**.

Env overrides: `OF_MCP_BIN_DIR` (default `~/bin`), `OF_MCP_REPO_DIR` (default `~/omnifocus-mcp`, the prod checkout the
job runs against).

### The PATH gotcha (why the plist sets `EnvironmentVariables`)

launchd and cron run with a minimal `PATH=/usr/bin:/bin:/usr/sbin:/sbin` that omits Homebrew. With Node installed via
Homebrew, `npm`/`node`/`npx` are not found and the job **dies at exit 127** — a wrapper that works by hand fails
silently when scheduled. Two layers guard this:

1. The installer detects the Homebrew bin dir (`/opt/homebrew/bin` on Apple Silicon, `/usr/local/bin` on Intel) and
   bakes it into the plist's `EnvironmentVariables` → `PATH`.
2. The wrapper itself prepends the same dirs at runtime, so a manual or cron invocation is robust regardless of the
   caller's environment.

**Diagnosing a broken job:** `launchctl list | grep diagnose` — the middle column is the **last exit code** (127 =
command-not-found / PATH bug; 0 = healthy). A stale triage-doc mtime means a scheduled run never regenerated it.
**Verify a fix through launchd, not your shell:** `launchctl kickstart -p gui/$(id -u)/com.omnifocus-mcp.diagnose` runs
the job with the plist's environment applied (`--verify` does this for you). Note `launchctl print` does NOT echo
per-job `EnvironmentVariables`, so don't use it to confirm the PATH took — confirm via a successful kickstart.

### cron alternative (weekly, Sunday 09:00)

The wrapper is cron-safe (it sets its own PATH), so launchd is optional:

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
