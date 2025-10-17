import { BaseTool } from '../base.js';
import {
  PROJECTS_FOR_REVIEW_SCRIPT,
  MARK_PROJECT_REVIEWED_SCRIPT,
  SET_REVIEW_SCHEDULE_SCRIPT,
} from '../../omnifocus/scripts/reviews.js';
import { createListResponseV2, createSuccessResponseV2, createErrorResponseV2, OperationTimerV2, StandardResponseV2 } from '../../utils/response-format.js';
import { ManageReviewsSchema, ManageReviewsInput } from '../schemas/consolidated-schemas.js';
import { isScriptSuccess, isScriptError } from '../../omnifocus/script-result-types.js';
import { ReviewListData } from '../../omnifocus/script-response-types.js';
import { ReviewsResponseV2, ReviewsDataV2 } from '../response-types-v2.js';

export class ManageReviewsTool extends BaseTool<typeof ManageReviewsSchema, ReviewsResponseV2> {
  name = 'manage_reviews';
  description = 'Consolidated tool for all project review operations. Supports listing projects for review, marking projects as reviewed, setting/clearing review schedules. Essential for GTD weekly reviews.';
  schema = ManageReviewsSchema;
  meta = {
    // Phase 1: Essential metadata
    category: 'Utility' as const,
    stability: 'stable' as const,
    complexity: 'simple' as const,
    performanceClass: 'fast' as const,
    tags: ['mutations', 'write', 'reviews', 'scheduling'],
    capabilities: ['mark-reviewed', 'list-for-review', 'schedule-review'],

    // Phase 2: Capability & Performance Documentation
    maxResults: 500, // Max projects to list for review
    maxQueryDuration: 3000, // 3 seconds
    requiresPermission: true,
    requiredCapabilities: ['read', 'write'],
    limitations: [
      'Maximum 500 projects per review list',
      'Review schedule in days (1-365)',
      'Marking reviewed resets review timer',
      'Projects without review schedule never appear in review list',
    ],
  };

  async executeValidated(args: ManageReviewsInput): Promise<ReviewsResponseV2> {
    const timer = new OperationTimerV2();

    try {
      // Handle Claude Desktop sometimes sending stringified parameters
      const normalizedArgs = this.normalizeArgs(args);

      switch (normalizedArgs.operation) {
        case 'list_for_review':
          return this.listForReview(normalizedArgs, timer) as Promise<ReviewsResponseV2>;

        case 'mark_reviewed':
          return this.markReviewed(normalizedArgs, timer) as Promise<ReviewsResponseV2>;

        case 'set_schedule':
          return this.setSchedule(normalizedArgs, timer) as Promise<ReviewsResponseV2>;

        case 'clear_schedule':
          return this.clearSchedule(normalizedArgs, timer) as Promise<ReviewsResponseV2>;

        default:
          // TypeScript should prevent this, but just in case
          return createErrorResponseV2(
            'manage_reviews',
            'INVALID_OPERATION',
            `Unknown operation: ${(args as { operation?: string }).operation}`,
            'Use one of: list_for_review, mark_reviewed, set_schedule, clear_schedule',
            { operation: (args as { operation?: string }).operation },
            timer.toMetadata(),
          );
      }
    } catch (error) {
      return this.handleErrorV2<ReviewsDataV2>(error);
    }
  }

