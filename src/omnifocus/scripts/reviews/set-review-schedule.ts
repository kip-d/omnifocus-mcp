import { getBasicHelpers } from '../shared/helpers.js';

/**
 * Script to set review schedules for multiple projects
 *
 * Features:
 * - Batch update review intervals for multiple projects
 * - Set next review dates (calculated or specified)
 * - Handle projects that don't exist
 * - Detailed reporting of changes made
 */
export const SET_REVIEW_SCHEDULE_SCRIPT = `
  ${getBasicHelpers()}
  
  (() => {
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
      const app = Application('OmniFocus');
      const doc = app.defaultDocument();
      
      // Get all projects for ID matching
      const allProjects = doc.flattenedProjects();
      
      if (!allProjects) {
        return JSON.stringify({
          error: true,
          message: "Failed to retrieve projects from OmniFocus. The document may not be available or OmniFocus may not be running properly.",
          details: "doc.flattenedProjects() returned null or undefined"
        });
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
        
        // Find the project
        for (let j = 0; j < allProjects.length; j++) {
          if (allProjects[j].id() === projectId) {
            targetProject = allProjects[j];
            break;
          }
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
          
          // Set review interval as a plain object (JXA doesn't have ReviewInterval constructor)
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
          
          results.successful.push({
            projectId: projectId,
            projectName: targetProject.name(),
            changes: changes,
            reviewInterval: {
              unit: reviewInterval.unit,
              steps: reviewInterval.steps
            },
            nextReviewDate: calculatedNextReviewDate.toISOString()
          });
          
        } catch (updateError) {
          results.failed.push({
            projectId: projectId,
            projectName: targetProject.name(),
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
      
    } catch (error) {
      return formatError(error, 'set_review_schedule');
    }
  })();
`;
