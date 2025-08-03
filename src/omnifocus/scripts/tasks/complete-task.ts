import { getAllHelpers } from '../shared/helpers.js';

/**
 * Script to complete a task in OmniFocus using JXA
 */
export const COMPLETE_TASK_SCRIPT = `
  ${getAllHelpers()}
  
  (() => {
    const app = Application('OmniFocus');
    const doc = app.defaultDocument();
    const taskId = {{taskId}};
    const completionDate = {{completionDate}} ? new Date({{completionDate}}) : new Date();
    
    try {
      // Find task using whose clause
      const tasks = doc.flattenedTasks.whose({id: taskId})();
      
      if (tasks.length === 0) {
        return JSON.stringify({
          error: true,
          message: 'Task not found: ' + taskId
        });
      }
      
      const task = tasks[0];
      
      // Mark as completed
      task.completed = true;
      if (completionDate) {
        task.completionDate = completionDate;
      }
      
      return JSON.stringify({
        id: taskId,
        completed: true,
        completionDate: task.completionDate().toISOString()
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
`;