import { describe, it, expect } from 'vitest';
import type { NormalizedTaskFilter, ProjectFilter } from '../../../../src/contracts/filters.js';
import { describeFilterForScript } from '../../../../src/contracts/ast/script-builder.js';
import { describeProjectFilter, describeFilter } from '../../../../src/contracts/ast/filter-generator.js';
import { QueryCompiler } from '../../../../src/tools/unified/compilers/QueryCompiler.js';
import { augmentFilterForMode } from '../../../../src/tools/tasks/task-query-pipeline.js';

// OMN-172 F10 forcing function: every key of NormalizedTaskFilter is classified
// 'described' or 'exempt'. Adding a new filter key makes this `satisfies` fail to
// compile until the author decides whether describeFilterForScript should name it —
// closing the class of "filters_applied shows a key but filter_description says 'all tasks'".
type Coverage = 'described' | 'exempt';
const KEY_COVERAGE = {
  // identity / status
  id: 'described',
  completed: 'described',
  dropped: 'described',
  hasRepetitionRule: 'described',
  // tags / text / name
  tags: 'described',
  tagsOperator: 'exempt',
  text: 'described',
  textOperator: 'exempt',
  search: 'described',
  name: 'described',
  nameOperator: 'exempt',
  // dates
  dueAfter: 'described',
  dueBefore: 'described',
  dueDateOperator: 'exempt',
  deferAfter: 'described',
  deferBefore: 'described',
  deferDateOperator: 'exempt',
  plannedAfter: 'described',
  plannedBefore: 'described',
  plannedDateOperator: 'exempt',
  completionAfter: 'described',
  completionBefore: 'described',
  completionDateOperator: 'exempt',
  addedAfter: 'described',
  addedBefore: 'described',
  addedDateOperator: 'exempt',
  // numeric
  estimatedMinutesEquals: 'described',
  estimatedMinutesLessThan: 'described',
  estimatedMinutesGreaterThan: 'described',
  // booleans
  flagged: 'described',
  blocked: 'described',
  available: 'described',
  inInbox: 'described',
  tagStatusValid: 'described',
  // project / parent
  projectId: 'described',
  project: 'exempt', // always rewritten to projectId by transformFlatFilter
  parentTaskId: 'described',
  // structural / internal — EXEMPT
  todayMode: 'exempt',
  dueSoonDays: 'exempt',
  fastSearch: 'exempt',
  includeProjectRoot: 'described', // OMN-153: appears in filters_applied; must be describable
  projectStatus: 'exempt',
  folder: 'exempt',
  folderTopLevel: 'exempt',
  limit: 'exempt',
  offset: 'exempt',
  mode: 'exempt',
  orBranches: 'exempt',
  __normalized__: 'exempt', // brand key (string-literal key of NormalizedTaskFilter)
} satisfies Record<keyof NormalizedTaskFilter, Coverage>;

// One representative single-key value per DESCRIBED key. Range keys are grouped
// (one Before sample exercises the range branch).
const SAMPLE: Partial<Record<keyof NormalizedTaskFilter, NormalizedTaskFilter>> = {
  id: { id: 'abc' } as NormalizedTaskFilter,
  completed: { completed: true } as NormalizedTaskFilter,
  dropped: { dropped: true } as NormalizedTaskFilter,
  hasRepetitionRule: { hasRepetitionRule: true } as NormalizedTaskFilter,
  tags: { tags: ['x'] } as NormalizedTaskFilter,
  text: { text: 'foo' } as NormalizedTaskFilter,
  search: { search: 'foo' } as NormalizedTaskFilter,
  name: { name: 'foo' } as NormalizedTaskFilter,
  dueBefore: { dueBefore: '2026-01-01' } as NormalizedTaskFilter,
  dueAfter: { dueAfter: '2026-01-01' } as NormalizedTaskFilter,
  deferBefore: { deferBefore: '2026-01-01' } as NormalizedTaskFilter,
  deferAfter: { deferAfter: '2026-01-01' } as NormalizedTaskFilter,
  plannedBefore: { plannedBefore: '2026-01-01' } as NormalizedTaskFilter,
  plannedAfter: { plannedAfter: '2026-01-01' } as NormalizedTaskFilter,
  completionBefore: { completionBefore: '2026-01-01' } as NormalizedTaskFilter,
  completionAfter: { completionAfter: '2026-01-01' } as NormalizedTaskFilter,
  addedBefore: { addedBefore: '2026-01-01' } as NormalizedTaskFilter,
  addedAfter: { addedAfter: '2026-01-01' } as NormalizedTaskFilter,
  estimatedMinutesEquals: { estimatedMinutesEquals: 30 } as NormalizedTaskFilter,
  estimatedMinutesLessThan: { estimatedMinutesLessThan: 30 } as NormalizedTaskFilter,
  estimatedMinutesGreaterThan: { estimatedMinutesGreaterThan: 30 } as NormalizedTaskFilter,
  flagged: { flagged: true } as NormalizedTaskFilter,
  blocked: { blocked: true } as NormalizedTaskFilter,
  available: { available: true } as NormalizedTaskFilter,
  inInbox: { inInbox: true } as NormalizedTaskFilter,
  tagStatusValid: { tagStatusValid: true } as NormalizedTaskFilter,
  projectId: { projectId: 'p1' } as NormalizedTaskFilter,
  parentTaskId: { parentTaskId: 't1' } as NormalizedTaskFilter,
  includeProjectRoot: { includeProjectRoot: true } as NormalizedTaskFilter,
};

