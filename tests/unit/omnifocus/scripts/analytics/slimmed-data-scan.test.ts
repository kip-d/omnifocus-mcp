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

  it('skips project root rows in both the admission loop and the availability pass (OMN-338)', () => {
    const program = omniJsProgram(buildSlimmedDataScript({ maxTasks: 3000, includeCompleted: false }));
    expect(program).toContain('if (task.project) continue;');
    expect(program).toContain('if (t.project) return;');
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
      expect(loopHead).toContain('if (!includeCompleted && task.taskStatus === Task.Status.Dropped) continue;');
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
    const sandbox = (flattenedTasks: unknown[]) => ({
      Task: { Status: S },
      Project: { Status: { Active: {}, OnHold: {}, Done: {}, Dropped: {} } },
      flattenedTasks,
      flattenedProjects: [],
      flattenedTags: [],
    });
    const run = (program: string, flattenedTasks: unknown[]) =>
      JSON.parse(vm.runInNewContext(program, sandbox(flattenedTasks)) as string);

    // OMN-340 (slice 3): collapses the per-detector terminal-state guards
    // (isLiveTask in OmniFocusAnalyzeTool's detectOnholdReactivation /
    // detectSequentialBlockedFar) into this one scan admission — this is the
    // invariant's real pin: a root, dropped, OR completed row never reaches
    // `tasks`, i.e. never reaches any detector's input.
    it('ships only the live non-root, non-terminal task', () => {
      const program = omniJsProgram(buildSlimmedDataScript({ maxTasks: 3000, includeCompleted: false }));
      const out = run(program, [
        mk('root', S.Available, { project: proj }),
        mk('dropped', S.Dropped),
        mk('completed', S.Completed, { completed: true }),
        mk('live', S.Available),
      ]);
      expect(out.tasks.map((t: { id: string }) => t.id)).toEqual(['live']);
      expect(out.scanMeta).toEqual({ scannedTotal: 4, admittedTotal: 1, cap: 3000 });
    });

    it('3000+ terminal rows followed by live rows: the live rows are still analyzed (budget counts ADMITTED rows)', () => {
      const program = omniJsProgram(buildSlimmedDataScript({ maxTasks: 3000, includeCompleted: false }));
      const terminal = Array.from({ length: 3005 }, (_, i) => mk(`done-${i}`, S.Completed, { completed: true }));
      const live = Array.from({ length: 5 }, (_, i) => mk(`live-${i}`, S.Available));
      const out = run(program, [...terminal, ...live]);
      // Pre-OMN-340, the raw walk stopped at the first 3000 rows (all
      // terminal here), so NONE of the live rows would ever be seen.
      expect(out.tasks.map((t: { id: string }) => t.id)).toEqual(live.map((_, i) => `live-${i}`));
      expect(out.scanMeta).toEqual({ scannedTotal: 3010, admittedTotal: 5, cap: 3000 });
    });

    it('capped: admitted population exceeds the budget — scanMeta.admittedTotal is the TRUE admissible count, not the capped detail length', () => {
      const program = omniJsProgram(buildSlimmedDataScript({ maxTasks: 3000, includeCompleted: false }));
      const live = Array.from({ length: 3010 }, (_, i) => mk(`live-${i}`, S.Available));
      const out = run(program, live);
      expect(out.tasks.length).toBe(3000);
      // The walk keeps counting admitted rows past the budget (cheap:
      // admission-only, no row built) so admittedTotal is the true population.
      expect(out.scanMeta).toEqual({ scannedTotal: 3010, admittedTotal: 3010, cap: 3000 });
    });

    it('uncapped: admitted population under the budget — scannedTotal/admittedTotal/tasks.length agree', () => {
      const program = omniJsProgram(buildSlimmedDataScript({ maxTasks: 3000, includeCompleted: false }));
      const live = Array.from({ length: 50 }, (_, i) => mk(`live-${i}`, S.Available));
      const out = run(program, live);
      expect(out.tasks.length).toBe(50);
      expect(out.scanMeta).toEqual({ scannedTotal: 50, admittedTotal: 50, cap: 3000 });
    });

    it('a smaller maxTasks budget caps tasks.length at that value, not at 3000', () => {
      const program = omniJsProgram(buildSlimmedDataScript({ maxTasks: 2, includeCompleted: false }));
      const live = Array.from({ length: 5 }, (_, i) => mk(`live-${i}`, S.Available));
      const out = run(program, live);
      expect(out.tasks.length).toBe(2);
      expect(out.scanMeta).toEqual({ scannedTotal: 5, admittedTotal: 5, cap: 2 });
    });
  });
});
