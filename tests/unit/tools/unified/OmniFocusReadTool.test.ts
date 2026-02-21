/**
 * Unit tests for OmniFocusReadTool routing logic.
 *
 * Tests task ID lookup, project query routing (inline AST execution),
 * and error handling in routeToTasksTool / routeToProjectsTool.
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
  let mockCache: CacheManager;

  beforeEach(() => {
    vi.clearAllMocks();

    mockCache = {
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

  // ─── Project query (inline AST execution) ─────────────────────────

  describe('project query routing', () => {
    it('returns projects from direct AST execution', async () => {
      const mockProjects = [
        { id: 'p1', name: 'Project 1', status: 'active' },
        { id: 'p2', name: 'Project 2', status: 'on-hold' },
      ];

      execJsonSpy.mockResolvedValueOnce({
        success: true,
        data: { projects: mockProjects, metadata: { total_available: 2 } },
      } satisfies ScriptResult);

      const result = (await tool.execute({
        query: { type: 'projects' },
      })) as any;

      expect(result.success).toBe(true);
      expect(result.data.projects).toHaveLength(2);
      expect(result.data.projects[0].id).toBe('p1');
      expect(result.data.projects[1].id).toBe('p2');
    });

    it('applies field projection to project results', async () => {
      execJsonSpy.mockResolvedValueOnce({
        success: true,
        data: {
          projects: [{ id: 'p1', name: 'Test Project', status: 'active', note: 'some note', flagged: false }],
          metadata: { total_available: 1 },
        },
      } satisfies ScriptResult);

      const result = (await tool.execute({
        query: { type: 'projects', fields: ['name', 'status'] },
      })) as any;

      expect(result.success).toBe(true);
      const proj = result.data.projects[0];
      expect(proj.id).toBe('p1'); // id always included
      expect(proj.name).toBe('Test Project');
      expect(proj.status).toBe('active');
      // Fields not requested should be stripped
      expect(proj.note).toBeUndefined();
      expect(proj.flagged).toBeUndefined();
    });

    it('handles script errors for project queries', async () => {
      execJsonSpy.mockResolvedValueOnce({
        success: false,
        error: 'OmniFocus not running',
      } satisfies ScriptResult);

      const result = (await tool.execute({
        query: { type: 'projects' },
      })) as any;

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('SCRIPT_ERROR');
    });

    it('passes limit to AST builder', async () => {
      execJsonSpy.mockResolvedValueOnce({
        success: true,
        data: { projects: [], metadata: { total_available: 0 } },
      } satisfies ScriptResult);

      await tool.execute({
        query: { type: 'projects', limit: 10 },
      });

      // Verify execJson was called (script contains the limit)
      expect(execJsonSpy).toHaveBeenCalledTimes(1);
      const scriptArg = execJsonSpy.mock.calls[0][0] as string;
      expect(scriptArg).toContain('10'); // limit embedded in script
    });

    it('caches project results and returns from cache on hit', async () => {
      const cachedData = {
        projects: [{ id: 'cached-1', name: 'Cached Project' }],
      };
      (mockCache.get as ReturnType<typeof vi.fn>).mockReturnValue(cachedData);

      const result = (await tool.execute({
        query: { type: 'projects' },
      })) as any;

      expect(result.success).toBe(true);
      expect(result.data.projects).toEqual(cachedData.projects);
      expect(result.metadata.from_cache).toBe(true);
      // execJson should not be called when cache hits
      expect(execJsonSpy).not.toHaveBeenCalled();
    });

    it('stores results in cache after fresh query', async () => {
      execJsonSpy.mockResolvedValueOnce({
        success: true,
        data: {
          projects: [{ id: 'p1', name: 'Fresh', status: 'active' }],
          metadata: { total_available: 1 },
        },
      } satisfies ScriptResult);

      await tool.execute({
        query: { type: 'projects' },
      });

      expect(mockCache.set).toHaveBeenCalledWith(
        'projects',
        expect.any(String),
        expect.objectContaining({ projects: expect.any(Array) }),
      );
    });

    it('parses date strings into Date objects', async () => {
      execJsonSpy.mockResolvedValueOnce({
        success: true,
        data: {
          projects: [
            {
              id: 'p1',
              name: 'Dated Project',
              dueDate: '2025-12-31T17:00:00.000Z',
              completionDate: null,
              nextReviewDate: '2025-06-15T00:00:00.000Z',
            },
          ],
          metadata: { total_available: 1 },
        },
      } satisfies ScriptResult);

      const result = (await tool.execute({
        query: { type: 'projects' },
      })) as any;

      expect(result.success).toBe(true);
      const proj = result.data.projects[0];
      // Dates should be parsed into Date objects
      expect(proj.dueDate).toBeInstanceOf(Date);
      expect(proj.nextReviewDate).toBeInstanceOf(Date);
      // Null dates remain undefined
      expect(proj.completionDate).toBeUndefined();
    });
  });
});
