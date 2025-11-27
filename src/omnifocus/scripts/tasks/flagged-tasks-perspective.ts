/**
 * Ultra-fast flagged tasks query
 *
 * OmniJS-first pattern: All logic runs inside evaluateJavascript()
 *
 * Features:
 * - Fast flagged task retrieval using OmniJS
 * - Optional completed task inclusion
 * - Optional detailed task information
 * - Efficient property access (no JXA method call overhead)
 */

export const FLAGGED_TASKS_PERSPECTIVE_SCRIPT = `
  // FLAGGED_TASKS - OmniJS-first pattern
  (() => {
    const app = Application('OmniFocus');

    try {
      const omniJsScript = \`
        (() => {
          const limit = {{limit}};
          const includeCompleted = {{includeCompleted}};
          const includeDetails = {{includeDetails}};

          const queryStartTime = Date.now();
          const results = [];

          // Iterate through all flattened tasks using OmniJS
          flattenedTasks.forEach(task => {
            // Stop if we've reached the limit
            if (results.length >= limit) return;

            // Check flagged FIRST (most selective)
            if (!task.flagged) return;

            // Then check completed
            if (!includeCompleted && task.completed) return;

            // Build task data using OmniJS property access
            const containingProject = task.containingProject;

            const taskData = {
              id: task.id.primaryKey,
              name: task.name,
              flagged: true,
              completed: task.completed
            };

            if (includeDetails) {
              taskData.note = task.note || '';
              taskData.dueDate = task.dueDate ? task.dueDate.toISOString() : null;
              taskData.deferDate = task.deferDate ? task.deferDate.toISOString() : null;
              taskData.estimatedMinutes = task.estimatedMinutes || null;
              taskData.project = containingProject ? containingProject.name : null;
              taskData.projectId = containingProject ? containingProject.id.primaryKey : null;

              // Get tags using OmniJS array
              const tags = task.tags;
              taskData.tags = tags ? tags.map(t => t.name) : [];
            } else {
              taskData.project = containingProject ? containingProject.name : null;
              taskData.projectId = containingProject ? containingProject.id.primaryKey : null;
            }

            results.push(taskData);
          });

          const queryEndTime = Date.now();

          return JSON.stringify({
            tasks: results,
            summary: {
              total: results.length,
              query_time_ms: queryEndTime - queryStartTime,
              query_method: 'omnijs_flagged'
            }
          });
        })()
      \`;

      return app.evaluateJavascript(omniJsScript);
    } catch (error) {
      return JSON.stringify({
        error: true,
        message: "Failed to get flagged tasks: " + (error.message || String(error)),
        operation: 'flagged_tasks'
      });
    }
  })();
`;
