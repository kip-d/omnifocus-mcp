/**
 * FIXED hybrid date range query scripts
 * Uses JXA for initial filtering (fast) and Omni Automation for data extraction (reliable)
 */

import { getAllHelpers } from './shared/helpers.js';

/**
 * Get upcoming tasks - FIXED version that actually performs well
 */
export const GET_UPCOMING_TASKS_FIXED_SCRIPT = `
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
      
      // Use JXA to get incomplete tasks - MUCH faster initial filtering
      const incompleteTasks = doc.flattenedTasks.whose({completed: false})();
      
      // Filter and collect task IDs in JXA (fast)
      const taskData = [];
      let count = 0;
      
      for (let i = 0; i < incompleteTasks.length && count < limit; i++) {
        const task = incompleteTasks[i];
        const dueDate = safeGet(() => task.dueDate());
        
        if (dueDate) {
          const dueDateObj = new Date(dueDate);
          if (dueDateObj >= startDate && dueDateObj <= endDate) {
            // Collect just the ID for now
            taskData.push({
              id: task.id(),
              dueDate: dueDateObj
            });
            count++;
          }
        }
      }
      
      // Sort by due date
      taskData.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
      
      // Now use Omni Automation to get the full task details for just the matched tasks
      // This is more reliable for getting all properties
      const taskIds = taskData.map(t => t.id);
      const omniScript = \`
        (() => {
          const taskIds = \${JSON.stringify(taskIds)};
          const tasks = [];
          
          // Get tasks by ID - this is fast since we have specific IDs
          for (const id of taskIds) {
            const task = Task.byIdentifier(id);
            if (task) {
              tasks.push({
                id: task.id.primaryKey,
                name: task.name,
                dueDate: task.dueDate ? task.dueDate.toISOString() : null,
                flagged: task.flagged,
                project: task.containingProject ? task.containingProject.name : null,
                projectId: task.containingProject ? task.containingProject.id.primaryKey : null,
                note: task.note || null,
                tags: task.tags ? task.tags.map(t => t.name) : []
              });
            }
          }
          
          return JSON.stringify(tasks);
        })()
      \`;
      
      // Execute via bridge to get full task details
      app.includeStandardAdditions = true;
      const resultJson = app.evaluateJavascript(omniScript);
      const tasks = JSON.parse(resultJson);
      
      // Add calculated fields
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const enhancedTasks = tasks.map(task => {
        const dueDateObj = new Date(task.dueDate);
        return {
          ...task,
          dayOfWeek: dayNames[dueDateObj.getDay()],
          daysUntilDue: Math.ceil((dueDateObj - now) / (1000 * 60 * 60 * 24))
        };
      });
      
      const endTime = Date.now();
      
      return JSON.stringify({
        tasks: enhancedTasks,
        summary: {
          total: enhancedTasks.length,
          days_ahead: days,
          include_today: includeToday,
          start_date: startDate.toISOString(),
          end_date: endDate.toISOString(),
          limited: count >= limit,
          query_time_ms: endTime - startTime,
          query_method: 'fixed_hybrid_jxa_filtering'
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

/**
 * Get overdue tasks - FIXED version
 */
export const GET_OVERDUE_TASKS_FIXED_SCRIPT = `
  ${getAllHelpers()}
  
  (() => {
    const app = Application('OmniFocus');
    const doc = app.defaultDocument();
    const limit = {{limit}};
    const includeCompleted = {{includeCompleted}};
    
    try {
      const startTime = Date.now();
      const now = new Date();
      
      // Use JXA for initial filtering
      let tasks;
      if (includeCompleted) {
        tasks = doc.flattenedTasks();
      } else {
        tasks = doc.flattenedTasks.whose({completed: false})();
      }
      
      // Filter for overdue tasks and collect IDs
      const overdueTasks = [];
      let count = 0;
      
      for (let i = 0; i < tasks.length && count < limit; i++) {
        const task = tasks[i];
        
        if (!includeCompleted && isTaskEffectivelyCompleted(task)) continue;
        
        const dueDate = safeGet(() => task.dueDate());
        if (dueDate) {
          const dueDateObj = new Date(dueDate);
          if (dueDateObj < now) {
            overdueTasks.push({
              id: task.id(),
              dueDate: dueDateObj,
              daysOverdue: Math.floor((now - dueDateObj) / (1000 * 60 * 60 * 24))
            });
            count++;
          }
        }
      }
      
      // Sort by most overdue first
      overdueTasks.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
      
      // Get full details via Omni Automation
      const taskIds = overdueTasks.map(t => t.id);
      const omniScript = \`
        (() => {
          const taskIds = \${JSON.stringify(taskIds)};
          const tasks = [];
          
          for (const id of taskIds) {
            const task = Task.byIdentifier(id);
            if (task) {
              tasks.push({
                id: task.id.primaryKey,
                name: task.name,
                dueDate: task.dueDate ? task.dueDate.toISOString() : null,
                flagged: task.flagged,
                completed: task.completed,
                project: task.containingProject ? task.containingProject.name : null,
                projectId: task.containingProject ? task.containingProject.id.primaryKey : null,
                note: task.note || null,
                tags: task.tags ? task.tags.map(t => t.name) : []
              });
            }
          }
          
          return JSON.stringify(tasks);
        })()
      \`;
      
      app.includeStandardAdditions = true;
      const resultJson = app.evaluateJavascript(omniScript);
      const fullTasks = JSON.parse(resultJson);
      
      // Merge with calculated fields
      const enhancedTasks = fullTasks.map((task, i) => ({
        ...task,
        daysOverdue: overdueTasks[i].daysOverdue
      }));
      
      const endTime = Date.now();
      
      return JSON.stringify({
        tasks: enhancedTasks,
        summary: {
          total: enhancedTasks.length,
          limited: count >= limit,
          query_time_ms: endTime - startTime,
          reference_date: now.toISOString(),
          query_method: 'fixed_hybrid_jxa_filtering'
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
