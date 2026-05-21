/**
 * Script to set review schedules for multiple projects
 *
 * OmniJS-first pattern: All logic runs inside evaluateJavascript()
 *
 * Features:
 * - Batch update review intervals for multiple projects
 * - Set next review dates (calculated or specified)
 * - Handle projects that don't exist
 * - Detailed reporting of changes made
 */

export interface ReviewIntervalSpec {
  unit: string;
  steps: number;
}

export interface SetReviewScheduleParams {
  projectIds: string[];
  reviewInterval: ReviewIntervalSpec | null;
  nextReviewDate: string | null;
}

export function buildSetReviewScheduleScript(params: SetReviewScheduleParams): string {
  const serialized = JSON.stringify({
    projectIds: params.projectIds,
    reviewInterval: params.reviewInterval ?? null,
    nextReviewDate: params.nextReviewDate ?? null,
  });

  return `
  // SET_REVIEW_SCHEDULE - OmniJS-first pattern
  (() => {
    const app = Application('OmniFocus');

    try {
      const omniJsScript = \`
        (() => {
          const __params = ${serialized};
          const projectIds = __params.projectIds;
          const reviewInterval = __params.reviewInterval;
          const nextReviewDateParam = __params.nextReviewDate;

          // Helper function to calculate next review date from now
          function calculateNextReviewDate(interval, baseDate = null) {
            const date = baseDate ? new Date(baseDate) : new Date();
            const unit = interval.unit || 'week';
            const steps = interval.steps || 1;

            switch (unit) {
              case 'day':
              case 'days':
                date.setDate(date.getDate() + steps);
                break;
              case 'week':
              case 'weeks':
                date.setDate(date.getDate() + (steps * 7));
                break;
              case 'month':
              case 'months':
                date.setMonth(date.getMonth() + steps);
                break;
              case 'year':
              case 'years':
                date.setFullYear(date.getFullYear() + steps);
                break;
              default:
                // Default to weekly
                date.setDate(date.getDate() + (steps * 7));
            }

            return date;
          }

          // Normalize unit string to OmniJS format
          function normalizeUnit(unitString) {
            const unitMap = {
              'day': 'days',
              'days': 'days',
              'week': 'weeks',
              'weeks': 'weeks',
              'month': 'months',
              'months': 'months',
              'year': 'years',
              'years': 'years'
            };
            return unitMap[unitString.toLowerCase()] || 'weeks';
          }

          const results = {
            successful: [],
            failed: [],
            summary: {
              total_requested: projectIds ? projectIds.length : 0,
              successful_count: 0,
              failed_count: 0
            }
          };

          if (!projectIds || projectIds.length === 0) {
            return JSON.stringify({
              success: false,
              error: true,
              message: "No project IDs provided",
              results: results
            });
          }

          // Process each project ID
          for (const projectId of projectIds) {
            // Find the project using OmniJS
            const targetProject = Project.byIdentifier(projectId);

            if (!targetProject) {
              results.failed.push({
                projectId: projectId,
                error: "Project not found"
              });
              continue;
            }

            try {
              const changes = [];

              // SETTER-PATTERNS row 1 (Project.reviewInterval — OmniJS read-modify-reassign).
              // Set review interval. Project.reviewInterval is a strictly-typed
              // Project.ReviewInterval — assigning a plain object, Number, or
              // freshly-constructed instance is rejected by OmniJS (OMN-58).
              // Working pattern: read the existing typed instance, mutate the
              // local reference, reassign it (OMN-41 / OMN-60).
              if (reviewInterval) {
                const unit = normalizeUnit(reviewInterval.unit);
                const steps = reviewInterval.steps || 1;
                const ri = targetProject.reviewInterval;
                if (ri) {
                  ri.steps = steps;
                  ri.unit = unit;
                  targetProject.reviewInterval = ri;
                  changes.push("Review interval set to every " + steps + " " + unit);
                } else {
                  // No existing ReviewInterval instance to mutate, and OmniJS
                  // cannot construct one from scratch (OMN-58). Fail loudly
                  // rather than silently no-op.
                  results.failed.push({
                    projectId: projectId,
                    projectName: targetProject.name,
                    error: "Project has no existing reviewInterval instance to modify; OmniJS cannot construct one (OMN-41/OMN-58)"
                  });
                  continue;
                }
              }

              // Set or calculate next review date
              let calculatedNextReviewDate = null;
              if (nextReviewDateParam) {
                calculatedNextReviewDate = new Date(nextReviewDateParam);
                targetProject.nextReviewDate = calculatedNextReviewDate;
                changes.push("Next review date set to " + nextReviewDateParam);
              } else if (reviewInterval) {
                calculatedNextReviewDate = calculateNextReviewDate(reviewInterval);
                targetProject.nextReviewDate = calculatedNextReviewDate;
                changes.push("Next review date calculated and set to " + calculatedNextReviewDate.toISOString());
              }

              results.successful.push({
                projectId: projectId,
                projectName: targetProject.name,
                changes: changes,
                // Echo the value actually persisted (read back), not the
                // value requested — a setter that silently no-ops must not
                // report success with the requested value (OMN-60).
                reviewInterval: (function() {
                  const ri = targetProject.reviewInterval;
                  return ri ? { unit: ri.unit, steps: ri.steps } : null;
                })(),
                nextReviewDate: calculatedNextReviewDate ? calculatedNextReviewDate.toISOString() : null
              });

            } catch (updateError) {
              results.failed.push({
                projectId: projectId,
                projectName: targetProject.name,
                error: "Failed to update: " + updateError.message
              });
            }
          }

          results.summary.successful_count = results.successful.length;
          results.summary.failed_count = results.failed.length;

          return JSON.stringify({
            success: true,
            results: results,
            message: "Batch review schedule update completed: " +
                     results.summary.successful_count + " successful, " +
                     results.summary.failed_count + " failed"
          });
        })()
      \`;

      return app.evaluateJavascript(omniJsScript);
    } catch (error) {
      return JSON.stringify({
        error: true,
        message: error.message || String(error),
        operation: 'set_review_schedule'
      });
    }
  })();
`;
}
