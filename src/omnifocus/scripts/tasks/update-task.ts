import { getAllHelpers } from '../shared/helpers.js';
import { REPEAT_HELPERS } from '../shared/repeat-helpers.js';

/**
 * Script to update an existing task in OmniFocus
 *
 * Handles:
 * - Basic property updates (name, note, flags, dates, etc.)
 * - Project reassignment (with recreation fallback for JXA limitations)
 * - Tag updates with comprehensive error handling
 * - Claude Desktop numeric ID bug detection
 */
export const UPDATE_TASK_SCRIPT = `
  ${getAllHelpers()}
  ${REPEAT_HELPERS}
  
  (() => {
    const taskId = {{taskId}};
    const updates = {{updates}};
    
    try {
    const app = Application('OmniFocus');
    const doc = app.defaultDocument();
    
    // Find task by ID
    // Use whose() for O(1) lookup - much faster than iteration
    let task = null;
    try {
      const matches = doc.flattenedTasks.whose({id: taskId});
      if (matches && matches.length > 0) {
        task = matches[0];
      }
    } catch (e) {
      // whose() failed, fall back to iteration
      const tasks = doc.flattenedTasks();
      if (tasks) {
        for (let i = 0; i < tasks.length; i++) {
          if (safeGet(() => tasks[i].id()) === taskId) {
            task = tasks[i];
            break;
          }
        }
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
        const ruleData = prepareRepetitionRuleData(updates.repeatRule);
        if (ruleData && ruleData.needsBridge) {
          // Apply repetition rule via evaluateJavascript bridge
          const success = applyRepetitionRuleViaBridge(task.id(), ruleData);
          if (success) {
            console.log('Updated repeat rule for task via bridge:', updates.repeatRule);
          } else {
            console.log('Warning: Could not update repeat rule via bridge');
          }
        }
        
        // Apply defer another settings if specified
        applyDeferAnother(task, updates.repeatRule);
        
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
            updates.projectId === "null" ||
            updates.projectId === "inbox") {
          // Move to inbox - set assignedContainer to null
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
          
          // Moving tasks between projects is complex in JXA
          // We'll use a recreation approach since direct assignment often fails
          
          // First, capture all current task properties
          const taskData = {
            name: safeGet(() => task.name(), 'Unnamed Task'),
            note: safeGet(() => task.note(), ''),
            flagged: safeGet(() => task.flagged(), false),
            dueDate: safeGetDate(() => task.dueDate()),
            deferDate: safeGetDate(() => task.deferDate()),
            estimatedMinutes: safeGetEstimatedMinutes(task),
            sequential: safeGet(() => task.sequential(), false),
            completed: safeGet(() => task.completed(), false),
            completionDate: safeGetDate(() => task.completionDate())
          };
          
          // Get current tags before deletion
          const currentTags = safeGetTags(task);
          
          // Try to delete and recreate the task
          let deleteSucceeded = false;
          try {
            app.delete(task);
            deleteSucceeded = true;
          } catch (deleteError) {
            // If delete fails, try to at least update the reference
            try {
              task.assignedContainer = targetProject; // task.assignedContainer = projects[i]
              // If direct assignment worked, we're done - no need to recreate
            } catch (assignError) {
              throw new Error("Failed to move task: could not delete original or reassign");
            }
          }
          
          if (deleteSucceeded) {
            // Successfully deleted the task, now recreate it in target project
            const newTaskObj = {
              name: taskData.name,
              note: taskData.note,
              flagged: taskData.flagged
            };
            
            if (taskData.dueDate) newTaskObj.dueDate = new Date(taskData.dueDate);
            if (taskData.deferDate) newTaskObj.deferDate = new Date(taskData.deferDate);
            if (taskData.estimatedMinutes) newTaskObj.estimatedMinutes = taskData.estimatedMinutes;
            
            const newTask = app.Task(newTaskObj);
            targetProject.tasks.push(newTask);
            
            // Set sequential property after creation
            if (taskData.sequential !== undefined) {
              newTask.sequential = taskData.sequential;
            }
            
            // If task was completed, mark it complete
            if (taskData.completed && taskData.completionDate) {
              newTask.markComplete({completionDate: new Date(taskData.completionDate)});
            }
            
            // Update our task reference to the new task
            task = newTask;
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
        let reparentResult = null;
        
        if (updates.parentTaskId === null || updates.parentTaskId === "") {
          // Move to project root or inbox (remove parent)
          const reparentScript = [
            '(() => {',
            '  const task = Task.byIdentifier("' + currentTaskId + '");',
            '  if (!task) return JSON.stringify({success: false, error: "Task not found"});',
            '  ',
            '  try {',
            '    // Remove from parent by moving to project or inbox',
            '    const currentProject = task.containingProject;',
            '    ',
            '    if (currentProject) {',
            '      // Move to project root using global moveTasks',
            '      moveTasks([task], currentProject);',
            '      return JSON.stringify({',
            '        success: true,',
            '        message: "Moved to project root",',
            '        projectName: currentProject.name',
            '      });',
            '    } else {',
            '      // Move to inbox using global moveTasks',
            '      moveTasks([task], inbox);',
            '      return JSON.stringify({',
            '        success: true,',
            '        message: "Moved to inbox"',
            '      });',
            '    }',
            '  } catch (error) {',
            '    return JSON.stringify({',
            '      success: false,',
            '      error: "Failed to remove parent: " + (error.message || error.toString())',
            '    });',
            '  }',
            '})()'
          ].join('');
          
          const result = app.evaluateJavascript(reparentScript);
          reparentResult = JSON.parse(result);
          
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
          const reparentScript = [
            '(() => {',
            '  const task = Task.byIdentifier("' + currentTaskId + '");',
            '  const newParent = Task.byIdentifier("' + updates.parentTaskId + '");',
            '  ',
            '  if (!task) return JSON.stringify({success: false, error: "Task not found"});',
            '  if (!newParent) return JSON.stringify({success: false, error: "Parent task not found"});',
            '  ',
            '  try {',
            '    // Use the global moveTasks function to move the task',
            '    moveTasks([task], newParent);',
            '    ',
            '    return JSON.stringify({',
            '      success: true,',
            '      message: "Task moved to parent",',
            '      parentName: newParent.name,',
            '      parentId: newParent.id.primaryKey',
            '    });',
            '  } catch (error) {',
            '    return JSON.stringify({',
            '      success: false,',
            '      error: "Failed to move task: " + (error.message || error.toString())',
            '    });',
            '  }',
            '})()'
          ].join('');
          
          const result = app.evaluateJavascript(reparentScript);
          reparentResult = JSON.parse(result);
          
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
    
    // Update tags with error handling
    if (updates.tags !== undefined) {
      try {
        // Get current tags
        const currentTags = task.tags();
        
        // Remove all existing tags
        if (currentTags && currentTags.length > 0) {
          task.removeTags(currentTags);
        }
        
        // Add new tags
        if (updates.tags && updates.tags.length > 0) {
          const existingTags = doc.flattenedTags();
          const tagsToAdd = [];
          
          for (const tagName of updates.tags) {
            if (typeof tagName !== 'string' || tagName.trim() === '') {
              // Skip invalid tag name
              continue;
            }
            
            let found = false;
            for (let i = 0; i < existingTags.length; i++) {
              if (existingTags[i].name() === tagName) {
                tagsToAdd.push(existingTags[i]);
                found = true;
                break;
              }
            }
            
            if (!found) {
              try {
                // Create new tag using make
                const newTag = app.make({
                  new: 'tag',
                  withProperties: { name: tagName },
                  at: doc.tags
                });
                tagsToAdd.push(newTag);
              } catch (makeError) {
                // If make fails, try alternate syntax
                try {
                  const newTag = app.Tag({name: tagName});
                  doc.tags.push(newTag);
                  tagsToAdd.push(newTag);
                } catch (tagError) {
                  // Skip tag creation error - tag won't be added
                }
              }
            }
          }
          
          if (tagsToAdd.length > 0) {
            // Try using addTags with array instead of individual calls
            try {
              task.addTags(tagsToAdd);
            } catch (addTagsError) {
              // If addTags fails, try setting tags property directly
              try {
                task.tags = tagsToAdd;
              } catch (setTagsError) {
                // Last resort: try individual calls
                for (const tag of tagsToAdd) {
                  try {
                    task.addTag(tag);
                  } catch (e) {
                    // Skip individual tag errors
                  }
                }
              }
            }
          }
        }
      } catch (tagError) {
        // Skip tag update errors
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
      response.changes.tags = updates.tags;
      // Verify if tags were actually applied
      const actualTagsAfter = safeGetTags(task);
      const requestedTags = updates.tags || [];
      
      // Check if all requested tags were applied
      const missingTags = requestedTags.filter(tag => !actualTagsAfter.includes(tag));
      
      if (missingTags.length > 0) {
        // Tags were requested but not all were applied
        response.warning = "Some or all tags could not be applied. OmniFocus JXA has limitations with tag assignment. Missing tags: " + missingTags.join(", ");
        response.actualTags = actualTagsAfter;
      }
    }
    if (updates.projectId !== undefined) {
      response.changes.projectId = updates.projectId;
      if (updates.projectId !== "") {
        const project = safeGetProject(task);
        if (project) {
          response.changes.projectName = project.name;
        }
        // Check if this was a delete/recreate operation
        if (taskIdAfterUpdate !== taskId) {
          response.note = "Task was recreated in the target project due to JXA limitations. New task ID: " + taskIdAfterUpdate;
        }
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
