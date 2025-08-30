/**
 * Optimized script for getting flagged tasks
 * Uses direct JXA iteration with early exits for performance
 */

import { getAllHelpers } from '../shared/helpers.js';

export const FLAGGED_TASKS_OPTIMIZED_SCRIPT = `
  ${getAllHelpers()}
  
  (() => {
    const app = Application('OmniFocus');
    const doc = app.defaultDocument();
    const limit = {{limit}};
    const includeCompleted = {{includeCompleted}};
    const includeDetails = {{includeDetails}};
    
    try {
      const queryStartTime = Date.now();
      
      // Get ALL tasks and filter for flagged ones
      const allTasks = doc.flattenedTasks();
      const flaggedTasks = [];
      let processedCount = 0;
      
      // Optimized filtering loop - early exit on flagged check
      const len = allTasks.length;
      for (let i = 0; i < len && flaggedTasks.length < limit; i++) {
        const task = allTasks[i];
        processedCount++;
        
        try {
          // CRITICAL: Check flagged FIRST (most selective filter)
          if (!task.flagged()) continue;
          
          // Then check completed status if filtering
          if (!includeCompleted && isTaskEffectivelyCompleted(task)) continue;
          
          // Task is flagged and meets criteria - gather data
          const project = task.containingProject();
          
          const taskData = {
            id: task.id(),
            name: task.name(),
            flagged: true, // We know it's flagged
            completed: includeCompleted ? task.completed() : false
          };
          
          if (includeDetails) {
            taskData.note = task.note() || '';
            taskData.dueDate = task.dueDate() ? task.dueDate().toISOString() : null;
            taskData.deferDate = task.deferDate() ? task.deferDate().toISOString() : null;
            taskData.estimatedMinutes = task.estimatedMinutes() || null;
            taskData.project = project ? project.name() : null;
            taskData.projectId = project ? project.id() : null;
            taskData.tags = safeGetTags(task);
          } else {
            // Minimal data for speed
            taskData.project = project ? project.name() : null;
            taskData.projectId = project ? project.id() : null;
          }
          
          flaggedTasks.push(taskData);
        } catch (e) {
          // Skip errored tasks
        }
      }
      
      // Sort by due date (flagged items often have dates)
      if (includeDetails) {
        flaggedTasks.sort((a, b) => {
          if (!a.dueDate && !b.dueDate) return 0;
          if (!a.dueDate) return 1;
          if (!b.dueDate) return -1;
          return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
        });
      }
      
      const queryEndTime = Date.now();
      
      return JSON.stringify({
        tasks: flaggedTasks,
        summary: {
          total: flaggedTasks.length,
          limited: flaggedTasks.length >= limit,
          tasks_scanned: processedCount,
          query_time_ms: queryEndTime - queryStartTime,
          query_method: 'optimized_flagged'
        }
      });
      
    } catch (error) {
      return JSON.stringify({
        error: true,
        message: "Failed to get flagged tasks: " + error.toString(),
        details: error.message
      });
    }
  })();
`;
