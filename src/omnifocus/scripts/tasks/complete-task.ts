import { getBasicHelpers } from '../shared/helpers.js';

/**
 * Script to complete a task in OmniFocus using JXA
 */
export const COMPLETE_TASK_SCRIPT = `
  ${getBasicHelpers()}
  
  (() => {
    const app = Application('OmniFocus');
    const doc = app.defaultDocument();
    const taskId = {{taskId}};
    const completionDate = {{completionDate}} ? new Date({{completionDate}}) : new Date();
    
    try {
      // Find task - use whose() for single ID lookup (this is fast)
      // whose() is only slow for filtering many tasks, not for ID lookups
      const tasks = doc.flattenedTasks.whose({id: taskId})();
      
      if (tasks.length === 0) {
        return JSON.stringify({
          error: true,
          message: 'Task not found: ' + taskId
        });
      }
      
      const task = tasks[0];
      
      // Mark as completed using the proper method
      // markComplete() expects either no args or an object with date property
      if (completionDate) {
        task.markComplete({date: completionDate});
      } else {
        task.markComplete();
      }
      
      // Safely get completion date - it might be null for recurring tasks
      // that create a new instance
      let completedDate = null;
      try {
        const taskCompletionDate = task.completionDate();
        if (taskCompletionDate) {
          completedDate = taskCompletionDate.toISOString();
        }
      } catch (e) {
        // If this was a recurring task, the original might be gone
        // and a new instance created
        completedDate = new Date().toISOString();
      }
      
      return JSON.stringify({
        id: taskId,
        completed: true,
        completionDate: completedDate || new Date().toISOString()
      });
      
    } catch (error) {
      return formatError(error, 'complete_task');
    }
  })();
`;

/**
 * Script to complete a task using OmniAutomation (URL scheme fallback)
 */
export const COMPLETE_TASK_OMNI_SCRIPT = `
  (() => {
    const taskId = {{taskId}};
    const task = Task.byIdentifier(taskId);
    
    if (!task) {
      throw new Error('Task not found: ' + taskId);
    }
    
    task.markComplete();
    
    return {
      id: taskId,
      completed: true,
      message: 'Task completed successfully'
    };
  })()
`;
