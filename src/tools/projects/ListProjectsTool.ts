import { BaseTool } from '../base.js';
import { ProjectFilter } from '../../omnifocus/types.js';
import { LIST_PROJECTS_SCRIPT } from '../../omnifocus/scripts/projects.js';
import { createListResponse, createErrorResponse, OperationTimer } from '../../utils/response-format.js';

export class ListProjectsTool extends BaseTool {
  name = 'list_projects';
  description = 'List projects from OmniFocus with filtering options';
  
  inputSchema = {
    type: 'object' as const,
    properties: {
      status: {
        type: 'array',
        items: {
          type: 'string',
          enum: ['active', 'onHold', 'dropped', 'completed'],
        },
        description: 'Filter by project status',
      },
      flagged: {
        type: 'boolean',
        description: 'Filter by flagged status',
      },
      folder: {
        type: 'string',
        description: 'Filter by folder name',
      },
      reviewBefore: {
        type: 'string',
        format: 'date-time',
        description: 'Filter projects needing review before this date',
      },
      search: {
        type: 'string',
        description: 'Search in project name and notes',
      },
    },
  };

  async execute(args: ProjectFilter): Promise<any> {
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
              ...timer.toMetadata()
            }
          };
        } else if (Array.isArray(cached)) {
          // Legacy format - convert to standard
          return createListResponse(
            'list_projects',
            cached,
            {
              from_cache: true,
              ...timer.toMetadata(),
              filters_applied: args
            }
          );
        }
      }
      
      // Execute script
      const script = this.omniAutomation.buildScript(LIST_PROJECTS_SCRIPT, { filter: args });
      const result = await this.omniAutomation.execute<any>(script);
      
      // Check if script returned an error
      if (result.error) {
        return createErrorResponse(
          'list_projects',
          'SCRIPT_ERROR',
          result.message || 'Failed to list projects',
          result.details,
          timer.toMetadata()
        );
      }
      
      // Ensure projects array exists
      if (!result.projects || !Array.isArray(result.projects)) {
        return createErrorResponse(
          'list_projects',
          'INVALID_RESPONSE',
          'Invalid response from OmniFocus: projects array not found',
          { received: result, expected: 'object with projects array' },
          timer.toMetadata()
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
          ...result.metadata
        }
      );
      
      // Cache results (cache the standardized format)
      this.cache.set('projects', cacheKey, standardResponse);
      
      return standardResponse;
    } catch (error) {
      return this.handleError(error);
    }
  }
}