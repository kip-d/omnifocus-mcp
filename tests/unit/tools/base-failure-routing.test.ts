/**
 * Routing tests for returned ScriptErrors → failure-log + metrics (OMN-159 Task 2).
 *
 * DESIGN NOTE (I2): The existing base.test.ts drives execJson DIRECTLY via
 * `(testTool as any).execJson(...)`, which bypasses `execute()`'s `execContext.run`
 * wrapper — so the ALS store is never established and routing never fires.
 * This file uses a subclass whose `executeValidated` calls `this.execJson(script, schema)`,
 * invoked via `tool.execute(args)`, so the ALS context IS established.
 *
 * DISJOINTNESS (I4): `execJson` RETURNS the ScriptError → the tool converts it to a
 * response and returns normally → `handleExecuteError` (the catch path) is NEVER entered
 * for a returned error; the two paths never overlap. No double-log guard is needed.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';
import { BaseTool } from '../../../src/tools/base.js';
import { CacheManager } from '../../../src/cache/CacheManager.js';
import { OmniAutomation } from '../../../src/omnifocus/OmniAutomation.js';
import { ScriptError, ScriptResult } from '../../../src/omnifocus/script-result-types.js';
import * as fs from 'fs';
import * as os from 'os';
import * as metricsModule from '../../../src/utils/metrics.js';

// Mock filesystem and OmniAutomation so tests don't hit disk or real OF
vi.mock('../../../src/omnifocus/OmniAutomation');
vi.mock('../../../src/cache/CacheManager');
vi.mock('fs');
vi.mock('os');

// ---------------------------------------------------------------------------
// Concrete subclass: executeValidated delegates to this.execJson so that
// execute() → executeValidated() → execJson() all run under the ALS context.
// The schema is trivially z.unknown() so any args pass.
// ---------------------------------------------------------------------------
const trivialSchema = z.object({ op: z.string().optional() });

class RoutingTestTool extends BaseTool<typeof trivialSchema, ScriptResult<unknown>> {
  name = 'routing-test-tool';
  description = 'Minimal tool for OMN-159 routing tests';
  schema = trivialSchema;
  meta = undefined;

  override get inputSchema(): Record<string, unknown> {
    return { type: 'object', properties: { op: { type: 'string' } } };
  }

  protected async executeValidated(_args: z.infer<typeof trivialSchema>): Promise<ScriptResult<unknown>> {
    // Delegates to execJson — result flows back to execute() as the return value
    return this.execJson('SELECT 1', z.unknown());
  }
}

// Subclass that throws from executeValidated (disjointness case c)
class ThrowingValidatedTool extends BaseTool<typeof trivialSchema, ScriptResult<unknown>> {
  name = 'throwing-validated-tool';
  description = 'Throws from executeValidated for disjointness test';
  schema = trivialSchema;
  meta = undefined;

  override get inputSchema(): Record<string, unknown> {
    return { type: 'object', properties: { op: { type: 'string' } } };
  }

  protected async executeValidated(_args: z.infer<typeof trivialSchema>): Promise<ScriptResult<unknown>> {
    throw new Error('timed out after 25 seconds');
  }
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('BaseTool returned-ScriptError routing (OMN-159)', () => {
  let mockCache: CacheManager;
  let tool: RoutingTestTool;
  let mockExecuteJson: ReturnType<typeof vi.fn>;

  // Run tests in "production" mode so the failure-log gate does NOT suppress writes
  let savedNodeEnv: string | undefined;
  let savedDisableFlag: string | undefined;
  beforeEach(() => {
    savedNodeEnv = process.env.NODE_ENV;
    savedDisableFlag = process.env.OMNIFOCUS_MCP_DISABLE_FAILURE_LOG;
    process.env.NODE_ENV = 'production';
    delete process.env.OMNIFOCUS_MCP_DISABLE_FAILURE_LOG;
  });
  afterEach(() => {
    if (savedNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = savedNodeEnv;
    if (savedDisableFlag === undefined) delete process.env.OMNIFOCUS_MCP_DISABLE_FAILURE_LOG;
    else process.env.OMNIFOCUS_MCP_DISABLE_FAILURE_LOG = savedDisableFlag;
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.clearAllMocks();

    // Filesystem mocks
    vi.mocked(os.homedir).mockReturnValue('/home/test');
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.mkdirSync).mockImplementation(() => undefined);
    vi.mocked(fs.writeFileSync).mockImplementation(() => undefined);

    mockCache = new CacheManager();
    tool = new RoutingTestTool(mockCache);

    // Replace omniAutomation on the tool instance so we can control executeJson
    mockExecuteJson = vi.fn();
    tool.omniAutomation = { executeJson: mockExecuteJson } as unknown as OmniAutomation;
  });

  // -------------------------------------------------------------------------
  // Case (a): C1 kill-test — returned ScriptError with 'timed out'
  // Asserts: exactly ONE logToolFailure JSONL write, metric is success:false,
  // and errorType is SCRIPT_TIMEOUT (not INTERNAL_ERROR — that is the C1 kill).
  // -------------------------------------------------------------------------
  it('(a) C1: returned ScriptError with timed out → JSONL write + failure metric with SCRIPT_TIMEOUT (not INTERNAL_ERROR)', async () => {
    const timedOutError: ScriptError = {
      success: false,
      error: 'Script execution timed out after 25 seconds',
      context: 'Script execution exception',
    };
    mockExecuteJson.mockResolvedValue(timedOutError);

    const recordSpy = vi.spyOn(metricsModule, 'recordToolExecution');
    const writeFileSpy = vi.mocked(fs.writeFileSync);

    await tool.execute({ op: 'test' });

    // Exactly one JSONL write to the failures log
    const failureWrites = writeFileSpy.mock.calls.filter(
      (call) => typeof call[0] === 'string' && (call[0] as string).includes('failures-'),
    );
    expect(failureWrites).toHaveLength(1);

    // The written entry contains the categorized errorType — NOT INTERNAL_ERROR
    const writtenJson = JSON.parse(failureWrites[0][1] as string);
    expect(writtenJson.categorization?.errorType).toBe('SCRIPT_TIMEOUT');
    expect(writtenJson.categorization?.errorType).not.toBe('INTERNAL_ERROR');

    // Metric recorded with success:false and SCRIPT_TIMEOUT
    const failureMetricCalls = recordSpy.mock.calls.filter((call) => call[0].success === false);
    expect(failureMetricCalls).toHaveLength(1);
    expect(failureMetricCalls[0][0].success).toBe(false);
    expect(failureMetricCalls[0][0].errorType).toBe('SCRIPT_TIMEOUT');
    expect(failureMetricCalls[0][0].errorType).not.toBe('INTERNAL_ERROR');
  });

  // -------------------------------------------------------------------------
  // Case (b): partial-success bulk shape — success:true with errors[]
  // Must NOT write a failure log and metric must be success:true.
  // -------------------------------------------------------------------------
  it('(b) bulk success:true with errors[] → no failure log, metric success:true', async () => {
    const bulkSuccess = {
      success: true as const,
      data: {
        success: true,
        errors: [{ id: 'abc', message: 'task not found' }],
      },
    };
    mockExecuteJson.mockResolvedValue(bulkSuccess);

    const recordSpy = vi.spyOn(metricsModule, 'recordToolExecution');
    const writeFileSpy = vi.mocked(fs.writeFileSync);

    await tool.execute({ op: 'bulk' });

    // No failure JSONL write
    const failureWrites = writeFileSpy.mock.calls.filter(
      (call) => typeof call[0] === 'string' && (call[0] as string).includes('failures-'),
    );
    expect(failureWrites).toHaveLength(0);

    // Metric recorded as success:true
    const allMetricCalls = recordSpy.mock.calls;
    expect(allMetricCalls.length).toBeGreaterThanOrEqual(1);
    const lastMetric = allMetricCalls[allMetricCalls.length - 1][0];
    expect(lastMetric.success).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Case (c): executeValidated THROWS → log via handleExecuteError (thrown path).
  // The returned-error routing path (execContext ALS) must NOT fire — disjointness.
  // mockExecuteJson never called; metric exactly one failure (no double-count).
  // -------------------------------------------------------------------------
  it('(c) disjointness: thrown error → logs via thrown path only, returned-error path does not fire', async () => {
    const throwingTool = new ThrowingValidatedTool(mockCache);
    throwingTool.omniAutomation = { executeJson: mockExecuteJson } as unknown as OmniAutomation;

    const recordSpy = vi.spyOn(metricsModule, 'recordToolExecution');

    // Execute — this should NOT throw (handleExecuteError returns a V2 error response)
    await throwingTool.execute({ op: 'throw' });

    // mockExecuteJson was never called (thrown before reaching execJson)
    expect(mockExecuteJson).not.toHaveBeenCalled();

    // Exactly one failure metric recorded (the thrown path's recordFailure) — no double-count
    // from the returned-error path that should NOT have fired.
    const failureMetricCalls = recordSpy.mock.calls.filter((call) => call[0].success === false);
    expect(failureMetricCalls).toHaveLength(1);
  });
});
