import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PerspectivesTool } from '../../../src/tools/perspectives/PerspectivesTool.js';
import { CacheManager } from '../../../src/cache/CacheManager.js';
import { OmniAutomation } from '../../../src/omnifocus/OmniAutomation.js';

// Mock dependencies
vi.mock('../../../src/cache/CacheManager.js');
vi.mock('../../../src/omnifocus/OmniAutomation.js');
vi.mock('../../../src/utils/logger.js', () => ({
  createLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  }))
}));

describe('PerspectivesTool', () => {
  let tool: PerspectivesTool;
  let mockCache: any;
  let mockOmniAutomation: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockCache = {
      get: vi.fn(() => null),
      set: vi.fn(),
      clear: vi.fn(),
      invalidate: vi.fn(),
    };
    
    mockOmniAutomation = {
      buildScript: vi.fn((script, params) => `built script with params: ${JSON.stringify(params)}`),
      executeJson: vi.fn(),
      execute: vi.fn(),
    };

    (CacheManager as any).mockImplementation(() => mockCache);
    (OmniAutomation as any).mockImplementation(() => mockOmniAutomation);

    tool = new PerspectivesTool(mockCache);
    (tool as any).omniAutomation = mockOmniAutomation;
  });

  describe('list operation', () => {
    it('should list perspectives with default parameters', async () => {
      const mockResult = {
        perspectives: [
          { name: 'Inbox', isBuiltIn: true },
          { name: 'Projects', isBuiltIn: true },
          { name: 'Custom View', isBuiltIn: false }
        ],
        metadata: { count: 3 }
      };

      mockOmniAutomation.executeJson.mockResolvedValue({ success: true, data: mockResult });

      const result = await tool.execute({ operation: 'list' });

      expect(result.success).toBe(true);
      expect(result.data.perspectives).toHaveLength(3);
      // The tool should sort perspectives by name
      const names = result.data.perspectives.map((p: any) => p.name);
      // Sorting happens in the tool, so we should see alphabetical order
      expect(names).toEqual(['Custom View', 'Inbox', 'Projects']);
      expect(mockOmniAutomation.buildScript).toHaveBeenCalled();
    });

    it('should include filter rules when requested', async () => {
      const mockResult = {
        perspectives: [
          { 
            name: 'Flagged', 
            isBuiltIn: true,
            filterRules: { flagged: true }
          }
        ],
        metadata: { count: 1 }
      };

      mockOmniAutomation.executeJson.mockResolvedValue({ success: true, data: mockResult });

      const result = await tool.executeValidated({
        operation: 'list',
        includeFilterRules: true
      });

      expect(result.success).toBe(true);
      expect(result.data.perspectives[0].filterRules).toBeDefined();
      expect(result.data.perspectives[0].filterRules.flagged).toBe(true);
    });

    it('should handle script execution errors', async () => {
      mockOmniAutomation.executeJson.mockRejectedValue(new Error('Script failed'));

      const result = await tool.executeValidated({ operation: 'list' });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('SCRIPT_ERROR');
      expect(result.error.message).toBe('Script failed');
    });
  });

  describe('query operation', () => {
    it('should query a specific perspective', async () => {
      const mockResult = {
        success: true,
        perspectiveName: 'Today',
        perspectiveType: 'builtin',
        tasks: [
          { id: 'task1', name: 'Task 1', completed: false },
          { id: 'task2', name: 'Task 2', completed: false }
        ],
        count: 2
      };

      mockOmniAutomation.execute.mockResolvedValue(JSON.stringify(mockResult));

      const result = await tool.executeValidated({ 
        operation: 'query',
        perspectiveName: 'Today',
        limit: 50
      });

      expect(result.success).toBe(true);
      expect(result.data.perspectiveName).toBe('Today');
      expect(result.data.tasks).toHaveLength(2);
      expect(mockCache.set).toHaveBeenCalled(); // Should cache results
    });

    it('should return error when perspectiveName is missing', async () => {
      const result = await tool.executeValidated({ 
        operation: 'query'
        // Missing perspectiveName
      });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('MISSING_PARAMETER');
      expect(result.error.message).toContain('perspectiveName is required');
    });

    it('should use cached results when available', async () => {
      const cachedResult = {
        success: true,
        data: {
          perspectiveName: 'Cached',
          tasks: []
        }
      };

      mockCache.get.mockReturnValue(cachedResult);

      const result = await tool.executeValidated({ 
        operation: 'query',
        perspectiveName: 'Cached'
      });

      expect(result).toBe(cachedResult);
      expect(mockOmniAutomation.execute).not.toHaveBeenCalled();
    });

    it('should handle perspective not found', async () => {
      const mockResult = {
        success: false,
        error: 'Perspective "NonExistent" not found'
      };

      mockOmniAutomation.execute.mockResolvedValue(JSON.stringify(mockResult));

      const result = await tool.executeValidated({ 
        operation: 'query',
        perspectiveName: 'NonExistent'
      });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('PERSPECTIVE_NOT_FOUND');
      expect(result.error.message).toContain('NonExistent');
    });
  });

  describe('enhanced query operation features', () => {
    const mockTasksResult = {
      perspectiveName: 'Today',
      perspectiveType: 'builtin',
      tasks: [
        {
          id: 'task1',
          name: 'Important meeting',
          flagged: true,
          completed: false,
          dueDate: (() => {
            const today = new Date();
            today.setHours(14, 0, 0, 0); // 2 PM today (guaranteed to be today)
            return today.toISOString();
          })(),
          deferDate: null,
          project: 'Work Project',
          projectId: 'proj1',
          available: true,
          tags: ['urgent', 'meeting']
        },
        {
          id: 'task2',
          name: 'Buy groceries',
          flagged: false,
          completed: true,
          dueDate: null,
          deferDate: null,
          project: null,
          projectId: null,
          available: false,
          tags: ['personal']
        },
        {
          id: 'task3',
          name: 'Review report',
          flagged: false,
          completed: false,
          dueDate: (() => {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            yesterday.setHours(14, 0, 0, 0); // 2 PM yesterday (guaranteed overdue)
            return yesterday.toISOString();
          })(),
          deferDate: null,
          project: 'Work Project',
          projectId: 'proj1',
          available: true,
          tags: ['review']
        }
      ],
      filterRules: {},
      aggregation: 'none'
    };

    describe('formatOutput feature', () => {
      it('should return formatted output when formatOutput=true', async () => {
        mockOmniAutomation.execute.mockResolvedValue(JSON.stringify(mockTasksResult));

        const result = await tool.executeValidated({
          operation: 'query',
          perspectiveName: 'Today',
          formatOutput: true,
          groupBy: 'project'
        });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.formattedOutput).toBeDefined();
          expect(result.data.formattedOutput).toContain('📋 Today Perspective');
          expect(result.data.formattedOutput).toContain('☐'); // Incomplete task checkbox
          expect(result.data.formattedOutput).toContain('☑'); // Complete task checkbox
          expect(result.data.formattedOutput).toContain('[🚩]'); // Flagged task indicator
          expect(result.data.formattedOutput).toContain('📂 Work Project');
          expect(result.data.formattedOutput).toContain('📝 Inbox');
        }
      });

      it('should include metadata when formatOutput=true', async () => {
        mockOmniAutomation.execute.mockResolvedValue(JSON.stringify(mockTasksResult));

        const result = await tool.executeValidated({
          operation: 'query',
          perspectiveName: 'Today',
          formatOutput: true,
          includeMetadata: true
        });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.metadata).toBeDefined();
          expect(result.data.metadata.totalTasks).toBe(3);
          expect(result.data.metadata.completedTasks).toBe(1);
          expect(result.data.metadata.flaggedTasks).toBe(1);
          expect(result.data.metadata.overdueTasks).toBe(1);
          expect(result.data.metadata.availableTasks).toBe(2);
          expect(result.data.metadata.formatting).toBe('formatted');
        }
      });
    });

    describe('groupBy feature', () => {
      it('should group tasks by project when groupBy=project', async () => {
        mockOmniAutomation.execute.mockResolvedValue(JSON.stringify(mockTasksResult));

        const result = await tool.executeValidated({
          operation: 'query',
          perspectiveName: 'Today',
          groupBy: 'project'
        });

        expect(result.success).toBe(true);
        expect(result.data.groupedResults).toBeDefined();
        expect(result.data.groupedResults['Work Project']).toBeDefined();
        expect(result.data.groupedResults['Work Project'].count).toBe(2);
        expect(result.data.groupedResults['no-project']).toBeDefined();
        expect(result.data.groupedResults['no-project'].count).toBe(1);
      });

      it('should group tasks by dueDate when groupBy=dueDate', async () => {
        mockOmniAutomation.execute.mockResolvedValue(JSON.stringify(mockTasksResult));

        const result = await tool.executeValidated({
          operation: 'query',
          perspectiveName: 'Today',
          groupBy: 'dueDate'
        });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.groupedResults).toBeDefined();
          expect(result.data.groupedResults['today']).toBeDefined();
          expect(result.data.groupedResults['overdue']).toBeDefined();
          expect(result.data.groupedResults['no-due-date']).toBeDefined();
        }
      });

      it('should group tasks by status when groupBy=status', async () => {
        mockOmniAutomation.execute.mockResolvedValue(JSON.stringify(mockTasksResult));

        const result = await tool.executeValidated({
          operation: 'query',
          perspectiveName: 'Today',
          groupBy: 'status'
        });

        expect(result.success).toBe(true);
        expect(result.data.groupedResults).toBeDefined();
        expect(result.data.groupedResults['flagged']).toBeDefined();
        expect(result.data.groupedResults['completed']).toBeDefined();
        expect(result.data.groupedResults['available']).toBeDefined();
      });

      it('should group tasks by tag when groupBy=tag', async () => {
        mockOmniAutomation.execute.mockResolvedValue(JSON.stringify(mockTasksResult));

        const result = await tool.executeValidated({
          operation: 'query',
          perspectiveName: 'Today',
          groupBy: 'tag'
        });

        expect(result.success).toBe(true);
        expect(result.data.groupedResults).toBeDefined();
        expect(result.data.groupedResults['urgent']).toBeDefined();
        expect(result.data.groupedResults['personal']).toBeDefined();
        expect(result.data.groupedResults['review']).toBeDefined();
      });
    });

    describe('field selection feature', () => {
      it('should return only selected fields when fields parameter is provided', async () => {
        mockOmniAutomation.execute.mockResolvedValue(JSON.stringify(mockTasksResult));

        const result = await tool.executeValidated({
          operation: 'query',
          perspectiveName: 'Today',
          fields: ['id', 'name', 'flagged']
        });

        expect(result.success).toBe(true);
        expect(result.data.tasks).toBeDefined();
        expect(result.data.tasks.length).toBe(3);

        for (const task of result.data.tasks) {
          expect(task).toHaveProperty('id');
          expect(task).toHaveProperty('name');
          expect(task).toHaveProperty('flagged');
          expect(task).not.toHaveProperty('dueDate');
          expect(task).not.toHaveProperty('project');
          expect(task).not.toHaveProperty('tags');
        }
      });

      it('should include fields_selected in metadata', async () => {
        mockOmniAutomation.execute.mockResolvedValue(JSON.stringify(mockTasksResult));

        const result = await tool.executeValidated({
          operation: 'query',
          perspectiveName: 'Today',
          fields: ['id', 'name']
        });

        expect(result.success).toBe(true);
        expect(result.metadata.fields_selected).toBe(2);
      });
    });

    describe('cache key generation', () => {
      it('should generate different cache keys for different formatting options', async () => {
        // Mock cache to return null (no cached value) so actual execution happens
        mockCache.get.mockReturnValue(null);
        mockOmniAutomation.execute.mockResolvedValue(JSON.stringify(mockTasksResult));

        // Reset mock call counts
        mockCache.get.mockClear();
        mockCache.set.mockClear();

        // First call with basic options
        await tool.executeValidated({
          operation: 'query',
          perspectiveName: 'Today'
        });

        // Second call with enhanced options
        await tool.executeValidated({
          operation: 'query',
          perspectiveName: 'Today',
          formatOutput: true,
          groupBy: 'project',
          fields: ['id', 'name']
        });

        // Should make separate cache calls due to different keys
        expect(mockCache.get).toHaveBeenCalledTimes(2);
        expect(mockCache.set).toHaveBeenCalledTimes(2);
      });
    });

    describe('combined features', () => {
      it('should work with all enhanced features combined', async () => {
        mockOmniAutomation.execute.mockResolvedValue(JSON.stringify(mockTasksResult));

        const result = await tool.executeValidated({
          operation: 'query',
          perspectiveName: 'Today',
          formatOutput: true,
          groupBy: 'status',
          fields: ['id', 'name', 'flagged', 'completed', 'dueDate', 'project'],
          includeMetadata: true,
          limit: 10
        });

        expect(result.success).toBe(true);

        // Should have formatted output
        expect(result.data.formattedOutput).toBeDefined();
        expect(result.data.formattedOutput).toContain('📋 Today Perspective');

        // Should have grouped results
        expect(result.data.groupedResults).toBeDefined();

        // Should have metadata
        expect(result.data.metadata).toBeDefined();
        expect(result.data.metadata.formatting).toBe('formatted');
        expect(result.data.metadata.grouping).toBe('status');

        // Should have filtered fields
        expect(result.data.tasks[0]).toHaveProperty('id');
        expect(result.data.tasks[0]).toHaveProperty('name');
        expect(result.data.tasks[0]).not.toHaveProperty('tags');

        // Should have metadata in response
        expect(result.metadata.formatting_applied).toBe(true);
        expect(result.metadata.grouping_applied).toBe(true);
        expect(result.metadata.fields_selected).toBe(6);
      });
    });
  });

  describe('invalid operation', () => {
    it('should return error for invalid operation', async () => {
      const result = await tool.executeValidated({
        operation: 'invalid' as any
      });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('INVALID_OPERATION');
    });
  });
});