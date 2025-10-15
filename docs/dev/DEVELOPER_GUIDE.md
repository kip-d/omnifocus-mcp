# Developer Guide - OmniFocus MCP Server

This guide is for developers who want to:
- Integrate this MCP server into their own tools
- Understand the technical implementation
- Call tools programmatically
- Extend or modify the server

**For end users:** See [GETTING_STARTED.md](./GETTING_STARTED.md) instead.

## Quick Reference

- **[Complete API Reference](./API-REFERENCE-V2.md)** - All tools with schemas
- **[Architecture](./ARCHITECTURE.md)** - Technical implementation details
- **[Testing Guide](./REAL_LLM_TESTING.md)** - Testing with real LLMs

## Tool Call Examples

All examples use JSON format for programmatic tool calls. These are what the MCP protocol sends, not what users type.

### Query Tasks

```javascript
// Get inbox tasks (not assigned to any project)
{
  "tool": "tasks",
  "arguments": {
    "mode": "inbox",
    "limit": "25",
    "details": "false"
  }
}

// Alternative: Filter for inbox using project: null
{
  "tool": "tasks",
  "arguments": {
    "mode": "all",
    "project": "null",  // or null or ""
    "limit": "25"
  }
}

// Get today's tasks
{
  "tool": "tasks",
  "arguments": {
    "mode": "today",
    "limit": "25",
    "details": "false"
  }
}

// Search tasks
{
  "tool": "tasks",
  "arguments": {
    "mode": "search",
    "search": "budget",
    "limit": "50"
  }
}

// Get overdue tasks
{
  "tool": "tasks",
  "arguments": {
    "mode": "overdue",
    "limit": "100"
  }
}

// Get available tasks (ready to work on)
{
  "tool": "tasks",
  "arguments": {
    "mode": "available",
    "limit": "25"
  }
}

// Advanced filtering with operators
{
  "tool": "tasks",
  "arguments": {
    "mode": "all",
    "filters": {
      "tags": {
        "operator": "OR",
        "values": ["urgent", "important"]
      },
      "dueDate": {
        "operator": "<=",
        "value": "2025-10-15"
      },
      "estimatedMinutes": {
        "operator": "<=",
        "value": 30
      }
    },
    "sort": [
      { "field": "dueDate", "direction": "asc" },
      { "field": "flagged", "direction": "desc" }
    ],
    "limit": "50"
  }
}
```

### Manage Tasks

```javascript
// Create task in inbox
{
  "tool": "manage_task",
  "arguments": {
    "operation": "create",
    "name": "Review Q4 budget",
    "note": "Include projections for next year"
  }
}

// Create task with full details
{
  "tool": "manage_task",
  "arguments": {
    "operation": "create",
    "name": "Send proposal to client",
    "projectId": "abc123xyz",
    "dueDate": "2025-01-15 17:00",
    "deferDate": "2025-01-10 09:00",
    "tags": ["work", "urgent"],
    "estimatedMinutes": "30",
    "flagged": "true",
    "note": "Use Q4 template"
  }
}

// Update task
{
  "tool": "manage_task",
  "arguments": {
    "operation": "update",
    "taskId": "taskId123",
    "flagged": "true",
    "dueDate": "2025-01-20 17:00"
  }
}

// Complete task
{
  "tool": "manage_task",
  "arguments": {
    "operation": "complete",
    "taskId": "taskId123"
  }
}

// Delete task
{
  "tool": "manage_task",
  "arguments": {
    "operation": "delete",
    "taskId": "taskId123"
  }
}

// Bulk complete by IDs
{
  "tool": "manage_task",
  "arguments": {
    "operation": "bulk_complete",
    "taskIds": ["id1", "id2", "id3"]
  }
}

// Bulk complete by criteria
{
  "tool": "manage_task",
  "arguments": {
    "operation": "bulk_complete",
    "bulkCriteria": {
      "tags": ["quick-win"],
      "completed": false
    }
  }
}
```

### Project Operations

