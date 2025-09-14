/**
 * OmniFocus API Module
 *
 * This module provides access to:
 * - Official OmniFocus TypeScript definitions
 * - Comprehensive JXA integration types
 * - Type adapters for converting between API and MCP formats
 * - Utility types and type guards
 */

// Re-export official API types
export * from './api-types.js';

// Re-export comprehensive JXA integration types
export * from '../jxa-types-index.js';

// Export type adapters (temporarily disabled)
// export {
//   adaptTask,
//   adaptProject,
//   adaptTag,
//   adaptTasks,
//   adaptProjects,
//   adaptTags,
//   isOFTask,
//   isOFProject,
//   isOFTag,
// } from './type-adapters.js';

// Export paths to definition files for reference
export const API_DEFINITIONS = {
  officialTypes: './OmniFocus.d.ts',
  typeMapping: './type-mapping.md',
  readme: './README.md',
} as const;
