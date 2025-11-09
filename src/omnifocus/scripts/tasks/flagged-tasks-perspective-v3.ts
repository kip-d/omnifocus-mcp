/**
 * Ultra-fast flagged tasks using the built-in Flagged perspective - V3 Pure OmniJS
 *
 * V3 Changes:
 * - Removed console.log statements (replaced with comments)
 * - V3 response format
 * - No helpers needed (already lean!)
 *
 * This should be available to all OmniFocus users by default
 */

export const FLAGGED_TASKS_PERSPECTIVE_SCRIPT = `
  (() => {
    const app = Application('OmniFocus');
    const doc = app.defaultDocument();
    const limit = {{limit}};
    const includeCompleted = {{includeCompleted}};
    const includeDetails = {{includeDetails}};

    try {
      const queryStartTime = Date.now();

      // Get the built-in Flagged perspective
      // This perspective is pre-filtered by OmniFocus, so it's MUCH faster
      let flaggedTasks = [];

      try {
        // Access the Flagged perspective's content directly
        const windows = app.documentWindows();
        if (windows.length > 0) {
          const window = windows[0];

          // Try to get the flagged perspective
          const perspectives = doc.perspectives();
          let flaggedPerspective = null;

          for (let i = 0; i < perspectives.length; i++) {
            if (perspectives[i].name() === 'Flagged') {
              flaggedPerspective = perspectives[i];
              break;
            }
          }

          if (flaggedPerspective) {
            // Apply the perspective to get its filtered content
            window.perspective = flaggedPerspective;

            // Now get the content trees which are already filtered
            const trees = window.content.trees();

            // Extract tasks from the trees
            for (let i = 0; i < trees.length && flaggedTasks.length < limit; i++) {
              const tree = trees[i];
              try {
                const value = tree.value();
                if (value && value.constructor.name === 'Task') {
                  // Skip completed if not including them
                  if (!includeCompleted && value.completed()) continue;

                  flaggedTasks.push(value);
                }
              } catch (e) {}
            }
          }
        }
      } catch (perspectiveError) {
        // Perspective access failed, will use fallback
      }

      // If perspective method failed, fall back to direct property check
      // But do it more efficiently by checking flagged FIRST
      if (flaggedTasks.length === 0) {
        // Using fallback method for flagged tasks
        const allTasks = doc.flattenedTasks();

        for (let i = 0; i < allTasks.length && flaggedTasks.length < limit; i++) {
          const task = allTasks[i];
          try {
            // Check flagged FIRST (most selective)
            if (!task.flagged()) continue;

            // Then check completed
            if (!includeCompleted && task.completed()) continue;

            flaggedTasks.push(task);
          } catch (e) {}
        }
      }

      // Process the flagged tasks into result format
      const results = [];

      for (let i = 0; i < flaggedTasks.length && results.length < limit; i++) {
        const task = flaggedTasks[i];

        try {
          const project = task.containingProject();

          const taskData = {
            id: task.id(),
            name: task.name(),
            flagged: true,
            completed: task.completed()
          };

          if (includeDetails) {
            taskData.note = task.note() || '';
            taskData.dueDate = task.dueDate() ? task.dueDate().toISOString() : null;
            taskData.deferDate = task.deferDate() ? task.deferDate().toISOString() : null;
            taskData.estimatedMinutes = task.estimatedMinutes() || null;
            taskData.project = project ? project.name() : null;
            taskData.projectId = project ? project.id() : null;

            // Get tags
            try {
              const tags = task.tags();
              taskData.tags = tags ? tags.map(t => t.name()) : [];
            } catch (e) {
              taskData.tags = [];
            }
          } else {
            taskData.project = project ? project.name() : null;
            taskData.projectId = project ? project.id() : null;
          }

          results.push(taskData);
        } catch (e) {
          // Error processing task, skip it
        }
      }

      const queryEndTime = Date.now();

      return JSON.stringify({
        ok: true,
        v: '3',
        data: {
          tasks: results,
          summary: {
            total: results.length,
            query_time_ms: queryEndTime - queryStartTime,
            query_method: 'perspective_flagged'
          }
        },
        query_time_ms: queryEndTime - queryStartTime
      });

    } catch (error) {
      return JSON.stringify({
        ok: false,
        v: '3',
        error: {
          message: error.message || String(error),
          stack: error.stack,
          operation: 'flagged_tasks_perspective'
        }
      });
    }
  })();
`;