```javascript
// List projects
{
  "tool": "projects",
  "arguments": {
    "operation": "list",
    "status": "active",
    "limit": "50",
    "details": "true"
  }
}

// Create project
{
  "tool": "projects",
  "arguments": {
    "operation": "create",
    "name": "Website Redesign",
    "sequential": "true",
    "folder": "Work",
    "note": "Complete by Q2",
    "tags": ["web", "priority"]
  }
}

// Update project
{
  "tool": "projects",
  "arguments": {
    "operation": "update",
    "projectId": "projId123",
    "flagged": "true",
    "dueDate": "2025-03-31"
  }
}

// Get projects needing review
{
  "tool": "projects",
  "arguments": {
    "operation": "review",
    "limit": "20"
  }
}
```

### Batch Creation

Create multiple projects and tasks atomically with hierarchical relationships:

```javascript
{
  "tool": "batch_create",
  "arguments": {
    "items": [
      {
        "tempId": "proj1",
        "type": "project",
        "name": "Vacation Planning",
        "sequential": "true"
      },
      {
        "tempId": "task1",
        "parentTempId": "proj1",
        "type": "task",
        "name": "Book flights",
        "dueDate": "2025-02-01"
      },
      {
        "tempId": "task2",
        "parentTempId": "proj1",
        "type": "task",
        "name": "Reserve hotel"
      },
      {
        "tempId": "subtask1",
        "parentTempId": "task1",
        "type": "task",
        "name": "Compare prices"
      }
    ],
    "createSequentially": "true",
    "atomicOperation": "true"
  }
}
```

### Smart Capture - Parse Meeting Notes

```javascript
// Extract action items from meeting notes
{
  "tool": "parse_meeting_notes",
  "arguments": {
    "input": "Meeting Notes:\n- Send proposal to client by Friday\n- Call Sarah about budget\n- Review Q4 metrics before next week",
    "returnFormat": "preview",
    "extractMode": "action_items",
    "suggestTags": "true",
    "suggestDueDates": "true",
    "suggestEstimates": "true",
    "suggestProjects": "false",
    "groupByProject": "false"
  }
}

// Returns structured tasks with:
// - Extracted task names
// - Detected due dates ("by Friday" → date)
// - Context tags (@phone, @computer, @urgent, etc.)
// - Duration estimates
// - Confidence scores

// Use batch_ready format for direct creation
{
  "tool": "parse_meeting_notes",
  "arguments": {
    "input": "Meeting notes here...",
    "returnFormat": "batch_ready",
    "extractMode": "both",
    "suggestTags": "true",
    "suggestDueDates": "true"
  }
}
// Returns format compatible with batch_create tool
```

### Workflow Analysis

Deep dive into your GTD system health and efficiency:

```javascript
// Quick daily workflow check
{
  "tool": "workflow_analysis",
  "arguments": {
    "analysisDepth": "quick",
    "focusAreas": ["productivity", "bottlenecks"],
    "includeRawData": "false",
    "maxInsights": "10"
  }
}
// Returns: Quick insights about productivity and current bottlenecks (~5-10 seconds)

// Standard weekly review
{
  "tool": "workflow_analysis",
  "arguments": {
    "analysisDepth": "standard",
    "focusAreas": ["productivity", "workload", "project_health"],
    "includeRawData": "false",
    "maxInsights": "15"
  }
}
// Returns: Comprehensive workflow health report with insights, patterns, and recommendations (~15-30 seconds)

// Deep monthly analysis
{
  "tool": "workflow_analysis",
  "arguments": {
    "analysisDepth": "deep",
    "focusAreas": ["productivity", "workload", "project_health", "time_patterns", "bottlenecks", "opportunities"],
    "includeRawData": "false",
    "maxInsights": "25"
  }
}
// Returns: Full workflow analysis with detailed patterns, bottlenecks, and optimization opportunities (~30-60 seconds)

// Troubleshooting workflow issues (with raw data for LLM analysis)
{
  "tool": "workflow_analysis",
  "arguments": {
    "analysisDepth": "standard",
    "focusAreas": ["bottlenecks", "project_health"],
    "includeRawData": "true",
    "maxInsights": "20"
  }
}
// Returns: Analysis focused on bottlenecks with raw task/project data for deeper investigation

// Targeted productivity analysis
{
  "tool": "workflow_analysis",
  "arguments": {
    "analysisDepth": "standard",
    "focusAreas": ["productivity", "time_patterns"],
    "includeRawData": "false",
    "maxInsights": "15"
  }
}
// Returns: Insights about when and how you complete tasks, productivity patterns
```

