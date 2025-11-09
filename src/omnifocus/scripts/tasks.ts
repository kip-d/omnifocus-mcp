/**
 * Task-related scripts for OmniFocus automation
 *
 * This file now serves as a facade that re-exports scripts from
 * their modular locations while maintaining backward compatibility.
 */

// Re-export the modularized scripts (v3 versions)
export { CREATE_TASK_SCRIPT } from './tasks/create-task-v3.js';
export { COMPLETE_TASK_SCRIPT } from './tasks/complete-task-v3.js';
export { BULK_COMPLETE_TASKS_SCRIPT } from './tasks/complete-tasks-bulk-v3.js';
export { DELETE_TASK_SCRIPT } from './tasks/delete-task-v3.js';
export { BULK_DELETE_TASKS_SCRIPT } from './tasks/delete-tasks-bulk-v3.js';
export { GET_TASK_COUNT_SCRIPT } from './tasks/get-task-count-v3.js';
export { TODAYS_AGENDA_SCRIPT } from './tasks/todays-agenda-v3.js';
export { FLAGGED_TASKS_PERSPECTIVE_SCRIPT } from './tasks/flagged-tasks-perspective-v3.js';
export { LIST_TASKS_SCRIPT_V3 } from './tasks/list-tasks-omnijs.js'; // Already v3

// Legacy helper export
// Note: legacy SAFE_UTILITIES_SCRIPT re-export removed. Import directly from './shared/helpers.js' if needed.