  private async listForReview(
    args: Extract<ManageReviewsInput, { operation: 'list_for_review' }>,
    timer: OperationTimerV2,
  ): Promise<StandardResponseV2<unknown>> {
    // Create cache key from filter
    const cacheKey = JSON.stringify(args);

    // Check cache (shorter TTL for review data since it's time-sensitive)
    const cached = this.cache.get<{ metadata?: Record<string, unknown>; projects?: unknown[] }>('reviews', cacheKey);
    if (cached) {
      this.logger.debug('Returning cached projects for review');
      return {
        ...cached,
        metadata: {
          operation: 'manage_reviews',
          timestamp: new Date().toISOString(),
          ...cached?.metadata,
          from_cache: true,
          ...timer.toMetadata(),
        },
      } as StandardResponseV2<unknown>;
    }

    // Execute script
    const script = this.omniAutomation.buildScript(PROJECTS_FOR_REVIEW_SCRIPT, {
      filter: args,
    });
    const result = await this.execJson<ReviewListData>(script);
    if (isScriptError(result)) {
      return createErrorResponseV2('manage_reviews', result.error === 'NULL_RESULT' ? 'NULL_RESULT' : 'SCRIPT_ERROR', result.error || 'Script error', undefined, result.details, timer.toMetadata());
    }

    const data: ReviewListData = isScriptSuccess(result) ? result.data : { projects: [], count: 0 };
    // Ensure projects array exists (accept both wrapped and raw)
    const src = data?.projects || data?.items || [];
    if (!Array.isArray(src)) {
      return createErrorResponseV2(
        'manage_reviews',
        'INVALID_RESPONSE',
        'Invalid response from OmniFocus: projects array not found',
        'Script should return { projects: [...] } or { items: [...] }',
        { received: data, expected: 'object with projects/items array' },
        timer.toMetadata(),
      );
    }

    // Parse dates and calculate review status
    const now = new Date();
    const sourceProjects = src as Array<{
      id?: string;
      name?: string;
      nextReviewDate?: string;
      lastReviewDate?: string;
      dueDate?: string;
      deferDate?: string;
      completionDate?: string;
      [key: string]: unknown;
    }>;
    const parsedProjects = sourceProjects.map((project) => {
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
      } as {
        id?: string;
        name?: string;
        reviewStatus: string;
        daysUntilReview: number | null;
        daysSinceLastReview: number | null;
        [key: string]: unknown;
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
          overdue: parsedProjects.filter((p) => (p as { reviewStatus?: string }).reviewStatus === 'overdue').length,
          due_today: parsedProjects.filter((p) => (p as { reviewStatus?: string }).reviewStatus === 'due_today').length,
          due_soon: parsedProjects.filter((p) => (p as { reviewStatus?: string }).reviewStatus === 'due_soon').length,
          no_schedule: parsedProjects.filter((p) => (p as { reviewStatus?: string }).reviewStatus === 'no_schedule').length,
        },
        ...(data && typeof data === 'object' && 'metadata' in data ? (data as { metadata?: Record<string, unknown> }).metadata : {}),
      },
    );

    // Cache results
    this.cache.set('reviews', cacheKey, standardResponse);