**Response Structure:**
```json
{
  "success": true,
  "operation": "workflow_analysis",
  "title": "Workflow Analysis Results",
  "summary": [
    "Workflow health score: 78/100",
    "Found 12 key patterns in your workflow",
    "Recommended: Review 3 stagnant projects"
  ],
  "data": {
    "analysis": {
      "depth": "standard",
      "focusAreas": ["productivity", "workload", "bottlenecks"],
      "timestamp": "2025-10-14T12:00:00Z"
    },
    "insights": [
      "You complete most tasks in the morning (80% before 12pm)",
      "3 projects haven't had activity in 30+ days",
      "Average task completion time has increased 20% this month"
    ],
    "patterns": [
      {
        "type": "completion_time",
        "description": "Morning productivity peak",
        "impact": "high"
      },
      {
        "type": "project_stagnation",
        "description": "3 inactive projects",
        "impact": "medium"
      }
    ],
    "recommendations": [
      "Schedule complex tasks before noon to leverage peak productivity",
      "Review or archive stagnant projects to reduce mental overhead"
    ],
    "metadata": {
      "totalTasks": 245,
      "totalProjects": 18,
      "score": 78,
      "dataPoints": 12
    }
  },
  "metadata": {
    "analysis_depth": "standard",
    "focus_areas": ["productivity", "workload", "bottlenecks"],
    "from_cache": false,
    "execution_time_ms": 18432
  }
}
```

**Use Cases:**
- **GTD Weekly Review**: Use `standard` depth with all focus areas to review your workflow health
- **Daily Check-in**: Use `quick` depth focused on productivity and bottlenecks
- **Troubleshooting**: Use `standard` or `deep` with `includeRawData: true` when you feel stuck
- **Optimization**: Use `deep` analysis before major planning sessions or quarterly reviews
- **Pattern Discovery**: Focus on `time_patterns` and `opportunities` to find workflow improvements

**Performance Notes:**
- Cached for 2 hours (analysis is computationally expensive)
- `quick` depth: ~5-10 seconds
- `standard` depth: ~15-30 seconds
- `deep` depth: ~30-60 seconds
- `includeRawData: true` increases response size significantly (for LLM analysis)

### Tag Management

```javascript
// List all tags (fast, names only)
{
  "tool": "tags",
  "arguments": {
    "operation": "list",
    "sortBy": "name",
    "includeEmpty": "false",
    "includeUsageStats": "false",
    "includeTaskCounts": "false",
    "fastMode": "false",
    "namesOnly": "true"
  }
}

// List active tags with usage stats
{
  "tool": "tags",
  "arguments": {
    "operation": "active",
    "sortBy": "usage",
    "includeEmpty": "false",
    "includeUsageStats": "true",
    "includeTaskCounts": "true",
    "fastMode": "false",
    "namesOnly": "false"
  }
}

// Create tag
{
  "tool": "tags",
  "arguments": {
    "operation": "manage",
    "action": "create",
    "tagName": "urgent"
  }
}

// Create nested tag
{
  "tool": "tags",
  "arguments": {
    "operation": "manage",
    "action": "create",
    "tagName": "meetings",
    "parentTagName": "work"
  }
}

// Rename tag
{
  "tool": "tags",
  "arguments": {
    "operation": "manage",
    "action": "rename",
    "tagName": "urgent",
    "newName": "high-priority"
  }
}
```

### Folder Management

