/**
 * Tag scripts for OmniFocus automation
 *
 * This file serves as a facade that re-exports scripts from
 * their modular locations while maintaining backward compatibility.
 */

// Re-export the modularized scripts
export { LIST_TAGS_SCRIPT } from './tags/list-tags.js';
export { MANAGE_TAGS_SCRIPT } from './tags/manage-tags.js';
export { LIST_TAGS_OPTIMIZED_SCRIPT, GET_ACTIVE_TAGS_SCRIPT } from './tags/list-tags-optimized.js';

// For backward compatibility - maintain any direct exports that might be used
// Import shared utilities first
import { SAFE_UTILITIES_SCRIPT } from './tasks.js';
export { SAFE_UTILITIES_SCRIPT };
