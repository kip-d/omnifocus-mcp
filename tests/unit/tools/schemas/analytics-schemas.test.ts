import { describe, it, expect } from 'vitest';
import {
  ProductivityStatsSchema,
  TaskVelocitySchema,
  OverdueAnalysisSchema,
  ProductivityStatsResponseSchema,
  TaskVelocityResponseSchema,
  OverdueAnalysisResponseSchema,
} from '../../../../src/tools/schemas/analytics-schemas.js';

describe('analytics-schemas', () => {
  it('parses ProductivityStatsSchema with defaults and coercions', () => {
    const parsed = ProductivityStatsSchema.parse({ includeCompleted: '1' as any });
    expect(parsed.period).toBe('week');
    expect(parsed.groupBy).toBe('project');
    expect(parsed.includeCompleted).toBe(true);
  });

  it('parses TaskVelocitySchema with defaults and optional filters', () => {
    const parsed = TaskVelocitySchema.parse({ projectId: 'p1', tags: ['work'] });
    expect(parsed.period).toBe('week');
    expect(parsed.projectId).toBe('p1');
    expect(parsed.tags).toEqual(['work']);
  });

  it('parses OverdueAnalysisSchema with bounds and defaults', () => {
    const parsed = OverdueAnalysisSchema.parse({ limit: '200' as any, includeRecentlyCompleted: 'false' as any });
    expect(parsed.limit).toBe(200);
    expect(parsed.includeRecentlyCompleted).toBe(false);
    expect(parsed.groupBy).toBe('project');
  });

  it('validates ProductivityStatsResponseSchema', () => {
    const resp = {
      summary: { totalCompleted: 10, totalCreated: 12, completionRate: 0.83 },
      byProject: [{ project: 'Work', completed: 6, created: 7, completionRate: 0.85 }],
    };
    expect(() => ProductivityStatsResponseSchema.parse(resp)).not.toThrow();
  });

  it('validates TaskVelocityResponseSchema', () => {
    const resp = {
      velocity: { current: 12, average: 10, trend: 'increasing', trendPercentage: 15 },
      periods: [{ period: '2025-W36', completed: 12, velocity: 12 }],
      forecast: { nextPeriod: 13, confidence: 0.7 },
    };
    expect(() => TaskVelocityResponseSchema.parse(resp)).not.toThrow();
  });

  it('validates OverdueAnalysisResponseSchema', () => {
    const resp = {
      summary: { totalOverdue: 5, oldestOverdueDays: 30, averageOverdueDays: 12 },
      byGroup: [{ group: 'Work', count: 3, percentage: 60, averageDaysOverdue: 10 }],
      tasks: [{ id: 't1', name: 'Old Task', daysOverdue: 12, tags: [] }],
    };
    expect(() => OverdueAnalysisResponseSchema.parse(resp)).not.toThrow();
  });

  it('rejects invalid OverdueAnalysisSchema limit', () => {
    expect(() => OverdueAnalysisSchema.parse({ limit: 0 } as any)).toThrow();
    expect(() => OverdueAnalysisSchema.parse({ limit: 9999 } as any)).toThrow();
  });
});

