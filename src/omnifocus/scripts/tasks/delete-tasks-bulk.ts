import { getUnifiedHelpers } from '../shared/helpers.js';

/**
 * Optimized bulk delete script using evaluateJavascript() bridge
 *
 * PERFORMANCE: Single-pass iteration through flattenedTasks instead of N passes for N deletions
 * - JXA: Find all tasks in one pass, build map, delete all
 * - Uses OmniJS bridge for fast task reference lookups
 *
 * Accepts array of task IDs and deletes them all in a single operation
 */
export const BULK_DELETE_TASKS_SCRIPT = `
  ${getUnifiedHelpers()}

  (() => {
    const app = Application('OmniFocus');
    const doc = app.defaultDocument();
    const taskIds = {{taskIds}};

    if (!Array.isArray(taskIds) || taskIds.length === 0) {
      return JSON.stringify({
        success: true,
        deleted: [],
        errors: [],
        message: 'No task IDs provided'
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
          const taskId = safeGet(() => task.id());

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
          const taskName = safeGet(() => task.name());
          app.delete(task);

          deleted.push({
            id: taskId,
            name: taskName || 'Unknown'
          });
        } catch (deleteError) {
          errors.push({
            taskId: taskId,
            error: deleteError instanceof Error ? deleteError.message : String(deleteError)
          });
        }
      }

      return JSON.stringify({
        success: true,
        deleted: deleted,
        errors: errors,
        message: \`Deleted \${deleted.length} of \${taskIds.length} tasks\`
      });

    } catch (error) {
      return formatError(error, 'bulk_delete_tasks');
    }
  })();
`;
