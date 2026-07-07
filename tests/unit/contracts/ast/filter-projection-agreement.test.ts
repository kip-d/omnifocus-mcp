/**
 * Divergent-parallel-paths agreement pins.
 *
 * One conceptual property emitted by two independent generators is a recurring
 * defect class in this repo (OMN-130 available filter vs projection; OMN-52
 * countOnly vs list defaults; OMN-153 export-path root leak). String tests on
 * each side can both pass while the SEMANTICS diverge — these tests execute the
 * generated OmniJS in node:vm and assert the two paths AGREE on the same rows,
 * so a one-sided regression (a literal replacing the shared constant, an extra
 * condition on one side, a default applied in only one builder) fails here even
 * when every per-side string pin still passes.
 *
 * 1. available: WHERE (filter predicate) ⟺ SELECT (projected value) agreement
 *    across the full Task.Status matrix.
 * 2. list ⟺ count agreement: buildTaskCountScript counts exactly the rows
 *    buildFilteredTasksScript matches, across a matrix of filters, including
 *    the auto-injected completed/dropped/project-root defaults.
 * 3. inbox ⟺ list agreement on the shared default exclusions.
 */

import { describe, it, expect } from 'vitest';
import {
  buildFilteredTasksScript,
  buildInboxScript,
  buildTaskCountScript,
} from '../../../../src/contracts/ast/script-builder.js';
import type { TaskFilter } from '../../../../src/contracts/filters.js';
import { ACTIONABLE_STATUSES } from '../../../../src/contracts/ast/types.js';
import { Task, stubTask, runListScript, runCountScript } from './omnijs-vm-fixture.js';
import type { StubTask, StatusName } from './omnijs-vm-fixture.js';

function ids(rows: Array<Record<string, unknown>>): string[] {
  return rows.map((r) => String(r.id)).sort();
}

// ─── 1. available: WHERE ⟺ SELECT agreement ────────────────────────────────

describe('available: filter predicate agrees with projected value (OMN-130 divergence class)', () => {
  // One task per status — the full matrix, so any status the two sides
  // classify differently produces a disagreement here.
  const statusMatrix: StubTask[] = (Object.keys(Task.Status) as StatusName[]).map((s) =>
    stubTask(`status-${s}`, {
      taskStatus: Task.Status[s],
      completed: s === 'Completed',
    }),
  );

  it('filters {available:true} returns exactly the rows whose projected available is true', () => {
    const filtered = runListScript(
      buildFilteredTasksScript({ available: true }, { fields: ['id', 'available'] }).script,
      statusMatrix,
    );
    const unfiltered = runListScript(
      buildFilteredTasksScript({}, { fields: ['id', 'available'] }).script,
      statusMatrix,
    );

    const projectedAvailable = ids(unfiltered.tasks.filter((t) => t.available === true));
    expect(ids(filtered.tasks)).toEqual(projectedAvailable);
    // Non-vacuity floor: the agreement must be over a non-trivial split.
    expect(filtered.tasks.length).toBeGreaterThan(0);
    expect(filtered.tasks.length).toBeLessThan(unfiltered.tasks.length);
  });

  it('filters {available:false} returns exactly the rows whose projected available is false', () => {
    const filtered = runListScript(
      buildFilteredTasksScript({ available: false }, { fields: ['id', 'available'] }).script,
      statusMatrix,
    );
    const unfiltered = runListScript(
      buildFilteredTasksScript({}, { fields: ['id', 'available'] }).script,
      statusMatrix,
    );

    const projectedUnavailable = ids(unfiltered.tasks.filter((t) => t.available === false));
    expect(ids(filtered.tasks)).toEqual(projectedUnavailable);
    expect(filtered.tasks.length).toBeGreaterThan(0);
  });

  it('projected available per status matches ACTIONABLE_STATUSES membership', () => {
    const actionable = new Set(ACTIONABLE_STATUSES.map((s) => s.replace('Task.Status.', '')));
    const result = runListScript(
      buildFilteredTasksScript({}, { fields: ['id', 'name', 'available'] }).script,
      statusMatrix,
    );
    // Completed/Dropped rows are excluded by the shared defaults (asserted in
    // section 3); every VISIBLE row's projected value must track membership.
    expect(result.tasks.length).toBeGreaterThan(0);
    for (const row of result.tasks) {
      const status = String(row.name).replace('status-', '');
      expect({ status, available: row.available }).toEqual({
        status,
        available: actionable.has(status),
      });
    }
  });
});

// ─── 2. list ⟺ count agreement ──────────────────────────────────────────────

describe('count script agrees with list script (OMN-52 countOnly-parity class)', () => {
  const mixedSet: StubTask[] = [
    stubTask('active-a'),
    stubTask('active-b', { flagged: true }),
    stubTask('overdue', { taskStatus: Task.Status.Overdue, flagged: true }),
    stubTask('blocked', { taskStatus: Task.Status.Blocked }),
    stubTask('completed', { taskStatus: Task.Status.Completed, completed: true }),
    stubTask('dropped', { taskStatus: Task.Status.Dropped }),
    stubTask('root', { project: { name: 'SomeProject' } }),
    stubTask('inboxed', { inInbox: true }),
  ];

  const filterMatrix: Array<{ label: string; filter: TaskFilter }> = [
    { label: 'empty filter (all defaults active)', filter: {} },
    { label: 'flagged', filter: { flagged: true } },
    { label: 'available:true', filter: { available: true } },
    { label: 'includeProjectRoot:true', filter: { includeProjectRoot: true } },
    { label: 'inInbox:true', filter: { inInbox: true } },
  ];

  for (const { label, filter } of filterMatrix) {
    it(`count === list total_matched for ${label}`, () => {
      const list = runListScript(buildFilteredTasksScript(filter, { fields: ['id'] }).script, mixedSet);
      const count = runCountScript(buildTaskCountScript(filter).script, mixedSet);
      expect(count.error).toBeUndefined();
      expect(count.count).toBe(list.total_matched);
    });
  }

  it('the matrix is non-degenerate: at least two filters produce different counts', () => {
    // Guards the agreement suite itself against a stub set where every filter
    // matches the same rows (agreement would then be vacuously easy).
    const counts = filterMatrix.map(
      ({ filter }) => runCountScript(buildTaskCountScript(filter).script, mixedSet).count,
    );
    expect(new Set(counts).size).toBeGreaterThan(1);
  });
});

// ─── 3. inbox ⟺ list agreement on shared defaults ──────────────────────────

describe('inbox script applies the same default exclusions as the list script (OMN-157 class)', () => {
  const inboxSet: StubTask[] = [
    stubTask('in-active', { inInbox: true }),
    stubTask('in-dropped', { inInbox: true, taskStatus: Task.Status.Dropped }),
    stubTask('in-completed', { inInbox: true, taskStatus: Task.Status.Completed, completed: true }),
    stubTask('not-inbox'),
  ];

  it('buildInboxScript excludes dropped and completed rows by default', () => {
    const result = runListScript(buildInboxScript({}, { fields: ['id', 'name'] }).script, inboxSet);
    expect(ids(result.tasks)).toEqual(['id-in-active']);
  });

  it('buildInboxScript returns the same rows as buildFilteredTasksScript({inInbox:true})', () => {
    const viaInbox = runListScript(buildInboxScript({}, { fields: ['id'] }).script, inboxSet);
    const viaList = runListScript(buildFilteredTasksScript({ inInbox: true }, { fields: ['id'] }).script, inboxSet);
    expect(ids(viaInbox.tasks)).toEqual(ids(viaList.tasks));
  });
});
