import { getRecurrenceApplyHelpers, getValidationHelpers, ERROR_HANDLING } from '../shared/helpers.js';
import { BRIDGE_HELPERS } from '../shared/bridge-helpers.js';

/**
 * Script to create a new task in OmniFocus
 * OPTIMIZED: Uses minimal recurrence apply helpers (+ validation + bridge + error handling) to keep script size small.
 */
export const CREATE_TASK_SCRIPT = `
  ${getRecurrenceApplyHelpers()}
  ${getValidationHelpers()}
  ${BRIDGE_HELPERS}
  ${ERROR_HANDLING}
  
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
      
      // Get the created task ID
      const taskId = task.id();
      
      // Apply tags via consolidated bridge helper if provided
      let tagResult = null;
      if (taskData.tags && taskData.tags.length > 0) {
        try {
          const res = setTagsViaBridge(taskId, taskData.tags, app);
          // Normalize to prior shape for downstream response
          if (res && res.success) {
            tagResult = { success: true, tagsAdded: res.tags || taskData.tags, tagsCreated: [], totalTags: (res.tags || taskData.tags).length };
          } else {
            tagResult = { success: false, error: res && res.error ? res.error : 'bridge_failed' };
          }
          
          if (tagResult.success) {
            console.log('Successfully added ' + tagResult.tagsAdded.length + ' tags to task');
            if (tagResult.tagsCreated.length > 0) {
              console.log('Created new tags:', tagResult.tagsCreated.join(', '));
            }
          } else {
            console.log('Warning: Failed to add tags:', tagResult.error);
            tagResult = null; // Don't include failed result in response
          }
          
        } catch (tagError) {
          console.log('Warning: Error adding tags via bridge:', tagError.message);
          // Continue without tags rather than failing task creation
        }
      }
      
      // Get the complete task data via bridge to ensure we see what was actually created
      // This is CRITICAL - we must read via bridge after writing via bridge
      let finalTaskData = null;
      try {
        // Safely embed the identifier to avoid quoting issues
        const escapedTaskId = JSON.stringify(taskId);
        const getTaskScript = [
          '(() => {',
          '  const task = Task.byIdentifier(' + escapedTaskId + ');',
          '  if (!task) return JSON.stringify({error: "Task not found after creation"});',
          '  ',
          '  return JSON.stringify({',
          '    id: task.id.primaryKey,',
          '    name: task.name,',
          '    note: task.note || "",',
          '    flagged: task.flagged,',
          '    completed: task.completed,',
          '    dueDate: task.dueDate ? task.dueDate.toISOString() : null,',
          '    deferDate: task.deferDate ? task.deferDate.toISOString() : null,',
          '    estimatedMinutes: task.estimatedMinutes || null,',
          '    tags: task.tags.map(t => t.name),',
          '    project: task.containingProject ? task.containingProject.name : null,',
          '    projectId: task.containingProject ? task.containingProject.id.primaryKey : null,',
          '    inInbox: task.inInbox,',
          '    hasRepeatRule: task.repetitionRule !== null',
          '  });',
          '})()'
        ].join('');
        
        const taskDataJson = app.evaluateJavascript(getTaskScript);
        finalTaskData = JSON.parse(taskDataJson);
      } catch (e) {
        console.log('Warning: Could not get final task data via bridge:', e.message);
      }
      
      // Build response with actual task data
      const response = finalTaskData && !finalTaskData.error ? {
        taskId: finalTaskData.id,
        name: finalTaskData.name,
        note: finalTaskData.note,
        flagged: finalTaskData.flagged,
        dueDate: finalTaskData.dueDate,
        deferDate: finalTaskData.deferDate,
        estimatedMinutes: finalTaskData.estimatedMinutes,
        tags: finalTaskData.tags,
        project: finalTaskData.project,
        projectId: finalTaskData.projectId,
        inInbox: finalTaskData.inInbox,
        created: true
      } : {
        // Fallback to basic response if bridge read fails
        taskId: taskId,
        name: task.name(),
        created: true,
        tags: tagResult && tagResult.success ? tagResult.tagsAdded : [],
        warning: 'Could not verify final task state'
      };
      
      // Add repeat rule info if it was applied
      if (taskData.repeatRule && finalTaskData && finalTaskData.hasRepeatRule) {
        response.repeatRule = {
          applied: true,
          unit: taskData.repeatRule.unit,
          steps: taskData.repeatRule.steps,
          method: taskData.repeatRule.method || 'fixed'
        };
      }
      
      return JSON.stringify(response);
      
    } catch (error) {
      return formatError(error, 'create_task');
    }
  })();
`;
