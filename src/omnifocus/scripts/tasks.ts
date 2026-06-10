/**
 * Task-related scripts for OmniFocus automation
 *
 * This file now serves as a facade that re-exports scripts from
 * their modular locations while maintaining backward compatibility.
 *
 * AST consolidation history:
 * - Phase 2 (2025-12-18): CREATE_TASK_SCRIPT archived, replaced by buildCreateTaskScript
 * - Phase 5 (2025-12-19): GET_TASK_COUNT_SCRIPT archived, replaced by buildTaskCountScript
 */

// Re-export the modularized scripts
// Note: CREATE_TASK_SCRIPT archived 2025-12-18, replaced by AST builder
// Note: GET_TASK_COUNT_SCRIPT archived 2025-12-19, replaced by buildTaskCountScript in script-builder.ts
// Note: complete-task, delete-task, delete-tasks-bulk, complete-tasks-bulk deleted 2026-06-10 (OMN-128 slice 5; git history is the record)
// Note: TODAYS_AGENDA_SCRIPT archived 2026-02-09, replaced by AST builder (todayMode in buildAST)

// AST-powered scripts (Phase 1-2 migration complete 2025-12-17):
// - list-tasks: buildListTasksScriptV4 from list-tasks-ast.ts (74% smaller)
// - mutations: buildCreateTaskScript, buildUpdateTaskScript from mutation-script-builder.ts
// Old templates archived: list-tasks-omnijs.ts, update-task-v3.ts
export { buildListTasksScriptV4 } from './tasks/list-tasks-ast.js';
