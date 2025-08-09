# LLM Usage Guide for OmniFocus MCP Server

## Overview

This guide provides best practices for AI agents using the OmniFocus MCP Server, with emphasis on the consolidated tools that were designed specifically to reduce cognitive load and improve decision-making for large language models.

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
1. **Use consolidated tools first**: `query_tasks`, `manage_folder`, `manage_reviews`
2. **Fall back to specific tools**: When consolidated tools don't support the operation
3. **Avoid legacy tools**: Only use when consolidated alternatives don't exist

**Example Decision Tree for Task Operations:**
```
Need to work with tasks?
├── Querying tasks? → Use query_tasks with appropriate queryType
├── Creating tasks? → Use create_task
├── Updating tasks? → Use update_task  
├── Multiple operations? → Use batch_task_operations
└── Complex analysis? → Use analytics tools
```

### 2. Parameter Handling Strategies

#### Smart Defaults
Consolidated tools use intelligent defaults optimized for common use cases:

```javascript
// These are equivalent:
query_tasks({ queryType: "list" })
query_tasks({ 
  queryType: "list", 
  completed: false,    // Default
  limit: 100,         // Default  
  includeDetails: true // Default
})
```

#### Performance Optimization
Use `skipAnalysis: true` for faster queries when you don't need recurring task analysis:

```javascript
// Fast query - use for quick checks
query_tasks({ 
  queryType: "list", 
  completed: false, 
  limit: 20,
  skipAnalysis: true  // ~30% faster
})

// Full analysis - use when you need complete task information
query_tasks({ 
  queryType: "next_actions",
  skipAnalysis: false  // Needed for accurate next action detection
})
```

### 3. Common Workflow Patterns

#### GTD Weekly Review
```javascript
// 1. Get overdue tasks
query_tasks({ queryType: "overdue" })

// 2. Review next actions
query_tasks({ queryType: "next_actions", includeFlagged: true })

// 3. Check projects needing review
manage_reviews({ operation: "list_for_review" })

// 4. Update project statuses as needed
manage_reviews({ 
  operation: "mark_reviewed", 
  projectId: "project123" 
})
```

#### Daily Planning
```javascript
// 1. Today's agenda (optimized for daily use)
todays_agenda({ includeOverdue: true, limit: 50 })

// 2. Upcoming tasks (next 3 days)
query_tasks({ 
  queryType: "upcoming", 
  daysAhead: 3, 
  includeToday: false 
})

// 3. Available tasks if ahead of schedule
query_tasks({ queryType: "available", limit: 20 })
```

#### Project Management
```javascript
// 1. List active projects
list_projects({ status: ["active"], includeDetails: true })

// 2. Check project tasks
query_tasks({ 
  queryType: "list", 
  projectId: "proj123",
  completed: false 
})

// 3. Analyze blocked tasks
query_tasks({ 
  queryType: "blocked", 
  projectId: "proj123",
  showBlockingTasks: true 
})
```

### 4. Error Handling Patterns

#### Progressive Fallback
```javascript
// Try consolidated tool first
const result = await query_tasks({ queryType: "next_actions" })

if (result.error) {
  // Fall back to legacy tool if needed
  const fallback = await next_actions({})
  return fallback
}

return result
```

#### Parameter Validation
Check for operation-specific requirements:

```javascript
// query_tasks with search requires searchTerm
if (queryType === "search" && !searchTerm) {
  return { error: "searchTerm required for search queries" }
}

// manage_folder operations have different required parameters
const requiredParams = {
  create: ["name"],
  update: ["folderId"],
  delete: ["folderId"], 
  move: ["folderId", "parentId"]
}
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
    "query_type": "next_actions",
    "filters_applied": {...},
    "description": "Available next actions across all projects"
  }
}
```

#### Extracting Information
```javascript
// Get task count without full details
const response = await query_tasks({ 
  queryType: "list", 
  completed: false,
  includeDetails: false  // Faster, less data
})

const taskCount = response.data.length
const fromCache = response.metadata.from_cache
```

