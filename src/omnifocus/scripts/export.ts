/**
 * Export scripts for OmniFocus automation
 * 
 * This file serves as a facade that re-exports scripts from
 * their modular locations while maintaining backward compatibility.
 */

// Re-export the modularized scripts
export { EXPORT_TASKS_SCRIPT } from './export/export-tasks.js';
export { EXPORT_PROJECTS_SCRIPT } from './export/export-projects.js';

// For backward compatibility - maintain any direct exports that might be used
// Import shared utilities first
import { SAFE_UTILITIES_SCRIPT } from './tasks.js';
export { SAFE_UTILITIES_SCRIPT };