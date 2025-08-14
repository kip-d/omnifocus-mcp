/**
 * Hybrid date range query scripts using evaluateJavascript bridge
 * Leverages Omni Automation API for better performance
 */

import { getAllHelpers } from './shared/helpers.js';

/**
 * Get upcoming tasks using Omni Automation API for better performance
 * This hybrid approach is MUCH faster than pure JXA
 */
export const GET_UPCOMING_TASKS_HYBRID_SCRIPT = `
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
      
      // Build the Omni Automation script  
      const omniScript = \`
        (() => {
          const startDate = new Date('\${startDate.toISOString()}');
          const endDate = new Date('\${endDate.toISOString()}');
          const limit = \${limit};
          const tasks = [];
          
          // Get all flattened tasks and iterate manually
          // Don't use where() - it's only available in OmniJS context
          const allTasks = flattenedTasks;
          
          for (let i = 0; i < allTasks.length; i++) {
            const task = allTasks[i];
            
            // Check if we should include this task
            if (task.completed) continue;
            if (!task.dueDate) continue;
            if (task.dueDate < startDate || task.dueDate > endDate) continue;
            
            const dueDate = task.dueDate;
            
            tasks.push({
              id: task.id.primaryKey,
              name: task.name,
              dueDate: dueDate.toISOString(),
              flagged: task.flagged,
              project: task.containingProject ? task.containingProject.name : null,
              projectId: task.containingProject ? task.containingProject.id.primaryKey : null,
              daysUntilDue: Math.ceil((dueDate - new Date()) / (1000 * 60 * 60 * 24))
            });
            
            if (tasks.length >= limit) break;
          }
          
          // Sort by due date
          tasks.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
          
          return JSON.stringify({
            tasks: tasks,
            count: tasks.length
          });
        })()
      \`;
      
      // Execute via bridge
      app.includeStandardAdditions = true;
      const resultJson = app.evaluateJavascript(omniScript);
      const result = JSON.parse(resultJson);
      
      const endTime = Date.now();
      
      // Add day of week to tasks
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const enhancedTasks = result.tasks.map(task => {
        const dueDateObj = new Date(task.dueDate);
        return {
          ...task,
          dayOfWeek: dayNames[dueDateObj.getDay()]
        };
      });
      
      return JSON.stringify({
        tasks: enhancedTasks,
        summary: {
          total: result.count,
          days_ahead: days,
          include_today: includeToday,
          start_date: startDate.toISOString(),
          end_date: endDate.toISOString(),
          limited: result.count >= limit,
          query_time_ms: endTime - startTime,
          query_method: 'hybrid_omni_automation'
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
 * Get overdue tasks using hybrid approach
 */
export const GET_OVERDUE_TASKS_HYBRID_SCRIPT = `
  ${getAllHelpers()}
  
  (() => {
    const app = Application('OmniFocus');
    const doc = app.defaultDocument();
    const limit = {{limit}};
    const includeCompleted = {{includeCompleted}};
    
    try {
      const startTime = Date.now();
      const now = new Date();
      
      // Build the Omni Automation script
      const omniScript = \`
        (() => {
          const now = new Date('\${now.toISOString()}');
          const limit = \${limit};
          const includeCompleted = \${includeCompleted};
          const tasks = [];
          
          // Get all flattened tasks and iterate manually
          // Don't use where() - it's only available in OmniJS context
          const allTasks = flattenedTasks;
          
          for (let i = 0; i < allTasks.length; i++) {
            const task = allTasks[i];
            
            // Check if we should include this task
            if (!includeCompleted && task.completed) continue;
            if (!task.dueDate) continue;
            if (task.dueDate >= now) continue; // Not overdue
            
            const daysOverdue = Math.floor((now - task.dueDate) / (1000 * 60 * 60 * 24));
            
            tasks.push({
              id: task.id.primaryKey,
              name: task.name,
              dueDate: task.dueDate.toISOString(),
              flagged: task.flagged,
              completed: task.completed,
              project: task.containingProject ? task.containingProject.name : null,
              projectId: task.containingProject ? task.containingProject.id.primaryKey : null,
              daysOverdue: daysOverdue
            });
            
            if (tasks.length >= limit) break;
          }
          
          // Sort by most overdue first
          tasks.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
          
          return JSON.stringify({
            tasks: tasks,
            count: tasks.length
          });
        })()
      \`;
      
      // Execute via bridge
      app.includeStandardAdditions = true;
      const resultJson = app.evaluateJavascript(omniScript);
      const result = JSON.parse(resultJson);
      
      const endTime = Date.now();
      
      return JSON.stringify({
        tasks: result.tasks,
        summary: {
          total: result.count,
          limited: result.count >= limit,
          query_time_ms: endTime - startTime,
          reference_date: now.toISOString(),
          query_method: 'hybrid_omni_automation'
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
