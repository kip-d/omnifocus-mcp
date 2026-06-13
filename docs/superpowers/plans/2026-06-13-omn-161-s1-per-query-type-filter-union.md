# OMN-161 S1: per-query-type filter discriminated union — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `CompiledQuery.filters` a per-query-type discriminated union so every query type compiles its filters
through a typed, `satisfies`-exhaustive transform — closing the entire P1 accept-then-ignore class this session
(tags/folders reject-all, no task-shaped filter leaks onto non-task variants) plus honesty riders F4/F5/F6/F7/F9.

**Architecture:** `CompiledQuery` becomes a discriminated union keyed by `type`; `compile()` dispatches to one transform
per type. The `projectFilter?` side-channel is folded into the union and deleted. tasks/export carry
`NormalizedTaskFilter` (export legitimately accepts task vocabulary); projects carries `ProjectFilter`;
tags/folders/perspectives carry empty typed filters and reject any present filter key at the compile boundary.

**Tech Stack:** TypeScript, Zod, Vitest. Spec:
`docs/superpowers/specs/2026-06-13-omn-161-per-query-type-filter-contracts-design.md`.

**Baseline:** worktree branch `worktree-omn-161-filter-contracts` off `main` @ `dd956de`.

---

## Plan-level decisions (deviations from spec §3.2 — flagged for the plan reviewer)

1. **Export carries `NormalizedTaskFilter`, not a new compile-time `ExportFilter`.** The script-builder `ExportFilter`
   (`src/contracts/ast/script-builder.ts`) is a downstream handler-level type built inside `handleTaskExport`; export's
   _compile-time_ filter genuinely is the task vocabulary. A separate `transformExportFilters` would ripple across
   `handleTaskExport`/`handleProjectExport`/`handleBulkExport` without adding honesty. F9 (dead `.search` read) is
   achieved by deleting the one dead line in `handleTaskExport`. The union's distinct member set is therefore
   `NormalizedTaskFilter (tasks, export) | ProjectFilter | TagFilter | FolderFilter | PerspectiveFilter`.
2. **`transformFilters` is NOT renamed** to `transformTaskFilters`. It is already the task transform; renaming churns
   tests and call sites for zero behavior/clarity gain (the sibling names `transformProjectFilters` /
   `transformTagFilters` already disambiguate). Documented here rather than silently skipped.
3. **Reject-all types share one disposition-driven engine** (`rejectByDisposition`) but each keeps its own
   `satisfies Record<InputKey, 'reject'>` table — DRY engine, per-type class-closure preserved (a new schema key is a
   compile error in each table until dispositioned).

---

## File structure

| File                                                       | Responsibility                                                     | Action                                                                     |
| ---------------------------------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| `src/contracts/filters.ts`                                 | Filter contract types                                              | Add `TagFilter`, `FolderFilter`, `PerspectiveFilter` (empty branded types) |
| `src/tools/unified/compilers/filter-merge.ts`              | Shared filter helpers                                              | Bind `STATUS_TO_PROJECT` via `satisfies` (F4)                              |
| `src/tools/unified/compilers/reject-filters.ts`            | Reject-all transforms for tags/folders/perspectives                | **Create**                                                                 |
| `src/tools/unified/compilers/transform-project-filters.ts` | Projects transform                                                 | Add empty-AND-item rejection (F7)                                          |
| `src/tools/unified/compilers/QueryCompiler.ts`             | `CompiledQuery` union + `compile()` dispatch + origin-aware status | Major edit (F1/F5/F6)                                                      |
| `src/tools/unified/OmniFocusReadTool.ts`                   | Read handlers                                                      | Migrate handlers to the union; delete dead `.search` (F9)                  |
| `docs/spec/read-filters.md`                                | Normative spec                                                     | §6 drift rows (F3/F5/F6/F7/F9 resolved)                                    |
| `tests/unit/tools/unified/compilers/*.test.ts`             | Unit coverage                                                      | New tests per task                                                         |

