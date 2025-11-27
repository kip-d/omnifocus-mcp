/**
 * Optimized bulk complete script using OmniJS-first pattern
 *
 * Architecture: OmniJS-first (2025+)
 * - Minimal JXA wrapper for osascript execution
 * - All logic in OmniJS via evaluateJavascript()
 *
 * PERFORMANCE: Uses Task.byIdentifier() for direct lookup - no iteration needed
 */

export interface BulkCompleteParams {
  taskIds: string[];
  completionDate?: string | null;
}

export function buildBulkCompleteTasksScript(params: BulkCompleteParams): string {
  const serializedParams = JSON.stringify({
    taskIds: params.taskIds,
    completionDate: params.completionDate || null,
  });

  return `
    (() => {
      const app = Application('OmniFocus');

      try {
        const omniJsScript = \`
          (() => {
            const params = ${serializedParams};
            const taskIds = params.taskIds;
            const completionDateStr = params.completionDate;
            const completionDate = completionDateStr ? new Date(completionDateStr) : new Date();

            if (!Array.isArray(taskIds) || taskIds.length === 0) {
              return JSON.stringify({
                success: true,
                completed: [],
                errors: [],
                message: 'No task IDs provided'
              });
            }

            const completed = [];
            const errors = [];

            // Process each task using direct lookup (no iteration needed)
            taskIds.forEach(taskId => {
              try {
                const task = Task.byIdentifier(taskId);

                if (!task) {
                  errors.push({
                    taskId: taskId,
                    error: 'Task not found'
                  });
                  return;
                }

                const taskName = task.name;

                // Mark task as completed
                task.markComplete(completionDate);

                // Get the actual completion date (might differ for recurring tasks)
                let completedDate = null;
                try {
                  if (task.completionDate) {
                    completedDate = task.completionDate.toISOString();
                  }
                } catch (e) {
                  // If this was a recurring task, the original might be gone
                  completedDate = completionDate.toISOString();
                }

                completed.push({
                  id: taskId,
                  name: taskName || 'Unknown',
                  completedDate: completedDate || completionDate.toISOString()
                });
              } catch (completeError) {
                errors.push({
                  taskId: taskId,
                  error: completeError.message || String(completeError)
                });
              }
            });

            return JSON.stringify({
              success: true,
              completed: completed,
              errors: errors,
              message: 'Completed ' + completed.length + ' of ' + taskIds.length + ' tasks'
            });
          })()
        \`;

        const result = app.evaluateJavascript(omniJsScript);
        return result;

      } catch (error) {
        return JSON.stringify({
          success: false,
          error: error.message || String(error),
          context: 'bulk_complete_tasks'
        });
      }
    })()
  `;
}

// Legacy export for backwards compatibility
export const BULK_COMPLETE_TASKS_SCRIPT = buildBulkCompleteTasksScript({
  taskIds: [],
  completionDate: null,
});
