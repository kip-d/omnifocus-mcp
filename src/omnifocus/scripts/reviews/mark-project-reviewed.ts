/**
 * Script to mark a project as reviewed
 *
 * OmniJS-first pattern: All logic runs inside evaluateJavascript()
 *
 * Features:
 * - Set lastReviewDate to specified date (or now)
 * - Optionally calculate nextReviewDate based on review interval
 * - Handle projects with and without review intervals
 * - Proper error handling for missing projects
 */
export const MARK_PROJECT_REVIEWED_SCRIPT = `
  // MARK_PROJECT_REVIEWED - OmniJS-first pattern
  (() => {
    const app = Application('OmniFocus');

    try {
      const omniJsScript = \`
        (() => {
          const projectId = "{{projectId}}";
          const reviewDate = "{{reviewDate}}";
          const updateNextReviewDate = {{updateNextReviewDate}};

          // Helper function to calculate next review date
          function calculateNextReviewDate(reviewInterval, fromDate) {
            if (!reviewInterval) {
              return null;
            }

            const date = new Date(fromDate);
            // OmniJS reviewInterval has .unit (enum) and .steps
            const unitName = reviewInterval.unit ? reviewInterval.unit.name : 'weeks';
            const steps = reviewInterval.steps || 1;

            switch (unitName) {
              case 'days':
                date.setDate(date.getDate() + steps);
                break;
              case 'weeks':
                date.setDate(date.getDate() + (steps * 7));
                break;
              case 'months':
                date.setMonth(date.getMonth() + steps);
                break;
              case 'years':
                date.setFullYear(date.getFullYear() + steps);
                break;
              default:
                // Default to weekly
                date.setDate(date.getDate() + (steps * 7));
            }

            return date;
          }

          // Find the project by ID using OmniJS
          const targetProject = Project.byIdentifier(projectId);

          if (!targetProject) {
            return JSON.stringify({
              error: true,
              message: "Project with ID '" + projectId + "' not found. Use 'list_projects' or 'projects_for_review' tools to see available projects."
            });
          }

          // Set the review date
          const reviewDateTime = new Date(reviewDate);
          targetProject.lastReviewDate = reviewDateTime;

          const changes = ["Last review date set to " + reviewDate];

          // Calculate and set next review date if requested and interval exists
          let nextReviewDateValue = null;
          if (updateNextReviewDate) {
            const reviewInterval = targetProject.reviewInterval;
            if (reviewInterval) {
              try {
                nextReviewDateValue = calculateNextReviewDate(reviewInterval, reviewDateTime);
                if (nextReviewDateValue) {
                  targetProject.nextReviewDate = nextReviewDateValue;
                  changes.push("Next review date calculated and set to " + nextReviewDateValue.toISOString());
                }
              } catch (calcError) {
                changes.push("Warning: Could not calculate next review date: " + calcError.message);
              }
            } else {
              changes.push("Note: No review interval set, next review date not calculated");
            }
          }

          // Build response with project info
          const interval = targetProject.reviewInterval;
          const intervalInfo = interval ? {
            unit: interval.unit ? interval.unit.name : 'weeks',
            steps: interval.steps || 1
          } : null;

          return JSON.stringify({
            success: true,
            project: {
              id: targetProject.id.primaryKey,
              name: targetProject.name,
              lastReviewDate: targetProject.lastReviewDate ? targetProject.lastReviewDate.toISOString() : null,
              nextReviewDate: targetProject.nextReviewDate ? targetProject.nextReviewDate.toISOString() : null,
              reviewInterval: intervalInfo
            },
            changes: changes,
            message: "Project '" + targetProject.name + "' marked as reviewed"
          });
        })()
      \`;

      return app.evaluateJavascript(omniJsScript);
    } catch (error) {
      return JSON.stringify({
        error: true,
        message: error.message || String(error),
        operation: 'mark_project_reviewed'
      });
    }
  })();
`;
