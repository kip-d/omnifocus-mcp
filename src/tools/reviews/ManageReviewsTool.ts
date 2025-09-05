import { BaseTool } from '../base.js';
import {
  PROJECTS_FOR_REVIEW_SCRIPT,
  MARK_PROJECT_REVIEWED_SCRIPT,
  SET_REVIEW_SCHEDULE_SCRIPT,
} from '../../omnifocus/scripts/reviews.js';
import { createListResponse, createEntityResponse, createErrorResponse, OperationTimer } from '../../utils/response-format.js';
import { ManageReviewsSchema, ManageReviewsInput } from '../schemas/consolidated-schemas.js';
import { isScriptSuccess, ListResultSchema, SimpleOperationResultSchema } from '../../omnifocus/script-result-types.js';

export class ManageReviewsTool extends BaseTool<typeof ManageReviewsSchema> {
  name = 'manage_reviews';
  description = 'Consolidated tool for all project review operations. Supports listing projects for review, marking projects as reviewed, setting/clearing review schedules. Essential for GTD weekly reviews.';
  schema = ManageReviewsSchema;

  async executeValidated(args: ManageReviewsInput): Promise<any> {
    const timer = new OperationTimer();

    try {
      // Handle Claude Desktop sometimes sending stringified parameters
      const normalizedArgs = this.normalizeArgs(args);

      switch (normalizedArgs.operation) {
        case 'list_for_review':
          return this.listForReview(normalizedArgs, timer);

        case 'mark_reviewed':
          return this.markReviewed(normalizedArgs, timer);

        case 'set_schedule':
          return this.setSchedule(normalizedArgs, timer);

        case 'clear_schedule':
          return this.clearSchedule(normalizedArgs, timer);

        default:
          // TypeScript should prevent this, but just in case
          return createErrorResponse(
            'manage_reviews',
            'INVALID_OPERATION',
            `Unknown operation: ${(args as any).operation}`,
            { operation: (args as any).operation },
            timer.toMetadata(),
          );
      }
    } catch (error) {
      return this.handleError(error);
    }
  }

