import { z } from 'zod';
import { BaseTool } from '../../base.js';
import { MARK_PROJECT_REVIEWED_SCRIPT } from '../../../omnifocus/scripts/reviews.js';
import { createEntityResponse, createErrorResponse, OperationTimer } from '../../../utils/response-format.js';
import { MarkProjectReviewedSchema } from '../../schemas/project-schemas.js';

export class MarkProjectReviewedTool extends BaseTool<typeof MarkProjectReviewedSchema> {
  name = 'mark_project_reviewed';
  description = '**DEPRECATED**: Use manage_reviews with operation: "mark_reviewed" instead. Mark a project as reviewed, updating the lastReviewDate and optionally calculating the next review date based on the review interval. Essential for GTD project reviews.';
  schema = MarkProjectReviewedSchema;

  async executeValidated(args: z.infer<typeof MarkProjectReviewedSchema>): Promise<any> {
    const timer = new OperationTimer();

    try {
      const { projectId, reviewDate, updateNextReviewDate } = args;

      // Use current date if no review date provided
      const actualReviewDate = reviewDate || new Date().toISOString();

      // Execute mark reviewed script
      const script = this.omniAutomation.buildScript(MARK_PROJECT_REVIEWED_SCRIPT, {
        projectId,
        reviewDate: actualReviewDate,
        updateNextReviewDate,
      });
      const result = await this.omniAutomation.execute<any>(script);

      if (result.error) {
        return createErrorResponse(
          'mark_project_reviewed',
          'SCRIPT_ERROR',
          result.message || 'Failed to mark project as reviewed',
          { details: result.details },
          timer.toMetadata(),
        );
      }

      // Invalidate relevant caches after successful review
      this.cache.invalidate('projects');
      this.cache.invalidate('reviews');

      // Parse the result if it's a string
      let parsedResult;
      try {
        parsedResult = typeof result === 'string' ? JSON.parse(result) : result;
      } catch (parseError) {
        this.logger.error(`Failed to parse mark project reviewed result: ${result}`);
        parsedResult = result;
      }

      return createEntityResponse(
        'mark_project_reviewed',
        'project',
        parsedResult,
        {
          ...timer.toMetadata(),
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
    } catch (error) {
      return this.handleError(error);
    }
  }
}
