import { describe, it, expect } from 'vitest';
import {
  PRODUCTIVITY_INSIGHTS,
  WORKLOAD_INSIGHTS,
  BOTTLENECK_INSIGHTS,
  PROJECT_HEALTH_INSIGHTS,
  TIME_PATTERN_INSIGHTS,
  OPPORTUNITY_INSIGHTS,
  ALL_WORKFLOW_INSIGHTS,
  WORKFLOW_RECOMMENDATIONS,
  INSIGHTS_BY_FOCUS_AREA,
  getInsightsForFocusAreas,
  sortByPriority,
  highPriorityOnly,
} from '../../../../../src/contracts/ast/insights/presets/workflow-insights.js';
import {
  generateInsights,
  generateRecommendations,
  createEmptyMetrics,
  type AnalysisMetrics,
} from '../../../../../src/contracts/analytics-types.js';

// =============================================================================
// TEST FIXTURES
// =============================================================================

function createTestMetrics(overrides: Partial<AnalysisMetrics> = {}): AnalysisMetrics {
  const base = createEmptyMetrics();
  return {
    ...base,
    tasks: { ...base.tasks, ...overrides.tasks },
    projects: { ...base.projects, ...overrides.projects },
    deferrals: { ...base.deferrals, ...overrides.deferrals },
    workload: { ...base.workload, ...overrides.workload },
    time: { ...base.time, ...overrides.time },
  };
}

// =============================================================================
// PRODUCTIVITY INSIGHTS TESTS
// =============================================================================

describe('PRODUCTIVITY_INSIGHTS', () => {
  it('exports 5 productivity insight configs', () => {
    expect(PRODUCTIVITY_INSIGHTS).toHaveLength(5);
    expect(PRODUCTIVITY_INSIGHTS.every((c) => c.category === 'productivity')).toBe(true);
  });

  describe('available-rate insight', () => {
    const config = PRODUCTIVITY_INSIGHTS.find((c) => c.id === 'available-rate')!;

    it('triggers when tasks exist', () => {
      const metrics = createTestMetrics({ tasks: { total: 100, available: 30 } });
      expect(config.condition(metrics)).toBe(true);
    });

    it('does not trigger with no tasks', () => {
      const metrics = createTestMetrics({ tasks: { total: 0 } });
      expect(config.condition(metrics)).toBe(false);
    });

    it('generates correct message', () => {
      const metrics = createTestMetrics({ tasks: { total: 100, available: 30 } });
      const message = config.generate(metrics);
      expect(message).toContain('30.0%');
      expect(message).toContain('30 of 100');
    });
  });

  describe('overdue-tasks insight', () => {
    const config = PRODUCTIVITY_INSIGHTS.find((c) => c.id === 'overdue-tasks')!;

    it('triggers when tasks are overdue', () => {
      const metrics = createTestMetrics({ tasks: { overdue: 5 } });
      expect(config.condition(metrics)).toBe(true);
    });

    it('does not trigger with no overdue tasks', () => {
      const metrics = createTestMetrics({ tasks: { overdue: 0 } });
      expect(config.condition(metrics)).toBe(false);
    });

    it('has high priority for many overdue tasks', () => {
      const metrics = createTestMetrics({ tasks: { overdue: 15 } });
      const priority = typeof config.priority === 'function' ? config.priority(metrics) : config.priority;
      expect(priority).toBe('high');
    });

    it('has medium priority for few overdue tasks', () => {
      const metrics = createTestMetrics({ tasks: { overdue: 5 } });
      const priority = typeof config.priority === 'function' ? config.priority(metrics) : config.priority;
      expect(priority).toBe('medium');
    });
  });
});

// =============================================================================
// BOTTLENECK INSIGHTS TESTS
// =============================================================================

