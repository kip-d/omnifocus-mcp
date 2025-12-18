/**
 * Recurring task scripts for OmniFocus automation
 *
 * This file serves as a facade that re-exports scripts from
 * their modular locations while maintaining backward compatibility.
 *
 * Phase 4 AST consolidation (2025-12-18):
 * - ANALYZE_RECURRING_TASKS_SCRIPT replaced by buildRecurringTasksScript in analyze-recurring-tasks-ast.ts
 * - Old template archived to .archive/scripts/
 */

// Re-export the modularized scripts
// Note: ANALYZE_RECURRING_TASKS_SCRIPT replaced by AST builder (Phase 4 consolidation)
export { GET_RECURRING_PATTERNS_SCRIPT } from './recurring/get-recurring-patterns.js';

// AST-powered builders (Phase 4)
export { buildRecurringTasksScript, buildRecurringSummaryScript } from './recurring/analyze-recurring-tasks-ast.js';
