# Type-Discriminated Fields Enum — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the read schema accept type-appropriate field names per query type (task fields for task queries, project
fields for project queries) using Zod discriminated unions.

**Architecture:** Extract shared query parameters into a `BaseQuerySchema`, compose per-type schemas with `.merge()`,
and wrap them in `z.discriminatedUnion('type', [...])`. The `QueryCompiler` uses `'in' check` pattern for type-specific
properties. Project field projection is post-hoc in `routeToProjectsTool()`.

**Tech Stack:** Zod 3.x, TypeScript, Vitest

**Design doc:** `docs/plans/2026-02-19-discriminated-fields-enum-design.md`

---

### Task 1: Schema — Add ProjectFieldEnum and BaseQuerySchema

**Files:**

- Modify: `src/tools/unified/schemas/read-schema.ts:101-212`

**Step 1: Write failing tests for project field acceptance and task field rejection**

**Files:**

- Modify: `tests/unit/tools/unified/schemas/read-schema.test.ts`

Add these tests inside the existing `describe('ReadSchema', ...)` block:

```typescript
describe('type-discriminated fields', () => {
  it('should accept project fields on project queries', () => {
    const input = {
      query: {
        type: 'projects',
        fields: ['id', 'name', 'status', 'folder', 'folderPath'],
      },
    };
    const result = ReadSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.query.fields).toEqual(['id', 'name', 'status', 'folder', 'folderPath']);
    }
  });

  it('should reject task fields on project queries', () => {
    const input = {
      query: {
        type: 'projects',
        fields: ['id', 'name', 'blocked', 'parentTaskId'],
      },
    };
    const result = ReadSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('should reject project fields on task queries', () => {
    const input = {
      query: {
        type: 'tasks',
        fields: ['id', 'name', 'status', 'folder'],
      },
    };
    const result = ReadSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('should reject task-only params on project queries', () => {
    const input = {
      query: {
        type: 'projects',
        countOnly: true,
        mode: 'flagged',
      },
    };
    const result = ReadSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('should accept shared params on both task and project queries', () => {
    const taskInput = {
      query: { type: 'tasks', limit: 10, offset: 5 },
    };
    const projectInput = {
      query: { type: 'projects', limit: 10, offset: 5 },
    };
    expect(ReadSchema.safeParse(taskInput).success).toBe(true);
    expect(ReadSchema.safeParse(projectInput).success).toBe(true);
  });

  it('should accept export params only on export queries', () => {
    const exportInput = {
      query: {
        type: 'export',
        exportType: 'tasks',
        format: 'json',
      },
    };
    const taskInput = {
      query: {
        type: 'tasks',
        exportType: 'tasks',
      },
    };
    expect(ReadSchema.safeParse(exportInput).success).toBe(true);
    expect(ReadSchema.safeParse(taskInput).success).toBe(false);
  });

  it('should accept all 15 project fields from script-builder', () => {
    const allProjectFields = [
      'id',
      'name',
      'status',
      'flagged',
      'note',
      'dueDate',
      'deferDate',
      'completedDate',
      'folder',
      'folderPath',
      'folderId',
      'sequential',
      'lastReviewDate',
      'nextReviewDate',
      'defaultSingletonActionHolder',
    ];
    const input = {
      query: { type: 'projects', fields: allProjectFields },
    };
    const result = ReadSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('should accept includeStats on project queries', () => {
    const input = {
      query: { type: 'projects', includeStats: true },
    };
    const result = ReadSchema.safeParse(input);
    expect(result.success).toBe(true);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/tools/unified/schemas/read-schema.test.ts` Expected: 8 new tests FAIL (project fields
rejected by current TaskFieldEnum, task-only params accepted on projects)

**Step 3: Implement the discriminated union schema**

In `src/tools/unified/schemas/read-schema.ts`, replace lines 101-212 (from `// Field selection enum` through the closing
`});` of `QuerySchema`) with:

