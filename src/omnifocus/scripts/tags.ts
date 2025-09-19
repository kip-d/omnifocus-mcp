/**
 * Tag scripts for OmniFocus automation
 *
 * This file serves as a facade that re-exports scripts from
 * their modular locations while maintaining backward compatibility.
 */

// Re-export the modularized scripts
export { LIST_TAGS_SCRIPT, GET_ACTIVE_TAGS_SCRIPT } from './tags/list-tags.js';
export { MANAGE_TAGS_SCRIPT } from './tags/manage-tags.js';

// Note: SAFE_UTILITIES_SCRIPT is available from './shared/helpers.js' if needed.
