/**
 * Optimized date range query scripts using whose() with proper syntax
 * Uses _not operator for null inequality checks
 */

import { SAFE_UTILITIES_SCRIPT } from './tasks.js';

/**
 * Get tasks due within a specific date range using optimized whose() queries
 */
export const GET_TASKS_IN_DATE_RANGE_OPTIMIZED_SCRIPT = `
  const params = {{params}};
  const startDate = params.startDate ? new Date(params.startDate) : null;
  const endDate = params.endDate ? new Date(params.endDate) : null;
  const dateField = params.dateField || 'dueDate'; // 'dueDate', 'deferDate', or 'completionDate'
  const includeNullDates = params.includeNullDates || false;
  const limit = params.limit || 100;
  
  ${SAFE_UTILITIES_SCRIPT}
  
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
    
    // Use optimized whose() queries where possible
    if (dateField === 'dueDate') {
      if (startDate && endDate) {
        // Date range query - use whose() to get tasks with due dates first
        queryMethod = 'whose_date_range';
        
        // Get tasks with due dates using proper _not syntax
        const tasksWithDueDates = doc.flattenedTasks.whose({
          completed: false,
          dueDate: {_not: null}
        })();
        
        // Filter to date range
        for (let i = 0; i < tasksWithDueDates.length && tasks.length < limit; i++) {
          const task = tasksWithDueDates[i];
          const dueDate = safeGet(() => task.dueDate());
          
          if (dueDate) {
            const dueDateObj = new Date(dueDate);
            if (dueDateObj >= startDate && dueDateObj <= endDate) {
              tasks.push(buildTaskObject(task));
            }
          }
        }
      } else if (startDate && !endDate) {
        // Future tasks - combine whose() conditions
        queryMethod = 'whose_future';
        
        // Get incomplete tasks with due dates after start date
        const query = {
          _and: [
            {completed: false},
            {dueDate: {_not: null}},
            {dueDate: {'>=': startDate}}
          ]
        };
        
        try {
          const futureTasks = doc.flattenedTasks.whose(query)();
          
          for (let i = 0; i < futureTasks.length && tasks.length < limit; i++) {
            tasks.push(buildTaskObject(futureTasks[i]));
          }
        } catch (e) {
          // Fall back to manual filtering if complex query fails
          queryMethod = 'fallback_future';
          const tasksWithDueDates = doc.flattenedTasks.whose({
            completed: false,
            dueDate: {_not: null}
          })();
          
          for (let i = 0; i < tasksWithDueDates.length && tasks.length < limit; i++) {
            const task = tasksWithDueDates[i];
            const dueDate = safeGet(() => task.dueDate());
            
            if (dueDate && new Date(dueDate) >= startDate) {
              tasks.push(buildTaskObject(task));
            }
          }
        }
      } else if (!startDate && endDate) {
        // Tasks due before end date (overdue + upcoming)
        queryMethod = 'whose_before';
        
        const query = {
          _and: [
            {completed: false},
            {dueDate: {_not: null}},
            {dueDate: {'<=': endDate}}
          ]
        };
        
        try {
          const beforeTasks = doc.flattenedTasks.whose(query)();
          
          for (let i = 0; i < beforeTasks.length && tasks.length < limit; i++) {
            tasks.push(buildTaskObject(beforeTasks[i]));
          }
        } catch (e) {
          // Fall back to manual filtering
          queryMethod = 'fallback_before';
          const tasksWithDueDates = doc.flattenedTasks.whose({
            completed: false,
            dueDate: {_not: null}
          })();
          
          for (let i = 0; i < tasksWithDueDates.length && tasks.length < limit; i++) {
            const task = tasksWithDueDates[i];
            const dueDate = safeGet(() => task.dueDate());
            
            if (dueDate && new Date(dueDate) <= endDate) {
              tasks.push(buildTaskObject(task));
            }
          }
        }
      }
    } else {
      // For defer dates and completion dates, use simpler approach
      queryMethod = 'filtered_iteration';
      
      let baseQuery = {};
      
      if (dateField === 'deferDate') {
        baseQuery = {deferDate: {_not: null}};
      } else if (dateField === 'completionDate') {
        baseQuery = {
          completed: true,
          completionDate: {_not: null}
        };
      }
      
      const tasksWithDates = doc.flattenedTasks.whose(baseQuery)();
      
      for (let i = 0; i < tasksWithDates.length && tasks.length < limit; i++) {
        const task = tasksWithDates[i];
        const dateValue = safeGet(() => task[dateField]());
        
        if (dateValue) {
          const dateObj = new Date(dateValue);
          let includeTask = true;
          
          if (startDate && dateObj < startDate) includeTask = false;
          if (endDate && dateObj > endDate) includeTask = false;
          
          if (includeTask) {
            tasks.push(buildTaskObject(task));
          }
        }
      }
    }
    
    // If we need to include tasks without dates
    if (includeNullDates && tasks.length < limit) {
      const nullDateQuery = {};
      nullDateQuery[dateField] = null;
      
      const tasksWithoutDates = doc.flattenedTasks.whose(nullDateQuery)();
      
      for (let i = 0; i < tasksWithoutDates.length && tasks.length < limit; i++) {
        tasks.push(buildTaskObject(tasksWithoutDates[i]));
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
`;

/**
 * Get overdue tasks using optimized whose() with proper _not syntax
 */
export const GET_OVERDUE_TASKS_TRULY_OPTIMIZED_SCRIPT = `
  const limit = {{limit}} || 50;
  const includeCompleted = {{includeCompleted}} || false;
  
  ${SAFE_UTILITIES_SCRIPT}
  
  try {
    const startTime = Date.now();
    const now = new Date();
    const tasks = [];
    
    // Build optimized query
    const query = includeCompleted ? 
      {
        dueDate: {_not: null},
        dueDate: {'<': now}
      } : {
        completed: false,
        dueDate: {_not: null},
        dueDate: {'<': now}
      };
    
    try {
      // Try the optimized query first
      const overdueTasks = doc.flattenedTasks.whose(query)();
      
      for (let i = 0; i < overdueTasks.length && tasks.length < limit; i++) {
        const task = overdueTasks[i];
        const dueDate = safeGet(() => task.dueDate());
        
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
    } catch (e) {
      // Fall back to simpler query if complex one fails
      const baseQuery = includeCompleted ? 
        {dueDate: {_not: null}} : 
        {completed: false, dueDate: {_not: null}};
        
      const tasksWithDueDates = doc.flattenedTasks.whose(baseQuery)();
      
      for (let i = 0; i < tasksWithDueDates.length && tasks.length < limit; i++) {
        const task = tasksWithDueDates[i];
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
`;