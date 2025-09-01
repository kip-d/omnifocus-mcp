import { getListHelpers } from '../shared/helpers.js';

/**
 * Script to list all projects in OmniFocus with filtering and statistics
 *
 * Features:
 * - Filter by status (active, onHold, dropped, done)
 * - Filter by flagged state
 * - Search in project names and notes
 * - Include detailed statistics (task counts, completion rates, etc.)
 * - Enhanced properties like next task, review dates, and sequential settings
 * - OPTIMIZED: Uses list helpers (~310 lines vs 551 lines - 44% reduction)
 */
export const LIST_PROJECTS_SCRIPT = `
  ${getListHelpers()}
  
  (() => {
    const filter = {{filter}};
    const limit = {{limit}};
    const includeStats = {{includeStats}};
    
    // Performance mode: 'lite' skips expensive operations like task counts
    const performanceMode = filter.performanceMode || 'normal';
    const projects = [];
  
  // safeGetStatus is now provided by the shared helpers
  
  try {
    const app = Application('OmniFocus');
    
    // Quick check if OmniFocus is running
    try {
      app.name();
    } catch (e) {
      return JSON.stringify({
        error: true,
        message: "OmniFocus is not running or not accessible",
        details: "Failed to access OmniFocus application"
      });
    }
    
    const doc = app.defaultDocument();
    
    // Check if document is available
    if (!doc) {
      return JSON.stringify({
        error: true,
        message: "OmniFocus document is not available",
        details: "No default document found - OmniFocus may be starting up"
      });
    }
    
    const allProjects = doc.flattenedProjects();
    
    // Check if allProjects is null or undefined
    if (!allProjects) {
      return JSON.stringify({
        error: true,
        message: "Failed to retrieve projects from OmniFocus. The document may not be available or OmniFocus may not be running properly.",
        details: "doc.flattenedProjects() returned null or undefined"
      });
    }
    
    // Track how many projects we've added (for early exit with limit)
    let addedCount = 0;
    
    for (let i = 0; i < allProjects.length; i++) {
      // Early exit if we've reached the limit
      if (limit && addedCount >= limit) break;
      
      const project = allProjects[i];
      
      // Apply filters
      if (filter.status && filter.status.length > 0) {
        const projectStatus = safeGetStatus(project);
        if (!filter.status.includes(projectStatus)) continue;
      }
      
      if (filter.flagged !== undefined && isFlagged(project) !== filter.flagged) continue;
      
      // Apply search filter
      if (filter.search) {
        const searchTerm = filter.search.toLowerCase();
        const projectName = safeGet(() => project.name(), '').toLowerCase();
        const projectNote = safeGet(() => project.note(), '').toLowerCase();
        
        if (!projectName.includes(searchTerm) && !projectNote.includes(searchTerm)) {
          continue;
        }
      }
      
      // Build project object
      const projectObj = {
        id: safeGet(() => project.id(), 'unknown'),
        name: safeGet(() => project.name(), 'Unnamed Project'),
        status: safeGetStatus(project),
        flagged: isFlagged(project)
      };
      
      // Add optional properties safely
      const note = safeGet(() => project.note());
      if (note) projectObj.note = note;
      
      const folder = safeGetFolder(project);
      if (folder) projectObj.folder = folder;
      
      const dueDate = safeGetDate(() => project.dueDate());
      if (dueDate) projectObj.dueDate = dueDate;
      
      const deferDate = safeGetDate(() => project.deferDate());
      if (deferDate) projectObj.deferDate = deferDate;
      
      // Enhanced properties - skip in lite mode for performance
      if (performanceMode !== 'lite') {
        // Next actionable task
        const nextTask = safeGet(() => project.nextTask());
        if (nextTask) {
          projectObj.nextTask = {
            id: safeGet(() => nextTask.id(), 'unknown'),
            name: safeGet(() => nextTask.name(), 'Unnamed Task'),
            flagged: safeGet(() => nextTask.flagged(), false),
            dueDate: safeGetDate(() => nextTask.dueDate())
          };
        }
        
        // Root task provides access to project hierarchy
        const rootTask = safeGet(() => project.rootTask());
        if (rootTask) {
          // Sequential vs parallel
          projectObj.sequential = safeGet(() => project.sequential(), false);
          
          // Completion behavior
          projectObj.completedByChildren = safeGet(() => project.completedByChildren(), false);
          
          // Task counts from root task (more accurate)
          projectObj.taskCounts = {
            total: safeGet(() => rootTask.numberOfTasks(), 0),
            available: safeGet(() => rootTask.numberOfAvailableTasks(), 0),
            completed: safeGet(() => rootTask.numberOfCompletedTasks(), 0)
          };
        }
      } else {
        // In lite mode, just get basic sequential property without task counts
        projectObj.sequential = safeGet(() => project.sequential(), false);
      }
      
      // Review dates
      const lastReviewDate = safeGetDate(() => project.lastReviewDate());
      if (lastReviewDate) projectObj.lastReviewDate = lastReviewDate;
      
      const nextReviewDate = safeGetDate(() => project.nextReviewDate());
      if (nextReviewDate) projectObj.nextReviewDate = nextReviewDate;
      
      // Review interval (raw number from API)
      const reviewInterval = safeGet(() => project.reviewInterval());
      if (reviewInterval !== null && reviewInterval !== undefined) {
        projectObj.reviewInterval = reviewInterval; // Days as number
        
        // Try to extract detailed interval if it's an object
        if (typeof reviewInterval === 'object' && reviewInterval !== null) {
          projectObj.reviewIntervalDetails = {
            unit: safeGet(() => reviewInterval.unit, 'days'),
            steps: safeGet(() => reviewInterval.steps, reviewInterval)
          };
        }
      }
      
      // Basic task count - skip in lite mode for performance
      if (performanceMode !== 'lite') {
        projectObj.numberOfTasks = safeGetTaskCount(project);
      }
      
      // Collect detailed statistics only if requested
      if (includeStats === true) {
        try {
          const tasks = project.flattenedTasks();
          if (tasks && tasks.length > 0) {
            let active = 0;
            let completed = 0;
            let overdue = 0;
            let flagged = 0;
            let totalEstimatedMinutes = 0;
            let lastActivityDate = null;
            const now = new Date();
            
            // Analyze tasks
            for (let j = 0; j < tasks.length; j++) {
              const task = tasks[j];
              
              if (safeIsCompleted(task)) {
                completed++;
                // Track last completion date
                const completionDate = safeGetDate(() => task.completionDate());
                if (completionDate && (!lastActivityDate || new Date(completionDate) > new Date(lastActivityDate))) {
                  lastActivityDate = completionDate;
                }
              } else {
                active++;
                
                // Check if overdue
                const dueDate = safeGetDate(() => task.dueDate());
                if (dueDate && new Date(dueDate) < now) {
                  overdue++;
                }
                
                // Track last modification for active tasks
                const modDate = safeGetDate(() => task.modificationDate());
                if (modDate && (!lastActivityDate || new Date(modDate) > new Date(lastActivityDate))) {
                  lastActivityDate = modDate;
                }
              }
              
              if (isFlagged(task)) {
                flagged++;
              }
              
              // Sum estimated time
              const estimatedMinutes = safeGetEstimatedMinutes(task);
              if (estimatedMinutes) {
                totalEstimatedMinutes += estimatedMinutes;
              }
            }
            
            // Add statistics to project object
            projectObj.stats = {
              active: active,
              completed: completed,
              total: tasks.length,
              completionRate: tasks.length > 0 ? Math.round((completed / tasks.length) * 100) : 0,
              overdue: overdue,
              flagged: flagged,
              estimatedHours: totalEstimatedMinutes > 0 ? (totalEstimatedMinutes / 60).toFixed(1) : null,
              lastActivityDate: lastActivityDate
            };
          } else {
            // Empty project stats
            projectObj.stats = {
              active: 0,
              completed: 0,
              total: 0,
              completionRate: 0,
              overdue: 0,
              flagged: 0,
              estimatedHours: null,
              lastActivityDate: null
            };
          }
        } catch (statsError) {
          // If stats collection fails, continue without them
          projectObj.statsError = "Failed to collect statistics";
        }
      }
      
      projects.push(projectObj);
      addedCount++;
      
      // Check if we've reached the limit
      if (limit && projects.length >= limit) {
        break;
      }
    }
    
    return JSON.stringify({ 
      projects: projects,
      metadata: {
        total_available: allProjects.length,
        returned_count: projects.length,
        limit_applied: limit,
        performance_mode: performanceMode,
        stats_included: includeStats === true
      }
    });
  } catch (error) {
    return formatError(error, 'list_projects');
  }
  })();
`;
