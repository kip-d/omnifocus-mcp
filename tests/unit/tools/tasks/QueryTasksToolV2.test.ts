import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryTasksTool } from '../../../../src/tools/tasks/QueryTasksTool';
import { CacheManager } from '../../../../src/cache/CacheManager';

vi.mock('../../../../src/cache/CacheManager');
vi.mock('../../../../src/omnifocus/OmniAutomation');

describe('QueryTasksTool', () => {
  let tool: QueryTasksTool;
  let mockCache: CacheManager;
  let mockOmni: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockCache = {
      get: vi.fn().mockReturnValue(null),
      set: vi.fn(),
      invalidate: vi.fn(),
    } as any;

    tool = new QueryTasksTool(mockCache);

    // Mock OmniAutomation
    mockOmni = {
      executeJson: vi.fn(),
      executeTyped: vi.fn(async (_s: string, schema: any) =>
        schema.parse({
          tasks: [],
          overdueCount: 0,
          dueTodayCount: 0,
          flaggedCount: 0,
        }),
      ),
      buildScript: vi.fn((template, params) => `script with ${JSON.stringify(params)}`),
    };
    (tool as any).omniAutomation = mockOmni;
  });

  describe('properties', () => {
    it('should have correct name and description', () => {
      expect(tool.name).toBe('tasks');
      expect(tool.description).toContain('Query OmniFocus tasks');
      expect(tool.description).toContain('MODES:');
      expect(tool.description).toContain('ADVANCED QUERIES');
      expect(tool.description).toContain('CONVERSION PATTERN');
    });
  });

  describe('schema validation', () => {
    it('should accept valid mode values', async () => {
      const modes = ['all', 'overdue', 'today', 'upcoming', 'available', 'blocked', 'flagged', 'smart_suggest'];

      for (const mode of modes) {
        mockOmni.executeJson.mockResolvedValueOnce({
          tasks: [],
          summary: { total_tasks: 0, completed: 0, incomplete: 0 },
        });

        const result = await tool.execute({ mode, limit: 25, details: false });
        expect(result.success).toBe(true);
      }

      // Search mode requires search parameter
      mockOmni.executeJson.mockResolvedValueOnce({
        tasks: [],
        summary: { total_tasks: 0, completed: 0, incomplete: 0 },
      });
      const searchResult = await tool.execute({ mode: 'search', search: 'test', limit: 25, details: false });
      expect(searchResult.success).toBe(true);
    });

    it('should reject invalid mode', async () => {
      await expect(tool.execute({ mode: 'invalid' })).rejects.toThrow('Invalid parameters');
    });

    it('should accept search parameters', async () => {
      mockOmni.executeJson.mockResolvedValueOnce({
        tasks: [],
        summary: { total_tasks: 0, completed: 0, incomplete: 0 },
      });

      const result = await tool.execute({
        mode: 'search',
        search: 'meeting',
      });

      expect(result.success).toBe(true);
    });

    it('should accept project filter', async () => {
      mockOmni.executeJson.mockResolvedValueOnce({
        tasks: [],
        summary: { total_tasks: 0, completed: 0, incomplete: 0 },
      });

      const result = await tool.execute({
        mode: 'all',
        project: 'Work',
      });

      expect(result.success).toBe(true);
    });

    it('should accept tags filter', async () => {
      mockOmni.executeJson.mockResolvedValueOnce({
        tasks: [],
        summary: { total_tasks: 0, completed: 0, incomplete: 0 },
      });

      const result = await tool.execute({
        mode: 'all',
        tags: ['urgent', 'work'],
      });

      expect(result.success).toBe(true);
    });

    it('should handle boolean completed parameter', async () => {
      mockOmni.executeJson.mockResolvedValueOnce({
        tasks: [],
        summary: { total_tasks: 0, completed: 0, incomplete: 0 },
      });

      const result = await tool.execute({
        mode: 'all',
        completed: true,
      });

      expect(result.success).toBe(true);
    });

    it('should coerce string boolean values', async () => {
      mockOmni.executeJson.mockResolvedValueOnce({
        tasks: [],
        summary: { total_tasks: 0, completed: 0, incomplete: 0 },
      });

      const result = await tool.execute({
        mode: 'all',
        completed: 'true' as any,
      });

      expect(result.success).toBe(true);
    });

    it('should handle dueBy parameter', async () => {
      mockOmni.executeJson.mockResolvedValueOnce({
        tasks: [],
        summary: { total_tasks: 0, completed: 0, incomplete: 0 },
      });

      const result = await tool.execute({
        mode: 'all',
        dueBy: 'tomorrow',
      });

      expect(result.success).toBe(true);
    });

    it('should handle daysAhead parameter', async () => {
      mockOmni.executeJson.mockResolvedValueOnce({
        tasks: [],
        summary: { total_tasks: 0, completed: 0, incomplete: 0 },
      });

      const result = await tool.execute({
        mode: 'upcoming',
        daysAhead: 7,
      });

      expect(result.success).toBe(true);
    });

    it('should coerce string daysAhead to number', async () => {
      mockOmni.executeJson.mockResolvedValueOnce({
        tasks: [],
        summary: { total_tasks: 0, completed: 0, incomplete: 0 },
      });

      const result = await tool.execute({
        mode: 'upcoming',
        daysAhead: '14' as any,
      });

      expect(result.success).toBe(true);
    });

    it('should enforce daysAhead min/max limits', async () => {
      await expect(
        tool.execute({
          mode: 'upcoming',
          daysAhead: 0,
        }),
      ).rejects.toThrow('Invalid parameters');

      await expect(
        tool.execute({
          mode: 'upcoming',
          daysAhead: 31,
        }),
      ).rejects.toThrow('Invalid parameters');
    });

    it('should handle limit parameter', async () => {
      mockOmni.executeJson.mockResolvedValueOnce({
        tasks: [],
        summary: { total_tasks: 0, completed: 0, incomplete: 0 },
      });

      const result = await tool.execute({
        mode: 'all',
        limit: 50,
      });

      expect(result.success).toBe(true);
    });

    it('should coerce string limit to number', async () => {
      mockOmni.executeJson.mockResolvedValueOnce({
        tasks: [],
        summary: { total_tasks: 0, completed: 0, incomplete: 0 },
      });

      const result = await tool.execute({
        mode: 'all',
        limit: '100' as any,
      });

      expect(result.success).toBe(true);
    });

    it('should enforce limit min/max bounds', async () => {
      await expect(
        tool.execute({
          mode: 'all',
          limit: 0,
        }),
      ).rejects.toThrow('Invalid parameters');

      await expect(
        tool.execute({
          mode: 'all',
          limit: 201,
        }),
      ).rejects.toThrow('Invalid parameters');
    });

    it('should handle offset parameter for pagination', async () => {
      mockOmni.executeJson.mockResolvedValueOnce({
        tasks: [],
        summary: { total_tasks: 0, completed: 0, incomplete: 0 },
      });

      const result = await tool.execute({
        mode: 'all',
        limit: 100,
        offset: 200,
      });

      expect(result.success).toBe(true);
    });

    it('should coerce string offset to number', async () => {
      mockOmni.executeJson.mockResolvedValueOnce({
        tasks: [],
        summary: { total_tasks: 0, completed: 0, incomplete: 0 },
      });

      const result = await tool.execute({
        mode: 'all',
        offset: '100' as any,
      });

      expect(result.success).toBe(true);
    });

    it('should reject negative offset', async () => {
      await expect(
        tool.execute({
          mode: 'all',
          offset: -1,
        }),
      ).rejects.toThrow('Invalid parameters');
    });

    it('should handle details parameter', async () => {
      mockOmni.executeJson.mockResolvedValueOnce({
        tasks: [],
        summary: { total_tasks: 0, completed: 0, incomplete: 0 },
      });

      const result = await tool.execute({
        mode: 'all',
        details: true,
      });

      expect(result.success).toBe(true);
    });

    it('should coerce string details to boolean', async () => {
      mockOmni.executeJson.mockResolvedValueOnce({
        tasks: [],
        summary: { total_tasks: 0, completed: 0, incomplete: 0 },
      });

      const result = await tool.execute({
        mode: 'all',
        details: 'true' as any,
      });

      expect(result.success).toBe(true);
    });

    it('should use default values', async () => {
      mockOmni.executeJson.mockResolvedValueOnce({
        tasks: [],
        summary: { total_tasks: 0, completed: 0, incomplete: 0 },
      });

      const result = await tool.execute({});

      expect(result.success).toBe(true);
      // Default mode is 'all', limit is 25, details is false
    });
  });

  describe('response handling', () => {
    it('should return task list with summary', async () => {
      const mockTasks = [
        {
          id: 'task1',
          name: 'Test Task 1',
          completed: false,
          flagged: true,
        },
        {
          id: 'task2',
          name: 'Test Task 2',
          completed: true,
          flagged: false,
        },
      ];

      mockOmni.executeJson.mockResolvedValueOnce({
        tasks: mockTasks,
        summary: {
          total_tasks: 2,
          completed: 1,
          incomplete: 1,
          flagged: 1,
        },
      });

      const result = await tool.execute({ mode: 'all' });

      expect(result.success).toBe(true);
      // The summary is auto-generated by createTaskResponseV2
      expect(result.summary).toBeDefined();
      expect(result.summary.total_count).toBe(2);
      expect(result.data.tasks).toHaveLength(2);
      expect(result.data.tasks[0].name).toBe('Test Task 1');
    });

    it('should handle empty results', async () => {
      mockOmni.executeJson.mockResolvedValueOnce({
        tasks: [],
        summary: { total_tasks: 0, completed: 0, incomplete: 0 },
      });

      const result = await tool.execute({ mode: 'search', search: 'nonexistent' });

      expect(result.success).toBe(true);
      expect(result.summary.total_count).toBe(0);
      expect(result.data.tasks).toHaveLength(0);
    });

    it('should include metadata in response', async () => {
      mockOmni.executeJson.mockResolvedValueOnce({
        tasks: [],
        summary: { total_tasks: 0, completed: 0, incomplete: 0 },
      });

      const result = await tool.execute({ mode: 'all' });

      expect(result.metadata).toBeDefined();
      expect(result.metadata.operation).toBe('tasks');
      expect(result.metadata.timestamp).toBeDefined();
      expect(result.metadata.query_time_ms).toBeGreaterThanOrEqual(0);
    });

    it('preserves parent metadata when querying project tasks', async () => {
      mockOmni.executeJson.mockResolvedValueOnce({
        tasks: [
          {
            id: 'parent-1',
            name: 'Parent Task',
            childCounts: { total: 1 },
          },
          {
            id: 'child-1',
            name: 'Child Task',
            parentTaskId: 'parent-1',
            parentTaskName: 'Parent Task',
            flagged: true,
            tags: ['IntegrationTag'],
          },
        ],
        summary: { total_tasks: 2, completed: 0, incomplete: 2 },
      });

      const result = await tool.execute({
        mode: 'all',
        project: 'Integration Project',
        details: true,
      });

      expect(result.success).toBe(true);
      const tasks = result.data?.tasks ?? [];

      const child = tasks.find((task) => task.id === 'child-1');
      expect(child?.parentTaskId).toBe('parent-1');
      expect(child?.parentTaskName).toBe('Parent Task');
      expect(Array.isArray(child?.tags)).toBe(true);
      expect(child?.tags).toContain('IntegrationTag');
      expect(child?.flagged).toBe(true);

      const parent = tasks.find((task) => task.id === 'parent-1');
      expect(parent?.childCounts?.total).toBe(1);
    });
  });

  describe('mode-specific behavior', () => {
    it('should handle search mode', async () => {
      mockOmni.executeJson.mockResolvedValueOnce({
        tasks: [{ id: 'task1', name: 'Meeting notes', completed: false }],
        summary: { total_tasks: 1, completed: 0, incomplete: 1 },
      });

      const result = await tool.execute({
        mode: 'search',
        search: 'meeting',
      });

      expect(result.success).toBe(true);
      // V4 AST-powered script no longer uses buildScript, it generates scripts directly
      expect(mockOmni.executeJson).toHaveBeenCalled();
    });

    it('should handle today mode', async () => {
      mockOmni.executeJson.mockResolvedValueOnce({
        tasks: [],
        summary: {
          total_tasks: 3,
          completed: 0,
          incomplete: 3,
          dueSoon: 2,
          flagged: 1,
        },
      });

      const result = await tool.execute({ mode: 'today' });

      expect(result.success).toBe(true);
      expect(result.summary).toBeDefined();
    });

    it('should handle today mode via AST builder with metadata', async () => {
      mockOmni.executeJson.mockResolvedValueOnce({
        tasks: [
          { id: 't1', name: 'Overdue task', reason: 'overdue', daysOverdue: 3 },
          { id: 't2', name: 'Due soon task', reason: 'due_soon', daysOverdue: 0 },
          { id: 't3', name: 'Flagged task', reason: 'flagged', daysOverdue: 0 },
        ],
      });

      const result = await tool.execute({ mode: 'today' });

      expect(result.success).toBe(true);
      expect(result.metadata).toBeDefined();
      if (result.metadata) {
        expect(result.metadata.mode).toBe('today');
        expect(result.metadata.overdue_count).toBe(1);
        expect(result.metadata.due_soon_count).toBe(1);
        expect(result.metadata.flagged_count).toBe(1);
        expect(result.metadata.due_soon_days).toBe(3);
      }
      // Should use AST builder (executeJson), not legacy buildScript
      expect(mockOmni.executeJson).toHaveBeenCalled();
    });

    it('should handle overdue mode', async () => {
      mockOmni.executeJson.mockResolvedValueOnce({
        tasks: [],
        summary: {
          total_tasks: 5,
          completed: 0,
          incomplete: 5,
          overdue: 5,
        },
      });

      const result = await tool.execute({ mode: 'overdue' });

      expect(result.success).toBe(true);
    });

    it('should handle overdue mode via AST builder (not legacy buildScript)', async () => {
      mockOmni.executeJson.mockResolvedValueOnce({
        tasks: [{ id: 't1', name: 'Overdue task', dueDate: '2020-01-01T17:00:00.000Z' }],
      });

      const result = await tool.execute({ mode: 'overdue' });

      expect(result.success).toBe(true);
      // AST-based overdue does NOT call buildScript — it generates the script directly
      expect(mockOmni.buildScript).not.toHaveBeenCalled();
      // It should still call executeJson (via execJson)
      expect(mockOmni.executeJson).toHaveBeenCalled();
      // Metadata should indicate sort was applied
      expect(result.metadata.mode).toBe('overdue');
      expect(result.metadata.sort_applied).toBe(true);
    });

    it('should handle upcoming mode via AST builder (not legacy buildScript)', async () => {
      mockOmni.executeJson.mockResolvedValueOnce({
        tasks: [{ id: 'abc', name: 'Upcoming task', dueDate: '2026-02-10T17:00:00.000Z' }],
      });

      const result = await tool.execute({
        mode: 'upcoming',
        daysAhead: 14,
      });

      expect(result.success).toBe(true);
      // AST-based upcoming does NOT call buildScript — it generates the script directly
      expect(mockOmni.buildScript).not.toHaveBeenCalled();
      expect(mockOmni.executeJson).toHaveBeenCalled();
      expect(result.metadata.mode).toBe('upcoming');
      expect(result.metadata.days_ahead).toBe(14);
      expect(result.metadata.sort_applied).toBe(true);
    });

    it('should handle flagged mode via AST builder (not legacy buildScript)', async () => {
      mockOmni.executeJson.mockResolvedValueOnce({
        tasks: [{ id: 'abc', name: 'Flagged task', flagged: true }],
      });

      const result = await tool.execute({ mode: 'flagged' });

      expect(result.success).toBe(true);
      // AST-based flagged does NOT call buildScript — it generates the script directly
      expect(mockOmni.buildScript).not.toHaveBeenCalled();
      expect(mockOmni.executeJson).toHaveBeenCalled();
      expect(result.metadata.mode).toBe('flagged');
    });
  });

  describe('error handling', () => {
    it('should handle script execution errors', async () => {
      mockOmni.executeJson.mockResolvedValueOnce({
        success: false,
        error: 'Script failed',
        details: { code: -1743 },
      });

      const result = await tool.execute({ mode: 'all' });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      // The actual error message is 'Failed to get tasks'
      expect(result.error.message).toContain('Failed to get tasks');
    });

    it('should handle null results', async () => {
      mockOmni.executeJson.mockResolvedValueOnce(null);

      const result = await tool.execute({ mode: 'all' });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle missing summary in response', async () => {
      mockOmni.executeJson.mockResolvedValueOnce({
        tasks: [],
        // summary missing - createTaskResponseV2 will generate it
      });

      const result = await tool.execute({ mode: 'all' });

      expect(result.success).toBe(true);
      expect(result.summary).toBeDefined(); // Auto-generated
    });

    it('should handle permission errors', async () => {
      mockOmni.executeJson.mockResolvedValueOnce({
        success: false,
        error: 'Error: -1743 - Not allowed to send Apple events',
        details: { code: -1743 },
      });

      const result = await tool.execute({ mode: 'all' });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('PERMISSION_DENIED');
      // The suggestion should contain System Settings
      expect(result.error.suggestion).toContain('System Settings');
    });

    it('should handle timeout errors', async () => {
      mockOmni.executeJson.mockRejectedValueOnce(new Error('Script execution timed out'));

      const result = await tool.execute({ mode: 'all' });

      expect(result.success).toBe(false);
      // The base tool maps timeout errors to SCRIPT_TIMEOUT
      expect(result.error.code).toBe('SCRIPT_TIMEOUT');
      expect(result.error.message).toContain('timed out');
      // Suggestion may or may not be defined
    });
  });

  describe('caching behavior', () => {
    it('should check cache before executing script', async () => {
      const cachedData = {
        tasks: [{ id: 'cached', name: 'Cached Task' }],
        summary: { total_tasks: 1, completed: 0, incomplete: 1 },
      };

      mockCache.get.mockReturnValueOnce(cachedData);

      // Use a mode that actually checks cache (not 'all')
      const result = await tool.execute({ mode: 'overdue' });

      expect(mockCache.get).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.metadata.from_cache).toBe(true);
    });

    it('should cache successful results', async () => {
      const responseData = {
        tasks: [{ id: 'new', name: 'New Task' }],
        summary: { total_tasks: 1, completed: 0, incomplete: 1 },
      };

      mockOmni.executeJson.mockResolvedValueOnce(responseData);

      // Use a mode that actually caches (not 'all')
      const result = await tool.execute({ mode: 'overdue' });

      expect(result.success).toBe(true);
      expect(mockCache.set).toHaveBeenCalledWith(
        'tasks',
        expect.any(String),
        expect.objectContaining({
          tasks: expect.any(Array),
        }),
      );
    });
  });

  describe('input normalization', () => {
    it('should normalize boolean strings', async () => {
      mockOmni.executeJson.mockResolvedValueOnce({
        tasks: [],
        summary: { total_tasks: 0, completed: 0, incomplete: 0 },
      });

      const result = await tool.execute({
        mode: 'all',
        completed: '1' as any,
        details: 'false' as any,
      });

      expect(result.success).toBe(true);
    });

    it('should normalize numeric strings', async () => {
      mockOmni.executeJson.mockResolvedValueOnce({
        tasks: [],
        summary: { total_tasks: 0, completed: 0, incomplete: 0 },
      });

      const result = await tool.execute({
        mode: 'upcoming',
        daysAhead: '7' as any,
        limit: '50' as any,
      });

      expect(result.success).toBe(true);
    });

    it('should handle null and undefined values', async () => {
      mockOmni.executeJson.mockResolvedValueOnce({
        tasks: [],
        summary: { total_tasks: 0, completed: 0, incomplete: 0 },
      });

      const result = await tool.execute({
        mode: 'all',
        search: undefined,
        project: undefined, // undefined is allowed, null is not
      });

      expect(result.success).toBe(true);
    });
  });
});