describe('BOTTLENECK_INSIGHTS', () => {
  it('exports 2 bottleneck insight configs', () => {
    expect(BOTTLENECK_INSIGHTS).toHaveLength(2);
    expect(BOTTLENECK_INSIGHTS.every((c) => c.category === 'bottlenecks')).toBe(true);
  });

  describe('blocked-tasks insight', () => {
    const config = BOTTLENECK_INSIGHTS.find((c) => c.id === 'blocked-tasks')!;

    it('triggers when tasks are blocked', () => {
      const metrics = createTestMetrics({ tasks: { blocked: 3 } });
      expect(config.condition(metrics)).toBe(true);
    });

    it('generates message with estimated dependents', () => {
      const metrics = createTestMetrics({ tasks: { blocked: 10 } });
      const message = config.generate(metrics);
      expect(message).toContain('10 tasks are blocked');
      expect(message).toContain('15 dependent tasks'); // 10 * 1.5
    });

    it('has high priority', () => {
      expect(config.priority).toBe('high');
    });
  });
});

// =============================================================================
// PROJECT HEALTH INSIGHTS TESTS
// =============================================================================

describe('PROJECT_HEALTH_INSIGHTS', () => {
  it('exports 3 project health insight configs', () => {
    expect(PROJECT_HEALTH_INSIGHTS).toHaveLength(3);
    expect(PROJECT_HEALTH_INSIGHTS.every((c) => c.category === 'project_health')).toBe(true);
  });

  describe('healthy-projects insight', () => {
    const config = PROJECT_HEALTH_INSIGHTS.find((c) => c.id === 'healthy-projects')!;

    it('generates correct message', () => {
      const metrics = createTestMetrics({
        projects: { total: 10, healthy: 7, unhealthy: 3 },
      });
      const message = config.generate(metrics);
      expect(message).toContain('7 healthy projects');
      expect(message).toContain('3 need attention');
    });
  });
});

// =============================================================================
// WORKFLOW RECOMMENDATIONS TESTS
// =============================================================================

describe('WORKFLOW_RECOMMENDATIONS', () => {
  it('exports 7 recommendation configs', () => {
    expect(WORKFLOW_RECOMMENDATIONS).toHaveLength(7);
  });

  describe('high-overdue-rate recommendation', () => {
    const config = WORKFLOW_RECOMMENDATIONS.find((c) => c.id === 'high-overdue-rate')!;

    it('triggers when overdue rate exceeds 15%', () => {
      const metrics = createTestMetrics({ tasks: { total: 100, overdue: 20 } });
      expect(config.threshold(metrics)).toBe(true);
    });

    it('does not trigger when overdue rate is below 15%', () => {
      const metrics = createTestMetrics({ tasks: { total: 100, overdue: 10 } });
      expect(config.threshold(metrics)).toBe(false);
    });

    it('is actionable and high priority', () => {
      expect(config.actionable).toBe(true);
      expect(config.priority).toBe('high');
    });
  });

  describe('good-deferral-practice recommendation', () => {
    const config = WORKFLOW_RECOMMENDATIONS.find((c) => c.id === 'good-deferral-practice')!;

    it('triggers when strategic > 2x problematic', () => {
      const metrics = createTestMetrics({
        deferrals: { strategic: 30, problematic: 10 },
      });
      expect(config.threshold(metrics)).toBe(true);
    });

    it('does not trigger when strategic < 2x problematic', () => {
      const metrics = createTestMetrics({
        deferrals: { strategic: 15, problematic: 10 },
      });
      expect(config.threshold(metrics)).toBe(false);
    });

    it('is not actionable (positive feedback)', () => {
      expect(config.actionable).toBe(false);
      expect(config.priority).toBe('low');
    });
  });
});

// =============================================================================
// COMBINED INSIGHTS TESTS
// =============================================================================

describe('ALL_WORKFLOW_INSIGHTS', () => {
  it('combines all insight categories', () => {
    const expectedCount =
      PRODUCTIVITY_INSIGHTS.length +
      WORKLOAD_INSIGHTS.length +
      BOTTLENECK_INSIGHTS.length +
      PROJECT_HEALTH_INSIGHTS.length +
      TIME_PATTERN_INSIGHTS.length +
      OPPORTUNITY_INSIGHTS.length;

    expect(ALL_WORKFLOW_INSIGHTS).toHaveLength(expectedCount);
  });

  it('contains insights from all categories', () => {
    const categories = new Set(ALL_WORKFLOW_INSIGHTS.map((c) => c.category));
    expect(categories.has('productivity')).toBe(true);
    expect(categories.has('workload')).toBe(true);
    expect(categories.has('bottlenecks')).toBe(true);
    expect(categories.has('project_health')).toBe(true);
    expect(categories.has('time_patterns')).toBe(true);
    expect(categories.has('opportunities')).toBe(true);
  });
});

