// tests/unit/contracts/ast/mutation/complete.test.ts
// OMN-128 slice 5 — golden + vm-execution tests for the complete lowerings.
import vm from 'node:vm';
import { describe, it, expect, beforeEach, vi } from 'vitest';

// OMN-286 guard-boundary mock: the "OMN-119/120 non-bypass" describe blocks
// below exercise validateTaskInSandbox/validateProjectInSandbox, which shell
// out to osascript. Unmocked, those tests are only deterministic on macOS
// with OmniFocus running; on CI (ubuntu-latest, no osascript binary) the
// call throws ENOENT and the guard fails CLOSED regardless of which case is
// under test. Mocking child_process.exec makes the not-found/outside-sandbox
// distinction deterministic everywhere (same pattern as
// sandbox-guard-notfound.test.ts / sandbox-guard-task-notfound.test.ts).
const mockStdoutQueue: string[] = [];
vi.mock('child_process', () => ({
  exec: vi.fn((_cmd: string, cb: (err: unknown, out: { stdout: string }) => void) => {
    cb(null, { stdout: mockStdoutQueue.shift() ?? '{}' });
  }),
}));

import {
  buildCompleteTaskProgram,
  buildCompleteProjectProgram,
  dispatchMutation,
  validateMutationProgram,
  emitProgram,
} from '../../../../../src/contracts/ast/mutation/index.js';
import { clearSandboxCache } from '../../../../../src/contracts/ast/mutation-script-builder.js';
import { CompleteResultSchema } from '../../../../../src/omnifocus/script-response-schemas.js';
import { expectMatchesSchema } from './assert-schema.js';

beforeEach(() => {
  mockStdoutQueue.length = 0;
  // OMN-286: reset the sandbox-folder-id/validated-id caches so each guard
  // test below pushes its OWN complete response sequence instead of relying
  // on cross-test ordering (fragile under -t / .only — see the comment on
  // sandbox-guard-notfound.test.ts).
  clearSandboxCache();
});

describe('buildCompleteTaskProgram — golden emission', () => {
  it('emits resolve, guard, markComplete, read-back envelope — nothing else', () => {
    const program = buildCompleteTaskProgram({ taskId: 't1' });
    expect(() => validateMutationProgram(program)).not.toThrow();
    expect(program.statements.map((s) => s.type)).toEqual(['resolveTask', 'guard', 'callMethod', 'return']);
    expect(program.context).toBe('complete_task');

    const omnijs = emitProgram(program);
    expect(omnijs).toContain('const task = Task.byIdentifier("t1") || null;');
    expect(omnijs).toContain(
      'if (task === null) return JSON.stringify({ error: true, message: "Task not found: t1", context: "complete_task" });',
    );
    expect(omnijs).toContain('task.markComplete();'); // no completionDate → bare call ("now"), spec §3
    expect(omnijs).toContain('task.completionDate ? task.completionDate.toISOString() : null'); // live read-back
    expect(omnijs).not.toContain('_warnings.push'); // §2.4: no best-effort steps
  });

  it('lowers completionDate to a markComplete Date argument', () => {
    const omnijs = emitProgram(buildCompleteTaskProgram({ taskId: 't1', completionDate: '2026-06-10T16:00:00.000Z' }));
    expect(omnijs).toContain('task.markComplete(new Date("2026-06-10T16:00:00.000Z"));');
  });
});

describe('buildCompleteProjectProgram — golden emission', () => {
  it('resolves strictly by id with the entity-named guard message (§2.2 delta from bare "Not found")', () => {
    const program = buildCompleteProjectProgram({ projectId: 'p1' });
    expect(() => validateMutationProgram(program)).not.toThrow();
    const omnijs = emitProgram(program);
    expect(omnijs).toContain('const proj = Project.byIdentifier("p1") || null;');
    expect(omnijs).toContain('"Project not found: p1"');
    expect(omnijs).toContain('proj.markComplete();');
    expect(omnijs).toContain('projectId: proj.id.primaryKey'); // §2.3: live ids
    expect(omnijs).not.toContain('success'); // §2.3: no success key anywhere
  });
});