## Advanced Usage Strategies

### 1. Caching Awareness

Understand caching behavior to optimize performance:

```javascript
// These will use cache efficiently
query_tasks({ queryType: "list", completed: false })     // Cached 30s
query_tasks({ queryType: "next_actions" })               // Cached 30s  
list_projects({ status: ["active"] })                    // Cached 5 min

// This bypasses cache (always fresh)
query_tasks({ queryType: "list", skipAnalysis: true })
```

### 2. Batch Operations

Use batch operations for efficiency:

```javascript
// Instead of multiple individual calls:
complete_task({ taskId: "task1" })
complete_task({ taskId: "task2" })
complete_task({ taskId: "task3" })

// Use batch operation:
batch_task_operations({
  operation: "complete",
  taskIds: ["task1", "task2", "task3"]
})
```

### 3. Query Composition

Combine queries for complex analysis:

```javascript
// Get comprehensive project status
const [
  allTasks,
  nextActions, 
  blockedTasks,
  overdueTasks
] = await Promise.all([
  query_tasks({ queryType: "list", projectId: "proj123" }),
  query_tasks({ queryType: "next_actions", projectId: "proj123" }),
  query_tasks({ queryType: "blocked", projectId: "proj123" }),
  query_tasks({ queryType: "overdue", projectId: "proj123" })
])

// Analyze results together
const projectHealth = {
  total: allTasks.data.length,
  actionable: nextActions.data.length,
  blocked: blockedTasks.data.length,
  overdue: overdueTasks.data.length
}
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
// Invalid query type
query_tasks({ queryType: "invalid" })
// Returns: { error: "INVALID_QUERY_TYPE", details: { validTypes: [...] }}

// Missing required parameter  
query_tasks({ queryType: "search" })
// Returns: { error: "MISSING_PARAMETER", details: { required: "searchTerm" }}
```

### 3. Performance Analysis

Monitor response metadata:

```javascript
const response = await query_tasks({ queryType: "list" })
console.log({
  executionTime: response.metadata.operation_time_ms,
  fromCache: response.metadata.from_cache,
  resultCount: response.data.length
})
```

## Tool Selection Reference

### Quick Decision Matrix

| Need to... | Primary Tool | Fallback | Notes |
|-----------|-------------|----------|-------|
| Query tasks | `query_tasks` | `list_tasks` | Use queryType parameter |
| Create task | `create_task` | - | No consolidation needed |
| Update multiple tasks | `batch_task_operations` | Individual tools | Much more efficient |
| Manage folders | `manage_folder` | Individual folder tools | Use operation parameter |
| Handle reviews | `manage_reviews` | Individual review tools | GTD workflow optimized |
| Get analytics | Analytics tools | - | No consolidation needed |
| Export data | Export tools | - | No consolidation needed |

### Parameter Quick Reference

#### query_tasks queryTypes:
- `"list"` - General purpose filtering
- `"search"` - Text search (requires searchTerm)
- `"next_actions"` - GTD next actions
- `"blocked"` - Tasks with dependencies
- `"available"` - Currently workable tasks  
- `"overdue"` - Past due date
- `"upcoming"` - Due in next N days

#### manage_folder operations:
- `"create"` - New folder (requires name)
- `"update"` - Modify folder (requires folderId)
- `"delete"` - Remove folder (requires folderId)
- `"move"` - Change parent (requires folderId, parentId)
- `"set_status"` - Change status (requires folderId, status)

## Conclusion

The consolidated tools in the OmniFocus MCP Server are specifically designed to reduce the decision complexity that AI agents face when working with task management operations. By using these tools with the patterns outlined in this guide, AI agents can:

1. Make fewer, more confident tool selection decisions
2. Handle errors more gracefully with structured responses
3. Optimize performance through intelligent caching and parameter choices
4. Maintain consistent interaction patterns across different domains

Always prefer consolidated tools for new implementations, and use the migration patterns provided to update existing workflows.