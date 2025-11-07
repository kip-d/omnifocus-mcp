import { getUnifiedHelpers } from '../shared/helpers.js';
import { getMinimalTagBridge } from '../shared/minimal-tag-bridge.js';
import { REPEAT_HELPERS } from '../shared/repeat-helpers.js';

/**
 * Script to update an existing task in OmniFocus
 *
 * SIMPLIFIED ARCHITECTURE (v2.2+): Uses unified helper bundle
 * All helpers included once - no composition complexity
 */
export const UPDATE_TASK_SCRIPT = `
  ${getUnifiedHelpers()}
  ${getMinimalTagBridge()}
  ${REPEAT_HELPERS}

  // Repeat intent translation (OmniFocus 4.7+)
  function translateRepeatIntentToOmniFocus(intent) {
    if (!intent || !intent.frequency) return null;

    const anchorTo = intent.anchorTo || 'when-due';
    const skipMissed = intent.skipMissed || false;

    // Map user intent to OmniFocus internal parameters
    const anchorMap = {
      'when-deferred': { anchorDateKey: 'DeferDate', method: 'DeferUntilDate', scheduleType: 'FromCompletion' },
      'when-due': { anchorDateKey: 'DueDate', method: 'Fixed', scheduleType: 'Regularly' },
      'when-marked-done': { anchorDateKey: 'DueDate', method: 'DueDate', scheduleType: 'FromCompletion' },
      'planned-date': { anchorDateKey: 'PlannedDate', method: 'Fixed', scheduleType: 'Regularly' }
    };

    const params = anchorMap[anchorTo];
    if (!params) return null;

    return {
      ruleString: intent.frequency,
      method: params.method,
      scheduleType: params.scheduleType,
      anchorDateKey: params.anchorDateKey,
      catchUpAutomatically: skipMissed,
      _translatedFromUserIntent: true
    };
  }

  // Minimal bridge helper for task movement
  function __formatBridgeScript(template, params) {
    let script = template;
    for (const key in params) {
      const re = new RegExp('\\\\$' + key + '\\\\$', 'g');
      const v = params[key];
      let rep;
      if (v === null || v === undefined) rep = 'null';
      else if (typeof v === 'boolean' || typeof v === 'number') rep = String(v);
      else rep = JSON.stringify(v);
      script = script.replace(re, rep);
    }
    return script;
  }
  
  const __MOVE_TASK_TEMPLATE = [
    '(() => {',
    '  const task = Task.byIdentifier($TASK_ID$);',
    '  if (!task) return JSON.stringify({ success: false, error: "task_not_found" });',
    '  const targetType = $TARGET_TYPE$;',
    '  const targetId = $TARGET_ID$;',
    '  try {',
    '    if (targetType === "inbox") {',
    '      moveTasks([task], inbox.beginning);',
    '      return JSON.stringify({ success: true, moved: "inbox" });',
    '    } else if (targetType === "project") {',
    '      const project = Project.byIdentifier(targetId);',
    '      if (!project) return JSON.stringify({ success: false, error: "project_not_found" });',
    '      moveTasks([task], project.beginning);',
    '      return JSON.stringify({ success: true, moved: "project", projectId: targetId });',
    '    } else if (targetType === "parent") {',
    '      const parent = Task.byIdentifier(targetId);',
    '      if (!parent) return JSON.stringify({ success: false, error: "parent_not_found" });',
    '      moveTasks([task], parent);',
    '      return JSON.stringify({ success: true, moved: "parent", parentId: targetId });',
    '    } else {',
    '      return JSON.stringify({ success: false, error: "invalid_target_type" });',
    '    }',
    '  } catch (e) {',
    '    return JSON.stringify({ success: false, error: String(e) });',
    '  }',
    '})()'
  ].join('\\n');
  
  function moveTaskViaBridge(taskId, targetType, targetId, app) {
    try {
      const script = __formatBridgeScript(__MOVE_TASK_TEMPLATE, { TASK_ID: taskId, TARGET_TYPE: targetType, TARGET_ID: targetId });
      const result = app.evaluateJavascript(script);
      return JSON.parse(result);
    } catch (e) { 
      return { success: false, error: String(e) };
    }
  }
  
  (() => {
    const taskId = {{taskId}};
    const updates = {{updates}};
    
    try {
    const app = Application('OmniFocus');
    const doc = app.defaultDocument();
    
    // Find task by ID without using 'whose' per performance guidance
    let task = null;
    const tasks = doc.flattenedTasks();
    if (tasks) {
      for (let i = 0; i < tasks.length; i++) {
        if (safeGet(() => tasks[i].id()) === taskId) { task = tasks[i]; break; }
      }
    }
    
    if (!task) {
      return JSON.stringify({ 
        error: true, 
        message: "Task with ID '" + taskId + "' not found. Use 'list_tasks' tool to see available tasks." 
      });
    }
    
    // Apply updates using property setters with null handling
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
      try {
        // Handle null values explicitly to clear dates
        if (updates.dueDate === null || updates.dueDate === undefined) {
          task.dueDate = null;
        } else if (updates.dueDate) {
          // Handle date strings like create_task does (simplified approach)
          task.dueDate = new Date(updates.dueDate);
        }
      } catch (dateError) {
        // Skip invalid due date - log error details for debugging
      }
    }
    if (updates.deferDate !== undefined) {
      try {
        // Handle null values explicitly to clear dates
        if (updates.deferDate === null || updates.deferDate === undefined) {
          task.deferDate = null;
        } else if (updates.deferDate) {
          // Handle date strings like create_task does (simplified approach)
          task.deferDate = new Date(updates.deferDate);
        }
      } catch (dateError) {
        // Skip invalid defer date - log error details for debugging
      }
    }
    if (updates.plannedDate !== undefined) {
      try {
        // Handle null values explicitly to clear dates
        if (updates.plannedDate === null || updates.plannedDate === undefined) {
          task.plannedDate = null;
        } else if (updates.plannedDate) {
          // Handle date strings (OmniFocus 4.7+)
          task.plannedDate = new Date(updates.plannedDate);
        }
      } catch (dateError) {
        // Skip invalid planned date - log error details for debugging
      }
    }
    if (updates.estimatedMinutes !== undefined) {
      task.estimatedMinutes = updates.estimatedMinutes;
    }
    if (updates.sequential !== undefined) {
      task.sequential = updates.sequential;
    }
    
    // Update repeat rule if provided
    if (updates.clearRepeatRule) {
      try {
        task.repetitionRule = null;
        console.log('Cleared repeat rule from task');
      } catch (error) {
        console.log('Warning: Failed to clear repeat rule:', error.message);
      }
    } else if (updates.repeatRule) {
      try {
        // Check if this is user-intent format (4.7+ new style) or old format
        let ruleData = null;
        if (updates.repeatRule._translatedFromUserIntent || updates.repeatRule.anchorTo) {
          // New format: translate user intent to OmniFocus params
          ruleData = translateRepeatIntentToOmniFocus(updates.repeatRule);
        } else {
          // Old format: use existing logic
          ruleData = prepareRepetitionRuleData(updates.repeatRule);
        }

        if (ruleData && ruleData.ruleString) {
          // Apply repetition rule via evaluateJavascript bridge
          const success = applyRepetitionRuleViaBridge(task.id(), ruleData);
          if (success) {
            console.log('Updated repeat rule for task via bridge:', updates.repeatRule);
          } else {
            console.log('Warning: Could not update repeat rule via bridge');
          }
        }

        // Apply defer another settings for old format only
        if (!updates.repeatRule.anchorTo && updates.repeatRule.deferAnother) {
          applyDeferAnother(task, updates.repeatRule);
        }

      } catch (error) {
        console.log('Warning: Failed to update repeat rule:', error.message);
        // Continue without repeat rule update rather than failing
      }
    }
    
    // Update project assignment with better error handling
    if (updates.projectId !== undefined) {
      try {
        // Handle various ways to specify "move to inbox"
        // Including the string "null" which Claude Desktop sometimes sends
        if (updates.projectId === "" ||
            updates.projectId === null ||
            updates.projectId === "null") {
          // Move to inbox by setting assignedContainer to null
          // This is the correct way to move a task to inbox in JXA
          task.assignedContainer = null;
        } else {
          // Validate project exists
          const validation = validateProject(updates.projectId, doc);
          if (!validation.valid) {
            return JSON.stringify({
              error: true,
              message: validation.error
            });
          }
          
          const targetProject = validation.project;
          
          // Use evaluateJavascript bridge with moveTasks() for reliable project movement
          const currentTaskId = task.id();
          const escapedTaskId = JSON.stringify(currentTaskId);
          const escapedProjectId = JSON.stringify(updates.projectId);
          
          const parsed = moveTaskViaBridge(currentTaskId, 'project', updates.projectId, app);
          
          if (!parsed.success) {
            // Fall back to direct assignment if bridge fails
            try {
              task.assignedContainer = targetProject;
            } catch (assignError) {
              throw new Error(parsed.error || "Failed to move task to project");
            }
          }
        }
      } catch (projectError) {
        return formatError(projectError, 'Project assignment update');
      }
    }
    
    // Update parent task assignment (move to/from action groups)
    if (updates.parentTaskId !== undefined) {
      try {
        // Use evaluateJavascript bridge for reliable task reparenting
        const currentTaskId = task.id();
        const escapedTaskId = JSON.stringify(currentTaskId);
        let reparentResult = null;
        
        if (updates.parentTaskId === null || updates.parentTaskId === "") {
          // Move to project root or inbox (remove parent)
          // Remove parent: move to project root if available, else inbox
          const currentProject = safeGetProject(task);
          if (currentProject && currentProject.id) {
            reparentResult = moveTaskViaBridge(currentTaskId, 'project', currentProject.id, app);
          } else {
            reparentResult = moveTaskViaBridge(currentTaskId, 'inbox', null, app);
          }
          
          if (reparentResult.success) {
            console.log('Successfully removed parent from task via bridge');
          } else {
            // Fallback to JXA methods if bridge fails
            const currentProject = safeGetProject(task);
            if (currentProject && currentProject.id) {
              const projects = doc.flattenedProjects();
              let targetProject = null;
              for (let i = 0; i < projects.length; i++) {
                if (projects[i].id() === currentProject.id) {
                  targetProject = projects[i];
                  break;
                }
              }
              if (targetProject) {
                try {
                  doc.moveTasks([task], targetProject.ending);
                } catch (e1) {
                  try {
                    doc.moveTasks([task], targetProject);
                  } catch (e2) {
                    task.assignedContainer = targetProject;
                  }
                }
              }
            }
          }
        } else {
          // Move to a new parent task using evaluateJavascript bridge
          // Use the global moveTasks() function available in OmniJS
          const escapedParentTaskId = JSON.stringify(updates.parentTaskId);
          
          reparentResult = moveTaskViaBridge(currentTaskId, 'parent', updates.parentTaskId, app);
          
          if (reparentResult.success) {
            console.log('Successfully moved task to parent "' + reparentResult.parentName + '" via bridge');
          } else {
            // Fallback to JXA methods if bridge fails
            const allTasks = doc.flattenedTasks();
            let newParent = null;
            
            for (let i = 0; i < allTasks.length; i++) {
              if (allTasks[i].id() === updates.parentTaskId) {
                newParent = allTasks[i];
                break;
              }
            }
            
            if (!newParent) {
              return JSON.stringify({
                error: true,
                message: "Parent task with ID '" + updates.parentTaskId + "' not found"
              });
            }
            
            // Try multiple approaches to move task to parent
            let moveSucceeded = false;
            let lastError = null;
            
            // Method 1: Push to parent's tasks collection (like create_task does)
            try {
              newParent.tasks.push(task);
              moveSucceeded = true;
            } catch (e1) {
              lastError = e1;
              // Method 2: moveTasks with ending property
              try {
                doc.moveTasks([task], newParent.ending);
                moveSucceeded = true;
              } catch (e2) {
                lastError = e2;
                // Method 3: moveTasks with task directly
                try {
                  doc.moveTasks([task], newParent);
                  moveSucceeded = true;
                } catch (e3) {
                  lastError = e3;
                  // Method 4: moveTasks with beginning property
                  try {
                    doc.moveTasks([task], newParent.beginning);
                    moveSucceeded = true;
                  } catch (e4) {
                    lastError = e4;
                    // Method 5: assignedContainer as last resort
                    try {
                      task.assignedContainer = newParent;
                      moveSucceeded = true;
                    } catch (e5) {
                      lastError = e5;
                    }
                  }
                }
              }
            }
          }
          
          if (!moveSucceeded) {
            return JSON.stringify({
              error: true,
              message: "Failed to move task to parent after trying all methods",
              details: lastError ? lastError.toString() : "Unknown error"
            });
          }
        }
      } catch (parentError) {
        // Unexpected error
        return JSON.stringify({
          error: true,
          message: "Failed to move task to parent. Error: " + parentError.toString(),
          details: "This may be a JXA limitation with moving existing tasks between parents."
        });
      }
    }
    
    // Update tags using OmniJS bridge for reliability (required for OmniFocus 4.x)
    let tagUpdateResult = null;
    if (updates.tags !== undefined) {
      try {
        // Use bridge for tag assignment (JXA methods don't work reliably)
        const bridgeResult = bridgeSetTags(app, taskId, updates.tags);

        if (!bridgeResult || !bridgeResult.success) {
          console.log('Warning: Failed to update tags:', bridgeResult ? bridgeResult.error : 'unknown error');
          // Continue without failing the entire update
        } else {
          console.log('Successfully updated ' + (bridgeResult.tags ? bridgeResult.tags.length : 0) + ' tags via bridge');
          tagUpdateResult = bridgeResult; // Store for response
        }
      } catch (tagError) {
        console.log('Warning: Error updating tags:', tagError.message);
        // Don't fail the entire update for tag errors
      }
    }
    
    // Re-fetch task ID to ensure it's still valid after updates
    let taskIdAfterUpdate = safeGet(() => task.id());
    if (!taskIdAfterUpdate) {
      // If task ID is lost, try to find it by other properties
      try {
        const allTasks = doc.flattenedTasks();
        for (let i = 0; i < allTasks.length; i++) {
          if (allTasks[i].name() === task.name() && 
              allTasks[i].primaryKey === task.primaryKey) {
            taskIdAfterUpdate = allTasks[i].id();
            break;
          }
        }
      } catch (e) {
        taskIdAfterUpdate = 'unknown';
      }
    }
    
    // Build response with updated fields
    const response = {
      id: taskIdAfterUpdate || 'unknown',
      name: safeGet(() => task.name(), 'Unnamed Task'),
      updated: true,
      changes: {}
    };
    
    // Track what was actually changed
    if (updates.name !== undefined) response.changes.name = updates.name;
    if (updates.note !== undefined) response.changes.note = updates.note;
    if (updates.flagged !== undefined) response.changes.flagged = updates.flagged;
    if (updates.dueDate !== undefined) response.changes.dueDate = updates.dueDate;
    if (updates.deferDate !== undefined) response.changes.deferDate = updates.deferDate;
    if (updates.estimatedMinutes !== undefined) response.changes.estimatedMinutes = updates.estimatedMinutes;
    if (updates.parentTaskId !== undefined) response.changes.parentTaskId = updates.parentTaskId;
    if (updates.sequential !== undefined) response.changes.sequential = updates.sequential;
    if (updates.clearRepeatRule) response.changes.repeatRule = null;
    if (updates.repeatRule !== undefined) response.changes.repeatRule = updates.repeatRule;
    if (updates.tags !== undefined) {
      // Use bridge result for accurate tag reporting
      if (tagUpdateResult && tagUpdateResult.success) {
        response.changes.tags = tagUpdateResult.tags || [];
        // Tags successfully applied via bridge
      } else {
        response.changes.tags = updates.tags;
        response.warning = "Tags update was requested but may not have been applied successfully";
      }
    }
    if (updates.projectId !== undefined) {
      response.changes.projectId = updates.projectId;
      if (updates.projectId !== "") {
        const project = safeGetProject(task);
        if (project) {
          response.changes.projectName = project.name;
        }
        // Task ID should remain the same with moveTasks() bridge
      } else {
        response.changes.projectName = "Inbox";
      }
    }
    
    return JSON.stringify(response);
  } catch (error) {
    return formatError(error, 'update_task');
  }
  })();
`;