```typescript
// =============================================================================
// FIELD SELECTION ENUMS (type-discriminated)
// =============================================================================

// Task field enum — matches fields in buildListTasksScriptV4
const TaskFieldEnum = z.enum([
  'id',
  'name',
  'completed',
  'flagged',
  'blocked',
  'available',
  'estimatedMinutes',
  'dueDate',
  'deferDate',
  'plannedDate',
  'completionDate',
  'added',
  'modified',
  'dropDate',
  'note',
  'projectId',
  'project',
  'tags',
  'repetitionRule',
  'parentTaskId',
  'parentTaskName',
  'inInbox',
]);

// Project field enum — matches fields in buildProjectFieldProjections (script-builder.ts:778-824)
const ProjectFieldEnum = z.enum([
  'id',
  'name',
  'status',
  'flagged',
  'note',
  'dueDate',
  'deferDate',
  'completedDate',
  'folder',
  'folderPath',
  'folderId',
  'sequential',
  'lastReviewDate',
  'nextReviewDate',
  'defaultSingletonActionHolder',
]);

// Sort field enum for type safety
const SortFieldEnum = z.enum([
  'dueDate',
  'deferDate',
  'plannedDate',
  'name',
  'flagged',
  'estimatedMinutes',
  'added',
  'modified',
  'completionDate',
]);

// Sort options (matches backend QueryTasksTool schema which uses 'direction')
const SortSchema = z.object({
  field: SortFieldEnum,
  direction: z.enum(['asc', 'desc']),
});

// Export format enum
const ExportFormatEnum = z.enum(['json', 'csv', 'markdown']);

// Export type enum (what to export)
const ExportTypeEnum = z.enum(['tasks', 'projects', 'all']);

// Export field selection (matches ExportTool schema)
const ExportFieldEnum = z.enum([
  'id',
  'name',
  'note',
  'project',
  'tags',
  'deferDate',
  'dueDate',
  'plannedDate',
  'completed',
  'completionDate',
  'flagged',
  'estimated',
  'created',
  'createdDate',
  'modified',
  'modifiedDate',
]);

// =============================================================================
// SHARED BASE + PER-TYPE QUERY SCHEMAS
// =============================================================================

// Shared parameters for all query types
const BaseQuerySchema = z.object({
  // Handle MCP Bridge Type Coercion: LLMs may stringify nested objects
  filters: coerceObject(FilterSchema).optional(),
  sort: z.array(SortSchema).optional(),
  // Handle MCP Bridge Type Coercion: Claude Desktop converts numbers to strings
  limit: coerceNumber().min(1).max(500).optional(),
  offset: coerceNumber().min(0).optional(),
});

// Task queries: fields use TaskFieldEnum, have mode/countOnly/daysAhead/fastSearch/details
const TaskQuerySchema = BaseQuerySchema.merge(
  z.object({
    type: z.literal('tasks'),
    fields: z.array(TaskFieldEnum).optional(),
    mode: z
      .enum([
        'all',
        'inbox',
        'search',
        'overdue',
        'today',
        'upcoming',
        'available',
        'blocked',
        'flagged',
        'smart_suggest',
      ])
      .optional(),
    details: z.boolean().optional(),
    fastSearch: z.boolean().optional(),
    daysAhead: coerceNumber().min(1).max(30).optional(),
    countOnly: z.boolean().optional(),
  }),
);

// Project queries: fields use ProjectFieldEnum, have details/includeStats
const ProjectQuerySchema = BaseQuerySchema.merge(
  z.object({
    type: z.literal('projects'),
    fields: z.array(ProjectFieldEnum).optional(),
    details: z.boolean().optional(),
    includeStats: z.boolean().optional(),
  }),
);

// Tag queries: base only
const TagQuerySchema = BaseQuerySchema.merge(
  z.object({
    type: z.literal('tags'),
  }),
);

// Perspective queries: base only
const PerspectiveQuerySchema = BaseQuerySchema.merge(
  z.object({
    type: z.literal('perspectives'),
  }),
);

// Folder queries: base only
const FolderQuerySchema = BaseQuerySchema.merge(
  z.object({
    type: z.literal('folders'),
  }),
);

// Export queries: export-specific params
const ExportQuerySchema = BaseQuerySchema.merge(
  z.object({
    type: z.literal('export'),
    exportType: ExportTypeEnum.optional().describe('What to export: tasks, projects, or all'),
    format: ExportFormatEnum.optional().describe('Export format: json, csv, or markdown'),
    exportFields: z.array(ExportFieldEnum).optional().describe('Fields to include in export'),
    outputDirectory: z.string().optional().describe('Directory for bulk export (required when exportType=all)'),
    includeStats: z.boolean().optional().describe('Include statistics in project export'),
    includeCompleted: z.boolean().optional().describe('Include completed tasks in export'),
  }),
);

// Discriminated union on query.type
const QuerySchema = z.discriminatedUnion('type', [
  TaskQuerySchema,
  ProjectQuerySchema,
  TagQuerySchema,
  PerspectiveQuerySchema,
  FolderQuerySchema,
  ExportQuerySchema,
]);
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/tools/unified/schemas/read-schema.test.ts` Expected: All 16 tests PASS (8 existing + 8
new)

