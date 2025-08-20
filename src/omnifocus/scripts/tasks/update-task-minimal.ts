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
        task.repetitionRule = null;
      } else if (updates.repeatRule) {
        try {
          // Use evaluateJavascript for repeat rule updates (more reliable)
          const rule = updates.repeatRule;
          let ruleScript = 'var t=Task.byIdentifier("' + taskId + '");';
          
          // Build the recurrence rule based on type
          if (rule.weekdays && rule.weekdays.length > 0) {
            // Weekly with specific days
            const dayMap = {
              'sunday': 'Day.Sunday',
              'monday': 'Day.Monday', 
              'tuesday': 'Day.Tuesday',
              'wednesday': 'Day.Wednesday',
              'thursday': 'Day.Thursday',
              'friday': 'Day.Friday',
              'saturday': 'Day.Saturday'
            };
            const days = rule.weekdays.map(d => dayMap[d.toLowerCase()]).join(',');
            ruleScript += 'var r=new RecurrenceRule();r.frequency=RecurrenceFrequency.Weekly;r.interval=' + (rule.steps || 1) + ';r.daysOfWeek=[' + days + '];';
          } else {
            // Simple recurrence
            const freqMap = {
              'day': 'Daily',
              'week': 'Weekly',
              'month': 'Monthly',
              'year': 'Yearly'
            };
            const freq = freqMap[rule.unit] || 'Daily';
            ruleScript += 'var r=new RecurrenceRule();r.frequency=RecurrenceFrequency.' + freq + ';r.interval=' + (rule.steps || 1) + ';';
          }
          
          // Set the method
          if (rule.method === 'start-after-completion') {
            ruleScript += 'r.method=RepetitionMethod.DeferUntilDate;';
          } else if (rule.method === 'due-after-completion') {
            ruleScript += 'r.method=RepetitionMethod.DueAfterCompletion;';
          } else {
            ruleScript += 'r.method=RepetitionMethod.Fixed;';
          }
          
          ruleScript += 't.repetitionRule=r;"ok"';
          
          const result = app.evaluateJavascript(ruleScript);
          if (result !== "ok") {
            // Fallback to direct assignment (less reliable)
            task.repetitionRule = {
              recurrenceString: 'FREQ=' + (rule.unit || 'DAILY').toUpperCase() + ';INTERVAL=' + (rule.steps || 1)
            };
          }
        } catch (e) {
          // Repeat rule update failed, continue
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