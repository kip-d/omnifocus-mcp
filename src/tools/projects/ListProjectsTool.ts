import { z } from 'zod';
import { BaseTool } from '../base.js';
import { LIST_PROJECTS_SCRIPT } from '../../omnifocus/scripts/projects.js';
import { createListResponse, createErrorResponse, OperationTimer } from '../../utils/response-format.js';
import { ListProjectsSchema } from '../schemas/project-schemas.js';

export class ListProjectsTool extends BaseTool<typeof ListProjectsSchema> {
  name = 'list_projects';
  description = 'List projects from OmniFocus. Filter by status, flagged, folder, or search. Set includeStats=false (default) for faster queries, includeTaskCounts=true for task metrics. Default limit=100. Cached for performance.';
  schema = ListProjectsSchema;

  async executeValidated(args: z.infer<typeof ListProjectsSchema>): Promise<any> {
    const timer = new OperationTimer();

    try {
      // Create cache key from filter
      const cacheKey = JSON.stringify(args);

      // Check cache
      const cached = this.cache.get<any>('projects', cacheKey);
      if (cached) {
        this.logger.debug('Returning cached projects');
        // Handle both legacy and new cached formats
        if (cached.data && cached.data.items) {
          // Already in standardized format
          return {
            ...cached,
            metadata: {
              ...cached.metadata,
              from_cache: true,
              ...timer.toMetadata(),
            },
          };
        } else if (Array.isArray(cached)) {
          // Legacy format - convert to standard
          return createListResponse(
            'list_projects',
            cached,
            {
              from_cache: true,
              ...timer.toMetadata(),
              filters_applied: args as Record<string, unknown>,
            },
          );
        }
      }

      // Execute script
      const { limit, includeStats, ...filter } = args;
      const script = this.omniAutomation.buildScript(LIST_PROJECTS_SCRIPT, {
        filter,
        limit: limit || 100,
        includeStats: includeStats || false,
      });
      const result = await this.omniAutomation.execute<any>(script);

      // Check if script returned an error
      if (result.error) {
        return createErrorResponse(
          'list_projects',
          'SCRIPT_ERROR',
          result.message || 'Failed to list projects',
          result.details,
          timer.toMetadata(),
        );
      }

      // Ensure projects array exists
      if (!result.projects || !Array.isArray(result.projects)) {
        return createErrorResponse(
          'list_projects',
          'INVALID_RESPONSE',
          'Invalid response from OmniFocus: projects array not found',
          { received: result, expected: 'object with projects array' },
          timer.toMetadata(),
        );
      }

      // Parse dates
      const parsedProjects = result.projects.map((project: any) => ({
        ...project,
        dueDate: project.dueDate ? new Date(project.dueDate) : undefined,
        deferDate: project.deferDate ? new Date(project.deferDate) : undefined,
        completionDate: project.completionDate ? new Date(project.completionDate) : undefined,
        lastReviewDate: project.lastReviewDate ? new Date(project.lastReviewDate) : undefined,
      }));

      // Create standardized response
      const standardResponse = createListResponse(
        'list_projects',
        parsedProjects,
        {
          ...timer.toMetadata(),
          filters_applied: args,
          ...result.metadata,
        },
      );

      // Cache results (cache the standardized format)
      this.cache.set('projects', cacheKey, standardResponse);

      return standardResponse;
    } catch (error) {
      return this.handleError(error);
    }
  }
}
