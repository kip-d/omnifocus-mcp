import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TaskVelocityTool } from '../../../../src/tools/analytics/TaskVelocityTool.js';
import { CacheManager } from '../../../../src/cache/CacheManager.js';
import { OmniAutomation } from '../../../../src/omnifocus/OmniAutomation.js';

vi.mock('../../../../src/cache/CacheManager.js', () => ({ CacheManager: vi.fn() }));
vi.mock('../../../../src/omnifocus/OmniAutomation.js', () => ({ OmniAutomation: vi.fn() }));
vi.mock('../../../../src/utils/logger.js', () => ({
  createLogger: vi.fn(() => ({ info: vi.fn(), debug: vi.fn(), error: vi.fn() }))
}));

describe('TaskVelocityTool', () => {
  let tool: TaskVelocityTool;
  let mockCache: any;
  let mockOmni: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCache = { get: vi.fn(), set: vi.fn() };
    mockOmni = { buildScript: vi.fn(), executeJson: vi.fn() };
    (CacheManager as any).mockImplementation(() => mockCache);
    (OmniAutomation as any).mockImplementation(() => mockOmni);
    tool = new TaskVelocityTool(mockCache as any);
    (tool as any).omniAutomation = mockOmni;
  });

  it('should have correct metadata', () => {
    expect(tool.name).toBe('task_velocity');
    expect(tool.description).toContain('velocity');
    expect(tool.meta.category).toBe('Analytics');
    expect(tool.meta.stability).toBe('stable');
    expect(tool.meta.complexity).toBe('complex');
    expect(tool.meta.performanceClass).toBe('moderate');
  });

  it('should return cached results when available', async () => {
    const cached = {
      velocity: {
        period: '7 days',
        tasksCompleted: 42,
        averagePerDay: 6
      },
      patterns: {},
      insights: ['Steady velocity']
    };
    mockCache.get.mockReturnValue(cached);

    const res: any = await tool.execute({ days: 7, groupBy: 'day' } as any);
    expect(res.success).toBe(true);
    expect(res.metadata.from_cache).toBe(true);
    expect(res.metadata.days).toBe(7);
  });

  it('should handle script error result with structured error', async () => {
    mockCache.get.mockReturnValue(null);
    mockOmni.buildScript.mockReturnValue('script');
    mockOmni.executeJson.mockResolvedValue({
      success: false,
      error: 'Failed to calculate velocity',
      details: 'OmniFocus error'
    });

    const res: any = await tool.execute({ days: 7 } as any);
    expect(res.success).toBe(false);
    expect(res.error?.code).toBe('VELOCITY_ERROR');
  });

  it('should return analytics response with velocity metrics', async () => {
    mockCache.get.mockReturnValue(null);
    mockOmni.buildScript.mockReturnValue('script');
    // V3 format: script returns { ok: true, v: '3', data: {...} }
    mockOmni.executeJson.mockResolvedValue({
      ok: true,
      v: '3',
      data: {
        velocity: {
          period: '7 days',
          averageCompleted: '6.5',
          averageCreated: '7.2',
          dailyVelocity: '6.5',
          backlogGrowthRate: '+0.7'
        },
        throughput: {
          intervals: [
            { start: new Date('2025-11-01'), end: new Date('2025-11-02'), created: 8, completed: 7, label: 'Day 1' },
            { start: new Date('2025-11-02'), end: new Date('2025-11-03'), created: 6, completed: 5, label: 'Day 2' }
          ],
          totalCompleted: 45,
          totalCreated: 50
        },
        breakdown: {
          medianCompletionHours: '3.5',
          tasksAnalyzed: 150
        },
        projections: {
          tasksPerDay: '6.5',
          tasksPerWeek: '45.5',
          tasksPerMonth: '195'
        },
        optimization: 'Current velocity is sustainable'
      }
    });

    const res: any = await tool.execute({
      days: 7,
      groupBy: 'day',
      includeWeekends: true
    } as any);

    expect(res.success).toBe(true);
    expect(res.data.velocity).toBeDefined();
    expect(res.data.velocity.averagePerDay).toBe(6.5);
    expect(res.data.velocity.tasksCompleted).toBe(45);
    expect(res.data.velocity.predictedCapacity).toBe(45.5);
    expect(Array.isArray(res.summary.key_findings)).toBe(true);
  });

  it('should extract key findings from velocity data', async () => {
    mockCache.get.mockReturnValue(null);
    mockOmni.buildScript.mockReturnValue('script');
    mockOmni.executeJson.mockResolvedValue({
      ok: true,
      v: '3',
      data: {
        velocity: {
          period: '30 days',
          averageCompleted: '8.2',
          averageCreated: '7.5',
          dailyVelocity: '8.2',
          backlogGrowthRate: '-0.7'
        },
        throughput: {
          intervals: [],
          totalCompleted: 246,
          totalCreated: 225
        },
        breakdown: {
          medianCompletionHours: '4.0',
          tasksAnalyzed: 500
        },
        projections: {
          tasksPerDay: '8.2',
          tasksPerWeek: '57.4',
          tasksPerMonth: '246'
        },
        optimization: 'Excellent velocity - backlog decreasing'
      }
    });

    const res: any = await tool.execute({ days: 30 } as any);
    expect(res.success).toBe(true);
    expect(res.summary.key_findings).toBeDefined();
    expect(res.summary.key_findings.length).toBeGreaterThan(0);
  });

  it('should support different groupBy options', async () => {
    mockCache.get.mockReturnValue(null);
    mockOmni.buildScript.mockReturnValue('script');
    const mockResponse = {
      ok: true,
      v: '3',
      data: {
        velocity: { period: '7 days', averageCompleted: '5', dailyVelocity: '5' },
        throughput: { intervals: [], totalCompleted: 35, totalCreated: 30 },
        breakdown: { medianCompletionHours: '3', tasksAnalyzed: 100 },
        projections: { tasksPerDay: '5', tasksPerWeek: '35', tasksPerMonth: '150' },
        optimization: 'Normal velocity'
      }
    };
    mockOmni.executeJson.mockResolvedValue(mockResponse);

    const groupByOptions = ['day', 'week', 'project'];
    for (const groupBy of groupByOptions) {
      mockCache.get.mockReturnValue(null); // Clear cache
      const res: any = await tool.execute({ days: 7, groupBy } as any);
      expect(res.success).toBe(true);
    }
  });

  it('should handle different time periods', async () => {
    mockCache.get.mockReturnValue(null);
    mockOmni.buildScript.mockReturnValue('script');
    const mockResponse = {
      ok: true,
      v: '3',
      data: {
        velocity: { period: '30 days', averageCompleted: '10', dailyVelocity: '10' },
        throughput: { intervals: [], totalCompleted: 300, totalCreated: 280 },
        breakdown: { medianCompletionHours: '2.5', tasksAnalyzed: 500 },
        projections: { tasksPerDay: '10', tasksPerWeek: '70', tasksPerMonth: '300' },
        optimization: 'High velocity'
      }
    };
    mockOmni.executeJson.mockResolvedValue(mockResponse);

    const periods = [7, 14, 30, 90];
    for (const days of periods) {
      mockCache.get.mockReturnValue(null); // Clear cache
      const res: any = await tool.execute({ days } as any);
      expect(res.success).toBe(true);
    }
  });

  it('should cache results after successful execution', async () => {
    mockCache.get.mockReturnValue(null);
    mockOmni.buildScript.mockReturnValue('script');
    mockOmni.executeJson.mockResolvedValue({
      ok: true,
      v: '3',
      data: {
        velocity: { period: '7 days', averageCompleted: '5', dailyVelocity: '5' },
        throughput: { intervals: [], totalCompleted: 35, totalCreated: 30 },
        breakdown: { medianCompletionHours: '3', tasksAnalyzed: 100 },
        projections: { tasksPerDay: '5', tasksPerWeek: '35', tasksPerMonth: '150' },
        optimization: 'Normal'
      }
    });

    await tool.execute({ days: 7, groupBy: 'day' } as any);

    expect(mockCache.set).toHaveBeenCalled();
    const cacheCall = mockCache.set.mock.calls[0];
    expect(cacheCall[0]).toBe('analytics'); // cache namespace
  });

  it('should handle weekend filtering parameter', async () => {
    mockCache.get.mockReturnValue(null);
    mockOmni.buildScript.mockReturnValue('script');
    const mockResponse = {
      ok: true,
      v: '3',
      data: {
        velocity: { period: '7 days (weekdays)', averageCompleted: '7', dailyVelocity: '7' },
        throughput: { intervals: [], totalCompleted: 35, totalCreated: 35 },
        breakdown: { medianCompletionHours: '4', tasksAnalyzed: 100 },
        projections: { tasksPerDay: '7', tasksPerWeek: '35', tasksPerMonth: '150' },
        optimization: 'Weekday velocity'
      }
    };
    mockOmni.executeJson.mockResolvedValue(mockResponse);

    const res: any = await tool.execute({ days: 7, includeWeekends: false } as any);
    expect(res.success).toBe(true);
  });

  it('should handle minimal velocity data gracefully', async () => {
    mockCache.get.mockReturnValue(null);
    mockOmni.buildScript.mockReturnValue('script');
    mockOmni.executeJson.mockResolvedValue({
      ok: true,
      v: '3',
      data: {
        velocity: {
          period: '7 days',
          averageCompleted: '0',
          dailyVelocity: '0'
        },
        throughput: {
          intervals: [],
          totalCompleted: 0,
          totalCreated: 5
        },
        breakdown: {
          medianCompletionHours: 'N/A',
          tasksAnalyzed: 0
        },
        projections: {
          tasksPerDay: '0',
          tasksPerWeek: '0',
          tasksPerMonth: '0'
        },
        optimization: 'Insufficient data for velocity calculation'
      }
    });

    const res: any = await tool.execute({ days: 7 } as any);
    expect(res.success).toBe(true);
    expect(res.data.velocity.averagePerDay).toBe(0);
  });
});
