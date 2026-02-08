# Developer Guide

For developers integrating or extending the OmniFocus MCP server.

**For end users:** See [GETTING_STARTED.md](../user/GETTING_STARTED.md).

---

## Quick Reference

| Doc                                                     | Content                   |
| ------------------------------------------------------- | ------------------------- |
| [API-COMPACT-UNIFIED.md](../api/API-COMPACT-UNIFIED.md) | Unified API schemas       |
| [ARCHITECTURE.md](./ARCHITECTURE.md)                    | Technical implementation  |
| [PATTERNS.md](./PATTERNS.md)                            | Symptom → solution lookup |

---

## Unified API (v3.0.0)

Four tools: `omnifocus_read`, `omnifocus_write`, `omnifocus_analyze`, `system`.

### Query Tasks (omnifocus_read)

```javascript
// Inbox tasks
{ "query": { "type": "tasks", "filters": { "project": null }, "limit": 25 } }

// Today's tasks
{ "query": { "type": "tasks", "mode": "today", "limit": 25 } }

// Search
{ "query": { "type": "tasks", "mode": "search", "search": "budget", "limit": 50 } }

// Advanced filtering
{ "query": { "type": "tasks", "filters": { "tags": { "any": ["urgent", "important"] }, "dueDate": { "before": "2026-01-15" } }, "limit": 50 } }

// Count only (33x faster for "how many" questions)
{ "query": { "type": "tasks", "filters": { "status": "active" }, "countOnly": true } }
```

### Manage Tasks (omnifocus_write)

```javascript
// Create in inbox
{ "mutation": { "operation": "create", "target": "task", "data": { "name": "Review Q4 budget" } } }

// Create with details
{ "mutation": { "operation": "create", "target": "task", "data": { "name": "Send proposal", "project": "Work", "dueDate": "2026-01-15 17:00", "tags": ["work", "urgent"], "flagged": true } } }

// Update
{ "mutation": { "operation": "update", "target": "task", "id": "id123", "changes": { "flagged": true } } }

// Complete
{ "mutation": { "operation": "complete", "target": "task", "id": "id123" } }

// Delete
{ "mutation": { "operation": "delete", "target": "task", "id": "id123" } }
```

### Projects (omnifocus_read / omnifocus_write)

```javascript
// List active projects
{ "query": { "type": "projects", "filters": { "status": "active" } } }

// Create project
{ "mutation": { "operation": "create", "target": "project", "data": { "name": "Website Redesign", "sequential": true, "folder": "Work" } } }
```

### Batch Operations (omnifocus_write)

```javascript
{ "mutation": { "operation": "batch", "target": "project", "operations": [
    { "operation": "create", "target": "project", "data": { "name": "Vacation Planning", "sequential": true, "tempId": "proj1" } },
    { "operation": "create", "target": "task", "data": { "name": "Book flights", "parentTempId": "proj1" } },
    { "operation": "create", "target": "task", "data": { "name": "Reserve hotel", "parentTempId": "proj1" } }
  ], "createSequentially": true, "returnMapping": true } }
```

### Tags & Folders (omnifocus_read)

```javascript
// List tags
{ "query": { "type": "tags" } }

// List folders
{ "query": { "type": "folders" } }
```

### Analytics (omnifocus_analyze)

```javascript
// Productivity stats
{ "analysis": { "type": "productivity_stats", "params": { "groupBy": "week" } } }

// Workflow analysis
{ "analysis": { "type": "workflow_analysis" } }

// Overdue analysis
{ "analysis": { "type": "overdue_analysis" } }

// Parse meeting notes
{ "analysis": { "type": "parse_meeting_notes", "params": { "text": "Action items from standup..." } } }
```

### System

```javascript
{ "query": { "type": "system", "operation": "version" } }
{ "query": { "type": "system", "operation": "diagnostics" } }
```

---

## Implementation Notes

### Date Formats

| Format             | Example            | Default Time         |
| ------------------ | ------------------ | -------------------- |
| `YYYY-MM-DD`       | `2026-01-15`       | Due: 5pm, Defer: 8am |
| `YYYY-MM-DD HH:mm` | `2026-01-15 17:00` | As specified         |