---

## Task 1: F4 — bind `STATUS_TO_PROJECT` to the schema status enum via `satisfies`

**Files:**

- Modify: `src/tools/unified/compilers/filter-merge.ts`
- Modify: `src/tools/unified/schemas/read-schema.ts` (export a `ReadStatus` type if not already derivable)
- Test: `tests/unit/tools/unified/compilers/filter-merge.test.ts` (create if absent)

- [ ] **Step 1: Write the failing test** — assert every schema status value maps.

```ts
import { describe, it, expect } from 'vitest';
import { STATUS_TO_PROJECT } from '../../../../../src/tools/unified/compilers/filter-merge.js';

describe('STATUS_TO_PROJECT (OMN-161 F4)', () => {
  it('maps every read-schema status value', () => {
    // The four schema status enum values must each have a project-status mapping.
    expect(Object.keys(STATUS_TO_PROJECT).sort()).toEqual(['active', 'completed', 'dropped', 'on_hold']);
    expect(STATUS_TO_PROJECT.on_hold).toBe('onHold');
  });
});
```

- [ ] **Step 2: Run, verify it passes already at runtime** (the map is correct today) — this test pins runtime; the
      compile-time guarantee is added next. Run:
      `npx vitest run tests/unit/tools/unified/compilers/filter-merge.test.ts`

- [ ] **Step 3: Add the `satisfies` binding.** In `read-schema.ts`, ensure the status enum literal union is exportable:

```ts
// read-schema.ts — near the filterFields status field
export const READ_STATUS_VALUES = ['active', 'completed', 'dropped', 'on_hold'] as const;
export type ReadStatus = (typeof READ_STATUS_VALUES)[number];
```

**REPLACE the inline enum, do not add beside it.** The `status` field is currently
`z.enum(['active','completed','dropped','on_hold'])` — change it to `z.enum(READ_STATUS_VALUES)` so the schema and the
`ReadStatus` type share ONE source. Leaving the inline literal beside the new const half-wires the guarantee.

In `filter-merge.ts`, change the loose Record to a `satisfies`-bound one:

```ts
import type { ReadStatus } from '../schemas/read-schema.js';
// ...
export const STATUS_TO_PROJECT = {
  active: 'active',
  on_hold: 'onHold',
  completed: 'done',
  dropped: 'dropped',
} as const satisfies Record<ReadStatus, ProjectStatus>;
```

- [ ] **Step 4: Verify `tsc` + test pass.** Run:
      `npm run build && npx vitest run tests/unit/tools/unified/compilers/filter-merge.test.ts` Expected: PASS. (Sanity:
      temporarily add a 5th value to `READ_STATUS_VALUES` without a `STATUS_TO_PROJECT` entry → `npm run build` must
      FAIL; revert.)

- [ ] **Step 5: Commit** — `git commit -m "fix(OMN-161/F4): STATUS_TO_PROJECT satisfies the schema status enum"`

---

## Task 2: new per-type filter contract types

**Files:**

- Modify: `src/contracts/filters.ts`
- Test: covered structurally by Task 6's union test (no standalone test).

- [ ] **Step 1: Add the empty typed contracts** after `ProjectFilter` in `filters.ts`. Use a branded-empty shape so the
      union members are distinguishable and a future S2 field has a home:

```ts
/**
 * OMN-161 S1: tags/folders/perspectives queries carry no compile-time filter yet.
 * Empty object types — distinct members of the CompiledQuery discriminated union.
 * S2 adds folder/tag name fields to TagFilter/FolderFilter (capability).
 */
export type TagFilter = Record<string, never>;
export type FolderFilter = Record<string, never>;
export type PerspectiveFilter = Record<string, never>;
```

- [ ] **Step 2: Verify build** — `npm run build`. Expected: PASS (types unused yet).
- [ ] **Step 3: Commit** — `git commit -m "feat(OMN-161): empty TagFilter/FolderFilter/PerspectiveFilter contracts"`

