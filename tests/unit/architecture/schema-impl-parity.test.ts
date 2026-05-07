// Architectural parity tests (OMN-47).
//
// Detect declaration/implementation drift before it ships. Each describe block
// pairs a public declaration (Zod enum, schema field set, etc.) with the
// implementation that's expected to honor every member. Adding a new member
// to the declaration without updating the implementation must fail loudly.
//
// Caught the bug class behind OMN-42, OMN-43, and OMN-45 — see those tickets
// for the original incidents. Add a new describe block here whenever you
// introduce a new declaration↔implementation pairing.

import { describe, it, expect, vi } from 'vitest';

import {
  TaskFieldEnum,
  ProjectFieldEnum,
  SortFieldEnum,
  FILTER_FIELD_NAMES,
} from '../../../src/tools/unified/schemas/read-schema.js';
import { buildFilteredTasksScript, buildFilteredProjectsScript } from '../../../src/contracts/ast/script-builder.js';
import { QueryCompiler } from '../../../src/tools/unified/compilers/QueryCompiler.js';
import { createTaskResponseV2, createListResponseV2, generateTaskSummary } from '../../../src/utils/response-format.js';

// =============================================================================
// TaskFieldEnum ↔ generateFieldProjection (OMN-45 class)
// =============================================================================
//
// Every field name accepted by the task-query schema must produce a non-empty
// projection in the generated OmniJS script. A missing case in the projection
// switch silently drops the field from server responses (the OMN-45 bug shape).

describe('Parity: TaskFieldEnum ↔ generateFieldProjection (OMN-45 class)', () => {
  for (const field of TaskFieldEnum.options) {
    it(`projects "${field}" when requested via fields: [...]`, () => {
      const result = buildFilteredTasksScript({}, { fields: [field] });
      // Each projection has the form `<field>: <expression>`.
      // Use a regex anchored on the field name with optional whitespace.
      const projectionPattern = new RegExp(`\\b${field}\\s*:`);
      expect(result.script).toMatch(projectionPattern);
    });
  }
});

// =============================================================================
// FILTER_FIELD_NAMES ↔ QueryCompiler.transformFilters (OMN-43 class)
// =============================================================================
//
// Every filter-field key the schema accepts must be recognized by the compiler.
// Recognition means either the key passes through to the result, or it
// transforms into a known different key (e.g. `project: null` → `inInbox: true`).
// What it cannot do is fall through silently — the compiler emits a warning
// for unknown properties on its result, but that warning only fires post-hoc;
// what we want is up-front certainty that every schema key has a handler.

// For each filter field, a sample value of the right shape so transformFilters
// has something to chew on. None of these encode test-specific assumptions
// beyond "this is a syntactically valid value for this field".
const FILTER_SAMPLES: Record<string, unknown> = {
  id: 'sample-id',
  status: 'active',
  tags: { any: ['@home'] },
  project: 'sample-project-id',
  projectId: 'sample-project-id',
  dueDate: { before: '2026-12-31' },
  deferDate: { before: '2026-12-31' },
  plannedDate: { before: '2026-12-31' },
  completionDate: { before: '2026-12-31' },
  added: { after: '2024-01-01' },
  flagged: true,
  blocked: false,
  available: true,
  inInbox: true,
  text: { contains: 'search' },
  estimatedMinutes: { lessThan: 30 },
  name: { contains: 'meeting' },
  folder: 'Work',
};

// Drift detected by this parity test on first run, tracked but not yet fixed.
// When a fix lands, remove the entry — `it.fails` will then start failing,
// prompting the test to be flipped to `it`.
//
// - `added`: schema accepts date filter, compiler.transformDates doesn't enumerate it (OMN-48)
// - `estimatedMinutes`: schema accepts number filter, compiler has no handler (OMN-49)
const KNOWN_DROPPED_FILTERS = new Set(['added', 'estimatedMinutes']);

