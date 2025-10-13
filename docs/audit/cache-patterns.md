# Cache Patterns Audit - Task 13
**Date:** October 13, 2025
**Purpose:** Review cache usage patterns across tool files

---

## Usage Statistics
- **cache.get calls:** 24
- **cache.set calls:** 23
- **cache.invalidate calls:** 21
- **cache.invalidateTag:** 4
- **cache.invalidateProject:** 4
- **cache.invalidateForTaskChange:** 4
- **cache.invalidateTaskQueries:** 1
- **cache.clear:** 1

---

## Cache Key Patterns

### Namespace-Based Keys
**Pattern:** `namespace_operation_params`

**Examples:**
```typescript
'tasks_overdue_${limit}_${completed}'
'tasks_upcoming_${days}_${limit}'
'tasks_today_${limit}_${details}'
'tasks_search_${search}_${completed}_...'
'projects_list_${JSON.stringify(filter)}'
'projects_active'
'projects_review'
'tags:list:${sortBy}:${includeEmpty}:...'
'active_tags'
```

### Key Characteristics
✅ **GOOD:**
- Namespace prefix prevents collisions ('tasks_', 'projects_', 'tags')
- Include operation type (overdue, upcoming, today, list, active)
- Include parameters that affect results
- Deterministic and reproducible

⚠️ **INCONSISTENCIES:**
- Mixed delimiter usage (underscore vs colon)
  - Tasks/Projects: use underscores `tasks_today_25`
  - Tags: use colons `tags:list:name:true`
- Parameter ordering not always consistent
- Some use JSON.stringify, others concatenate

---

## Cache Key Generation Patterns

### Pattern 1: Template Literals (Most Common)
```typescript
const cacheKey = `tasks_overdue_${args.limit}_${args.completed}`;
```
**Used in:** QueryTasksToolV2, ManageTaskTool
**Status:** GOOD - Clear and maintainable

### Pattern 2: Colon-Delimited
```typescript
const cacheKey = `list:${sortBy}:${includeEmpty}:${includeUsageStats}:...`;
```
**Used in:** TagsToolV2
**Status:** GOOD but INCONSISTENT with other tools

### Pattern 3: JSON.stringify
```typescript
const cacheKey = `projects_list_${JSON.stringify(filter)}`;
```
**Used in:** ProjectsToolV2
**Status:** ACCEPTABLE - Handles complex objects, but harder to read

### Pattern 4: Static Keys
```typescript
const cacheKey = 'projects_review';
const cacheKey = 'active_tags';
```
**Used in:** Various tools
**Status:** GOOD - For simple, parameterless queries

---

## Invalidation Patterns

### Smart Invalidation (GOOD)
```typescript
// Specific invalidation with context
this.cache.invalidateForTaskChange({
  operation: 'create',
  projectId: createArgs.projectId,
  tags: createArgs.tags,
  affectsToday: this.isDueToday(createArgs.dueDate),
  affectsOverdue: false,
});
```
**Used in:** ManageTaskTool
**Status:** EXCELLENT - Surgical invalidation

### Namespace Invalidation (GOOD)
```typescript
this.cache.invalidate('projects');
this.cache.invalidate('analytics');
```
**Used in:** ProjectsToolV2, ManageTaskTool
**Status:** GOOD - Clear and effective

### Specific Entity Invalidation (GOOD)
```typescript
this.cache.invalidateProject(args.projectId);
this.cache.invalidateTag(tagName);
```
**Used in:** ProjectsToolV2, TagsToolV2
**Status:** EXCELLENT - Precise cache management

### Broad Invalidation (ACCEPTABLE)
```typescript
this.cache.clear('tasks');
```
**Used in:** Bulk operations
**Status:** ACCEPTABLE - For bulk changes affecting many items

---

## Issues and Recommendations

### MEDIUM PRIORITY: Inconsistent Key Delimiters
**Issue:** Tasks/Projects use underscores, Tags use colons
**Impact:** Makes cache debugging harder, no functional issue
**Recommendation:**
- Standardize on underscores for consistency
- OR document why Tags uses different pattern

### LOW PRIORITY: Parameter Ordering
**Issue:** No enforced order for parameters in cache keys
**Impact:** Potential duplicate cache entries with same params
**Example:** `tasks_search_term_limit` vs `tasks_limit_search_term`
**Recommendation:**
- Document preferred parameter order
- Consider helper function for cache key generation

### LOW PRIORITY: Tag Sorting in Keys
**Issue:** Some tools sort tag arrays before including in key
```typescript
const sortedTags = args.tags ? [...args.tags].sort() : undefined;
const cacheKey = `tasks_available_${sortedTags ? sortedTags.join(',') : 'no-tags'}`;
```
**Status:** GOOD pattern, but not consistently applied
**Recommendation:**
- Make this a standard pattern for all array parameters
- Add helper: `serializeArrayParam(arr)`

---

## Good Patterns Found

### 1. Cache-Check-Set Pattern
```typescript
const cached = this.cache.get<ExpectedType>('namespace', key);
if (cached) {
  return createResponse(cached, { from_cache: true });
}
// ... execute operation
this.cache.set('namespace', key, result);
```
**Status:** EXCELLENT - Consistent across all tools

### 2. Generic Type on cache.get
```typescript
cache.get<{ tasks: OmniFocusTask[] }>('tasks', cacheKey)
```
**Status:** EXCELLENT - Maintains type safety

### 3. Cache Metadata
```typescript
return createResponse(data, {
  ...timer.toMetadata(),
  from_cache: true,
  mode: 'today'
});
```
**Status:** EXCELLENT - Transparency about cache usage

---

## Conclusion

**Cache Pattern Status: GOOD with MINOR INCONSISTENCIES**

### Strengths
✅ Proper namespace usage prevents collisions
✅ Smart invalidation strategies
✅ Type-safe cache operations
✅ Good cache-check-set pattern
✅ Surgical invalidation for entity changes

### Minor Issues
⚠️ Inconsistent key delimiter style (underscores vs colons)
⚠️ No standardized parameter ordering
⚠️ Array parameter serialization not consistent

### Recommendations
1. **MEDIUM:** Standardize delimiter style (suggest underscores)
2. **LOW:** Document parameter ordering conventions
3. **LOW:** Create helper function for array parameter serialization
4. **LOW:** Consider CacheKeyBuilder class for complex keys

**No urgent changes needed** - Current patterns work well, improvements are for maintainability.
