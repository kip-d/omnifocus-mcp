# Standardization Improvements - Future Enhancements

**Status**: Someday/Maybe
**Source**: Extracted from STANDARDIZATION_PLAN.md (Priorities 4-10)
**Created**: October 15, 2025
**Estimated Effort**: 6-10 hours total

## Context

These improvements were part of the original STANDARDIZATION_PLAN.md but were not completed in PR #26. The high-priority items (return types, error handling, script execution) were completed. These medium and low priority improvements remain as future enhancements when time permits.

---

## 🟡 MEDIUM PRIORITY: Consistency Improvements (4-6 hours)

### Priority 4: Add Explicit Constructors (1 hour)

**Problem**: Some tools have explicit constructors, others rely on BaseTool defaults.

**Standard Pattern**:

```typescript
export class MyToolV2 extends BaseTool<typeof MyToolSchema, MyResponseV2> {
  constructor(cache: CacheManager) {
    super(cache);
  }

  // ... rest of tool
}
```

**Tools to Fix**:
- QueryTasksToolV2
- TagsToolV2
- Any other tools without explicit constructors

**Search Command**:
```bash
# Find tools without explicit constructors
grep -L "constructor(cache" src/tools/**/*Tool*.ts
```

**Value**: Explicit > implicit for clarity, but not critical since BaseTool defaults work fine.

---

### Priority 5: Standardize Cache Key Generation (2 hours)

**Problem**: Four different cache key generation patterns:
- Simple string concatenation
- JSON.stringify for complex filters
- Manual string building with sorted arrays
- Simple operation-based keys

**Solution**: Create cache key generator utility.

**New File**: `/src/cache/cache-key-generator.ts`

```typescript
/**
 * Generate consistent cache keys for all tools
 */
export function generateCacheKey(
  category: string,
  operation: string,
  params: Record<string, unknown>
): string {
  // Sort keys for consistent ordering
  const sortedKeys = Object.keys(params).sort();
  const parts = [category, operation];

  for (const key of sortedKeys) {
    const value = params[key];
    if (value === undefined || value === null) continue;

    if (Array.isArray(value)) {
      // Sort arrays for consistency
      parts.push(`${key}:${[...value].sort().join(',')}`);
    } else if (typeof value === 'object') {
      parts.push(`${key}:${JSON.stringify(value)}`);
    } else {
      parts.push(`${key}:${String(value)}`);
    }
  }

  return parts.join('_');
}

/**
 * Generate cache key for task queries
 */
export function generateTaskCacheKey(mode: string, filters: Record<string, unknown>): string {
  return generateCacheKey('tasks', mode, filters);
}

/**
 * Generate cache key for project queries
 */
export function generateProjectCacheKey(operation: string, filters: Record<string, unknown>): string {
  return generateCacheKey('projects', operation, filters);
}

// ... similar helpers for other categories
```

**Implementation**:
1. Create utility file
2. Update all tools to use the utilities
3. Run integration tests to ensure cache still works

**Value**: Would eliminate inconsistency, but current patterns work. Nice-to-have for maintainability.

---

### Priority 6: Standardize Cache Invalidation (1-2 hours)

**Problem**: Mix of smart/blanket/specific invalidation approaches.

**Standard Pattern Hierarchy** (use in this order):

1. **Smart context-aware** (BEST):
   ```typescript
   this.cache.invalidateForTaskChange({
     operation: 'create',
     projectId: args.projectId,
     tags: args.tags,
     affectsToday: this.isDueToday(args.dueDate),
     affectsOverdue: false,
   });
   ```

2. **Specific invalidation** (GOOD):
   ```typescript
   this.cache.invalidateProject(projectId);
   this.cache.invalidateTag(tagName);
   this.cache.invalidateTaskQueries(['today', 'overdue']);
   ```

3. **Category invalidation** (ACCEPTABLE):
   ```typescript
   this.cache.invalidate('tasks');
   ```

4. **Category-wide clear** (AVOID):
   ```typescript
   this.cache.clear('tasks'); // Only use when absolutely necessary
   ```

**Tools to Review**:
- ManageTaskTool - Uses blanket invalidation
- All write operations should use smart invalidation

**Value**: Better cache efficiency, but current invalidation works (just over-invalidates sometimes).

---

### Priority 7: Remove Unnecessary Type Casts (30 min)

**Problem**: Unnecessary `as unknown as ResponseType` casts throughout ProjectsToolV2, TagsToolV2.

**Fix**: Update response helper return types to match expected types.

**Example**:

```typescript
// BEFORE:
return createListResponseV2(
  'projects',
  projects,
  'projects',
  metadata
) as unknown as ProjectsResponseV2;

// AFTER:
// Fix createListResponseV2 signature to return correct type
return createListResponseV2<ProjectsDataV2>(
  'projects',
  { projects },
  'projects',
  metadata
);
```

**Value**: Cleaner code, but type casts currently work. Low priority cleanup.

---

## 🟢 LOW PRIORITY: Nice to Have (2-3 hours)

### Priority 8: Standardize Metadata Fields

**Problem**: Inconsistent metadata field names (`executionTime` vs `query_time_ms`).

**Standard Fields** (always include):
- `operation: string`
- `query_time_ms: number` (NOT `executionTime`)
- `from_cache: boolean`
- `timestamp: string` (ISO 8601)

**Value**: Consistency in logs/metrics, but mixed naming doesn't cause bugs.

---

### Priority 9: Document Helper Function Usage

**Create**: `/docs/HELPER_FUNCTION_GUIDELINES.md`

**Guidelines**:
- Use `getUnifiedHelpers()` for all operations (current standard)
- Document deprecated helpers: `getAllHelpers()`, `getCoreHelpers()`, `getMinimalHelpers()`
- Explain when to use `getBridgeOperations()` (JXA + evaluateJavascript() bridge)
- Document script size budget for each helper level

**Value**: Helpful for new contributors, but architecture already documented in ARCHITECTURE.md and CLAUDE.md.

---

### Priority 10: Document Test Patterns

**Create**: `/docs/TESTING_PATTERNS.md`

**Standard patterns**:
- Mock structure
- Test file organization
- Unit vs integration test guidelines
- Coverage expectations

**Value**: Helpful for consistency, but tests already follow patterns and README has testing section.

---

## Decision Points

### When to Implement:

**Consider implementing when:**
- Cache performance becomes an issue (Priority 5, 6)
- Type safety complaints increase (Priority 7)
- New developers struggle with patterns (Priority 9, 10)
- Code review consistently flags inconsistencies (Priority 4, 8)

**Don't implement if:**
- Current code works well and is maintainable
- Team is small and patterns are understood
- Higher priority features are pending
- No pain points from current inconsistencies

### Recommended Approach:

**If implementing, do in this order:**
1. Priority 7 (30 min) - Quick cleanup, improves code clarity
2. Priority 4 (1 hour) - Low-risk, explicit > implicit
3. Priority 5 (2 hours) - Only if cache issues arise
4. Priority 6 (1-2 hours) - Only if cache performance matters
5. Priority 8, 9, 10 - Documentation when onboarding new developers

---

## Notes

- These items were originally estimated at 6-10 hours
- They provide consistency and polish but aren't critical
- All high-priority items (type safety, error handling, script execution) are done
- Current codebase is functional and maintainable without these
- Revisit quarterly to see if any items have become important

---

*Extracted from STANDARDIZATION_PLAN.md on October 15, 2025. These remain as future enhancements to consider when appropriate.*
