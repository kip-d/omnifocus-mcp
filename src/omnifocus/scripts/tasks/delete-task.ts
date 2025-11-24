import { getUnifiedHelpers } from '../shared/helpers.js';

/**
 * Script to delete a task in OmniFocus using pure OmniJS bridge
 *
 * OPTIMIZATION (November 2025):
 * - Old approach: 2x O(n) iteration - OmniJS find + JXA find = 27+ seconds for 2000 tasks
 * - New approach: O(1) lookup using Task.byIdentifier() + deleteObject() in single OmniJS call
 * - Performance: ~1000x faster (sub-second vs 27 seconds)
 */
export const DELETE_TASK_SCRIPT = `
  ${getUnifiedHelpers()}

  (() => {
    const app = Application('OmniFocus');
    const taskId = {{taskId}};

    try {
      // Use pure OmniJS for O(1) lookup AND deletion in single bridge call
      // Task.byIdentifier() is O(1) lookup, deleteObject() deletes immediately
      const deleteScript = '(' +
        '(() => {' +
          'const targetId = "' + taskId + '";' +
          'const task = Task.byIdentifier(targetId);' +
          '' +
          'if (!task) {' +
            'return JSON.stringify({' +
              'error: true,' +
              'message: "Task not found: " + targetId' +
            '});' +
          '}' +
          '' +
          'const taskName = task.name;' +
          'deleteObject(task);' +
          '' +
          'return JSON.stringify({' +
            'id: targetId,' +
            'name: taskName,' +
            'deleted: true' +
          '});' +
        '})()' +
      ')';

      const result = app.evaluateJavascript(deleteScript);
      return result;

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
