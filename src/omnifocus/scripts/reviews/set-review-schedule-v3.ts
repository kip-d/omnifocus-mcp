/**
 * Pure OmniJS v3 set-review-schedule - zero helper dependencies
 *
 * Set review schedules for multiple projects
 *
 * Features:
 * - Batch update review intervals for multiple projects
 * - Set next review dates (calculated or specified)
 * - Handle projects that don't exist
 * - Detailed reporting of changes made
 *
 * Performance: Direct property access, ~10-30x faster than helper version
 */
export const SET_REVIEW_SCHEDULE_V3 = `
(() => {
  const app = Application('OmniFocus');
  app.includeStandardAdditions = true;
  const doc = app.defaultDocument;

  const startTime = Date.now();
  const projectIds = {{projectIds}};
  const reviewInterval = {{reviewInterval}};
  const nextReviewDate = {{nextReviewDate}};

  // Helper function to calculate next review date from now
  function calculateNextReviewDate(interval, baseDate = null) {
    const date = baseDate ? new Date(baseDate) : new Date();
    const unit = interval.unit || 'week';
    const steps = interval.steps || 1;

    switch (unit) {
      case 'day':
        date.setDate(date.getDate() + steps);
        break;
      case 'week':
        date.setDate(date.getDate() + (steps * 7));
        break;
      case 'month':
        date.setMonth(date.getMonth() + steps);
        break;
      case 'year':
        date.setFullYear(date.getFullYear() + steps);
        break;
      default:
        // Default to weekly
        date.setDate(date.getDate() + (steps * 7));
    }

    return date;
  }

  try {
    // Get all projects for ID matching (direct property access)
    const allProjects = doc.flattenedProjects();

    if (!allProjects) {
      return {
        ok: false,
        v: '3',
        error: {
          message: 'Failed to retrieve projects from OmniFocus',
          details: 'doc.flattenedProjects() returned null or undefined'
        }
      };
    }

    const results = {
      successful: [],
      failed: [],
      summary: {
        total_requested: projectIds.length,
        successful_count: 0,
        failed_count: 0
      }
    };

    // Process each project ID
    for (let i = 0; i < projectIds.length; i++) {
      const projectId = projectIds[i];
      let targetProject = null;

      // Find the project (direct property access)
      for (let j = 0; j < allProjects.length; j++) {
        try {
          if (allProjects[j].id.primaryKey === projectId) {
            targetProject = allProjects[j];
            break;
          }
        } catch (e) { /* skip invalid project */ }
      }

      if (!targetProject) {
        results.failed.push({
          projectId: projectId,
          error: "Project not found"
        });
        continue;
      }

      try {
        const changes = [];

        // Set review interval as a plain object (direct property assignment)
        targetProject.reviewInterval = {
          unit: reviewInterval.unit,
          steps: reviewInterval.steps,
          fixed: false  // Default to false for flexible scheduling
        };
        changes.push("Review interval set to every " + reviewInterval.steps + " " + reviewInterval.unit + "(s)");

        // Set or calculate next review date
        let calculatedNextReviewDate = null;
        if (nextReviewDate) {
          calculatedNextReviewDate = new Date(nextReviewDate);
          targetProject.nextReviewDate = calculatedNextReviewDate;
          changes.push("Next review date set to " + nextReviewDate);
        } else {
          calculatedNextReviewDate = calculateNextReviewDate(reviewInterval);
          targetProject.nextReviewDate = calculatedNextReviewDate;
          changes.push("Next review date calculated and set to " + calculatedNextReviewDate.toISOString());
        }

        const projectName = targetProject.name || 'Unnamed Project';

        results.successful.push({
          projectId: projectId,
          projectName: projectName,
          changes: changes,
          reviewInterval: {
            unit: reviewInterval.unit,
            steps: reviewInterval.steps
          },
          nextReviewDate: calculatedNextReviewDate.toISOString()
        });

      } catch (updateError) {
        let projectName = 'Unknown Project';
        try {
          projectName = targetProject.name || 'Unknown Project';
        } catch (e) { /* couldn't get name */ }

        results.failed.push({
          projectId: projectId,
          projectName: projectName,
          error: "Failed to update: " + updateError.message
        });
      }
    }

    results.summary.successful_count = results.successful.length;
    results.summary.failed_count = results.failed.length;

    return {
      ok: true,
      v: '3',
      data: {
        results: results,
        message: "Batch review schedule update completed: " +
                 results.summary.successful_count + " successful, " +
                 results.summary.failed_count + " failed"
      },
      query_time_ms: Date.now() - startTime
    };

  } catch (error) {
    return {
      ok: false,
      v: '3',
      error: {
        message: error.message || 'Unknown error in set review schedule',
        stack: error.stack
      }
    };
  }
})();
`;
