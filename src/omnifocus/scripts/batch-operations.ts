/**
 * Batch Operations for OmniFocus Tasks
 * 
 * These scripts handle multiple task operations in a single execution,
 * improving performance and reducing MCP round trips.
 */

import { SAFE_UTILITIES_SCRIPT } from './tasks.js';

export const BATCH_UPDATE_TASKS_SCRIPT = `
  const taskUpdates = {{taskUpdates}}; // Array of {taskId, updates}
  
  ${SAFE_UTILITIES_SCRIPT}
  
  const results = [];
  const errors = [];
  let successCount = 0;
  
  try {
    // Process each task update
    for (let i = 0; i < taskUpdates.length; i++) {
      const {taskId, updates} = taskUpdates[i];
      
      try {
        // Find task by ID using whose()
        let task = null;
        try {
          const matches = doc.flattenedTasks.whose({id: taskId});
          if (matches && matches.length > 0) {
            task = matches[0];
          }
        } catch (e) {
          // Fall back to iteration if whose() fails
          const tasks = doc.flattenedTasks();
          if (tasks) {
            for (let j = 0; j < tasks.length; j++) {
              if (safeGet(() => tasks[j].id()) === taskId) {
                task = tasks[j];
                break;
              }
            }
          }
        }
        
        if (!task) {
          errors.push({
            taskId: taskId,
            error: "Task not found"
          });
          continue;
        }
        
        // Apply updates
        if (updates.name !== undefined) task.name = updates.name;
        if (updates.note !== undefined) task.note = updates.note;
        if (updates.flagged !== undefined) task.flagged = updates.flagged;
        if (updates.dueDate !== undefined) task.dueDate = updates.dueDate ? new Date(updates.dueDate) : null;
        if (updates.deferDate !== undefined) task.deferDate = updates.deferDate ? new Date(updates.deferDate) : null;
        if (updates.estimatedMinutes !== undefined) task.estimatedMinutes = updates.estimatedMinutes;
        
        // Handle project assignment
        if (updates.projectId !== undefined) {
          if (updates.projectId === "") {
            // Move to inbox
            task.assignedContainer = null;
          } else {
            // Find project and assign
            const projectMatches = doc.flattenedProjects.whose({id: updates.projectId});
            if (projectMatches && projectMatches.length > 0) {
              task.assignedContainer = projectMatches[0];
            }
          }
        }
        
        results.push({
          taskId: taskId,
          success: true,
          name: safeGet(() => task.name())
        });
        successCount++;
        
      } catch (error) {
        errors.push({
          taskId: taskId,
          error: error.toString()
        });
      }
    }
    
    return JSON.stringify({
      success: true,
      totalProcessed: taskUpdates.length,
      successCount: successCount,
      failureCount: errors.length,
      results: results,
      errors: errors
    });
    
  } catch (error) {
    return JSON.stringify({
      error: true,
      message: "Batch update failed: " + error.toString()
    });
  }
`;

export const BATCH_COMPLETE_TASKS_SCRIPT = `
  const taskIds = {{taskIds}}; // Array of task IDs
  const completionDate = {{completionDate}}; // Optional completion date
  
  ${SAFE_UTILITIES_SCRIPT}
  
  const results = [];
  const errors = [];
  let successCount = 0;
  
  try {
    const completeDate = completionDate ? new Date(completionDate) : new Date();
    
    // Process each task
    for (let i = 0; i < taskIds.length; i++) {
      const taskId = taskIds[i];
      
      try {
        // Find task by ID
        let task = null;
        try {
          const matches = doc.flattenedTasks.whose({id: taskId});
          if (matches && matches.length > 0) {
            task = matches[0];
          }
        } catch (e) {
          // Fall back to iteration
          const tasks = doc.flattenedTasks();
          if (tasks) {
            for (let j = 0; j < tasks.length; j++) {
              if (safeGet(() => tasks[j].id()) === taskId) {
                task = tasks[j];
                break;
              }
            }
          }
        }
        
        if (!task) {
          errors.push({
            taskId: taskId,
            error: "Task not found"
          });
          continue;
        }
        
        // Check if already completed
        if (safeIsCompleted(task)) {
          results.push({
            taskId: taskId,
            success: true,
            alreadyCompleted: true,
            name: safeGet(() => task.name())
          });
          continue;
        }
        
        // Complete the task
        task.completed = true;
        task.completionDate = completeDate;
        
        results.push({
          taskId: taskId,
          success: true,
          name: safeGet(() => task.name()),
          completedAt: completeDate.toISOString()
        });
        successCount++;
        
      } catch (error) {
        errors.push({
          taskId: taskId,
          error: error.toString()
        });
      }
    }
    
    return JSON.stringify({
      success: true,
      totalProcessed: taskIds.length,
      successCount: successCount,
      failureCount: errors.length,
      results: results,
      errors: errors
    });
    
  } catch (error) {
    return JSON.stringify({
      error: true,
      message: "Batch complete failed: " + error.toString()
    });
  }
`;

