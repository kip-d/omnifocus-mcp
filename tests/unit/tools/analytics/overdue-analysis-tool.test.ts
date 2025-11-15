import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OverdueAnalysisTool } from '../../../../src/tools/analytics/OverdueAnalysisTool.js';
import { CacheManager } from '../../../../src/cache/CacheManager.js';
import { OmniAutomation } from '../../../../src/omnifocus/OmniAutomation.js';

vi.mock('../../../../src/cache/CacheManager.js', () => ({ CacheManager: vi.fn() }));
vi.mock('../../../../src/omnifocus/OmniAutomation.js', () => ({ OmniAutomation: vi.fn() }));
vi.mock('../../../../src/utils/logger.js', () => ({
  createLogger: vi.fn(() => ({ info: vi.fn(), debug: vi.fn(), error: vi.fn() }))
}));

describe('OverdueAnalysisTool', () => {
  let tool: OverdueAnalysisTool;
  let mockCache: any;
  let mockOmni: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCache = { get: vi.fn(), set: vi.fn() };
    mockOmni = { buildScript: vi.fn(), executeJson: vi.fn() };
    (CacheManager as any).mockImplementation(() => mockCache);
    (OmniAutomation as any).mockImplementation(() => mockOmni);
    tool = new OverdueAnalysisTool(mockCache as any);
    (tool as any).omniAutomation = mockOmni;
  });

  it('should have correct metadata', () => {
    expect(tool.name).toBe('analyze_overdue');
    expect(tool.description).toContain('overdue tasks');
    expect(tool.meta.category).toBe('Analytics');
    expect(tool.meta.stability).toBe('stable');
  });

  it('should return cached results when available', async () => {
    const cached = {
      stats: {
        summary: {
          totalOverdue: 5,
          overduePercentage: 10,
          averageDaysOverdue: 3,
          oldestOverdueDate: '2025-01-01'
        }
      },
      overdueTasks: [],
      patterns: [],
      recommendations: ['Fix overdue tasks']
    };
    mockCache.get.mockReturnValue(cached);

    const res: any = await tool.execute({ groupBy: 'project', limit: 10 } as any);
    expect(res.success).toBe(true);
    expect(res.metadata.from_cache).toBe(true);
    expect(res.data.stats.summary.totalOverdue).toBe(5);
  });

  it('should handle script error result with structured error', async () => {
    mockCache.get.mockReturnValue(null);
    mockOmni.buildScript.mockReturnValue('script');
    mockOmni.executeJson.mockResolvedValue({
      success: false,
      error: 'Failed to analyze overdue tasks',
      details: 'OmniFocus error'
    });

    const res: any = await tool.execute({} as any);
    expect(res.success).toBe(false);
    expect(res.error?.code).toBe('ANALYSIS_ERROR');
  });

  it('should return analytics response with overdue summary', async () => {
    mockCache.get.mockReturnValue(null);
    mockOmni.buildScript.mockReturnValue('script');
    mockOmni.executeJson.mockResolvedValue({
      data: {
        summary: {
          totalOverdue: 15,
          overduePercentage: 25.5,
          averageDaysOverdue: 7.2,
          oldestOverdueDate: '2025-10-01'
        },
        overdueTasks: [
          {
            id: 'task1',
            name: 'Overdue task',
            dueDate: '2025-10-01',
            daysOverdue: 45,
            tags: ['urgent'],
            projectId: 'proj1'
          }
        ],
        patterns: [
          { type: 'project', value: 'Work', count: 8, percentage: 53.3 },
          { type: 'tag', value: 'urgent', count: 5, percentage: 33.3 }
        ],
        recommendations: ['Focus on urgent tasks', 'Review weekly commitments']
      }
    });

    const res: any = await tool.execute({ groupBy: 'project', limit: 50 } as any);
    expect(res.success).toBe(true);
    expect(res.data.stats.summary.totalOverdue).toBe(15);
    expect(res.data.stats.summary.overduePercentage).toBe(25.5);
    expect(res.data.stats.overdueTasks.length).toBe(1);
    expect(res.data.stats.patterns.length).toBe(2);
    expect(res.data.stats.insights.topRecommendations.length).toBe(2);
    expect(Array.isArray(res.summary.key_findings)).toBe(true);
  });

  it('should extract key findings from overdue data', async () => {
    mockCache.get.mockReturnValue(null);
    mockOmni.buildScript.mockReturnValue('script');
    mockOmni.executeJson.mockResolvedValue({
      data: {
        summary: {
          totalOverdue: 42,
          overduePercentage: 35.0,
          averageDaysOverdue: 12.5,
          oldestOverdueDate: '2024-08-15'
        },
        overdueTasks: [],
        patterns: [
          { type: 'project', value: 'BigProject', count: 20, percentage: 47.6 }
        ],
        recommendations: ['Review BigProject for blockers']
      }
    });

    const res: any = await tool.execute({} as any);
    expect(res.success).toBe(true);
    expect(res.summary.key_findings).toBeDefined();
    expect(res.summary.key_findings.length).toBeGreaterThan(0);
  });

  it('should handle empty overdue results', async () => {
    mockCache.get.mockReturnValue(null);
    mockOmni.buildScript.mockReturnValue('script');
    mockOmni.executeJson.mockResolvedValue({
      data: {
        summary: {
          totalOverdue: 0,
          overduePercentage: 0,
          averageDaysOverdue: 0,
          oldestOverdueDate: null
        },
        overdueTasks: [],
        patterns: [],
        recommendations: ['Great job! No overdue tasks.']
      }
    });

    const res: any = await tool.execute({} as any);
    expect(res.success).toBe(true);
    expect(res.data.stats.summary.totalOverdue).toBe(0);
    expect(res.data.stats.overdueTasks.length).toBe(0);
  });

  it('should support different groupBy options', async () => {
    mockCache.get.mockReturnValue(null);
    mockOmni.buildScript.mockReturnValue('script');
    const mockResponse = {
      data: {
        summary: { totalOverdue: 10, overduePercentage: 15, averageDaysOverdue: 5, oldestOverdueDate: '2025-01-01' },
        overdueTasks: [],
        patterns: [],
        recommendations: []
      }
    };
    mockOmni.executeJson.mockResolvedValue(mockResponse);

    // Valid groupBy options: 'project', 'tag', 'age', 'priority'
    const groupByOptions = ['project', 'tag', 'age', 'priority'];
    for (const groupBy of groupByOptions) {
      mockCache.get.mockReturnValue(null);
      const res: any = await tool.execute({ groupBy } as any);
      expect(res.success).toBe(true);
    }
  });

  it('should cache results after successful execution', async () => {
    mockCache.get.mockReturnValue(null);
    mockOmni.buildScript.mockReturnValue('script');
    mockOmni.executeJson.mockResolvedValue({
      data: {
        summary: { totalOverdue: 3, overduePercentage: 5, averageDaysOverdue: 2, oldestOverdueDate: '2025-11-01' },
        overdueTasks: [],
        patterns: [],
        recommendations: []
      }
    });

    await tool.execute({} as any);

    expect(mockCache.set).toHaveBeenCalled();
  });
});
