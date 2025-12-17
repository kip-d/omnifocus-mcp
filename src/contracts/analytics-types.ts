/**
 * Shared Analytics Types
 *
 * Common types used across analytics scripts (workflow-analysis, productivity-stats, etc.)
 * These types enable configurable insight/recommendation generation.
 *
 * @see docs/plans/snug-foraging-sloth.md (Phase 4 AST Consolidation)
 */

// =============================================================================
// ANALYSIS METRICS
// =============================================================================

/**
 * Task-level metrics collected during analysis
 */
export interface TaskMetrics {
  total: number;
  overdue: number;
  flagged: number;
  blocked: number;
  available: number;
  deferred: number;
  completed: number;
}

/**
 * Project-level metrics
 */
export interface ProjectMetrics {
  total: number;
  healthy: number;
  unhealthy: number;
  highMomentum: number;
  lowMomentum: number;
}

/**
 * Deferral analysis metrics
 */
export interface DeferralMetrics {
  strategic: number;
  problematic: number;
  total: number;
}

/**
 * Workload metrics
 */
export interface WorkloadMetrics {
  totalEstimatedMinutes: number;
  byProject: Record<string, number>;
  byTag: Record<string, number>;
}

/**
 * Time-based metrics
 */
export interface TimeMetrics {
  avgTaskAgeDays: number;
  avgOverdueDays: number;
  timeBuckets: Record<string, number>;
}

/**
 * Combined analysis metrics - passed to insight generators
 */
export interface AnalysisMetrics {
  tasks: TaskMetrics;
  projects: ProjectMetrics;
  deferrals: DeferralMetrics;
  workload: WorkloadMetrics;
  time: TimeMetrics;
}

// =============================================================================
// INSIGHT TYPES
// =============================================================================

/**
 * Priority levels for insights and recommendations
 */
export type InsightPriority = 'high' | 'medium' | 'low';

/**
 * Categories for insights
 */
export type InsightCategory =
  | 'productivity'
  | 'workload'
  | 'bottlenecks'
  | 'project_health'
  | 'time_patterns'
  | 'opportunities';

/**
 * A generated insight
 */
export interface Insight {
  category: InsightCategory;
  insight: string;
  priority: InsightPriority;
  data?: Record<string, unknown>;
}

/**
 * A generated recommendation
 */
export interface Recommendation {
  category: string;
  recommendation: string;
  priority: InsightPriority;
  actionable?: boolean;
}

// =============================================================================
// INSIGHT CONFIGURATION (for factory pattern)
// =============================================================================

/**
 * Configuration for generating an insight
 *
 * Example:
 * ```typescript
 * const overdueInsight: InsightConfig = {
 *   id: 'overdue-count',
 *   category: 'productivity',
 *   condition: (m) => m.tasks.overdue > 0,
 *   generate: (m) => `${m.tasks.overdue} tasks are overdue`,
 *   priority: (m) => m.tasks.overdue > 10 ? 'high' : 'medium',
 * };
 * ```
 */
export interface InsightConfig {
  /** Unique identifier for this insight */
  id: string;

  /** Category this insight belongs to */
  category: InsightCategory;

  /** Condition that must be true to generate this insight */
  condition: (metrics: AnalysisMetrics) => boolean;

  /** Generate the insight message */
  generate: (metrics: AnalysisMetrics) => string;

  /** Determine priority based on metrics */
  priority: InsightPriority | ((metrics: AnalysisMetrics) => InsightPriority);

  /** Optional: additional data to include */
  data?: (metrics: AnalysisMetrics) => Record<string, unknown>;
}

/**
 * Configuration for generating a recommendation
 */
export interface RecommendationConfig {
  /** Unique identifier */
  id: string;

  /** Category for this recommendation */
  category: string;

  /** Threshold condition for triggering this recommendation */
  threshold: (metrics: AnalysisMetrics) => boolean;

  /** Generate the recommendation message */
  generate: (metrics: AnalysisMetrics) => string;

  /** Priority level */
  priority: InsightPriority | ((metrics: AnalysisMetrics) => InsightPriority);

  /** Is this recommendation actionable? */
  actionable?: boolean;
}

// =============================================================================
// FACTORY HELPERS
// =============================================================================

/**
 * Generate insights from a list of configs
 */
export function generateInsights(
  metrics: AnalysisMetrics,
  configs: InsightConfig[],
  categories?: InsightCategory[],
): Insight[] {
  const insights: Insight[] = [];

  for (const config of configs) {
    // Filter by category if specified
    if (categories && categories.length > 0 && !categories.includes(config.category)) {
      continue;
    }

    // Check condition
    if (!config.condition(metrics)) {
      continue;
    }

    // Generate insight
    const priority = typeof config.priority === 'function' ? config.priority(metrics) : config.priority;

    insights.push({
      category: config.category,
      insight: config.generate(metrics),
      priority,
      data: config.data?.(metrics),
    });
  }

  return insights;
}

/**
 * Generate recommendations from a list of configs
 */
export function generateRecommendations(metrics: AnalysisMetrics, configs: RecommendationConfig[]): Recommendation[] {
  const recommendations: Recommendation[] = [];

  for (const config of configs) {
    // Check threshold
    if (!config.threshold(metrics)) {
      continue;
    }

    // Generate recommendation
    const priority = typeof config.priority === 'function' ? config.priority(metrics) : config.priority;

    recommendations.push({
      category: config.category,
      recommendation: config.generate(metrics),
      priority,
      actionable: config.actionable ?? true,
    });
  }

  return recommendations;
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Calculate a percentage safely (handles division by zero)
 */
export function safePercentage(numerator: number, denominator: number, decimals: number = 1): number {
  if (denominator === 0) return 0;
  return Number(((numerator / denominator) * 100).toFixed(decimals));
}

/**
 * Calculate a rate (items per day)
 */
export function calculateRate(count: number, days: number, decimals: number = 2): number {
  if (days === 0) return 0;
  return Number((count / days).toFixed(decimals));
}

/**
 * Create empty metrics (useful for initialization)
 */
export function createEmptyMetrics(): AnalysisMetrics {
  return {
    tasks: {
      total: 0,
      overdue: 0,
      flagged: 0,
      blocked: 0,
      available: 0,
      deferred: 0,
      completed: 0,
    },
    projects: {
      total: 0,
      healthy: 0,
      unhealthy: 0,
      highMomentum: 0,
      lowMomentum: 0,
    },
    deferrals: {
      strategic: 0,
      problematic: 0,
      total: 0,
    },
    workload: {
      totalEstimatedMinutes: 0,
      byProject: {},
      byTag: {},
    },
    time: {
      avgTaskAgeDays: 0,
      avgOverdueDays: 0,
      timeBuckets: {},
    },
  };
}
