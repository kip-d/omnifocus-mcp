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
    try {
      return task.completed() === true;
    } catch (e) {
      return false;
    }
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
    
    // Optimization: Start with all tasks but we'll filter efficiently
    let allTasks;
    try {
      allTasks = doc.flattenedTasks();
    } catch (taskError) {
      return JSON.stringify({
        error: true,
        message: "Failed to retrieve tasks from OmniFocus: " + taskError.toString(),
        details: "doc.flattenedTasks() threw an error",
        errorType: "TASK_RETRIEVAL_ERROR"
      });
    }
    
    let optimizationUsed = 'standard_filter';
    
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
    const maxTasks = options.limit || 200; // Add reasonable limit
    
    let dueTodayCount = 0;
    let overdueCount = 0;
    let flaggedCount = 0;
    
    // Pre-compute option flags (default to true for all except includeAvailable)
    const checkOverdue = options.includeOverdue !== false;
    const checkFlagged = options.includeFlagged !== false;
    const checkAvailable = options.includeAvailable === true;  // Default false, only true if explicitly set
    const includeDetails = options.includeDetails !== false;
    
    // Performance metrics
    let tasksScanned = 0;
    let filterTimeTotal = 0;
    
    // Safety limit to prevent runaway loops
    const maxIterations = Math.min(allTasks.length, 10000);
    
    for (let i = 0; i < maxIterations && tasks.length < maxTasks; i++) {
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