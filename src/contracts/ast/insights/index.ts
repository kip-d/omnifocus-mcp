/**
 * Insights Module - Configurable insight and recommendation generation
 *
 * ⏸ PARKED — Phase 4C is half-built (OMN-95).
 * ─────────────────────────────────────────────────────────────────────────
 * This subtree (the typed insight preset system) was added in commit
 * `addd9bb` as Phase 4C of the AST consolidation. The DATA layer is
 * complete; the WIRING layer was never built. As of 2026-05-21, nothing
 * in `src/tools/` calls `generateInsights()` / `generateRecommendations()`
 * — the live `workflow_analysis` capability in `OmniFocusAnalyzeTool`
 * still uses the script-side `WORKFLOW_ANALYSIS_V3` insight pipeline.
 *
 * **Do NOT delete this subtree in "unused export" audits** — it is
 * intentional WIP, not stillborn code. Completion is tracked in
 * [OMN-95](https://linear.app/omnifocus-mcp/issue/OMN-95).
 *
 * When OMN-95 lands, remove this banner. Until then, ts-prune will flag
 * everything below as orphan; that is correct-but-known.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * This module provides:
 * - Pre-defined insight configurations for workflow analysis
 * - Pre-defined recommendation configurations
 * - Utilities for filtering and sorting insights
 *
 * Usage (once OMN-95 wires it in):
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
