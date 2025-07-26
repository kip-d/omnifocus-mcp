import { LegacyBaseTool } from '../legacy-base.js';
import { ExportTasksTool } from './ExportTasksTool.js';
import { ExportProjectsTool } from './ExportProjectsTool.js';
import { ListTagsTool } from '../tags/ListTagsTool.js';
import * as fs from 'fs/promises';
import * as path from 'path';

export class BulkExportTool extends LegacyBaseTool {
  name = 'bulk_export';
  description = 'Export all OmniFocus data (tasks, projects, tags) to files';

  inputSchema = {
    type: 'object' as const,
    properties: {
      outputDirectory: {
        type: 'string',
        description: 'Directory to save export files',
      },
      format: {
        type: 'string',
        enum: ['json', 'csv'],
        description: 'Export format (default: json)',
        default: 'json',
      },
      includeCompleted: {
        type: 'boolean',
        description: 'Include completed tasks',
        default: true,
      },
      includeProjectStats: {
        type: 'boolean',
        description: 'Include statistics in project export',
        default: true,
      },
    },
    required: ['outputDirectory'],
  };

  async execute(args: {
    outputDirectory: string;
    format?: 'json' | 'csv';
    includeCompleted?: boolean;
    includeProjectStats?: boolean;
  }): Promise<any> {
    try {
      const {
        outputDirectory,
        format = 'json',
        includeCompleted = true,
        includeProjectStats = true,
      } = args;

      // Ensure directory exists
      await fs.mkdir(outputDirectory, { recursive: true });

      const results = {
        tasks: { exported: 0, file: '' },
        projects: { exported: 0, file: '' },
        tags: { exported: 0, file: '' },
        timestamp: new Date().toISOString(),
      };

      // Export tasks
      const taskExporter = new ExportTasksTool(this.cache);
      const taskFilter = includeCompleted ? {} : { completed: false };
      const taskResult = await taskExporter.execute({ format, filter: taskFilter });

      if (!taskResult.error) {
        const taskFile = path.join(outputDirectory, `tasks.${format}`);
        const taskData = taskResult.data || taskResult;
        const taskCount = taskResult.count || (taskData.count) || 0;

        if (format === 'csv') {
          await fs.writeFile(taskFile, taskData.data || taskData, 'utf-8');
        } else {
          await fs.writeFile(taskFile, JSON.stringify(taskData.data || taskData, null, 2), 'utf-8');
        }
        results.tasks.exported = taskCount;
        results.tasks.file = taskFile;
      }

      // Export projects
      const projectExporter = new ExportProjectsTool(this.cache);
      const projectResult = await projectExporter.execute({
        format,
        includeStats: includeProjectStats,
      });

      if (!projectResult.error && projectResult.success !== false) {
        const projectFile = path.join(outputDirectory, `projects.${format}`);
        const projectData = projectResult.data || projectResult;
        const projectCount = projectData.count || 0;

        if (format === 'csv') {
          await fs.writeFile(projectFile, projectData.data || projectData, 'utf-8');
        } else {
          await fs.writeFile(projectFile, JSON.stringify(projectData.data || projectData, null, 2), 'utf-8');
        }
        results.projects.exported = projectCount;
        results.projects.file = projectFile;
      }

      // Export tags (JSON only)
      const tagExporter = new ListTagsTool(this.cache);
      const tagResult = await tagExporter.execute({ includeEmpty: true });

      if (!tagResult.error && tagResult.success !== false) {
        const tagFile = path.join(outputDirectory, 'tags.json');
        const tagData = tagResult.data || tagResult;
        const tagItems = tagData.items || tagData.tags || [];
        const tagCount = tagResult.metadata?.total_count || tagItems.length || 0;

        await fs.writeFile(tagFile, JSON.stringify(tagItems, null, 2), 'utf-8');
        results.tags.exported = tagCount;
        results.tags.file = tagFile;
      }

      return {
        success: true,
        message: `Exported ${results.tasks.exported} tasks, ${results.projects.exported} projects, and ${results.tags.exported} tags`,
        results,
      };
    } catch (error) {
      return this.handleError(error);
    }
  }
}
