/**
 * Script to delete a task in OmniFocus - V3 Pure OmniJS
 *
 * V3 Changes:
 * - Removed getUnifiedHelpers() dependency
 * - Direct try/catch instead of safeGet()
 * - Inline error handling instead of formatError()
 * - V3 response format
 */
export const DELETE_TASK_SCRIPT = `
  (() => {
    const startTime = Date.now();
    const app = Application('OmniFocus');
    const doc = app.defaultDocument();
    const taskId = {{taskId}};

    try {
      // Find task without whose()
      const allTasks = doc.flattenedTasks();
      let task = null;
      for (let i = 0; i < allTasks.length; i++) {
        try {
          if (allTasks[i].id() === taskId) {
            task = allTasks[i];
            break;
          }
        } catch (e) {}
      }

      if (!task) {
        return JSON.stringify({
          ok: false,
          v: '3',
          error: {
            message: 'Task not found: ' + taskId,
            operation: 'delete_task'
          }
        });
      }

      const taskName = task.name();

      // Delete the task
      app.delete(task);

      return JSON.stringify({
        ok: true,
        v: '3',
        data: {
          id: taskId,
          name: taskName,
          deleted: true
        },
        query_time_ms: Date.now() - startTime
      });

    } catch (error) {
      return JSON.stringify({
        ok: false,
        v: '3',
        error: {
          message: error.message || String(error),
          stack: error.stack,
          operation: 'delete_task'
        }
      });
    }
  })();
`;

/**
 * Script to delete a task using OmniAutomation (URL scheme fallback)
 * Note: This script runs in OmniJS context, not JXA
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