// The OMN-119/120 non-bypass property for the complete family: dispatch runs the
// sandbox guard BEFORE building (mirrors update-task.test.ts's guard describe).
describe('dispatchMutation complete/task guard (OMN-119/120 non-bypass)', () => {
  it('passes a not-found task id through the guard; build succeeds with the script-level not-found check (OMN-286)', async () => {
    const prev = { NODE_ENV: process.env.NODE_ENV, SG: process.env.SANDBOX_GUARD_ENABLED };
    process.env.NODE_ENV = 'test';
    process.env.SANDBOX_GUARD_ENABLED = 'true';
    try {
      // OMN-286: the guard no longer aborts on not-found — it passes
      // through to the script's own strict-byIdentifier handling (live-
      // verified in mark-reviewed-batch-live.test.ts). Guard-before-build
      // for a FOUND-but-outside-sandbox id is covered by
      // sandbox-guard-task-notfound.test.ts's mocked "still throws" case.
      // First guard call also resolves (and caches) the sandbox folder id.
      mockStdoutQueue.push(JSON.stringify({ folderId: 'SBX-FOLDER' }));
      mockStdoutQueue.push(JSON.stringify({ inSandbox: false, error: 'not_found' }));
      const program = await dispatchMutation('complete/task', { taskId: 'not-a-sandbox-task-id' });
      expect(emitProgram(program)).toContain('Task not found: not-a-sandbox-task-id');
    } finally {
      process.env.NODE_ENV = prev.NODE_ENV;
      process.env.SANDBOX_GUARD_ENABLED = prev.SG;
    }
  });
});

describe('dispatchMutation complete/project guard (OMN-119/120 non-bypass)', () => {
  it('rejects a non-sandbox project id when the sandbox guard is enabled', async () => {
    const prev = { NODE_ENV: process.env.NODE_ENV, SG: process.env.SANDBOX_GUARD_ENABLED };
    process.env.NODE_ENV = 'test';
    process.env.SANDBOX_GUARD_ENABLED = 'true';
    try {
      mockStdoutQueue.push(JSON.stringify({ folderId: 'SBX-FOLDER' }));
      mockStdoutQueue.push(JSON.stringify({ inSandbox: false }));
      await expect(dispatchMutation('complete/project', { projectId: 'not-a-sandbox-project-id' })).rejects.toThrow(
        /TEST GUARD/,
      );
    } finally {
      process.env.NODE_ENV = prev.NODE_ENV;
      process.env.SANDBOX_GUARD_ENABLED = prev.SG;
    }
  });
});

describe('emitted complete programs execute (vm)', () => {
  function makeSandbox(found: boolean) {
    const calls: unknown[][] = [];
    const completionDate = new Date('2026-06-10T16:00:00.000Z');
    const task = {
      id: { primaryKey: 't1' },
      name: 'Fixture',
      completionDate,
      markComplete: (...args: unknown[]) => calls.push(args),
    };
    return {
      calls,
      sandbox: { Task: { byIdentifier: () => (found ? task : null) }, JSON },
    };
  }

  it('returns the read-back envelope on success', () => {
    const { sandbox, calls } = makeSandbox(true);
    const program = emitProgram(buildCompleteTaskProgram({ taskId: 't1' }));
    const parsed = JSON.parse(vm.runInNewContext(program, sandbox) as string);
    expectMatchesSchema(CompleteResultSchema, parsed);
    expect(parsed).toEqual({
      taskId: 't1',
      name: 'Fixture',
      completed: true,
      completionDate: '2026-06-10T16:00:00.000Z',
    });
    expect(calls).toHaveLength(1);
  });

  it('not-found returns the typed error envelope with ZERO mutations', () => {
    const { sandbox, calls } = makeSandbox(false);
    const program = emitProgram(buildCompleteTaskProgram({ taskId: 'missing' }));
    const parsed = JSON.parse(vm.runInNewContext(program, sandbox) as string);
    expect(parsed).toEqual({ error: true, message: 'Task not found: missing', context: 'complete_task' });
    expect(calls).toHaveLength(0);
  });
});
