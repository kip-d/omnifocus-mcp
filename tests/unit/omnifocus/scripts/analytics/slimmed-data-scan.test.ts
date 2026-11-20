import { describe, it, expect } from 'vitest';
import vm from 'node:vm';
import { buildSlimmedDataScript } from '../../../../../src/omnifocus/scripts/analytics/slimmed-data-scan.js';

// Unwrap the JXA wrapper: the OmniJS program crosses the bridge as one JSON string literal.
function omniJsProgram(script: string): string {
  const m = script.match(/app\.evaluateJavascript\((".*")\);/s);
  expect(m).not.toBeNull();
  return JSON.parse(m![1]) as string;
}

describe('buildSlimmedDataScript', () => {
  it('interpolates the task cap and completed filter', () => {
    const program = omniJsProgram(buildSlimmedDataScript({ maxTasks: 0, includeCompleted: true }));
    expect(program).toContain('const maxTasks = 0;');
    expect(program).toContain('const includeCompleted = true;');
  });

  it('skips project root rows before both admission and the availability count, in the one shared walk (OMN-338, #312)', () => {
    const program = omniJsProgram(buildSlimmedDataScript({ maxTasks: 3000, includeCompleted: false }));
    const rootSkip = program.indexOf('if (task.project) continue;');
    const count = program.indexOf('availByProject[pid] = (availByProject[pid] || 0) + 1;');
    expect(rootSkip).toBeGreaterThan(-1);
    expect(count).toBeGreaterThan(rootSkip);
    // The second whole-database pass is gone: one walk feeds both consumers.
    expect(program).not.toContain('flattenedTasks.forEach');
  });

  it('splices the shared actionable-status and project-status definitions', () => {
    const program = omniJsProgram(buildSlimmedDataScript({ maxTasks: 3000, includeCompleted: false }));
    expect(program).toContain('const ACTIONABLE = [');
    expect(program).toContain('function projectStatusString(');
    expect(program).toContain('tasks: tasks,');
    expect(program).toContain('projects: projects,');
    expect(program).toContain('tags: tags,');
  });

  // OMN-340 (slice 3): the budget must apply to ADMITTED rows (not completed,
  // not dropped, not a project root), not to raw rows walked. Before this,
  // a run of terminal rows at the front of flattenedTasks could exhaust the
  // budget before a single live task was ever admitted.
  describe('scan budget counts admitted rows; coverage (OMN-340 slice 3)', () => {
    it('emits all three admission skips before the row is built, with the budget check after admission', () => {
      const program = omniJsProgram(buildSlimmedDataScript({ maxTasks: 3000, includeCompleted: false }));
      const loopStart = program.indexOf('for (let i = 0; i < allTasks.length; i++)');
      const rowBuilt = program.indexOf('const taskData = {');
      expect(loopStart).toBeGreaterThan(-1);
      const loopHead = program.slice(loopStart, rowBuilt);
      expect(loopHead).toContain('if (!includeCompleted && completed) continue;');
      expect(loopHead).toContain('if (task.project) continue;');
      expect(loopHead).toContain('const status = task.taskStatus;');
      expect(loopHead).toContain('if (!includeCompleted && status === Task.Status.Dropped) continue;');
      const admittedIdx = loopHead.indexOf('admittedTotal++;');
      const budgetIdx = loopHead.indexOf('if (tasks.length >= maxTasks) continue;');
      expect(admittedIdx).toBeGreaterThan(-1);
      expect(budgetIdx).toBeGreaterThan(admittedIdx);
    });

    const S = {
      Blocked: { s: 'Blocked' },
      Available: { s: 'Available' },
      Next: { s: 'Next' },
      DueSoon: { s: 'DueSoon' },
      Overdue: { s: 'Overdue' },
      Completed: { s: 'Completed' },
      Dropped: { s: 'Dropped' },
    };
    const proj = { id: { primaryKey: 'p1' }, name: 'Proj' };
    const mk = (id: string, taskStatus: object, extra: Record<string, unknown> = {}) => ({
      id: { primaryKey: id },
      name: id,
      completed: false,
      flagged: false,
      taskStatus,
      tags: [],
      containingProject: proj,
      project: null,
      note: '',
      children: [],
      ...extra,
    });
    const PS = { Active: {}, OnHold: {}, Done: {}, Dropped: {} };
    const sandbox = (flattenedTasks: unknown[], flattenedProjects: unknown[] = []) => ({
      Task: { Status: S },
      Project: { Status: PS },
      flattenedTasks,
      flattenedProjects,
      flattenedTags: [],
    });
    const run = (program: string, flattenedTasks: unknown[], flattenedProjects: unknown[] = []) =>
      JSON.parse(vm.runInNewContext(program, sandbox(flattenedTasks, flattenedProjects)) as string);

    // The scan's admission invariant with include_completed false: a root,
    // dropped, OR completed row never reaches `tasks`. The detectors that need
    // live tasks keep their own isLiveTask guard for include_completed true,
    // which this admission does not filter (#312 review).
    it('ships only the live non-root, non-terminal task', () => {
      const program = omniJsProgram(buildSlimmedDataScript({ maxTasks: 3000, includeCompleted: false }));
      const out = run(program, [
        mk('root', S.Available, { project: proj }),
        mk('dropped', S.Dropped),
        mk('completed', S.Completed, { completed: true }),
        mk('live', S.Available),
      ]);
      expect(out.tasks.map((t: { id: string }) => t.id)).toEqual(['live']);
      expect(out.scanMeta).toEqual({ scannedTotal: 4, admittedTotal: 1, unreadableTotal: 0, cap: 3000 });
    });

    it('3000+ terminal rows followed by live rows: the live rows are still analyzed (budget counts ADMITTED rows)', () => {
      const program = omniJsProgram(buildSlimmedDataScript({ maxTasks: 3000, includeCompleted: false }));
      const terminal = Array.from({ length: 3005 }, (_, i) => mk(`done-${i}`, S.Completed, { completed: true }));
      const live = Array.from({ length: 5 }, (_, i) => mk(`live-${i}`, S.Available));
      const out = run(program, [...terminal, ...live]);
      // Pre-OMN-340, the raw walk stopped at the first 3000 rows (all
      // terminal here), so NONE of the live rows would ever be seen.
      expect(out.tasks.map((t: { id: string }) => t.id)).toEqual(live.map((_, i) => `live-${i}`));
      expect(out.scanMeta).toEqual({ scannedTotal: 3010, admittedTotal: 5, unreadableTotal: 0, cap: 3000 });
    });

    it('capped: admitted population exceeds the budget — scanMeta.admittedTotal is the TRUE admissible count, not the capped detail length', () => {
      const program = omniJsProgram(buildSlimmedDataScript({ maxTasks: 3000, includeCompleted: false }));
      const live = Array.from({ length: 3010 }, (_, i) => mk(`live-${i}`, S.Available));
      const out = run(program, live);
      expect(out.tasks.length).toBe(3000);
      // The walk keeps counting admitted rows past the budget (cheap:
      // admission-only, no row built) so admittedTotal is the true population.
      expect(out.scanMeta).toEqual({ scannedTotal: 3010, admittedTotal: 3010, unreadableTotal: 0, cap: 3000 });
    });

    it('uncapped: admitted population under the budget — scannedTotal/admittedTotal/tasks.length agree', () => {
      const program = omniJsProgram(buildSlimmedDataScript({ maxTasks: 3000, includeCompleted: false }));
      const live = Array.from({ length: 50 }, (_, i) => mk(`live-${i}`, S.Available));
      const out = run(program, live);
      expect(out.tasks.length).toBe(50);
      expect(out.scanMeta).toEqual({ scannedTotal: 50, admittedTotal: 50, unreadableTotal: 0, cap: 3000 });
    });

    // #312 gate finding: the walk covers the whole database, so taskStatus —
    // the costliest read, which OmniFocus may compute rather than store — is
    // read once per row and shared by admission, the built row and the
    // availability count, never per consumer. A completed row is decided by
    // the stored boolean alone and pays no taskStatus read; a root row is
    // skipped before the read.
    it('reads taskStatus at most once per row, and never on a completed or root row', () => {
      const program = omniJsProgram(buildSlimmedDataScript({ maxTasks: 1, includeCompleted: false }));
      const reads: Record<string, number> = {};
      const counted = (id: string, taskStatus: object, extra: Record<string, unknown> = {}) => {
        const t = mk(id, taskStatus, extra);
        reads[id] = 0;
        Object.defineProperty(t, 'taskStatus', {
          get: () => {
            reads[id]++;
            return taskStatus;
          },
        });
        return t;
      };
      run(program, [
        counted('live', S.Available),
        counted('pastBudget', S.Available),
        counted('dropped', S.Dropped),
        counted('completed', S.Completed, { completed: true }),
        counted('root', S.Available, { project: proj }),
      ]);
      expect(reads).toEqual({ live: 1, pastBudget: 1, dropped: 1, completed: 0, root: 0 });
    });

    it('availableTaskCount counts every actionable non-root task, including rows past the detail budget', () => {
      const program = omniJsProgram(buildSlimmedDataScript({ maxTasks: 1, includeCompleted: false }));
      const project = { id: { primaryKey: 'p1' }, name: 'Proj', status: PS.Active, task: null };
      const out = run(
        program,
        [
          mk('a1', S.Available),
          mk('a2', S.Next),
          mk('a3', S.DueSoon),
          mk('blocked', S.Blocked),
          mk('dropped', S.Dropped),
          mk('completed', S.Completed, { completed: true }),
          mk('root', S.Available, { project: proj }),
        ],
        [project],
      );
      expect(out.tasks.length).toBe(1);
      expect(out.projects).toHaveLength(1);
      expect(out.projects[0].availableTaskCount).toBe(3);
    });

    // #312 review round 2: a row that throws is never silently counted as
    // admitted. A throw during admission or row build moves the row to
    // unreadableTotal, so an uncapped scan always has admittedTotal ===
    // tasks.length and the loss is disclosed, not hidden.
    it('a row that throws while its row is built is unreadable, not admitted', () => {
      const program = omniJsProgram(buildSlimmedDataScript({ maxTasks: 3000, includeCompleted: false }));
      const bad = mk('bad', S.Available);
      Object.defineProperty(bad, 'name', {
        get: () => {
          throw new Error('unreadable name');
        },
      });
      const out = run(program, [mk('a', S.Available), bad, mk('b', S.Available)]);
      expect(out.tasks.map((t: { id: string }) => t.id)).toEqual(['a', 'b']);
      expect(out.scanMeta).toEqual({ scannedTotal: 3, admittedTotal: 2, unreadableTotal: 1, cap: 3000 });
    });

    it('a row that throws during admission is unreadable too', () => {
      const program = omniJsProgram(buildSlimmedDataScript({ maxTasks: 3000, includeCompleted: false }));
      const bad = mk('bad', S.Available);
      Object.defineProperty(bad, 'taskStatus', {
        get: () => {
          throw new Error('unreadable status');
        },
      });
      const out = run(program, [bad, mk('a', S.Available)]);
      expect(out.tasks.map((t: { id: string }) => t.id)).toEqual(['a']);
      expect(out.scanMeta).toEqual({ scannedTotal: 2, admittedTotal: 1, unreadableTotal: 1, cap: 3000 });
    });

    it('a smaller maxTasks budget caps tasks.length at that value, not at 3000', () => {
      const program = omniJsProgram(buildSlimmedDataScript({ maxTasks: 2, includeCompleted: false }));
      const live = Array.from({ length: 5 }, (_, i) => mk(`live-${i}`, S.Available));
      const out = run(program, live);
      expect(out.tasks.length).toBe(2);
      expect(out.scanMeta).toEqual({ scannedTotal: 5, admittedTotal: 5, unreadableTotal: 0, cap: 2 });
    });
  });
});
