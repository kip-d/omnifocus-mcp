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
export const SET_REVIEW_SCHEDULE_SCRIPT = `
  // SET_REVIEW_SCHEDULE - OmniJS-first pattern
  (() => {
    const app = Application('OmniFocus');

    try {
      const omniJsScript = \`
        (() => {
          const projectIds = {{projectIds}};
          const reviewInterval = {{reviewInterval}};
          const nextReviewDateParam = {{nextReviewDate}};

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

              // Set review interval as plain object
              // Note: OmniJS accepts { unit: "weeks", steps: N } format
              if (reviewInterval) {
                const unit = normalizeUnit(reviewInterval.unit);
                const steps = reviewInterval.steps || 1;
                // Set as plain object - OmniJS handles the conversion
                targetProject.reviewInterval = { unit: unit, steps: steps };
                changes.push("Review interval set to every " + steps + " " + reviewInterval.unit + "(s)");
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
                reviewInterval: reviewInterval ? {
                  unit: reviewInterval.unit,
                  steps: reviewInterval.steps
                } : null,
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
