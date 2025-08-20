/**
 * Minimal update task script to avoid script size limits
 * Only includes essential helpers to keep script under size limits
 */

// Minimal helper functions - only what's absolutely needed for update
const MINIMAL_HELPERS = `
  function safeGet(getter, defaultValue = null) {
    try {
      const result = getter();
      return result !== null && result !== undefined ? result : defaultValue;
    } catch (e) {
      return defaultValue;
    }
  }
  
  function safeGetProject(task) {
    try {
      const project = task.containingProject();
      if (project) {
        return {
          name: safeGet(() => project.name()),
          id: safeGet(() => project.id())
        };
      }
      return null;
    } catch (e) {
      return null;
    }
  }
  
  function safeGetTags(task) {
    try {
      const tags = task.tags();
      if (!tags) return [];
      const tagNames = [];
      for (let i = 0; i < tags.length; i++) {
        const tagName = safeGet(() => tags[i].name());
        if (tagName) {
          tagNames.push(tagName);
        }
      }
      return tagNames;
    } catch (e) {
      return [];
    }
  }
  
  function formatError(error, context = '') {
    return JSON.stringify({
      error: true,
      message: error.message || String(error),
      context: context
    });
  }
`;

export const UPDATE_TASK_MINIMAL_SCRIPT = `
  ${MINIMAL_HELPERS}
  
  (() => {
    const taskId = {{taskId}};
    const updates = {{updates}};
    
    try {
      const app = Application('OmniFocus');
      const doc = app.defaultDocument();
      
      // Find task - use iteration since whose() can fail
      let task = null;
      const tasks = doc.flattenedTasks();
      for (let i = 0; i < tasks.length; i++) {
        if (safeGet(() => tasks[i].id()) === taskId) {
          task = tasks[i];
          break;
        }
      }
      
      if (!task) {
        return JSON.stringify({ 
          error: true, 
          message: "Task not found: " + taskId
        });
      }
      
      // Basic property updates
      if (updates.name !== undefined) {
        task.name = updates.name;
      }
      if (updates.note !== undefined) {
        task.note = updates.note || '';
      }
      if (updates.flagged !== undefined) {
        task.flagged = updates.flagged;
      }
      if (updates.dueDate !== undefined) {
        if (updates.dueDate === null) {
          task.dueDate = null;
        } else if (updates.dueDate) {
          task.dueDate = new Date(updates.dueDate);
        }
      }
      if (updates.deferDate !== undefined) {
        if (updates.deferDate === null) {
          task.deferDate = null;
        } else if (updates.deferDate) {
          task.deferDate = new Date(updates.deferDate);
        }
      }
      if (updates.estimatedMinutes !== undefined) {
        task.estimatedMinutes = updates.estimatedMinutes;
      }
      if (updates.sequential !== undefined) {
        task.sequential = updates.sequential;
      }
      
      // Project move using evaluateJavascript bridge
      if (updates.projectId !== undefined) {
        try {
          // Handle inbox move - check for null, empty string, or "null" string
          if (updates.projectId === null || updates.projectId === "" || updates.projectId === "null") {
            // Use moveTasks to move to inbox (more reliable than assignedContainer)
            const moveScript = 'var t=Task.byIdentifier("' + taskId + '");if(t){moveTasks([t],inbox.beginning);"moved"}else{"err"}';
            const result = app.evaluateJavascript(moveScript);
            if (result === "err") {
              // Fallback to JXA method
              try {
                doc.moveTasks([task], {to: doc.inboxTasks.beginning});
              } catch (e2) {
                // Last resort: direct assignment
                task.assignedContainer = doc.inboxTasks;
              }
            }
          } else {
            // Move to specific project
            const moveScript = 'var t=Task.byIdentifier("' + taskId + '");var p=Project.byIdentifier("' + updates.projectId + '");if(t&&p){moveTasks([t],p.beginning);"ok"}else{"err"}';
            const result = app.evaluateJavascript(moveScript);
            if (result === "err") {
              // Fallback to direct assignment
              const projects = doc.flattenedProjects();
              for (let i = 0; i < projects.length; i++) {
                if (projects[i].id() === updates.projectId) {
                  task.assignedContainer = projects[i];
                  break;
                }
              }
            }
          }
        } catch (e) {
          // Ignore project move errors, continue with other updates
        }
      }
      
      // Tag updates using evaluateJavascript
      if (updates.tags !== undefined && Array.isArray(updates.tags)) {
        try {
          const tagScript = 'var t=Task.byIdentifier("' + taskId + '");t.clearTags();' + 
            updates.tags.map(tag => 't.addTag(Tag.byIdentifier("' + tag + '")||Tag.byName("' + tag + '"))').join(';') + 
            ';"ok"';
          app.evaluateJavascript(tagScript);
        } catch (e) {
          // Tags update failed, continue
        }
      }
      
      // Return updated task
      const updatedTask = {
        id: task.id(),
        name: task.name(),
        note: task.note() || '',
        flagged: task.flagged(),
        dueDate: task.dueDate() ? task.dueDate().toISOString() : null,
        deferDate: task.deferDate() ? task.deferDate().toISOString() : null,
        estimatedMinutes: task.estimatedMinutes() || null,
        tags: safeGetTags(task)
      };
      
      const project = safeGetProject(task);
      if (project) {
        updatedTask.project = project.name;
        updatedTask.projectId = project.id;
      }
      
      return JSON.stringify(updatedTask);
      
    } catch (error) {
      return formatError(error, 'Update task');
    }
  })();
`;