---

## Task 3: reject-by-disposition engine + tag/folder/perspective transforms

**Files:**

- Create: `src/tools/unified/compilers/reject-filters.ts`
- Test: `tests/unit/tools/unified/compilers/reject-filters.test.ts`

- [ ] **Step 1: Write failing tests** — reject matrix for each type.

```ts
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  transformTagFilters,
  transformFolderFilters,
  transformPerspectiveFilters,
} from '../../../../../src/tools/unified/compilers/reject-filters.js';

describe('reject-all filter transforms (OMN-161 S1 F3/F6)', () => {
  it('tags: empty filter → {} (no reject)', () => {
    expect(transformTagFilters({})).toEqual({});
  });
  it('tags: any present key rejects with a tags-named message', () => {
    try {
      transformTagFilters({ flagged: true } as any);
      throw new Error('did not throw');
    } catch (e) {
      expect(e).toBeInstanceOf(z.ZodError);
      expect((e as z.ZodError).issues[0].message).toMatch(/tags queries/i);
      expect((e as z.ZodError).issues[0].path).toEqual(['query', 'filters', 'flagged']);
    }
  });
  it('folders: folder key rejects naming folders (not "tasks or export")', () => {
    try {
      transformFolderFilters({ folder: 'Bills' } as any);
      throw new Error('no throw');
    } catch (e) {
      expect((e as z.ZodError).issues[0].message).toMatch(/folders queries/i);
    }
  });
  it('perspectives: status key rejects naming perspectives', () => {
    try {
      transformPerspectiveFilters({ status: 'active' } as any);
      throw new Error('no throw');
    } catch (e) {
      expect((e as z.ZodError).issues[0].message).toMatch(/perspectives queries/i);
    }
  });
  it('tags: logical operators also reject (AND/OR/NOT)', () => {
    expect(() => transformTagFilters({ OR: [{ flagged: true }] } as any)).toThrow(z.ZodError);
  });
});
```

- [ ] **Step 2: Run, verify FAIL** — Run: `npx vitest run tests/unit/tools/unified/compilers/reject-filters.test.ts`
      Expected: FAIL (module not found).

- [ ] **Step 3: Implement `reject-filters.ts`.** Shared engine + per-type tables (each `satisfies`-closed):

```ts
import { z } from 'zod';
import type { FilterValue, FlatFilterValue } from '../schemas/read-schema.js';
import type { TagFilter, FolderFilter, PerspectiveFilter } from '../../../contracts/filters.js';

type EmptyInputKey = keyof FlatFilterValue | 'AND' | 'OR' | 'NOT';

/**
 * OMN-161 S1: a query type that supports NO filters yet. Every input key has an
 * explicit 'reject' disposition; `satisfies` makes a future schema field a compile
 * error here until S2 dispositions it (the class-closing pattern; spec P1).
 */
function rejectByDisposition(
  input: FilterValue,
  table: Record<EmptyInputKey, 'reject'>,
  typeName: string,
  steer: string,
): void {
  for (const key of Object.keys(input)) {
    if ((input as Record<string, unknown>)[key] === undefined) continue;
    // table lookup is total over EmptyInputKey; an unknown key is unreachable past schema validation
    if ((table as Record<string, 'reject'>)[key] === 'reject') {
      throw new z.ZodError([
        {
          code: z.ZodIssueCode.custom,
          path: ['query', 'filters', key],
          message: `filters.${key} is not supported on ${typeName} queries. ${steer}`,
        },
      ]);
    }
  }
}

const ALL_REJECT = {
  id: 'reject',
  status: 'reject',
  completed: 'reject',
  tags: 'reject',
  project: 'reject',
  projectId: 'reject',
  parentTaskId: 'reject',
  dueDate: 'reject',
  deferDate: 'reject',
  plannedDate: 'reject',
  completionDate: 'reject',
  added: 'reject',
  flagged: 'reject',
  blocked: 'reject',
  available: 'reject',
  inInbox: 'reject',
  text: 'reject',
  estimatedMinutes: 'reject',
  name: 'reject',
  folder: 'reject',
  AND: 'reject',
  OR: 'reject',
  NOT: 'reject',
} as const satisfies Record<EmptyInputKey, 'reject'>;

// S1: all three share the all-reject table. S2 forks TAG_/FOLDER_ tables to map name/parent.
export function transformTagFilters(input: FilterValue): TagFilter {
  rejectByDisposition(
    input,
    ALL_REJECT,
    'tags',
    'Tags queries return all tags; filtering by tag name is planned (OMN-161 S2). Remove the filter.',
  );
  return {};
}
export function transformFolderFilters(input: FilterValue): FolderFilter {
  rejectByDisposition(
    input,
    ALL_REJECT,
    'folders',
    'Folders queries return all folders (name-sorted, capped 100); filtering by folder name is planned (OMN-161 S2). Remove the filter.',
  );
  return {};
}
export function transformPerspectiveFilters(input: FilterValue): PerspectiveFilter {
  rejectByDisposition(input, ALL_REJECT, 'perspectives', 'Perspectives queries take no filters. Remove the filter.');
  return {};
}
```

