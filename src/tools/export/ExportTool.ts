import { z } from 'zod';
import { BaseTool } from '../base.js';
import { ExportTasksTool } from './ExportTasksTool.js';
import { ExportProjectsTool } from './ExportProjectsTool.js';
import { BulkExportTool } from './BulkExportTool.js';
import { createErrorResponse, OperationTimer } from '../../utils/response-format.js';
import { coerceBoolean } from '../schemas/coercion-helpers.js';

// Consolidated export schema
const ExportSchema = z.object({
  type: z.enum(['tasks', 'projects', 'all'])
    .describe('What to export: tasks only, projects only, or all data'),
  
  format: z.enum(['json', 'csv', 'markdown'])
    .default('json')
    .describe('Export format'),
  
  // Task export filters (when type is 'tasks' or 'all')
  filter: z.object({
    search: z.string().optional(),
    project: z.string().optional(),
    projectId: z.string().optional(),
    tags: z.array(z.string()).optional(),
    flagged: z.boolean().optional(),
    completed: z.boolean().optional(),
    available: z.boolean().optional(),
    limit: z.number().optional()
  }).optional()
    .describe('Filter criteria for task export'),
  
  fields: z.array(z.enum([
    'id', 'name', 'note', 'project', 'tags', 
    'deferDate', 'dueDate', 'completed', 'completionDate',
    'flagged', 'estimated', 'created', 'createdDate',
    'modified', 'modifiedDate'
  ])).optional()
    .describe('Fields to include in task export'),
  
  // Project export options
  includeStats: coerceBoolean()
    .optional()
    .describe('Include task statistics for each project'),
  
  // Bulk export options (when type is 'all')
  outputDirectory: z.string()
    .optional()
    .describe('Directory to save export files (required for type="all")'),
  
  includeCompleted: coerceBoolean()
    .optional()
    .describe('Include completed tasks in export'),
  
  includeProjectStats: coerceBoolean()
    .optional()
    .describe('Include statistics in project export')
});

type ExportInput = z.infer<typeof ExportSchema>;

/**
 * Consolidated tool for all export operations
 * Combines task export, project export, and bulk export into a single tool
 */
export class ExportTool extends BaseTool<typeof ExportSchema> {
  name = 'export';
  description = 'Export any OmniFocus data to files. Handles tasks, projects, or complete backups in JSON/CSV/Markdown formats. Use type="tasks" for task export with filters, type="projects" for project list, or type="all" for complete backup to directory.';
  schema = ExportSchema;

  private exportTasksTool: ExportTasksTool;
  private exportProjectsTool: ExportProjectsTool;
  private bulkExportTool: BulkExportTool;

  constructor(cache: any) {
    super(cache);
    // Initialize the individual export tools
    this.exportTasksTool = new ExportTasksTool(cache);
    this.exportProjectsTool = new ExportProjectsTool(cache);
    this.bulkExportTool = new BulkExportTool(cache);
  }

  async executeValidated(args: ExportInput): Promise<any> {
    const timer = new OperationTimer();
    const { type, format = 'json', ...params } = args;

    try {
      switch (type) {
        case 'tasks':
          // Export tasks only
          return await this.exportTasksTool.execute({
            format,
            filter: params.filter,
            fields: params.fields
          });

        case 'projects':
          // Export projects only
          return await this.exportProjectsTool.execute({
            format,
            includeStats: params.includeStats
          });

        case 'all':
          // Bulk export everything
          if (!params.outputDirectory) {
            return createErrorResponse(
              'export',
              'MISSING_PARAMETER',
              'outputDirectory is required for type="all"',
              { type },
              timer.toMetadata()
            );
          }

          return await this.bulkExportTool.execute({
            outputDirectory: params.outputDirectory,
            format,
            includeCompleted: params.includeCompleted,
            includeProjectStats: params.includeProjectStats
          });

        default:
          return createErrorResponse(
            'export',
            'INVALID_TYPE',
            `Invalid export type: ${type}`,
            { type },
            timer.toMetadata()
          );
      }
    } catch (error) {
      return this.handleError(error);
    }
  }
}