/**
 * Insights Module - Configurable insight and recommendation generation
 *
 * This module provides:
 * - Pre-defined insight configurations for workflow analysis
 * - Pre-defined recommendation configurations
 * - Utilities for filtering and sorting insights
 *
 * Usage:
 * ```typescript
 * import {
 *   ALL_WORKFLOW_INSIGHTS,
 *   WORKFLOW_RECOMMENDATIONS,
 *   getInsightsForFocusAreas,
 * } from './insights';
 * import { generateInsights, generateRecommendations } from '../../analytics-types';
 *
 * const insights = generateInsights(metrics, ALL_WORKFLOW_INSIGHTS);
 * const recommendations = generateRecommendations(metrics, WORKFLOW_RECOMMENDATIONS);
 * ```
 */

// Re-export all presets
export {
  // Individual insight categories
  PRODUCTIVITY_INSIGHTS,
  WORKLOAD_INSIGHTS,
  BOTTLENECK_INSIGHTS,
  PROJECT_HEALTH_INSIGHTS,
  TIME_PATTERN_INSIGHTS,
  OPPORTUNITY_INSIGHTS,

  // Combined insights
  ALL_WORKFLOW_INSIGHTS,

  // Recommendations
  WORKFLOW_RECOMMENDATIONS,

  // Focus area mapping
  INSIGHTS_BY_FOCUS_AREA,

  // Utility functions
  getInsightsForFocusAreas,
  sortByPriority,
  highPriorityOnly,
} from './presets/workflow-insights.js';