- [ ] **Step 4: Run, verify PASS** — `npx vitest run tests/unit/tools/unified/compilers/reject-filters.test.ts`
- [ ] **Step 5: Commit** — `git commit -m "feat(OMN-161/F3,F6): reject-all tag/folder/perspective filter transforms"`

---

## Task 4: F5 — origin-aware `on_hold` status rejection path

**Files:**

- Modify: `src/tools/unified/compilers/QueryCompiler.ts` (`transformStatus`, its caller `transformFlatFilter`)
- Test: `tests/unit/tools/unified/compilers/QueryCompiler.test.ts`

- [ ] **Step 1: Write failing test** — `on_hold` inside `OR[1]` reports the branch path.

```ts
it('on_hold inside an OR branch reports the branch-qualified path (OMN-161 F5)', () => {
  const c = new QueryCompiler();
  try {
    c.transformFilters({ OR: [{ flagged: true }, { status: 'on_hold' }] } as any);
    throw new Error('did not throw');
  } catch (e) {
    expect(e).toBeInstanceOf(z.ZodError);
    expect((e as z.ZodError).issues[0].path).toEqual(['query', 'filters', 'OR', 1, 'status']);
  }
});
it('on_hold at top level still reports filters.status', () => {
  const c = new QueryCompiler();
  try {
    c.transformFilters({ status: 'on_hold' } as any);
    throw new Error('no throw');
  } catch (e) {
    expect((e as z.ZodError).issues[0].path).toEqual(['query', 'filters', 'status']);
  }
});
```

- [ ] **Step 2: Run, verify FAIL** (branch case reports `['query','filters','status']`). Run:
      `npx vitest run tests/unit/tools/unified/compilers/QueryCompiler.test.ts -t "on_hold"`

- [ ] **Step 3: Thread `origin` into `transformStatus`.** Change the signature and the on_hold throw:

```ts
// transformFlatFilter calls: this.transformStatus(input, result, origin);
private transformStatus(input: QueryFilter, result: TaskFilter, origin: string = 'filters'): void {
  // ... unchanged completed/active/dropped mapping ...
  } else if (input.status === 'on_hold') {
    throw new z.ZodError([
      {
        code: z.ZodIssueCode.custom,
        path: [...this.originToPath(origin), 'status'],
        message: ON_HOLD_TASKS_REJECTION,
      },
    ]);
  }
  // ... unchanged projectStatus mapping ...
}
```

Update the call site in `transformFlatFilter` to pass `origin`. Confirm `originToPath('filters')` returns
`['query','filters']` so the top-level case appends to `['query','filters','status']` (unchanged).

- [ ] **Step 4: Run, verify PASS** — both tests green. Run:
      `npx vitest run tests/unit/tools/unified/compilers/QueryCompiler.test.ts -t "on_hold"`