```javascript
// List all folders
{
  "tool": "folders",
  "arguments": {
    "operation": "list",
    "includeProjects": "true",
    "includeSubfolders": "true"
  }
}

// Get specific folder
{
  "tool": "folders",
  "arguments": {
    "operation": "get",
    "folderId": "folderId123"
  }
}

// Create folder
{
  "tool": "folders",
  "arguments": {
    "operation": "create",
    "name": "Personal",
    "parentFolderId": null
  }
}

// Create nested folder
{
  "tool": "folders",
  "arguments": {
    "operation": "create",
    "name": "Home Projects",
    "parentFolderId": "personalFolderId"
  }
}
```

### Perspectives

```javascript
// List all perspectives
{
  "tool": "perspectives",
  "arguments": {
    "operation": "list",
    "includeFilterRules": "false",
    "sortBy": "name"
  }
}

// Query a specific perspective
{
  "tool": "perspectives",
  "arguments": {
    "operation": "query",
    "perspectiveName": "Today",
    "limit": "50",
    "includeDetails": "true",
    "formatOutput": "true",
    "groupBy": "project",
    "includeMetadata": "true"
  }
}
```

### Analytics & Insights

```javascript
// Productivity stats
{
  "tool": "productivity_stats",
  "arguments": {
    "period": "week",
    "includeProjectStats": "true",
    "includeTagStats": "true"
  }
}

// Task velocity
{
  "tool": "task_velocity",
  "arguments": {
    "days": "30",
    "groupBy": "day",
    "includeWeekends": "true"
  }
}

// Analyze overdue tasks
{
  "tool": "analyze_overdue",
  "arguments": {
    "includeRecentlyCompleted": "true",
    "groupBy": "project",
    "limit": "50"
  }
}

// Workflow analysis
{
  "tool": "workflow_analysis",
  "arguments": {
    "analysisDepth": "standard",
    "focusAreas": "all",
    "includeRawData": "false",
    "maxInsights": "10"
  }
}

// Pattern analysis
{
  "tool": "analyze_patterns",
  "arguments": {
    "patterns": ["duplicates", "dormant_projects", "deadline_health"],
    "options": "{}"
  }
}
```

### Export Data

```javascript
// Export tasks to JSON
{
  "tool": "export",
  "arguments": {
    "type": "tasks",
    "format": "json",
    "filter": {
      "completed": false,
      "flagged": true
    },
    "fields": ["id", "name", "dueDate", "project", "tags"]
  }
}

// Export all active projects
{
  "tool": "export",
  "arguments": {
    "type": "projects",
    "format": "csv",
    "includeCompleted": false,
    "includeProjectStats": true
  }
}

// Complete database export
{
  "tool": "export",
  "arguments": {
    "type": "all",
    "format": "json",
    "outputDirectory": "/path/to/export",
    "includeCompleted": false
  }
}
```

### System Tools

```javascript
// Get version info
{
  "tool": "system",
  "arguments": {
    "operation": "version",
    "testScript": "",
    "metricsType": "summary"
  }
}

// Run diagnostics
{
  "tool": "system",
  "arguments": {
    "operation": "diagnostics",
    "testScript": "",
    "metricsType": "summary"
  }
}

// Get performance metrics
{
  "tool": "system",
  "arguments": {
    "operation": "metrics",
    "testScript": "",
    "metricsType": "detailed"
  }
}
```

## Important Implementation Notes

### Date Formats

All date parameters accept:
- `"YYYY-MM-DD"` - Date only (smart defaults: due=5pm, defer=8am)
- `"YYYY-MM-DD HH:mm"` - Date and time in local timezone

Basic natural language is supported:
- `"today"`, `"tomorrow"` work
- Complex phrases like "the 3rd Thursday after next week" should be converted to YYYY-MM-DD by the LLM first

### MCP Type Coercion

**Critical:** Claude Desktop converts all parameters to strings during transport.

All tool schemas handle both string and native types:

```typescript
// Schema handles both
limit: z.union([
  z.number(),
  z.string().transform(val => parseInt(val, 10))
]).pipe(z.number().min(1).max(200)).default(25)
```

When testing:
- Direct Node.js calls: Use native types
- Claude Desktop calls: Everything becomes strings

### Parameter Defaults