// =============================================================================
// UTILITY FUNCTION TESTS
// =============================================================================

describe('getInsightsForFocusAreas', () => {
  it('returns insights for specified focus areas', () => {
    const configs = getInsightsForFocusAreas(['productivity', 'bottlenecks']);

    expect(configs.length).toBe(PRODUCTIVITY_INSIGHTS.length + BOTTLENECK_INSIGHTS.length);
    expect(configs.every((c) => c.category === 'productivity' || c.category === 'bottlenecks')).toBe(true);
  });

  it('returns empty array for unknown focus areas', () => {
    const configs = getInsightsForFocusAreas(['unknown']);
    expect(configs).toHaveLength(0);
  });

  it('handles mixed known and unknown focus areas', () => {
    const configs = getInsightsForFocusAreas(['productivity', 'unknown']);
    expect(configs).toHaveLength(PRODUCTIVITY_INSIGHTS.length);
  });
});

describe('sortByPriority', () => {
  it('sorts high priority first', () => {
    const items = [{ priority: 'low' as const }, { priority: 'high' as const }, { priority: 'medium' as const }];
    const sorted = sortByPriority(items);

    expect(sorted[0].priority).toBe('high');
    expect(sorted[1].priority).toBe('medium');
    expect(sorted[2].priority).toBe('low');
  });

  it('does not mutate original array', () => {
    const items = [{ priority: 'low' as const }, { priority: 'high' as const }];
    const sorted = sortByPriority(items);

    expect(items[0].priority).toBe('low'); // Original unchanged
    expect(sorted[0].priority).toBe('high');
  });
});

describe('highPriorityOnly', () => {
  it('filters to only high priority items', () => {
    const items = [
      { priority: 'low' as const },
      { priority: 'high' as const },
      { priority: 'medium' as const },
      { priority: 'high' as const },
    ];
    const filtered = highPriorityOnly(items);

    expect(filtered).toHaveLength(2);
    expect(filtered.every((i) => i.priority === 'high')).toBe(true);
  });
});

// =============================================================================
// INTEGRATION WITH FACTORY FUNCTIONS
// =============================================================================

describe('Integration with generateInsights', () => {
  it('generates insights from metrics using configs', () => {
    const metrics = createTestMetrics({
      tasks: { total: 100, available: 25, overdue: 10, blocked: 5 },
      projects: { total: 10, healthy: 6, unhealthy: 4 },
    });

    const insights = generateInsights(metrics, ALL_WORKFLOW_INSIGHTS);

    expect(insights.length).toBeGreaterThan(0);
    expect(insights.every((i) => i.category && i.insight && i.priority)).toBe(true);
  });

  it('filters insights by category', () => {
    const metrics = createTestMetrics({
      tasks: { total: 100, available: 25, overdue: 10 },
    });

    const insights = generateInsights(metrics, ALL_WORKFLOW_INSIGHTS, ['productivity']);

    expect(insights.every((i) => i.category === 'productivity')).toBe(true);
  });
});

describe('Integration with generateRecommendations', () => {
  it('generates recommendations from metrics using configs', () => {
    const metrics = createTestMetrics({
      tasks: { total: 100, overdue: 20, blocked: 5 },
    });

    const recommendations = generateRecommendations(metrics, WORKFLOW_RECOMMENDATIONS);

    expect(recommendations.length).toBeGreaterThan(0);
    expect(recommendations.every((r) => r.category && r.recommendation && r.priority)).toBe(true);
  });

  it('includes actionable flag', () => {
    const metrics = createTestMetrics({
      tasks: { total: 100, overdue: 20 },
    });

    const recommendations = generateRecommendations(metrics, WORKFLOW_RECOMMENDATIONS);
    const highOverdue = recommendations.find((r) => r.category === 'workflow_management');

    expect(highOverdue?.actionable).toBe(true);
  });
});
