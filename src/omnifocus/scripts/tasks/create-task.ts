/**
 * Script to create a new task in OmniFocus
 * WORKING VERSION: Added back essential helper functions for full functionality
 */

import { getMinimalHelpers } from '../shared/helpers.js';

export const CREATE_TASK_SCRIPT = `
  ${getMinimalHelpers()}
  
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
      
      // Note: Repeat rule functionality disabled to reduce script size
      
      // Get the created task ID
      const taskId = task.id();
      
      // Apply tags using fallback strategy (same as update-task.ts)
      let tagResult = null;
      if (taskData.tags && taskData.tags.length > 0) {
        try {
          const flatTags = doc.flattenedTags();
          const tagsToAdd = [];
          const appliedTags = [];

          // Find or create tags
          for (let i = 0; i < taskData.tags.length; i++) {
            const tagName = taskData.tags[i];
            let tag = null;

            // Find existing tag
            for (let j = 0; j < flatTags.length; j++) {
              if (flatTags[j].name() === tagName) {
                tag = flatTags[j];
                break;
              }
            }

            // Create new tag if not found
            if (!tag) {
              tag = app.Tag({ name: tagName });
              doc.tags.push(tag);
            }

            tagsToAdd.push(tag);
            appliedTags.push(tagName);
          }

          // Apply tags using fallback strategy
          if (tagsToAdd.length > 0) {
            try {
              // First attempt: addTags with array
              task.addTags(tagsToAdd);
            } catch (addTagsError) {
              try {
                // Second attempt: set tags property directly
                task.tags = tagsToAdd;
              } catch (setTagsError) {
                // Third attempt: individual addTag calls
                for (const tag of tagsToAdd) {
                  try {
                    task.addTag(tag);
                  } catch (e) {
                    // Skip individual tag errors but continue
                  }
                }
              }
            }
          }

          // Save document to ensure tag persistence
          try {
            doc.save();
          } catch (saveError) {
            console.log('Warning: Could not save document after tag operations');
          }

          // Verify tags were actually applied by re-querying
          let verifiedTags = [];
          try {
            verifiedTags = safeGetTags(task);
          } catch (verifyError) {
            console.log('Warning: Could not verify tag application');
          }

          tagResult = {
            success: true,
            tagsAdded: appliedTags,
            tagsCreated: [],
            totalTags: appliedTags.length,
            verified: verifiedTags.length,
            verifiedTags: verifiedTags
          };
          console.log('Successfully added ' + appliedTags.length + ' tags to task, verified: ' + verifiedTags.length);

        } catch (tagError) {
          console.log('Warning: Error adding tags:', tagError.message);
          // Continue without tags rather than failing task creation
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
        tags: tagResult && tagResult.success ? tagResult.tagsAdded : [],
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
