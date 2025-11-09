/**
 * Recurring task scripts for OmniFocus automation
 *
 * This file serves as a facade that re-exports scripts from
 * their modular locations while maintaining backward compatibility.
 */

// Re-export the modularized scripts (V3 - Pure OmniJS)
export { ANALYZE_RECURRING_TASKS_SCRIPT } from './recurring/analyze-recurring-tasks-v3.js';
export { GET_RECURRING_PATTERNS_SCRIPT } from './recurring/get-recurring-patterns-v3.js';
