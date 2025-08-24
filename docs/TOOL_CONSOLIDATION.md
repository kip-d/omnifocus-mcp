# Tool Consolidation Guide

## Overview

This guide explains the tool consolidation strategy implemented in the OmniFocus MCP Server to improve usability for AI agents and human users alike.

## Why We Consolidated Tools

### The Problem

Previously, the server exposed 44 individual tools, each with specific parameters and use cases. This created several challenges:

1. **Cognitive Overload for LLMs**: AI agents had to choose between many similar tools (e.g., `list_tasks`, `next_actions`, `blocked_tasks`, `available_tasks`)
2. **Parameter Confusion**: Similar tools had different parameter names and structures
3. **Workflow Inefficiency**: Common workflows required multiple tool calls
4. **Maintenance Burden**: Code duplication across similar tools

### The Solution

We created consolidated "super-tools" that combine related functionality under unified interfaces:

- **query_tasks**: Replaces 7 task query tools with a single `queryType` parameter
- **manage_folder**: Combines 5 folder operations with an `operation` parameter  
- **manage_reviews**: Consolidates 3 review tools into one interface
- **batch_task_operations**: Groups batch operations for efficiency

## Before vs. After Comparison

### Task Queries (Before)
```javascript
// Had to choose between 7 different tools:
list_tasks({ completed: false, limit: 50 })
next_actions({ includeFlagged: true })
blocked_tasks({ showBlockingTasks: true })
available_tasks({ includeFlagged: false })
overdue_tasks({ includeDeferred: false })
upcoming_tasks({ days: 7, includeToday: true })
// Plus search functionality scattered across tools
```

### Task Queries (After)
```javascript
// Single tool with queryType parameter:
query_tasks({ queryType: "list", completed: false, limit: 50 })
query_tasks({ queryType: "next_actions", includeFlagged: true })
query_tasks({ queryType: "blocked", showBlockingTasks: true })
query_tasks({ queryType: "available", includeFlagged: false })
query_tasks({ queryType: "overdue", includeDeferred: false })
query_tasks({ queryType: "upcoming", daysAhead: 7, includeToday: true })
query_tasks({ queryType: "search", searchTerm: "budget review" })
```

### Folder Management (Before)
```javascript
// Five separate tools:
create_folder({ name: "New Project Folder" })
update_folder({ folderId: "123", name: "Updated Name" })
delete_folder({ folderId: "123", force: true })
move_folder({ folderId: "123", parentId: "456" })
// Status changes required separate update calls
```

### Folder Management (After)
```javascript
// Single tool with operation parameter:
manage_folder({ operation: "create", name: "New Project Folder" })
manage_folder({ operation: "update", folderId: "123", name: "Updated Name" })
manage_folder({ operation: "delete", folderId: "123", force: true })
manage_folder({ operation: "move", folderId: "123", parentId: "456" })
manage_folder({ operation: "set_status", folderId: "123", status: "on_hold" })
```

## Migration Guide

### For LLM Usage

**Recommended**: Use consolidated tools as the primary interface. They provide:
- Clearer intent through operation/queryType parameters
- Consistent parameter naming
- Better error messages
- Enhanced metadata in responses

**Legacy Support**: All original tools remain available for backward compatibility.

### Parameter Mapping

#### Task Queries
| Legacy Tool | New Tool Call |
|-------------|---------------|
| `list_tasks` | `query_tasks({ queryType: "list", ...params })` |
| `next_actions` | `query_tasks({ queryType: "next_actions", ...params })` |
| `blocked_tasks` | `query_tasks({ queryType: "blocked", ...params })` |
| `available_tasks` | `query_tasks({ queryType: "available", ...params })` |
| `overdue_tasks` | `query_tasks({ queryType: "overdue", ...params })` |
| `upcoming_tasks` | `query_tasks({ queryType: "upcoming", daysAhead: N })` |

#### Folder Management
| Legacy Tool | New Tool Call |
|-------------|---------------|
| `create_folder` | `manage_folder({ operation: "create", ...params })` |
| `update_folder` | `manage_folder({ operation: "update", ...params })` |
| `delete_folder` | `manage_folder({ operation: "delete", ...params })` |
| `move_folder` | `manage_folder({ operation: "move", ...params })` |

#### Review Management
| Legacy Tool | New Tool Call |
|-------------|---------------|
| `projects_for_review` | `manage_reviews({ operation: "list_for_review" })` |
| `mark_project_reviewed` | `manage_reviews({ operation: "mark_reviewed", ...params })` |
| `set_review_schedule` | `manage_reviews({ operation: "set_schedule", ...params })` |

