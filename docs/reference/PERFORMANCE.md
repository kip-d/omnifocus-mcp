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

| Data Type | TTL        | Rationale                             |
| --------- | ---------- | ------------------------------------- |
| Tasks     | 5 minutes  | Balanced freshness with cache warming |
| Projects  | 5 minutes  | Reduced for weekly review workflows   |
| Folders   | 10 minutes | Stable hierarchy                      |
| Tags      | 10 minutes | Reduced for active tag assignments    |
| Reviews   | 3 minutes  | Reduced for GTD review workflow       |
| Analytics | 1 hour     | Expensive computations                |

Cache is automatically invalidated on write operations to ensure data consistency.

### Write → Cache Invalidation (OMN-336)

Every write handler (task/project/folder/tag mutations, including batch and review-mutation paths) routes through one
declarative entry point, `CacheManager.invalidateAfterWrite(event)`, instead of ad-hoc per-category or per-id calls. The
event shape names the entity and operation; the category table inside `CacheManager`'s doc comment is the single source
of truth for which categories clear:

```javascript
// A task update that also assigned a tag
cacheManager.invalidateAfterWrite({ entity: 'task', op: 'update', tags: true });

// A project update that moved it to a different folder
cacheManager.invalidateAfterWrite({ entity: 'project', op: 'update', changes: { folder: true } });

// A tag rename (clears tags, projects, and analytics — project rows carry tag names)
cacheManager.invalidateAfterWrite({ entity: 'tag', op: 'rename' });
```

Invalidation is whole-category (never per-id): every affected category is small and short-TTL, so clearing a whole
category can't under-invalidate and costs at most one extra cache miss.

## Query Performance Optimization

### The skipAnalysis Parameter

The `omnifocus_read` tool supports a `skipAnalysis` parameter that can improve performance by ~30%:

```javascript
// Fast query - skip recurring task analysis
omnifocus_read({
  query: { type: 'tasks', filters: { status: 'active' }, limit: 50, skipAnalysis: true },
});

// Normal query - includes full recurring task analysis
omnifocus_read({
  query: { type: 'tasks', filters: { status: 'active' }, limit: 50 },
});
```

**Performance metrics:**

- With skipAnalysis: ~1.2s for 10 tasks
- Without skipAnalysis: ~1.6s for 10 tasks
- Savings increase with larger result sets

### Tag Performance Modes

Tag queries via `omnifocus_read` offer different performance modes:

1. **Ultra-fast (namesOnly)**

   ```javascript
   omnifocus_read({ query: { type: 'tags', namesOnly: true } }); // ~130ms for 100+ tags
   ```

2. **Fast Mode (no hierarchy)**

   ```javascript
   omnifocus_read({ query: { type: 'tags', fastMode: true, includeEmpty: false } }); // ~270ms
   ```

3. **Full Mode (with usage stats)**

   ```javascript
   omnifocus_read({ query: { type: 'tags', includeUsageStats: true } }); // ~3s - use sparingly
   ```

## Optimized Defaults

Tools have been optimized with sensible defaults to prevent timeouts:

- `mode: "today"`: Default limit of 50
- Task queries: Default limit of 25 (max 200)
- Count queries: Use `countOnly: true` for 33x faster counts

## Large Database Handling

For databases with 2000+ tasks:

1. **Use pagination**:

   ```javascript
   omnifocus_read({ query: { type: 'tasks', limit: 100 } });
   ```

2. **Apply filters** to reduce result sets:
   - Filter by project, tags, or date ranges
   - Use `status: "active"` to exclude completed tasks
   - Use `mode: "today"` or `mode: "upcoming"` for time-scoped views

3. **Use count-only queries** when you don't need task data:

   ```javascript
   omnifocus_read({ query: { type: 'tasks', filters: { status: 'active' }, countOnly: true } });
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

1. **Need just tag names?** → Use `omnifocus_read({ query: { type: "tags", namesOnly: true } })`
   - Returns: Array of tag names only
   - Performance: ~130ms for 100+ tags
   - Best for: Dropdowns, autocomplete, quick lists

2. **Need tag IDs but not hierarchy?** → Use `omnifocus_read({ query: { type: "tags", fastMode: true } })`
   - Returns: Tags with IDs and names only
   - Performance: ~270ms for 100+ tags
   - Best for: Basic tag management, simple listings

3. **Need full tag information?** → Use `omnifocus_read({ query: { type: "tags" } })` (default)
   - Returns: Complete tag data with hierarchy
   - Performance: ~700ms for 100+ tags
   - Best for: Tag organization, full analysis

### Tag Performance Comparison

| Mode       | Query                                       | Speed  | Returns        |
| ---------- | ------------------------------------------- | ------ | -------------- |
| Names only | `{ type: "tags", namesOnly: true }`         | ~130ms | Just tag names |
| Fast mode  | `{ type: "tags", fastMode: true }`          | ~270ms | IDs + names    |
| Full mode  | `{ type: "tags" }`                          | ~700ms | Everything     |
| With stats | `{ type: "tags", includeUsageStats: true }` | ~3s+   | Full + counts  |

### Tag Usage Examples

```javascript
// For quick tag lists
omnifocus_read({ query: { type: 'tags', namesOnly: true } });

// For tag management
omnifocus_read({ query: { type: 'tags', fastMode: true } });

// For tag analysis
omnifocus_read({ query: { type: 'tags', includeUsageStats: true, includeEmpty: false } });
```

**Tips**: Users with 100+ tags benefit significantly from these optimizations. Default to performance modes unless you
specifically need full hierarchy or statistics.

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

| Operation                | Time   | Notes                  |
| ------------------------ | ------ | ---------------------- |
| List 50 tasks (cached)   | ~50ms  | From cache             |
| List 50 tasks (uncached) | ~1.5s  | With skipAnalysis      |
| List all projects        | ~800ms | ~200 projects          |
| Get active tags          | ~400ms | Tags with tasks        |
| Productivity stats       | ~3s    | First run, then cached |
| Create single task       | ~200ms | Including validation   |

**For detailed hardware-specific performance benchmarks**, see [`BENCHMARK_RESULTS.md`](BENCHMARK_RESULTS.md) which
includes:

- M2 MacBook Air (24GB), M2 Ultra Mac Studio (192GB), and M4 Pro Mac Mini (64GB) comparisons
- Cold cache vs warm cache performance measurements
- Cache warming times and effectiveness
- Updated October 2025 with empirical test results
