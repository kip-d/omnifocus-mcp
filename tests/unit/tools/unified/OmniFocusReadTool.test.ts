/**
 * Unit tests for OmniFocusReadTool routing logic.
 *
 * Tests task ID lookup, project query routing (inline AST execution),
 * export routing (inlined from ExportTool), and error handling.
 * Uses execJson spy to control script results without OmniAutomation dependency.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OmniFocusReadTool } from '../../../../src/tools/unified/OmniFocusReadTool.js';
import { CacheManager } from '../../../../src/cache/CacheManager.js';
import type { ScriptResult } from '../../../../src/omnifocus/script-result-types.js';

vi.mock('../../../../src/cache/CacheManager');
vi.mock('../../../../src/omnifocus/OmniAutomation');

// Mock fs for bulk export tests
vi.mock('fs', () => ({
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

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

  // ─── Tag listing (inlined from TagsTool) ─────────────────────────

  describe('tag listing', () => {
    it('returns tags from direct AST execution', async () => {
      execJsonSpy.mockResolvedValueOnce({
        success: true,
        data: {
          ok: true,
          v: 'ast',
          items: [
            { id: 'tag1', name: 'Work' },
            { id: 'tag2', name: 'Personal' },
          ],
          summary: { total: 2 },
        },
      } satisfies ScriptResult);

      const result = (await tool.execute({
        query: { type: 'tags' },
      })) as any;

      expect(result.success).toBe(true);
      expect(result.data.tags).toHaveLength(2);
      expect(result.data.tags[0].id).toBe('tag1');
      expect(result.data.tags[1].id).toBe('tag2');
    });

    it('handles script errors for tag queries', async () => {
      execJsonSpy.mockResolvedValueOnce({
        success: false,
        error: 'OmniFocus not running',
      } satisfies ScriptResult);

      const result = (await tool.execute({
        query: { type: 'tags' },
      })) as any;

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('SCRIPT_ERROR');
    });

    it('caches tag results and returns from cache on hit', async () => {
      const cachedResponse = {
        success: true,
        data: { tags: [{ id: 'cached-tag', name: 'Cached' }] },
      };
      (mockCache.get as ReturnType<typeof vi.fn>).mockReturnValue(cachedResponse);

      const result = (await tool.execute({
        query: { type: 'tags' },
      })) as any;

      // Cached response returned as-is
      expect(result.success).toBe(true);
      expect(result.data.tags).toEqual(cachedResponse.data.tags);
      // execJson should not be called when cache hits
      expect(execJsonSpy).not.toHaveBeenCalled();
    });

    it('stores results in cache after fresh query', async () => {
      execJsonSpy.mockResolvedValueOnce({
        success: true,
        data: {
          ok: true,
          v: 'ast',
          items: [{ id: 'tag1', name: 'Fresh Tag' }],
          summary: { total: 1 },
        },
      } satisfies ScriptResult);

      await tool.execute({
        query: { type: 'tags' },
      });

      expect(mockCache.set).toHaveBeenCalledWith('tags', expect.any(String), expect.any(Object));
    });

    it('handles empty tag list', async () => {
      execJsonSpy.mockResolvedValueOnce({
        success: true,
        data: {
          ok: true,
          v: 'ast',
          items: [],
          summary: { total: 0 },
        },
      } satisfies ScriptResult);

      const result = (await tool.execute({
        query: { type: 'tags' },
      })) as any;

      expect(result.success).toBe(true);
      expect(result.data.tags).toHaveLength(0);
    });
  });

  // ─── Export (inlined from ExportTool) ─────────────────────────────

  describe('export routing', () => {
    describe('task export', () => {
      it('returns exported tasks with AST-generated script', async () => {
        execJsonSpy.mockResolvedValueOnce({
          success: true,
          data: { format: 'json', data: [{ id: 't1', name: 'Test Task' }], count: 1 },
        } satisfies ScriptResult);

        const result = (await tool.execute({
          query: { type: 'export', exportType: 'tasks', format: 'json' },
        })) as any;

        expect(result.success).toBe(true);
        expect(result.data.format).toBe('json');
        expect(result.data.exportType).toBe('tasks');
        expect(result.data.count).toBe(1);
        // Verify execJson was called with a generated script string
        expect(execJsonSpy).toHaveBeenCalledTimes(1);
        const scriptArg = execJsonSpy.mock.calls[0][0] as string;
        expect(typeof scriptArg).toBe('string');
      });

      it('passes filters through to export script', async () => {
        execJsonSpy.mockResolvedValueOnce({
          success: true,
          data: { format: 'csv', data: 'id,name\nt1,Task1', count: 1 },
        } satisfies ScriptResult);

        const result = (await tool.execute({
          query: {
            type: 'export',
            exportType: 'tasks',
            format: 'csv',
            filters: { flagged: true },
          },
        })) as any;

        expect(result.success).toBe(true);
        expect(result.data.format).toBe('csv');
        // The generated script should embed the flagged filter
        const scriptArg = execJsonSpy.mock.calls[0][0] as string;
        expect(scriptArg).toContain('flagged');
      });

      it('returns error when task export script fails', async () => {
        execJsonSpy.mockResolvedValueOnce({
          success: false,
          error: 'Export failed',
        } satisfies ScriptResult);

        const result = (await tool.execute({
          query: { type: 'export', exportType: 'tasks' },
        })) as any;

        expect(result.success).toBe(false);
        expect(result.error.code).toBe('TASK_EXPORT_FAILED');
      });
    });

    describe('project export', () => {
      it('returns exported projects via buildScript + execJson', async () => {
        // Mock buildScript on the omniAutomation instance
        (tool as any).omniAutomation.buildScript = vi.fn().mockReturnValue('mock-project-export-script');

        execJsonSpy.mockResolvedValueOnce({
          success: true,
          data: { format: 'json', data: [{ id: 'p1', name: 'Project 1' }], count: 1 },
        } satisfies ScriptResult);

        const result = (await tool.execute({
          query: { type: 'export', exportType: 'projects', format: 'json', includeStats: true },
        })) as any;

        expect(result.success).toBe(true);
        expect(result.data.format).toBe('json');
        expect(result.data.exportType).toBe('projects');
        expect(result.data.count).toBe(1);
        expect(result.data.includeStats).toBe(true);
        expect((tool as any).omniAutomation.buildScript).toHaveBeenCalledWith(expect.any(String), {
          format: 'json',
          includeStats: true,
        });
      });

      it('returns error when project export script fails', async () => {
        (tool as any).omniAutomation.buildScript = vi.fn().mockReturnValue('mock-script');

        execJsonSpy.mockResolvedValueOnce({
          success: false,
          error: 'Projects export failed',
        } satisfies ScriptResult);

        const result = (await tool.execute({
          query: { type: 'export', exportType: 'projects' },
        })) as any;

        expect(result.success).toBe(false);
        expect(result.error.code).toBe('SCRIPT_ERROR');
      });
    });

    describe('bulk export', () => {
      it('requires outputDirectory for bulk export', async () => {
        const result = (await tool.execute({
          query: { type: 'export', exportType: 'all' },
        })) as any;

        expect(result.success).toBe(false);
        expect(result.error.code).toBe('MISSING_PARAMETER');
        expect(result.error.message).toContain('outputDirectory is required');
      });

      it('exports tasks, projects, and tags to directory', async () => {
        (tool as any).omniAutomation.buildScript = vi.fn().mockReturnValue('mock-project-export-script');

        // First call: task export, second call: project export, third call: tag export (AST)
        execJsonSpy
          .mockResolvedValueOnce({
            success: true,
            data: { format: 'json', data: [{ id: 't1' }], count: 1 },
          } satisfies ScriptResult)
          .mockResolvedValueOnce({
            success: true,
            data: { format: 'json', data: [{ id: 'p1' }], count: 1 },
          } satisfies ScriptResult)
          .mockResolvedValueOnce({
            success: true,
            data: {
              ok: true,
              v: 'ast',
              items: [{ id: 'tag1', name: 'Work' }],
              summary: { total: 1 },
            },
          } satisfies ScriptResult);

        const result = (await tool.execute({
          query: {
            type: 'export',
            exportType: 'all',
            format: 'json',
            outputDirectory: '/tmp/export-test',
            includeCompleted: true,
            includeStats: true,
          },
        })) as any;

        expect(result.success).toBe(true);
        expect(result.data.exports).toBeDefined();
        expect(result.data.exports.tasks).toBeDefined();
        expect(result.data.exports.tasks.exported).toBe(true);
        expect(result.data.exports.projects).toBeDefined();
        expect(result.data.exports.projects.exported).toBe(true);
        expect(result.data.exports.tags).toBeDefined();
        expect(result.data.exports.tags.exported).toBe(true);
        expect(result.data.summary.totalExported).toBeGreaterThan(0);
      });
    });

    describe('defaults', () => {
      it('defaults to task export when exportType is not specified', async () => {
        execJsonSpy.mockResolvedValueOnce({
          success: true,
          data: { format: 'json', data: [], count: 0 },
        } satisfies ScriptResult);

        const result = (await tool.execute({
          query: { type: 'export' },
        })) as any;

        expect(result.success).toBe(true);
        expect(result.data.exportType).toBe('tasks');
      });

      it('defaults to json format when format is not specified', async () => {
        execJsonSpy.mockResolvedValueOnce({
          success: true,
          data: { format: 'json', data: [], count: 0 },
        } satisfies ScriptResult);

        const result = (await tool.execute({
          query: { type: 'export', exportType: 'tasks' },
        })) as any;

        expect(result.success).toBe(true);
        expect(result.data.format).toBe('json');
      });
    });
  });

  // ─── Perspectives listing (inlined from PerspectivesTool) ──────────

  describe('perspectives listing', () => {
    it('returns perspectives sorted by name', async () => {
      // Mock buildScript on the omniAutomation instance
      (tool as any).omniAutomation.buildScript = vi.fn().mockReturnValue('mock-perspectives-script');

      execJsonSpy.mockResolvedValueOnce({
        success: true,
        data: {
          items: [
            { name: 'Projects', isBuiltIn: true },
            { name: 'Custom View', isBuiltIn: false },
            { name: 'Inbox', isBuiltIn: true },
          ],
          metadata: { count: 3 },
        },
      } satisfies ScriptResult);

      const result = (await tool.execute({
        query: { type: 'perspectives' },
      })) as any;

      expect(result.success).toBe(true);
      expect(result.data.perspectives).toHaveLength(3);
      // Verify sorted by name
      const names = result.data.perspectives.map((p: any) => p.name);
      expect(names).toEqual(['Custom View', 'Inbox', 'Projects']);
    });

    it('handles perspectives property in script response', async () => {
      (tool as any).omniAutomation.buildScript = vi.fn().mockReturnValue('mock-perspectives-script');

      execJsonSpy.mockResolvedValueOnce({
        success: true,
        data: {
          perspectives: [
            { name: 'Flagged', isBuiltIn: true },
            { name: 'Review', isBuiltIn: true },
          ],
        },
      } satisfies ScriptResult);

      const result = (await tool.execute({
        query: { type: 'perspectives' },
      })) as any;

      expect(result.success).toBe(true);
      expect(result.data.perspectives).toHaveLength(2);
    });

    it('returns empty array when no perspectives found', async () => {
      (tool as any).omniAutomation.buildScript = vi.fn().mockReturnValue('mock-perspectives-script');

      execJsonSpy.mockResolvedValueOnce({
        success: true,
        data: {},
      } satisfies ScriptResult);

      const result = (await tool.execute({
        query: { type: 'perspectives' },
      })) as any;

      expect(result.success).toBe(true);
      expect(result.data.perspectives).toHaveLength(0);
    });

    it('handles script errors for perspective queries', async () => {
      (tool as any).omniAutomation.buildScript = vi.fn().mockReturnValue('mock-perspectives-script');

      execJsonSpy.mockResolvedValueOnce({
        success: false,
        error: 'OmniFocus not running',
      } satisfies ScriptResult);

      const result = (await tool.execute({
        query: { type: 'perspectives' },
      })) as any;

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('SCRIPT_ERROR');
    });

    it('handles thrown errors gracefully', async () => {
      (tool as any).omniAutomation.buildScript = vi.fn().mockReturnValue('mock-perspectives-script');

      execJsonSpy.mockRejectedValueOnce(new Error('Connection timeout'));

      const result = (await tool.execute({
        query: { type: 'perspectives' },
      })) as any;

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('UNKNOWN_ERROR');
      expect(result.error.message).toBe('Connection timeout');
    });
  });
});
