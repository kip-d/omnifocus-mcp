# Privacy and Logging - OmniFocus MCP Server

This document explains how the OmniFocus MCP server handles user data and ensures privacy-safe logging.

## Privacy Principles

1. **No data leaves your machine** - All operations are local to your Mac
2. **Minimal logging** - Only what's needed for debugging and error analysis
3. **Automatic redaction** - Sensitive fields are redacted from logs
4. **Debug-only personal data** - User content only appears at DEBUG log level (off by default)

## What Gets Logged?

### At INFO Level (Default)

- ✅ Operation names and tool names
- ✅ Error types and categories
- ✅ Performance metrics (timing, counts)
- ✅ System status (OmniFocus running, permissions granted)
- ✅ Correlation IDs (for request tracking)
- ❌ **NO** task names, notes, or user content

### At DEBUG Level (Opt-in)

- Includes user data BUT automatically redacted:
  - Task/project/tag names → `[REDACTED]`
  - Notes → `[REDACTED]`
  - Script content → `[REDACTED]`

### Error Metrics (Always Privacy-Safe)

Special `[ERROR_METRIC]` logs contain:

```json
{
  "timestamp": "2025-09-30T...",
  "context": "ManageTaskTool",
  "errorType": "SCRIPT_TIMEOUT",
  "recoverable": true,
  "correlationId": "abc123..."
}
```

**No user data** - only error types and system information.

## Redacted Fields

The logger automatically redacts these field names:

- `name` - task/project/tag names
- `note`, `notes` - task notes
- `taskName`, `projectName`, `tagName`
- `title`
- `script` - JXA script content

## Log Levels

Set via environment variable:

```bash
LOG_LEVEL=error  # Only errors (least verbose)
LOG_LEVEL=warn   # Errors and warnings
LOG_LEVEL=info   # Normal operation (default)
LOG_LEVEL=debug  # Include user data (redacted)
```

## Sharing Logs for Support

**Safe to share:**

- Any logs at INFO or ERROR level
- `[ERROR_METRIC]` lines (contain no user data)
- Full logs if generated with `LOG_LEVEL=info` or higher

**Be careful with:**

- Logs generated with `LOG_LEVEL=debug`
  - Even though redacted, verify before sharing
  - Check for any `[REDACTED]` markers

### Finding Your MCP Server Logs

Log location depends on which MCP client you're using:

**Claude Desktop (macOS):**

```bash
~/Library/Logs/Claude/mcp*.log
```

**Claude Code:**

```bash
~/Library/Logs/claude-code/*.log
```

**ChatGPT Desktop:**

```bash
# By default, logs are written to stderr/stdout
# - If you launch ChatGPT Desktop from Terminal, check the terminal output
# - If launched from Finder, logs go into the macOS unified log
#   (view via Console.app or `log stream --process ChatGPT`)
# - No ~/Library/Logs/ChatGPT directory is created unless you configure it
```

**Custom MCP Clients:**

- Logs go to `stderr` by default
- Check your client's documentation for log location

### Extracting Error Metrics Only

To share **only error statistics** (completely privacy-safe):

**For Claude Desktop:**

```bash
grep ERROR_METRIC ~/Library/Logs/Claude/mcp*.log | jq .

# Or count error types:
grep ERROR_METRIC ~/Library/Logs/Claude/mcp*.log | \
  jq -r '.errorType' | sort | uniq -c
```

**For Claude Code:**

```bash
grep ERROR_METRIC ~/Library/Logs/claude-code/*.log | jq .
```

**For any client (if you know the log file):**

```bash
grep ERROR_METRIC /path/to/your/logs/*.log | jq .
```

Example output:

```
   5 SCRIPT_TIMEOUT
   2 OMNIFOCUS_NOT_RUNNING
   1 PERMISSION_DENIED
```

This shows **what went wrong** without any personal information.

## Analyzing Error Rates

To measure if auto-recovery would help:

```bash
# Replace LOG_PATH with your client's log location from above

# Total errors
grep ERROR_METRIC $LOG_PATH/*.log | wc -l

# Recoverable errors
grep ERROR_METRIC $LOG_PATH/*.log | jq 'select(.recoverable == true)' | wc -l

# Calculate percentage
# If recoverable% > 10% → auto-recovery would help significantly
```

**Example for Claude Desktop users:**

```bash
LOG_PATH=~/Library/Logs/Claude
grep ERROR_METRIC $LOG_PATH/mcp*.log | wc -l
```

## Implementation Details

### Redaction Implementation

See `src/utils/logger.ts`:

- `redactArgs()` function recursively scans objects
- Deep redaction preserves structure for debugging
- Maximum recursion depth of 6 to prevent pathological cases

### Error Categorization

See `src/utils/error-taxonomy.ts`:

- All errors are categorized by type
- Each type marked as recoverable or not
- Used for metrics and auto-recovery decisions

## Privacy Audit History

**September 2025:**

- Removed raw user data from INFO level logs in ManageTaskTool
- Added ERROR_METRIC logging for privacy-safe telemetry
- Changed sensitive logs from `logger.info()` to `logger.debug()`
- Verified redaction working for all sensitive fields

**No known privacy issues in current codebase.**

## Questions?

If you find any logs that contain user data inappropriately, please report as a security issue:

- https://github.com/kip-d/omnifocus-mcp/security
