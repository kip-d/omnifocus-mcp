# Phase 3 AST Extension Design

**Date:** 2025-11-25 **Status:** ✅ COMPLETE (2025-12-17) **Context:** Extend AST infrastructure to
consolidate list-projects, list-tags, and export-tasks

---

## Summary

Extend the existing AST contract system to support:

1. **ProjectFilter** - Filter-based queries for projects (similar to TaskFilter)
2. **TagQueryOptions** - Mode-based queries for tags (different pattern, appropriate abstraction)
3. **export-tasks migration** - Leverage existing TaskFilter AST

**Estimated reduction:** ~773 lines (87% of target scripts)

---

## Design Decisions

### Key Insight: Tags Are Different

Tags use **mode-based** queries (field projection levels), not **filter-based** queries:

- `names` mode: Just string array of tag names
- `basic` mode: id + name objects
- `full` mode: All properties including usage stats

This is fundamentally different from tasks/projects which have rich filtering criteria (dates, status, flags, text
search). Creating `TagFilter` would be artificial.

**Decision:** Create `TagQueryOptions` as a separate type acknowledging this conceptual difference.

### File Structure (Option 1 Modified)

```
src/contracts/
├── filters.ts              # TaskFilter + ProjectFilter (filter-based)
├── tag-options.ts          # TagQueryOptions (mode-based) - NEW
├── mutations.ts            # unchanged
└── ast/
    ├── script-builder.ts         # + buildFilteredProjectsScript
    ├── tag-script-builder.ts     # buildTagsScript - NEW
    ├── mutation-script-builder.ts
    └── filter-generator.ts       # + generateProjectFilterCode
```

---

## Type Definitions

### ProjectFilter (add to filters.ts)

```typescript
/**
 * ProjectFilter - Filter properties for project queries
 * Simpler than TaskFilter since projects have fewer filterable properties
 */
export interface ProjectFilter {
  // Status filter - can match multiple statuses
  status?: ('active' | 'onHold' | 'done' | 'dropped')[];

  // Boolean flags
  flagged?: boolean;
  needsReview?: boolean;

  // Text search (name + note)
  text?: string;

  // Folder filter
  folderId?: string;
  folderName?: string;

  // Pagination
  limit?: number;
  offset?: number;
}
```

### TagQueryOptions (new file: tag-options.ts)

```typescript
/**
 * TagQueryOptions - Mode-based options for tag queries
 *
 * Unlike TaskFilter/ProjectFilter, tags use modes for field projection
 * rather than filtering criteria. This reflects OmniFocus's tag model.
 */
export interface TagQueryOptions {
  // Mode determines field projection level
  mode: 'names' | 'basic' | 'full';

  // Post-query options
  includeEmpty?: boolean; // Include tags with 0 tasks
  sortBy?: 'name' | 'usage' | 'activeTasks';

  // Only meaningful in 'full' mode
  includeUsageStats?: boolean;
}

// Mode field mappings
export const TAG_MODE_FIELDS = {
  names: [], // Just string array
  basic: ['id', 'name'], // Minimal objects
  full: ['id', 'name', 'parent', 'childrenAreMutuallyExclusive', 'usage'],
} as const;
```

---

## Script Builders

### buildFilteredProjectsScript (extend script-builder.ts)

```typescript
export function buildFilteredProjectsScript(
  filter: ProjectFilter,
  options: { limit?: number; fields?: string[]; includeStats?: boolean } = {},
): GeneratedScript {
  const { limit = 50, fields = [], includeStats = false } = options;
  const filterCode = generateProjectFilterCode(filter);
  const fieldProjection = generateProjectFieldProjection(fields);

  const script = `
(() => {
  const results = [];
  let count = 0;
  const limit = ${limit};

  function matchesFilter(project) {
    return ${filterCode};
  }

  flattenedProjects.forEach(project => {
    if (count >= limit) return;
    if (!matchesFilter(project)) return;
    results.push({ ${fieldProjection} });
    count++;
  });

  return JSON.stringify({ projects: results, count: results.length });
})()`;

  return { script: script.trim(), filterDescription: '...', isEmptyFilter: false };
}
```