describe('Parity: FILTER_FIELD_NAMES ↔ QueryCompiler.transformFilters (OMN-43 class)', () => {
  it('FILTER_SAMPLES covers every schema field — extend FILTER_SAMPLES if this fails', () => {
    const missing = FILTER_FIELD_NAMES.filter((name) => !(name in FILTER_SAMPLES));
    expect(missing).toEqual([]);
  });

  for (const fieldName of FILTER_FIELD_NAMES) {
    const testFn = KNOWN_DROPPED_FILTERS.has(fieldName) ? it.fails : it;
    testFn(`compiler recognizes "${fieldName}" filter field`, () => {
      const compiler = new QueryCompiler();
      const value = FILTER_SAMPLES[fieldName];

      // Spy on console.warn — the QueryCompiler emits this on unknown
      // properties. A field the compiler doesn't recognize would slip
      // through and trigger the warning.
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const input = { [fieldName]: value };

      const result = compiler.transformFilters(input as any);

      // The compiler must have produced *some* effect — either passing the
      // field through, or transforming it. An empty result means the field
      // was silently dropped.
      expect(Object.keys(result).length).toBeGreaterThan(0);

      // The unknown-property warning must not fire.
      const unknownWarnings = warnSpy.mock.calls.filter((args) =>
        String(args[0]).includes('Unknown filter properties detected'),
      );
      expect(unknownWarnings).toEqual([]);

      warnSpy.mockRestore();
    });
  }
});

// =============================================================================
// summary.returned_count === data[key].length invariant (OMN-42 class)
// =============================================================================
//
// The bug shape: a response builder produces a summary block whose
// returned_count diverges from the actual data. This invariant must hold for
// every code path that emits a summary alongside data.

// =============================================================================
// ProjectFieldEnum ↔ generateProjectFieldProjection (OMN-47 audit)
// =============================================================================
//
// Same shape as TaskFieldEnum parity, but for projects. A missing case in the
// project projection switch silently drops the field from server responses.

describe('Parity: ProjectFieldEnum ↔ generateProjectFieldProjection (OMN-47 audit)', () => {
  for (const field of ProjectFieldEnum.options) {
    it(`projects "${field}" when requested via fields: [...]`, () => {
      const result = buildFilteredProjectsScript({}, { fields: [field] });
      const projectionPattern = new RegExp(`\\b${field}\\s*:`);
      expect(result.script).toMatch(projectionPattern);
    });
  }
});

// =============================================================================
// SortFieldEnum ↔ generateSortComparator (OMN-47 audit)
// =============================================================================
//
// Every sortable field declared in the schema must be referenced in the sort
// comparator. The comparator hardcodes type-classification arrays (date / bool
// / number); a SortFieldEnum member missing from all of them falls through to
// the generic-string branch, which silently produces wrong ordering for date
// or numeric fields.

describe('Parity: SortFieldEnum ↔ generateSortComparator (OMN-47 audit)', () => {
  for (const field of SortFieldEnum.options) {
    it(`sort comparator references "${field}"`, () => {
      const result = buildFilteredTasksScript({}, { fields: ['id', 'name'], sort: [{ field, direction: 'asc' }] });
      // Comparator emits `a.${field}` and `b.${field}` to read the sort key.
      const accessorPattern = new RegExp(`a\\.${field}\\b`);
      expect(result.script).toMatch(accessorPattern);
    });
  }
});

// =============================================================================
// status filter values produce TASK-level filtering effects (OMN-50 class)
// =============================================================================
//
// Distinct from the simple "recognized vs dropped" drift — here the compiler
// "recognizes" the field but maps it incorrectly to a different scope. For
// tasks, `status: "dropped"` should produce a task-level filter (e.g.
// `result.dropped = true`), not a project-level filter (`result.projectStatus`).
// The latter has no effect on task queries, silently returning unfiltered results.
//
// Bug shape verified live: `status: "dropped"` returned 2855 tasks (entire DB).

const TASK_LEVEL_FILTER_KEYS = new Set([
  'completed',
  'dropped',
  'flagged',
  'available',
  'blocked',
  'inInbox',
  'projectId',
  'id',
  'name',
  'tags',
  // Date filters (any of these proves task-level filtering)
  'dueBefore',
  'dueAfter',
  'deferBefore',
  'deferAfter',
  'plannedBefore',
  'plannedAfter',
  'completionBefore',
  'completionAfter',
  // Text filters
  'text',
  'textOperator',
  'search',
]);

// Tracked but unfixed:
// - 'dropped' currently maps to projectStatus only; should also set result.dropped = true (OMN-50)
// - 'on_hold' has no task equivalent; either remove from schema for task scope or define semantics (OMN-50)
const KNOWN_INEFFECTIVE_STATUS = new Set(['dropped', 'on_hold']);