**Step 5: Commit**

```bash
git add src/tools/unified/schemas/read-schema.ts tests/unit/tools/unified/schemas/read-schema.test.ts
git commit -m "feat: add type-discriminated fields enum to read schema

ProjectFieldEnum accepts project-specific fields (status, folder,
folderPath, etc.). Zod discriminatedUnion on query.type ensures
task-only params are rejected on project queries and vice versa.

Refs: jPCM131m7we"
```

---

### Task 2: QueryCompiler — Use 'in' check pattern for union output

**Files:**

- Modify: `src/tools/unified/compilers/QueryCompiler.ts:44-72`

**Step 1: Write failing test for compiler handling project queries**

**Files:**

- Create: `tests/unit/tools/unified/compilers/QueryCompiler.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { QueryCompiler } from '../../../../../src/tools/unified/compilers/QueryCompiler.js';
import type { ReadInput } from '../../../../../src/tools/unified/schemas/read-schema.js';

describe('QueryCompiler', () => {
  const compiler = new QueryCompiler();

  it('should compile task query with mode and countOnly', () => {
    const input: ReadInput = {
      query: { type: 'tasks', mode: 'flagged', countOnly: true },
    };
    const compiled = compiler.compile(input);
    expect(compiled.type).toBe('tasks');
    expect(compiled.mode).toBe('flagged');
    expect(compiled.countOnly).toBe(true);
  });

  it('should compile project query without task-specific fields', () => {
    const input: ReadInput = {
      query: { type: 'projects', fields: ['id', 'name', 'status'] },
    };
    const compiled = compiler.compile(input);
    expect(compiled.type).toBe('projects');
    expect(compiled.fields).toEqual(['id', 'name', 'status']);
    expect(compiled.mode).toBeUndefined();
    expect(compiled.countOnly).toBeUndefined();
  });

  it('should compile export query with export params', () => {
    const input: ReadInput = {
      query: { type: 'export', exportType: 'tasks', format: 'json' },
    };
    const compiled = compiler.compile(input);
    expect(compiled.type).toBe('export');
    expect(compiled.exportType).toBe('tasks');
    expect(compiled.format).toBe('json');
  });

  it('should compile tag query with only shared params', () => {
    const input: ReadInput = {
      query: { type: 'tags' },
    };
    const compiled = compiler.compile(input);
    expect(compiled.type).toBe('tags');
    expect(compiled.mode).toBeUndefined();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/tools/unified/compilers/QueryCompiler.test.ts` Expected: "mode" test fails — current
compiler sets `mode: query.mode || 'all'` unconditionally, but project queries don't have `.mode`, causing a TypeScript
error or returning `'all'` for projects.

**Step 3: Implement the 'in' check pattern**

Replace the `compile()` method body in `src/tools/unified/compilers/QueryCompiler.ts:44-72`:

```typescript
  compile(input: ReadInput): CompiledQuery {
    const { query } = input;

    // Transform filters from API schema to internal contract, then normalize
    const rawFilters: TaskFilter = query.filters ? this.transformFilters(query.filters) : {};
    const filters = normalizeFilter(rawFilters);

    return {
      type: query.type,
      // Task-specific — use 'in' check since discriminated union narrows per type
      mode: 'mode' in query ? (query.mode || 'all') : undefined,
      filters,
      fields: 'fields' in query ? query.fields : undefined,
      sort: 'sort' in query ? query.sort : undefined,
      limit: 'limit' in query ? query.limit : undefined,
      offset: 'offset' in query ? query.offset : undefined,
      // Task-specific response control
      details: 'details' in query ? query.details : undefined,
      fastSearch: 'fastSearch' in query ? query.fastSearch : undefined,
      daysAhead: 'daysAhead' in query ? query.daysAhead : undefined,
      countOnly: 'countOnly' in query ? query.countOnly : undefined,
      // Export-specific
      exportType: 'exportType' in query ? query.exportType : undefined,
      format: 'format' in query ? query.format : undefined,
      exportFields: 'exportFields' in query ? query.exportFields : undefined,
      outputDirectory: 'outputDirectory' in query ? query.outputDirectory : undefined,
      includeStats: 'includeStats' in query ? query.includeStats : undefined,
      includeCompleted: 'includeCompleted' in query ? query.includeCompleted : undefined,
    };
  }
```

