import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';
import { OmniAutomation, OmniAutomationError } from '../../../src/omnifocus/OmniAutomation.js';
import {
  SCRIPT_ERROR_CONTEXT,
  type ScriptError,
  type ScriptResult,
} from '../../../src/omnifocus/script-result-types.js';
import { TagMutationResultSchema, CompleteResultSchema } from '../../../src/omnifocus/script-response-schemas.js';
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';

// Mock child_process spawn
vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}));

describe('OmniAutomation', () => {
  let omniAutomation: OmniAutomation;
  let mockProcess: any;

  beforeEach(() => {
    // Create a mock process that extends EventEmitter
    mockProcess = Object.assign(new EventEmitter(), {
      stdin: {
        write: vi.fn(),
        end: vi.fn(),
      },
      stdout: new EventEmitter(),
      stderr: new EventEmitter(),
    });

    // Set up spawn mock to return our mock process
    vi.mocked(spawn).mockReturnValue(mockProcess as any);

    // Create instance with reasonable test timeouts
    omniAutomation = new OmniAutomation(100000, 1000);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should use default values when no parameters provided', () => {
      const instance = new OmniAutomation();
      expect(instance).toBeDefined();
    });

    it('should respect constructor parameters', () => {
      const instance = new OmniAutomation(50000, 5000);
      expect(instance).toBeDefined();
    });

    it('should respect environment variables', () => {
      process.env.OMNIFOCUS_MAX_SCRIPT_SIZE = '200000';
      process.env.OMNIFOCUS_SCRIPT_TIMEOUT = '180000';

      const instance = new OmniAutomation();
      expect(instance).toBeDefined();

      // Clean up
      delete process.env.OMNIFOCUS_MAX_SCRIPT_SIZE;
      delete process.env.OMNIFOCUS_SCRIPT_TIMEOUT;
    });
  });

  describe('execute', () => {
    it('should reject scripts that are too large', async () => {
      const hugeScript = 'x'.repeat(100001);

      await expect(omniAutomation.execute(hugeScript)).rejects.toThrow(/Script too large: \d+KB \(limit: \d+KB\)/);
    });

    it('should execute a simple script successfully', async () => {
      const script = 'JSON.stringify({ result: "success" })';
      const expectedResult = { result: 'success' };

      // Simulate successful execution
      const executePromise = omniAutomation.execute(script);

      // Wait for spawn to be called
      await new Promise((resolve) => setImmediate(resolve));

      // Simulate stdout data
      mockProcess.stdout.emit('data', JSON.stringify(expectedResult));

      // Simulate process close
      mockProcess.emit('close', 0);

      const result = await executePromise;
      expect(result).toEqual(expectedResult);
    });

    it('should handle script execution errors', async () => {
      const script = 'throw new Error("Test error")';

      const executePromise = omniAutomation.execute(script);

      // Wait for spawn to be called
      await new Promise((resolve) => setImmediate(resolve));

      // Simulate stderr data
      mockProcess.stderr.emit('data', 'Error: Test error');

      // Simulate process close with error code
      mockProcess.emit('close', 1);

      await expect(executePromise).rejects.toThrow(OmniAutomationError);
    });

    it('should handle empty output as null', async () => {
      const script = 'return undefined';

      const executePromise = omniAutomation.execute(script);

      // Wait for spawn to be called
      await new Promise((resolve) => setImmediate(resolve));

      // Simulate empty stdout
      mockProcess.stdout.emit('data', '');

      // Simulate process close
      mockProcess.emit('close', 0);

      const result = await executePromise;
      expect(result).toBeNull();
    });

    it('should handle JSON parse errors with raw string fallback', async () => {
      const script = 'return "simple string"';

      const executePromise = omniAutomation.execute(script);

      // Wait for spawn to be called
      await new Promise((resolve) => setImmediate(resolve));

      // Simulate non-JSON output
      mockProcess.stdout.emit('data', 'simple string');

      // Simulate process close
      mockProcess.emit('close', 0);

      const result = await executePromise;
      expect(result).toBe('simple string');
    });

    it('should handle malformed JSON as error', async () => {
      const script = 'return { broken: json }';

      const executePromise = omniAutomation.execute(script);

      // Wait for spawn to be called
      await new Promise((resolve) => setImmediate(resolve));

      // Simulate malformed JSON output
      mockProcess.stdout.emit('data', '{ broken: json');

      // Simulate process close
      mockProcess.emit('close', 0);

      await expect(executePromise).rejects.toThrow('Invalid JSON response from script');
    });

    it('should handle process spawn errors', async () => {
      const script = 'JSON.stringify({ result: "success" })';

      const executePromise = omniAutomation.execute(script);

      // Wait for spawn to be called
      await new Promise((resolve) => setImmediate(resolve));

      // Simulate process error
      mockProcess.emit('error', new Error('Spawn failed'));

      await expect(executePromise).rejects.toThrow('Failed to execute script');
    });

    it('should wrap scripts without IIFE structure', async () => {
      const script = 'JSON.stringify({ test: true })';

      omniAutomation.execute(script);

      // Wait for spawn to be called
      await new Promise((resolve) => setImmediate(resolve));

      // Check that the script was wrapped
      expect(mockProcess.stdin.write).toHaveBeenCalledWith(expect.stringContaining('(() => {'));
      expect(mockProcess.stdin.write).toHaveBeenCalledWith(expect.stringContaining("Application('OmniFocus')"));
    });

    it('should not double-wrap scripts with existing IIFE and app init', async () => {
      const script = `(() => {
        const app = Application('OmniFocus');
        return JSON.stringify({ test: true });
      })()`;

      omniAutomation.execute(script);

      // Wait for spawn to be called
      await new Promise((resolve) => setImmediate(resolve));

      // Check that the script was NOT wrapped again
      expect(mockProcess.stdin.write).toHaveBeenCalledWith(script);
    });
  });

  describe('buildScript', () => {
    it('should replace placeholders with values', () => {
      const template = 'const name = {{name}}; const age = {{age}};';
      const params = { name: 'John', age: 30 };

      const result = omniAutomation.buildScript(template, params);

      expect(result).toBe('const name = "John"; const age = 30;');
    });

    it('should handle null and undefined values', () => {
      const template = 'const val1 = {{val1}}; const val2 = {{val2}};';
      const params = { val1: null, val2: undefined };

      const result = omniAutomation.buildScript(template, params);

      expect(result).toBe('const val1 = null; const val2 = null;');
    });

    it('should handle arrays', () => {
      const template = 'const tags = {{tags}};';
      const params = { tags: ['work', 'urgent'] };

      const result = omniAutomation.buildScript(template, params);

      expect(result).toBe('const tags = ["work", "urgent"];');
    });

    it('should handle dates', () => {
      const date = new Date('2024-01-15T10:00:00Z');
      const template = 'const dueDate = {{dueDate}};';
      const params = { dueDate: date };

      const result = omniAutomation.buildScript(template, params);

      expect(result).toBe('const dueDate = new Date("2024-01-15T10:00:00.000Z");');
    });

    it('should handle booleans', () => {
      const template = 'const flagged = {{flagged}}; const completed = {{completed}};';
      const params = { flagged: true, completed: false };

      const result = omniAutomation.buildScript(template, params);

      expect(result).toBe('const flagged = true; const completed = false;');
    });

    it('should handle nested objects', () => {
      const template = 'const options = {{options}};';
      const params = {
        options: {
          limit: 10,
          includeCompleted: false,
          tags: ['home', 'work'],
        },
      };

      const result = omniAutomation.buildScript(template, params);

      expect(result).toContain('"limit": 10');
      expect(result).toContain('"includeCompleted": false');
      expect(result).toContain('"tags": ["home", "work"]');
    });

    it('should escape special characters in strings', () => {
      const template = 'const note = {{note}};';
      const params = { note: 'This is a "test" with \'quotes\' and\nnewlines' };

      const result = omniAutomation.buildScript(template, params);

      expect(result).toBe('const note = "This is a \\"test\\" with \'quotes\' and\\nnewlines";');
    });

    it('should handle empty params', () => {
      const template = 'const x = 1;';

      const result = omniAutomation.buildScript(template);

      expect(result).toBe('const x = 1;');
    });

    it('should handle multiple occurrences of same placeholder', () => {
      const template = 'const x = {{value}}; const y = {{value}}; const z = {{value}};';
      const params = { value: 42 };

      const result = omniAutomation.buildScript(template, params);

      expect(result).toBe('const x = 42; const y = 42; const z = 42;');
    });

    it('should handle objects with undefined values', () => {
      const template = 'const options = {{options}};';
      const params = {
        options: {
          limit: 10,
          name: undefined,
          active: true,
        },
      };

      const result = omniAutomation.buildScript(template, params);

      // undefined values should be filtered out
      expect(result).not.toContain('name');
      expect(result).toContain('"limit": 10');
      expect(result).toContain('"active": true');
    });
  });

  describe('error handling', () => {
    it('should create OmniAutomationError with script and stderr', () => {
      const error = new OmniAutomationError('Test error', { script: 'test script', stderr: 'stderr output' });

      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('OmniAutomationError');
      expect(error.message).toBe('Test error');
      expect(error.details?.script).toBe('test script');
      expect(error.details?.stderr).toBe('stderr output');
    });

    it('should handle timeout properly', async () => {
      // Create instance with very short timeout
      const quickTimeout = new OmniAutomation(100000, 100);
      const script = 'delay(10)';

      const executePromise = quickTimeout.execute(script);

      // The timeout is handled by spawn's timeout option
      // which should kill the process
      await new Promise((resolve) => setImmediate(resolve));

      // Simulate timeout by closing with non-zero code
      mockProcess.stderr.emit('data', 'Script timeout');
      mockProcess.emit('close', 143); // SIGTERM exit code

      await expect(executePromise).rejects.toThrow('Script execution failed with code 143');
    });
  });

  // Helper: drive a JSON payload through the mock process stdout and return the executeJson result
  async function emitJsonOutput(output: string, schema: z.ZodSchema<any>): Promise<any> {
    const script = 'test script';
    const resultPromise = omniAutomation.executeJson(script, schema);
    await new Promise((resolve) => setImmediate(resolve));
    mockProcess.stdout.emit('data', output);
    mockProcess.emit('close', 0);
    return resultPromise;
  }

  describe('executeJson detection (OMN-139)', () => {
    const tasksSchema = z.object({ tasks: z.array(z.unknown()) }).strict();

    // The global setup-unit.ts mocks OmniAutomation.prototype.executeJson to prevent real
    // JXA execution in all other unit tests — but ONLY when VITEST_ALLOW_JXA !== '1'.
    // Restore the prototype spy here so we can drive the actual implementation through
    // the mock spawn harness, then re-apply the mock so other describe blocks are
    // unaffected. Both hooks are guarded so that in VITEST_ALLOW_JXA=1 mode (no spy
    // installed) we neither throw on mockRestore nor install a stub setup never wanted.
    const defaultMockImpl = vi.fn(
      async (_script: string, _schema?: unknown): Promise<ScriptResult<unknown>> => ({
        success: true as const,
        data: {},
      }),
    );
    let restoredPrototypeSpy = false;
    beforeEach(() => {
      restoredPrototypeSpy = false;
      if (vi.isMockFunction(OmniAutomation.prototype.executeJson)) {
        vi.mocked(OmniAutomation.prototype.executeJson).mockRestore();
        restoredPrototypeSpy = true;
      }
    });
    afterEach(() => {
      if (restoredPrototypeSpy) {
        vi.spyOn(OmniAutomation.prototype, 'executeJson').mockImplementation(defaultMockImpl);
      }
    });

    // 1. Ticket required case: unrecognised shape (not an error dialect, not a valid success payload)
    //    → fail-closed with 'Unrecognized script output shape' context, raw output in details
    it('fails closed with Unrecognized shape context when output does not match schema', async () => {
      const raw = JSON.stringify({ failure: { code: 9, reason: 'new shape' } });
      const result = await emitJsonOutput(raw, tasksSchema);

      expect(result.success).toBe(false);
      expect(result.context).toBe('Unrecognized script output shape');
      // raw text (including 'new shape') must appear somewhere in details
      const detailsStr = JSON.stringify(result.details);
      expect(detailsStr).toContain('new shape');
    });

    // 2. Live-hole regression: {ok: false, error: {message}, v} → detected as modern envelope error
    it('detects modern envelope error {ok: false} before schema validation', async () => {
      const raw = JSON.stringify({ ok: false, error: { message: 'x' }, v: '3' });
      const result = await emitJsonOutput(raw, tasksSchema);

      expect(result.success).toBe(false);
      expect(result.error).toBe('x');
    });

    // 3. Context canonicalization: {success: false, context, message} → SCRIPT_REPORTED;
    //    script's own context field moves to details.scriptContext (OMN-159).
    it('canonicalizes context to SCRIPT_REPORTED and moves script context to details for success:false dialect', async () => {
      const raw = JSON.stringify({ success: false, context: 'projects_for_review', message: 'm' });
      const result = await emitJsonOutput(raw, tasksSchema);

      expect(result.success).toBe(false);
      expect(result.error).toBe('m');
      // Emitted context is now the canonical string
      expect(result.context).toBe(SCRIPT_ERROR_CONTEXT.SCRIPT_REPORTED);
      // Script's original context is preserved in details
      expect((result.details as Record<string, unknown>)?.scriptContext).toBe('projects_for_review');
    });

    // 4. Valid payload: output matches schema → success:true, data equals payload
    it('returns success:true with data when output matches schema', async () => {
      const payload = { tasks: [] };
      const raw = JSON.stringify(payload);
      const result = await emitJsonOutput(raw, tasksSchema);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(payload);
    });

    // 5. Bare string closed: non-JSON string + object schema → success:false
    //    (executeInternal resolves non-JSON strings as the raw string; object schema rejects string)
    it('fails closed when output is a bare non-JSON string with an object schema', async () => {
      const script = 'test script';
      const resultPromise = omniAutomation.executeJson(script, tasksSchema);
      await new Promise((resolve) => setImmediate(resolve));
      // Non-JSON output without braces/brackets resolves as a raw string
      mockProcess.stdout.emit('data', 'Error: AppleEvent timed out');
      mockProcess.emit('close', 0);
      const result = await resultPromise;

      expect(result.success).toBe(false);
    });

    // 6. Null closed: empty output resolves to null; object schema rejects null → success:false
    it('fails closed when output is empty (null) with an object schema', async () => {
      const script = 'test script';
      const resultPromise = omniAutomation.executeJson(script, tasksSchema);
      await new Promise((resolve) => setImmediate(resolve));
      mockProcess.stdout.emit('data', '');
      mockProcess.emit('close', 0);
      const result = await resultPromise;

      expect(result.success).toBe(false);
    });

    // 7. Legacy error dialect: {error: true, message: '...'} → success:false, error text preserved,
    //    context is canonical SCRIPT_REPORTED (OMN-159: 'Legacy script error' retired).
    it('detects legacy {error: true, message} dialect with a schema → success:false, canonical SCRIPT_REPORTED context', async () => {
      const raw = JSON.stringify({ error: true, message: 'boom' });
      const result = await emitJsonOutput(raw, tasksSchema);

      expect(result.success).toBe(false);
      expect(result.error).toBe('boom');
      expect(result.context).toBe(SCRIPT_ERROR_CONTEXT.SCRIPT_REPORTED);
    });

    // 8. Kill-test for OMN-159 headline rename: when execute() throws OmniAutomationError,
    //    executeJson() RETURNS (does not rethrow) a ScriptError with EXECUTION_ERROR context.
    //    ('OmniAutomation execution error' was the old name; 'Script execution error' is the new canonical form.)
    it('returns EXECUTION_ERROR context when execute() throws OmniAutomationError (kill-test for OMN-159 rename)', async () => {
      // Override execute to throw an OmniAutomationError — tests the catch branch of executeJson
      vi.spyOn(omniAutomation, 'execute').mockRejectedValue(
        new OmniAutomationError('osascript failed', { script: 'test', stderr: 'err output' }),
      );

      const result = await omniAutomation.executeJson('test script', tasksSchema);

      expect(result.success).toBe(false);
      const errResult = result as ScriptError;
      expect(errResult.context).toBe(SCRIPT_ERROR_CONTEXT.EXECUTION_ERROR);
      // error message comes from the OmniAutomationError
      expect(errResult.error).toBe('osascript failed');
    });
  });

  describe('executeJson unionErrors slimming (OMN-158 rider 2)', () => {
    // Uses the same beforeEach/afterEach spy restoration as the detection suite above,
    // but we need a fresh setup here. The outer beforeEach/afterEach (top of describe block)
    // reset the spawn mock; the inner spy-guard afterEach in the detection suite handles
    // restoring the prototype stub. Since this describe block is at the same level and
    // the spy guard is INSIDE the detection block, this describe block gets the outer
    // beforeEach/afterEach only, so we install our own spy guard.

    const defaultMockImpl = vi.fn(
      async (_script: string, _schema?: unknown): Promise<ScriptResult<unknown>> => ({
        success: true as const,
        data: {},
      }),
    );
    let restoredPrototypeSpy = false;
    beforeEach(() => {
      restoredPrototypeSpy = false;
      if (vi.isMockFunction(OmniAutomation.prototype.executeJson)) {
        vi.mocked(OmniAutomation.prototype.executeJson).mockRestore();
        restoredPrototypeSpy = true;
      }
    });
    afterEach(() => {
      if (restoredPrototypeSpy) {
        vi.spyOn(OmniAutomation.prototype, 'executeJson').mockImplementation(defaultMockImpl);
      }
    });

    // (a) Near-miss single-literal match: {action:'renamed', oldName:123 (wrong type), newName:'x', message:'y'}
    //     → same ScriptError (success:false, context 'Unrecognized script output shape')
    //     BUT details.issues scoped to renamed-branch only (not all 10 branches).
    it('(a) near-miss renamed branch: details.issues scoped to renamed-branch issues only', async () => {
      const payload = { action: 'renamed', oldName: 123, newName: 'x', message: 'y' };
      const result = await emitJsonOutput(JSON.stringify(payload), TagMutationResultSchema);

      // Outcome unchanged: still a ScriptError
      expect(result.success).toBe(false);
      // Context unchanged: same stable string
      expect(result.context).toBe('Unrecognized script output shape');
      // Message unchanged
      expect(result.error).toBe('Script output did not match the expected success shape');

      // Issues are now scoped to the renamed branch only — NOT the full invalid_union listing
      const details = result.details as { raw: string; issues: z.ZodIssue[] };
      expect(details.issues).toBeDefined();
      // Should be a short list (renamed-branch issues only: oldName wrong type)
      const issuePaths = details.issues.map((i: z.ZodIssue) => i.path[0] as string);
      expect(issuePaths).toContain('oldName');
      // Should NOT contain issues from other branches (e.g. tagId from created branches,
      // tagName from deleted branch used at top-level of other branch error paths)
      // The key sign: no issue with code 'invalid_union' (we replaced the top-level issue)
      expect(details.issues.every((i: z.ZodIssue) => i.code !== 'invalid_union')).toBe(true);
    });

    // (b) No-branch-match: {action:'bogus', ...} → no branch's action literal matches → unchanged
    it('(b) no-match: full unionErrors retained when action literal matches no branch', async () => {
      const payload = { action: 'bogus', oldName: 'x', newName: 'y', message: 'z' };
      const result = await emitJsonOutput(JSON.stringify(payload), TagMutationResultSchema);

      expect(result.success).toBe(false);
      expect(result.context).toBe('Unrecognized script output shape');

      const details = result.details as { raw: string; issues: z.ZodIssue[] };
      // Full invalid_union issue retained at top level (not slimmed)
      expect(details.issues[0].code).toBe('invalid_union');
    });

    // (c) Shared-literal / ambiguous: action:'created' is shared by two branches →
    //     multiple match → unchanged
    it('(c) shared literal (action:created): multiple branches match → unionErrors unchanged', async () => {
      // action:'created' matches both created-path and created-flat branches; path is wrong type
      const payload = { action: 'created', tagName: 'Work', tagId: 't1', path: 123, message: 'y' };
      const result = await emitJsonOutput(JSON.stringify(payload), TagMutationResultSchema);

      expect(result.success).toBe(false);
      expect(result.context).toBe('Unrecognized script output shape');

      const details = result.details as { raw: string; issues: z.ZodIssue[] };
      // Top-level invalid_union issue retained (not slimmed)
      expect(details.issues[0].code).toBe('invalid_union');
    });

    // (d) Non-union schema rejection: CompleteResultSchema or a plain object schema.
    //     Both branches of CompleteResultSchema have completed:literal(true) → both match →
    //     unchanged (multiple-match path). Plain object schema → no invalid_union issue → unchanged.
    it('(d) non-union plain schema: issues untouched (no invalid_union at top level)', async () => {
      const plainSchema = z.object({ taskId: z.string() }).strict();
      const payload = { taskId: 123 };
      const result = await emitJsonOutput(JSON.stringify(payload), plainSchema);

      expect(result.success).toBe(false);
      expect(result.context).toBe('Unrecognized script output shape');

      const details = result.details as { raw: string; issues: z.ZodIssue[] };
      // No invalid_union at top — issues untouched (first issue is type mismatch on taskId)
      expect(details.issues[0].code).not.toBe('invalid_union');
      expect(details.issues[0].path[0]).toBe('taskId');
    });

    it('(d2) CompleteResultSchema: both branches share completed:literal(true) → multiple match → unchanged', async () => {
      // taskId is wrong type; completed:true present → both branches match literal → multiple match
      const payload = { taskId: 123, name: 'My task', completed: true, completionDate: null };
      const result = await emitJsonOutput(JSON.stringify(payload), CompleteResultSchema);

      expect(result.success).toBe(false);
      expect(result.context).toBe('Unrecognized script output shape');

      const details = result.details as { raw: string; issues: z.ZodIssue[] };
      // Both branches match completed:literal(true) → multiple match → issues unchanged (still invalid_union)
      expect(details.issues[0].code).toBe('invalid_union');
    });
  });
});
