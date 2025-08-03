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
export { GET_TASK_COUNT_SCRIPT } from './tasks/get-task-count.js';
export { UPDATE_TASK_SCRIPT } from './tasks/update-task.js';
export { TODAYS_AGENDA_SCRIPT } from './tasks/todays-agenda.js';

// For complex scripts, temporarily import from legacy file
// These will be refactored in the next iteration
import { 
  LIST_TASKS_SCRIPT as LEGACY_LIST_TASKS
} from './tasks-legacy.js';

export const LIST_TASKS_SCRIPT = LEGACY_LIST_TASKS;

// Legacy helper export
export { SAFE_UTILITIES_SCRIPT } from './shared/helpers.js';