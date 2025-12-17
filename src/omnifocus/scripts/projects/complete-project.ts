/**
 * Script to complete a project in OmniFocus
 *
 * OmniJS-first pattern: All logic runs inside evaluateJavascript()
 *
 * Features:
 * - Mark project as done/completed
 * - Optionally complete all remaining tasks
 * - Uses OmniJS markComplete() method
 */
export const COMPLETE_PROJECT_SCRIPT = `
  // COMPLETE_PROJECT - OmniJS-first pattern
  (() => {
    const app = Application('OmniFocus');

    try {
      const omniJsScript = \`
        (() => {
          const projectId = {{projectId}};
          const completeAllTasks = {{completeAllTasks}};

          // Find the project by ID using OmniJS
          const targetProject = Project.byIdentifier(projectId);

          if (!targetProject) {
            return JSON.stringify({
              error: true,
              message: "Project with ID '" + projectId + "' not found. Use 'list_projects' tool to see available projects."
            });
          }

          // Count and optionally complete tasks
          const tasks = targetProject.flattenedTasks;
          let incompleteCount = 0;
          let completedCount = 0;

          for (const task of tasks) {
            if (!task.completed) {
              incompleteCount++;
            }
          }

          // Complete all tasks if requested
          if (completeAllTasks && incompleteCount > 0) {
            for (const task of tasks) {
              if (!task.completed) {
                task.markComplete();
                completedCount++;
              }
            }
          }

          // Complete the project using OmniJS markComplete()
          targetProject.markComplete();

          // Get completion date (may be auto-set by markComplete)
          const completedAt = targetProject.completionDate
            ? targetProject.completionDate.toISOString()
            : new Date().toISOString();

          return JSON.stringify({
            success: true,
            project: {
              id: targetProject.id.primaryKey,
              name: targetProject.name,
              completedAt: completedAt
            },
            tasksCompleted: completedCount,
            message: "Project '" + targetProject.name + "' completed" +
                      (completedCount > 0 ? " with " + completedCount + " tasks" : "")
          });
        })()
      \`;

      return app.evaluateJavascript(omniJsScript);
    } catch (error) {
      return JSON.stringify({
        error: true,
        message: error.message || String(error),
        operation: 'complete_project'
      });
    }
  })();
`;