/**
 * NEW ARCHITECTURE: Function argument-based script generation for v2.1.0
 * Eliminates template substitution risks by passing parameters as function arguments
 */
export function createUpdateTaskScript(taskId: string, updates: any): string {
  return `
  ${getUnifiedHelpers()}
  ${getMinimalTagBridge()}

  // Minimal bridge helper for task movement
  function __formatBridgeScript(template, params) {
    let script = template;
    for (const key in params) {
      const re = new RegExp('\\\\$' + key + '\\\\$', 'g');
      const v = params[key];
      let rep;
      if (v === null || v === undefined) rep = 'null';
      else if (typeof v === 'boolean' || typeof v === 'number') rep = String(v);
      else rep = JSON.stringify(v);
      script = script.replace(re, rep);
    }
    return script;
  }
  
  const __MOVE_TASK_TEMPLATE = [
    '(() => {',
    '  const task = Task.byIdentifier($TASK_ID$);',
    '  if (!task) return JSON.stringify({ success: false, error: "task_not_found" });',
    '  const targetType = $TARGET_TYPE$;',
    '  const targetId = $TARGET_ID$;',
    '  try {',
    '    if (targetType === "inbox") {',
    '      moveTasks([task], inbox.beginning);',
    '      return JSON.stringify({ success: true, moved: "inbox" });',
    '    } else if (targetType === "project") {',
    '      const project = Project.byIdentifier(targetId);',
    '      if (!project) return JSON.stringify({ success: false, error: "project_not_found" });',
    '      moveTasks([task], project.beginning);',
    '      return JSON.stringify({ success: true, moved: "project", projectId: targetId });',
    '    } else if (targetType === "parent") {',
    '      const parent = Task.byIdentifier(targetId);',
    '      if (!parent) return JSON.stringify({ success: false, error: "parent_not_found" });',
    '      moveTasks([task], parent);',
    '      return JSON.stringify({ success: true, moved: "parent", parentId: targetId });',
    '    } else {',
    '      return JSON.stringify({ success: false, error: "invalid_target_type" });',
    '    }',
    '  } catch (e) {',
    '    return JSON.stringify({ success: false, error: String(e) });',
    '  }',
    '})()'
  ].join('\\n');
  
  function moveTaskViaBridge(taskId, targetType, targetId, app) {
    try {
      const script = __formatBridgeScript(__MOVE_TASK_TEMPLATE, { TASK_ID: taskId, TARGET_TYPE: targetType, TARGET_ID: targetId });
      const result = app.evaluateJavascript(script);
      return JSON.parse(result);
    } catch (e) { 
      return { success: false, error: String(e) };
    }
  }
  
  function updateTask(taskId, updates) {
    try {
      const app = Application('OmniFocus');
      const doc = app.defaultDocument();
      
      // Find task by ID without using 'whose' per performance guidance
      let task = null;
      const tasks = doc.flattenedTasks();
      if (tasks) {
        for (let i = 0; i < tasks.length; i++) {
          if (safeGet(() => tasks[i].id()) === taskId) { 
            task = tasks[i]; 
            break; 
          }
        }
      }
      
      if (!task) {
        return JSON.stringify({
          success: false,
          error: "Task with ID '" + taskId + "' not found."
        });
      }
      
      const changes = [];
      
      // Update basic properties
      if (updates.name !== undefined && updates.name !== task.name()) {
        task.name = updates.name;
        changes.push("Name updated");
      }
      
      if (updates.note !== undefined) {
        const noteValue = updates.note === null ? '' : String(updates.note);
        task.note = noteValue;
        changes.push("Note updated");
      }
      
      if (updates.flagged !== undefined) {
        task.flagged = updates.flagged;
        changes.push(updates.flagged ? "Flagged" : "Unflagged");
      }
      
      if (updates.completed !== undefined) {
        task.completed = updates.completed;
        if (updates.completed) {
          task.completionDate = new Date();
          changes.push("Marked completed");
        } else {
          task.completionDate = null;
          changes.push("Marked incomplete");
        }
      }
      
      // Date updates
      if (updates.dueDate !== undefined) {
        if (updates.dueDate === null) {
          task.dueDate = null;
          changes.push("Due date cleared");
        } else {
          task.dueDate = new Date(updates.dueDate);
          changes.push("Due date set");
        }
      }
      
      if (updates.deferDate !== undefined) {
        if (updates.deferDate === null) {
          task.deferDate = null;
          changes.push("Defer date cleared");
        } else {
          task.deferDate = new Date(updates.deferDate);
          changes.push("Defer date set");
        }
      }

      // Repeat rule updates
      if (updates.clearRepeatRule) {
        try {
          task.repetitionRule = null;
          changes.push("Repeat rule cleared");
        } catch (e) {
          changes.push("Warning: Could not clear repeat rule");
        }
      } else if (updates.repeatRule !== undefined) {
        try {
          const ruleData = prepareRepetitionRuleData(updates.repeatRule);
          let applied = false;
          if (ruleData && ruleData.needsBridge) {
            applied = applyRepetitionRuleViaBridge(task.id(), ruleData);
          }

          if (!applied) {
            changes.push("Warning: Could not update repeat rule via bridge");
          } else {
            changes.push("Repeat rule updated");
          }

          applyDeferAnother(task, updates.repeatRule);
        } catch (repeatError) {
          changes.push("Warning: Failed to update repeat rule");
        }
      }
      
      // Project assignment (simplified)
      if (updates.projectId !== undefined) {
        if (updates.projectId === null || updates.projectId === "" || updates.projectId === "null") {
          task.assignedContainer = null;  // Setting to null moves task to inbox
          changes.push("Moved to inbox");
        } else {
          const projects = doc.flattenedProjects();
          let targetProject = null;
          for (let i = 0; i < projects.length; i++) {
            if (projects[i].id() === updates.projectId) {
              targetProject = projects[i];
              break;
            }
          }
          
          if (targetProject) {
            task.assignedContainer = targetProject;
            changes.push("Moved to project: " + targetProject.name());
          } else {
            changes.push("Warning: Project not found");
          }
        }
      }
      
      // Tag updates (using bridge for reliability - required for OmniFocus 4.x)
      if (updates.tags !== undefined && Array.isArray(updates.tags)) {
        try {
          const bridgeResult = bridgeSetTags(app, taskId, updates.tags);
          if (bridgeResult && bridgeResult.success) {
            changes.push("Tags updated: " + bridgeResult.tags.join(", "));
          } else {
            changes.push("Warning: Failed to update tags via bridge");
          }
        } catch (tagError) {
          changes.push("Warning: Tag update failed - " + tagError.message);
        }
      }
      
      if (changes.length === 0) {
        return JSON.stringify({
          success: true,
          data: { 
            success: true,
            message: "No changes made" 
          }
        });
      }
      
      return JSON.stringify({
        success: true,
        data: {
          success: true,
          message: "Task updated successfully",
          changes: changes,
          task: {
            id: task.id(),
            name: task.name(),
            note: task.note(),
            completed: task.completed(),
            dueDate: task.dueDate() ? task.dueDate().toISOString() : null,
            deferDate: task.deferDate() ? task.deferDate().toISOString() : null,
            flagged: task.flagged()
          }
        }
      });
    } catch (error) {
      return formatError(error, 'update_task');
    }
  }

  // Execute with safe parameter passing
  updateTask(${JSON.stringify(taskId)}, ${JSON.stringify(updates)});
  `;
}
