import { z } from 'zod';
import { ExportFormatSchema } from './shared-schemas.js';
import { ListTasksSchema } from './task-schemas.js';
import { ListProjectsSchema } from './project-schemas.js';

/**
 * Export-related schema definitions
 */

// Export tasks parameters
export const ExportTasksSchema = z.object({
  format: ExportFormatSchema
    .default('json')
    .describe('Export format'),
  
  filters: ListTasksSchema.omit({ limit: true, offset: true })
    .optional()
    .describe('Filter tasks before export'),
  
  fields: z.array(z.enum([
    'id', 'name', 'note', 'completed', 'flagged', 
    'project', 'tags', 'dueDate', 'deferDate', 
    'completionDate', 'estimatedMinutes', 'primaryKey'
  ]))
    .optional()
    .describe('Fields to include in export (defaults to all)'),
  
  includeCompleted: z.boolean()
    .default(false)
    .describe('Include completed tasks'),
  
  sortBy: z.enum(['name', 'dueDate', 'project', 'createdDate'])
    .optional()
    .describe('Sort field for export')
});

// Export projects parameters
export const ExportProjectsSchema = z.object({
  format: ExportFormatSchema
    .default('json')
    .describe('Export format'),
  
  filters: ListProjectsSchema
    .optional()
    .describe('Filter projects before export'),
  
  includeTasks: z.boolean()
    .default(false)
    .describe('Include tasks within each project'),
  
  fields: z.array(z.enum([
    'id', 'name', 'note', 'status', 'flagged',
    'dueDate', 'deferDate', 'completionDate',
    'folder', 'taskCount', 'primaryKey'
  ]))
    .optional()
    .describe('Fields to include in export (defaults to all)')
});

// Bulk export parameters
export const BulkExportSchema = z.object({
  format: ExportFormatSchema
    .default('json')
    .describe('Export format'),
  
  includeTypes: z.array(z.enum(['tasks', 'projects', 'tags']))
    .default(['tasks', 'projects'])
    .describe('Data types to include in export'),
  
  taskFilters: ListTasksSchema.omit({ limit: true, offset: true })
    .optional()
    .describe('Filter tasks in export'),
  
  projectFilters: ListProjectsSchema
    .optional()
    .describe('Filter projects in export'),
  
  includeCompleted: z.boolean()
    .default(false)
    .describe('Include completed items'),
  
  includeMetadata: z.boolean()
    .default(true)
    .describe('Include export metadata (timestamp, counts, etc.)')
});