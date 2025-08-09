import { z } from 'zod';
import { BaseTool } from '../base.js';
import { PROJECTS_FOR_REVIEW_SCRIPT } from '../../omnifocus/scripts/reviews.js';
import { createListResponse, createErrorResponse, OperationTimer } from '../../utils/response-format.js';
import { ProjectsForReviewSchema } from '../schemas/project-schemas.js';

export class ProjectsForReviewTool extends BaseTool<typeof ProjectsForReviewSchema> {
  name = 'projects_for_review';
  description = '**DEPRECATED**: Use manage_reviews with operation: "list_for_review" instead. List projects that are due for review based on their review schedule. Use overdue=true for only overdue reviews, or set daysAhead to include upcoming reviews. Essential for GTD weekly reviews.';
  schema = ProjectsForReviewSchema;

  async executeValidated(args: z.infer<typeof ProjectsForReviewSchema>): Promise<any> {
    const timer = new OperationTimer();

    try {
      // Create cache key from filter
      const cacheKey = JSON.stringify(args);

      // Check cache (shorter TTL for review data since it's time-sensitive)
      const cached = this.cache.get<any>('reviews', cacheKey);
      if (cached) {
        this.logger.debug('Returning cached projects for review');
        return {
          ...cached,
          metadata: {
            ...cached.metadata,
            from_cache: true,
            ...timer.toMetadata(),
          },
        };
      }

      // Execute script
      const script = this.omniAutomation.buildScript(PROJECTS_FOR_REVIEW_SCRIPT, {
        filter: args,
      });
      const result = await this.omniAutomation.execute<any>(script);

      // Check if result is null/undefined
      if (!result) {
        return createErrorResponse(
          'projects_for_review',
          'NULL_RESULT',
          'OmniFocus script returned no result',
          { rawResult: result },
          timer.toMetadata(),
        );
      }

      // Check if script returned an error
      if (result.error) {
        return createErrorResponse(
          'projects_for_review',
          'SCRIPT_ERROR',
          result.message || result.error || 'Failed to get projects for review',
          { details: result.details, rawResult: result },
          timer.toMetadata(),
        );
      }

      // Ensure projects array exists
      if (!result.projects || !Array.isArray(result.projects)) {
        return createErrorResponse(
          'projects_for_review',
          'INVALID_RESPONSE',
          'Invalid response from OmniFocus: projects array not found',
          { received: result, expected: 'object with projects array' },
          timer.toMetadata(),
        );
      }

      // Parse dates and calculate review status
      const now = new Date();
      const parsedProjects = result.projects.map((project: any) => {
        const nextReviewDate = project.nextReviewDate ? new Date(project.nextReviewDate) : null;
        const lastReviewDate = project.lastReviewDate ? new Date(project.lastReviewDate) : null;
        
        let reviewStatus = 'no_schedule';
        let daysUntilReview = null;
        
        if (nextReviewDate) {
          const msUntilReview = nextReviewDate.getTime() - now.getTime();
          daysUntilReview = Math.ceil(msUntilReview / (1000 * 60 * 60 * 24));
          
          if (daysUntilReview < 0) {
            reviewStatus = 'overdue';
          } else if (daysUntilReview === 0) {
            reviewStatus = 'due_today';
          } else if (daysUntilReview <= args.daysAhead) {
            reviewStatus = 'due_soon';
          } else {
            reviewStatus = 'scheduled';
          }
        }

        return {
          ...project,
          dueDate: project.dueDate ? new Date(project.dueDate) : undefined,
          deferDate: project.deferDate ? new Date(project.deferDate) : undefined,
          completionDate: project.completionDate ? new Date(project.completionDate) : undefined,
          lastReviewDate,
          nextReviewDate,
          reviewStatus,
          daysUntilReview,
          daysSinceLastReview: lastReviewDate ? 
            Math.floor((now.getTime() - lastReviewDate.getTime()) / (1000 * 60 * 60 * 24)) : null,
        };
      });

      // Create standardized response
      const standardResponse = createListResponse(
        'projects_for_review',
        parsedProjects,
        {
          ...timer.toMetadata(),
          filters_applied: args,
          review_summary: {
            total_projects: parsedProjects.length,
            overdue: parsedProjects.filter((p: any) => p.reviewStatus === 'overdue').length,
            due_today: parsedProjects.filter((p: any) => p.reviewStatus === 'due_today').length,
            due_soon: parsedProjects.filter((p: any) => p.reviewStatus === 'due_soon').length,
            no_schedule: parsedProjects.filter((p: any) => p.reviewStatus === 'no_schedule').length,
          },
          ...result.metadata,
        },
      );

      // Cache results
      this.cache.set('reviews', cacheKey, standardResponse);

      return standardResponse;
    } catch (error) {
      return this.handleError(error);
    }
  }
}