- [ ] **Step 5: Commit** — `git commit -m "fix(OMN-161/F5): origin-aware on_hold rejection path in OR branches"`

---

## Task 5: F7 — projects empty-AND-item symmetry

**Files:**

- Modify: `src/tools/unified/compilers/transform-project-filters.ts`
- Test: `tests/unit/tools/unified/compilers/transform-project-filters.test.ts`

- [ ] **Step 1: Write failing test** — `AND:[{}]` must reject on projects, as it does on tasks.

```ts
it('rejects AND:[{}] (empty item) symmetrically with tasks (OMN-161 F7)', () => {
  expect(() => transformProjectFilters({ AND: [{}] } as any)).toThrow(z.ZodError);
});
it('rejects an AND item with only undefined values', () => {
  expect(() => transformProjectFilters({ AND: [{ flagged: undefined }] } as any)).toThrow(z.ZodError);
});
it('still accepts a non-empty AND item', () => {
  expect(transformProjectFilters({ AND: [{ flagged: true }] } as any)).toEqual({ flagged: true });
});
```

- [ ] **Step 2: Run, verify FAIL** — `AND:[{}]` currently a silent no-op. Run:
      `npx vitest run tests/unit/tools/unified/compilers/transform-project-filters.test.ts -t "empty item"`

- [ ] **Step 3: Add the empty-item check in `mergeFrom`'s AND loop.** After computing the per-item defined-key count:

```ts
if (AND !== undefined && Array.isArray(AND)) {
  if (AND.length === 0) throw emptyOperatorError('AND');
  (AND as FlatFilterValue[]).forEach((cond, i) => {
    const definedKeys = Object.values(cond as Record<string, unknown>).filter((v) => v !== undefined).length;
    if (definedKeys === 0) {
      throw projectsError(
        ['AND', i],
        `AND[${i}] contains no usable conditions. Every AND item must contain at least one filter; ` +
          'remove the empty item or add a condition.',
      );
    }
    mergeFrom(`AND[${i}]`, cond as Record<string, unknown>);
  });
}
```

- [ ] **Step 4: Run, verify PASS** — all three tests green.
- [ ] **Step 5: Commit** — `git commit -m "fix(OMN-161/F7): projects reject empty AND items, symmetric with tasks"`

---

## Task 6: `CompiledQuery` discriminated union + `compile()` dispatch + handler migration (F1/F6/F9)

> **This is the atomic structural task.** The union type change makes `npm run build` red until all handlers narrow;
> land it as one coherent commit. Do the type+dispatch first, then fix every `tsc` error in the handlers, then green.

**Files:**

- Modify: `src/tools/unified/compilers/QueryCompiler.ts` (`CompiledQuery`, `compile()`)
- Modify: `src/tools/unified/OmniFocusReadTool.ts` (all `handle*` consumers)
- Test: `tests/unit/tools/unified/compilers/QueryCompiler.test.ts` +
  `tests/unit/tools/unified/compiled-query-union.test.ts`

- [ ] **Step 1: Write failing tests** — dispatch correctness + a union-narrowing compile pin.

