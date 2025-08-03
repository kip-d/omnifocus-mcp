/**
 * Date range query scripts using whose() method for optimized performance
 * These scripts demonstrate how to use JXA's whose() method with date comparisons
 */

import { getAllHelpers } from './shared/helpers.js';

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
        // whose() doesn't support complex date ranges directly, so we'll use a hybrid approach
        queryMethod = 'hybrid_filter';
        
        // Get all tasks - whose() with null comparisons is problematic in JXA
        const allTasks = doc.flattenedTasks();
        
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
        queryMethod = 'future_due';
        
        // Get all tasks and filter incomplete ones
        const allTasks = doc.flattenedTasks();
        const incompleteTasks = [];
        for (let i = 0; i < allTasks.length; i++) {
          if (!safeGet(() => allTasks[i].completed(), false)) {
            incompleteTasks.push(allTasks[i]);
          }
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
      completed: safeGet(() => task.completed(), false)
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
    
    if (includeCompleted) {
      // Include both complete and incomplete tasks
      allTasks = doc.flattenedTasks();
    } else {
      // Get all tasks and filter incomplete ones inline
      allTasks = doc.flattenedTasks();
    }
    
    // Filter for overdue tasks
    for (let i = 0; i < allTasks.length && tasks.length < limit; i++) {
      const task = allTasks[i];
      
      // Skip completed tasks if not including them
      if (!includeCompleted && safeGet(() => task.completed(), false)) continue;
      
      const dueDate = safeGet(() => task.dueDate());
      
      if (dueDate && new Date(dueDate) < now) {
        const taskObj = {
          id: safeGet(() => task.id(), 'unknown'),
          name: safeGet(() => task.name(), 'Unnamed Task'),
          dueDate: dueDate,
          completed: safeGet(() => task.completed(), false),
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
        reference_date: now.toISOString()
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
    
    // Get all tasks and filter incomplete ones
    const allTasks = doc.flattenedTasks();
    const incompleteTasks = [];
    for (let i = 0; i < allTasks.length; i++) {
      if (!safeGet(() => allTasks[i].completed(), false)) {
        incompleteTasks.push(allTasks[i]);
      }
    }
    
    // Filter for tasks in date range
    for (let i = 0; i < incompleteTasks.length && tasks.length < limit; i++) {
      const task = incompleteTasks[i];
      const dueDate = safeGet(() => task.dueDate());
      
      if (dueDate) {
        const dueDateObj = new Date(dueDate);
        
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
        query_time_ms: endTime - startTime
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