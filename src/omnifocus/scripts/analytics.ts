/**
 * Analytics scripts for OmniFocus automation
 *
 * This file serves as a facade that re-exports scripts from
 * their modular locations while maintaining backward compatibility.
 */

// Re-export the optimized scripts
export { PRODUCTIVITY_STATS_SCRIPT } from './analytics/productivity-stats.js';
export { TASK_VELOCITY_SCRIPT } from './analytics/task-velocity.js';
export { ANALYZE_OVERDUE_SCRIPT as OVERDUE_ANALYSIS_SCRIPT } from './analytics/analyze-overdue.js';
export { WORKFLOW_ANALYSIS_SCRIPT } from './analytics/workflow-analysis.js';
