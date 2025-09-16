/**
 * Script to create a new task in OmniFocus
 * BRIDGE VERSION: Uses OmniJS bridge for reliable tag assignment
 */

import { getMinimalHelpers } from '../shared/helpers.js';
import { getMinimalTagBridge } from '../shared/minimal-tag-bridge.js';

export const CREATE_TASK_SCRIPT = `
  ${getMinimalHelpers()}
  ${getMinimalTagBridge()}

  // Minimal error formatting
  function formatError(error, context = '') {
    return JSON.stringify({
      error: true,
      message: error.message || String(error),
      context: context
    });
  }

  // Basic project validation
  function validateProject(projectId, doc) {
    if (!projectId) return { valid: true, project: null };

    const projects = doc.flattenedProjects();
    for (let i = 0; i < projects.length; i++) {
      try {
        if (projects[i].id() === projectId) {
          return { valid: true, project: projects[i] };
        }
      } catch (e) {}
    }

    return {
      valid: false,
      error: 'Project not found: ' + projectId
    };
  }

  (() => {
    const app = Application('OmniFocus');
    const doc = app.defaultDocument();
    const taskData = {{taskData}};

    try {
      // Determine the target container (inbox, project, or parent task)
      let targetContainer = doc.inboxTasks;
      let parentTask = null;

      if (taskData.parentTaskId) {
        // Find parent task in all tasks
        const allTasks = doc.flattenedTasks();
        for (let i = 0; i < allTasks.length; i++) {
          try {
            if (allTasks[i].id() === taskData.parentTaskId) {
              parentTask = allTasks[i];
              targetContainer = parentTask.tasks;
              break;
            }
          } catch (e) {}
        }

        if (!parentTask) {
          return formatError(new Error('Parent task not found: ' + taskData.parentTaskId));
        }
      } else if (taskData.projectId) {
        const validation = validateProject(taskData.projectId, doc);
        if (!validation.valid) {
          return JSON.stringify({ error: true, message: validation.error });
        }
        if (validation.project) {
          targetContainer = validation.project.tasks;
        }
      }

      // Create task with basic properties
      const task = app.Task({
        name: taskData.name,
        note: taskData.note || '',
        flagged: taskData.flagged || false
      });

      // Add to container
      targetContainer.push(task);

      // Set dates if provided
      if (taskData.dueDate) {
        try {
          task.dueDate = new Date(taskData.dueDate);
        } catch (e) {
          // Skip invalid due date - log error details for debugging
          console.log('Invalid due date:', taskData.dueDate, e.message);
        }
      }

      if (taskData.deferDate) {
        try {
          task.deferDate = new Date(taskData.deferDate);
        } catch (e) {
          // Skip invalid defer date - log error details for debugging
          console.log('Invalid defer date:', taskData.deferDate, e.message);
        }
      }

      // Set estimated minutes if provided
      if (taskData.estimatedMinutes && typeof taskData.estimatedMinutes === 'number') {
        task.estimatedMinutes = taskData.estimatedMinutes;
      }

      // Set sequential property if provided (for action groups)
      if (taskData.sequential !== undefined) {
        task.sequential = taskData.sequential;
      }

      // Get the created task ID
      const taskId = task.id();

      // Apply tags using OmniJS bridge for reliable visibility
      let tagResult = null;
      if (taskData.tags && taskData.tags.length > 0) {
        try {
          // Use OmniJS bridge for immediate tag visibility and reliability
          const bridgeResult = bridgeSetTags(app, taskId, taskData.tags);

          if (bridgeResult.success) {
            tagResult = {
              success: true,
              tagsAdded: bridgeResult.tags,
              tagsCreated: [], // Bridge handles tag creation internally
              totalTags: bridgeResult.tags.length,
              verified: bridgeResult.tags.length, // Bridge guarantees visibility
              verifiedTags: bridgeResult.tags,
              method: 'bridge'
            };
            console.log('Successfully applied ' + bridgeResult.tags.length + ' tags via bridge');
          } else {
            console.log('Bridge tag assignment failed:', bridgeResult.error);
            tagResult = {
              success: false,
              error: bridgeResult.error,
              method: 'bridge'
            };
          }

        } catch (tagError) {
          console.log('Warning: Error applying tags via bridge:', tagError.message);
          // Continue without tags rather than failing task creation
          tagResult = {
            success: false,
            error: tagError.message,
            method: 'bridge'
          };
        }
      }

      // Build response with basic task data (bridge version)
      const response = {
        taskId: taskId,
        name: task.name(),
        note: task.note() || '',
        flagged: task.flagged(),
        dueDate: task.dueDate() ? task.dueDate().toISOString() : null,
        deferDate: task.deferDate() ? task.deferDate().toISOString() : null,
        estimatedMinutes: task.estimatedMinutes() || null,
        tags: tagResult && tagResult.success ? tagResult.tagsAdded : [],
        project: task.containingProject() ? task.containingProject().name() : null,
        projectId: task.containingProject() ? task.containingProject().id() : null,
        inInbox: task.inInbox(),
        created: true,
        tagMethod: tagResult ? tagResult.method : 'none'
      };

      return JSON.stringify(response);

    } catch (error) {
      return formatError(error, 'Task creation failed');
    }
  })();
`;