```ts
// compiled-query-union.test.ts
import { describe, it, expect } from 'vitest';
import { QueryCompiler } from '../../../../src/tools/unified/compilers/QueryCompiler.js';

describe('CompiledQuery discriminated union (OMN-161 S1)', () => {
  const c = new QueryCompiler();
  it('projects: typed ProjectFilter lands on compiled.filters (no projectFilter side-channel)', () => {
    const compiled = c.compile({ query: { type: 'projects', filters: { status: 'active' } } } as any);
    expect(compiled.type).toBe('projects');
    expect((compiled as any).filters).toEqual({ status: ['active'] });
    expect((compiled as any).projectFilter).toBeUndefined();
  });
  it('tags: a present filter key rejects at compile', () => {
    expect(() => c.compile({ query: { type: 'tags', filters: { flagged: true } } } as any)).toThrow();
  });
  it('folders: folder filter rejects with a folders-named message (not tasks/export)', () => {
    try {
      c.compile({ query: { type: 'folders', filters: { folder: 'Bills' } } } as any);
      throw new Error('no throw');
    } catch (e: any) {
      expect(String(e.issues?.[0]?.message ?? e.message)).toMatch(/folders queries/i);
    }
  });
  it('tasks: unchanged — full task filter compiles onto filters', () => {
    const compiled = c.compile({ query: { type: 'tasks', filters: { flagged: true } } } as any);
    expect((compiled as any).filters.flagged).toBe(true);
  });
  it('export: task-vocabulary filter compiles onto filters (NormalizedTaskFilter)', () => {
    const compiled = c.compile({
      query: { type: 'export', exportType: 'tasks', filters: { completed: false } },
    } as any);
    expect((compiled as any).filters.completed).toBe(false);
  });
});
```

- [ ] **Step 2: Run, verify FAIL** — projects test fails (filter empty, projectFilter set); tags/folders don't reject.
      Run: `npx vitest run tests/unit/tools/unified/compiled-query-union.test.ts`

- [ ] **Step 3: Rewrite `CompiledQuery` as a discriminated union.** Replace the flat interface:

```ts
interface CompiledQueryBase {
  fields?: string[];
  sort?: Array<{ field: SortableField; direction: 'asc' | 'desc' }>;
  limit?: number;
  offset?: number;
  details?: boolean;
}
type TaskMode =
  | 'all'
  | 'inbox'
  | 'search'
  | 'overdue'
  | 'today'
  | 'upcoming'
  | 'available'
  | 'blocked'
  | 'flagged'
  | 'smart_suggest';

export type CompiledQuery =
  | (CompiledQueryBase & {
      type: 'tasks';
      filters: NormalizedTaskFilter;
      mode?: TaskMode;
      fastSearch?: boolean;
      daysAhead?: number;
      countOnly?: boolean;
    })
  | (CompiledQueryBase & { type: 'projects'; filters: ProjectFilter })
  | (CompiledQueryBase & { type: 'tags'; filters: TagFilter })
  | (CompiledQueryBase & { type: 'folders'; filters: FolderFilter })
  | (CompiledQueryBase & { type: 'perspectives'; filters: PerspectiveFilter })
  | (CompiledQueryBase & {
      type: 'export';
      filters: NormalizedTaskFilter;
      exportType?: 'tasks' | 'projects' | 'all';
      format?: 'json' | 'csv' | 'markdown';
      exportFields?: string[];
      outputDirectory?: string;
      includeStats?: boolean;
      includeCompleted?: boolean;
      fastSearch?: boolean;
    });
```

Import the new types in `QueryCompiler.ts`:
`import type { TaskFilter, NormalizedTaskFilter, ProjectFilter, TagFilter, FolderFilter, PerspectiveFilter } from '../../../contracts/filters.js';`

- [ ] **Step 4: Rewrite `compile()` to dispatch per type.** Build a shared base, then a per-type filter + a typed
      return. Note `normalizeFilter` applies only to the task/export variants (it normalizes `TaskFilter`);
      projects/tags/ folders/perspectives return their own filter shapes directly.