  private async listForReview(
    args: Extract<ManageReviewsInput, { operation: 'list_for_review' }>,
    timer: OperationTimer,
  ): Promise<any> {
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
    const result = await this.omniAutomation.executeJson(script, ListResultSchema);

    if (!isScriptSuccess(result)) {
      const code = result.error === 'NULL_RESULT' ? 'NULL_RESULT' : 'SCRIPT_ERROR';
      return createErrorResponse(
        'manage_reviews',
        code,
        result.error,
        { details: result.details },
        timer.toMetadata(),
      );
    }

    // Ensure projects array exists
    if (!((result.data as any).projects || (result.data as any).items)) {
      return createErrorResponse(
        'manage_reviews',
        'INVALID_RESPONSE',
        'Invalid response from OmniFocus: projects array not found',
        { received: result, expected: 'object with projects/items array' },
        timer.toMetadata(),
      );
    }

    // Parse dates and calculate review status
    const now = new Date();
    const sourceProjects = (result.data as any).projects || (result.data as any).items;
    const parsedProjects = sourceProjects.map((project: any) => {
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
      'manage_reviews',
      parsedProjects,
      {
        ...timer.toMetadata(),
        operation: 'list_for_review',
        filters_applied: args,
        review_summary: {
          total_projects: parsedProjects.length,
          overdue: parsedProjects.filter((p: any) => p.reviewStatus === 'overdue').length,
          due_today: parsedProjects.filter((p: any) => p.reviewStatus === 'due_today').length,
          due_soon: parsedProjects.filter((p: any) => p.reviewStatus === 'due_soon').length,
          no_schedule: parsedProjects.filter((p: any) => p.reviewStatus === 'no_schedule').length,
        },
        ...(result.data as any).metadata,
      },
    );

    // Cache results
    this.cache.set('reviews', cacheKey, standardResponse);

    return standardResponse;
  }

  private async markReviewed(
    args: Extract<ManageReviewsInput, { operation: 'mark_reviewed' }>,
    timer: OperationTimer,
  ): Promise<any> {
    const { projectId, reviewDate, updateNextReviewDate } = args;

    // Use current date if no review date provided
    const actualReviewDate = reviewDate || new Date().toISOString();

    // Execute mark reviewed script
    const script = this.omniAutomation.buildScript(MARK_PROJECT_REVIEWED_SCRIPT, {
      projectId,
      reviewDate: actualReviewDate,
      updateNextReviewDate,
    });
    const result = await this.omniAutomation.executeJson(script, SimpleOperationResultSchema);

    if (!isScriptSuccess(result)) {
      return createErrorResponse(
        'manage_reviews',
        'SCRIPT_ERROR',
        result.error,
        { details: result.details },
        timer.toMetadata(),
      );
    }

    // Invalidate relevant caches after successful review
    this.cache.invalidate('projects');
    this.cache.invalidate('reviews');

    // Parse the result
    const parsedResult = result.data;

    return createEntityResponse(
      'manage_reviews',
      'project',
      parsedResult,
      {
        ...timer.toMetadata(),
        operation: 'mark_reviewed',
        reviewed_id: projectId,
        review_date: actualReviewDate,
        next_review_calculated: updateNextReviewDate,
        input_params: {
          projectId,
          reviewDate: actualReviewDate,
          updateNextReviewDate,
        },
      },
    );
  }

  private async setSchedule(
    args: Extract<ManageReviewsInput, { operation: 'set_schedule' }>,
    timer: OperationTimer,
  ): Promise<any> {
    const { projectIds, reviewInterval, nextReviewDate } = args;

    // Execute batch review schedule script
    const script = this.omniAutomation.buildScript(SET_REVIEW_SCHEDULE_SCRIPT, {
      projectIds,
      reviewInterval,
      nextReviewDate,
    });
    const result = await this.omniAutomation.executeJson(script, SimpleOperationResultSchema);

    if (!isScriptSuccess(result)) {
      return createErrorResponse(
        'manage_reviews',
        'SCRIPT_ERROR',
        result.error,
        { details: result.details },
        timer.toMetadata(),
      );
    }

    // Invalidate relevant caches after successful batch update
    this.cache.invalidate('projects');
    this.cache.invalidate('reviews');

    // Parse the result
    const parsedResult = result.data;

    return createEntityResponse(
      'manage_reviews',
      'batch_operation',
      parsedResult,
      {
        ...timer.toMetadata(),
        operation: 'set_schedule',
        projects_updated: projectIds.length,
        review_interval: reviewInterval,
        next_review_date: nextReviewDate,
        input_params: {
          projectIds,
          reviewInterval,
          nextReviewDate,
        },
      },
    );
  }

  private async clearSchedule(
    args: Extract<ManageReviewsInput, { operation: 'clear_schedule' }>,
    timer: OperationTimer,
  ): Promise<any> {
    const { projectIds } = args;

    // Clear schedule by setting no review interval and null next review date
    const script = this.omniAutomation.buildScript(SET_REVIEW_SCHEDULE_SCRIPT, {
      projectIds,
      reviewInterval: null,
      nextReviewDate: null,
    });
    const result = await this.omniAutomation.executeJson(script, SimpleOperationResultSchema);

    if (!isScriptSuccess(result)) {
      return createErrorResponse(
        'manage_reviews',
        'SCRIPT_ERROR',
        result.error,
        { details: result.details },
        timer.toMetadata(),
      );
    }

    // Invalidate relevant caches after successful batch update
    this.cache.invalidate('projects');
    this.cache.invalidate('reviews');

    // Parse the result
    const parsedResult = result.data;

    return createEntityResponse(
      'manage_reviews',
      'batch_operation',
      parsedResult,
      {
        ...timer.toMetadata(),
        operation: 'clear_schedule',
        projects_updated: projectIds.length,
        input_params: {
          projectIds,
        },
      },
    );
  }

  private normalizeArgs(args: any): ManageReviewsInput {
    // Handle Claude Desktop sometimes sending stringified parameters
    const normalized = { ...args };

    // Parse projectIds if it's a string
    if (typeof normalized.projectIds === 'string') {
      try {
        normalized.projectIds = JSON.parse(normalized.projectIds);
      } catch {
        this.logger.warn('Failed to parse projectIds string, keeping as-is');
      }
    }

    // Parse reviewInterval if it's a string
    if (typeof normalized.reviewInterval === 'string') {
      try {
        normalized.reviewInterval = JSON.parse(normalized.reviewInterval);
      } catch {
        this.logger.warn('Failed to parse reviewInterval string, keeping as-is');
      }
    }

    // Parse other potentially stringified arrays/objects
    if (typeof normalized.tags === 'string') {
      try {
        normalized.tags = JSON.parse(normalized.tags);
      } catch {
        this.logger.warn('Failed to parse tags string, keeping as-is');
      }
    }

    return normalized as ManageReviewsInput;
  }
}
