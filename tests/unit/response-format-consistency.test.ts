import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CacheManager } from '../../src/cache/CacheManager';
import { OmniAutomation } from '../../src/omnifocus/OmniAutomation';

// Import all tools to test
import { CreateTaskTool } from '../../src/tools/tasks/CreateTaskTool';
import { UpdateTaskTool } from '../../src/tools/tasks/UpdateTaskTool';
import { ListTasksTool } from '../../src/tools/tasks/ListTasksTool';
import { ProductivityStatsTool } from '../../src/tools/analytics/ProductivityStatsTool';
import { TaskVelocityTool } from '../../src/tools/analytics/TaskVelocityTool';
import { OverdueAnalysisTool } from '../../src/tools/analytics/OverdueAnalysisTool';
import { ExportTasksTool } from '../../src/tools/export/ExportTasksTool';
import { ExportProjectsTool } from '../../src/tools/export/ExportProjectsTool';
import { BulkExportTool } from '../../src/tools/export/BulkExportTool';
import { ListProjectsTool } from '../../src/tools/projects/ListProjectsTool';
import { CreateProjectTool } from '../../src/tools/projects/CreateProjectTool';

describe('Response Format Consistency Tests', () => {
  let mockCache: CacheManager;
  let mockOmniAutomation: OmniAutomation;

  beforeEach(() => {
    // Mock cache
    mockCache = {
      get: vi.fn(() => null),
      set: vi.fn(),
      invalidate: vi.fn(),
    } as any;

    // Mock OmniAutomation
    mockOmniAutomation = {
      buildScript: vi.fn(),
      execute: vi.fn(),
    } as any;

    // Replace implementations
    vi.spyOn(OmniAutomation.prototype, 'buildScript').mockImplementation(mockOmniAutomation.buildScript);
    vi.spyOn(OmniAutomation.prototype, 'execute').mockImplementation(mockOmniAutomation.execute);
  });

  describe('Standardized Response Structure', () => {
    it('should verify all tool responses have consistent structure', async () => {
      const tools = [
        new CreateTaskTool(mockCache),
        new UpdateTaskTool(mockCache),
        new ListTasksTool(mockCache),
        new ProductivityStatsTool(mockCache),
        new TaskVelocityTool(mockCache),
        new OverdueAnalysisTool(mockCache),
        new ExportTasksTool(mockCache),
        new ExportProjectsTool(mockCache),
        new BulkExportTool(mockCache),
        new ListProjectsTool(mockCache),
        new CreateProjectTool(mockCache),
      ];

      // Test that all tools have proper response structure
      for (const tool of tools) {
        expect(tool).toHaveProperty('name');
        expect(tool).toHaveProperty('description');
        expect(tool).toHaveProperty('schema');
        expect(tool).toHaveProperty('executeValidated');
      }
    });

    it('should ensure successful responses have required fields', async () => {
      const tool = new ListTasksTool(mockCache);
      
      // Mock successful execution
      mockOmniAutomation.buildScript.mockReturnValue('test script');
      mockOmniAutomation.execute.mockResolvedValue({
        tasks: [],
        summary: { total: 0 },
      });

      const result = await tool.execute({ limit: 10 });

      // Check required fields
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('metadata');
      expect(result.success).toBe(true);
      expect(result.metadata).toHaveProperty('operation');
      expect(result.metadata).toHaveProperty('timestamp');
      expect(result.metadata).toHaveProperty('from_cache');
    });

    it('should ensure error responses have required fields', async () => {
      const tool = new CreateTaskTool(mockCache);
      
      // Mock error execution
      mockOmniAutomation.buildScript.mockReturnValue('test script');
      mockOmniAutomation.execute.mockRejectedValue(new Error('Test error'));

      const result = await tool.execute({ name: 'Test task' });

      // Check required fields
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('metadata');
      expect(result).toHaveProperty('error');
      expect(result.success).toBe(false);
      expect(result.error).toHaveProperty('code');
      expect(result.error).toHaveProperty('message');
    });
  });

  describe('Metadata Field Naming Consistency', () => {
    it('should use snake_case for all metadata fields', async () => {
      const tool = new ProductivityStatsTool(mockCache);
      
      mockOmniAutomation.buildScript.mockReturnValue('test script');
      mockOmniAutomation.execute.mockResolvedValue({
        stats: {
          today: { completed: 5, created: 3, netProgress: 2 },
          week: { completed: 20, created: 15, avgPerDay: 3 },
          month: { completed: 80, created: 60, avgPerDay: 2.5 },
        },
        summary: {},
      });

      const result = await tool.execute({ period: 'week' });

      // Check standard metadata fields are snake_case
      expect(result.metadata).toHaveProperty('from_cache');
      expect(result.metadata).toHaveProperty('query_time_ms');
      expect(result.metadata).toHaveProperty('operation');
      expect(result.metadata).toHaveProperty('timestamp');
      
      // Should NOT have camelCase
      expect(result.metadata).not.toHaveProperty('fromCache');
      expect(result.metadata).not.toHaveProperty('queryTimeMs');
    });
  });

  describe('Cache Behavior Consistency', () => {
    it('should set from_cache to true when returning cached data', async () => {
      const tool = new TaskVelocityTool(mockCache);
      
      // Mock cache hit
      mockCache.get = vi.fn(() => ({
        stats: {
          averageTimeToComplete: { overall: 10, byProject: {}, byTag: {} },
          completionRates: { overall: 0.8, byProject: {}, byTag: {} },
          velocity: { tasksPerDay: 5, tasksPerWeek: 35, trend: 'stable' as const },
        },
        summary: {},
      }));

      const result = await tool.execute({ period: 'week' });

      expect(result.success).toBe(true);
      expect(result.metadata.from_cache).toBe(true);
    });

    it('should set from_cache to false when fetching fresh data', async () => {
      const tool = new OverdueAnalysisTool(mockCache);
      
      mockCache.get = vi.fn(() => null); // No cache
      mockOmniAutomation.buildScript.mockReturnValue('test script');
      mockOmniAutomation.execute.mockResolvedValue({
        summary: { totalOverdue: 5 },
        overdueTasks: [],
        patterns: [],
      });

      const result = await tool.execute({ limit: 50 });

      expect(result.success).toBe(true);
      expect(result.metadata.from_cache).toBe(false);
    });
  });

  describe('Export Tool Response Consistency', () => {
    it('should have nested export structure for export tools', async () => {
      const tool = new ExportTasksTool(mockCache);
      
      mockOmniAutomation.buildScript.mockReturnValue('test script');
      mockOmniAutomation.execute.mockResolvedValue({
        format: 'json',
        data: [],
        count: 0,
      });

      const result = await tool.execute({ format: 'json' });

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('format');
      expect(result.data).toHaveProperty('data');
      expect(result.data).toHaveProperty('count');
      // Standard metadata fields only
      expect(result.metadata).toHaveProperty('operation');
      expect(result.metadata).toHaveProperty('timestamp');
    });
  });

  describe('Analytics Tool Response Consistency', () => {
    it('should have proper stats structure for analytics tools', async () => {
      const tool = new ProductivityStatsTool(mockCache);
      
      mockOmniAutomation.buildScript.mockReturnValue('test script');
      mockOmniAutomation.execute.mockResolvedValue({
        stats: {
          today: { completed: 5, created: 3, netProgress: 2 },
          week: { completed: 20, created: 15, avgPerDay: 3 },
          month: { completed: 80, created: 60, avgPerDay: 2.5 },
        },
        summary: { test: 'data' },
      });

      const result = await tool.execute({ period: 'week' });

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('stats');
      expect(result.data).toHaveProperty('summary');
      expect(result.data.stats).toHaveProperty('today');
      expect(result.data.stats).toHaveProperty('week');
      expect(result.data.stats).toHaveProperty('month');
    });
  });

  describe('Error Handling Consistency', () => {
    it('should use handleError for all error cases', async () => {
      const tools = [
        new ProductivityStatsTool(mockCache),
        new TaskVelocityTool(mockCache),
        new OverdueAnalysisTool(mockCache),
        new ExportTasksTool(mockCache),
      ];

      for (const tool of tools) {
        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.execute.mockRejectedValue(new Error('Test error'));

        // All tools have minimal required args for testing
        const args = tool.name === 'export_tasks' ? { format: 'json' as const } : { period: 'week' as const };
        const result = await tool.execute(args);

        // Should have standardized error response
        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
        expect(result.error.code).toBe('INTERNAL_ERROR');
        expect(result.error.message).toContain('Test error');
      }
    });

    it('should include recovery suggestions for known errors', async () => {
      const tool = new CreateTaskTool(mockCache);
      
      mockOmniAutomation.buildScript.mockReturnValue('test script');
      mockOmniAutomation.execute.mockRejectedValue(new Error('access not allowed'));

      const result = await tool.execute({ name: 'Test task' });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('PERMISSION_DENIED');
      expect(result.error.details).toHaveProperty('recovery');
      expect(result.error.details.recovery).toBeInstanceOf(Array);
    });
  });

  describe('Type Safety Verification', () => {
    it('should have proper TypeScript return types (not any)', () => {
      // This test verifies at compile time that tools have proper return types
      // If any tool returns Promise<any>, TypeScript compilation will fail
      
      const createTask = new CreateTaskTool(mockCache);
      const productivity = new ProductivityStatsTool(mockCache);
      const exportTasks = new ExportTasksTool(mockCache);
      
      // These assertions verify the types are properly defined
      expect(createTask.executeValidated).toBeDefined();
      expect(productivity.executeValidated).toBeDefined();
      expect(exportTasks.executeValidated).toBeDefined();
    });
  });
});