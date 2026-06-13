import { describe, it, expect } from 'vitest';
import type { NormalizedTaskFilter } from '../../../../src/contracts/filters.js';
import { describeFilterForScript } from '../../../../src/contracts/ast/script-builder.js';
import { describeProjectFilter } from '../../../../src/contracts/ast/filter-generator.js';

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

describe('OMN-172 F10: describeProjectFilter parity', () => {
  it('describes id (not "all projects")', () => {
    expect(describeProjectFilter({ id: 'p1' } as never)).not.toBe('all projects');
  });
});