describe('OMN-172 F10: describeFilterForScript key coverage', () => {
  for (const [key, cov] of Object.entries(KEY_COVERAGE)) {
    if (cov !== 'described') continue;
    const sample = SAMPLE[key as keyof NormalizedTaskFilter];
    it(`describes ${key} (not "all tasks")`, () => {
      expect(sample, `add a SAMPLE entry for described key ${key}`).toBeDefined();
      expect(describeFilterForScript(sample!)).not.toBe('all tasks');
    });
  }
});

// =============================================================================
// OMN-175: describeProjectFilter exhaustive forcing function
//
// Mirrors the tasks-side KEY_COVERAGE above for the project side. OMN-172 closed
// the filter_description↔filters_applied drift class for tasks with a
// `satisfies Record<keyof NormalizedTaskFilter, Coverage>` map, but the project
// side only got a single `id` assertion. A future ProjectFilter key would then
// silently read "all projects" again — reopening, on the project side, the exact
// class S4 closed for tasks. This partition + satisfies makes adding any new
// ProjectFilter key a compile error until it's classified described-or-exempt.
// =============================================================================
const PROJECT_KEY_COVERAGE = {
  // identity / status
  id: 'described',
  status: 'described',
  // booleans
  flagged: 'described',
  needsReview: 'described',
  // text / name
  text: 'described',
  textOperator: 'exempt', // operator modifier, not a standalone predicate
  name: 'described',
  nameOperator: 'exempt',
  // folder
  folderId: 'described',
  folderName: 'described',
  topLevelOnly: 'described',
  // OR logic
  orBranches: 'described', // recursed per branch, joined by OR
  // pagination — EXEMPT (not filter predicates)
  limit: 'exempt',
  offset: 'exempt',
} satisfies Record<keyof ProjectFilter, Coverage>;

// One representative single-key value per DESCRIBED key.
const PROJECT_SAMPLE: Partial<Record<keyof ProjectFilter, ProjectFilter>> = {
  id: { id: 'p1' },
  status: { status: ['active'] },
  flagged: { flagged: true },
  needsReview: { needsReview: true },
  text: { text: 'foo' },
  name: { name: 'foo' },
  folderId: { folderId: 'f1' },
  folderName: { folderName: 'Work' },
  topLevelOnly: { topLevelOnly: true },
  orBranches: { orBranches: [{ flagged: true }] },
};

describe('OMN-175 F10 parity: describeProjectFilter key coverage', () => {
  for (const [key, cov] of Object.entries(PROJECT_KEY_COVERAGE)) {
    if (cov !== 'described') continue;
    const sample = PROJECT_SAMPLE[key as keyof ProjectFilter];
    it(`describes ${key} (not "all projects")`, () => {
      expect(sample, `add a PROJECT_SAMPLE entry for described key ${key}`).toBeDefined();
      expect(describeProjectFilter(sample!)).not.toBe('all projects');
    });
  }
});

// OMN-332 review: date bounds are now ISO instants (local-day edges converted to UTC).
// Descriptions must render them in LOCAL time — the raw UTC form showed
// `due before: 2026-01-01T04:59:59.999Z` for a before:"2025-12-31" query (a different
// calendar date than the user asked for). Both sides are local, so this holds in any TZ.
describe('date bounds are described in local time (OMN-332)', () => {
  const compile = (dueDate: unknown) => new QueryCompiler().transformFilters({ dueDate } as never);

  it('describeFilterForScript: before', () => {
    expect(describeFilterForScript(compile({ before: '2025-12-31' }))).toContain('due before: 2025-12-31 23:59');
  });

  it('describeFilterForScript: between', () => {
    expect(describeFilterForScript(compile({ between: ['2025-12-01', '2025-12-31'] }))).toContain(
      'due: 2025-12-01 00:00 to 2025-12-31 23:59',
    );
  });

  it('describeFilterForScript: a datetime bound keeps its minute', () => {
    expect(describeFilterForScript(compile({ after: '2025-12-31 08:30' }))).toContain('due after: 2025-12-31 08:30');
  });

  it('describeFilter: before', () => {
    expect(describeFilter(compile({ before: '2025-12-31' }))).toContain('due before 2025-12-31 23:59');
  });

  it('never shows a raw ISO instant', () => {
    expect(describeFilterForScript(compile({ before: '2025-12-31' }))).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  // Review round 2: mode- and forecast_past-generated bounds are ISO instants computed
  // server-side (never user strings); they're described in local time too.
  it.each(['overdue', 'upcoming', 'today'] as const)('mode %s bounds read as local "YYYY-MM-DD HH:mm"', (mode) => {
    const text = describeFilterForScript(augmentFilterForMode(mode, {}, {}));
    expect(text).toMatch(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}/);
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  it('a forecast_past-style cutoff (startOfToday ISO) reads as local midnight', () => {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const text = describeFilterForScript({ dueBefore: startOfToday.toISOString(), dueDateOperator: '<' });
    expect(text).toMatch(/due before: \d{4}-\d{2}-\d{2} 00:00/);
  });
});
