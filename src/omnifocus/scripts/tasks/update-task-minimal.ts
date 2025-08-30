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
      
      // Handle repeat rule updates
      if (updates.clearRepeatRule) {
        // Clear via bridge for consistency
        const clearScript = '(() => { const t = Task.byIdentifier("' + taskId + '"); if (t) { t.repetitionRule = null; return "cleared"; } return "not_found"; })()';
        const clearResult = app.evaluateJavascript(clearScript);
        if (clearResult === "not_found") {
          return JSON.stringify({
            error: true,
            message: "Task not found when clearing repeat rule"
          });
        }
      } else if (updates.repeatRule) {
        try {
          const rule = updates.repeatRule;
          
          // Build proper OmniJS script with correct API
          let ruleScript = [
            '(() => {',
            '  const task = Task.byIdentifier("' + taskId + '");',
            '  if (!task) return JSON.stringify({error: "Task not found"});',
            '  ',
            '  try {',
            '    // Build the repetition rule with correct API',
            '    let ruleString = "";',
            '    let method = Task.RepetitionMethod.Fixed;',
            '    '
          ];
          
          // Build RRULE string based on parameters
          if (rule.weekdays && rule.weekdays.length > 0) {
            // Weekly with specific days
            const dayMap = {
              'sunday': 'SU',
              'monday': 'MO',
              'tuesday': 'TU',
              'wednesday': 'WE',
              'thursday': 'TH',
              'friday': 'FR',
              'saturday': 'SA'
            };
            const days = rule.weekdays.map(d => dayMap[d.toLowerCase()]).filter(d => d).join(',');
            ruleScript.push('    ruleString = "FREQ=WEEKLY;INTERVAL=' + (rule.steps || 1) + ';BYDAY=' + days + '";');
          } else {
            // Simple recurrence
            const freqMap = {
              'day': 'DAILY',
              'week': 'WEEKLY', 
              'month': 'MONTHLY',
              'year': 'YEARLY'
            };
            const freq = freqMap[rule.unit] || 'DAILY';
            ruleScript.push('    ruleString = "FREQ=' + freq + ';INTERVAL=' + (rule.steps || 1) + '";');
          }
          
          // Set the method
          if (rule.method === 'start-after-completion') {
            ruleScript.push('    method = Task.RepetitionMethod.DeferUntilDate;');
          } else if (rule.method === 'due-after-completion') {
            ruleScript.push('    method = Task.RepetitionMethod.DueDate;');
          } else {
            ruleScript.push('    method = Task.RepetitionMethod.Fixed;');
          }
          
          ruleScript.push(
            '    // Create and apply the repetition rule',
            '    const repetitionRule = new Task.RepetitionRule(ruleString, method);',
            '    task.repetitionRule = repetitionRule;',
            '    ',
            '    return JSON.stringify({',
            '      success: true,',
            '      ruleString: ruleString,',
            '      method: method.name',
            '    });',
            '  } catch (e) {',
            '    return JSON.stringify({error: "Failed to set repeat rule: " + e.message});',
            '  }',
            '})()'
          );
          
          const result = app.evaluateJavascript(ruleScript.join('\n'));
          const parsed = JSON.parse(result);
          
          if (parsed.error) {
            return JSON.stringify({
              error: true,
              message: parsed.error
            });
          }
          
          console.log('Successfully set repeat rule:', parsed.ruleString);
        } catch (e) {
          return JSON.stringify({
            error: true,
            message: "Failed to update repeat rule: " + e.message
          });
        }
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
            // Validate project exists before attempting move
            const validateScript = 'Project.byIdentifier("' + updates.projectId + '") ? "exists" : "not_found"';
            const validation = app.evaluateJavascript(validateScript);
            
            if (validation === "not_found") {
              // Project doesn't exist - this is an error!
              return JSON.stringify({
                error: true,
                message: "Project not found: " + updates.projectId + ". Please provide a valid project ID."
              });
            }
            
            // Project exists, proceed with move
            const moveScript = 'var t=Task.byIdentifier("' + taskId + '");var p=Project.byIdentifier("' + updates.projectId + '");moveTasks([t],p.beginning);"ok"';
            const result = app.evaluateJavascript(moveScript);
            
            if (result !== "ok") {
              // Move failed even though project exists
              return JSON.stringify({
                error: true,
                message: "Failed to move task to project",
                details: "Project exists but move operation failed"
              });
            }
          }
        } catch (e) {
          // Don't silently ignore - report the error
          return JSON.stringify({
            error: true,
            message: "Error updating project: " + e.message
          });
        }
      }
      
      // Tag updates using evaluateJavascript
      if (updates.tags !== undefined && Array.isArray(updates.tags)) {
        try {
          // Use the same approach as create-task which we know works
          const tagScript = [
            '(() => {',
            '  const task = Task.byIdentifier("' + taskId + '");',
            '  if (!task) return "err";',
            '  ',
            '  // Clear existing tags',
            '  task.clearTags();',
            '  ',
            '  // Add new tags',
            '  for (const name of ' + JSON.stringify(updates.tags) + ') {',
            '    if (typeof name !== "string" || name.trim() === "") continue;',
            '    let tag = flattenedTags.byName(name);',
            '    if (!tag) {',
            '      tag = new Tag(name);',
            '    }',
            '    task.addTag(tag);',
            '  }',
            '  return "ok";',
            '})()'
          ].join('');
          
          const result = app.evaluateJavascript(tagScript);
          
          if (result === "err") {
            // Fallback: Try JXA method
            const allTags = doc.tags();
            const tagObjects = [];
            
            for (const tagName of updates.tags) {
              let found = false;
              for (let i = 0; i < allTags.length; i++) {
                if (allTags[i].name() === tagName) {
                  tagObjects.push(allTags[i]);
                  found = true;
                  break;
                }
              }
              if (!found) {
                // Create new tag if it doesn't exist
                const newTag = doc.Tag({name: tagName});
                tagObjects.push(newTag);
              }
            }
            
            // Clear existing tags and add new ones
            task.tags = [];
            for (const tag of tagObjects) {
              task.tags.push(tag);
            }
          }
        } catch (e) {
          // Tags update failed, continue
        }
      }
      
      // Get ALL task data via bridge to ensure consistency
      // This is the ONLY way to ensure we see the actual current state
      let finalTaskData = null;
      try {
        const getTaskScript = [
          '(() => {',
          '  const task = Task.byIdentifier("' + taskId + '");',
          '  if (!task) return JSON.stringify({error: "Task not found"});',
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
        
        if (finalTaskData.error) {
          throw new Error(finalTaskData.error);
        }
        
        return JSON.stringify(finalTaskData);
      } catch (e) {
        // Only use JXA fallback if bridge completely fails
        console.log('Bridge read failed, using JXA fallback:', e.message);
        
        const updatedTask = {
          id: task.id(),
          name: task.name(),
          note: task.note() || '',
          flagged: task.flagged(),
          dueDate: task.dueDate() ? task.dueDate().toISOString() : null,
          deferDate: task.deferDate() ? task.deferDate().toISOString() : null,
          estimatedMinutes: task.estimatedMinutes() || null,
          tags: safeGetTags(task),
          warning: 'Using fallback data - tags may not be visible'
        };
        
        const project = safeGetProject(task);
        if (project) {
          updatedTask.project = project.name;
          updatedTask.projectId = project.id;
        }
        
        return JSON.stringify(updatedTask);
      }
      
    } catch (error) {
      return formatError(error, 'Update task');
    }
  })();
`;
