# Performance Optimization Guide

This guide covers performance optimization strategies for the OmniFocus MCP Server.

## Performance Overview

The server has been optimized to handle large OmniFocus databases (2000+ tasks) efficiently through:
- Smart caching with different TTLs for different data types
- Query optimization with the `skipAnalysis` parameter
- Efficient pagination and limiting
- Single-pass algorithms for data processing

## Cache Strategy

The server implements intelligent caching with different TTLs based on data volatility:

| Data Type | TTL | Rationale |
|-----------|-----|-----------|
| Tasks | 30 seconds | ↓ Reduced for faster GTD inbox processing |
| Projects | 5 minutes | ↓ Reduced for weekly review workflows |
| Folders | 10 minutes | Stable hierarchy |
| Tags | 10 minutes | ↓ Reduced for active tag assignments |
| Reviews | 3 minutes | ↓ Reduced for GTD review workflow |
| Analytics | 1 hour | Expensive computations |

Cache is automatically invalidated on write operations to ensure data consistency.

### GTD Workflow Optimizations

The cache system includes GTD-specific optimizations to handle the rapid changes common in productive workflows:

#### Selective Task Cache Invalidation
Instead of clearing all task caches when one task changes, the system can selectively invalidate specific query patterns:

```javascript
// Only clear today's agenda and inbox caches, preserve others
cacheManager.invalidateTaskQueries(['today', 'inbox']);

// Clear overdue and upcoming but preserve general task lists
cacheManager.invalidateTaskQueries(['overdue', 'upcoming']);
```

#### Workflow-Aware Cache Management
Different GTD workflows have different caching needs:

```javascript
// Inbox processing - frequent updates needed
cacheManager.refreshForWorkflow('inbox_processing');

// Weekly review - comprehensive refresh
cacheManager.refreshForWorkflow('weekly_review'); 

// Daily planning - only clear time-sensitive caches
cacheManager.refreshForWorkflow('daily_planning');
```

These optimizations ensure that users get fresh data when they need it most while preserving performance benefits for stable queries.

## Query Performance Optimization

### The skipAnalysis Parameter

The `list_tasks` tool includes a `skipAnalysis` parameter that can improve performance by ~30%:

```javascript
// Fast query - skip recurring task analysis
{
  "tool": "list_tasks",
  "arguments": {
    "completed": false,
    "limit": 50,
    "skipAnalysis": true
  }
}

// Normal query - includes full recurring task analysis  
{
  "tool": "list_tasks",
  "arguments": {
    "completed": false,
    "limit": 50
  }
}
```

**Performance metrics:**
- With skipAnalysis: ~1.2s for 10 tasks
- Without skipAnalysis: ~1.6s for 10 tasks
- Savings increase with larger result sets

### Tag Performance Modes

The `list_tags` tool offers three performance modes:

1. **Ultra-fast (namesOnly)**
   ```javascript
   {
     "tool": "list_tags",
     "arguments": {
       "namesOnly": true  // ~130ms for 100+ tags
     }
   }
   ```

2. **Fast Mode (no hierarchy)**
   ```javascript
   {
     "tool": "list_tags",
     "arguments": {
       "fastMode": true,      // ~270ms
       "includeEmpty": false
     }
   }
   ```

3. **Full Mode (with usage stats)**
   ```javascript
   {
     "tool": "list_tags",
     "arguments": {
       "includeUsageStats": true,  // ~3s - use sparingly
       "sortBy": "usage"
     }
   }
   ```

## Optimized Defaults

Tools have been optimized with sensible defaults to prevent timeouts:

- `todays_agenda`: Limit reduced from 200 to 50
- `list_tasks`: Default limit of 100 (max 1000)
- `includeDetails`: Defaults to false for agenda queries

## Large Database Handling

For databases with 2000+ tasks:

1. **Use pagination**:
   ```javascript
   {
     "tool": "list_tasks",
     "arguments": {
       "limit": 100,
       "offset": 0
     }
   }
   ```