    return standardResponse;
  }

  private async markReviewed(
    args: Extract<ManageReviewsInput, { operation: 'mark_reviewed' }>,
    timer: OperationTimerV2,
  ): Promise<StandardResponseV2<unknown>> {
    const { projectId, reviewDate, updateNextReviewDate } = args;

    // Use current date if no review date provided
    const actualReviewDate = reviewDate || new Date().toISOString();

    // Execute mark reviewed script
    const script = this.omniAutomation.buildScript(MARK_PROJECT_REVIEWED_SCRIPT, {
      projectId,
      reviewDate: actualReviewDate,
      updateNextReviewDate,
    });
    const result = await this.execJson(script);

    if (isScriptError(result)) {
      return createErrorResponseV2(
        'manage_reviews',
        'SCRIPT_ERROR',
        result.error || 'Script execution failed',
        'Try again with updateNextReviewDate=false',
        result.details,
        timer.toMetadata(),
      );
    }

    // Invalidate relevant caches after successful review
    this.cache.invalidate('projects');
    this.cache.invalidate('reviews');

    // Parse the result
    const parsedResult = (result as { data?: unknown }).data;

    return createSuccessResponseV2('manage_reviews', { project: parsedResult }, undefined, { ...timer.toMetadata(), operation: 'mark_reviewed', reviewed_id: projectId, review_date: actualReviewDate, next_review_calculated: updateNextReviewDate, input_params: { projectId, reviewDate: actualReviewDate, updateNextReviewDate } });
  }

  private async setSchedule(
    args: Extract<ManageReviewsInput, { operation: 'set_schedule' }>,
    timer: OperationTimerV2,
  ): Promise<StandardResponseV2<unknown>> {
    const { projectIds, reviewInterval, nextReviewDate } = args;

    // Execute batch review schedule script
    const script = this.omniAutomation.buildScript(SET_REVIEW_SCHEDULE_SCRIPT, {
      projectIds,
      reviewInterval,
      nextReviewDate,
    });
    const result = await this.execJson(script);

    if (isScriptError(result)) {
      return createErrorResponseV2(
        'manage_reviews',
        'SCRIPT_ERROR',
        result.error || 'Script execution failed',
        'Verify project IDs and schedule details',
        result.details,
        timer.toMetadata(),
      );
    }

    // Invalidate relevant caches after successful batch update
    this.cache.invalidate('projects');
    this.cache.invalidate('reviews');

    // Parse the result
    const parsedResult = (result as { data?: unknown }).data;

    return createSuccessResponseV2('manage_reviews', { batch: parsedResult }, undefined, { ...timer.toMetadata(), operation: 'set_schedule', projects_updated: projectIds.length, review_interval: reviewInterval, next_review_date: nextReviewDate, input_params: { projectIds, reviewInterval, nextReviewDate } });
  }

  private async clearSchedule(
    args: Extract<ManageReviewsInput, { operation: 'clear_schedule' }>,
    timer: OperationTimerV2,
  ): Promise<StandardResponseV2<unknown>> {
    const { projectIds } = args;

    // Clear schedule by setting no review interval and null next review date
    const script = this.omniAutomation.buildScript(SET_REVIEW_SCHEDULE_SCRIPT, {
      projectIds,
      reviewInterval: null,
      nextReviewDate: null,
    });
    const result = await this.execJson(script);

    if (isScriptError(result)) {
      return createErrorResponseV2(
        'manage_reviews',
        'SCRIPT_ERROR',
        result.error || 'Script execution failed',
        undefined,
        result.details,
        timer.toMetadata(),
      );
    }

    // Invalidate relevant caches after successful batch update
    this.cache.invalidate('projects');
    this.cache.invalidate('reviews');

    // Parse the result
    const parsedResult = (result as { data?: unknown }).data;

    return createSuccessResponseV2('manage_reviews', { batch: parsedResult }, undefined, { ...timer.toMetadata(), operation: 'clear_schedule', projects_updated: projectIds.length, input_params: { projectIds } });
  }

  // Claude Desktop sends parameters as strings, requiring runtime conversion
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private normalizeArgs(args: any): ManageReviewsInput {
    // Handle Claude Desktop sometimes sending stringified parameters
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const normalized = { ...args };

    // Parse projectIds if it's a string
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (typeof normalized.projectIds === 'string') {
      try {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument
        normalized.projectIds = JSON.parse(normalized.projectIds);
      } catch {
        this.logger.warn('Failed to parse projectIds string, keeping as-is');
      }
    }

    // Parse reviewInterval if it's a string
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (typeof normalized.reviewInterval === 'string') {
      try {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument
        normalized.reviewInterval = JSON.parse(normalized.reviewInterval);
      } catch {
        this.logger.warn('Failed to parse reviewInterval string, keeping as-is');
      }
    }

    // Parse other potentially stringified arrays/objects
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (typeof normalized.tags === 'string') {
      try {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument
        normalized.tags = JSON.parse(normalized.tags);
      } catch {
        this.logger.warn('Failed to parse tags string, keeping as-is');
      }
    }

    return normalized as ManageReviewsInput;
  }

}
