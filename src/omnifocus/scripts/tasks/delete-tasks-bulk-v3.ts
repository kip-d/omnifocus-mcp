/**
 * Optimized bulk delete script - V3 Pure OmniJS
 *
 * V3 Changes:
 * - Removed getUnifiedHelpers() dependency
 * - Direct try/catch instead of safeGet()
 * - Inline error handling instead of formatError()
 * - V3 response format
 *
 * PERFORMANCE: Single-pass iteration through flattenedTasks instead of N passes for N deletions
 * - JXA: Find all tasks in one pass, build map, delete all
 *
 * Accepts array of task IDs and deletes them all in a single operation
 */
export const BULK_DELETE_TASKS_SCRIPT = `
  (() => {
    const startTime = Date.now();
    const app = Application('OmniFocus');
    const doc = app.defaultDocument();
    const taskIds = {{taskIds}};

    if (!Array.isArray(taskIds) || taskIds.length === 0) {
      return JSON.stringify({
        ok: true,
        v: '3',
        data: {
          deleted: [],
          errors: [],
          message: 'No task IDs provided'
        },
        query_time_ms: Date.now() - startTime
      });
    }

    try {
      // Step 1: Build a map of taskId -> task in a single pass through flattenedTasks
      // This is the key optimization - we iterate once, not N times
      const taskMap = {};
      const allTasks = doc.flattenedTasks();

      for (let i = 0; i < allTasks.length; i++) {
        try {
          const task = allTasks[i];
          const taskId = task.id();

          // Check if this task ID is in our deletion list
          if (taskId && taskIds.includes(taskId)) {
            taskMap[taskId] = task;
          }
        } catch (e) {
          // Skip tasks that can't be accessed
        }
      }

      // Step 2: Delete all found tasks and track results
      const deleted = [];
      const errors = [];

      for (const taskId of taskIds) {
        const task = taskMap[taskId];

        if (!task) {
          errors.push({
            taskId: taskId,
            error: 'Task not found'
          });
          continue;
        }

        try {
          let taskName = 'Unknown';
          try {
            taskName = task.name();
          } catch (e) {}

          app.delete(task);

          deleted.push({
            id: taskId,
            name: taskName
          });
        } catch (deleteError) {
          errors.push({
            taskId: taskId,
            error: deleteError instanceof Error ? deleteError.message : String(deleteError)
          });
        }
      }

      return JSON.stringify({
        ok: true,
        v: '3',
        data: {
          deleted: deleted,
          errors: errors,
          message: \`Deleted \${deleted.length} of \${taskIds.length} tasks\`
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
          operation: 'bulk_delete_tasks'
        }
      });
    }
  })();
`;
