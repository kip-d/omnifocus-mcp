/**
 * Recurring task scripts for OmniFocus automation
 * 
 * This file serves as a facade that re-exports scripts from
 * their modular locations while maintaining backward compatibility.
 */

// Re-export the modularized scripts
export { ANALYZE_RECURRING_TASKS_SCRIPT } from './recurring/analyze-recurring-tasks.js';
export { GET_RECURRING_PATTERNS_SCRIPT } from './recurring/get-recurring-patterns.js';