export const BATCH_DELETE_TASKS_SCRIPT = `
  const taskIds = {{taskIds}}; // Array of task IDs
  
  ${SAFE_UTILITIES_SCRIPT}
  
  const results = [];
  const errors = [];
  let successCount = 0;
  
  try {
    // Collect tasks first to avoid modifying collection while iterating
    const tasksToDelete = [];
    
    for (let i = 0; i < taskIds.length; i++) {
      const taskId = taskIds[i];
      
      try {
        // Find task by ID
        let task = null;
        try {
          const matches = doc.flattenedTasks.whose({id: taskId});
          if (matches && matches.length > 0) {
            task = matches[0];
          }
        } catch (e) {
          // Fall back to iteration
          const tasks = doc.flattenedTasks();
          if (tasks) {
            for (let j = 0; j < tasks.length; j++) {
              if (safeGet(() => tasks[j].id()) === taskId) {
                task = tasks[j];
                break;
              }
            }
          }
        }
        
        if (!task) {
          errors.push({
            taskId: taskId,
            error: "Task not found"
          });
          continue;
        }
        
        tasksToDelete.push({
          taskId: taskId,
          task: task,
          name: safeGet(() => task.name())
        });
        
      } catch (error) {
        errors.push({
          taskId: taskId,
          error: error.toString()
        });
      }
    }
    
    // Now delete the collected tasks
    for (let i = 0; i < tasksToDelete.length; i++) {
      const {taskId, task, name} = tasksToDelete[i];
      
      try {
        task.remove();
        
        results.push({
          taskId: taskId,
          success: true,
          name: name
        });
        successCount++;
        
      } catch (error) {
        errors.push({
          taskId: taskId,
          error: "Failed to delete: " + error.toString()
        });
      }
    }
    
    return JSON.stringify({
      success: true,
      totalProcessed: taskIds.length,
      successCount: successCount,
      failureCount: errors.length,
      results: results,
      errors: errors
    });
    
  } catch (error) {
    return JSON.stringify({
      error: true,
      message: "Batch delete failed: " + error.toString()
    });
  }
`;

/**
 * Batch operation with mixed actions
 * Allows different operations on different tasks in one script
 */
export const BATCH_MIXED_OPERATIONS_SCRIPT = `
  const operations = {{operations}}; // Array of {taskId, action: 'complete'|'delete'|'update', data?}
  
  ${SAFE_UTILITIES_SCRIPT}
  
  const results = [];
  const errors = [];
  let successCount = 0;
  
  try {
    // Group operations by type for efficiency
    const toComplete = [];
    const toDelete = [];
    const toUpdate = [];
    
    // First pass: find all tasks and categorize operations
    for (let i = 0; i < operations.length; i++) {
      const op = operations[i];
      
      try {
        // Find task
        let task = null;
        try {
          const matches = doc.flattenedTasks.whose({id: op.taskId});
          if (matches && matches.length > 0) {
            task = matches[0];
          }
        } catch (e) {
          // Fall back to iteration
          const tasks = doc.flattenedTasks();
          if (tasks) {
            for (let j = 0; j < tasks.length; j++) {
              if (safeGet(() => tasks[j].id()) === op.taskId) {
                task = tasks[j];
                break;
              }
            }
          }
        }
        
        if (!task) {
          errors.push({
            taskId: op.taskId,
            action: op.action,
            error: "Task not found"
          });
          continue;
        }
        
        // Categorize by operation type
        switch (op.action) {
          case 'complete':
            toComplete.push({task: task, taskId: op.taskId, date: op.data?.completionDate});
            break;
          case 'delete':
            toDelete.push({task: task, taskId: op.taskId});
            break;
          case 'update':
            toUpdate.push({task: task, taskId: op.taskId, updates: op.data});
            break;
          default:
            errors.push({
              taskId: op.taskId,
              action: op.action,
              error: "Unknown action: " + op.action
            });
        }
        
      } catch (error) {
        errors.push({
          taskId: op.taskId,
          action: op.action,
          error: error.toString()
        });
      }
    }
    
    // Process updates first
    for (let i = 0; i < toUpdate.length; i++) {
      const {task, taskId, updates} = toUpdate[i];
      try {
        if (updates.name !== undefined) task.name = updates.name;
        if (updates.note !== undefined) task.note = updates.note;
        if (updates.flagged !== undefined) task.flagged = updates.flagged;
        if (updates.dueDate !== undefined) task.dueDate = updates.dueDate ? new Date(updates.dueDate) : null;
        if (updates.deferDate !== undefined) task.deferDate = updates.deferDate ? new Date(updates.deferDate) : null;
        
        results.push({
          taskId: taskId,
          action: 'update',
          success: true
        });
        successCount++;
      } catch (error) {
        errors.push({
          taskId: taskId,
          action: 'update',
          error: error.toString()
        });
      }
    }
    
    // Process completions
    for (let i = 0; i < toComplete.length; i++) {
      const {task, taskId, date} = toComplete[i];
      try {
        if (!safeIsCompleted(task)) {
          task.completed = true;
          if (date) task.completionDate = new Date(date);
        }
        
        results.push({
          taskId: taskId,
          action: 'complete',
          success: true
        });
        successCount++;
      } catch (error) {
        errors.push({
          taskId: taskId,
          action: 'complete',
          error: error.toString()
        });
      }
    }
    
    // Process deletions last
    for (let i = 0; i < toDelete.length; i++) {
      const {task, taskId} = toDelete[i];
      try {
        task.remove();
        
        results.push({
          taskId: taskId,
          action: 'delete',
          success: true
        });
        successCount++;
      } catch (error) {
        errors.push({
          taskId: taskId,
          action: 'delete',
          error: error.toString()
        });
      }
    }
    
    return JSON.stringify({
      success: true,
      totalProcessed: operations.length,
      successCount: successCount,
      failureCount: errors.length,
      results: results,
      errors: errors
    });
    
  } catch (error) {
    return JSON.stringify({
      error: true,
      message: "Batch operations failed: " + error.toString()
    });
  }
`;