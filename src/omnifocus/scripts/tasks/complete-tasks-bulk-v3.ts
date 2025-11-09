/**
 * Optimized bulk complete script - V3 Pure OmniJS
 *
 * V3 Changes:
 * - Removed getUnifiedHelpers() dependency
 * - Direct try/catch instead of safeGet()
 * - Inline error handling instead of formatError()
 * - V3 response format
 *
 * PERFORMANCE: Single-pass iteration through flattenedTasks instead of N passes for N completions
 * - JXA: Find all tasks in one pass, build map, complete all
 *
 * Accepts array of task IDs and completes them all in a single operation
 */
export const BULK_COMPLETE_TASKS_SCRIPT = `
  (() => {
    const startTime = Date.now();
    const app = Application('OmniFocus');
    const doc = app.defaultDocument();
    const taskIds = {{taskIds}};
    const completionDate = {{completionDate}} ? new Date({{completionDate}}) : new Date();

    if (!Array.isArray(taskIds) || taskIds.length === 0) {
      return JSON.stringify({
        ok: true,
        v: '3',
        data: {
          completed: [],
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
          let taskName = 'Unknown';
          try {
            taskName = task.name();
          } catch (e) {}

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
            name: taskName,
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
        ok: true,
        v: '3',
        data: {
          completed: completed,
          errors: errors,
          message: \`Completed \${completed.length} of \${taskIds.length} tasks\`
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
          operation: 'bulk_complete_tasks'
        }
      });
    }
  })();
`;
