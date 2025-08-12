import { getAllHelpers } from '../shared/helpers.js';

/**
 * Script to mark a project as reviewed
 *
 * Features:
 * - Set lastReviewDate to specified date (or now)
 * - Optionally calculate nextReviewDate based on review interval
 * - Handle projects with and without review intervals
 * - Proper error handling for missing projects
 */
export const MARK_PROJECT_REVIEWED_SCRIPT = `
  ${getAllHelpers()}
  
  (() => {
    const projectId = {{projectId}};
    const reviewDate = {{reviewDate}};
    const updateNextReviewDate = {{updateNextReviewDate}};
    
    // Helper function to calculate next review date
    function calculateNextReviewDate(reviewInterval, fromDate) {
      if (!reviewInterval || typeof reviewInterval !== 'object') {
        return null;
      }
      
      const date = new Date(fromDate);
      const unit = reviewInterval.unit || 'week';
      const steps = reviewInterval.steps || 1;
      
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
      const app = Application('OmniFocus');
      const doc = app.defaultDocument();
      
      // Find the project by ID
      const projects = doc.flattenedProjects();
      
      if (!projects) {
        return JSON.stringify({
          error: true,
          message: "Failed to retrieve projects from OmniFocus. The document may not be available or OmniFocus may not be running properly.",
          details: "doc.flattenedProjects() returned null or undefined"
        });
      }
      
      let targetProject = null;
      
      for (let i = 0; i < projects.length; i++) {
        if (projects[i].id() === projectId) {
          targetProject = projects[i];
          break;
        }
      }
      
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
      let nextReviewDate = null;
      if (updateNextReviewDate) {
        const reviewInterval = safeGet(() => targetProject.reviewInterval());
        if (reviewInterval && typeof reviewInterval === 'object') {
          try {
            nextReviewDate = calculateNextReviewDate(reviewInterval, reviewDateTime);
            if (nextReviewDate) {
              targetProject.nextReviewDate = nextReviewDate;
              changes.push("Next review date calculated and set to " + nextReviewDate.toISOString());
            }
          } catch (calcError) {
            changes.push("Warning: Could not calculate next review date: " + calcError.message);
          }
        } else {
          changes.push("Note: No review interval set, next review date not calculated");
        }
      }
      
      return JSON.stringify({
        success: true,
        project: {
          id: targetProject.id(),
          name: targetProject.name(),
          lastReviewDate: targetProject.lastReviewDate() ? targetProject.lastReviewDate().toISOString() : null,
          nextReviewDate: targetProject.nextReviewDate() ? targetProject.nextReviewDate().toISOString() : null,
          reviewInterval: (() => {
            const interval = safeGet(() => targetProject.reviewInterval());
            if (interval && typeof interval === 'object') {
              return {
                unit: safeGet(() => interval.unit, 'week'),
                steps: safeGet(() => interval.steps, 1)
              };
            }
            return null;
          })()
        },
        changes: changes,
        message: "Project '" + targetProject.name() + "' marked as reviewed"
      });
    } catch (error) {
      return formatError(error, 'mark_project_reviewed');
    }
  })();
`;
