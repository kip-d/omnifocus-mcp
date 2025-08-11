/**
 * Date range query scripts using whose() method for optimized performance
 * These scripts demonstrate how to use JXA's whose() method with date comparisons
 */

import { getAllHelpers } from './shared/helpers.js';

// REVERTED: Hybrid scripts removed due to critical performance issues
// The hybrid approach caused 4-22x slower performance than original JXA

/**
 * Get tasks due within a specific date range using whose()
 * This is significantly faster than iterating through all tasks
 */
export const GET_TASKS_IN_DATE_RANGE_SCRIPT = `
  ${getAllHelpers()}
  
  (() => {
    const app = Application('OmniFocus');
    const doc = app.defaultDocument();
    const params = {{params}};
    const startDate = params.startDate ? new Date(params.startDate) : null;
    const endDate = params.endDate ? new Date(params.endDate) : null;
    const dateField = params.dateField || 'dueDate'; // 'dueDate', 'deferDate', or 'completionDate'
    const includeNullDates = params.includeNullDates || false;
    const limit = params.limit || 100;
    
    try {
    const startTime = Date.now();
    let tasks = [];
    let queryMethod = 'unknown';
    
    // Validate inputs
    if (!startDate && !endDate) {
      return JSON.stringify({
        error: true,
        message: "At least one of startDate or endDate must be provided"
      });
    }
    
    // Try to use whose() for optimized queries
    // Note: whose() in JXA has limitations with date comparisons
    // We'll use different strategies based on the query type
    
    if (dateField === 'dueDate') {
      // For due dates, we can use effective queries
      if (startDate && endDate) {
        // Tasks due between two dates
        // Use whose() to pre-filter to tasks with due dates
        queryMethod = 'whose_due_not_null';
        
        let allTasks;
        try {
          // Get only incomplete tasks with due dates
          allTasks = doc.flattenedTasks.whose({
            completed: false,
            dueDate: {_not: null}
          })();
        } catch (e) {
          // Fallback to all tasks
          allTasks = doc.flattenedTasks();
          queryMethod = 'fallback_all_tasks';
        }
        
        // Filter to date range
        for (let i = 0; i < allTasks.length && tasks.length < limit; i++) {
          const task = allTasks[i];
          const dueDate = safeGet(() => task.dueDate());
          
          if (dueDate) {
            const dueDateObj = new Date(dueDate);
            if (dueDateObj >= startDate && dueDateObj <= endDate) {
              tasks.push(buildTaskObject(task));
            }
          }
        }
      } else if (startDate && !endDate) {
        // Tasks due after a specific date (future tasks)
        queryMethod = 'whose_future_due';
        
        // Get incomplete tasks with due dates
        let incompleteTasks;
        try {
          incompleteTasks = doc.flattenedTasks.whose({
            completed: false,
            dueDate: {_not: null}
          })();
        } catch (e) {
          // Fallback
          const allTasks = doc.flattenedTasks();
          incompleteTasks = [];
          for (let i = 0; i < allTasks.length; i++) {
            if (!safeGet(() => allTasks[i].completed(), false)) {
              incompleteTasks.push(allTasks[i]);
            }
          }
          queryMethod = 'fallback_filter';
        }
        
        for (let i = 0; i < incompleteTasks.length && tasks.length < limit; i++) {
          const task = incompleteTasks[i];
          const dueDate = safeGet(() => task.dueDate());
          
          if (dueDate && new Date(dueDate) >= startDate) {
            tasks.push(buildTaskObject(task));
          }
        }
      } else if (!startDate && endDate) {
        // Tasks due before a specific date (overdue + upcoming)
        queryMethod = 'before_date';
        
        const incompleteTasks = doc.flattenedTasks.whose({completed: false})();
        
        for (let i = 0; i < incompleteTasks.length && tasks.length < limit; i++) {
          const task = incompleteTasks[i];
          const dueDate = safeGet(() => task.dueDate());
          
          if (dueDate && new Date(dueDate) <= endDate) {
            tasks.push(buildTaskObject(task));
          }
        }
      }
    } else if (dateField === 'deferDate') {
      // For defer dates
      queryMethod = 'defer_filter';
      
      // Get all tasks for defer date filtering
      const allTasks = doc.flattenedTasks();
      
      for (let i = 0; i < allTasks.length && tasks.length < limit; i++) {
        const task = allTasks[i];
        const deferDate = safeGet(() => task.deferDate());
        
        if (deferDate) {
          const deferDateObj = new Date(deferDate);
          let includeTask = true;
          
          if (startDate && deferDateObj < startDate) includeTask = false;
          if (endDate && deferDateObj > endDate) includeTask = false;
          
          if (includeTask) {
            tasks.push(buildTaskObject(task));
          }
        }
      }
    } else if (dateField === 'completionDate') {
      // For completion dates - only completed tasks
      queryMethod = 'completion_filter';
      
      const completedTasks = doc.flattenedTasks.whose({completed: true});
      
      for (let i = 0; i < completedTasks.length && tasks.length < limit; i++) {
        const task = completedTasks[i];
        const completionDate = safeGet(() => task.completionDate());
        
        if (completionDate) {
          const completionDateObj = new Date(completionDate);
          let includeTask = true;
          
          if (startDate && completionDateObj < startDate) includeTask = false;
          if (endDate && completionDateObj > endDate) includeTask = false;
          
          if (includeTask) {
            tasks.push(buildTaskObject(task));
          }
        }
      }
    }
    
    // If we need to include tasks without dates
    if (includeNullDates && tasks.length < limit) {
      const allTasksForNull = doc.flattenedTasks();
      
      for (let i = 0; i < allTasksForNull.length && tasks.length < limit; i++) {
        const task = allTasksForNull[i];
        const dateValue = safeGet(() => task[dateField]());
        
        if (!dateValue) {
          tasks.push(buildTaskObject(task));
        }
      }
    }
    
    const endTime = Date.now();
    
    // Sort tasks by the requested date field
    tasks.sort((a, b) => {
      const aDate = a[dateField];
      const bDate = b[dateField];
      
      if (!aDate && !bDate) return 0;
      if (!aDate) return 1;
      if (!bDate) return -1;
      
      return new Date(aDate).getTime() - new Date(bDate).getTime();
    });
    
    return JSON.stringify({
      tasks: tasks,
      summary: {
        total: tasks.length,
        query_method: queryMethod,
        date_field: dateField,
        start_date: startDate ? startDate.toISOString() : null,
        end_date: endDate ? endDate.toISOString() : null,
        include_null_dates: includeNullDates,
        limited: tasks.length >= limit,
        query_time_ms: endTime - startTime
      }
    });
    
  } catch (error) {
    return JSON.stringify({
      error: true,
      message: "Failed to query tasks by date range: " + error.toString(),
      details: error.message
    });
  }
  
  function buildTaskObject(task) {
    const obj = {
      id: safeGet(() => task.id(), 'unknown'),
      name: safeGet(() => task.name(), 'Unnamed Task'),
      completed: isTaskEffectivelyCompleted(task)
    };
    
    // Add all date fields for context
    const dueDate = safeGetDate(() => task.dueDate());
    const deferDate = safeGetDate(() => task.deferDate());
    const completionDate = safeGetDate(() => task.completionDate());
    
    if (dueDate) obj.dueDate = dueDate;
    if (deferDate) obj.deferDate = deferDate;
    if (completionDate) obj.completionDate = completionDate;
    
    // Add project info
    const project = safeGetProject(task);
    if (project) {
      obj.project = project.name;
      obj.projectId = project.id;
    }
    
    // Add flagged status
    obj.flagged = safeGet(() => task.flagged(), false);
    
    return obj;
  }
  })();
`;