Never use ISO-8601 with Z suffix.

### MCP Type Coercion

Claude Desktop converts all parameters to strings. Schemas handle both:

```typescript
limit: z.union([z.number(), z.string().transform((v) => parseInt(v, 10))])
  .pipe(z.number().min(1).max(200))
  .default(25);
```

### Cache TTLs

| Data      | TTL        |
| --------- | ---------- |
| Tasks     | 5 minutes  |
| Projects  | 5 minutes  |
| Tags      | 10 minutes |
| Folders   | 10 minutes |
| Analytics | 1 hour     |

Cache invalidates automatically on writes.

---

## Testing

```bash
# CLI test
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}' | node dist/index.js

# MCP Inspector
npx @modelcontextprotocol/inspector dist/index.js

# Tests
npm test                  # Unit tests
npm run test:integration  # Integration tests
```

---

## Architecture Overview

```
MCP Client → MCP Server → Tool → Cache → JXA Script → OmniFocus
```

| Component | Location                        | Purpose             |
| --------- | ------------------------------- | ------------------- |
| Tools     | `src/tools/unified/`            | Unified MCP tools   |
| Scripts   | `src/omnifocus/scripts/`        | JXA scripts         |
| Cache     | `src/cache/`                    | TTL-based caching   |
| Bridge    | `src/omnifocus/scripts/shared/` | JXA ↔ OmniJS bridge |
| AST       | `src/contracts/ast/`            | Script generation   |

**Execution model:** Pure JXA for simple ops, JXA + Bridge for complex ops (tags, bulk, repetition).

---

## Response Format

### ScriptResult (Layer 1 - Script Execution)

```typescript
type ScriptResult<T> = ScriptSuccess<T> | ScriptError;

// Usage
const result = await omniAutomation.executeJson<TaskData>(script);
if (isScriptSuccess(result)) {
  console.log(result.data);
} else {
  console.error(result.error, result.context);
}
```

### StandardResponseV2 (Layer 2 - MCP Response)

```typescript
interface StandardResponseV2<T> {
  success: boolean;
  summary?: TaskSummary | ProjectSummary;
  data: T;
  metadata: StandardMetadataV2;
  error?: { code: string; message: string; suggestion?: string };
}
```

**Factory functions:**

- `createSuccessResponseV2()` - Basic success
- `createErrorResponseV2()` - Error with suggestion
- `createListResponseV2()` - Auto-generates summary
- `createTaskResponseV2()` - Task-specific

---

## Extending the Server

### Adding Functionality

The unified API uses discriminated unions in `src/tools/unified/`. To add new query types or mutations, extend the
schemas and compilers:

1. Add schema types in `src/tools/unified/schemas/`
2. Add compilation logic in `src/tools/unified/compilers/`
3. Add or update JXA scripts in `src/omnifocus/scripts/`
4. Register in the appropriate tool handler

### Adding JXA Scripts

1. Create script in `src/omnifocus/scripts/`
2. Export as template string
3. Use `getUnifiedHelpers()` as needed
4. Test with both direct execution and Claude Desktop

### Cache Usage

```typescript
const result = await this.cache.get(
  cacheKey,
  async () => executeScript(),
  300000, // 5 minutes
);
```

---

## Error Handling

All tools return structured errors:

```javascript
{
  "error": "SCRIPT_ERROR",
  "message": "Failed to execute OmniFocus script",
  "errorType": "TIMEOUT",
  "recoverable": true
}
```

See [TROUBLESHOOTING.md](../user/TROUBLESHOOTING.md) for error types.

---

## Resources

- [API Reference](../api/API-COMPACT-UNIFIED.md) - Unified API schemas
- [Architecture](./ARCHITECTURE.md) - Technical deep dive
- [Lessons Learned](./LESSONS_LEARNED.md) - Hard-won insights
- [Patterns](./PATTERNS.md) - Symptom → solution lookup
