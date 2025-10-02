import { getUnifiedHelpers } from '../shared/helpers.js';

/**
 * Script to find projects that are due for review
 *
 * Features:
 * - Find projects overdue for review
 * - Find projects due for review within specified days
 * - Filter by project status and folder
 * - Include review status and time calculations
 * - Essential for GTD weekly reviews
 */
export const PROJECTS_FOR_REVIEW_SCRIPT = `
  ${getUnifiedHelpers()}
  
  (() => {
    const filter = {{filter}};
    const projects = [];
    const now = new Date();
    
    // Helper function to calculate days between dates
    function daysBetweenDates(date1, date2) {
      const msPerDay = 24 * 60 * 60 * 1000;
      return Math.ceil((date2.getTime() - date1.getTime()) / msPerDay);
    }
    
    // Helper function to determine if project matches review criteria
    function shouldIncludeProject(project) {
      const nextReviewDate = safeGetDate(() => project.nextReviewDate());
      
      // If no review date set, only include if we're looking for projects without schedules
      if (!nextReviewDate) {
        return !filter.overdue; // Include unscheduled projects unless we only want overdue
      }
      
      const daysUntilReview = daysBetweenDates(now, new Date(nextReviewDate));
      
      if (filter.overdue) {
        // Only include overdue projects (negative days until review)
        return daysUntilReview < 0;
      } else {
        // Include projects due within daysAhead (including overdue)
        return daysUntilReview <= filter.daysAhead;
      }
    }
  
    try {
      const app = Application('OmniFocus');
      const doc = app.defaultDocument();
      
      const allProjects = doc.flattenedProjects();
      
      if (!allProjects) {
        return JSON.stringify({
          error: true,
          message: "Failed to retrieve projects from OmniFocus. The document may not be available or OmniFocus may not be running properly.",
          details: "doc.flattenedProjects() returned null or undefined"
        });
      }
      
      for (let i = 0; i < allProjects.length; i++) {
        const project = allProjects[i];
        
        // Apply status filter (default to Active only if not specified)
        const statusFilter = filter.status || ['active'];
        const projectStatus = safeGetStatus(project);
        if (!statusFilter.includes(projectStatus)) continue;
        
        // Apply folder filter
        if (filter.folder) {
          const projectFolder = safeGetFolder(project);
          if (projectFolder !== filter.folder) continue;
        }
        
        // Check if project meets review criteria
        if (!shouldIncludeProject(project)) continue;
        
        // Build project object with review information
        const projectObj = {
          id: safeGet(() => project.id(), 'unknown'),
          name: safeGet(() => project.name(), 'Unnamed Project'),
          status: projectStatus,
          flagged: isFlagged(project)
        };
        
        // Add optional properties
        const note = safeGet(() => project.note());
        if (note) projectObj.note = note;
        
        const folder = safeGetFolder(project);
        if (folder) projectObj.folder = folder;
        
        const dueDate = safeGetDate(() => project.dueDate());
        if (dueDate) projectObj.dueDate = dueDate;
        
        const deferDate = safeGetDate(() => project.deferDate());
        if (deferDate) projectObj.deferDate = deferDate;
        
        // Review-specific information
        const lastReviewDate = safeGetDate(() => project.lastReviewDate());
        if (lastReviewDate) projectObj.lastReviewDate = lastReviewDate;
        
        const nextReviewDate = safeGetDate(() => project.nextReviewDate());
        if (nextReviewDate) projectObj.nextReviewDate = nextReviewDate;
        
        // Review interval information
        const reviewInterval = safeGet(() => project.reviewInterval());
        if (reviewInterval !== null && reviewInterval !== undefined) {
          if (typeof reviewInterval === 'object' && reviewInterval !== null) {
            projectObj.reviewInterval = {
              unit: safeGet(() => reviewInterval.unit, 'week'),
              steps: safeGet(() => reviewInterval.steps, 1)
            };
          } else {
            // Legacy numeric format (days)
            projectObj.reviewIntervalDays = reviewInterval;
          }
        }
        
        // Task counts for review context
        const rootTask = safeGet(() => project.rootTask());
        if (rootTask) {
          projectObj.taskCounts = {
            total: safeGet(() => rootTask.numberOfTasks(), 0),
            available: safeGet(() => rootTask.numberOfAvailableTasks(), 0),
            completed: safeGet(() => rootTask.numberOfCompletedTasks(), 0)
          };
        }
        
        // Sequential vs parallel for review
        projectObj.sequential = safeGet(() => project.sequential(), false);
        projectObj.completedByChildren = safeGet(() => project.completedByChildren(), false);
        
        projects.push(projectObj);
        
        // Apply limit
        if (projects.length >= filter.limit) {
          break;
        }
      }
      
      // Sort by next review date (overdue first, then by date)
      projects.sort((a, b) => {
        const aDate = a.nextReviewDate ? new Date(a.nextReviewDate) : new Date('2099-12-31');
        const bDate = b.nextReviewDate ? new Date(b.nextReviewDate) : new Date('2099-12-31');
        return aDate.getTime() - bDate.getTime();
      });
      
      return JSON.stringify({ 
        projects: projects,
        metadata: {
          total_found: projects.length,
          filter_applied: filter,
          generated_at: now.toISOString(),
          search_criteria: {
            overdue_only: filter.overdue || false,
            days_ahead: filter.daysAhead || 7,
            status_filter: filter.status || ['active'],
            folder_filter: filter.folder || null
          }
        }
      });
    } catch (error) {
      return formatError(error, 'projects_for_review');
    }
  })();
`;
