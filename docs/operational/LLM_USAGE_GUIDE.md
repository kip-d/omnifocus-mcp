# LLM Usage Guide for OmniFocus MCP Server

## Overview

Best practices for AI agents using the OmniFocus MCP Server v3.0.0 unified API.

## The 4 Unified Tools

| Tool                | Purpose                                     | When to Use                       |
| ------------------- | ------------------------------------------- | --------------------------------- |
| `omnifocus_read`    | Query tasks, projects, tags, perspectives   | Reading any data                  |
| `omnifocus_write`   | Create, update, complete, delete, batch ops | Modifying any data                |
| `omnifocus_analyze` | Productivity stats, velocity, patterns      | Analytics and insights            |
| `system`            | Version, diagnostics, metrics, cache        | Health checks and troubleshooting |

**Decision is simple:** Read data → `omnifocus_read`. Change data → `omnifocus_write`. Analyze patterns →
`omnifocus_analyze`.

## Best Practices

### 1. Use Natural Language Parameters

The unified API uses structured queries with human-readable fields:

```javascript
// Query tasks
omnifocus_read({
  query: { type: 'tasks', mode: 'today', limit: 25 },
});

// Create task
omnifocus_write({
  mutation: {
    operation: 'create',
    target: 'task',
    data: { name: 'Review report', project: 'Work', tags: ['urgent'], dueDate: '2026-01-15 17:00' },
  },
});
```

### 2. Use countOnly for "How Many" Questions

33x faster than fetching full results:

```javascript
// ❌ Slow: fetches all data just to count
omnifocus_read({ query: { type: 'tasks', filters: { status: 'active' } } });

// ✅ Fast: returns count only
omnifocus_read({ query: { type: 'tasks', filters: { status: 'active' }, countOnly: true } });
// Returns: metadata.total_count
```

### 3. Smart Defaults

The API uses sensible defaults — omit parameters you don't need:

```javascript
// These are equivalent:
omnifocus_read({ query: { type: 'tasks', mode: 'today' } });
omnifocus_read({ query: { type: 'tasks', mode: 'today', limit: 25 } });
```

### 4. Server-Side Filtering

Always filter on the server, not client-side:

```javascript
// ❌ Slow: Getting all tasks then filtering
omnifocus_read({ query: { type: 'tasks', limit: 1000 } });
// then filter in code...

// ✅ Fast: Use server-side filters
omnifocus_read({
  query: {
    type: 'tasks',
    filters: {
      project: 'Website Redesign',
      status: 'active',
      tags: { any: ['urgent', 'important'] },
    },
    limit: 50,
  },
});
```

## Common Workflow Patterns

### GTD Weekly Review

```javascript
// 1. Check overdue tasks
omnifocus_analyze({ analysis: { type: 'overdue_analysis' } });

// 2. Review inbox
omnifocus_read({ query: { type: 'tasks', filters: { project: null } } });

// 3. List active projects
omnifocus_read({ query: { type: 'projects', filters: { status: 'active' } } });

// 4. Productivity stats
omnifocus_analyze({ analysis: { type: 'productivity_stats', params: { groupBy: 'week' } } });
```

### Daily Planning

```javascript
// 1. Today's tasks
omnifocus_read({ query: { type: 'tasks', mode: 'today', limit: 50 } });

// 2. Upcoming tasks
omnifocus_read({ query: { type: 'tasks', mode: 'upcoming' } });

// 3. Search for specific items
omnifocus_read({ query: { type: 'tasks', mode: 'search', search: 'budget' } });
```

### Task Creation with Tags

```javascript
// Single task with full details
omnifocus_write({
  mutation: {
    operation: 'create',
    target: 'task',
    data: {
      name: 'Review report',
      project: 'Work',
      tags: ['urgent', 'work'],
      dueDate: '2026-01-15 17:00',
      flagged: true,
    },
  },
});
```

### Batch Operations

```javascript
// Create project with tasks in one call
omnifocus_write({
  mutation: {
    operation: "batch",
    target: "project",
    operations: [
      { operation: "create", target: "project", data: { name: "Q1 Planning", sequential: true, tempId: "proj1" } },
      { operation: "create", target: "task", data: { name: "Define goals", parentTempId: "proj1" } },
      { operation: "create", target: "task", data: { name: "Set milestones", parentTempId: "proj1" } }
    ],
    createSequentially: true,
    returnMapping: true
  }
})

// Preview before executing
omnifocus_write({
  mutation: { operation: "batch", /* ... */, dryRun: true }
})
```

### Project Management

```javascript
// List active projects
omnifocus_read({ query: { type: 'projects', filters: { status: 'active' } } });

// Get tasks in a project
omnifocus_read({ query: { type: 'tasks', filters: { project: 'Website Redesign' } } });

// Create a project
omnifocus_write({
  mutation: {
    operation: 'create',
    target: 'project',
    data: { name: 'Q1 Marketing', folder: 'Work', sequential: true },
  },
});
```

## Error Handling

All tools return structured errors:

```json
{
  "success": false,
  "error": {
    "code": "SCRIPT_ERROR",
    "message": "Failed to execute OmniFocus script",
    "suggestion": "Check if OmniFocus is running"
  }
}
```

## Response Format

```json
{
  "success": true,
  "summary": { "total": 15, "active": 12 },
  "data": [...],
  "metadata": {
    "operation_time_ms": 150,
    "from_cache": false,
    "total_count": 15
  }
}
```

## Cache Behavior

| Data      | TTL        |
| --------- | ---------- |
| Tasks     | 5 minutes  |
| Projects  | 5 minutes  |
| Tags      | 10 minutes |
| Analytics | 1 hour     |

Cache invalidates automatically on writes. To force fresh data, change a parameter slightly (e.g., `limit: 51` instead
of `limit: 50`).

## Advanced Filter Operators

```javascript
// Tag operators
{
  tags: {
    any: ['urgent', 'work'];
  }
} // OR: has any of these tags
{
  tags: {
    all: ['urgent', 'work'];
  }
} // AND: has all of these tags
{
  tags: {
    none: ['someday'];
  }
} // NOT: none of these tags

// Date operators
{
  dueDate: {
    before: '2026-01-15';
  }
}
{
  dueDate: {
    after: '2026-01-01';
  }
}

// Status
{
  status: 'active';
} // Not completed
{
  status: 'completed';
} // Completed tasks

// Inbox (tasks with no project)
{
  project: null;
}
```

## Performance Tips

1. **Use `countOnly: true`** for counting questions (33x faster)
2. **Use `limit`** to cap results — don't fetch more than needed
3. **Filter server-side** — never fetch all and filter client-side
4. **Use `mode: "today"`** instead of querying all tasks with date filters
5. **Analytics for summaries** — `omnifocus_analyze` is better than computing stats from raw data

## Anti-Patterns

| Anti-Pattern                            | Better Approach                        |
| --------------------------------------- | -------------------------------------- |
| Fetching all tasks to count them        | Use `countOnly: true`                  |
| Multiple queries for different projects | Use `omnifocus_analyze` for summaries  |
| Creating tasks one at a time            | Use batch operations                   |
| ISO dates with Z suffix                 | Use `YYYY-MM-DD` or `YYYY-MM-DD HH:mm` |
| Guessing task/project IDs               | Always query for fresh IDs first       |
