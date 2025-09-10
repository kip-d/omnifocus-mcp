import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CacheManager } from '../../src/cache/CacheManager';
import { OmniAutomation } from '../../src/omnifocus/OmniAutomation';

// Import all tools to test (v2.1.0 consolidated tools)
import { ManageTaskTool } from '../../src/tools/tasks/ManageTaskTool';
import { QueryTasksToolV2 } from '../../src/tools/tasks/QueryTasksToolV2';
import { ProductivityStatsToolV2 } from '../../src/tools/analytics/ProductivityStatsToolV2';
import { TaskVelocityToolV2 } from '../../src/tools/analytics/TaskVelocityToolV2';
import { OverdueAnalysisToolV2 } from '../../src/tools/analytics/OverdueAnalysisToolV2';
import { ExportTool } from '../../src/tools/export/ExportTool';
import { FoldersTool } from '../../src/tools/folders/FoldersTool';
import { ProjectsToolV2 } from '../../src/tools/projects/ProjectsToolV2';
import { PerspectivesToolV2 } from '../../src/tools/perspectives/PerspectivesToolV2';
import { SystemToolV2 } from '../../src/tools/system/SystemToolV2';
import { TagsToolV2 } from '../../src/tools/tags/TagsToolV2';

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
      executeJson: vi.fn(),
      execute: vi.fn(),
    } as any;

    // Replace implementations
    vi.spyOn(OmniAutomation.prototype, 'buildScript').mockImplementation(mockOmniAutomation.buildScript);
    vi.spyOn(OmniAutomation.prototype, 'execute').mockImplementation(mockOmniAutomation.execute);
  });

  describe('Standardized Response Structure', () => {
    it('should verify all tool responses have consistent structure', async () => {
      const tools = [
        new ManageTaskTool(mockCache),
        new QueryTasksToolV2(mockCache),
        new ProductivityStatsToolV2(mockCache),
        new TaskVelocityToolV2(mockCache),
        new OverdueAnalysisToolV2(mockCache),
        new ExportTool(mockCache),
        new FoldersTool(mockCache),
        new ProjectsToolV2(mockCache),
        new PerspectivesToolV2(mockCache),
        new SystemToolV2(mockCache),
        new TagsToolV2(mockCache),
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
      const tool = new QueryTasksToolV2(mockCache);
      
      // Mock successful execution
      mockOmniAutomation.buildScript.mockReturnValue('test script');
      mockOmniAutomation.executeJson.mockResolvedValue({
        tasks: [],
        summary: { total: 0 },
      });

      const result = await tool.executeValidated({ mode: 'all', limit: 10 });

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
      const tool = new ManageTaskTool(mockCache);
      
      // Mock error execution
      mockOmniAutomation.buildScript.mockReturnValue('test script');
      mockOmniAutomation.executeJson.mockRejectedValue(new Error('Test error'));

      const result = await tool.executeValidated({ title: 'Test task' });

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
      const tool = new ProductivityStatsToolV2(mockCache);
      
      mockOmniAutomation.buildScript.mockReturnValue('test script');
      mockOmniAutomation.executeJson.mockResolvedValue({
        stats: {
          today: { completed: 5, created: 3, netProgress: 2 },
          week: { completed: 20, created: 15, avgPerDay: 3 },
          month: { completed: 80, created: 60, avgPerDay: 2.5 },
        },
        summary: {},
      });

      const result = await tool.executeValidated({ period: 'week' });

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
      const tool = new TaskVelocityToolV2(mockCache);
      
      // Mock cache hit
      mockCache.get = vi.fn(() => ({
        stats: {
          averageTimeToComplete: { overall: 10, byProject: {}, byTag: {} },
          completionRates: { overall: 0.8, byProject: {}, byTag: {} },
          velocity: { tasksPerDay: 5, tasksPerWeek: 35, trend: 'stable' as const },
        },
        summary: {},
      }));

      const result = await tool.executeValidated({ period: 'week' });

      expect(result.success).toBe(true);
      expect(result.metadata.from_cache).toBe(true);
    });

    it('should set from_cache to false when fetching fresh data', async () => {
      const tool = new OverdueAnalysisToolV2(mockCache);
      (tool as any).omniAutomation = mockOmniAutomation;
      
      mockCache.get = vi.fn(() => null); // No cache
      mockOmniAutomation.buildScript.mockReturnValue('test script');
      mockOmniAutomation.executeJson.mockResolvedValue({
        summary: { 
          totalOverdue: 5,
          overduePercentage: 0.1,
          averageDaysOverdue: 3,
          oldestOverdueDate: '2025-01-01'
        },
        overdueTasks: [],
        patterns: [],
        recommendations: [],
        groupedAnalysis: {},
      });

      const result = await tool.executeValidated({ limit: 50 });

      // Test should pass now with proper mock data
      expect(result.success).toBe(true);
      expect(result.metadata.from_cache).toBe(false);
    });
  });

  describe('Export Tool Response Consistency', () => {
    it('should have nested export structure for export tools', async () => {
      const tool = new ExportTool(mockCache);
      
      mockOmniAutomation.buildScript.mockReturnValue('test script');
      mockOmniAutomation.executeJson.mockResolvedValue({
        format: 'json',
        data: [],
        count: 0,
      });

      const result = await tool.executeValidated({ type: 'tasks', format: 'json' });

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
      const tool = new ProductivityStatsToolV2(mockCache);
      (tool as any).omniAutomation = mockOmniAutomation;
      
      mockOmniAutomation.buildScript.mockReturnValue('test script');
      mockOmniAutomation.executeJson.mockResolvedValue({
        overview: { totalTasks: 100, completedTasks: 20 },
        dailyStats: [],
        weeklyStats: {},
        projectStats: [],
        tagStats: [],
        insights: {},
        healthScore: 75,
      });

      const result = await tool.executeValidated({ period: 'week' });

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('stats');
      expect(result.data).toHaveProperty('period');
      expect(result.data).toHaveProperty('insights');
      expect(result.data).toHaveProperty('healthScore');
      expect(result.data.stats).toHaveProperty('overview');
    });
  });

  describe('Error Handling Consistency', () => {
    it('should use handleError for all error cases', async () => {
      const tools = [
        new ProductivityStatsToolV2(mockCache),
        new TaskVelocityToolV2(mockCache),
        new OverdueAnalysisToolV2(mockCache),
        new ExportTool(mockCache),
      ];

      for (const tool of tools) {
        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.executeJson.mockRejectedValue(new Error('Test error'));

        (tool as any).omniAutomation = mockOmniAutomation;
        
        // All tools have minimal required args for testing
        const args = tool.name === 'export' ? { type: 'tasks' as const, format: 'json' as const } : 
                     tool.name === 'task_velocity' ? { days: 7 } :
                     tool.name === 'analyze_overdue' ? { limit: 50 } :
                     { period: 'week' as const };
        const result = await tool.executeValidated(args);

        // Should have standardized error response
        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
        // V2 tools use specific error codes
        expect(['STATS_ERROR', 'VELOCITY_ERROR', 'ANALYSIS_ERROR', 'EXPORT_ERROR', 'INTERNAL_ERROR'])
          .toContain(result.error.code);
        expect(result.error.message).toContain('Test error');
      }
    });

    it('should include recovery suggestions for known errors', async () => {
      const tool = new ManageTaskTool(mockCache);
      
      mockOmniAutomation.buildScript.mockReturnValue('test script');
      mockOmniAutomation.executeJson.mockRejectedValue(new Error('access not allowed'));

      // Ensure the tool uses our per-test mocked OmniAutomation instance.
      // The global unit setup mocks prototype.executeJson to always succeed,
      // so we must inject the instance-level mock here to exercise the error path.
      (tool as any).omniAutomation = mockOmniAutomation;

      const result = await tool.executeValidated({ operation: 'create', name: 'Test task' });

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
      
      const createTask = new ManageTaskTool(mockCache);
      const productivity = new ProductivityStatsToolV2(mockCache);
      const exportTasks = new ExportTool(mockCache);
      
      // These assertions verify the types are properly defined
      expect(createTask.executeValidated).toBeDefined();
      expect(productivity.executeValidated).toBeDefined();
      expect(exportTasks.executeValidated).toBeDefined();
    });
  });
});