/**
 * Get tasks that are overdue using optimized whose() queries
 */
export const GET_OVERDUE_TASKS_OPTIMIZED_SCRIPT = `
  ${getAllHelpers()}
  
  (() => {
    const app = Application('OmniFocus');
    const doc = app.defaultDocument();
    const limit = {{limit}};
    const includeCompleted = {{includeCompleted}};
    
    try {
      const startTime = Date.now();
    const now = new Date();
    const tasks = [];
    
    // Get tasks based on completion status
    let allTasks;
    let queryMethod = 'standard';
    
    try {
      if (includeCompleted) {
        // Include both complete and incomplete tasks with due dates
        allTasks = doc.flattenedTasks.whose({
          dueDate: {_not: null}
        })();
        queryMethod = 'whose_due_not_null';
      } else {
        // Get only incomplete tasks with due dates
        allTasks = doc.flattenedTasks.whose({
          completed: false,
          dueDate: {_not: null}
        })();
        queryMethod = 'whose_incomplete_with_due';
      }
    } catch (whoseError) {
      // Fallback to standard query
      allTasks = doc.flattenedTasks();
      queryMethod = 'fallback_all_tasks';
    }
    
    // Filter for overdue tasks
    for (let i = 0; i < allTasks.length && tasks.length < limit; i++) {
      const task = allTasks[i];
      
      // Skip completed tasks if not including them
      if (!includeCompleted && isTaskEffectivelyCompleted(task)) continue;
      
      const dueDate = safeGet(() => task.dueDate());
      
      if (dueDate && new Date(dueDate) < now) {
        const taskObj = {
          id: safeGet(() => task.id(), 'unknown'),
          name: safeGet(() => task.name(), 'Unnamed Task'),
          dueDate: dueDate,
          completed: isTaskEffectivelyCompleted(task),
          flagged: safeGet(() => task.flagged(), false)
        };
        
        // Calculate how overdue
        const daysOverdue = Math.floor((now - new Date(dueDate)) / (1000 * 60 * 60 * 24));
        taskObj.daysOverdue = daysOverdue;
        
        // Add project info
        const project = safeGetProject(task);
        if (project) {
          taskObj.project = project.name;
          taskObj.projectId = project.id;
        }
        
        tasks.push(taskObj);
      }
    }
    
    // Sort by most overdue first
    tasks.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
    
    const endTime = Date.now();
    
    return JSON.stringify({
      tasks: tasks,
      summary: {
        total: tasks.length,
        limited: tasks.length >= limit,
        query_time_ms: endTime - startTime,
        reference_date: now.toISOString(),
        query_method: queryMethod
      }
    });
    
  } catch (error) {
    return JSON.stringify({
      error: true,
      message: "Failed to get overdue tasks: " + error.toString(),
      details: error.message
    });
  }
  })();
`;

