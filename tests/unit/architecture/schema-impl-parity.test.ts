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

import { TaskFieldEnum, FILTER_FIELD_NAMES } from '../../../src/tools/unified/schemas/read-schema.js';
import { buildFilteredTasksScript } from '../../../src/contracts/ast/script-builder.js';
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