```ts
compile(input: ReadInput): CompiledQuery {
  const { query } = input;
  const base: CompiledQueryBase = {
    fields: 'fields' in query ? query.fields : undefined,
    sort: 'sort' in query ? query.sort : undefined,
    limit: 'limit' in query ? query.limit : undefined,
    offset: 'offset' in query ? query.offset : undefined,
    details: 'details' in query ? query.details : undefined,
  };

  switch (query.type) {
    case 'projects':
      return { ...base, type: 'projects', filters: transformProjectFilters(query.filters ?? {}) };
    case 'tags':
      return { ...base, type: 'tags', filters: transformTagFilters(query.filters ?? {}) };
    case 'folders':
      return { ...base, type: 'folders', filters: transformFolderFilters(query.filters ?? {}) };
    case 'perspectives':
      return { ...base, type: 'perspectives', filters: transformPerspectiveFilters(query.filters ?? {}) };
    case 'tasks':
    case 'export': {
      // (default exhaustiveness guard at the end of the switch catches any future query.type)
      const raw: TaskFilter = query.filters ? this.transformFilters(query.filters) : {};
      if ('fastSearch' in query && query.fastSearch !== undefined) raw.fastSearch = query.fastSearch;
      const filters = normalizeFilter(raw);
      if (query.type === 'tasks') {
        return {
          ...base, type: 'tasks', filters,
          mode: ('mode' in query && query.mode ? query.mode : 'all') as TaskMode,
          fastSearch: 'fastSearch' in query ? query.fastSearch : undefined,
          daysAhead: 'daysAhead' in query ? query.daysAhead : undefined,
          countOnly: 'countOnly' in query ? query.countOnly : undefined,
        };
      }
      return {
        ...base, type: 'export', filters,
        exportType: 'exportType' in query ? query.exportType : undefined,
        format: 'format' in query ? query.format : undefined,
        exportFields: 'exportFields' in query ? query.exportFields : undefined,
        outputDirectory: 'outputDirectory' in query ? query.outputDirectory : undefined,
        includeStats: 'includeStats' in query ? query.includeStats : undefined,
        includeCompleted: 'includeCompleted' in query ? query.includeCompleted : undefined,
        fastSearch: 'fastSearch' in query ? query.fastSearch : undefined,
      };
    }
    default: {
      // Exhaustiveness: a future query.type is a compile error here, never a silent undefined return.
      const _exhaustive: never = query;
      throw new Error(`Unhandled query type: ${JSON.stringify(_exhaustive)}`);
    }
  }
}
```

Remove the now-dead `compilesToMatchAll` import usage only if it becomes unused (it is still used inside
`transformFilters` — leave it). Delete the `projectFilter?` field (done in Step 3) and the old top-of-`compile`
`isProjects`/`projectFilter` lines.

- [ ] **Step 5: Migrate handlers in `OmniFocusReadTool.ts`.** Run `npm run build` and fix each error:
  - `handleProjectQuery(compiled)`: replace `compiled.projectFilter` reads with `compiled.filters` (now
    `ProjectFilter`). Delete the `if (!compiled.projectFilter) throw …` invariant guard (the type now guarantees it).
    Narrow with a `if (compiled.type !== 'projects') throw` guard at the top if TS needs the discriminant.
  - `handleTaskQuery(compiled)` / `buildTaskQuery`: add a `if (compiled.type !== 'tasks') ...` narrow at entry if
    needed; `compiled.filters` is `NormalizedTaskFilter` — unchanged logic.
  - `handleTagQuery` / `handleFolderQuery` / `handlePerspectiveQuery`: signatures keep the underscore param
    (`_compiled`) — they still take no filters (the empty filter has no usable keys; rejection already happened at
    compile). No body change needed beyond satisfying the type.
  - `handleTaskExport` / `handleProjectExport` / `handleBulkExport`: `compiled.filters` is `NormalizedTaskFilter`
    (unchanged). **F9:** in `handleTaskExport`, delete the dead `search: compiled.filters.search` line from the
    `ExportFilter` literal (the compiler never sets `.search`).
  - The dispatch switch (`handleQuery` ~line 400) already switches on `compiled.type`, which is the discriminant — TS
    narrows each branch automatically.

- [ ] **Step 6: Run full build + the union tests + the existing compiler/handler tests.** Run:
      `npm run build && npx vitest run tests/unit/tools/unified/` Expected: PASS. Investigate any pinned-old-behavior
      test failures (e.g. a test asserting `compiled.projectFilter`) and update them to the union shape — but DO NOT
      change task-side behavior assertions (tasks must stay byte-identical).

