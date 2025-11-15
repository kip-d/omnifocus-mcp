import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProductivityStatsTool } from '../../../../src/tools/analytics/ProductivityStatsTool.js';
import { CacheManager } from '../../../../src/cache/CacheManager.js';
import { OmniAutomation } from '../../../../src/omnifocus/OmniAutomation.js';

vi.mock('../../../../src/cache/CacheManager.js', () => ({ CacheManager: vi.fn() }));
vi.mock('../../../../src/omnifocus/OmniAutomation.js', () => ({ OmniAutomation: vi.fn() }));
vi.mock('../../../../src/utils/logger.js', () => ({
  createLogger: vi.fn(() => ({ info: vi.fn(), debug: vi.fn(), error: vi.fn() }))
}));

describe('ProductivityStatsTool', () => {
  let tool: ProductivityStatsTool;
  let mockCache: any;
  let mockOmni: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCache = { get: vi.fn(), set: vi.fn() };
    mockOmni = { buildScript: vi.fn(), executeJson: vi.fn() };
    (CacheManager as any).mockImplementation(() => mockCache);
    (OmniAutomation as any).mockImplementation(() => mockOmni);
    tool = new ProductivityStatsTool(mockCache as any);
    (tool as any).omniAutomation = mockOmni;
  });

  it('should have correct metadata', () => {
    expect(tool.name).toBe('productivity_stats');
    expect(tool.description).toContain('productivity statistics');
    expect(tool.meta.category).toBe('Analytics');
    expect(tool.meta.stability).toBe('stable');
    expect(tool.meta.complexity).toBe('complex');
    expect(tool.meta.performanceClass).toBe('slow');
  });

  it('should return cached results when available', async () => {
    const cached = {
      period: 'week',
      stats: {
        overview: { totalTasks: 100, completedTasks: 75, completionRate: 0.75 }
      },
      healthScore: 85
    };
    mockCache.get.mockReturnValue(cached);

    const res: any = await tool.execute({ period: 'week' } as any);
    expect(res.success).toBe(true);
    expect(res.metadata.from_cache).toBe(true);
    expect(res.metadata.period).toBe('week');
  });

  it('should handle script error result with structured error', async () => {
    mockCache.get.mockReturnValue(null);
    mockOmni.buildScript.mockReturnValue('script');
    mockOmni.executeJson.mockResolvedValue({
      success: false,
      error: 'Failed to calculate stats',
      details: 'OmniFocus error'
    });

    const res: any = await tool.execute({ period: 'week' } as any);
    expect(res.success).toBe(false);
    expect(res.error?.code).toBe('STATS_ERROR');
  });

  it('should return analytics response with productivity stats', async () => {
    mockCache.get.mockReturnValue(null);
    mockOmni.buildScript.mockReturnValue('script');
    // Mock the unwrapped script data format (after execJson unwrapping)
    mockOmni.executeJson.mockResolvedValue({
      summary: {
        totalTasks: 200,
        completedTasks: 150,
        completionRate: 0.75,
        activeProjects: 12,
        overdueCount: 5
      },
      projectStats: {
        'Work': { total: 100, completed: 80, rate: 0.8 },
        'Personal': { total: 100, completed: 70, rate: 0.7 }
      },
      tagStats: {
        'urgent': { total: 30, completed: 25, rate: 0.83 },
        'important': { total: 50, completed: 40, rate: 0.8 }
      },
      insights: ['Completion rate is healthy', 'Focus on overdue tasks']
    });

    const res: any = await tool.execute({
      period: 'week',
      includeProjectStats: true,
      includeTagStats: true
    } as any);

    expect(res.success).toBe(true);
    expect(res.data.period).toBe('week');
    expect(res.data.healthScore).toBe(75); // Calculated from completionRate (0.75 * 100)
    expect(res.data.stats.overview.totalTasks).toBe(200);
    expect(res.data.stats.overview.completionRate).toBe(0.75);
    expect(Array.isArray(res.summary.key_findings)).toBe(true);
  });

  it('should extract key findings from productivity data', async () => {
    mockCache.get.mockReturnValue(null);
    mockOmni.buildScript.mockReturnValue('script');
    mockOmni.executeJson.mockResolvedValue({
      summary: {
        totalTasks: 500,
        completedTasks: 425,
        completionRate: 0.85,
        activeProjects: 8,
        overdueCount: 15
      },
      insights: ['High completion rate']
    });

    const res: any = await tool.execute({ period: 'month' } as any);
    expect(res.success).toBe(true);
    expect(res.summary.key_findings).toBeDefined();
    expect(res.summary.key_findings.length).toBeGreaterThan(0);
    // Key findings should exist (actual content varies by implementation)
    expect(Array.isArray(res.summary.key_findings)).toBe(true);
  });

  it('should support different period options', async () => {
    mockCache.get.mockReturnValue(null);
    mockOmni.buildScript.mockReturnValue('script');
    const mockResponse = {
      summary: { totalTasks: 10, completedTasks: 8, completionRate: 0.8 },
      insights: []
    };
    mockOmni.executeJson.mockResolvedValue(mockResponse);

    const periods = ['today', 'week', 'month', 'quarter', 'year'];
    for (const period of periods) {
      mockCache.get.mockReturnValue(null); // Clear cache between tests
      const res: any = await tool.execute({ period } as any);
      expect(res.success).toBe(true);
    }
  });

  it('should handle missing optional stats gracefully', async () => {
    mockCache.get.mockReturnValue(null);
    mockOmni.buildScript.mockReturnValue('script');
    mockOmni.executeJson.mockResolvedValue({
      summary: {
        totalTasks: 50,
        completedTasks: 30,
        completionRate: 0.6
      }
      // No projectStats or tagStats
    });

    const res: any = await tool.execute({
      period: 'week',
      includeProjectStats: false,
      includeTagStats: false
    } as any);

    expect(res.success).toBe(true);
    expect(res.data.stats.overview).toBeDefined();
  });

  it('should cache results after successful execution', async () => {
    mockCache.get.mockReturnValue(null);
    mockOmni.buildScript.mockReturnValue('script');
    mockOmni.executeJson.mockResolvedValue({
      summary: { totalTasks: 100, completedTasks: 80, completionRate: 0.8 },
      insights: []
    });

    await tool.execute({ period: 'week' } as any);

    expect(mockCache.set).toHaveBeenCalled();
    const cacheCall = mockCache.set.mock.calls[0];
    expect(cacheCall[0]).toBe('analytics'); // cache namespace
  });

  it('should handle zero tasks gracefully', async () => {
    mockCache.get.mockReturnValue(null);
    mockOmni.buildScript.mockReturnValue('script');
    mockOmni.executeJson.mockResolvedValue({
      summary: {
        totalTasks: 0,
        completedTasks: 0,
        completionRate: 0,
        activeProjects: 0,
        overdueCount: 0
      },
      insights: []
    });

    const res: any = await tool.execute({ period: 'week' } as any);
    expect(res.success).toBe(true);
    expect(res.data.stats.overview.totalTasks).toBe(0);
  });
});
