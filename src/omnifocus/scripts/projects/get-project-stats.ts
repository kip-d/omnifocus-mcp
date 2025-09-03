import { getAnalyticsHelpers } from '../shared/helpers.js';

/**
 * Script to get accurate project statistics including available rates
 *
 * This script focuses on using OmniFocus's own accurate counts rather than
 * manual task-level analysis, which fixes issues like "Pending Purchase Orders"
 * showing incorrect available rates.
 *
 * Features:
 * - Uses OmniFocus's numberOfAvailableTasks() for accurate available counts
 * - Uses OmniFocus's numberOfTasks() for accurate total counts
 * - Calculates available rates directly from OmniFocus data
 * - Skips complex task-level analysis that can be inaccurate
 * - Focuses on project-level metrics that OmniFocus tracks accurately
 */
export const GET_PROJECT_STATS_SCRIPT = `
  ${getAnalyticsHelpers()}
  
  (() => {
    const options = {{options}};
    const projects = [];
    
    try {
      const app = Application('OmniFocus');
      const doc = app.defaultDocument();
      
      if (!doc) {
        return JSON.stringify({
          error: true,
          message: "OmniFocus document is not available",
          details: "No default document found"
        });
      }
      
      const allProjects = doc.flattenedProjects();
      
      if (!allProjects) {
        return JSON.stringify({
          error: true,
          message: "Failed to retrieve projects from OmniFocus",
          details: "doc.flattenedProjects() returned null or undefined"
        });
      }
      
      const startTime = Date.now();
      let processedCount = 0;
      
      for (let i = 0; i < allProjects.length; i++) {
        const project = allProjects[i];
        processedCount++;
        
        try {
          // Get basic project info
          const projectName = safeGet(() => project.name(), 'Unnamed Project');
          const projectId = safeGet(() => project.id(), 'unknown');
          const projectStatus = safeGetStatus(project);
          const isFlagged = isFlagged(project);
          
          // Get project container info
          const folder = safeGetFolder(project);
          
          // Get dates
          const dueDate = safeGetDate(() => project.dueDate());
          const deferDate = safeGetDate(() => project.deferDate());
          const completionDate = safeGetDate(() => project.completionDate());
          
          // CRITICAL: Use OmniFocus's own accurate task counts
          // This is the key fix for the "Pending Purchase Orders" issue
          const rootTask = safeGet(() => project.rootTask());
          let taskCounts = null;
          let availableRate = null;
          
          if (rootTask) {
            // Get OmniFocus's own accurate counts
            const totalTasks = safeGet(() => rootTask.numberOfTasks(), 0);
            const availableTasks = safeGet(() => rootTask.numberOfAvailableTasks(), 0);
            const completedTasks = safeGet(() => rootTask.numberOfCompletedTasks(), 0);
            
            if (totalTasks > 0) {
              taskCounts = {
                total: totalTasks,
                available: availableTasks,
                completed: completedTasks,
                remaining: totalTasks - completedTasks
              };
              
              // Calculate available rate using OmniFocus's accurate data
              availableRate = (availableTasks / totalTasks * 100).toFixed(1);
            }
          }
          
          // Get project properties
          const isSequential = safeGet(() => project.sequential(), false);
          const completedByChildren = safeGet(() => project.completedByChildren(), false);
          
          // Get review information
          const lastReviewDate = safeGetDate(() => project.lastReviewDate());
          const nextReviewDate = safeGetDate(() => project.nextReviewDate());
          const reviewInterval = safeGet(() => project.reviewInterval());
          
          // Build project object with accurate statistics
          const projectObj = {
            id: projectId,
            name: projectName,
            status: projectStatus,
            flagged: isFlagged,
            folder: folder,
            dueDate: dueDate,
            deferDate: deferDate,
            completionDate: completionDate,
            sequential: isSequential,
            completedByChildren: completedByChildren,
            lastReviewDate: lastReviewDate,
            nextReviewDate: nextReviewDate,
            reviewInterval: reviewInterval
          };
          
          // Add task counts and available rate if we have them
          if (taskCounts) {
            projectObj.taskCounts = taskCounts;
            projectObj.availableRate = parseFloat(availableRate);
            
            // Add insights based on available rate
            if (availableRate >= 80) {
              projectObj.insight = "High availability - ready for action!";
            } else if (availableRate >= 50) {
              projectObj.insight = "Good progress - several tasks available";
            } else if (availableRate >= 20) {
              projectObj.insight = "Limited availability - may need attention";
            } else if (availableRate > 0) {
              projectObj.insight = "Very limited availability - project may be stalled";
            } else {
              projectObj.insight = "No available tasks - project may be complete or blocked";
            }
          }
          
          // Add estimated time if available (from root task)
          if (rootTask) {
            const estimatedMinutes = safeGetEstimatedMinutes(rootTask);
            if (estimatedMinutes) {
              projectObj.estimatedHours = (estimatedMinutes / 60).toFixed(1);
            }
          }
          
          // Add note if present
          const note = safeGet(() => project.note());
          if (note) {
            projectObj.note = note;
          }
          
          projects.push(projectObj);
          
        } catch (projectError) {
          // Skip projects that cause errors, but log for debugging
          console.log('Error processing project: ' + projectError.toString());
          continue;
        }
      }
      
      const endTime = Date.now();
      
      // Calculate summary statistics
      let totalProjects = projects.length;
      let activeProjects = 0;
      let projectsWithAvailableTasks = 0;
      let totalAvailableTasks = 0;
      let totalTasks = 0;
      
      for (const project of projects) {
        if (project.status === 'active') {
          activeProjects++;
        }
        
        if (project.taskCounts) {
          totalTasks += project.taskCounts.total;
          totalAvailableTasks += project.taskCounts.available;
          
          if (project.taskCounts.available > 0) {
            projectsWithAvailableTasks++;
          }
        }
      }
      
      // Generate summary insights
      const summary = {
        totalProjects: totalProjects,
        activeProjects: activeProjects,
        projectsWithAvailableTasks: projectsWithAvailableTasks,
        totalTasks: totalTasks,
        totalAvailableTasks: totalAvailableTasks,
        overallAvailableRate: totalTasks > 0 ? (totalAvailableTasks / totalTasks * 100).toFixed(1) : '0.0',
        processingTime: endTime - startTime,
        projectsProcessed: processedCount
      };
      
      // Add insights based on overall statistics
      const insights = [];
      
      if (totalAvailableTasks === 0) {
        insights.push("All projects are either complete or have no available tasks");
      } else if (totalAvailableTasks <= 5) {
        insights.push("Very few tasks available - consider reviewing project statuses");
      } else if (totalAvailableTasks <= 15) {
        insights.push("Moderate number of available tasks - good workflow balance");
      } else {
        insights.push("Many tasks available - consider focusing on priorities");
      }
      
      if (activeProjects === 0) {
        insights.push("No active projects found - all projects may be complete or on hold");
      } else if (activeProjects <= 3) {
        insights.push("Few active projects - good focus on current priorities");
      } else if (activeProjects > 10) {
        insights.push("Many active projects - consider reviewing for focus");
      }
      
      return JSON.stringify({
        projects: projects,
        summary: summary,
        insights: insights,
        metadata: {
          generated_at: new Date().toISOString(),
          method: 'omniFocus_accurate_counts',
          note: 'Available rates calculated using OmniFocus\'s own task counts for accuracy'
        }
      });
      
    } catch (error) {
      return JSON.stringify({
        error: true,
        message: "Failed to get project statistics: " + error.toString(),
        details: error.message
      });
    }
  })();
`;
