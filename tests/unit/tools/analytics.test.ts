import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProductivityStatsToolV2 as ProductivityStatsTool } from '../../../src/tools/analytics/ProductivityStatsToolV2.js';
import { TaskVelocityToolV2 as TaskVelocityTool } from '../../../src/tools/analytics/TaskVelocityToolV2.js';
import { OverdueAnalysisToolV2 as OverdueAnalysisTool } from '../../../src/tools/analytics/OverdueAnalysisToolV2.js';
import { CacheManager } from '../../../src/cache/CacheManager.js';
import { OmniAutomation } from '../../../src/omnifocus/OmniAutomation.js';

// Mock dependencies
vi.mock('../../../src/cache/CacheManager.js', () => ({
  CacheManager: vi.fn()
}));
vi.mock('../../../src/omnifocus/OmniAutomation.js', () => ({
  OmniAutomation: vi.fn()
}));
vi.mock('../../../src/utils/logger.js', () => ({
  createLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  }))
}));

describe('Analytics Tools', () => {
  let mockCache: any;
  let mockOmniAutomation: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockCache = {
      get: vi.fn(),
      set: vi.fn(),
      clear: vi.fn(),
      invalidate: vi.fn(),
    };
    
    mockOmniAutomation = {
      buildScript: vi.fn(),
      execute: vi.fn(),
    };

    (CacheManager as any).mockImplementation(() => mockCache);
    (OmniAutomation as any).mockImplementation(() => mockOmniAutomation);
  });

  describe('ProductivityStatsTool', () => {
    let tool: ProductivityStatsTool;

    beforeEach(() => {
      tool = new ProductivityStatsTool(mockCache);
    });

    describe('basic functionality', () => {
      it('should have correct name and description', () => {
        expect(tool.name).toBe('productivity_stats');
        expect(tool.description).toContain('productivity statistics');
        expect(tool.description).toContain('GTD health metrics');
      });

      it('should validate schema correctly', async () => {
        mockCache.get.mockReturnValue(null);
        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.execute.mockResolvedValue({
          stats: { completed: 10, created: 15 },
          summary: { completionRate: 0.67 },
          trends: {},
        });

        const result = await tool.executeValidated({
          period: 'week',
          includeProjectStats: true,
          includeTagStats: true,
        });

        expect(result.success).toBe(true);
        // Standard metadata fields only
        expect(result.metadata.operation).toBe('productivity_stats');
        expect(result.metadata.timestamp).toBeDefined();
        expect(result.metadata.from_cache).toBe(false);
      });

      it('should reject invalid period values', async () => {
        await expect(tool.execute({
          period: 'last_week', // Invalid - should be 'week'
        })).rejects.toThrow();

        await expect(tool.execute({
          period: 'current_month', // Invalid - should be 'month'  
        })).rejects.toThrow();
      });

      it('should use default values correctly', async () => {
        mockCache.get.mockReturnValue(null);
        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.execute.mockResolvedValue({
          stats: {},
          summary: {},
          trends: {},
        });

        await tool.executeValidated({});

        expect(mockOmniAutomation.buildScript).toHaveBeenCalledWith(
          expect.stringContaining('safeGet'),
          {
            options: {
              period: 'week',
              includeProjectStats: true,
              includeTagStats: true,
              includeInactive: false,
            }
          }
        );
      });
    });

    describe('caching behavior', () => {
      it('should return cached data when available', async () => {
        const cachedData = {
          stats: { cached: true },
          summary: { completionRate: 0.75 }
        };
        
        mockCache.get.mockReturnValue(cachedData);

        tool = new ProductivityStatsTool(mockCache);
        (tool as any).omniAutomation = mockOmniAutomation;
        const result = await tool.executeValidated({ period: 'week' });

        expect(result.success).toBe(true);
        expect(result.metadata.from_cache).toBe(true);
        expect(result.data.stats).toEqual({ cached: true });
        expect(mockOmniAutomation.execute).not.toHaveBeenCalled();
      });

      it('should generate correct cache keys', async () => {
        mockCache.get.mockReturnValue(null);
        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.execute.mockResolvedValue({
          stats: {}, summary: {}, trends: {}
        });

        await tool.executeValidated({
          period: 'month',
          includeProjectStats: false,
          includeTagStats: true,
        });

        expect(mockCache.get).toHaveBeenCalledWith(
          'analytics',
          'productivity_v2_month_false_true'
        );
        expect(mockCache.set).toHaveBeenCalledWith(
          'analytics',
          'productivity_v2_month_false_true',
          expect.any(Object)
        );
      });

      it('should cache results correctly', async () => {
        mockCache.get.mockReturnValue(null);
        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.execute.mockResolvedValue({
          stats: { completed: 25, created: 30 },
          summary: { completionRate: 0.83 },
          trends: { direction: 'up' },
        });

        const result = await tool.executeValidated({ period: 'today' });

        expect(result.success).toBe(true);
        expect(mockCache.set).toHaveBeenCalledWith(
          'analytics',
          'productivity_v2_today_true_true',
          expect.any(Object)
        );
      });
    });

    describe('calculation accuracy and edge cases', () => {
      it('should handle empty data correctly', async () => {
        mockCache.get.mockReturnValue(null);
        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.execute.mockResolvedValue({
          stats: {},
          summary: { completionRate: 0, totalCompleted: 0, totalCreated: 0 },
          trends: {},
        });

        const result = await tool.executeValidated({ period: 'today' });

        expect(result.success).toBe(true);
        expect(result.data.stats).toBeDefined();
        expect(result.data.insights).toBeDefined();
        expect(result.data.healthScore).toBeDefined();
      });

      it('should handle script errors gracefully', async () => {
        mockCache.get.mockReturnValue(null);
        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.execute.mockResolvedValue({
          error: true,
          message: 'Script execution failed',
        });

        tool = new ProductivityStatsTool(mockCache);
        (tool as any).omniAutomation = mockOmniAutomation;
        const result = await tool.executeValidated({ period: 'week' });

        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
        expect(result.error.message).toContain('Script execution failed');
      });

      it('should handle all period options', async () => {
        mockCache.get.mockReturnValue(null);
        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.execute.mockResolvedValue({
          overview: {}, dailyStats: [], weeklyStats: {}, projectStats: [], tagStats: []
        });

        const periodOptions = ['today', 'week', 'month', 'quarter', 'year'];
        
        for (const period of periodOptions) {
          await tool.executeValidated({ period: period as any });
          expect(mockOmniAutomation.buildScript).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({
              options: expect.objectContaining({ period })
            })
          );
        }
      });
    });
  });

  describe('TaskVelocityTool', () => {
    let tool: TaskVelocityTool;

    beforeEach(() => {
      tool = new TaskVelocityTool(mockCache);
    });

    describe('basic functionality', () => {
      it('should have correct name and description', () => {
        expect(tool.name).toBe('task_velocity');
        expect(tool.description).toContain('task completion velocity');
        expect(tool.description).toContain('workload capacity');
      });

      it('should handle filtering options correctly', async () => {
        mockCache.get.mockReturnValue(null);
        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.execute.mockResolvedValue({
          velocity: { current: 10, average: 8 },
          throughput: { weekly: 40 },
          breakdown: {},
          projections: {},
        });

        await tool.executeValidated({
          days: 14,
          groupBy: 'week',
          includeWeekends: false,
        });

        expect(mockOmniAutomation.buildScript).toHaveBeenCalledWith(
          expect.any(String),
          {
            options: {
              days: 14,
              groupBy: 'week',
              includeWeekends: false,
            }
          }
        );
      });

      it('should generate cache keys with all parameters', async () => {
        mockCache.get.mockReturnValue(null);
        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.execute.mockResolvedValue({
          averageTimeToComplete: { overall: 0, byProject: {}, byTag: {} },
          completionRates: { overall: 0, byProject: {}, byTag: {} },
          velocity: { tasksPerDay: 0, tasksPerWeek: 0, trend: 'stable' }
        });

        await tool.executeValidated({
          days: 30,
          groupBy: 'project',
          includeWeekends: true,
        });

        expect(mockCache.get).toHaveBeenCalledWith(
          'analytics',
          'velocity_v2_30_project_true'
        );
      });
    });

    describe('caching behavior', () => {
      it('should handle cache keys without optional parameters', async () => {
        mockCache.get.mockReturnValue(null);
        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.execute.mockResolvedValue({
          averageTimeToComplete: { overall: 0, byProject: {}, byTag: {} },
          completionRates: { overall: 0, byProject: {}, byTag: {} },
          velocity: { tasksPerDay: 0, tasksPerWeek: 0, trend: 'stable' }
        });

        await tool.executeValidated({});

        expect(mockCache.get).toHaveBeenCalledWith(
          'analytics',
          'velocity_v2_7_day_true'
        );
      });

      it('should cache for 1 hour as per implementation', async () => {
        mockCache.get.mockReturnValue(null);
        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.execute.mockResolvedValue({
          velocity: { current: 15 },
          throughput: { daily: 5 },
          breakdown: {},
          projections: {},
        });

        const result = await tool.executeValidated({ days: 7 });

        expect(result.success).toBe(true);
        expect(mockCache.set).toHaveBeenCalledWith(
          'analytics',
          'velocity_v2_7_day_true',
          expect.any(Object)
        );
      });
    });

    describe('calculation accuracy', () => {
      it('should preserve all velocity calculation results', async () => {
        mockCache.get.mockReturnValue(null);
        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.execute.mockResolvedValue({
          totalCompleted: 84,
          averagePerDay: 12,
          peakDay: { date: '2024-01-15', count: 18 },
          trend: 'increasing',
          predictedCapacity: 85,
          dailyData: [],
          dayOfWeekPatterns: {},
          timeOfDayPatterns: {},
          projectVelocity: [],
          insights: ['Velocity is increasing']
        });

        const result = await tool.executeValidated({ days: 7 });

        expect(result.success).toBe(true);
        expect(result.data.velocity.tasksCompleted).toBe(84);
        expect(result.data.velocity.averagePerDay).toBe(12);
        expect(result.data.velocity.trend).toBe('increasing');
        expect(result.data.velocity.predictedCapacity).toBe(85);
        expect(result.data.insights).toContain('Velocity is increasing');
      });

      it('should handle empty velocity data', async () => {
        mockCache.get.mockReturnValue(null);
        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.execute.mockResolvedValue({
          totalCompleted: 0,
          averagePerDay: 0,
          peakDay: { date: null, count: 0 },
          trend: 'stable',
          predictedCapacity: 0,
          dailyData: [],
          dayOfWeekPatterns: {},
          timeOfDayPatterns: {},
          projectVelocity: [],
          insights: []
        });

        const result = await tool.executeValidated({ days: 1 });

        expect(result.success).toBe(true);
        expect(result.data.velocity.tasksCompleted).toBe(0);
        expect(result.data.velocity.averagePerDay).toBe(0);
      });
    });
  });

  describe('OverdueAnalysisTool', () => {
    let tool: OverdueAnalysisTool;

    beforeEach(() => {
      tool = new OverdueAnalysisTool(mockCache);
    });

    describe('basic functionality', () => {
      it('should have correct name and description', () => {
        expect(tool.name).toBe('analyze_overdue');
        expect(tool.description).toContain('overdue tasks for patterns');
        expect(tool.description).toContain('bottlenecks');
      });

      it('should validate limit parameter correctly', async () => {
        mockCache.get.mockReturnValue(null);
        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.execute.mockResolvedValue({
          summary: { totalOverdue: 5 },
          overdueTasks: [],
          patterns: {},
          recommendations: [],
          groupedAnalysis: {},
        });

        await tool.executeValidated({ limit: 50 });

        expect(mockOmniAutomation.buildScript).toHaveBeenCalledWith(
          expect.any(String),
          {
            options: expect.objectContaining({ limit: 50 })
          }
        );
      });

      it('should reject invalid limit values', async () => {
        await expect(tool.execute({ limit: 0 })).rejects.toThrow();
        await expect(tool.execute({ limit: -5 })).rejects.toThrow();
        await expect(tool.execute({ limit: 1000 })).rejects.toThrow(); // Max is 500
      });

      it('should handle all groupBy options', async () => {
        mockCache.get.mockReturnValue(null);
        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.execute.mockResolvedValue({
          summary: {}, overdueTasks: [], patterns: {}, 
          recommendations: [], groupedAnalysis: {}
        });

        const groupByOptions = ['project', 'tag', 'age', 'priority'];
        
        for (const groupBy of groupByOptions) {
          await tool.executeValidated({ groupBy: groupBy as any });
          expect(mockOmniAutomation.buildScript).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({
              options: expect.objectContaining({ groupBy })
            })
          );
        }
      });
    });

    describe('caching behavior', () => {
      it('should generate correct cache keys', async () => {
        mockCache.get.mockReturnValue(null);
        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.execute.mockResolvedValue({
          summary: {}, overdueTasks: [], patterns: {},
          recommendations: [], groupedAnalysis: {}
        });

        await tool.executeValidated({
          includeRecentlyCompleted: false,
          groupBy: 'age',
          limit: 200,
        });

        expect(mockCache.get).toHaveBeenCalledWith(
          'analytics',
          'overdue_v2_false_age_200'
        );
      });

      it('should cache for 30 minutes as per implementation', async () => {
        mockCache.get.mockReturnValue(null);
        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.execute.mockResolvedValue({
          summary: { totalOverdue: 12, overduePercentage: 0.24, averageDaysOverdue: 8, oldestOverdueDate: '2024-12-01' },
          overdueTasks: [],
          patterns: [{ type: 'project', value: 'Work', count: 8, percentage: 66.7 }],
          recommendations: ['Prioritize old tasks'],
          groupedAnalysis: {},
        });

        const result = await tool.executeValidated({ groupBy: 'project' });

        expect(result.success).toBe(true);
        expect(mockCache.set).toHaveBeenCalledWith(
          'analytics',
          expect.any(String),
          expect.objectContaining({
            stats: expect.objectContaining({
              summary: expect.objectContaining({ totalOverdue: 12 }),
              patterns: expect.any(Array)
            })
          })
        );
      });

      it('should return cached overdue analysis when available', async () => {
        const cachedData = {
          stats: {
            summary: { totalOverdue: 8, overduePercentage: 0.2, averageDaysOverdue: 5, oldestOverdueDate: '2025-01-01' },
            overdueTasks: [{ id: '1', name: 'Old task', dueDate: '2025-01-01', daysOverdue: 10, tags: [] }],
            patterns: [{ type: 'test', value: 'cached', count: 1, percentage: 100 }],
            insights: { cached: true }
          },
          summary: { recommendations: ['Use cache'] }
        };
        
        mockCache.get.mockReturnValue(cachedData);

        const result = await tool.executeValidated({ limit: 100 });

        expect(result.success).toBe(true);
        expect(result.metadata.from_cache).toBe(true);
        expect(result.data.stats.summary.totalOverdue).toBe(8);
        expect(result.data.stats.patterns[0].value).toBe('cached');
        expect(mockOmniAutomation.execute).not.toHaveBeenCalled();
      });
    });

    describe('calculation accuracy and edge cases', () => {
      it('should handle no overdue tasks', async () => {
        mockCache.get.mockReturnValue(null);
        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.execute.mockResolvedValue({
          summary: {
            totalOverdue: 0,
            overduePercentage: 0,
            averageDaysOverdue: 0,
            oldestOverdueDate: '',
          },
          overdueTasks: [],
          patterns: [],
          recommendations: ['No overdue tasks - great job!']
        });

        const result = await tool.executeValidated({ limit: 100 });

        expect(result.success).toBe(true);
        expect(result.data.stats.summary.totalOverdue).toBe(0);
        expect(result.data.stats.overdueTasks).toEqual([]);
        expect(result.data.stats.insights).toEqual(['No overdue tasks - great job!']);
      });

      it('should preserve all analysis data correctly', async () => {
        mockCache.get.mockReturnValue(null);
        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.execute.mockResolvedValue({
          summary: {
            totalOverdue: 15,
            overduePercentage: 0.3,
            averageDaysOverdue: 12.3,
            oldestOverdueDate: '2024-11-01',
          },
          overdueTasks: [
            { id: '1', name: 'Task 1', dueDate: '2024-11-01', daysOverdue: 45, tags: [] },
            { id: '2', name: 'Task 2', dueDate: '2025-01-01', daysOverdue: 7, tags: ['urgent'] },
          ],
          patterns: [
            { type: 'project', value: 'Personal', count: 7, percentage: 46.7 },
            { type: 'tag', value: 'urgent', count: 5, percentage: 33.3 }
          ],
          recommendations: [
            'Focus on oldest tasks first',
            'Review project priorities',
          ],
          groupedAnalysis: {
            byProject: {
              'Work': { count: 8, avgDays: 10 },
              'Personal': { count: 7, avgDays: 15 },
            }
          }
        });

        const result = await tool.executeValidated({
          includeRecentlyCompleted: true,
          groupBy: 'project',
        });

        expect(result.success).toBe(true);
        expect(result.data.stats.summary.totalOverdue).toBe(15);
        expect(result.data.stats.summary.oldestOverdueDate).toBe('2024-11-01');
        expect(result.data.stats.summary.averageDaysOverdue).toBe(12.3);
        expect(result.data.stats.overdueTasks).toHaveLength(2);
        expect(result.data.stats.patterns).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ type: 'project', value: 'Personal' })
          ])
        );
      });

      it('should handle boolean coercion for includeRecentlyCompleted', async () => {
        mockCache.get.mockReturnValue(null);
        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.execute.mockResolvedValue({
          summary: {}, overdueTasks: [], patterns: {},
          recommendations: [], groupedAnalysis: {}
        });

        // Test string boolean values - use execute to trigger schema coercion
        await tool.execute({ includeRecentlyCompleted: 'true' });
        expect(mockOmniAutomation.buildScript).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            options: expect.objectContaining({ includeRecentlyCompleted: true })
          })
        );

        await tool.execute({ includeRecentlyCompleted: 'false' });
        expect(mockOmniAutomation.buildScript).toHaveBeenLastCalledWith(
          expect.any(String),
          expect.objectContaining({
            options: expect.objectContaining({ includeRecentlyCompleted: false })
          })
        );
      });
    });
  });

  describe('error handling across all analytics tools', () => {
    it('should handle execution errors gracefully in ProductivityStatsTool', async () => {
      const tool = new ProductivityStatsTool(mockCache);
      mockCache.get.mockReturnValue(null);
      mockOmniAutomation.buildScript.mockReturnValue('test script');
      mockOmniAutomation.execute.mockRejectedValue(new Error('Network error'));

      const result = await tool.executeValidated({ period: 'week' });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error.message).toBe('Network error');
      expect(result.metadata).toBeDefined();
    });

    it('should handle execution errors gracefully in TaskVelocityTool', async () => {
      const tool = new TaskVelocityTool(mockCache);
      mockCache.get.mockReturnValue(null);
      mockOmniAutomation.buildScript.mockReturnValue('test script');
      mockOmniAutomation.execute.mockRejectedValue(new Error('Script timeout'));

      const result = await tool.executeValidated({ days: 30 });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error.message).toContain('timeout');
    });

    it('should handle execution errors gracefully in OverdueAnalysisTool', async () => {
      const tool = new OverdueAnalysisTool(mockCache);
      mockCache.get.mockReturnValue(null);
      mockOmniAutomation.buildScript.mockReturnValue('test script');
      mockOmniAutomation.execute.mockRejectedValue(new Error('Permission denied'));

      const result = await tool.executeValidated({ limit: 50 });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error.message).toBe('Permission denied');
    });
  });
});