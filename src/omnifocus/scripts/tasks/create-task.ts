/**
 * Script to create a new task in OmniFocus
 *
 * SIMPLIFIED ARCHITECTURE (v2.2+): Uses unified helper bundle
 * All helpers included once - no composition complexity
 */

import { getUnifiedHelpers } from '../shared/helpers.js';
import { getMinimalTagBridge } from '../shared/minimal-tag-bridge.js';

export const CREATE_TASK_SCRIPT = `
  ${getUnifiedHelpers()}
  ${getMinimalTagBridge()}

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
          if (allTasks[i].id() === taskData.parentTaskId) {
            parentTask = allTasks[i];
            break;
          }
        }
        
        if (!parentTask) {
          return JSON.stringify({ 
            error: true, 
            message: "Parent task with ID '" + taskData.parentTaskId + "' not found" 
          });
        }
        
        // Use parent task's children as target container
        targetContainer = parentTask.tasks;
        
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

      if (taskData.plannedDate) {
        try {
          task.plannedDate = new Date(taskData.plannedDate);
        } catch (e) {
          // Skip invalid planned date - log error details for debugging
          console.log('Invalid planned date:', taskData.plannedDate, e.message);
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

      // Apply repeat rule if provided
      if (taskData.repeatRule) {
        try {
          const ruleData = prepareRepetitionRuleData(taskData.repeatRule);
          if (ruleData && ruleData.needsBridge) {
            const success = applyRepetitionRuleViaBridge(taskId, ruleData);
            if (!success) {
              console.log('Warning: Could not apply repeat rule via bridge');
            }
          }

          applyDeferAnother(task, taskData.repeatRule);
        } catch (ruleError) {
          console.log('Warning: Failed to apply repeat rule:', ruleError.message);
        }
      }
      
      // Apply tags using OmniJS bridge for reliable visibility
      let tagResult = null;
      if (taskData.tags && taskData.tags.length > 0) {
        try {
          // Use bridge for tag assignment (required for OmniFocus 4.x)
          const bridgeResult = bridgeSetTags(app, taskId, taskData.tags);

          if (bridgeResult && bridgeResult.success) {
            tagResult = {
              success: true,
              tagsAdded: bridgeResult.tags || [],
              tagsCreated: [],
              totalTags: bridgeResult.tags ? bridgeResult.tags.length : 0,
              verified: bridgeResult.tags ? bridgeResult.tags.length : 0,
              verifiedTags: bridgeResult.tags || []
            };
            console.log('Successfully added ' + tagResult.totalTags + ' tags via bridge');
          } else {
            console.log('Warning: Bridge tag assignment failed:', bridgeResult ? bridgeResult.error : 'unknown error');
            tagResult = {
              success: false,
              tagsAdded: [],
              tagsCreated: [],
              totalTags: 0,
              verified: 0,
              verifiedTags: []
            };
          }

        } catch (tagError) {
          console.log('Warning: Error adding tags:', tagError.message);
          // Continue without tags rather than failing task creation
          tagResult = {
            success: false,
            tagsAdded: [],
            tagsCreated: [],
            totalTags: 0,
            verified: 0,
            verifiedTags: []
          };
        }
      }
      
      // Build response with basic task data (minimal version)
      const response = {
        taskId: taskId,
        name: task.name(),
        note: task.note() || '',
        flagged: task.flagged(),
        dueDate: task.dueDate() ? task.dueDate().toISOString() : null,
        deferDate: task.deferDate() ? task.deferDate().toISOString() : null,
        estimatedMinutes: task.estimatedMinutes() || null,
        tags: tagResult && tagResult.success ? tagResult.verifiedTags : [],
        project: task.containingProject() ? task.containingProject().name() : null,
        projectId: task.containingProject() ? task.containingProject().id() : null,
        inInbox: task.inInbox(),
        created: true
      };
      
      return JSON.stringify(response);
      
    } catch (error) {
      return formatError(error, 'create_task');
    }
  })();
`;
