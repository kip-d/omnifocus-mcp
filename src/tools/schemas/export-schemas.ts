import { z } from 'zod';
import { ExportFormatSchema } from './shared-schemas.js';

/**
 * Export-related schema definitions
 */

// Export tasks parameters
export const ExportTasksSchema = z.object({
  format: ExportFormatSchema
    .default('json')
    .describe('Export format (default: json)'),
  
  filter: z.object({
    search: z.string().optional().describe('Search in task names and notes'),
    project: z.string().optional().describe('Filter by project name'),
    projectId: z.string().optional().describe('Filter by project ID - use full alphanumeric ID from list_projects (e.g., "az5Ieo4ip7K", not "547"). Claude Desktop may incorrectly extract numbers from IDs.'),
    tags: z.array(z.string()).optional().describe('Filter by tags (requires all specified tags)'),
    available: z.boolean().optional().describe('Only available tasks (not deferred/blocked)'),
    completed: z.boolean().optional().describe('Filter by completion status'),
    flagged: z.boolean().optional().describe('Only flagged tasks')
  })
    .optional()
    .describe('Filter criteria'),
  
  fields: z.array(z.enum([
    'id', 'name', 'note', 'project', 'tags', 'deferDate', 'dueDate', 
    'completed', 'flagged', 'estimated', 'created', 'modified'
  ]))
    .optional()
    .describe('Fields to include in export (default: all common fields)')
});

// Export projects parameters
export const ExportProjectsSchema = z.object({
  format: ExportFormatSchema
    .default('json')
    .describe('Export format (default: json)'),
  
  includeStats: z.boolean()
    .default(false)
    .describe('Include task statistics for each project')
});

// Bulk export parameters
export const BulkExportSchema = z.object({
  outputDirectory: z.string()
    .describe('Directory to save export files'),
  
  format: ExportFormatSchema
    .default('json')
    .describe('Export format (default: json)'),
  
  includeCompleted: z.boolean()
    .default(true)
    .describe('Include completed tasks'),
  
  includeProjectStats: z.boolean()
    .default(true)
    .describe('Include statistics in project export')
});