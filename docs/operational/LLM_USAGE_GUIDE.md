# LLM Usage Guide for OmniFocus MCP Server

## Overview

This guide provides best practices for AI agents using the OmniFocus MCP Server, with emphasis on the consolidated tools
that were designed specifically to reduce cognitive load and improve decision-making for large language models.

## Why Consolidated Tools Are Better for AI Agents

### Reduced Decision Complexity

**Before Consolidation:**

```
I need to query tasks... should I use:
- list_tasks? (general purpose)
- next_actions? (for GTD workflow)
- blocked_tasks? (for dependency analysis)
- available_tasks? (for current availability)
- overdue_tasks? (for past due items)
- upcoming_tasks? (for future planning)
- plus separate search functionality...
```

**After Consolidation:**

```
I need to query tasks -> use query_tasks with appropriate queryType:
- "list" for general queries
- "next_actions" for GTD workflow
- "blocked" for dependency analysis
- "available" for current availability
- "overdue" for past due items
- "upcoming" for future planning
- "search" for text-based finding
```

### Consistent Parameter Patterns

All `query_tasks` operations share the same base parameters:

- `limit`, `completed`, `flagged`, `projectId`, `tags`
- `includeDetails`, `skipAnalysis` for performance tuning
- Query-specific parameters are clearly documented per type

### Enhanced Error Messages

Consolidated tools provide structured error responses that help AI agents understand and correct issues:

```json
{
  "error": "MISSING_PARAMETER",
  "message": "searchTerm is required for search query type",
  "details": {
    "queryType": "search",
    "providedParams": ["queryType", "limit"]
  }
}
```

## Best Practices for AI Agents

### 1. Tool Selection Strategy

**Priority Order:**

1. **Use consolidated tools first**: `tasks`, `folders`, `manage_reviews`
2. **Fall back to specific tools**: When consolidated tools don't support the operation
3. **Avoid legacy tools**: Only use when consolidated alternatives don't exist

**Example Decision Tree for Task Operations:**

```
Need to work with tasks?
├── Querying tasks? → Use tasks with appropriate mode
├── Creating tasks? → Use manage_task with operation: 'create'
├── Updating tasks? → Use manage_task with operation: 'update'
├── Multiple operations? → Use batch_task_operations
└── Complex analysis? → Use analytics tools
```

### 2. Parameter Handling Strategies

#### Smart Defaults

Consolidated tools use intelligent defaults optimized for common use cases:

```javascript
// These are equivalent:
tasks({ mode: 'all' });
tasks({
  mode: 'all',
  completed: false, // Default
  limit: 25, // Default
  details: false, // Default for performance
});
```

#### Performance Optimization

Use `details: false` for faster queries when you don't need full task information:

```javascript
// Fast query - use for quick checks
tasks({
  mode: 'all',
  completed: false,
  limit: 20,
  details: false, // ~30% faster
});

// Full details - use when you need complete task information
tasks({
  mode: 'available',
  details: true, // Needed for complete task analysis
});
```

### 3. Common Workflow Patterns

#### GTD Weekly Review

```javascript
// 1. Get overdue tasks
tasks({ mode: 'overdue' });

// 2. Review next actions
tasks({ mode: 'available', details: true });

// 3. Check projects needing review
manage_reviews({ operation: 'list_for_review' });

// 4. Update project statuses as needed
manage_reviews({
  operation: 'mark_reviewed',
  projectId: 'project123',
});
```

#### Daily Planning

```javascript
// 1. Today's agenda (optimized for daily use)
tasks({ mode: 'today', details: true, limit: 50 });

// 2. Upcoming tasks (next 3 days)
tasks({
  mode: 'upcoming',
  daysAhead: 3,
});

// 3. Available tasks if ahead of schedule
tasks({ mode: 'available', limit: 20 });
```

#### Project Management

```javascript
// 1. List active projects
projects({ operation: 'list', status: ['active'], details: true });

// 2. Check project tasks
tasks({
  mode: 'all',
  project: 'proj123',
  completed: false,
});

// 3. Analyze blocked tasks
tasks({
  mode: 'blocked',
  project: 'proj123',
});
```

### 4. Error Handling Patterns

#### Progressive Fallback

```javascript
// Try consolidated tool first
const result = await tasks({ mode: 'available' });

if (result.error) {
  // Fall back to legacy tool if needed
  const fallback = await next_actions({});
  return fallback;
}

return result;
```

#### Parameter Validation

Check for operation-specific requirements:

