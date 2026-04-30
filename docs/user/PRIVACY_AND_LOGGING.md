# Privacy and Logging

## Principles

1. **Server is local** - The MCP server runs on your Mac and sends your data nowhere on its own
2. **Minimal logging** - Only what debugging requires
3. **Automatic redaction** - Sensitive fields redacted
4. **Debug-only content** - User data only at DEBUG level (off by default)

## Scope

The server itself is local. What leaves your Mac depends on the **MCP client** (Claude Desktop, ChatGPT Desktop, etc.)
and the LLM it uses. When your assistant calls a tool, the server returns the result — task names, notes, projects,
tags, dates — to the client, which forwards it to its LLM as part of the conversation. If that LLM is cloud-hosted, your
data leaves the Mac at that point. Only a fully local model keeps it on-device.

This document covers what the **server** logs. For what your client and LLM provider do with tool results, see their
privacy documentation.

## What Gets Logged?

### INFO Level (Default)

- ✅ Operation/tool names, error types, performance metrics
- ✅ System status, correlation IDs
- ❌ **NO** task names, notes, or user content

### DEBUG Level (Opt-in)

User data included but redacted: names → `[REDACTED]`, notes → `[REDACTED]`, scripts → `[REDACTED]`

### Error Metrics (Privacy-Safe)

`[ERROR_METRIC]` logs contain only error types and system info—no user data:

```json
{ "context": "ManageTaskTool", "errorType": "SCRIPT_TIMEOUT", "recoverable": true }
```

## Redacted Fields

`name`, `note`, `notes`, `taskName`, `projectName`, `tagName`, `title`, `script`

## Log Levels

```bash
LOG_LEVEL=error  # Errors only
LOG_LEVEL=warn   # Errors + warnings
LOG_LEVEL=info   # Normal (default)
LOG_LEVEL=debug  # User data (redacted)
```

## Sharing Logs

**Safe:** INFO/ERROR level logs, `[ERROR_METRIC]` lines

**Careful:** DEBUG level logs—verify before sharing even though redacted

### Log Locations

| Client          | Path                                              |
| --------------- | ------------------------------------------------- |
| Claude Desktop  | `~/Library/Logs/Claude/mcp*.log`                  |
| Claude Code     | `~/Library/Logs/claude-code/*.log`                |
| ChatGPT Desktop | stderr/stdout (or `log stream --process ChatGPT`) |
| Custom          | stderr by default                                 |

### Extracting Error Metrics

```bash
# View errors
grep ERROR_METRIC ~/Library/Logs/Claude/mcp*.log | jq .

# Count by type
grep ERROR_METRIC ~/Library/Logs/Claude/mcp*.log | jq -r '.errorType' | sort | uniq -c
```

Example output (no personal data):

```
   5 SCRIPT_TIMEOUT
   2 OMNIFOCUS_NOT_RUNNING
   1 PERMISSION_DENIED
```

## Analyzing Error Rates

```bash
LOG_PATH=~/Library/Logs/Claude

# Total errors
grep ERROR_METRIC $LOG_PATH/mcp*.log | wc -l

# Recoverable errors (if >10%, auto-recovery would help)
grep ERROR_METRIC $LOG_PATH/mcp*.log | jq 'select(.recoverable == true)' | wc -l
```

## Implementation

| Component   | File                          | Purpose                                                |
| ----------- | ----------------------------- | ------------------------------------------------------ |
| Redaction   | `src/utils/logger.ts`         | `redactArgs()` recursively scans objects (max depth 6) |
| Error types | `src/utils/error-taxonomy.ts` | Categorizes errors, marks recoverability               |

## Privacy Audit

**September 2025:** Removed user data from INFO logs, added ERROR_METRIC, verified redaction.

**No known privacy issues.**

## Report Issues

https://github.com/kip-d/omnifocus-mcp/security
