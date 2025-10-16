/**
 * Task-related scripts for OmniFocus automation
 *
 * This file now serves as a facade that re-exports scripts from
 * their modular locations while maintaining backward compatibility.
 */

// Re-export the modularized scripts
export { CREATE_TASK_SCRIPT } from './tasks/create-task.js';
export { COMPLETE_TASK_SCRIPT, COMPLETE_TASK_OMNI_SCRIPT } from './tasks/complete-task.js';
export { DELETE_TASK_SCRIPT, DELETE_TASK_OMNI_SCRIPT } from './tasks/delete-task.js';
export { BULK_DELETE_TASKS_SCRIPT } from './tasks/delete-tasks-bulk.js';
export { GET_TASK_COUNT_SCRIPT } from './tasks/get-task-count.js';
export { UPDATE_TASK_SCRIPT } from './tasks/update-task.js';
export { TODAYS_AGENDA_SCRIPT } from './tasks/todays-agenda.js';
export { LIST_TASKS_SCRIPT } from './tasks/list-tasks.js';

// Legacy helper export
// Note: legacy SAFE_UTILITIES_SCRIPT re-export removed. Import directly from './shared/helpers.js' if needed.