```javascript
// tasks with search requires search parameter
if (mode === 'search' && !search) {
  return { error: 'search parameter required for search mode' };
}

// folders operations have different required parameters
const requiredParams = {
  create: ['name'],
  update: ['folderId'],
  delete: ['folderId'],
  move: ['folderId', 'parentFolderId'],
};
```

### 5. Response Handling

#### Structured Responses

All consolidated tools return consistent response structures:

```javascript
{
  "success": true,
  "data": [...],           // Main response data
  "metadata": {
    "operation_time_ms": 150,
    "from_cache": false,
    "mode": "available",
    "filters_applied": {...},
    "description": "Available tasks across all projects"
  }
}
```

#### Extracting Information

```javascript
// Get task count without full details
const response = await tasks({
  mode: 'all',
  completed: false,
  details: false, // Faster, less data
});

const taskCount = response.data.length;
const fromCache = response.metadata.from_cache;
```

## Advanced Usage Strategies

### 1. Caching Awareness

Understand caching behavior to optimize performance:

```javascript
// These will use cache efficiently
tasks({ mode: 'all', completed: false }); // Cached 30s
tasks({ mode: 'available' }); // Cached 30s
projects({ operation: 'list', status: ['active'] }); // Cached 5 min

// Fast queries with minimal details
tasks({ mode: 'all', details: false }); // Faster execution
```

### 2. Batch Operations

Use batch operations for efficiency:

```javascript
// Instead of multiple individual calls:
complete_task({ taskId: 'task1' });
complete_task({ taskId: 'task2' });
complete_task({ taskId: 'task3' });

// Use batch operation:
batch_task_operations({
  operation: 'complete',
  taskIds: ['task1', 'task2', 'task3'],
});
```

### 3. Query Composition

Combine queries for complex analysis:

```javascript
// Get comprehensive project status
const [allTasks, nextActions, blockedTasks, overdueTasks] = await Promise.all([
  tasks({ mode: 'all', project: 'proj123' }),
  tasks({ mode: 'available', project: 'proj123' }),
  tasks({ mode: 'blocked', project: 'proj123' }),
  tasks({ mode: 'overdue', project: 'proj123' }),
]);

// Analyze results together
const projectHealth = {
  total: allTasks.data.length,
  actionable: nextActions.data.length,
  blocked: blockedTasks.data.length,
  overdue: overdueTasks.data.length,
};
```

## Debugging and Troubleshooting

### 1. Enable Verbose Logging

Set environment variable for detailed logs:

```bash
LOG_LEVEL=debug
```

### 2. Validate Parameters

Use the detailed error messages from consolidated tools:

```javascript
// Invalid mode
tasks({ mode: 'invalid' });
// Returns: { error: "INVALID_MODE", details: { validModes: [...] }}

// Missing required parameter
tasks({ mode: 'search' });
// Returns: { error: "MISSING_PARAMETER", details: { required: "search" }}
```

### 3. Performance Analysis

Monitor response metadata:

```javascript
const response = await tasks({ mode: 'all' });
console.log({
  executionTime: response.metadata.operation_time_ms,
  fromCache: response.metadata.from_cache,
  resultCount: response.data.length,
});
```

## Tool Selection Reference

### Quick Decision Matrix

| Need to...            | Primary Tool            | Fallback                | Notes                   |
| --------------------- | ----------------------- | ----------------------- | ----------------------- |
| Query tasks           | `tasks`                 | `list_tasks`            | Use mode parameter      |
| Create task           | `manage_task`           | `create_task`           | Use operation: 'create' |
| Update multiple tasks | `batch_task_operations` | Individual tools        | Much more efficient     |
| Manage folders        | `folders`               | Individual folder tools | Use operation parameter |
| Handle reviews        | `manage_reviews`        | Individual review tools | GTD workflow optimized  |
| Get analytics         | Analytics tools         | -                       | No consolidation needed |
| Export data           | Export tools            | -                       | No consolidation needed |

### Parameter Quick Reference

#### tasks modes:

- `"all"` - General purpose filtering
- `"search"` - Text search (requires search parameter)
- `"today"` - Today's tasks (optimized)
- `"blocked"` - Tasks with dependencies
- `"available"` - Currently workable tasks
- `"overdue"` - Past due date
- `"upcoming"` - Due in next N days
- `"flagged"` - All flagged tasks

#### folders operations:

