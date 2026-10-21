/**
 * OMN-335 slice 1: sort-before-cap, D2 (comparator reads raw task values).
 *
 * D2 fixed the tasks-side OMN-305 trap: `generateSortComparator` used to read
 * `a.<field>`/`b.<field>` off the PROJECTED row, so a sort key the caller's
 * `fields` omitted from the projection compared `undefined` against
 * `undefined` for every row — sort silently no-op'd. The fix captures each
 * row's sort key from the RAW task (TASK_SORT_VALUE_EXPRS) at push time, into
 * a `__sortKey` tuple the comparator reads instead.
 *
 * This file is the vm-executed half of the D2 test (emitted-text assertions
 * live in script-builder.test.ts, next to the rest of the sort-comparator
 * text tests). Uses the shared node:vm fixture (omnijs-vm-fixture.ts).
 */

import { describe, it, expect } from 'vitest';
import { stubTask, runListScript } from './omnijs-vm-fixture.js';
import { buildFilteredTasksScript, buildInboxScript } from '../../../../src/contracts/ast/script-builder.js';

describe('OMN-335 D2: sort comparator reads raw task values (vm-executed)', () => {
  it('sorts by dueDate even when dueDate is NOT in the requested fields (OMN-305 fix)', () => {
    const tasks = [
      stubTask('late', { dueDate: new Date('2026-06-15T17:00:00.000Z') }),
      stubTask('early', { dueDate: new Date('2026-01-10T17:00:00.000Z') }),
      stubTask('mid', { dueDate: new Date('2026-03-20T17:00:00.000Z') }),
    ];

    const { script } = buildFilteredTasksScript(
      {},
      {
        sort: [{ field: 'dueDate', direction: 'asc' }],
        fields: ['name'], // dueDate deliberately NOT requested
      },
    );

    const result = runListScript(script, tasks);

    // Before the D2 fix, the comparator read `a.dueDate`/`b.dueDate` off the
    // projected row — absent here (fields: ['name']) — so both sides were
    // `undefined` and the sort was a silent no-op (DB/push order survived).
    expect(result.tasks.map((t) => t.name)).toEqual(['early', 'mid', 'late']);
    // dueDate was never requested, so the response doesn't carry it (and
    // __sortKey, the scratch field used to sort, never leaks into it either).
    expect(result.tasks[0]).not.toHaveProperty('dueDate');
    expect(result.tasks[0]).not.toHaveProperty('__sortKey');
  });

  it('nulls sort last regardless of direction (desc)', () => {
    const tasks = [
      stubTask('no_due', { dueDate: null }),
      stubTask('late', { dueDate: new Date('2026-06-15T17:00:00.000Z') }),
      stubTask('early', { dueDate: new Date('2026-01-10T17:00:00.000Z') }),
    ];

    const { script } = buildFilteredTasksScript({}, { sort: [{ field: 'dueDate', direction: 'desc' }] });
    const result = runListScript(script, tasks);

    expect(result.tasks.map((t) => t.name)).toEqual(['late', 'early', 'no_due']);
  });

  it('multi-level sort: flagged desc, then name asc, reading raw values', () => {
    const tasks = [
      stubTask('Charlie', { flagged: false }),
      stubTask('Bravo', { flagged: true }),
      stubTask('Alpha', { flagged: true }),
      stubTask('Delta', { flagged: false }),
    ];

    const { script } = buildFilteredTasksScript(
      {},
      {
        sort: [
          { field: 'flagged', direction: 'desc' },
          { field: 'name', direction: 'asc' },
        ],
      },
    );
    const result = runListScript(script, tasks);

    expect(result.tasks.map((t) => t.name)).toEqual(['Alpha', 'Bravo', 'Charlie', 'Delta']);
  });

  it('sorts correctly when the match population exceeds the limit (sort-before-cap)', () => {
    // 10 tasks, due dates in reverse-chronological push order; limit 3 should
    // return the 3 EARLIEST dues, not the first 3 pushed.
    const tasks = Array.from({ length: 10 }, (_, i) =>
      stubTask(`t${i}`, { dueDate: new Date(Date.UTC(2026, 0, 10 - i)) }),
    );

    const { script } = buildFilteredTasksScript({}, { sort: [{ field: 'dueDate', direction: 'asc' }], limit: 3 });
    const result = runListScript(script, tasks);

    expect(result.tasks).toHaveLength(3);
    // t9 (Jan 1) < t8 (Jan 2) < t7 (Jan 3) are the 3 earliest.
    expect(result.tasks.map((t) => t.name)).toEqual(['t9', 't8', 't7']);
    expect(result.total_matched).toBe(10);
  });
});

