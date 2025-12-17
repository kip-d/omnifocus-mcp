/**
 * Workflow Insight Presets
 *
 * Configurable insight generators for workflow analysis.
 * These presets define the conditions, messages, and priorities for each insight type.
 *
 * Usage:
 * ```typescript
 * import { PRODUCTIVITY_INSIGHTS, BOTTLENECK_INSIGHTS } from './workflow-insights';
 * import { generateInsights } from '../../../analytics-types';
 *
 * const insights = generateInsights(metrics, [
 *   ...PRODUCTIVITY_INSIGHTS,
 *   ...BOTTLENECK_INSIGHTS,
 * ]);
 * ```
 *
 * @see docs/plans/snug-foraging-sloth.md (Phase 4C)
 */

import type { InsightConfig, RecommendationConfig, InsightPriority } from '../../../analytics-types.js';

// =============================================================================
// PRODUCTIVITY INSIGHTS
// =============================================================================

export const PRODUCTIVITY_INSIGHTS: InsightConfig[] = [
  {
    id: 'available-rate',
    category: 'productivity',
    condition: (m) => m.tasks.total > 0,
    generate: (m) => {
      const rate = ((m.tasks.available / m.tasks.total) * 100).toFixed(1);
      return `${rate}% of tasks are ready to work on (${m.tasks.available} of ${m.tasks.total} tasks)`;
    },
    priority: 'medium',
  },
  {
    id: 'overdue-tasks',
    category: 'productivity',
    condition: (m) => m.tasks.overdue > 0,
    generate: (m) => {
      const avgOverdue = m.time.avgOverdueDays > 0 ? Math.round(m.time.avgOverdueDays) : 0;
      return `${m.tasks.overdue} tasks are overdue${avgOverdue > 0 ? `, averaging ${avgOverdue} days late` : ''}`;
    },
    priority: (m) => (m.tasks.overdue > 10 ? 'high' : 'medium'),
  },
  {
    id: 'deferred-total',
    category: 'productivity',
    condition: (m) => m.deferrals.total > 0 && m.tasks.total > 0,
    generate: (m) => {
      const rate = ((m.deferrals.total / m.tasks.total) * 100).toFixed(1);
      return `${rate}% of tasks are deferred (${m.deferrals.total} total)`;
    },
    priority: 'medium',
  },
  {
    id: 'strategic-deferrals',
    category: 'productivity',
    condition: (m) => m.deferrals.strategic > 0,
    generate: (m) => {
      const rate = m.tasks.total > 0 ? ((m.deferrals.strategic / m.tasks.total) * 100).toFixed(1) : '0';
      return `${rate}% are strategic deferrals (${m.deferrals.strategic} tasks) - Good GTD practice!`;
    },
    priority: 'low',
  },
  {
    id: 'problematic-deferrals',
    category: 'productivity',
    condition: (m) => m.deferrals.problematic > 0,
    generate: (m) => {
      const rate = m.tasks.total > 0 ? ((m.deferrals.problematic / m.tasks.total) * 100).toFixed(1) : '0';
      return `${rate}% are problematic deferrals (${m.deferrals.problematic} tasks) - May need attention`;
    },
    priority: (m) => (m.deferrals.problematic > 10 ? 'high' : 'medium'),
  },
];

// =============================================================================
// WORKLOAD INSIGHTS
// =============================================================================

export const WORKLOAD_INSIGHTS: InsightConfig[] = [
  {
    id: 'total-workload',
    category: 'workload',
    condition: (m) => m.workload.totalEstimatedMinutes > 0,
    generate: (m) => {
      const hours = Math.round(m.workload.totalEstimatedMinutes / 60);
      const projects = m.projects.total;
      return `Total estimated workload: ${hours} hours across ${projects} projects`;
    },
    priority: 'medium',
  },
  {
    id: 'flagged-tasks',
    category: 'workload',
    condition: (m) => m.tasks.flagged > 0,
    generate: (m) => `${m.tasks.flagged} tasks are flagged for attention`,
    priority: (m) => (m.tasks.flagged > 20 ? 'high' : 'medium'),
  },
];

// =============================================================================
// BOTTLENECK INSIGHTS
// =============================================================================