## Benefits of Consolidation

### For AI Agents

1. **Simplified Decision Making**: Instead of choosing between 7 task query tools, choose one tool with the appropriate `queryType`
2. **Consistent Parameter Structure**: All query types use the same base parameters
3. **Better Context**: Operation type is explicit in the tool call
4. **Reduced Token Usage**: Single tool description instead of multiple

### For Human Users

1. **Easier Discovery**: Related functionality grouped logically
2. **Consistent Interface**: Same patterns across different domains
3. **Better Documentation**: Comprehensive parameter documentation per tool
4. **Reduced Cognitive Load**: Fewer tools to remember

### For Developers

1. **Code Reuse**: Shared validation and response formatting
2. **Easier Testing**: Single tool covers multiple scenarios  
3. **Simplified Maintenance**: Changes in one place affect all operations
4. **Better Error Handling**: Consistent error responses across operations

## Performance Implications

### Caching Strategy

Consolidated tools maintain intelligent caching:
- Each `queryType` has its own cache key
- Cache invalidation remains granular per operation type
- No performance penalty from consolidation

### Resource Usage

- **Memory**: Slightly reduced due to shared validation schemas
- **CPU**: Comparable performance with operation-specific optimizations
- **Network**: Reduced payload size in tool descriptions

## Advanced Usage Patterns

### Chained Operations

```javascript
// Create folder and immediately move it
manage_folder({ operation: "create", name: "Temp Folder" })
// Returns: { folderId: "new123" }

manage_folder({ 
  operation: "move", 
  folderId: "new123", 
  parentId: "parent456" 
})
```

### Query Refinement

```javascript
// Start with broad query
query_tasks({ queryType: "list", completed: false, limit: 100 })

// Refine to specific type
query_tasks({ queryType: "next_actions", includeFlagged: true })

// Search within results conceptually
query_tasks({ queryType: "search", searchTerm: "budget", completed: false })
```

## Best Practices

### For LLM Prompts

1. **Use Consolidated Tools First**: Always try `query_tasks` before legacy task tools
2. **Explicit Operations**: Always specify `queryType` or `operation` clearly
3. **Parameter Validation**: Consolidated tools provide better error messages for invalid parameters
4. **Batch When Possible**: Use `batch_task_operations` for multiple task updates

### Error Handling

Consolidated tools provide enhanced error responses:

```json
{
  "error": "INVALID_QUERY_TYPE",
  "message": "Invalid query type: invalid_type",
  "details": {
    "validTypes": ["list", "search", "next_actions", "blocked", "available", "overdue", "upcoming"],
    "provided": "invalid_type"
  }
}
```

## Tool Status Reference

### Recommended (Consolidated)
- ✅ `query_tasks` - Primary task querying interface
- ✅ `manage_folder` - Complete folder management
- ✅ `manage_reviews` - Review workflow management
- ✅ `batch_task_operations` - Efficient batch operations

### Legacy (Deprecated but Functional)
- ⚠️ Individual task query tools (`list_tasks`, `next_actions`, etc.)
- ⚠️ Individual folder tools (`create_folder`, `update_folder`, etc.)
- ⚠️ Individual review tools (`projects_for_review`, etc.)

### Standard (No Consolidation Needed)
- ✅ Task CRUD operations (`create_task`, `update_task`, etc.)
- ✅ Project operations (`list_projects`, `create_project`, etc.)
- ✅ Analytics tools (`productivity_stats`, `task_velocity`, etc.)
- ✅ Export tools (`export_tasks`, `bulk_export`, etc.)

## Future Consolidation Plans

Potential areas for further consolidation:

1. **Project Management**: Consolidate project CRUD operations
2. **Analytics**: Unified analytics tool with analysis types
3. **Export**: Single export tool with format/type parameters
4. **Tag Management**: Unified tag operations

For detailed designs and migration steps, see [TOOL_CONSOLIDATION_ROADMAP.md](./TOOL_CONSOLIDATION_ROADMAP.md).

## Conclusion

Tool consolidation represents a significant improvement in the OmniFocus MCP Server's usability, particularly for AI agents. The consolidated tools reduce cognitive load, improve consistency, and maintain full backward compatibility while providing a superior user experience.

Use consolidated tools for new integrations, and consider migrating existing code to take advantage of their enhanced capabilities and cleaner interfaces.