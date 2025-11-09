import { getUnifiedHelpers } from '../shared/helpers.js';

/**
 * Optimized bulk complete script using single-pass pattern
 *
 * PERFORMANCE: Single-pass iteration through flattenedTasks instead of N passes for N completions
 * - JXA: Find all tasks in one pass, build map, complete all
 * - Mirrors BULK_DELETE_TASKS_SCRIPT for consistency
 *
 * Accepts array of task IDs and completes them all in a single operation
 */
export const BULK_COMPLETE_TASKS_SCRIPT = `
  ${getUnifiedHelpers()}

  (() => {
    const app = Application('OmniFocus');
    const doc = app.defaultDocument();
    const taskIds = {{taskIds}};
    const completionDate = {{completionDate}} ? new Date({{completionDate}}) : new Date();

    if (!Array.isArray(taskIds) || taskIds.length === 0) {
      return JSON.stringify({
        success: true,
        completed: [],
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

          // Check if this task ID is in our completion list
          if (taskId && taskIds.includes(taskId)) {
            taskMap[taskId] = task;
          }
        } catch (e) {
          // Skip tasks that can't be accessed
        }
      }

      // Step 2: Complete all found tasks and track results
      const completed = [];
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

          // Mark task as completed
          if (completionDate) {
            task.markComplete({date: completionDate});
          } else {
            task.markComplete();
          }

          // Get the actual completion date (might differ for recurring tasks)
          let completedDate = null;
          try {
            const taskCompletionDate = task.completionDate();
            if (taskCompletionDate) {
              completedDate = taskCompletionDate.toISOString();
            }
          } catch (e) {
            // If this was a recurring task, the original might be gone
            completedDate = completionDate ? completionDate.toISOString() : new Date().toISOString();
          }

          completed.push({
            id: taskId,
            name: taskName || 'Unknown',
            completedDate: completedDate || new Date().toISOString()
          });
        } catch (completeError) {
          errors.push({
            taskId: taskId,
            error: completeError instanceof Error ? completeError.message : String(completeError)
          });
        }
      }

      return JSON.stringify({
        success: true,
        completed: completed,
        errors: errors,
        message: \`Completed \${completed.length} of \${taskIds.length} tasks\`
      });

    } catch (error) {
      return formatError(error, 'bulk_complete_tasks');
    }
  })();
`;