// =============================================================================
// MutationSchema operations ↔ dispatcher cases (defensive)
// =============================================================================
//
// The schema declares 8 top-level mutation operations. The dispatcher in
// OmniFocusWriteTool routes each to a handler. A new operation added to the
// schema without a corresponding handler would hit the default case at
// runtime; this test enforces the relationship at PR time.
//
// We do not import the handler directly — instead, this test scans the source
// of OmniFocusWriteTool.ts to confirm each operation literal appears in its
// dispatch logic. Brittle if the dispatch is restructured, but precisely the
// kind of "make a deliberate change to the test if you change the dispatch"
// guard that surfaces drift.

describe('Parity: MutationSchema operations ↔ dispatcher (defensive)', () => {
  const KNOWN_MUTATION_OPERATIONS = [
    'create',
    'create_folder',
    'update',
    'complete',
    'delete',
    'batch',
    'bulk_delete',
    'tag_manage',
  ];

  it('write tool source references every known operation by name', async () => {
    // Read the dispatch source — if the dispatcher moves, update this path.
    const fs = await import('node:fs');
    const path = await import('node:path');
    const url = await import('node:url');
    const here = path.dirname(url.fileURLToPath(import.meta.url));
    const writeToolPath = path.resolve(here, '../../../src/tools/unified/OmniFocusWriteTool.ts');
    const source = fs.readFileSync(writeToolPath, 'utf8');

    for (const op of KNOWN_MUTATION_OPERATIONS) {
      // Each op should appear at least once as a string literal in dispatch logic.
      const literalPattern = new RegExp(`['"]${op}['"]`);
      expect(source, `operation "${op}" not referenced in OmniFocusWriteTool.ts`).toMatch(literalPattern);
    }
  });
});

describe('Parity: status filter values produce task-level filtering (OMN-50 class)', () => {
  const TASK_STATUSES = ['active', 'completed', 'dropped', 'on_hold'] as const;

  for (const status of TASK_STATUSES) {
    const testFn = KNOWN_INEFFECTIVE_STATUS.has(status) ? it.fails : it;
    testFn(`status: "${status}" produces a task-level filter, not just projectStatus`, () => {
      const compiler = new QueryCompiler();

      const result = compiler.transformFilters({ status } as any) as Record<string, unknown>;

      const taskLevelKeys = Object.keys(result).filter((k) => TASK_LEVEL_FILTER_KEYS.has(k));
      expect(taskLevelKeys.length).toBeGreaterThan(0);
    });
  }
});

describe('Invariant: summary.returned_count === data[key].length (OMN-42 class)', () => {
  it('createTaskResponseV2 — small payload, no truncation', () => {
    const tasks = Array.from({ length: 50 }, (_, i) => ({ id: String(i), name: `T${i}` }));
    const response = createTaskResponseV2('test', tasks);

    const dataLen = (response.data as { tasks: unknown[] }).tasks.length;

    expect((response.summary as any).returned_count).toBe(dataLen);
    expect(response.metadata.returned_count).toBe(dataLen);
  });

  it('createTaskResponseV2 — large payload, truncation triggered', () => {
    const padding = 'x'.repeat(200);
    const tasks = Array.from({ length: 400 }, (_, i) => ({ id: String(i), name: `T${i} ${padding}` }));
    const response = createTaskResponseV2('test', tasks);

    const dataLen = (response.data as { tasks: unknown[] }).tasks.length;
    expect(response.metadata.truncated).toBe(true);

    expect((response.summary as any).returned_count).toBe(dataLen);
  });

  it('createListResponseV2 with itemType=tasks', () => {
    const tasks = Array.from({ length: 60 }, (_, i) => ({ id: String(i) }));
    const response = createListResponseV2('test', tasks, 'tasks');

    const dataLen = (response.data as { tasks: unknown[] }).tasks.length;

    expect((response.summary as any).returned_count).toBe(dataLen);
    expect(response.metadata.returned_count).toBe(dataLen);
  });

  it('generateTaskSummary directly — large input', () => {
    // The leaf function. If this drifts, every consumer drifts.
    const tasks = Array.from({ length: 250 }, (_, i) => ({ id: String(i) }));
    const summary = generateTaskSummary(tasks);
    expect(summary.returned_count).toBe(250);
    expect(summary.total_count).toBe(250);
  });
});
