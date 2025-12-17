# Future AST Contracts Reference

> **Status:** NOT IMPLEMENTED - Reference designs preserved from PR #35
>
> These contract types were designed for AST-based project/tag filtering but were deemed unnecessary given our working
> inline filtering approach. Preserved here in case future complexity warrants formalization.
>
> **Decision (Dec 2025):** Inline filtering in `list-projects-v3.ts` and existing tag scripts is sufficient. AST
> formalization would be over-engineering for the current simple filter needs.

---

## When to Consider Implementing

These contracts become worthwhile if:

- Complex boolean composition is needed ("projects in folder X OR flagged, but NOT on-hold")
- Multiple emitter targets are required (JXA + OmniJS from same filter)
- Filter validation/testing needs to be separated from script execution
- Team struggles with inconsistent filter implementations across tools

---

## ProjectFilter Contract

```typescript
/**
 * Project status values matching OmniFocus API
 */
export type ProjectStatus = 'active' | 'onHold' | 'done' | 'dropped';

/**
 * ProjectFilter - Filter properties for project queries
 *
 * Simpler than TaskFilter since projects have fewer filterable properties.
 * Used by:
 * - QueryCompiler for project queries
 * - buildFilteredProjectsScript for AST-generated scripts
 */
export interface ProjectFilter {
  // --- Identification ---
  id?: string; // Exact project ID lookup

  // --- Status ---
  status?: ProjectStatus[]; // Filter by multiple statuses (OR logic)

  // --- Boolean Flags ---
  flagged?: boolean;
  needsReview?: boolean; // Projects past review date

  // --- Text Search ---
  text?: string; // Search in name + note

  // --- Folder ---
  folderId?: string;
  folderName?: string;

  // --- Pagination ---
  limit?: number;
  offset?: number;

  // --- Performance Mode ---
  performanceMode?: 'normal' | 'lite'; // lite skips expensive stats
  includeStats?: boolean; // Include task counts
}

/**
 * Known project filter property names (for validation)
 */
export const PROJECT_FILTER_PROPERTY_NAMES = [
  'id',
  'status',
  'flagged',
  'needsReview',
  'text',
  'folderId',
  'folderName',
  'limit',
  'offset',
  'performanceMode',
  'includeStats',
] as const;

/**
 * Ensure a filter object conforms to ProjectFilter
 */
export function createProjectFilter(filter: ProjectFilter): ProjectFilter {
  return filter;
}
```

---

## TagQueryOptions Contract

Unlike TaskFilter/ProjectFilter, tags use a **mode-based pattern** rather than filter-based queries. This reflects how
OmniFocus handles tags:

- Tags don't have rich filterable properties (no dates, status, etc.)
- The main variation is HOW MUCH data to return (field projection)
- Post-query filtering is minimal (only "exclude empty tags")

```typescript
/**
 * Tag query modes determine field projection level
 *
 * - 'names': Ultra-fast, returns just string array of tag names
 * - 'basic': Returns minimal objects with id + name
 * - 'full': Returns all properties including parent info and usage stats
 */
export type TagQueryMode = 'names' | 'basic' | 'full';

/**
 * Sort options for tag results
 */
export type TagSortBy = 'name' | 'usage' | 'activeTasks';

/**
 * TagQueryOptions - Mode-based options for tag queries
 *
 * Unlike TaskFilter/ProjectFilter which filter WHICH items to return,
 * TagQueryOptions determines HOW MUCH data to include for each tag.
 */
export interface TagQueryOptions {
  // --- Mode (required) ---
  mode: TagQueryMode;

  // --- Post-query options ---
  /**
   * Include tags with 0 tasks assigned
   * Only meaningful in 'full' mode with usage stats
   * @default true
   */
  includeEmpty?: boolean;

  /**
   * Sort order for results
   * - 'name': Alphabetical (default)
   * - 'usage': Total task count descending
   * - 'activeTasks': Active (incomplete) task count descending
   * @default 'name'
   */
  sortBy?: TagSortBy;

  // --- Full mode options ---
  /**
   * Calculate and include usage statistics (task counts)
   * Only meaningful in 'full' mode
   * @default false
   */
  includeUsageStats?: boolean;
}

/**
 * Fields included in each mode's response
 *
 * - names: Returns string[] (not objects)
 * - basic: Minimal objects for dropdowns/autocomplete
 * - full: Complete tag data for detailed views
 */
export const TAG_MODE_FIELDS = {
  names: [], // Just string array
  basic: ['id', 'name'], // Minimal objects
  full: ['id', 'name', 'parent', 'childrenAreMutuallyExclusive', 'usage'],
} as const;

/**
 * Ensure options conform to TagQueryOptions
 */
export function createTagQueryOptions(options: TagQueryOptions): TagQueryOptions {
  return options;
}

/**
 * Get the fields array for a given mode
 */
export function getFieldsForMode(mode: TagQueryMode): readonly string[] {
  return TAG_MODE_FIELDS[mode];
}
```

---

## Script Builder Patterns

### buildFilteredProjectsScript (would extend script-builder.ts)

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

### buildTagsScript (would be new file: tag-script-builder.ts)

```typescript
export function buildTagsScript(options: TagQueryOptions): GeneratedScript {
  const { mode, includeEmpty = true, sortBy = 'name', includeUsageStats = false } = options;

  switch (mode) {
    case 'names':
      return buildTagNamesScript();
    case 'basic':
      return buildBasicTagsScript();
    case 'full':
      return buildFullTagsScript({ includeEmpty, includeUsageStats, sortBy });
  }
}
```

---

## Future Directory Structure

If contracts grow significantly (15+ files or 2+ new entity types):

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

---

## Source

Extracted from PR #35 (feature/phase3-ast-extension) before closing. Original design docs:

- `docs/plans/2025-11-24-ast-consolidation-opportunities.md`
- `docs/plans/2025-11-25-phase3-ast-extension-design.md`