export const BOTTLENECK_INSIGHTS: InsightConfig[] = [
  {
    id: 'blocked-tasks',
    category: 'bottlenecks',
    condition: (m) => m.tasks.blocked > 0,
    generate: (m) => {
      const estimatedDependents = Math.round(m.tasks.blocked * 1.5);
      return `${m.tasks.blocked} tasks are blocked, potentially slowing down ${estimatedDependents} dependent tasks`;
    },
    priority: 'high',
  },
  {
    id: 'high-overdue-rate',
    category: 'bottlenecks',
    condition: (m) => m.tasks.total > 0 && m.tasks.overdue / m.tasks.total > 0.15,
    generate: (m) => {
      const rate = ((m.tasks.overdue / m.tasks.total) * 100).toFixed(1);
      return `High overdue rate: ${rate}% of tasks are past due - workflow bottleneck detected`;
    },
    priority: 'high',
  },
];

// =============================================================================
// PROJECT HEALTH INSIGHTS
// =============================================================================

export const PROJECT_HEALTH_INSIGHTS: InsightConfig[] = [
  {
    id: 'healthy-projects',
    category: 'project_health',
    condition: (m) => m.projects.total > 0,
    generate: (m) => {
      return `Workflow health: ${m.projects.healthy} healthy projects, ${m.projects.unhealthy} need attention`;
    },
    priority: 'medium',
  },
  {
    id: 'high-momentum-projects',
    category: 'project_health',
    condition: (m) => m.projects.highMomentum > 0,
    generate: (m) => `${m.projects.highMomentum} projects have high momentum (ready for progress)`,
    priority: 'medium',
  },
  {
    id: 'low-momentum-warning',
    category: 'project_health',
    condition: (m) => m.projects.lowMomentum > m.projects.highMomentum,
    generate: (m) => `${m.projects.lowMomentum} projects have low momentum - may need attention`,
    priority: (m) => (m.projects.lowMomentum > 5 ? 'high' : 'medium'),
  },
];

// =============================================================================
// TIME PATTERN INSIGHTS
// =============================================================================

export const TIME_PATTERN_INSIGHTS: InsightConfig[] = [
  {
    id: 'overdue-time-cluster',
    category: 'time_patterns',
    condition: (m) => {
      const buckets = m.time.timeBuckets;
      return Object.values(buckets).some((count) => count > 5);
    },
    generate: (m) => {
      const buckets = m.time.timeBuckets;
      let maxBucket = '';
      let maxCount = 0;
      for (const [bucket, count] of Object.entries(buckets)) {
        if (count > maxCount) {
          maxCount = count;
          maxBucket = bucket;
        }
      }
      return `Most overdue tasks cluster in: ${maxBucket} (${maxCount} tasks)`;
    },
    priority: 'medium',
  },
  {
    id: 'old-tasks-warning',
    category: 'time_patterns',
    condition: (m) => m.time.avgTaskAgeDays > 90,
    generate: (m) => {
      const days = Math.round(m.time.avgTaskAgeDays);
      return `Average task age is ${days} days - consider reviewing stale tasks`;
    },
    priority: 'medium',
  },
];

// =============================================================================
// OPPORTUNITY INSIGHTS
// =============================================================================

export const OPPORTUNITY_INSIGHTS: InsightConfig[] = [
  {
    id: 'available-tasks',
    category: 'opportunities',
    condition: (m) => m.tasks.available > 0,
    generate: (m) => `${m.tasks.available} tasks are ready to work on now`,
    priority: 'low',
  },
  {
    id: 'low-inbox',
    category: 'opportunities',
    condition: (m) => m.tasks.total > 0 && m.tasks.deferred < m.tasks.total * 0.1,
    generate: () => 'Inbox is well-managed - great GTD practice!',
    priority: 'low',
  },
];

// =============================================================================
// ALL WORKFLOW INSIGHTS (combined)
// =============================================================================

export const ALL_WORKFLOW_INSIGHTS: InsightConfig[] = [
  ...PRODUCTIVITY_INSIGHTS,
  ...WORKLOAD_INSIGHTS,
  ...BOTTLENECK_INSIGHTS,
  ...PROJECT_HEALTH_INSIGHTS,
  ...TIME_PATTERN_INSIGHTS,
  ...OPPORTUNITY_INSIGHTS,
];

