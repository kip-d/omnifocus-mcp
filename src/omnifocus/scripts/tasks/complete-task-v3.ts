/**
 * Script to complete a task in OmniFocus - V3 Pure OmniJS
 *
 * V3 Changes:
 * - Removed getUnifiedHelpers() dependency
 * - Direct try/catch instead of safeGet()
 * - Inline error handling instead of formatError()
 * - V3 response format
 */
export const COMPLETE_TASK_SCRIPT = `
  (() => {
    const startTime = Date.now();
    const app = Application('OmniFocus');
    const doc = app.defaultDocument();
    const taskId = {{taskId}};
    const completionDate = {{completionDate}} ? new Date({{completionDate}}) : new Date();

    try {
      // Find task without whose() per performance guidance
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
            operation: 'complete_task'
          }
        });
      }

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
        ok: true,
        v: '3',
        data: {
          id: taskId,
          completed: true,
          completionDate: completedDate || new Date().toISOString()
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
          operation: 'complete_task'
        }
      });
    }
  })();
`;

/**
 * Script to complete a task using OmniAutomation (URL scheme fallback)
 * Note: This script runs in OmniJS context, not JXA
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
