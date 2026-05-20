/**
 * Unit tests for OmniFocusReadTool routing logic.
 *
 * Tests task ID lookup, project query routing (inline AST execution),
 * export routing (inlined from ExportTool), and error handling.
 * Uses execJson spy to control script results without OmniAutomation dependency.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { OmniFocusReadTool } from '../../../../src/tools/unified/OmniFocusReadTool.js';
import { CacheManager } from '../../../../src/cache/CacheManager.js';
import type { ScriptResult } from '../../../../src/omnifocus/script-result-types.js';

// Unique per-process temp subpath for export tests. fs is mocked below, so
// nothing is actually written — but use os.tmpdir() (plus pid) anyway so
// the string isn't a hardcoded world-writable path and the pattern stays
// correct if fs mocking is ever removed.
const TEST_EXPORT_DIR = join(tmpdir(), `omnifocus-mcp-export-test-${process.pid}`);

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
        query: { type: 'projects', details: true },
      })) as any;

      expect(result.success).toBe(true);
      const proj = result.data.projects[0];
      // Dates should be parsed into Date objects
      expect(proj.dueDate).toBeInstanceOf(Date);
      expect(proj.nextReviewDate).toBeInstanceOf(Date);
      // NOTE: completionDate is undefined here NOT because of the
      // null-collapse bug (that's fixed by OMN-80, see next test), but
      // because of a SEPARATE defect — `projectFieldsOnResult` strips it.
      // The source field name is `completionDate` (what parseProjects
      // writes) but ProjectFieldEnum only knows `completedDate` (a stale
      // name from earlier API revisions). The projection layer filters by
      // the enum and removes the unrecognized key. Tracked as a follow-up
      // ticket. Until that's fixed, completionDate cannot survive the
      // projection layer regardless of source value, so the right
      // assertion here is "field stripped by projection" = undefined.
      expect(proj.completionDate).toBeUndefined();
    });

    // OMN-80: regression — null dueDate from the script must NOT be silently
    // converted to undefined. The pre-fix bug at parseProjects() lines 688-691
    // (`x ? new Date(x) : undefined`) lost the explicit-null signal; fixed to
    // preserve it (`x ? new Date(x) : null`).
    it('OMN-80: explicit null dueDate survives parsing as null (not undefined)', async () => {
      execJsonSpy.mockResolvedValueOnce({
        success: true,
        data: {
          projects: [{ id: 'p_nulldue', name: 'No Due Date Project', dueDate: null, lastReviewDate: null }],
          metadata: { total_available: 1 },
        },
      } satisfies ScriptResult);

      const result = (await tool.execute({
        query: { type: 'projects', details: true },
      })) as any;

      expect(result.success).toBe(true);
      const proj = result.data.projects[0];
      expect(proj.dueDate).toBeNull();
      expect(proj.lastReviewDate).toBeNull();
    });
  });

  // ─── OMN-19: summary suppression on narrow lookups ─────────────
  // Linear OMN-19 — trim review/bottleneck summary from project lookup responses.
  // Decision: heuristic over explicit param. Skip summary iff the caller
  // provided a narrow lookup filter (name-search or id). Broad browses
  // (no filter, status-only, folder-only) still return the summary, which
  // is useful for weekly-review workflows. See Linear issue for the full
  // Option 1 / 2 / 3 trade-off.
  describe('OMN-19 summary suppression on narrow lookups', () => {
    const projectsPayload = {
      success: true as const,
      data: {
        projects: [{ id: 'p1', name: 'OmniFocus MCP', status: 'active' }],
        metadata: { total_available: 1 },
      },
    };

    it('strips summary when name.contains filter is present (lookup-by-name)', async () => {
      execJsonSpy.mockResolvedValueOnce(projectsPayload satisfies ScriptResult);

      const result = (await tool.execute({
        query: { type: 'projects', filters: { name: { contains: 'OmniFocus' } } },
      })) as any;

      expect(result.success).toBe(true);
      expect(result.summary).toBeUndefined();
    });

    it('strips summary when id filter is present (lookup-by-id)', async () => {
      execJsonSpy.mockResolvedValueOnce(projectsPayload satisfies ScriptResult);

      const result = (await tool.execute({
        query: { type: 'projects', filters: { id: 'p1' } },
      })) as any;

      expect(result.success).toBe(true);
      expect(result.summary).toBeUndefined();
    });

    it('preserves summary for broad browses (no narrow filter)', async () => {
      execJsonSpy.mockResolvedValueOnce(projectsPayload satisfies ScriptResult);

      const result = (await tool.execute({
        query: { type: 'projects' },
      })) as any;

      expect(result.success).toBe(true);
      expect(result.summary).toBeDefined();
      expect(result.summary.total_projects).toBe(1);
    });

    it('preserves summary for status-only browses (dashboard-like)', async () => {
      execJsonSpy.mockResolvedValueOnce(projectsPayload satisfies ScriptResult);

      const result = (await tool.execute({
        query: { type: 'projects', filters: { status: 'active' } },
      })) as any;

      expect(result.success).toBe(true);
      expect(result.summary).toBeDefined();
    });

    it('strips summary on cache hit when narrow lookup', async () => {
      (mockCache.get as ReturnType<typeof vi.fn>).mockReturnValue({
        projects: [{ id: 'cached-1', name: 'Cached Project', status: 'active' }],
      });

      const result = (await tool.execute({
        query: { type: 'projects', filters: { name: { contains: 'Cached' } } },
      })) as any;

      expect(result.success).toBe(true);
      expect(result.metadata.from_cache).toBe(true);
      expect(result.summary).toBeUndefined();
    });
  });

  // ─── OMN-40: project id-lookup correctness ─────────────────────

  describe('OMN-40 project id-lookup', () => {
    it('returns the requested project for id filter (was previously ignored)', async () => {
      execJsonSpy.mockResolvedValueOnce({
        success: true,
        data: {
          projects: [{ id: 'h1Y_Mpkz5fL', name: 'Personal/Miscellaneous', status: 'active' }],
          metadata: { total_available: 1 },
        },
      } satisfies ScriptResult);

      const result = (await tool.execute({
        query: { type: 'projects', filters: { id: 'h1Y_Mpkz5fL' } },
      })) as any;

      expect(result.success).toBe(true);
      expect(result.data.projects).toHaveLength(1);
      expect(result.data.projects[0].id).toBe('h1Y_Mpkz5fL');
      expect(result.metadata.mode).toBe('id_lookup');
    });

    it('returns NOT_FOUND when the id does not match any project', async () => {
      execJsonSpy.mockResolvedValueOnce({
        success: true,
        data: { projects: [], metadata: { total_available: 0 } },
      } satisfies ScriptResult);

      const result = (await tool.execute({
        query: { type: 'projects', filters: { id: 'nonexistent-id' } },
      })) as any;

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('NOT_FOUND');
    });

    it('returns ID_MISMATCH if the script returns a project with a different id (defensive)', async () => {
      // This shouldn't happen with Project.byIdentifier(), but the mismatch
      // check guards against future script-builder bugs of the same shape.
      execJsonSpy.mockResolvedValueOnce({
        success: true,
        data: {
          projects: [{ id: 'wrong-id', name: 'Some Other Project', status: 'active' }],
          metadata: { total_available: 1 },
        },
      } satisfies ScriptResult);

      const result = (await tool.execute({
        query: { type: 'projects', filters: { id: 'requested-id' } },
      })) as any;

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('ID_MISMATCH');
    });

    it('uses Project.byIdentifier() in the script (O(1) lookup, not iteration)', async () => {
      execJsonSpy.mockResolvedValueOnce({
        success: true,
        data: {
          projects: [{ id: 'p1', name: 'P', status: 'active' }],
          metadata: { total_available: 1 },
        },
      } satisfies ScriptResult);

      await tool.execute({ query: { type: 'projects', filters: { id: 'p1' } } });

      const scriptArg = execJsonSpy.mock.calls[0][0] as string;
      expect(scriptArg).toContain('Project.byIdentifier');
    });
  });

  // ─── Thin-by-default project field resolution ──────────────────

  describe('thin-by-default project field resolution', () => {
    it('uses MINIMAL_PROJECT_FIELDS when no fields or details specified', async () => {
      execJsonSpy.mockResolvedValueOnce({
        success: true,
        data: {
          projects: [
            {
              id: 'p1',
              name: 'Proj',
              status: 'active',
              flagged: false,
              note: 'big note here',
              folderPath: 'Work/Projects',
              sequential: true,
              lastReviewDate: '2026-01-01T00:00:00.000Z',
              nextReviewDate: '2026-03-01T00:00:00.000Z',
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
      expect(proj.id).toBeDefined();
      expect(proj.name).toBeDefined();
      // Detail fields should be stripped by post-hoc projection
      expect(proj.folderPath).toBeUndefined();
      expect(proj.sequential).toBeUndefined();
      expect(proj.lastReviewDate).toBeUndefined();
      expect(proj.nextReviewDate).toBeUndefined();
      expect(proj.note).toBeUndefined();
    });

    it('includes all fields when details=true', async () => {
      execJsonSpy.mockResolvedValueOnce({
        success: true,
        data: {
          projects: [
            {
              id: 'p1',
              name: 'Proj',
              status: 'active',
              note: 'a note',
              folderPath: 'some/path',
              sequential: true,
              lastReviewDate: '2026-01-01T00:00:00.000Z',
              nextReviewDate: '2026-03-01T00:00:00.000Z',
            },
          ],
          metadata: { total_available: 1 },
        },
      } satisfies ScriptResult);

      const result = (await tool.execute({
        query: { type: 'projects', details: true },
      })) as any;

      expect(result.success).toBe(true);
      const proj = result.data.projects[0];
      // All fields should be present
      expect(proj.id).toBeDefined();
      expect(proj.name).toBeDefined();
      expect(proj.folderPath).toBe('some/path');
      expect(proj.sequential).toBe(true);
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
            outputDirectory: TEST_EXPORT_DIR,
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

    // OMN-44: tasks export silently dropped records and ignored includeCompleted.
    // Two distinct bugs in handleTaskExport: outputDirectory was never read
    // (only handleBulkExport consumed it), and includeCompleted was never
    // mapped onto the export filter. Sibling-handler drift.
    describe('OMN-44 tasks export honors outputDirectory + includeCompleted', () => {
      it('writes tasks to disk and raises the cap when outputDirectory is set', async () => {
        execJsonSpy.mockResolvedValueOnce({
          success: true,
          data: { format: 'json', data: [{ id: 't1' }], count: 1 },
        } satisfies ScriptResult);

        const fsModule = await import('fs');
        const writeSpy = vi.mocked(fsModule.writeFileSync);
        writeSpy.mockClear();
        const mkdirSpy = vi.mocked(fsModule.mkdirSync);
        mkdirSpy.mockClear();

        const result = (await tool.execute({
          query: {
            type: 'export',
            exportType: 'tasks',
            format: 'json',
            outputDirectory: TEST_EXPORT_DIR,
          },
        })) as any;

        expect(result.success).toBe(true);
        // File was written
        expect(writeSpy).toHaveBeenCalledTimes(1);
        const [writtenPath] = writeSpy.mock.calls[0];
        expect(String(writtenPath)).toContain(TEST_EXPORT_DIR);
        expect(String(writtenPath)).toMatch(/tasks\.json$/);
        // outputPath is reported back to the caller
        expect(result.data.outputPath).toBe(writtenPath);
        // The implicit cap is no longer 1000 when writing to disk; the script
        // is generated with a substantially higher maxTasks ceiling.
        const scriptArg = execJsonSpy.mock.calls[0][0] as string;
        const match = scriptArg.match(/const maxTasks = (\d+);/);
        expect(match).not.toBeNull();
        const maxTasks = Number(match![1]);
        expect(maxTasks).toBeGreaterThanOrEqual(5000);
      });

      it('keeps the 1000 default cap when outputDirectory is NOT set', async () => {
        execJsonSpy.mockResolvedValueOnce({
          success: true,
          data: { format: 'json', data: [], count: 0 },
        } satisfies ScriptResult);

        const fsModule = await import('fs');
        const writeSpy = vi.mocked(fsModule.writeFileSync);
        writeSpy.mockClear();

        const result = (await tool.execute({
          query: { type: 'export', exportType: 'tasks', format: 'json' },
        })) as any;

        expect(result.success).toBe(true);
        // No file written when outputDirectory is absent
        expect(writeSpy).not.toHaveBeenCalled();
        // The cap is the historical 1000 default
        const scriptArg = execJsonSpy.mock.calls[0][0] as string;
        const match = scriptArg.match(/const maxTasks = (\d+);/);
        expect(match).not.toBeNull();
        expect(Number(match![1])).toBe(1000);
      });

      it('honors includeCompleted=false for tasks export', async () => {
        execJsonSpy.mockResolvedValueOnce({
          success: true,
          data: { format: 'json', data: [], count: 0 },
        } satisfies ScriptResult);

        const result = (await tool.execute({
          query: {
            type: 'export',
            exportType: 'tasks',
            format: 'json',
            includeCompleted: false,
          },
        })) as any;

        expect(result.success).toBe(true);
        // The script must filter out completed tasks. The OmniJS predicate
        // emitted by the AST builder references task.completed in the filter.
        const scriptArg = execJsonSpy.mock.calls[0][0] as string;
        expect(scriptArg).toContain('completed');
        expect(scriptArg).toMatch(/!\s*task\.completed|task\.completed\s*===\s*false|completed:\s*false/);
      });

      it('treats includeCompleted=true (default) as no completed-filter', async () => {
        execJsonSpy.mockResolvedValueOnce({
          success: true,
          data: { format: 'json', data: [], count: 0 },
        } satisfies ScriptResult);

        const result = (await tool.execute({
          query: {
            type: 'export',
            exportType: 'tasks',
            format: 'json',
            includeCompleted: true,
          },
        })) as any;

        expect(result.success).toBe(true);
        // No completed predicate emitted into the filter
        const scriptArg = execJsonSpy.mock.calls[0][0] as string;
        // Filter description is emitted as a comment; check the predicate body
        // does not constrain task.completed. The AST emits `true` for an empty
        // filter.
        expect(scriptArg).toContain('return true;');
      });

      it('flags truncation in summary when the script reports limited=true', async () => {
        // Script already detects truncation via `tasksAdded >= maxTasks` and
        // emits `limited: true` (script-builder.ts). Handler must surface it.
        execJsonSpy.mockResolvedValueOnce({
          success: true,
          data: {
            format: 'json',
            data: new Array(1000).fill({ id: 'x' }),
            count: 1000,
            limited: true,
          },
        } satisfies ScriptResult);

        const result = (await tool.execute({
          query: { type: 'export', exportType: 'tasks', format: 'json' },
        })) as any;

        expect(result.success).toBe(true);
        expect(result.data.summary?.truncated).toBe(true);
        expect(result.data.summary?.cap).toBe(1000);
      });

      it('does NOT flag truncation when count is below the cap', async () => {
        execJsonSpy.mockResolvedValueOnce({
          success: true,
          data: { format: 'json', data: [{ id: 't1' }], count: 1 },
        } satisfies ScriptResult);

        const result = (await tool.execute({
          query: { type: 'export', exportType: 'tasks', format: 'json' },
        })) as any;

        expect(result.success).toBe(true);
        expect(result.data.summary?.truncated).not.toBe(true);
      });
    });
  });

  // ─── Thin-by-default field resolution ─────────────────────────

  describe('thin-by-default field resolution', () => {
    it('generates script with MINIMAL_FIELDS when no fields or details specified', async () => {
      execJsonSpy.mockResolvedValueOnce({
        success: true,
        data: { tasks: [{ id: 't1', name: 'Test' }] },
      } satisfies ScriptResult);

      await tool.execute({
        query: { type: 'tasks' },
      });

      // Script should use minimal fields — should NOT contain 'note' projection
      const scriptArg = execJsonSpy.mock.calls[0][0] as string;
      expect(scriptArg).toContain('task.name');
      expect(scriptArg).toContain('task.flagged');
      expect(scriptArg).not.toContain('estimatedMinutes');
      expect(scriptArg).not.toContain('parentTaskId');
    });

    it('generates script with DEFAULT_FIELDS when details=true', async () => {
      execJsonSpy.mockResolvedValueOnce({
        success: true,
        data: { tasks: [{ id: 't1', name: 'Test', note: 'full note', estimatedMinutes: 30 }] },
      } satisfies ScriptResult);

      await tool.execute({
        query: { type: 'tasks', details: true },
      });

      const scriptArg = execJsonSpy.mock.calls[0][0] as string;
      // Should have detail fields
      expect(scriptArg).toContain('estimatedMinutes');
      expect(scriptArg).toContain('parentTaskId');
      // Note should be full (no substring truncation)
      expect(scriptArg).not.toContain('substring');
    });

    it('uses exact user fields when explicitly provided', async () => {
      execJsonSpy.mockResolvedValueOnce({
        success: true,
        data: { tasks: [{ id: 't1', name: 'Test', note: 'some note' }] },
      } satisfies ScriptResult);

      await tool.execute({
        query: { type: 'tasks', fields: ['id', 'name', 'note'] },
      });

      const scriptArg = execJsonSpy.mock.calls[0][0] as string;
      expect(scriptArg).toContain('task.name');
      // Note should be present but truncated (user didn't set details=true)
      expect(scriptArg).toContain('substring');
    });

    it('does not truncate note when details=true with explicit fields', async () => {
      execJsonSpy.mockResolvedValueOnce({
        success: true,
        data: { tasks: [{ id: 't1', note: 'full' }] },
      } satisfies ScriptResult);

      await tool.execute({
        query: { type: 'tasks', fields: ['id', 'note'], details: true },
      });

      const scriptArg = execJsonSpy.mock.calls[0][0] as string;
      expect(scriptArg).not.toContain('substring');
    });

    it('uses DEFAULT_FIELDS for ID lookup (detail view)', async () => {
      execJsonSpy.mockResolvedValueOnce({
        success: true,
        data: { tasks: [{ id: 'task-abc', name: 'Test', completed: false }] },
      } satisfies ScriptResult);

      await tool.execute({
        query: { type: 'tasks', filters: { id: 'task-abc' } },
      });

      const scriptArg = execJsonSpy.mock.calls[0][0] as string;
      // ID lookup should have full fields
      expect(scriptArg).toContain('estimatedMinutes');
      // And no truncation
      expect(scriptArg).not.toContain('substring');
    });

    it('includes fields_mode in metadata', async () => {
      execJsonSpy.mockResolvedValueOnce({
        success: true,
        data: { tasks: [{ id: 't1', name: 'Test' }] },
      } satisfies ScriptResult);

      const result = (await tool.execute({
        query: { type: 'tasks' },
      })) as any;

      expect(result.metadata.fields_mode).toBe('minimal');
    });

    it('reports fields_mode as detailed when details=true', async () => {
      execJsonSpy.mockResolvedValueOnce({
        success: true,
        data: { tasks: [{ id: 't1', name: 'Test' }] },
      } satisfies ScriptResult);

      const result = (await tool.execute({
        query: { type: 'tasks', details: true },
      })) as any;

      expect(result.metadata.fields_mode).toBe('detailed');
    });

    it('reports fields_mode as explicit when fields are provided', async () => {
      execJsonSpy.mockResolvedValueOnce({
        success: true,
        data: { tasks: [{ id: 't1', name: 'Test' }] },
      } satisfies ScriptResult);

      const result = (await tool.execute({
        query: { type: 'tasks', fields: ['id', 'name'] },
      })) as any;

      expect(result.metadata.fields_mode).toBe('explicit');
    });

    it('merges today mode extra fields into MINIMAL_FIELDS', async () => {
      execJsonSpy.mockResolvedValueOnce({
        success: true,
        data: {
          tasks: [{ id: 't1', name: 'Test', dueDate: '2026-03-01T17:00:00.000Z', reason: 'due_soon' }],
        },
      } satisfies ScriptResult);

      await tool.execute({
        query: { type: 'tasks', mode: 'today' },
      });

      const scriptArg = execJsonSpy.mock.calls[0][0] as string;
      // Should have today-specific fields
      expect(scriptArg).toContain('reason');
      expect(scriptArg).toContain('daysOverdue');
      expect(scriptArg).toContain('modified');
      // But not all detail fields (note shouldn't be there)
      expect(scriptArg).not.toContain('estimatedMinutes');
    });
  });

  // ─── Inbox + Sort (sortedInScript fix) ──────────────────────────

  describe('inbox mode with user-specified sort', () => {
    it('applies sort post-hoc for inbox queries (sort not lost)', async () => {
      // Inbox tasks returned unsorted from script
      execJsonSpy.mockResolvedValueOnce({
        success: true,
        data: {
          tasks: [
            { id: 't2', name: 'Banana', dueDate: '2026-03-01T17:00:00.000Z' },
            { id: 't1', name: 'Apple', dueDate: '2026-02-15T17:00:00.000Z' },
            { id: 't3', name: 'Cherry', dueDate: null },
          ],
        },
      } satisfies ScriptResult);

      const result = (await tool.execute({
        query: {
          type: 'tasks',
          filters: { project: null },
          sort: [{ field: 'name', direction: 'asc' }],
        },
      })) as any;

      expect(result.success).toBe(true);
      // Tasks should be sorted by name ascending (post-hoc sort applied)
      const names = result.data.tasks.map((t: any) => t.name);
      expect(names).toEqual(['Apple', 'Banana', 'Cherry']);
      expect(result.metadata.sort_applied).toBe(true);
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

  // OMN-35: coverage for previously-untested execute()-path branches. All
  // characterization tests — same execJsonSpy + mockCache harness used above.
  // Bug 6 (null→undefined in parseProjects) is split to OMN-80 as a separate
  // behavior change.

  describe('folder query (OMN-35 gap 1)', () => {
    it('fresh query: runs script, returns folders, caches, sets total_folders metadata', async () => {
      execJsonSpy.mockResolvedValueOnce({
        success: true,
        data: {
          folders: [
            { id: 'f1', name: 'Work' },
            { id: 'f2', name: 'Personal' },
          ],
        },
      } satisfies ScriptResult);

      const result = (await tool.execute({ query: { type: 'folders' } })) as any;

      expect(result.success).toBe(true);
      expect(result.data.folders).toHaveLength(2);
      expect(result.metadata.total_folders).toBe(2);
      expect(result.metadata.from_cache).not.toBe(true);
      expect(mockCache.set).toHaveBeenCalledWith('folders', 'folders_list_basic', { folders: expect.any(Array) });
    });

    it('cache hit: returns cached folders, does NOT call execJson, from_cache:true', async () => {
      (mockCache.get as ReturnType<typeof vi.fn>).mockReturnValueOnce({
        folders: [{ id: 'f1', name: 'Cached' }],
      });

      const result = (await tool.execute({ query: { type: 'folders' } })) as any;

      expect(result.success).toBe(true);
      expect(result.data.folders).toEqual([{ id: 'f1', name: 'Cached' }]);
      expect(result.metadata.from_cache).toBe(true);
      expect(execJsonSpy).not.toHaveBeenCalled();
    });

    it('data.items fallback when no data.folders key (script-shape tolerance)', async () => {
      execJsonSpy.mockResolvedValueOnce({
        success: true,
        data: { items: [{ id: 'f9', name: 'FromItems' }] },
      } satisfies ScriptResult);

      const result = (await tool.execute({ query: { type: 'folders' } })) as any;

      expect(result.success).toBe(true);
      expect(result.data.folders).toEqual([{ id: 'f9', name: 'FromItems' }]);
    });

    it('script error: returns SCRIPT_ERROR with the script-supplied message', async () => {
      execJsonSpy.mockResolvedValueOnce({
        success: false,
        error: 'JXA folder enumeration failed',
        details: 'permission denied',
      } satisfies ScriptResult);

      const result = (await tool.execute({ query: { type: 'folders' } })) as any;

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('SCRIPT_ERROR');
      expect(result.error.message).toBe('JXA folder enumeration failed');
      expect(mockCache.set).not.toHaveBeenCalled();
    });
  });

  describe('countOnly through execute() (OMN-35 gap 2)', () => {
    it('returns count + metadata flags + overrides summary.total_count from JXA', async () => {
      execJsonSpy.mockResolvedValueOnce({
        success: true,
        data: { count: 42, optimization: 'omnijs_count_no_tags', filter_description: 'flagged' },
      } satisfies ScriptResult);

      const result = (await tool.execute({
        query: { type: 'tasks', filters: { flagged: true }, countOnly: true },
      })) as any;

      expect(result.success).toBe(true);
      expect(result.metadata.count_only).toBe(true);
      expect(result.metadata.total_count).toBe(42);
      // Summary total_count must reflect the JXA count, not the 0 from the empty tasks[] array
      expect(result.summary.total_count).toBe(42);
      expect(result.metadata.optimization).toBe('omnijs_count_no_tags');
    });

    it('mode:"inbox" + countOnly auto-injects inInbox into the count filter', async () => {
      execJsonSpy.mockResolvedValueOnce({
        success: true,
        data: { count: 7 },
      } satisfies ScriptResult);

      const result = (await tool.execute({
        query: { type: 'tasks', mode: 'inbox', countOnly: true },
      })) as any;

      expect(result.success).toBe(true);
      expect(result.metadata.total_count).toBe(7);
      // The inbox-mode injection lives at handleTaskQuery's executeCountOnly path:
      // filters_applied echoes the countFilter, which should now carry inInbox:true.
      expect(result.metadata.filters_applied).toMatchObject({ inInbox: true });
    });

    it('script error during count: returns SCRIPT_ERROR', async () => {
      execJsonSpy.mockResolvedValueOnce({
        success: false,
        error: 'count script failed',
      } satisfies ScriptResult);

      const result = (await tool.execute({
        query: { type: 'tasks', filters: { flagged: true }, countOnly: true },
      })) as any;

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('SCRIPT_ERROR');
    });
  });

  describe('sort with date fields and null values (OMN-35 gap 3)', () => {
    // Inbox path exercises post-hoc sortTasks (non-inbox sorts are embedded in
    // OmniJS — sortedInScript:true — and skip post-hoc). Mirrors existing
    // inbox+name sort test pattern.

    it('dueDate asc: null dueDate sorts LAST regardless of name', async () => {
      execJsonSpy.mockResolvedValueOnce({
        success: true,
        data: {
          tasks: [
            { id: 't_null', name: 'Zebra', dueDate: null },
            { id: 't_late', name: 'Mango', dueDate: '2026-12-01T17:00:00.000Z' },
            { id: 't_early', name: 'Apple', dueDate: '2026-01-15T17:00:00.000Z' },
          ],
        },
      } satisfies ScriptResult);

      const result = (await tool.execute({
        query: {
          type: 'tasks',
          filters: { project: null },
          sort: [{ field: 'dueDate', direction: 'asc' }],
        },
      })) as any;

      expect(result.success).toBe(true);
      const ids = result.data.tasks.map((t: any) => t.id);
      expect(ids).toEqual(['t_early', 't_late', 't_null']); // null last
    });

    it('dueDate desc: null dueDate STILL sorts last (nulls-last regardless of direction)', async () => {
      execJsonSpy.mockResolvedValueOnce({
        success: true,
        data: {
          tasks: [
            { id: 't_null', name: 'Zebra', dueDate: null },
            { id: 't_late', name: 'Mango', dueDate: '2026-12-01T17:00:00.000Z' },
            { id: 't_early', name: 'Apple', dueDate: '2026-01-15T17:00:00.000Z' },
          ],
        },
      } satisfies ScriptResult);

      const result = (await tool.execute({
        query: {
          type: 'tasks',
          filters: { project: null },
          sort: [{ field: 'dueDate', direction: 'desc' }],
        },
      })) as any;

      expect(result.success).toBe(true);
      const ids = result.data.tasks.map((t: any) => t.id);
      expect(ids).toEqual(['t_late', 't_early', 't_null']); // desc by date, null still last
    });
  });

  describe('offset pagination through execute() (OMN-35 gap 4)', () => {
    it('supplied offset reaches metadata.offset', async () => {
      execJsonSpy.mockResolvedValueOnce({
        success: true,
        data: { tasks: [{ id: 't1', name: 'A' }] },
      } satisfies ScriptResult);

      const result = (await tool.execute({
        query: { type: 'tasks', offset: 50, limit: 10 },
      })) as any;

      expect(result.success).toBe(true);
      expect(result.metadata.offset).toBe(50);
    });

    it('defaults metadata.offset to 0 when not supplied', async () => {
      execJsonSpy.mockResolvedValueOnce({
        success: true,
        data: { tasks: [] },
      } satisfies ScriptResult);

      const result = (await tool.execute({ query: { type: 'tasks' } })) as any;

      expect(result.success).toBe(true);
      expect(result.metadata.offset).toBe(0);
    });
  });

  describe('tasks are intentionally NOT cached (OMN-35 gap 5 — regression guard)', () => {
    // Projects, tags, and folders are cached; tasks deliberately are not (they
    // change too frequently). This test exists so a future "let's cache tasks
    // for speed" change has to consciously delete this guard. Comment-linked
    // to OMN-35.
    it('two identical task queries both hit execJson; cache.set is never called with "tasks"', async () => {
      execJsonSpy.mockResolvedValue({
        success: true,
        data: { tasks: [{ id: 't1', name: 'A' }] },
      } satisfies ScriptResult);

      const query = { type: 'tasks' as const, filters: { flagged: true } };
      await tool.execute({ query });
      await tool.execute({ query });

      expect(execJsonSpy).toHaveBeenCalledTimes(2);
      const setCalls = (mockCache.set as ReturnType<typeof vi.fn>).mock.calls;
      const tasksCacheCalls = setCalls.filter((args) => args[0] === 'tasks');
      expect(tasksCacheCalls).toHaveLength(0);
    });
  });
});