- [ ] **Step 7: Add a `@ts-expect-error` narrowing pin** to `compiled-query-union.test.ts` proving a handler can't read
      the wrong shape:

```ts
it('type-level: projects filter is not task-shaped (compile guard)', () => {
  const compiled = c.compile({ query: { type: 'projects', filters: {} } } as any);
  if (compiled.type === 'projects') {
    // @ts-expect-error ProjectFilter has no `flagged`-via-TaskFilter `dropped` boolean key
    const _x: boolean | undefined = compiled.filters.dropped;
    void _x;
  }
  expect(compiled.type).toBe('projects');
});
```

(Pick a key that genuinely exists on `TaskFilter` but not `ProjectFilter`, e.g. `dropped` or `inInbox`; verify the
`@ts-expect-error` is actually triggered — if not, `tsc` fails the build, which is the signal.)

- [ ] **Step 8: Commit** —
      `git commit -m "feat(OMN-161/F1,F6,F9): CompiledQuery per-query-type discriminated union; remove projectFilter side-channel"`

---

## Task 7: docs — read-filters.md §6 drift rows + inputSchema/description audit

**Files:**

- Modify: `docs/spec/read-filters.md` (§6 + §8 drift register)
- Modify: `src/tools/unified/OmniFocusReadTool.ts` (`inputSchema` getter + description string — dual-schema rule)

- [ ] **Step 1: read-filters.md §6** — update the folders/tags rows to state the reject-with-steering contract (S1) and
      that name/parent filtering is planned (OMN-161 S2). Add §8 drift entries marking F3 (folders/tags
      accept-then-ignore), F5 (origin path), F6 (wrong-type message), F7 (empty-item), F9 (dead `.search`) as **resolved
      by OMN-161 S1**. Use stable anchors (no line numbers).
- [ ] **Step 2: inputSchema/description audit** — in `OmniFocusReadTool`, confirm no description text claims
      folders/tags accept filters; if any does, correct it to "filters reject with steering (capability: OMN-161 S2)".
      Per CLAUDE.md dual-schema rule, the `inputSchema` override and description must stay in sync with behavior.
- [ ] **Step 3: Verify** — `npm run test:unit` (the CLAUDE.md path-rot guard test
      `tests/unit/docs/claude-md-paths.test.ts` must stay green; no line-number/version citations introduced).
- [ ] **Step 4: Commit** —
      `git commit -m "docs(OMN-161): read-filters §6/§8 drift rows + inputSchema sync for reject-with-steering"`

---

## Task 8: full verification gate

- [ ] **Step 1: Unit** — `npm run test:unit`. Expected: all green. Resolve any remaining pinned-old-behavior failures.
- [ ] **Step 2: Integration (backgrounded, never kill — OMN-143).** Start via `run_in_background`:
      `npm run test:integration`. Monitor to completion (~9–16 min). Do NOT run `test:unit` concurrently (guard-test
      flake).
- [ ] **Step 3: Conformance vs a SAME-DAY main control run (OMN-168 — recorded baseline drifted).** Run a control on
      current `main` and the worktree with `llama3.1:8b` + `qwen2.5:7b`; compare. New tags/folders/perspectives rejects
      must not regress the bar; if a case regresses, the steering message is the fix surface, not the reject. The
      conformance probe owns the Ollama lifecycle (OMN-163).
- [ ] **Step 4: No commit** — verification only; results feed the PR description.

---

## Done criteria (S1)

- `CompiledQuery` is a discriminated union; `projectFilter?` is gone; every handler reads its own typed filter.
- tags/folders/perspectives reject any present filter key with a type-named steering message (P1 closed).
- F4/F5/F6/F7/F9 resolved with tests.
- tasks-side behavior byte-identical (golden scripts + existing unit suite unchanged in behavior).
- unit + integration green; conformance ≥ same-day control.
- S2/S3/S4 filed as OMN tickets with the program spec as requirements input.