/**
 * OMN-335 slice 2 (D1): the inbox route's sort-before-slice, vm-executed
 * against a stub of inbox tasks via the shared omnijs-vm-fixture. Mirrors the
 * D2 suite above, but through buildInboxScript (the `inbox` collection), not
 * buildFilteredTasksScript (`flattenedTasks`).
 */
describe('OMN-335 P1 (slice 2): inbox sorts the population before slicing (vm-executed)', () => {
  it('{project:null, sort:added desc, limit:3} returns the 3 newest inbox tasks, with fields omitting `added`', () => {
    const tasks = Array.from({ length: 10 }, (_, i) =>
      stubTask(`t${i}`, { inInbox: true, added: new Date(Date.UTC(2026, 0, i + 1)) }),
    );

    // fields:['name'] deliberately omits 'added' — the raw-task sort key
    // (TASK_SORT_VALUE_EXPRS) must still work (the OMN-305 fix applies to the
    // inbox route too).
    const { script } = buildInboxScript(
      {},
      { sort: [{ field: 'added', direction: 'desc' }], limit: 3, fields: ['name'] },
    );

    const result = runListScript(script, tasks);

    expect(result.tasks).toHaveLength(3);
    // t9 (Jan 10) > t8 (Jan 9) > t7 (Jan 8) are the 3 newest.
    expect(result.tasks.map((t) => t.name)).toEqual(['t9', 't8', 't7']);
    expect(result.total_matched).toBe(10);
    expect(result.tasks[0]).not.toHaveProperty('added');
    expect(result.tasks[0]).not.toHaveProperty('__sortKey');
  });

  it('offset + sort on inbox returns the right window', () => {
    const tasks = Array.from({ length: 10 }, (_, i) =>
      stubTask(`t${i}`, { inInbox: true, added: new Date(Date.UTC(2026, 0, i + 1)) }),
    );

    const { script } = buildInboxScript({}, { sort: [{ field: 'added', direction: 'asc' }], offset: 3, limit: 3 });

    const result = runListScript(script, tasks);

    // Ascending by added: t0 (Jan 1) .. t9 (Jan 10). offset 3 skips t0,t1,t2;
    // limit 3 takes the next 3: t3, t4, t5.
    expect(result.tasks.map((t) => t.name)).toEqual(['t3', 't4', 't5']);
    expect(result.total_matched).toBe(10);
    expect((result as unknown as { offset_applied?: number }).offset_applied).toBe(3);
  });

  it('does not route through flattenedTasks — non-inbox tasks never leak into the inbox result', () => {
    const tasks = [
      stubTask('inbox_a', { inInbox: true, added: new Date('2026-01-01T00:00:00.000Z') }),
      stubTask('not_inbox', { inInbox: false, added: new Date('2026-06-01T00:00:00.000Z') }),
    ];

    const { script } = buildInboxScript({}, { sort: [{ field: 'added', direction: 'desc' }] });
    const result = runListScript(script, tasks);

    expect(result.tasks.map((t) => t.name)).toEqual(['inbox_a']);
    expect(result.total_matched).toBe(1);
  });
});
