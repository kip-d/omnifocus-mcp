import { getAllHelpers } from '../shared/helpers.js';
import { REPEAT_HELPERS } from '../shared/repeat-helpers.js';

/**
 * Script to create a new task in OmniFocus
 */
export const CREATE_TASK_SCRIPT = `
  ${getAllHelpers()}
  ${REPEAT_HELPERS}
  
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
      
      // Set estimated minutes if provided
      if (taskData.estimatedMinutes && typeof taskData.estimatedMinutes === 'number') {
        task.estimatedMinutes = taskData.estimatedMinutes;
      }
      
      // Set sequential property if provided (for action groups)
      if (taskData.sequential !== undefined) {
        task.sequential = taskData.sequential;
      }
      
      // Set repeat rule if provided (using evaluateJavascript bridge)
      if (taskData.repeatRule) {
        try {
          const ruleData = prepareRepetitionRuleData(taskData.repeatRule);
          if (ruleData && ruleData.needsBridge) {
            // Get the task ID for the bridge
            const taskId = task.id();
            
            // Apply repetition rule via evaluateJavascript bridge
            const success = applyRepetitionRuleViaBridge(taskId, ruleData);
            if (success) {
              console.log('Applied repeat rule to task via bridge:', taskData.repeatRule);
            } else {
              console.log('Warning: Could not apply repeat rule via bridge');
            }
          }
          
          // Apply defer another settings if specified
          applyDeferAnother(task, taskData.repeatRule);
          
        } catch (error) {
          console.log('Warning: Failed to apply repeat rule:', error.message);
          // Continue without repeat rule rather than failing task creation
        }
      }
      
      // Note: Tags cannot be assigned during creation in JXA
      // This is a known limitation of the OmniFocus JXA API
      
      // Get the created task ID
      const taskId = task.id();
      
      return JSON.stringify({
        taskId: taskId,
        name: task.name(),
        created: true,
        note: taskData.tags && taskData.tags.length > 0 
          ? 'Note: Tags cannot be assigned during task creation due to JXA limitations. Use update_task to add tags.'
          : undefined
      });
      
    } catch (error) {
      return formatError(error, 'create_task');
    }
  })();
`;
