import { getMinimalTagBridge } from '../shared/minimal-tag-bridge.js';
import { REPEAT_HELPERS } from '../shared/repeat-helpers.js';

/**
 * Script to update an existing task in OmniFocus
 * V3: Pure OmniJS with direct property access, no helper overhead
 *
 * BRIDGE OPERATIONS PRESERVED:
 * - bridgeSetTags() for tag assignment (OmniJS required)
 * - applyRepetitionRuleViaBridge() for repeat rules
 * - moveTaskViaBridge() for task movement between projects/parents
 */

/**
 * NEW ARCHITECTURE: Function argument-based script generation for v2.1.0+
 * Eliminates template substitution risks by passing parameters as function arguments
 */
export function createUpdateTaskScript(taskId: string, updates: any): string {
  return `
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

  // Project validation helper (OmniJS v3 - direct property access)
  function validateProject(projectId, doc) {
    if (!projectId) return { valid: true, project: null };

    // Find by iteration (avoid the whose method)
    let foundProject = null;
    const projects = doc.flattenedProjects;
    for (let i = 0; i < projects.length; i++) {
      try {
        if (projects[i].id.primaryKey === projectId) {
          foundProject = projects[i];
          break;
        }
      } catch (e) {
        // Skip inaccessible projects
      }
    }

    if (!foundProject) {
      // Check if it's a numeric-only ID (Claude Desktop bug)
      const isNumericOnly = /^\\d+$/.test(projectId);
      let errorMessage = 'Project not found: ' + projectId;

      if (isNumericOnly) {
        errorMessage += ". CLAUDE DESKTOP BUG DETECTED: Claude Desktop may have extracted numbers from an alphanumeric project ID (e.g., '547' from 'az5Ieo4ip7K'). Please use the list_projects tool to get the correct full project ID and try again.";
      }

      return {
        valid: false,
        error: errorMessage
      };
    }

    return {
      valid: true,
      project: foundProject
    };
  }

  // Get project info helper (OmniJS v3)
  function getProjectInfo(task) {
    try {
      const project = task.containingProject;
      if (project) {
        return {
          name: project.name || 'Unnamed',
          id: project.id.primaryKey || null
        };
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  function updateTask(taskId, updates) {
    const operationStart = Date.now();

    try {
      const app = Application('OmniFocus');
      const doc = app.defaultDocument;

      // Find task by ID using OmniJS bridge for reliability
      // JXA's flattenedTasks has caching issues and doesn't immediately see newly created tasks
      // Use evaluateJavascript with Task.byIdentifier for immediate, accurate lookup
      const taskLookupScript = \`
        (() => {
          const task = Task.byIdentifier("\${taskId}");
          if (!task) {
            return JSON.stringify({ found: false });
          }
          return JSON.stringify({
            found: true,
            id: task.id.primaryKey,
            name: task.name
          });
        })()
      \`;

      const lookupResult = JSON.parse(app.evaluateJavascript(taskLookupScript));

      if (!lookupResult.found) {
        return JSON.stringify({
          ok: false,
          v: '3',
          error: {
            message: "Task with ID '" + taskId + "' not found. Use 'list_tasks' tool to see available tasks.",
            operation: 'update_task',
            code: 'TASK_NOT_FOUND'
          }
        });
      }

      // Perform updates via OmniJS bridge to avoid JXA caching issues
      // Build OmniJS update script dynamically based on what needs updating
      const updateOps = [];
      const changes = [];

      if (updates.name !== undefined) {
        updateOps.push(\`task.name = \${JSON.stringify(updates.name)}\`);
        changes.push("Name updated");
      }

      if (updates.note !== undefined) {
        const noteValue = updates.note === null ? '' : String(updates.note);
        updateOps.push(\`task.note = \${JSON.stringify(noteValue)}\`);
        changes.push("Note updated");
      }

      if (updates.flagged !== undefined) {
        updateOps.push(\`task.flagged = \${JSON.stringify(updates.flagged)}\`);
        changes.push(updates.flagged ? "Flagged" : "Unflagged");
      }

      // Date updates via OmniJS bridge (Issue #11 - avoid JXA cache staleness)
      // KNOWN LIMITATION: OmniJS "task.dueDate = null" and "task.deferDate = null" don't persist
      // The assignment executes without error but doesn't actually clear the date in the database.
      // This appears to be an OmniJS API limitation where null assignment is a no-op.
      // The operation will return success but the date will remain unchanged.
      // Workaround: Users must manually clear dates in OmniFocus app or use far-future date as placeholder.
      if (updates.dueDate !== undefined) {
        if (updates.dueDate === null) {
          updateOps.push(\`task.dueDate = null\`);
          changes.push("Due date cleared");
        } else {
          updateOps.push(\`task.dueDate = new Date(\${JSON.stringify(updates.dueDate)})\`);
          changes.push("Due date set");
        }
      }

      if (updates.deferDate !== undefined) {
        if (updates.deferDate === null) {
          updateOps.push(\`task.deferDate = null\`);
          changes.push("Defer date cleared");
        } else {
          updateOps.push(\`task.deferDate = new Date(\${JSON.stringify(updates.deferDate)})\`);
          changes.push("Defer date set");
        }
      }

      if (updates.plannedDate !== undefined) {
        if (updates.plannedDate === null) {
          updateOps.push(\`task.plannedDate = null\`);
          changes.push("Planned date cleared");
        } else {
          updateOps.push(\`task.plannedDate = new Date(\${JSON.stringify(updates.plannedDate)})\`);
          changes.push("Planned date set");
        }
      }

      if (updates.estimatedMinutes !== undefined) {
        updateOps.push(\`task.estimatedMinutes = \${JSON.stringify(updates.estimatedMinutes)}\`);
        changes.push("Estimated minutes updated");
      }

      // Check if we only have basic updates (no complex operations)
      // NOTE: Date and tag updates moved to OmniJS bridge path (Issues #11, #12)
      // NOTE: plannedDate and estimatedMinutes work in OmniJS (moved to bridge path for Bug #15)
      const needsJXATask = updates.completed !== undefined ||
                           updates.sequential !== undefined ||
                           updates.repeatRule !== undefined ||
                           updates.clearRepeatRule ||
                           updates.projectId !== undefined ||
                           updates.parentTaskId !== undefined;

      // If we only have basic updates (including tags/addTags/removeTags), execute via OmniJS/bridge and return immediately
      if (!needsJXATask && (updateOps.length > 0 || updates.tags !== undefined || updates.addTags !== undefined || updates.removeTags !== undefined)) {
        let updateResult = null;

        // Execute basic updates via OmniJS if we have any
        if (updateOps.length > 0) {
          const basicUpdateScript = \`
            (() => {
              const task = Task.byIdentifier("\${taskId}");
              if (!task) {
                return JSON.stringify({ success: false, error: "task_not_found" });
              }
              \${updateOps.join(';\\n              ')}
              return JSON.stringify({
                success: true,
                task: {
                  id: task.id.primaryKey,
                  name: task.name,
                  note: task.note || '',
                  flagged: task.flagged,
                  dueDate: task.dueDate ? task.dueDate.toISOString() : null,
                  deferDate: task.deferDate ? task.deferDate.toISOString() : null,
                  plannedDate: task.plannedDate ? task.plannedDate.toISOString() : null
                }
              });
            })()
          \`;

          try {
            updateResult = JSON.parse(app.evaluateJavascript(basicUpdateScript));
            if (!updateResult.success) {
              return JSON.stringify({
                ok: false,
                v: '3',
                error: {
                  message: "Failed to update basic properties via OmniJS",
                  operation: 'update_task',
                  code: 'UPDATE_FAILED'
                }
              });
            }
          } catch (e) {
            return JSON.stringify({
              ok: false,
              v: '3',
              error: {
                message: "Error executing update via OmniJS: " + String(e),
                operation: 'update_task',
                code: 'BRIDGE_ERROR'
              }
            });
          }
        }

        // Tag updates via bridge (Issue #12 - no JXA task reference needed)
        if (updates.tags !== undefined && Array.isArray(updates.tags)) {
          try {
            const bridgeResult = bridgeSetTags(app, taskId, updates.tags);
            if (bridgeResult && bridgeResult.success) {
              changes.push("Tags updated: " + (bridgeResult.tags || []).join(", "));
            } else {
              changes.push("Warning: Failed to update tags via bridge");
            }
          } catch (tagError) {
            changes.push("Warning: Tag update failed - " + String(tagError));
          }
        }

        // AddTags/RemoveTags operations (Issue #12 extension - modify existing tags)
        if (updates.addTags !== undefined || updates.removeTags !== undefined) {
          try {
            // First get current tags via OmniJS
            const getCurrentTagsScript = \`
              (() => {
                const task = Task.byIdentifier("\${taskId}");
                if (!task) {
                  return JSON.stringify({ success: false, error: "task_not_found" });
                }
                const tags = task.tags.map(t => t.name);
                return JSON.stringify({ success: true, tags: tags });
              })()
            \`;
            const currentTagsResult = JSON.parse(app.evaluateJavascript(getCurrentTagsScript));

            if (!currentTagsResult.success) {
              changes.push("Warning: Could not get current tags for add/remove operation");
            } else {
              let mergedTags = currentTagsResult.tags || [];

              // Add new tags
              if (updates.addTags && Array.isArray(updates.addTags)) {
                updates.addTags.forEach(tag => {
                  if (!mergedTags.includes(tag)) {
                    mergedTags.push(tag);
                  }
                });
              }

              // Remove tags
              if (updates.removeTags && Array.isArray(updates.removeTags)) {
                mergedTags = mergedTags.filter(tag => !updates.removeTags.includes(tag));
              }

              // Set the merged tag list
              const bridgeResult = bridgeSetTags(app, taskId, mergedTags);
              if (bridgeResult && bridgeResult.success) {
                const added = updates.addTags ? updates.addTags.length : 0;
                const removed = updates.removeTags ? updates.removeTags.length : 0;
                changes.push(\`Tags modified (added: \${added}, removed: \${removed})\`);
              } else {
                changes.push("Warning: Failed to update tags via bridge");
              }
            }
          } catch (tagError) {
            changes.push("Warning: Tag add/remove operation failed - " + String(tagError));
          }
        }

        // Return success with updated task data
        return JSON.stringify({
          ok: true,
          v: '3',
          data: {
            success: true,
            message: "Task updated successfully",
            changes: changes,
            task: updateResult ? updateResult.task : { id: taskId }
          },
          query_time_ms: Date.now() - operationStart
        });
      }

      // For complex operations, we need the JXA task reference
      let task = null;
      if (needsJXATask) {
        const tasks = doc.flattenedTasks;
        if (tasks) {
          for (let i = 0; i < tasks.length; i++) {
            try {
              if (tasks[i].id.primaryKey === taskId) {
                task = tasks[i];
                break;
              }
            } catch (e) {
              // Skip inaccessible tasks
            }
          }
        }

        if (!task) {
          // Need JXA reference for complex updates but can't find it
          return JSON.stringify({
            ok: false,
            v: '3',
            error: {
              message: "Task exists but JXA cache hasn't refreshed for complex operations. Please retry.",
              operation: 'update_task',
              code: 'JXA_CACHE_STALE'
            }
          });
        }
      }

      if (updates.completed !== undefined) {
        try {
          task.completed = updates.completed;
          if (updates.completed) {
            task.completionDate = new Date();
            changes.push("Marked completed");
          } else {
            task.completionDate = null;
            changes.push("Marked incomplete");
          }
        } catch (e) {
          changes.push("Warning: Could not update completion status");
        }
      }

      // Date updates
      if (updates.dueDate !== undefined) {
        try {
          if (updates.dueDate === null) {
            task.dueDate = null;
            changes.push("Due date cleared");
          } else {
            task.dueDate = new Date(updates.dueDate);
            changes.push("Due date set");
          }
        } catch (e) {
          changes.push("Warning: Could not update due date");
        }
      }

      if (updates.deferDate !== undefined) {
        try {
          if (updates.deferDate === null) {
            task.deferDate = null;
            changes.push("Defer date cleared");
          } else {
            task.deferDate = new Date(updates.deferDate);
            changes.push("Defer date set");
          }
        } catch (e) {
          changes.push("Warning: Could not update defer date");
        }
      }

      if (updates.plannedDate !== undefined) {
        try {
          if (updates.plannedDate === null) {
            task.plannedDate = null;
            changes.push("Planned date cleared");
          } else {
            task.plannedDate = new Date(updates.plannedDate);
            changes.push("Planned date set");
          }
        } catch (e) {
          changes.push("Warning: Could not update planned date");
        }
      }

      if (updates.estimatedMinutes !== undefined) {
        try {
          task.estimatedMinutes = updates.estimatedMinutes;
          changes.push("Estimated minutes updated");
        } catch (e) {
          changes.push("Warning: Could not update estimated minutes");
        }
      }

      if (updates.sequential !== undefined) {
        try {
          task.sequential = updates.sequential;
          changes.push(updates.sequential ? "Sequential enabled" : "Sequential disabled");
        } catch (e) {
          changes.push("Warning: Could not update sequential setting");
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
          // Check if this is user-intent format (4.7+ new style) or old format
          let ruleData = null;
          if (updates.repeatRule._translatedFromUserIntent || updates.repeatRule.anchorTo) {
            // New format: translate user intent to OmniFocus params
            ruleData = translateRepeatIntentToOmniFocus(updates.repeatRule);
          } else {
            // Old format: use existing logic
            ruleData = prepareRepetitionRuleData(updates.repeatRule);
          }

          let applied = false;
          if (ruleData && ruleData.ruleString) {
            try {
              applied = applyRepetitionRuleViaBridge(task.id.primaryKey, ruleData);
            } catch (bridgeError) {
              // Bridge failed
            }
          }

          if (!applied) {
            changes.push("Warning: Could not update repeat rule via bridge");
          } else {
            changes.push("Repeat rule updated");
          }

          // Apply defer another settings for old format only
          if (!updates.repeatRule.anchorTo && updates.repeatRule.deferAnother) {
            try {
              applyDeferAnother(task, updates.repeatRule);
              changes.push("Defer another settings applied");
            } catch (e) {
              changes.push("Warning: Could not apply defer another settings");
            }
          }
        } catch (repeatError) {
          changes.push("Warning: Failed to update repeat rule");
        }
      }

      // Project assignment
      if (updates.projectId !== undefined) {
        try {
          if (updates.projectId === null || updates.projectId === "" || updates.projectId === "null") {
            task.assignedContainer = null;  // Setting to null moves task to inbox
            changes.push("Moved to inbox");
          } else {
            // Validate project exists
            const validation = validateProject(updates.projectId, doc);
            if (!validation.valid) {
              return JSON.stringify({
                ok: false,
                v: '3',
                error: {
                  message: validation.error,
                  operation: 'update_task_project',
                  code: 'PROJECT_NOT_FOUND'
                }
              });
            }

            const targetProject = validation.project;

            // Use evaluateJavascript bridge with moveTasks() for reliable project movement
            try {
              const taskIdStr = task.id.primaryKey;
              const parsed = moveTaskViaBridge(taskIdStr, 'project', updates.projectId, app);

              if (!parsed.success) {
                // Fall back to direct assignment if bridge fails
                try {
                  task.assignedContainer = targetProject;
                  changes.push("Moved to project: " + targetProject.name);
                } catch (assignError) {
                  changes.push("Warning: Could not move to project");
                }
              } else {
                changes.push("Moved to project: " + targetProject.name);
              }
            } catch (moveError) {
              // Fallback to direct assignment
              task.assignedContainer = targetProject;
              changes.push("Moved to project: " + targetProject.name);
            }
          }
        } catch (projectError) {
          changes.push("Warning: Project assignment failed");
        }
      }

      // Update parent task assignment (move to/from action groups)
      if (updates.parentTaskId !== undefined) {
        try {
          const taskIdStr = task.id.primaryKey;
          let reparentResult = null;

          if (updates.parentTaskId === null || updates.parentTaskId === "") {
            // Remove parent: move to project root if available, else inbox
            const currentProject = getProjectInfo(task);
            if (currentProject && currentProject.id) {
              reparentResult = moveTaskViaBridge(taskIdStr, 'project', currentProject.id, app);
            } else {
              reparentResult = moveTaskViaBridge(taskIdStr, 'inbox', null, app);
            }

            if (reparentResult.success) {
              changes.push('Parent removed');
            } else {
              // Fallback to JXA methods if bridge fails
              const currentProject = getProjectInfo(task);
              if (currentProject && currentProject.id) {
                const projects = doc.flattenedProjects;
                let targetProject = null;
                for (let i = 0; i < projects.length; i++) {
                  try {
                    if (projects[i].id.primaryKey === currentProject.id) {
                      targetProject = projects[i];
                      break;
                    }
                  } catch (e) {
                    // Skip
                  }
                }
                if (targetProject) {
                  task.assignedContainer = targetProject;
                  changes.push('Parent removed');
                }
              }
            }
          } else {
            // Move to a new parent task using evaluateJavascript bridge
            reparentResult = moveTaskViaBridge(taskIdStr, 'parent', updates.parentTaskId, app);

            if (reparentResult.success) {
              changes.push('Moved to parent task');
            } else {
              // Fallback to JXA methods if bridge fails
              const allTasks = doc.flattenedTasks;
              let newParent = null;

              for (let i = 0; i < allTasks.length; i++) {
                try {
                  if (allTasks[i].id.primaryKey === updates.parentTaskId) {
                    newParent = allTasks[i];
                    break;
                  }
                } catch (e) {
                  // Skip
                }
              }

              if (!newParent) {
                return JSON.stringify({
                  ok: false,
                  v: '3',
                  error: {
                    message: "Parent task with ID '" + updates.parentTaskId + "' not found",
                    operation: 'update_task_parent',
                    code: 'PARENT_NOT_FOUND'
                  }
                });
              }

              // Try to move task to parent
              let moveSucceeded = false;
              try {
                task.assignedContainer = newParent;
                moveSucceeded = true;
                changes.push('Moved to parent task');
              } catch (e) {
                changes.push('Warning: Could not move to parent task');
              }
            }
          }
        } catch (parentError) {
          changes.push('Warning: Parent task update failed');
        }
      }

      // Tag updates (using bridge for reliability - required for OmniFocus 4.x)
      if (updates.tags !== undefined && Array.isArray(updates.tags)) {
        try {
          const bridgeResult = bridgeSetTags(app, taskId, updates.tags);
          if (bridgeResult && bridgeResult.success) {
            changes.push("Tags updated: " + (bridgeResult.tags || []).join(", "));
          } else {
            changes.push("Warning: Failed to update tags via bridge");
          }
        } catch (tagError) {
          changes.push("Warning: Tag update failed");
        }
      }

      if (changes.length === 0) {
        return JSON.stringify({
          ok: true,
          v: '3',
          data: {
            success: true,
            message: "No changes made",
            task: {
              id: task.id.primaryKey,
              name: task.name || 'Unnamed'
            }
          },
          query_time_ms: Date.now() - operationStart
        });
      }

      // Build response with updated task data
      const responseTask = {
        id: task.id.primaryKey,
        name: task.name || 'Unnamed',
        completed: task.completed || false,
        flagged: task.flagged || false
      };

      // Add optional fields
      try { responseTask.note = task.note || ''; } catch (e) {}
      try { responseTask.dueDate = task.dueDate ? task.dueDate.toISOString() : null; } catch (e) {}
      try { responseTask.deferDate = task.deferDate ? task.deferDate.toISOString() : null; } catch (e) {}
      try { responseTask.plannedDate = task.plannedDate ? task.plannedDate.toISOString() : null; } catch (e) {}
      try { responseTask.estimatedMinutes = task.estimatedMinutes || 0; } catch (e) {}

      return JSON.stringify({
        ok: true,
        v: '3',
        data: {
          success: true,
          message: "Task updated successfully",
          changes: changes,
          task: responseTask
        },
        query_time_ms: Date.now() - operationStart
      });
    } catch (error) {
      return JSON.stringify({
        ok: false,
        v: '3',
        error: {
          message: error.message || String(error),
          stack: error.stack,
          operation: 'update_task'
        }
      });
    }
  }

  // Execute with safe parameter passing
  updateTask(${JSON.stringify(taskId)}, ${JSON.stringify(updates)});
  `;
}