/**
 * Get upcoming tasks for the next N days using optimized queries
 */
export const GET_UPCOMING_TASKS_OPTIMIZED_SCRIPT = `
  ${getAllHelpers()}
  
  (() => {
    const app = Application('OmniFocus');
    const doc = app.defaultDocument();
    const days = {{days}};
    const includeToday = {{includeToday}};
    const limit = {{limit}};
    
    try {
      const startTime = Date.now();
      const now = new Date();
      const startDate = includeToday ? now : new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const endDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    
    const tasks = [];
    
    // Get only incomplete tasks with due dates
    let allTasks;
    let queryMethod = 'standard';
    let processedCount = 0;
    const maxScanLimit = 500; // Reduced from 1000 for better performance
    
    try {
      // Get incomplete tasks - we can't filter by due date in whose()
      allTasks = doc.flattenedTasks.whose({
        completed: false
      })();
      queryMethod = 'whose_incomplete';
      
      // If we got too many tasks, limit what we process
      if (allTasks.length > maxScanLimit) {
        queryMethod = 'limited_scan';
        
        // PERFORMANCE: With 1000+ tasks, even checking due dates is slow
        // We'll take a sample approach - process first N tasks
        const sampleSize = 300; // Enough to find most upcoming tasks
        
        // Convert to limited array 
        const limitedTasks = [];
        for (let i = 0; i < Math.min(sampleSize, allTasks.length); i++) {
          limitedTasks.push(allTasks[i]);
        }
        allTasks = limitedTasks;
      }
    } catch (e) {
      // Fallback but with limits
      try {
        allTasks = doc.flattenedTasks.whose({completed: false})();
        queryMethod = 'fallback_incomplete';
        
        // Limit to first 500 tasks if too many
        if (allTasks.length > 500) {
          const limitedTasks = [];
          for (let i = 0; i < 500; i++) {
            limitedTasks.push(allTasks[i]);
          }
          allTasks = limitedTasks;
          queryMethod = 'fallback_limited';
        }
      } catch (e2) {
        // Final fallback with hard limit
        allTasks = doc.flattenedTasks();
        const limitedTasks = [];
        for (let i = 0; i < Math.min(300, allTasks.length); i++) {
          if (!allTasks[i].completed()) {
            limitedTasks.push(allTasks[i]);
          }
        }
        allTasks = limitedTasks;
        queryMethod = 'fallback_hard_limit';
      }
    }
    
    // First collect tasks with dates for sorting
    const tasksWithDates = [];
    processedCount = 0; // Initialize if not already set
    for (let i = 0; i < allTasks.length; i++) {
      const task = allTasks[i];
      
      // Skip completed tasks if we couldn't pre-filter
      if (isTaskEffectivelyCompleted(task)) continue;
      const dueDate = safeGet(() => task.dueDate());
      
      if (dueDate) {
        const dueDateObj = new Date(dueDate);
        // Only collect tasks that could be in range
        if (dueDateObj <= endDate) {
          tasksWithDates.push({ task, dueDate, dueDateObj });
        }
      }
    }
    
    // Sort by due date for efficient processing
    tasksWithDates.sort((a, b) => a.dueDateObj.getTime() - b.dueDateObj.getTime());
    
    // Process sorted tasks, can stop early once past endDate
    for (let i = 0; i < tasksWithDates.length && tasks.length < limit; i++) {
      const { task, dueDate, dueDateObj } = tasksWithDates[i];
      processedCount++;
      
      // Stop if we've passed the end date (since sorted)
      if (dueDateObj > endDate) break;
      
      if (dueDateObj >= startDate && dueDateObj <= endDate) {
        const taskObj = {
          id: safeGet(() => task.id(), 'unknown'),
          name: safeGet(() => task.name(), 'Unnamed Task'),
          dueDate: dueDate,
          flagged: safeGet(() => task.flagged(), false)
        };
        
        // Calculate days until due
        const daysUntilDue = Math.ceil((dueDateObj - now) / (1000 * 60 * 60 * 24));
        taskObj.daysUntilDue = daysUntilDue;
        
        // Add day of week
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        taskObj.dayOfWeek = dayNames[dueDateObj.getDay()];
        
        // Add project info
        const project = safeGetProject(task);
        if (project) {
          taskObj.project = project.name;
          taskObj.projectId = project.id;
        }
        
        tasks.push(taskObj);
      }
    }
    
    // Sort by due date
    tasks.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
    
    const endTime = Date.now();
    
    return JSON.stringify({
      tasks: tasks,
      summary: {
        total: tasks.length,
        days_ahead: days,
        include_today: includeToday,
        start_date: startDate.toISOString(),
        end_date: endDate.toISOString(),
        limited: tasks.length >= limit,
        query_time_ms: endTime - startTime,
        query_method: queryMethod,
        tasks_scanned: processedCount || tasksWithDates.length
      }
    });
    
  } catch (error) {
    return JSON.stringify({
      error: true,
      message: "Failed to get upcoming tasks: " + error.toString(),
      details: error.message
    });
  }
  })();
`;