Most parameters have sensible defaults:
- `limit`: 25 (tasks), 50 (projects)
- `details`: false (for performance)
- `completed`: false (exclude completed items)

### Performance Considerations

- **Field selection**: Use `fields` parameter to reduce payload
- **Skip analysis**: Set `skipAnalysis: true` for faster queries
- **Appropriate limits**: Don't request more data than needed
- **Fast modes**: Use `fastMode`, `namesOnly` options when available

### Cache Behavior

The server uses TTL-based caching:
- Tasks: 30 seconds
- Projects: 5 minutes
- Tags: 5 minutes
- Analytics: 1 hour

Cache automatically invalidates on write operations. For testing, changing any parameter creates a new cache key.

## Testing

### CLI Testing

```bash
# Initialize server
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}' | node dist/index.js

# Call a tool
echo '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"tasks","arguments":{"mode":"today","limit":"3"}}}' | node dist/index.js
```

### MCP Inspector

```bash
npx @modelcontextprotocol/inspector dist/index.js
```

Interactive tool for testing all MCP functionality.

### Integration Tests

```bash
npm test                  # Unit tests
npm run test:integration  # Integration tests with real OmniFocus
```

## Architecture Overview

### Key Components

- **Tools** (`src/tools/`): MCP tool implementations
- **OmniFocus Scripts** (`src/omnifocus/scripts/`): JXA scripts for OmniFocus API
- **Cache** (`src/cache/`): TTL-based caching layer
- **Bridge** (`src/omnifocus/bridge/`): JXA ↔ OmniJS bridge

### Execution Flow

```
MCP Client → MCP Server → Tool → Cache Check → JXA Script → OmniFocus
                                      ↓
                                   Return cached
```

### JXA + Bridge Approach

The server uses a hybrid approach:
- **Pure JXA**: Simple operations (<100 items)
- **JXA + Bridge**: Complex operations, bulk operations (>100 items), tag assignment, repetition rules

See [ARCHITECTURE.md](./ARCHITECTURE.md) for complete details.

## Common Patterns

### Error Handling

All tools return structured errors:

```javascript
{
  "error": "SCRIPT_ERROR",
  "message": "Failed to execute OmniFocus script",
  "errorType": "TIMEOUT",
  "recoverable": true,
  "details": { ... }
}
```

See [Error Taxonomy](./TROUBLESHOOTING.md) for all error types.

### Correlation IDs

All operations include correlation IDs for tracing:

```javascript
// Check logs for this ID
[INFO] [tools] Executing tool: tasks [correlationId: abc-123-xyz]
```

### Performance Monitoring

Enable detailed metrics:

```javascript
{
  "tool": "system",
  "arguments": {
    "operation": "metrics",
    "metricsType": "detailed"
  }
}
```

## Extending the Server

### Adding a New Tool

1. Create tool file in `src/tools/your-tool/YourTool.ts`
2. Extend `BaseTool` class
3. Implement schema and execute method
4. Register in `src/tools/index.ts`

See existing tools for patterns.

### Adding JXA Scripts

1. Create script in `src/omnifocus/scripts/`
2. Export as template string
3. Use `getAllHelpers()` or `getCoreHelpers()` as needed
4. Test with both direct execution and Claude Desktop

### Cache Strategies

```typescript
// Standard caching
const result = await this.cache.get(
  cacheKey,
  async () => executeScript(),
  300000  // 5 minutes
);

// No caching
const result = await executeScript();
```

## Resources

- **[Complete API Reference](./API-REFERENCE-V2.md)** - All tools, parameters, return types
- **[Architecture Documentation](./ARCHITECTURE.md)** - Technical deep dive
- **[Testing Framework](./REAL_LLM_TESTING.md)** - Real LLM integration testing
- **[Lessons Learned](./LESSONS_LEARNED.md)** - Hard-won insights
- **[Debugging Workflow](./DEBUGGING_WORKFLOW.md)** - Systematic debugging approach

## Contributing

See main repository for contribution guidelines. Key areas:

- Performance optimizations
- New tool implementations
- Better LLM-friendly tool descriptions
- Test coverage improvements
- Documentation enhancements
