import { BaseTool } from '../base.js';
import {
  PROJECTS_FOR_REVIEW_SCRIPT,
  MARK_PROJECT_REVIEWED_SCRIPT,
  SET_REVIEW_SCHEDULE_SCRIPT,
} from '../../omnifocus/scripts/reviews.js';
import { createListResponseV2, createSuccessResponseV2, createErrorResponseV2, OperationTimerV2 } from '../../utils/response-format-v2.js';
import { ManageReviewsSchema, ManageReviewsInput } from '../schemas/consolidated-schemas.js';
import { isScriptSuccess, ListResultSchema, SimpleOperationResultSchema } from '../../omnifocus/script-result-types.js';

export class ManageReviewsTool extends BaseTool<typeof ManageReviewsSchema> {
  name = 'manage_reviews';
  description = 'Consolidated tool for all project review operations. Supports listing projects for review, marking projects as reviewed, setting/clearing review schedules. Essential for GTD weekly reviews.';
  schema = ManageReviewsSchema;

  async executeValidated(args: ManageReviewsInput): Promise<any> {
    const timer = new OperationTimerV2();

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
          return createErrorResponseV2(
            'manage_reviews',
            'INVALID_OPERATION',
            `Unknown operation: ${(args as any).operation}`,
            'Use one of: list_for_review, mark_reviewed, set_schedule, clear_schedule',
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
    timer: OperationTimerV2,
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
    const omni: any = this.omniAutomation as any;
    const raw = typeof omni.executeJson === 'function' ? await omni.executeJson(script) : await omni.execute(script);
    if (raw == null) {
      return createErrorResponseV2('manage_reviews', 'NULL_RESULT', 'No data returned from script', 'Ensure OmniFocus is running', {}, timer.toMetadata());
    }
    if (raw && typeof raw === 'object' && (raw as any).error === true) {
      return createErrorResponseV2('manage_reviews', 'SCRIPT_ERROR', (raw as any).message || 'Script error', undefined, { details: (raw as any).details }, timer.toMetadata());
    }
    const dataAny: any = (raw as any).data !== undefined ? (raw as any).data : raw;
    if (dataAny == null) {
      return createErrorResponseV2('manage_reviews', 'NULL_RESULT', 'No data returned from script', undefined, {}, timer.toMetadata());
    }
    // Ensure projects array exists (accept both wrapped and raw)
    const src = dataAny?.projects || dataAny?.items;
    if (!src) {
      return createErrorResponseV2(
        'manage_reviews',
        'INVALID_RESPONSE',
        'Invalid response from OmniFocus: projects array not found',
        'Script should return { projects: [...] } or { items: [...] }',
        { received: dataAny, expected: 'object with projects/items array' },
        timer.toMetadata(),
      );
    }

    // Parse dates and calculate review status
    const now = new Date();
    const sourceProjects = src;
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
    const standardResponse = createListResponseV2(
      'manage_reviews',
      parsedProjects,
      'projects',
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
        ...(dataAny?.metadata || {}),
      },
    );

    // Cache results
    this.cache.set('reviews', cacheKey, standardResponse);

    return standardResponse;
  }

  private async markReviewed(
    args: Extract<ManageReviewsInput, { operation: 'mark_reviewed' }>,
    timer: OperationTimerV2,
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
    const result = await this.execJson(script, SimpleOperationResultSchema);

    if (!isScriptSuccess(result)) {
      return createErrorResponseV2(
        'manage_reviews',
        'SCRIPT_ERROR',
        (result as any).error,
        'Try again with updateNextReviewDate=false',
        { details: (result as any).details },
        timer.toMetadata(),
      );
    }

    // Invalidate relevant caches after successful review
    this.cache.invalidate('projects');
    this.cache.invalidate('reviews');

    // Parse the result
    const parsedResult = result.data;

    return createSuccessResponseV2('manage_reviews', { project: parsedResult }, undefined, { ...timer.toMetadata(), operation: 'mark_reviewed', reviewed_id: projectId, review_date: actualReviewDate, next_review_calculated: updateNextReviewDate, input_params: { projectId, reviewDate: actualReviewDate, updateNextReviewDate } });
  }

  private async setSchedule(
    args: Extract<ManageReviewsInput, { operation: 'set_schedule' }>,
    timer: OperationTimerV2,
  ): Promise<any> {
    const { projectIds, reviewInterval, nextReviewDate } = args;

    // Execute batch review schedule script
    const script = this.omniAutomation.buildScript(SET_REVIEW_SCHEDULE_SCRIPT, {
      projectIds,
      reviewInterval,
      nextReviewDate,
    });
    const result = await this.execJson(script, SimpleOperationResultSchema);

    if (!isScriptSuccess(result)) {
      return createErrorResponseV2(
        'manage_reviews',
        'SCRIPT_ERROR',
        (result as any).error,
        'Verify project IDs and schedule details',
        { details: (result as any).details },
        timer.toMetadata(),
      );
    }

    // Invalidate relevant caches after successful batch update
    this.cache.invalidate('projects');
    this.cache.invalidate('reviews');

    // Parse the result
    const parsedResult = result.data;

    return createSuccessResponseV2('manage_reviews', { batch: parsedResult }, undefined, { ...timer.toMetadata(), operation: 'set_schedule', projects_updated: projectIds.length, review_interval: reviewInterval, next_review_date: nextReviewDate, input_params: { projectIds, reviewInterval, nextReviewDate } });
  }

  private async clearSchedule(
    args: Extract<ManageReviewsInput, { operation: 'clear_schedule' }>,
    timer: OperationTimerV2,
  ): Promise<any> {
    const { projectIds } = args;

    // Clear schedule by setting no review interval and null next review date
    const script = this.omniAutomation.buildScript(SET_REVIEW_SCHEDULE_SCRIPT, {
      projectIds,
      reviewInterval: null,
      nextReviewDate: null,
    });
    const result = await this.execJson(script, SimpleOperationResultSchema);

    if (!isScriptSuccess(result)) {
      return createErrorResponseV2(
        'manage_reviews',
        'SCRIPT_ERROR',
        (result as any).error,
        undefined,
        { details: (result as any).details },
        timer.toMetadata(),
      );
    }

    // Invalidate relevant caches after successful batch update
    this.cache.invalidate('projects');
    this.cache.invalidate('reviews');

    // Parse the result
    const parsedResult = result.data;

    return createSuccessResponseV2('manage_reviews', { batch: parsedResult }, undefined, { ...timer.toMetadata(), operation: 'clear_schedule', projects_updated: projectIds.length, input_params: { projectIds } });
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

  // Helper to adapt mocks that return raw objects or null
  private async execJson(script: string, _schema?: any): Promise<any> {
    const anyOmni: any = this.omniAutomation as any;
    const res = typeof anyOmni.executeJson === 'function' ? await anyOmni.executeJson(script) : await anyOmni.execute(script);
    if (res === null || res === undefined) {
      return { success: false, error: 'NULL_RESULT' };
    }
    if (res && typeof res === 'object') {
      const obj: any = res;
      if (obj.success === false) return obj;
      // Treat presence of projects/items or ok/updated flags as success
      if (Array.isArray(obj.projects) || Array.isArray(obj.items) || obj.ok === true || typeof obj.updated === 'number') {
        return { success: true, data: obj };
      }
    }
    // Fallback: wrap as success with raw data; listForReview will validate presence of projects/items
    return { success: true, data: res };
  }
}
