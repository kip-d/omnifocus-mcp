/**
 * Task-related scripts for OmniFocus automation
 *
 * This file now serves as a facade that re-exports scripts from
 * their modular locations while maintaining backward compatibility.
 */

// Re-export the modularized scripts
export { CREATE_TASK_SCRIPT } from './tasks/create-task.js';
export { COMPLETE_TASK_SCRIPT, COMPLETE_TASK_OMNI_SCRIPT } from './tasks/complete-task.js';
export { BULK_COMPLETE_TASKS_SCRIPT } from './tasks/complete-tasks-bulk.js';
export { DELETE_TASK_SCRIPT, DELETE_TASK_OMNI_SCRIPT } from './tasks/delete-task.js';
export { BULK_DELETE_TASKS_SCRIPT } from './tasks/delete-tasks-bulk.js';
export { GET_TASK_COUNT_SCRIPT } from './tasks/get-task-count.js';
export { TODAYS_AGENDA_SCRIPT } from './tasks/todays-agenda.js';
// Note: UPDATE_TASK_SCRIPT replaced by createUpdateTaskScript() in update-task-v3.ts
export { LIST_TASKS_SCRIPT_V3 } from './tasks/list-tasks-omnijs.js';
// AST-powered V4 (74% smaller, type-safe filters)
export { buildListTasksScriptV4 } from './tasks/list-tasks-ast.js';

// Legacy helper export
// Note: legacy SAFE_UTILITIES_SCRIPT re-export removed. Import directly from './shared/helpers.js' if needed.
