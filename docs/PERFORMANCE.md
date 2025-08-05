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
| Tasks | 1 minute | Frequently changing |
| Projects | 10 minutes | Less volatile |
| Tags | 20 minutes | Relatively stable |
| Analytics | 1 hour | Expensive computations |

Cache is automatically invalidated on write operations to ensure data consistency.

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