2. **Apply filters** to reduce result sets:
   - Filter by project, tags, or date ranges
   - Use `completed: false` to exclude completed tasks
   - Use `available: true` to show only actionable tasks

3. **Use count-only queries** when you don't need task data:
   ```javascript
   {
     "tool": "get_task_count",
     "arguments": {
       "completed": false,
       "projectId": "xyz789"
     }
   }
   ```

## Performance Monitoring

Many tools include performance metrics in their responses:

```javascript
{
  "tasks": [...],
  "performance": {
    "queryTime": 1234,  // milliseconds
    "taskCount": 50,
    "cached": false
  }
}
```

## Tag Query Performance Optimization

When working with tags in OmniFocus, choose the right tool and options based on your needs:

### Quick Decision Tree

1. **Need only tags with active tasks?** → Use `tags({ operation: 'active' })`
   - Returns: Simple array of tag names  
   - Performance: Very fast (processes only incomplete tasks)
   - Best for: GTD workflows, filtering, autocomplete

2. **Need just tag names for UI/autocomplete?** → Use `tags({ operation: 'list', namesOnly: true })`
   - Returns: Array of tag names only
   - Performance: ~130ms for 100+ tags
   - Best for: Dropdowns, autocomplete, quick lists

3. **Need tag IDs but not hierarchy?** → Use `tags({ operation: 'list', fastMode: true })`
   - Returns: Tags with IDs and names only
   - Performance: ~270ms for 100+ tags
   - Best for: Basic tag management, simple listings

4. **Need full tag information?** → Use `tags({ operation: 'list' })` (default)
   - Returns: Complete tag data with hierarchy
   - Performance: ~700ms for 100+ tags
   - Best for: Tag organization, full analysis

### Tag Performance Comparison

| Mode | Method | Speed | Returns |
|------|---------|-------|---------|
| Active only | `tags({ operation: 'active' })` | Fastest | Tag names with tasks |
| Names only | `namesOnly: true` | ~130ms | Just tag names |
| Fast mode | `fastMode: true` | ~270ms | IDs + names |
| Full mode | (default) | ~700ms | Everything |
| With stats | `includeUsageStats: true` | ~3s+ | Full + task counts |

### Tag Usage Examples

```javascript
// For task creation/filtering
tags({ operation: 'active' })  // Only shows relevant tags

// For quick tag lists  
tags({ operation: 'list', namesOnly: true })  // Dropdown lists

// For tag management
tags({ operation: 'list', fastMode: true })  // IDs for operations

// For tag analysis
tags({ 
  operation: 'list',
  includeUsageStats: true,
  includeEmpty: false 
})  // Full hierarchy and usage
```

**Tips**: Users with 100+ tags benefit significantly from these optimizations. Default to performance modes unless you specifically need full hierarchy or statistics.

## Best Practices

1. **Use specific queries** rather than fetching all data
2. **Enable caching** by making repeated queries within cache TTL
3. **Use skipAnalysis** when recurring task details aren't needed
4. **Limit result sets** to what you actually need
5. **Use appropriate tag query modes** based on your needs
6. **Batch operations** when possible to reduce overhead

## Timeout Prevention

Scripts have a 120-second timeout. To prevent timeouts:

1. Use smaller limits (50-100 items)
2. Apply filters to reduce data processing
3. Use skipAnalysis for faster queries
4. Break large operations into smaller chunks

## Memory Management

The server implements automatic cache cleanup to prevent memory issues:
- Expired cache entries are removed automatically
- Large result sets are paginated
- Temporary data is cleaned up after operations

## Benchmarks

Typical performance with a 2000+ task database:

| Operation | Time | Notes |
|-----------|------|-------|
| List 50 tasks (cached) | ~50ms | From cache |
| List 50 tasks (uncached) | ~1.5s | With skipAnalysis |
| List all projects | ~800ms | ~200 projects |
| Get active tags | ~400ms | Tags with tasks |
| Productivity stats | ~3s | First run, then cached |
| Create single task | ~200ms | Including validation |