/**
 * OMN-361: test-mode sandbox guard gaps.
 *  1. Guard osascript spawned via execAsync OUTSIDE the runSerialized queue
 *     (Promise.all fan-out → up to N concurrent osascripts, the OMN-320 class).
 *  2. Ids were interpolated raw into nested template literals.
 *  3. update/task never checked the DESTINATION (changes.project /
 *     changes.parentTaskId); update/project never checked changes.folder, so a
 *     test could move a sandboxed item somewhere folder-scoped cleanup misses.
 *
 * Same harness as sandbox-guard-notfound.test.ts: osascript is mocked at
 * child_process.exec and each queued stdout is one bridge response, consumed
 * in call order. The sandbox-folder lookup is the first response.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import vm from 'node:vm';

const mockStdoutQueue: string[] = [];

vi.mock('child_process', () => ({
  exec: vi.fn((_cmd: string, cb: (err: unknown, out: { stdout: string }) => void) => {
    cb(null, { stdout: mockStdoutQueue.shift() ?? '{}' });
  }),
}));

const { runSerialized } = vi.hoisted(() => ({
  runSerialized: vi.fn(<T>(task: () => Promise<T>) => task()),
}));
vi.mock('../../../../src/omnifocus/osascript-queue.js', () => ({ runSerialized }));

import {
  clearSandboxCache,
  validateTaskInSandbox,
  buildProjectSandboxCheckScript,
  buildTaskSandboxCheckScript,
  buildFolderSandboxCheckScript,
  buildProjectRefSandboxCheckScript,
} from '../../../../src/contracts/ast/mutation-script-builder.js';
import { dispatchMutation } from '../../../../src/contracts/ast/mutation/defs.js';

const folder = () => JSON.stringify({ folderId: 'SBX' });
const inSbx = () => JSON.stringify({ inSandbox: true });
const outside = () => JSON.stringify({ inSandbox: false });
const notFound = () => JSON.stringify({ inSandbox: false, error: 'not_found' });

describe('sandbox guard (OMN-361)', () => {
  let priorGuard: string | undefined;
  let priorNodeEnv: string | undefined;

  beforeEach(() => {
    priorGuard = process.env.SANDBOX_GUARD_ENABLED;
    priorNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';
    process.env.SANDBOX_GUARD_ENABLED = 'true';
    mockStdoutQueue.length = 0;
    runSerialized.mockClear();
    clearSandboxCache();
  });

  afterEach(() => {
    if (priorGuard === undefined) delete process.env.SANDBOX_GUARD_ENABLED;
    else process.env.SANDBOX_GUARD_ENABLED = priorGuard;
    if (priorNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = priorNodeEnv;
  });

  describe('guard osascript is serialized', () => {
    it('every guard spawn goes through runSerialized', async () => {
      mockStdoutQueue.push(folder(), inSbx());
      await validateTaskInSandbox('t-1', 'update');
      expect(runSerialized).toHaveBeenCalledTimes(2); // folder lookup + task check
    });
  });

  describe('ids are JSON-quoted into the bridge program', () => {
    const nasty = 'x\'); return JSON.stringify({inSandbox:true}); //`${1}"';

    it.each([
      ['project', buildProjectSandboxCheckScript],
      ['task', buildTaskSandboxCheckScript],
      ['folder', buildFolderSandboxCheckScript],
      ['destination project', buildProjectRefSandboxCheckScript],
    ] as const)('%s check: the id appears only as a JSON string literal', (_label, build) => {
      const jxa = build(nasty, 'SBX');
      // The OmniJS program crosses the bridge as ONE JSON string literal…
      const m = /evaluateJavascript\(("(?:[^"\\]|\\.)*")\)/.exec(jxa);
      expect(m, jxa).not.toBeNull();
      const program = JSON.parse(m![1]) as string;
      // …and inside it the id is itself a JSON string literal.
      expect(program).toContain(JSON.stringify(nasty));
      // The raw injection text never appears unquoted.
      expect(program).not.toContain(`'${nasty}'`);
      // A syntax error here would fail EVERY guarded integration write closed.
      expect(() => new vm.Script(program)).not.toThrow();
    });
  });

  describe('update/task checks the move destination', () => {
    it('a live destination project throws', async () => {
      mockStdoutQueue.push(folder(), inSbx(), outside());
      await expect(
        dispatchMutation('update/task', { taskId: 'sbx-task', changes: { project: 'live-proj' } }),
      ).rejects.toThrow(/TEST GUARD/);
    });

    it('a not-found destination project throws (it resolves by name too, so fail closed)', async () => {
      mockStdoutQueue.push(folder(), inSbx(), notFound());
      await expect(
        dispatchMutation('update/task', { taskId: 'sbx-task', changes: { project: 'Live Project Name' } }),
      ).rejects.toThrow(/TEST GUARD/);
    });

    it('a sandboxed destination project passes', async () => {
      mockStdoutQueue.push(folder(), inSbx(), inSbx());
      await expect(
        dispatchMutation('update/task', { taskId: 'sbx-task', changes: { project: 'sbx-proj' } }),
      ).resolves.toBeDefined();
    });

    it('a live destination parent task throws', async () => {
      mockStdoutQueue.push(folder(), inSbx(), outside());
      await expect(
        dispatchMutation('update/task', { taskId: 'sbx-task', changes: { parentTaskId: 'live-parent' } }),
      ).rejects.toThrow(/TEST GUARD/);
    });

    it('a not-found destination parent passes through (strict byIdentifier writes nothing)', async () => {
      mockStdoutQueue.push(folder(), inSbx(), notFound());
      await expect(
        dispatchMutation('update/task', { taskId: 'sbx-task', changes: { parentTaskId: 'ghost' } }),
      ).resolves.toBeDefined();
    });
  });

  describe('update/project checks the destination folder', () => {
    it('a live destination folder throws', async () => {
      mockStdoutQueue.push(folder(), inSbx(), outside());
      await expect(
        dispatchMutation('update/project', { projectId: 'sbx-proj', changes: { folder: 'Work' } }),
      ).rejects.toThrow(/TEST GUARD/);
    });

    it('a not-found destination folder throws (flexible resolution, fail closed)', async () => {
      mockStdoutQueue.push(folder(), inSbx(), notFound());
      await expect(
        dispatchMutation('update/project', { projectId: 'sbx-proj', changes: { folder: 'Nowhere' } }),
      ).rejects.toThrow(/TEST GUARD/);
    });

    it('a sandbox subfolder passes', async () => {
      mockStdoutQueue.push(folder(), inSbx(), inSbx());
      await expect(
        dispatchMutation('update/project', { projectId: 'sbx-proj', changes: { folder: 'rt-subfolder' } }),
      ).resolves.toBeDefined();
    });

    it('the sandbox folder itself passes without a bridge lookup', async () => {
      mockStdoutQueue.push(folder(), inSbx());
      await expect(
        dispatchMutation('update/project', {
          projectId: 'sbx-proj',
          changes: { folder: '__MCP_TEST_SANDBOX__' },
        }),
      ).resolves.toBeDefined();
    });
  });
});
