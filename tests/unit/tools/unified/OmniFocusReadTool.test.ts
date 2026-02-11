/**
 * Unit tests for OmniFocusReadTool task routing logic.
 *
 * Tests the ID lookup fast path and error handling in routeToTasksTool.
 * Uses execJson spy to control script results without OmniAutomation dependency.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OmniFocusReadTool } from '../../../../src/tools/unified/OmniFocusReadTool.js';
import { CacheManager } from '../../../../src/cache/CacheManager.js';
import type { ScriptResult } from '../../../../src/omnifocus/script-result-types.js';

vi.mock('../../../../src/cache/CacheManager');
vi.mock('../../../../src/omnifocus/OmniAutomation');

describe('OmniFocusReadTool', () => {
  let tool: OmniFocusReadTool;
  let execJsonSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    const mockCache = {
      get: vi.fn().mockReturnValue(null),
      set: vi.fn(),
      invalidate: vi.fn(),
    } as unknown as CacheManager;

    tool = new OmniFocusReadTool(mockCache);

    // Spy on execJson to control script results directly
    execJsonSpy = vi.fn();
    vi.spyOn(tool as any, 'execJson').mockImplementation(execJsonSpy);
  });

  describe('ID lookup fast path', () => {
    it('returns task with field projection for successful ID lookup', async () => {
      execJsonSpy.mockResolvedValueOnce({
        success: true,
        data: {
          tasks: [{ id: 'task-abc', name: 'Test Task', completed: false, flagged: true, blocked: false }],
        },
      } satisfies ScriptResult);

      const result = (await tool.execute({
        query: { type: 'tasks', filters: { id: 'task-abc' }, fields: ['id', 'name'] },
      })) as any;

      expect(result.success).toBe(true);
      expect(result.data.tasks).toHaveLength(1);
      expect(result.data.tasks[0].id).toBe('task-abc');
      expect(result.data.tasks[0].name).toBe('Test Task');
      // Field projection: flagged should be excluded
      expect(result.data.tasks[0].flagged).toBeUndefined();
      expect(result.metadata.mode).toBe('id_lookup');
    });

    it('returns NOT_FOUND error when task does not exist', async () => {
      execJsonSpy.mockResolvedValueOnce({
        success: true,
        data: { tasks: [] },
      } satisfies ScriptResult);

      const result = (await tool.execute({
        query: { type: 'tasks', filters: { id: 'nonexistent-id' } },
      })) as any;

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('NOT_FOUND');
      expect(result.error.message).toContain('nonexistent-id');
    });

    it('returns ID_MISMATCH error when wrong task is returned', async () => {
      execJsonSpy.mockResolvedValueOnce({
        success: true,
        data: {
          tasks: [{ id: 'wrong-id', name: 'Wrong Task', completed: false, flagged: false, blocked: false }],
        },
      } satisfies ScriptResult);

      const result = (await tool.execute({
        query: { type: 'tasks', filters: { id: 'expected-id' } },
      })) as any;

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('ID_MISMATCH');
      expect(result.error.message).toContain('expected-id');
      expect(result.error.message).toContain('wrong-id');
    });

    it('returns SCRIPT_ERROR when script execution fails', async () => {
      execJsonSpy.mockResolvedValueOnce({
        success: false,
        error: 'OmniFocus not running',
      } satisfies ScriptResult);

      const result = (await tool.execute({
        query: { type: 'tasks', filters: { id: 'any-id' } },
      })) as any;

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('SCRIPT_ERROR');
      expect(result.error.message).toContain('any-id');
    });
  });
});
