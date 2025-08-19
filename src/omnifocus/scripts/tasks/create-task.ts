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
      
      // Get the created task ID
      const taskId = task.id();
      
      // Apply tags via evaluateJavascript bridge if provided
      let tagResult = null;
      if (taskData.tags && taskData.tags.length > 0) {
        try {
          // Use evaluateJavascript to add tags with proper escaping
          const escapedTaskId = JSON.stringify(taskId);
          const escapedTags = JSON.stringify(taskData.tags);
          
          const tagScript = [
            '(() => {',
            '  const task = Task.byIdentifier(' + escapedTaskId + ');',
            '  if (!task) return JSON.stringify({success: false, error: "Task not found"});',
            '  ',
            '  const tagNames = ' + escapedTags + ';',
            '  const addedTags = [];',
            '  const createdTags = [];',
            '  ',
            '  for (const name of tagNames) {',
            '    if (typeof name !== "string" || name.trim() === "") continue;',
            '    ',
            '    let tag = flattenedTags.byName(name);',
            '    if (!tag) {',
            '      tag = new Tag(name);',
            '      createdTags.push(name);',
            '    }',
            '    task.addTag(tag);',
            '    addedTags.push(name);',
            '  }',
            '  ',
            '  return JSON.stringify({',
            '    success: true,',
            '    tagsAdded: addedTags,',
            '    tagsCreated: createdTags,',
            '    totalTags: task.tags.length',
            '  });',
            '})()'
          ].join('');
          
          const tagResultStr = app.evaluateJavascript(tagScript);
          tagResult = JSON.parse(tagResultStr);
          
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
      
      // Build response
      const response = {
        taskId: taskId,
        name: task.name(),
        created: true
      };
      
      // Include tag information if tags were processed
      if (tagResult && tagResult.success) {
        response.tags = tagResult.tagsAdded;
        if (tagResult.tagsCreated.length > 0) {
          response.tagsCreated = tagResult.tagsCreated;
        }
      }
      
      // Include repeat rule information if it was applied
      if (taskData.repeatRule) {
        response.repeatRule = {
          applied: true,
          unit: taskData.repeatRule.unit,
          steps: taskData.repeatRule.steps,
          method: taskData.repeatRule.method || 'fixed'
        };
        if (taskData.repeatRule.weekdays) {
          response.repeatRule.weekdays = taskData.repeatRule.weekdays;
        }
        if (taskData.repeatRule.weekPosition) {
          response.repeatRule.weekPosition = taskData.repeatRule.weekPosition;
        }
        if (taskData.repeatRule.weekday) {
          response.repeatRule.weekday = taskData.repeatRule.weekday;
        }
      }
      
      return JSON.stringify(response);
      
    } catch (error) {
      return formatError(error, 'create_task');
    }
  })();
`;
