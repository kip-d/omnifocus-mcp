import { describe, it, expect } from 'vitest';
import * as vm from 'node:vm';
import {
  buildListTasksScriptV4,
  buildTasksByIdsQueryScript,
  isInboxRoute,
} from '../../../../src/omnifocus/scripts/tasks.js';
import { TaskListMetadataSchema } from '../../../../src/omnifocus/response-schemas/read.js';

// OMN-330: the inbox route has one definition. buildListTasksScriptV4 dispatches on
// it, and OmniFocusReadTool uses it for route-dependent behavior (in-script sort).
describe('isInboxRoute', () => {
  it.each([
    ['inbox', {}, true],
    [undefined, { inInbox: true }, true],
    ['flagged', { inInbox: true }, true],
    ['flagged', {}, false],
    [undefined, {}, false],
    ['all', { inInbox: false }, false],
  ] as const)('mode %s with filter %j → %s', (mode, filter, expected) => {
    expect(isInboxRoute(mode, filter)).toBe(expected);
  });

  it('matches the script builder: inbox route ⇔ inbox script', () => {
    const cases = [
      { mode: 'flagged', filter: { inInbox: true, flagged: true } },
      { mode: undefined, filter: { flagged: true } },
      { mode: 'inbox', filter: {} },
    ];
    for (const { mode, filter } of cases) {
      const script = buildListTasksScriptV4({ filter, mode });
      expect(script.includes('inbox.forEach')).toBe(isInboxRoute(mode, filter));
    }
  });
});

// OMN-335 slice 3: smart_suggest phase 2 fetches full rows for the scored shortlist's
// ids via a dedicated multi-id script, wrapped in the SAME JXA + metadata envelope
// buildListTasksScriptV4 emits, so it validates against the identical TASK_LIST_SCHEMA
// (TaskListMetadataSchema) — no new response-schema layer needed for this path.
describe('buildTasksByIdsQueryScript', () => {
  function runWrapped(script: string, tasksById: Record<string, unknown>): unknown {
    const Task = { byIdentifier: (id: string) => tasksById[id] ?? null };
    const Application = () => ({
      evaluateJavascript: (inner: string) => vm.runInNewContext(inner, { Task, JSON }),
    });
    return vm.runInNewContext(script, { Application, JSON });
  }

  it('never iterates flattenedTasks and resolves via Task.byIdentifier', () => {
    const script = buildTasksByIdsQueryScript(['a', 'b']);
    expect(script).not.toContain('flattenedTasks');
    expect(script).toContain('Task.byIdentifier');
  });

  it('emits a metadata envelope that satisfies TaskListMetadataSchema (same schema as the ordinary list path)', () => {
    const script = buildTasksByIdsQueryScript(['a', 'b'], ['id', 'name']);
    const resultJson = runWrapped(script, {
      a: { id: { primaryKey: 'a' }, name: 'A' },
      b: { id: { primaryKey: 'b' }, name: 'B' },
    }) as string;
    const result = JSON.parse(resultJson);

    expect(result.tasks).toHaveLength(2);
    const parsed = TaskListMetadataSchema.safeParse(result.metadata);
    expect(parsed.success).toBe(true);
  });
});
