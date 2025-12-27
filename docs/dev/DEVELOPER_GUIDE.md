# Developer Guide

For developers integrating or extending the OmniFocus MCP server.

**For end users:** See [GETTING_STARTED.md](../user/GETTING_STARTED.md).

---

## Quick Reference

| Doc | Content |
|-----|---------|
| [API-REFERENCE-V2.md](./API-REFERENCE-V2.md) | All tools with schemas |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Technical implementation |
| [PATTERNS.md](./PATTERNS.md) | Symptom → solution lookup |

---

## Tool Call Examples

### Query Tasks

```javascript
// Inbox tasks
{ "tool": "tasks", "arguments": { "mode": "inbox", "limit": "25" } }

// Today's tasks
{ "tool": "tasks", "arguments": { "mode": "today", "limit": "25" } }

// Search
{ "tool": "tasks", "arguments": { "mode": "search", "search": "budget", "limit": "50" } }

// Advanced filtering
{
  "tool": "tasks",
  "arguments": {
    "mode": "all",
    "filters": {
      "tags": { "operator": "OR", "values": ["urgent", "important"] },
      "dueDate": { "operator": "<=", "value": "2025-10-15" }
    },
    "sort": [{ "field": "dueDate", "direction": "asc" }],
    "limit": "50"
  }
}
```

### Manage Tasks

```javascript
// Create in inbox
{ "tool": "manage_task", "arguments": { "operation": "create", "name": "Review Q4 budget" } }

// Create with details
{
  "tool": "manage_task",
  "arguments": {
    "operation": "create",
    "name": "Send proposal",
    "projectId": "abc123",
    "dueDate": "2025-01-15 17:00",
    "tags": ["work", "urgent"],
    "flagged": "true"
  }
}

// Update, complete, delete
{ "tool": "manage_task", "arguments": { "operation": "update", "taskId": "id123", "flagged": "true" } }
{ "tool": "manage_task", "arguments": { "operation": "complete", "taskId": "id123" } }
{ "tool": "manage_task", "arguments": { "operation": "delete", "taskId": "id123" } }

// Bulk complete
{ "tool": "manage_task", "arguments": { "operation": "bulk_complete", "taskIds": ["id1", "id2"] } }
```

### Projects

```javascript
// List active projects
{ "tool": "projects", "arguments": { "operation": "list", "status": "active", "details": "true" } }

// Create project
{
  "tool": "projects",
  "arguments": {
    "operation": "create",
    "name": "Website Redesign",
    "sequential": "true",
    "folder": "Work"
  }
}
```

### Batch Creation

```javascript
{
  "tool": "batch_create",
  "arguments": {
    "items": [
      { "tempId": "proj1", "type": "project", "name": "Vacation Planning", "sequential": "true" },
      { "tempId": "task1", "parentTempId": "proj1", "type": "task", "name": "Book flights" },
      { "tempId": "task2", "parentTempId": "proj1", "type": "task", "name": "Reserve hotel" }
    ],
    "createSequentially": "true",
    "atomicOperation": "true"
  }
}
```

### Tags & Folders

```javascript
// List tags
{ "tool": "tags", "arguments": { "operation": "list", "namesOnly": "true" } }

// Create tag
{ "tool": "tags", "arguments": { "operation": "manage", "action": "create", "tagName": "urgent" } }

// List folders
{ "tool": "folders", "arguments": { "operation": "list", "includeProjects": "true" } }
```

### Analytics

```javascript
// Productivity stats
{ "tool": "productivity_stats", "arguments": { "period": "week" } }

// Workflow analysis
{ "tool": "workflow_analysis", "arguments": { "analysisDepth": "standard", "focusAreas": ["productivity", "bottlenecks"] } }
```

### System

```javascript
{ "tool": "system", "arguments": { "operation": "version" } }
{ "tool": "system", "arguments": { "operation": "diagnostics" } }
{ "tool": "system", "arguments": { "operation": "metrics", "metricsType": "detailed" } }
```

---

## Implementation Notes

### Date Formats

| Format | Example | Default Time |
|--------|---------|--------------|
| `YYYY-MM-DD` | `2025-01-15` | Due: 5pm, Defer: 8am |
| `YYYY-MM-DD HH:mm` | `2025-01-15 17:00` | As specified |

### MCP Type Coercion

Claude Desktop converts all parameters to strings. Schemas handle both:

```typescript
limit: z.union([z.number(), z.string().transform(v => parseInt(v, 10))])
  .pipe(z.number().min(1).max(200))
  .default(25);
```

### Cache TTLs

| Data | TTL |
|------|-----|
| Tasks | 30 seconds |
| Projects | 5 minutes |
| Tags | 5 minutes |
| Analytics | 1 hour |

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

| Component | Location | Purpose |
|-----------|----------|---------|
| Tools | `src/tools/` | MCP tool implementations |
| Scripts | `src/omnifocus/scripts/` | JXA scripts |
| Cache | `src/cache/` | TTL-based caching |
| Bridge | `src/omnifocus/bridge/` | JXA ↔ OmniJS bridge |

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
  error?: { code: string; message: string; suggestion?: string; };
}
```

**Factory functions:**
- `createSuccessResponseV2()` - Basic success
- `createErrorResponseV2()` - Error with suggestion
- `createListResponseV2()` - Auto-generates summary
- `createTaskResponseV2()` - Task-specific

---

## Extending the Server

### Adding a Tool

1. Create `src/tools/your-tool/YourTool.ts`
2. Extend `BaseTool`
3. Implement schema and execute method
4. Register in `src/tools/index.ts`

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
  300000  // 5 minutes
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

- [API Reference](./API-REFERENCE-V2.md) - Complete tool documentation
- [Architecture](./ARCHITECTURE.md) - Technical deep dive
- [Lessons Learned](./LESSONS_LEARNED.md) - Hard-won insights
- [Patterns](./PATTERNS.md) - Symptom → solution lookup
