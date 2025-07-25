/**
 * OmniFocus API Module
 * 
 * This module provides access to:
 * - Official OmniFocus TypeScript definitions
 * - Type adapters for converting between API and MCP formats
 * - Utility types and type guards
 */

// Re-export official API types
export * from './api-types.js';

// Export type adapters
export { 
  adaptTask, 
  adaptProject, 
  adaptTag,
  adaptTasks,
  adaptProjects,
  adaptTags,
  isOFTask,
  isOFProject,
  isOFTag
} from './type-adapters.js';

// Export paths to definition files for reference
export const API_DEFINITIONS = {
  officialTypes: './OmniFocus.d.ts',
  typeMapping: './type-mapping.md',
  readme: './README.md'
} as const;