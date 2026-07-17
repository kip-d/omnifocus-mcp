// tests/unit/omnifocus/scripts/analytics/productivity-project-counts.test.ts
// OMN-270 — projectStats counts read numberOfTasks/numberOfCompletedTasks/
// numberOfAvailableTasks on the project root task, properties that return
// undefined in OmniJS (live-probed 2026-07-16; they are JXA/AppleScript-only).
// Behind the `|| 0` masks every count was 0, so a project with no recent
// activity emitted NO row at all, and one WITH activity emitted all-zero
// counts — the OMN-142 silent-metric-death class.
//
// Replacement formulas (live-probed against JXA on 219 projects, 2026-07-16):
// - total     = project.task.children.length            (exact parity 219/219)
// - completed = completed DIRECT children of the root   (exact parity 219/219)
// - available = flattened ACTIONABLE_STATUSES descendant count, skipping each
//   project's root task (OMN-269 semantics — deliberately flattened, can
//   exceed JXA's direct-child count on projects with nested groups).
import { describe, it, expect } from 'vitest';
import { PRODUCTIVITY_STATS_SCRIPT_V3 } from '../../../../../src/omnifocus/scripts/analytics/productivity-stats-v3.js';
import { PRODUCTIVITY_STATS_V3_SCHEMA } from '../../../../../src/omnifocus/response-schemas/analyze.js';
import { runAnalyticsScript } from './run-analytics-script.js';

interface FakeTask {
  completed: boolean;
  taskStatus: string;
  dueDate: Date | null;
  deferDate: Date | null;
  completionDate: Date | null;
  /** Non-null marks a project ROOT task (OmniJS: root tasks appear in the
   * global flattenedTasks and their .project is the owning project). */
  project: object | null;
  containingProject: { id: { primaryKey: string } } | null;
}

function task(overrides: Partial<FakeTask>): FakeTask {
  return {
    completed: false,
    taskStatus: 'available',
    dueDate: null,
    deferDate: null,
    completionDate: null,
    project: null,
    containingProject: { id: { primaryKey: 'p1' } },
    ...overrides,
  };
}

interface ProjectStatsRow {
  total: number;
  completed: number;
  available: number;
  completionRate: string;
  status: string;
  hadRecentActivity: boolean;
}

function runScript(
  tasks: FakeTask[],
  projects: unknown[],
): { ok: boolean; data: { projectStats: Record<string, ProjectStatsRow> } } {
  const options = { period: 'week', includeProjectStats: true, includeTagStats: false };
  return runAnalyticsScript(PRODUCTIVITY_STATS_SCRIPT_V3, options, {
    flattenedTasks: tasks,
    flattenedProjects: projects,
  }) as ReturnType<typeof runScript>;
}

describe('OMN-270 — productivity_stats projectStats uses real OmniJS counts', () => {
  it('emits real total/completed/available for a project with no recent activity', () => {
    const done = task({ completed: true, taskStatus: 'completed' });
    const open = task({});
    const root = task({ project: { marker: true } });
    const project = {
      id: { primaryKey: 'p1' },
      name: 'Quiet Project',
      status: 'active',
      task: { children: [done, open] },
      completionDate: null,
      modified: null,
    };

    const parsed = runScript([root, done, open], [project]);
    expect(parsed.ok).toBe(true);
    expect(PRODUCTIVITY_STATS_V3_SCHEMA.safeParse(parsed).success).toBe(true);

    // Pre-fix: counts all read undefined → 0, and with no recent activity the
    // `hadActivity || totalTasks > 0` gate dropped the row entirely.
    const row = parsed.data.projectStats['Quiet Project'];
    expect(row).toBeDefined();
    expect(row.total).toBe(2);
    expect(row.completed).toBe(1);
    expect(row.available).toBe(1);
    expect(row.completionRate).toBe('50.0');
  });

  it('completed counts DIRECT children only; available counts flattened actionable descendants, never the root', () => {
    const grandchild = task({}); // actionable, nested one level down
    const completedGrandchild = task({ completed: true, taskStatus: 'completed' });
    const group = task({ taskStatus: 'blocked' }); // direct child, a blocked group
    Object.assign(group, { children: [grandchild, completedGrandchild] });
    const root = task({ project: { marker: true } }); // reads as actionable — must not count
    const project = {
      id: { primaryKey: 'p1' },
      name: 'Nested Project',
      status: 'active',
      task: { children: [group] },
      completionDate: null,
      modified: null,
    };

    const parsed = runScript([root, group, grandchild, completedGrandchild], [project]);
    const row = parsed.data.projectStats['Nested Project'];
    expect(row).toBeDefined();
    expect(row.total).toBe(1); // the group — direct children only (JXA numberOfTasks parity)
    expect(row.completed).toBe(0); // completed grandchild is NOT a direct child
    expect(row.available).toBe(1); // flattened: the actionable grandchild; root skipped
  });

  it('the script text no longer references the JXA-only count API (dead in OmniJS)', () => {
    expect(PRODUCTIVITY_STATS_SCRIPT_V3).not.toMatch(
      /rootTask|numberOfTasks|numberOfAvailableTasks|numberOfCompletedTasks/,
    );
  });
});
