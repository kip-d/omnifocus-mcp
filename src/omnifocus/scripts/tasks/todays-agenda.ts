import { getAllHelpers } from '../shared/helpers.js';

/**
 * Script to get today's agenda from OmniFocus
 *
 * Optimized performance query that returns:
 * - Overdue tasks
 * - Tasks due today
 * - Flagged tasks
 *
 * Performance optimizations:
 * - Efficient filtering with early returns
 * - Configurable detail levels
 * - Limited default results
 */
export const TODAYS_AGENDA_SCRIPT = `
  ${getAllHelpers()}
  
  (() => {
    const options = {{options}};
    const tasks = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
  
  // Helper function for safe completed check
  function safeIsCompleted(task) {
    // Use the isTaskEffectivelyCompleted helper which checks both task completion
    // and parent project completion status
    return isTaskEffectivelyCompleted(task);
  }
  
  // Helper function for safe flagged check (duplicated for clarity)
  function safeIsFlagged(task) {
    try {
      return task.flagged() === true;
    } catch (e) {
      return false;
    }
  }
  
  try {
    const app = Application('OmniFocus');
    const doc = app.defaultDocument();
    
    // Optimization: Use OmniFocus's query capabilities to pre-filter
    let allTasks;
    let optimizationUsed = 'standard_filter';
    
    try {
      // Try to get tasks with specific criteria for better performance
      if (options.includeOverdue !== false || options.includeFlagged !== false) {
        // For agenda, we want tasks that are either due soon or flagged
        const endDate = new Date(tomorrow);
        endDate.setDate(endDate.getDate() + 7); // Look ahead 7 days
        
        // Note: {_not: null} doesn't work in JXA, so we need manual filtering
        // Get all incomplete tasks and filter manually
        allTasks = doc.flattenedTasks.whose({completed: false})();
        
        // Filter for flagged tasks or tasks with due dates
        const filteredTasks = [];
        const checkLimit = Math.min(2000, allTasks.length);
        
        for (let i = 0; i < checkLimit; i++) {
          const task = allTasks[i];
          try {
            if (task.flagged() || task.dueDate()) {
              filteredTasks.push(task);
            }
          } catch (e) {
            // Skip tasks that throw errors
          }
        }
        
        allTasks = filteredTasks;
        optimizationUsed = 'manual_filter_flagged_or_due';
      } else {
        allTasks = doc.flattenedTasks.whose({completed: false})();
        optimizationUsed = 'incomplete_filter';
      }
    } catch (taskError) {
      try {
        // Fallback to all tasks if filter fails
        allTasks = doc.flattenedTasks();
        optimizationUsed = 'standard_filter';
      } catch (fallbackError) {
        return JSON.stringify({
          error: true,
          message: "Failed to retrieve tasks from OmniFocus: " + fallbackError.toString(),
          details: "doc.flattenedTasks() threw an error",
          errorType: "TASK_RETRIEVAL_ERROR"
        });
      }
    }
    
    // Check if we got valid results
    if (!allTasks) {
      return JSON.stringify({
        error: true,
        message: "Failed to retrieve tasks from OmniFocus. The document may not be available or OmniFocus may not be running properly.",
        details: "doc.flattenedTasks() returned null or undefined",
        errorType: "NULL_TASKS_ERROR"
      });
    }
    
    // Check task count for debugging
    let totalTaskCount = 0;
    try {
      totalTaskCount = allTasks.length;
    } catch (e) {
      // Length property might not be accessible
      totalTaskCount = -1;
    }
    
    const startTime = Date.now();
    const maxTasks = options.limit || 50; // Reduced default limit for better performance
    
    let dueTodayCount = 0;
    let overdueCount = 0;
    let flaggedCount = 0;
    
    // Pre-compute option flags (default to true for all except includeAvailable)
    const checkOverdue = options.includeOverdue !== false;
    const checkFlagged = options.includeFlagged !== false;
    const checkAvailable = options.includeAvailable === true;  // Default false, only true if explicitly set
    const includeDetails = options.includeDetails === true;  // Default false for better performance
    
    // Performance metrics
    let tasksScanned = 0;
    let filterTimeTotal = 0;
    
    // Limit iterations for performance - agenda should focus on most relevant tasks
    const maxIterations = Math.min(allTasks.length, 500); // Reduced from 10000
    
    // First pass: collect tasks into buckets for better performance
    const overdueTasks = [];
    const todayTasks = [];
    const flaggedTasks = [];
    
    for (let i = 0; i < maxIterations; i++) {
      const task = allTasks[i];
      
      // Skip completed tasks first (cheapest check)
      if (safeIsCompleted(task)) continue;
      
      tasksScanned++;
      
      const filterStart = Date.now();
      
      // Cache expensive calls
      let deferDate = null;
      let dueDateObj = null;
      let dueDateStr = null;
      let dueDateChecked = false;
      
      // Check if available (if required) - use blocked property for optimization
      if (checkAvailable) {
        // Quick check using blocked property
        if (safeGet(() => task.blocked(), false)) {
          filterTimeTotal += Date.now() - filterStart;
          continue;
        }
        
        // Check defer date
        deferDate = safeGetDate(() => task.deferDate());
        if (deferDate && new Date(deferDate) > new Date()) {
          filterTimeTotal += Date.now() - filterStart;
          continue;
        }
      }
      
      let includeTask = false;
      let reason = '';
      
      // Check due date only if needed
      if (checkOverdue || true) { // Always need to check for "due today"
        dueDateStr = safeGetDate(() => task.dueDate());
        dueDateChecked = true;
        
        if (dueDateStr) {
          dueDateObj = new Date(dueDateStr);
          
          if (checkOverdue && dueDateObj < today) {
            includeTask = true;
            reason = 'overdue';
            overdueCount++;
          } else if (dueDateObj >= today && dueDateObj < tomorrow) {
            includeTask = true;
            reason = 'due_today';
            dueTodayCount++;
          }
        }
      }
      
      // Check flagged status only if not already included
      if (!includeTask && checkFlagged && safeIsFlagged(task)) {
        includeTask = true;
        reason = 'flagged';
        flaggedCount++;
      }
      
      if (includeTask) {
        // Build task object efficiently
        const taskObj = {
          id: safeGet(() => task.id(), 'unknown'),
          name: safeGet(() => task.name(), 'Unnamed Task'),
          completed: false,
          flagged: reason === 'flagged' ? true : safeIsFlagged(task),
          reason: reason
        };
        
        // Add dates we already fetched
        if (dueDateChecked && dueDateStr) {
          taskObj.dueDate = dueDateStr;
        }
        if (deferDate) {
          taskObj.deferDate = deferDate;
        }
        
        // Only add expensive details if requested
        if (includeDetails) {
          const note = safeGet(() => task.note());
          if (note) taskObj.note = note;
          
          const project = safeGetProject(task);
          if (project) {
            taskObj.project = project.name;
            taskObj.projectId = project.id;
          }
          
          const tags = safeGetTags(task);
          if (tags.length > 0) taskObj.tags = tags;
          
          // Add additional properties if available
          const estimatedMinutes = safeGetEstimatedMinutes(task);
          if (estimatedMinutes) taskObj.estimatedMinutes = estimatedMinutes;
          
          // Add task state indicators
          const blocked = safeGet(() => task.blocked(), false);
          const next = safeGet(() => task.next(), false);
          if (blocked) taskObj.blocked = blocked;
          if (next) taskObj.next = next;
        }
        
        tasks.push(taskObj);
      }
      
      filterTimeTotal += Date.now() - filterStart;
    }
    
    const endTime = Date.now();
    
    // Sort tasks by priority: overdue first, then due today, then flagged
    tasks.sort((a, b) => {
      const priority = {'overdue': 0, 'due_today': 1, 'flagged': 2};
      return priority[a.reason] - priority[b.reason];
    });
    
    return JSON.stringify({
      tasks: tasks,
      summary: {
        total: tasks.length,
        overdue: overdueCount,
        due_today: dueTodayCount,
        flagged: flaggedCount,
        query_time_ms: endTime - startTime,
        limited: tasks.length >= maxTasks
      },
      performance_metrics: {
        tasks_scanned: tasksScanned,
        filter_time_ms: filterTimeTotal,
        total_time_ms: endTime - startTime,
        optimization: optimizationUsed,
        total_tasks_in_db: totalTaskCount
      }
    });
  } catch (error) {
    return formatError(error, 'todays_agenda');
  }
  })();
`;