### buildTagsScript (new file: tag-script-builder.ts)

```typescript
export function buildTagsScript(options: TagQueryOptions): GeneratedScript {
  const { mode, includeEmpty = true, sortBy = 'name', includeUsageStats = false } = options;

  switch (mode) {
    case 'names':
      return buildTagNamesScript();
    case 'basic':
      return buildBasicTagsScript();
    case 'full':
      return buildFullTagsScript({ includeEmpty, includeUsageStats });
  }
}
```

---

## Filter Generator Extension

### generateProjectFilterCode (extend filter-generator.ts)

```typescript
export function generateProjectFilterCode(filter: ProjectFilter): string {
  const conditions: string[] = [];

  if (filter.status && filter.status.length > 0) {
    const statusChecks = filter.status.map((s) => {
      const statusMap = {
        active: 'Project.Status.Active',
        onHold: 'Project.Status.OnHold',
        done: 'Project.Status.Done',
        dropped: 'Project.Status.Dropped',
      };
      return `project.status === ${statusMap[s]}`;
    });
    conditions.push(`(${statusChecks.join(' || ')})`);
  }

  if (filter.flagged !== undefined) {
    conditions.push(`(project.flagged === ${filter.flagged})`);
  }

  if (filter.text) {
    const escaped = JSON.stringify(filter.text.toLowerCase());
    conditions.push(
      `((project.name || '').toLowerCase().includes(${escaped}) || ` +
        `(project.note || '').toLowerCase().includes(${escaped}))`,
    );
  }

  return conditions.length > 0 ? conditions.join(' && ') : 'true';
}
```

---

## Migration Plan

| Script           | Before | After | Reduction      |
| ---------------- | ------ | ----- | -------------- |
| export-tasks.ts  | 323    | ~50   | -273 (85%)     |
| list-projects.ts | 277    | ~30   | -247 (89%)     |
| list-tags-v3.ts  | 293    | ~40   | -253 (86%)     |
| **Total**        | 893    | ~120  | **-773 (87%)** |

### Order of Implementation

1. **Add ProjectFilter to filters.ts** - Type definition
2. **Create tag-options.ts** - TagQueryOptions type
3. **Extend filter-generator.ts** - generateProjectFilterCode
4. **Extend script-builder.ts** - buildFilteredProjectsScript + field projection
5. **Create tag-script-builder.ts** - Mode-based tag script generation
6. **Migrate export-tasks.ts** - Uses existing TaskFilter AST
7. **Migrate list-projects.ts** - Uses new ProjectFilter AST
8. **Migrate list-tags-v3.ts** - Uses new TagQueryOptions
9. **Update tool imports** - Point tools to new builders
10. **Run tests and commit**

---

## Future: Entity-Grouped Structure

When the contracts directory grows (15+ files or 2+ new entity types), consider restructuring:

```
src/contracts/entities/
├── task/
│   ├── filter.ts
│   ├── fields.ts
│   ├── mutations.ts
│   └── script-builder.ts
├── project/
│   ├── filter.ts
│   ├── fields.ts
│   ├── mutations.ts
│   └── script-builder.ts
├── tag/
│   ├── options.ts          # Mode-based, not filter
│   ├── fields.ts
│   └── script-builder.ts
└── shared/
    ├── ast-builder.ts
    ├── filter-generator.ts
    └── jxa-wrapper.ts
```

**Triggers for migration:**

- Adding folders, perspectives as queryable entities
- contracts/ exceeds ~15 files
- Team feedback on navigation difficulty

---

## Related Documents

- Phase 1 & 2: `docs/plans/2025-11-24-ast-consolidation-opportunities.md`
- AST Contracts Design: `docs/plans/2025-11-24-ast-filter-contracts-design.md`
- Commits: Phase 1 (9e93ac2), Phase 2 (63c083f)