// =============================================================================
// WORKFLOW RECOMMENDATIONS
// =============================================================================

export const WORKFLOW_RECOMMENDATIONS: RecommendationConfig[] = [
  {
    id: 'high-overdue-rate',
    category: 'workflow_management',
    threshold: (m) => m.tasks.total > 0 && m.tasks.overdue / m.tasks.total > 0.15,
    generate: () => 'High overdue rate suggests workflow bottlenecks - consider reviewing task flow and dependencies',
    priority: 'high',
    actionable: true,
  },
  {
    id: 'blocked-tasks-review',
    category: 'dependency_management',
    threshold: (m) => m.tasks.blocked > 0,
    generate: () => 'Review blocked tasks to identify and resolve dependencies that slow down your system',
    priority: 'high',
    actionable: true,
  },
  {
    id: 'problematic-deferrals',
    category: 'deferral_optimization',
    threshold: (m) => m.tasks.total > 0 && m.deferrals.problematic / m.tasks.total > 0.15,
    generate: () =>
      'High problematic deferral rate suggests avoidance or overwhelm - review if these tasks are truly necessary or if you need to break them down',
    priority: 'high',
    actionable: true,
  },
  {
    id: 'good-deferral-practice',
    category: 'deferral_practice',
    threshold: (m) => m.deferrals.strategic > 0 && m.deferrals.strategic > m.deferrals.problematic * 2,
    generate: () =>
      'Your strategic deferral practices are excellent! You are using deferrals appropriately for time-based and seasonal tasks',
    priority: 'low',
    actionable: false,
  },
  {
    id: 'large-inbox',
    category: 'inbox_management',
    threshold: (m) => m.tasks.deferred > 50, // Using deferred as proxy for inbox in simplified metrics
    generate: () => 'Large inbox suggests processing backlog - consider batch processing to clear the way',
    priority: 'medium',
    actionable: true,
  },
  {
    id: 'low-project-health',
    category: 'workflow_optimization',
    threshold: (m) => m.projects.unhealthy > m.projects.healthy,
    generate: () => 'Overall workflow health is low - consider reviewing project portfolio and task flow',
    priority: 'medium',
    actionable: true,
  },
  {
    id: 'low-momentum',
    category: 'momentum_building',
    threshold: (m) => m.projects.lowMomentum > m.projects.highMomentum * 2,
    generate: () =>
      'Low project momentum suggests focus issues - consider concentrating on fewer, high-impact projects',
    priority: 'medium',
    actionable: true,
  },
];

// =============================================================================
// INSIGHT CATEGORY PRESETS (for filtering by focus area)
// =============================================================================

export const INSIGHTS_BY_FOCUS_AREA: Record<string, InsightConfig[]> = {
  productivity: PRODUCTIVITY_INSIGHTS,
  workload: WORKLOAD_INSIGHTS,
  bottlenecks: BOTTLENECK_INSIGHTS,
  project_health: PROJECT_HEALTH_INSIGHTS,
  time_patterns: TIME_PATTERN_INSIGHTS,
  opportunities: OPPORTUNITY_INSIGHTS,
};

/**
 * Get insights for specific focus areas
 */
export function getInsightsForFocusAreas(focusAreas: string[]): InsightConfig[] {
  const configs: InsightConfig[] = [];
  for (const area of focusAreas) {
    const areaConfigs = INSIGHTS_BY_FOCUS_AREA[area];
    if (areaConfigs) {
      configs.push(...areaConfigs);
    }
  }
  return configs;
}

// =============================================================================
// PRIORITY HELPERS
// =============================================================================

/**
 * Sort insights by priority (high first, then medium, then low)
 */
export function sortByPriority<T extends { priority: InsightPriority }>(items: T[]): T[] {
  const priorityOrder: Record<InsightPriority, number> = {
    high: 0,
    medium: 1,
    low: 2,
  };

  return [...items].sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
}

/**
 * Filter to high-priority insights only
 */
export function highPriorityOnly<T extends { priority: InsightPriority }>(items: T[]): T[] {
  return items.filter((item) => item.priority === 'high');
}
