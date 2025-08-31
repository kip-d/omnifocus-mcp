/**
 * Project scripts for OmniFocus automation
 *
 * This file serves as a facade that re-exports scripts from
 * their modular locations while maintaining backward compatibility.
 */

// Re-export the modularized scripts
export { LIST_PROJECTS_SCRIPT } from './projects/list-projects.js';
export { CREATE_PROJECT_SCRIPT } from './projects/create-project.js';
export { UPDATE_PROJECT_SCRIPT } from './projects/update-project.js';
export { COMPLETE_PROJECT_SCRIPT } from './projects/complete-project.js';
export { DELETE_PROJECT_SCRIPT } from './projects/delete-project.js';
export { GET_PROJECT_STATS_SCRIPT } from './projects/get-project-stats.js';

// For backward compatibility - maintain any direct exports that might be used
// Import shared utilities first
import { SAFE_UTILITIES_SCRIPT } from './tasks.js';
export { SAFE_UTILITIES_SCRIPT };