- `"create"` - New folder (requires name)
- `"update"` - Modify folder (requires folderId)
- `"delete"` - Remove folder (requires folderId)
- `"move"` - Change parent (requires folderId, parentFolderId)
- `"set_status"` - Change status (requires folderId, status)
- `"list"` - List all folders
- `"get"` - Get specific folder
- `"search"` - Search folders

## Common Anti-Patterns and Solutions

### Task Management Patterns

#### ❌ Inefficient Task Filtering

```javascript
// Slow: Getting all tasks then filtering client-side
const allTasks = await tasks({ mode: 'all', limit: 1000 });
const filtered = allTasks.filter((t) => t.projectId === 'abc123');
```

#### ✅ Efficient Server-Side Filtering

```javascript
// Fast: Use server-side filters
const tasks = await tasks({
  mode: 'all',
  project: 'abc123',
  completed: false,
  details: false, // 30% faster
  limit: 50,
});

// Even faster: Use specialized modes
const overdue = await tasks({ mode: 'overdue', limit: 50 });
const today = await tasks({ mode: 'today', details: false });
```

#### ✅ Task Creation with Tags (v2.0.0+)

```javascript
// Now works in single step!
const task = await manage_task({
  operation: 'create',
  name: 'Review report',
  projectId: 'xyz789',
  tags: ['urgent', 'work'], // ✅ Fixed in v2.0.0
  dueDate: '2024-01-15 17:00',
});
```

#### ❌ Multiple Separate Queries

```javascript
// Inefficient: Multiple calls
const project1 = await tasks({ mode: 'all', project: 'proj1' });
const project2 = await tasks({ mode: 'all', project: 'proj2' });
```

#### ✅ Batch Operations and Analytics

```javascript
// Better: Use analytics for summaries
const stats = await productivity_stats({
  period: 'week',
  includeProjectStats: true,
});

// Or use search/filtering
const tasks = await tasks({
  mode: 'search',
  search: 'project1 OR project2',
});
```

### Project Management Patterns

#### ✅ Hierarchical Project Creation

```javascript
// Folders are auto-created
const project = await projects({
  operation: 'create',
  name: 'Q1 Marketing Campaign',
  folder: 'Work/Marketing/2024', // Creates all levels if needed
  status: 'active',
  dueDate: '2024-03-31',
});
```

### Tag Optimization Patterns

#### ❌ Slow Tag Queries for UI

```javascript
// Slow: Full tag details for dropdown (~3s)
const tags = await tags({
  operation: 'list',
  includeUsageStats: true,
});
```

#### ✅ Fast Tag Queries

```javascript
// Fast: Names only for dropdown (~130ms)
const tagNames = await tags({
  operation: 'list',
  namesOnly: true,
});

// GTD workflow: Only tags with tasks
const activeTags = await tags({ operation: 'active' });
```

### Batch Processing Patterns

#### ✅ Process Inbox in Batches

```javascript
// Get manageable batch
const inbox = await tasks({
  mode: 'all',
  project: null, // Inbox items
  completed: false,
  limit: 10,
});

// Process each item
for (const task of inbox.data) {
  if (task.estimatedMinutes && task.estimatedMinutes <= 2) {
    await manage_task({ operation: 'complete', taskId: task.id });
  } else {
    await manage_task({
      operation: 'update',
      taskId: task.id,
      projectId: 'someProject',
      tags: ['@context'],
    });
  }
}
```

## Advanced Performance Tips

### Cache-Aware Querying

```javascript
// These hit different cache keys (force refresh):
tasks({ mode: 'all', limit: 50 });
tasks({ mode: 'all', limit: 51 }); // Different cache key

// Force fresh data with random parameter
tasks({ mode: 'all', limit: Math.floor(Math.random() * 100) });
```

### Context-Aware Task Querying

```javascript
// High-energy morning work
const brainWork = await tasks({
  mode: 'available',
  tags: ['high-energy', '@computer'],
});

// Low-energy evening tasks
const easyStuff = await tasks({
  mode: 'available',
  tags: ['low-energy', '@home'],
});
```

## Conclusion

The consolidated tools in the OmniFocus MCP Server are specifically designed to reduce the decision complexity that AI
agents face when working with task management operations. By using these tools with the patterns outlined in this guide,
AI agents can:

1. Make fewer, more confident tool selection decisions
2. Handle errors more gracefully with structured responses
3. Optimize performance through intelligent caching and parameter choices
4. Maintain consistent interaction patterns across different domains

Always prefer consolidated tools for new implementations, and use the migration patterns provided to update existing
workflows.
