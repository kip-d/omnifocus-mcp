import { z } from 'zod';
import { BaseTool } from '../base.js';
import { EXPORT_TASKS_SCRIPT } from '../../omnifocus/scripts/export/export-tasks.js';
import { EXPORT_PROJECTS_SCRIPT } from '../../omnifocus/scripts/export/export-projects.js';
import { TagsToolV2 } from '../tags/TagsToolV2.js';
import { createErrorResponseV2, createSuccessResponseV2, OperationTimerV2 } from '../../utils/response-format.js';
import { coerceBoolean } from '../schemas/coercion-helpers.js';
import * as path from 'path';
import { CacheManager } from '../../cache/CacheManager.js';
import { ExportResponseV2, ExportDataV2 } from '../response-types-v2.js';

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
    limit: z.number().optional(),
  }).optional()
    .describe('Filter criteria for task export'),

  fields: z.array(z.enum([
    'id', 'name', 'note', 'project', 'tags',
    'deferDate', 'dueDate', 'completed', 'completionDate',
    'flagged', 'estimated', 'created', 'createdDate',
    'modified', 'modifiedDate',
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
    .describe('Include statistics in project export'),
});

type ExportInput = z.infer<typeof ExportSchema>;

/**
 * Consolidated tool for all export operations
 * Combines task export, project export, and bulk export into a single tool
 */
export class ExportTool extends BaseTool<typeof ExportSchema, ExportResponseV2> {
  name = 'export';
  description = 'Export any OmniFocus data to files. Handles tasks, projects, or complete backups in JSON/CSV/Markdown formats. Use type="tasks" for task export with filters, type="projects" for project list, or type="all" for complete backup to directory.';
  schema = ExportSchema;

  constructor(cache: CacheManager) {
    super(cache);
  }

  async executeValidated(args: ExportInput): Promise<ExportResponseV2> {
    const timer = new OperationTimerV2();
    const { type, format = 'json', ...params } = args;

    try {
      switch (type) {
        case 'tasks':
          // Direct implementation of task export
          return await this.handleTaskExport({
            format,
            filter: params.filter || {},
            fields: params.fields,
          }, timer);

        case 'projects':
          // Direct implementation of project export
          return await this.handleProjectExport({
            format,
            includeStats: params.includeStats || false,
          }, timer);

        case 'all':
          // Direct implementation of bulk export
          if (!params.outputDirectory) {
            return createErrorResponseV2(
              'export',
              'MISSING_PARAMETER',
              'outputDirectory is required for type="all"',
              undefined,
              { type },
              timer.toMetadata(),
            );
          }

          return await this.handleBulkExport({
            outputDirectory: params.outputDirectory,
            format,
            includeCompleted: params.includeCompleted || true,
            includeProjectStats: params.includeProjectStats || true,
          }, timer);

        default:
          return createErrorResponseV2(
            'export',
            'INVALID_TYPE',
            `Invalid export type: ${String(type)}`,
            undefined,
            { type },
            timer.toMetadata(),
          );
      }
    } catch (error) {
      return this.handleErrorV2<ExportDataV2>(error);
    }
  }

  // Direct implementation of task export
  private async handleTaskExport(args: {
    format: string;
    filter: Record<string, unknown>;
    fields?: string[];
  }, timer: OperationTimerV2): Promise<ExportResponseV2> {
    const { format = 'json', filter = {}, fields } = args;

    try {
      const script = this.omniAutomation.buildScript(EXPORT_TASKS_SCRIPT, {
        format,
        filter,
        fields,
      });
      const anyOmni = this.omniAutomation as {
        executeJson?: (script: string) => Promise<unknown>;
        execute?: (script: string) => Promise<unknown>;
      };
      const raw = typeof anyOmni.executeJson === 'function' ? await anyOmni.executeJson(script) : await anyOmni.execute!(script);

      if (raw && typeof raw === 'object' && 'success' in raw) {
        const sr = raw as { success: boolean; error?: string; data?: unknown };
        if (!sr.success) {
          return createErrorResponseV2(
            'export',
            'TASK_EXPORT_FAILED',
            sr.error || 'Failed to export tasks',
            undefined,
            { format, filter },
            timer.toMetadata(),
          );
        }
        const result = sr.data as { format: string; data: unknown; count: number };
        return createSuccessResponseV2('export', { format: result.format as 'json' | 'csv' | 'markdown', exportType: 'tasks' as const, data: result.data as string | object, count: result.count }, undefined, { ...timer.toMetadata(), operation: 'tasks' });
      }

      const result = raw as {
        error?: boolean;
        message?: string;
        format: string;
        data: unknown;
        count: number;
      };
      if (result && result.error) {
        return createErrorResponseV2(
          'export',
          'TASK_EXPORT_FAILED',
          result.message || 'Failed to export tasks',
          undefined,
          { format, filter },
          timer.toMetadata(),
        );
      }

      return createSuccessResponseV2('export', { format: result.format as 'json' | 'csv' | 'markdown', exportType: 'tasks' as const, data: result.data as string | object, count: result.count }, undefined, { ...timer.toMetadata(), operation: 'tasks' });
    } catch (error) {
      return this.handleErrorV2<ExportDataV2>(error);
    }
  }

  // Direct implementation of project export
  private async handleProjectExport(args: {
    format: string;
    includeStats: boolean;
  }, timer: OperationTimerV2): Promise<ExportResponseV2> {
    const { format = 'json', includeStats = false } = args;

    try {
      const script = this.omniAutomation.buildScript(EXPORT_PROJECTS_SCRIPT, {
        format,
        includeStats,
      });
      const result = await this.omniAutomation.execute(script) as {
        format: string;
        data: unknown;
        count: number;
        error?: boolean;
        message?: string;
      };

      if (result.error) {
        return createErrorResponseV2(
          'export',
          'PROJECT_EXPORT_FAILED',
          result.message || 'Failed to export projects',
          undefined,
          { format, includeStats },
          timer.toMetadata(),
        );
      }

      return createSuccessResponseV2('export', { format: result.format as 'json' | 'csv' | 'markdown', exportType: 'projects' as const, data: result.data as string | object, count: result.count, includeStats }, undefined, { ...timer.toMetadata(), operation: 'projects' });
    } catch (error) {
      return this.handleErrorV2<ExportDataV2>(error);
    }
  }

  // Direct implementation of bulk export
  private async handleBulkExport(args: {
    outputDirectory: string;
    format: string;
    includeCompleted: boolean;
    includeProjectStats: boolean;
  }, timer: OperationTimerV2): Promise<ExportResponseV2> {
    const { outputDirectory, format = 'json', includeCompleted = true, includeProjectStats = true } = args;

    try {
      // Ensure directory exists using synchronous fs to avoid hanging issues with fs.promises
      try {
        const fsSync = await import('fs');
        fsSync.mkdirSync(outputDirectory, { recursive: true });
      } catch (mkdirError) {
        return createErrorResponseV2(
          'export',
          'MKDIR_FAILED',
          `Failed to create directory: ${String(mkdirError)}`,
          undefined,
          { outputDirectory, error: String(mkdirError) },
          timer.toMetadata(),
        );
      }

      const exports: Record<string, {
        format: string;
        task_count?: number;
        project_count?: number;
        tag_count?: number;
        exported: boolean;
      }> = {};
      let totalExported = 0;

      // Export tasks directly using script
      const taskFilter = includeCompleted ? {} : { completed: false };
      const taskScript = this.omniAutomation.buildScript(EXPORT_TASKS_SCRIPT, {
        format,
        filter: taskFilter,
        fields: undefined,
      });
      const anyOmni = this.omniAutomation as {
        executeJson?: (script: string) => Promise<unknown>;
        execute?: (script: string) => Promise<unknown>;
      };
      const taskRaw = typeof anyOmni.executeJson === 'function' ? await anyOmni.executeJson(taskScript) : await anyOmni.execute!(taskScript);

      let taskResult: { error?: boolean; data?: unknown; count?: number } | null = null;
      if (taskRaw && typeof taskRaw === 'object' && 'success' in taskRaw) {
        const successRaw = taskRaw as { success: boolean; data?: unknown };
        taskResult = successRaw.success ? (successRaw.data as { error?: boolean; data?: unknown; count?: number }) : null;
      } else {
        taskResult = taskRaw as { error?: boolean; data?: unknown; count?: number } | null;
      }

      if (taskResult && !taskResult.error) {
        const taskFile = path.join(outputDirectory, `tasks.${format}`);
        const taskCount = taskResult.count || 0;

        const payload = taskResult.data;
        const toWrite = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);
        const fsSync = await import('fs');
        fsSync.writeFileSync(taskFile, toWrite, 'utf-8');

        exports.tasks = {
          format: format,
          task_count: taskCount,
          exported: true,
        };
        totalExported += taskCount;
      }

      // Export projects directly using script
      const projectScript = this.omniAutomation.buildScript(EXPORT_PROJECTS_SCRIPT, {
        format,
        includeStats: includeProjectStats,
      });
      const projectResult = await this.omniAutomation.execute(projectScript) as {
        error?: boolean;
        data?: unknown;
        count?: number;
      };

      if (projectResult && !projectResult.error) {
        const projectFile = path.join(outputDirectory, `projects.${format}`);
        const projectCount = projectResult.count || 0;

        const ppayload = projectResult.data;
        const pwrite = typeof ppayload === 'string' ? ppayload : JSON.stringify(ppayload, null, 2);
        const fsSync = await import('fs');
        fsSync.writeFileSync(projectFile, pwrite, 'utf-8');

        exports.projects = {
          format: format,
          project_count: projectCount,
          exported: true,
        };
        totalExported += projectCount;
      }

      // Export tags (JSON only) - delegate to TagsToolV2
      const tagExporter = new TagsToolV2(this.cache);
      const tagResult = await tagExporter.execute({ includeEmpty: true }) as {
        success?: boolean;
        data?: {
          items?: unknown[];
          tags?: unknown[];
        };
        metadata?: {
          total_count?: number;
        };
      };

      if (tagResult && tagResult.success && tagResult.data) {
        const tagFile = path.join(outputDirectory, 'tags.json');
        const tagItems = (tagResult.data.items || tagResult.data.tags || []);
        const tagCount = (tagResult.metadata?.total_count) || (tagItems as unknown[]).length;

        const fsSync = await import('fs');
        fsSync.writeFileSync(tagFile, JSON.stringify(tagItems, null, 2), 'utf-8');

        exports.tags = {
          format: 'json',
          tag_count: tagCount,
          exported: true,
        };
        totalExported += tagCount;
      }

      return createSuccessResponseV2('export', { format: format as 'json' | 'csv' | 'markdown', exportType: 'bulk' as const, data: exports, count: totalExported, exports, summary: { totalExported, export_date: new Date().toISOString() } }, undefined, { ...timer.toMetadata(), operation: 'all' });
    } catch (error) {
      // Provide specific recovery information for file system errors
      if (error instanceof Error) {
        const errorMessage = error.message.toLowerCase();
        if (errorMessage.includes('eacces') || errorMessage.includes('permission')) {
          return createErrorResponseV2(
            'export',
            'PERMISSION_DENIED',
            `Cannot write to directory: ${outputDirectory}`,
            'Check directory permissions',
            {
              recovery: [
                'Check that the directory exists and is writable',
                'Try using a different output directory',
                'Ensure you have write permissions to the parent directory',
              ],
              path: outputDirectory,
            },
            timer.toMetadata(),
          );
        }
        if (errorMessage.includes('enospc')) {
          return createErrorResponseV2(
            'export',
            'DISK_FULL',
            'Not enough disk space to complete export',
            'Free disk space and try again',
            {
              recovery: [
                'Free up disk space and try again',
                'Choose a different output directory on a drive with more space',
              ],
              path: outputDirectory,
            },
            timer.toMetadata(),
          );
        }
        if (errorMessage.includes('enoent')) {
          return createErrorResponseV2(
            'export',
            'PATH_NOT_FOUND',
            `Output directory path not found: ${outputDirectory}`,
            'Verify the output directory path',
            {
              recovery: [
                'Verify the output directory path is correct',
                'Create the parent directory first',
                'Use an absolute path instead of a relative path',
              ],
              path: outputDirectory,
            },
            timer.toMetadata(),
          );
        }
      }
      return this.handleErrorV2<ExportDataV2>(error);
    }
  }
}
