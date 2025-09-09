/**
 * Analytics scripts for OmniFocus automation
 *
 * This file serves as a facade that re-exports scripts from
 * their modular locations while maintaining backward compatibility.
 */

// Re-export the optimized scripts
export { PRODUCTIVITY_STATS_OPTIMIZED_SCRIPT as PRODUCTIVITY_STATS_SCRIPT } from './analytics/productivity-stats-optimized.js';
export { TASK_VELOCITY_SCRIPT } from './analytics/task-velocity.js';
export { ANALYZE_OVERDUE_OPTIMIZED_SCRIPT as OVERDUE_ANALYSIS_SCRIPT } from './analytics/analyze-overdue-optimized.js';
export { WORKFLOW_ANALYSIS_SCRIPT } from './analytics/workflow-analysis.js';
