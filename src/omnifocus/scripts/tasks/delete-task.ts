import { getAllHelpers } from '../shared/helpers.js';

/**
 * Script to delete a task in OmniFocus using JXA
 */
export const DELETE_TASK_SCRIPT = `
  ${getAllHelpers()}
  
  (() => {
    const app = Application('OmniFocus');
    const doc = app.defaultDocument();
    const taskId = {{taskId}};
    
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
      const taskName = task.name();
      
      // Delete the task
      app.delete(task);
      
      return JSON.stringify({
        id: taskId,
        name: taskName,
        deleted: true
      });
      
    } catch (error) {
      return formatError(error, 'delete_task');
    }
  })();
`;

/**
 * Script to delete a task using OmniAutomation (URL scheme fallback)
 */
export const DELETE_TASK_OMNI_SCRIPT = `
  (() => {
    const taskId = {{taskId}};
    const task = Task.byIdentifier(taskId);
    
    if (!task) {
      throw new Error('Task not found: ' + taskId);
    }
    
    const taskName = task.name;
    deleteObject(task);
    
    return {
      id: taskId,
      name: taskName,
      deleted: true,
      message: 'Task deleted successfully'
    };
  })()
`;