Note: `filters`, `sort`, `limit`, `offset` are on `BaseQuerySchema` so they exist on all variants, but using `'in'`
check is safe and consistent. The key change is `mode` returning `undefined` (not `'all'`) for non-task queries.

**Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/tools/unified/compilers/QueryCompiler.test.ts` Expected: All 4 tests PASS

**Step 5: Commit**

```bash
git add src/tools/unified/compilers/QueryCompiler.ts tests/unit/tools/unified/compilers/QueryCompiler.test.ts
git commit -m "refactor: use 'in' check pattern in QueryCompiler for union output

Discriminated union variants don't share all properties. Use 'in'
check to safely access type-specific fields like mode, countOnly,
exportType. Non-task queries now correctly get mode: undefined.

Refs: jPCM131m7we"
```

---

### Task 3: ReadTool — Project field projection and tool description

**Files:**

- Modify: `src/tools/unified/OmniFocusReadTool.ts:69-104` (description)
- Modify: `src/tools/unified/OmniFocusReadTool.ts:345-365` (routeToProjectsTool)

**Step 1: Write failing test for project field projection**

This is an integration-level test. Since `routeToProjectsTool` delegates to `ProjectsTool.execute()` which hits
OmniFocus, we test the projection helper in isolation.

**Files:**

- Modify: `tests/unit/tools/unified/schemas/read-schema.test.ts`

Add at the bottom of the file (outside the ReadSchema describe block):

```typescript
describe('projectFieldProjection', () => {
  it('should strip project result to requested fields', () => {
    // Import the helper
    const { projectFieldsOnResult } = await import('../../../../../src/tools/unified/OmniFocusReadTool.js');

    const fullProject = {
      id: 'abc123',
      name: 'Test Project',
      status: 'active',
      flagged: false,
      note: 'Some note',
      folder: 'Work',
      folderPath: 'Work',
      sequential: false,
    };

    const result = projectFieldsOnResult({ projects: [fullProject] }, ['id', 'name', 'status']);

    expect(result.projects[0]).toEqual({
      id: 'abc123',
      name: 'Test Project',
      status: 'active',
    });
  });

  it('should pass through when no fields specified', () => {
    const { projectFieldsOnResult } = await import('../../../../../src/tools/unified/OmniFocusReadTool.js');

    const fullProject = { id: 'abc', name: 'Test', status: 'active' };
    const result = projectFieldsOnResult({ projects: [fullProject] }, undefined);
    expect(result.projects[0]).toEqual(fullProject);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/tools/unified/schemas/read-schema.test.ts` Expected: FAIL — `projectFieldsOnResult` is
not exported yet

**Step 3: Implement projectFieldsOnResult and update routeToProjectsTool**

In `src/tools/unified/OmniFocusReadTool.ts`, add this exported function before the class definition (after imports,
around line 25):

```typescript
/**
 * Post-hoc field projection for project query results.
 * Strips project objects to only the requested fields.
 * Always includes 'id' for identity (matching task projectFields behavior).
 */
export function projectFieldsOnResult(
  result: { projects: Record<string, unknown>[] } & Record<string, unknown>,
  fields: string[] | undefined,
): { projects: Record<string, unknown>[] } & Record<string, unknown> {
  if (!fields || fields.length === 0) return result;
  if (!result.projects || !Array.isArray(result.projects)) return result;

  const projected = result.projects.map((project) => {
    const out: Record<string, unknown> = { id: project.id };
    for (const field of fields) {
      if (field in project) {
        out[field] = project[field];
      }
    }
    return out;
  });

  return { ...result, projects: projected };
}
```

Then update `routeToProjectsTool` (lines 345-365) to add field projection at the end:

```typescript
  private async routeToProjectsTool(compiled: CompiledQuery): Promise<unknown> {
    const projectsArgs: Record<string, unknown> = {
      operation: 'list',
      includeCompleted: compiled.filters.completed === true,
      response_format: 'json',
    };

    if (compiled.limit) projectsArgs.limit = compiled.limit;
    if (compiled.filters.tags) projectsArgs.tags = compiled.filters.tags;
    if (compiled.filters.folder) projectsArgs.folder = compiled.filters.folder;
    if (compiled.filters.search) projectsArgs.search = compiled.filters.search;

    // Pass includeStats if specified
    if (compiled.includeStats) projectsArgs.includeStats = compiled.includeStats;

    const result = await this.projectsTool.execute(projectsArgs);

    // Post-hoc field projection: strip to requested fields only
    if (compiled.fields && compiled.fields.length > 0 && result && typeof result === 'object') {
      return projectFieldsOnResult(
        result as { projects: Record<string, unknown>[] } & Record<string, unknown>,
        compiled.fields,
      );
    }

    return result;
  }
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/tools/unified/schemas/read-schema.test.ts` Expected: All tests PASS (existing +
discrimination + projection)

**Step 5: Update tool description**

Replace the `RESPONSE CONTROL` section in the description string (lines 95-99 of `OmniFocusReadTool.ts`) with:

```
RESPONSE CONTROL:
- fields (tasks): ${TaskFieldEnum values} (e.g. ["id", "name", "dueDate", "tags"])
- fields (projects): id, name, status, flagged, note, dueDate, deferDate, completedDate, folder, folderPath, folderId, sequential, lastReviewDate, nextReviewDate, defaultSingletonActionHolder
- sort: [{ field: "dueDate", direction: "asc" }]
- limit/offset: Pagination (default limit: 25, max: 500)
- countOnly: true returns only count (33x faster for "how many" questions) — tasks only
```

**Step 6: Run full unit test suite**

Run: `npx vitest run` Expected: All tests PASS (no regressions from existing tests that may compose ReadSchema)

**Step 7: Commit**

```bash
git add src/tools/unified/OmniFocusReadTool.ts tests/unit/tools/unified/schemas/read-schema.test.ts
git commit -m "feat: add project field projection and update tool description

routeToProjectsTool now strips results to requested fields via
projectFieldsOnResult(). Tool description lists available fields
per query type so LLMs know what's valid.

Refs: jPCM131m7we"
```

---

### Task 4: ReadInput type export fix and final verification

**Files:**

- Modify: `src/tools/unified/schemas/read-schema.ts` (type export)

**Step 1: Verify ReadInput type still works**

The `ReadInput` type is `z.infer<typeof ReadSchema>`. With discriminated unions, the inferred type becomes a union. The
`QueryCompiler` import `ReadInput` and accesses `input.query`. Verify this compiles:

Run: `npm run build` Expected: Clean build, no TypeScript errors

**Step 2: Run full unit test suite**

Run: `npm run test:unit` Expected: All ~1560 tests PASS

**Step 3: Run integration tests (smoke test)**

Run: `npm run test:integration -- --grep "read"` Expected: Integration tests that use the read tool PASS

**Step 4: Mark OmniFocus bug task complete**

Use MCP to mark `jPCM131m7we` as complete.

**Step 5: Final commit (if any fixups needed)**

```bash
git add -A
git commit -m "fix: resolve type export for discriminated union ReadInput

Refs: jPCM131m7we"
```

---

### Task 5: coerceObject compatibility with discriminatedUnion

**Files:**

- Modify: `src/tools/unified/schemas/read-schema.ts:216-218`

**Context:** The current `ReadSchema` wraps `QuerySchema` in `coerceObject()`:

```typescript
export const ReadSchema = z.object({
  query: coerceObject(QuerySchema),
});
```

`coerceObject` uses `z.preprocess()` to parse JSON strings into objects. After that preprocessing, the result is piped
through `QuerySchema` which is now a `z.discriminatedUnion(...)`. This should work because `z.preprocess` returns the
parsed object to the inner schema. However, this is a known compatibility edge case with Zod.

**Step 1: Write a test that exercises JSON string coercion with the new discriminated union**

Add to `tests/unit/tools/unified/schemas/read-schema.test.ts`:

```typescript
it('should coerce stringified query with discriminated union', () => {
  const input = {
    query: '{"type":"projects","fields":["id","name","status"]}',
  };
  const result = ReadSchema.safeParse(input);
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.data.query.type).toBe('projects');
  }
});
```

**Step 2: Run the test**

Run: `npx vitest run tests/unit/tools/unified/schemas/read-schema.test.ts` Expected: PASS if coerceObject works with
discriminatedUnion. If FAIL, fix in Step 3.

**Step 3: Fix if needed**

If `coerceObject` doesn't work with discriminated unions, change the `ReadSchema` to preprocess manually:

```typescript
export const ReadSchema = z.object({
  query: z.preprocess((val) => {
    if (typeof val === 'string') {
      try {
        return JSON.parse(val);
      } catch {
        return val;
      }
    }
    return val;
  }, QuerySchema),
});
```

**Step 4: Commit if any changes needed**

```bash
git add src/tools/unified/schemas/read-schema.ts tests/unit/tools/unified/schemas/read-schema.test.ts
git commit -m "test: verify coerceObject works with discriminated union schema

Refs: jPCM131m7we"
```
