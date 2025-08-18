import { z } from 'zod';
import { BaseTool } from '../../base.js';
import { SET_REVIEW_SCHEDULE_SCRIPT } from '../../../omnifocus/scripts/reviews.js';
import { createEntityResponse, createErrorResponse, OperationTimer } from '../../../utils/response-format.js';
import { SetReviewScheduleSchema } from '../../schemas/project-schemas.js';

export class SetReviewScheduleTool extends BaseTool<typeof SetReviewScheduleSchema> {
  name = 'set_review_schedule';
  description = '**DEPRECATED**: Use manage_reviews with operation: "set_schedule" or "clear_schedule" instead. Set review schedule for multiple projects at once. Useful for batch configuring review intervals (daily, weekly, monthly, yearly) and next review dates for GTD workflows.';
  schema = SetReviewScheduleSchema;

  async executeValidated(args: z.infer<typeof SetReviewScheduleSchema>): Promise<any> {
    const timer = new OperationTimer();

    try {
      const { projectIds, reviewInterval, nextReviewDate } = args;

      // Execute batch review schedule script
      const script = this.omniAutomation.buildScript(SET_REVIEW_SCHEDULE_SCRIPT, {
        projectIds,
        reviewInterval,
        nextReviewDate,
      });
      const result = await this.omniAutomation.execute<any>(script);

      if (result.error) {
        return createErrorResponse(
          'set_review_schedule',
          'SCRIPT_ERROR',
          result.message || 'Failed to set review schedule',
          { details: result.details },
          timer.toMetadata(),
        );
      }

      // Invalidate relevant caches after successful batch update
      this.cache.invalidate('projects');
      this.cache.invalidate('reviews');

      // Parse the result if it's a string
      let parsedResult;
      try {
        parsedResult = typeof result === 'string' ? JSON.parse(result) : result;
      } catch (parseError) {
        this.logger.error(`Failed to parse set review schedule result: ${result}`);
        parsedResult = result;
      }

      return createEntityResponse(
        'set_review_schedule',
        'batch_operation',
        parsedResult,
        {
          ...timer.toMetadata(),
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
    } catch (error) {
      return this.handleError(error);
    }
  }
}
