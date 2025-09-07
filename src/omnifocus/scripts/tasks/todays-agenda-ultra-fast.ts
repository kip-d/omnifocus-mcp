import { getBasicHelpers } from '../shared/helpers.js';

/**
 * Ultra-fast optimized script for today's agenda
 *
 * Single-pass algorithm for maximum performance
 */
export const TODAYS_AGENDA_ULTRA_FAST_SCRIPT = `
  ${getBasicHelpers()}
  
  (() => {
    const options = {{options}};
    const tasks = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const includeOverdue = options.includeOverdue !== false;
    const includeFlagged = options.includeFlagged !== false;
    const includeDetails = options.includeDetails === true;
    const maxTasks = options.limit || 25;
    
    try {
      const app = Application('OmniFocus');
      const doc = app.defaultDocument();
      
      // ULTRA-FAST SINGLE PASS ALGORITHM
      // Get all tasks once and filter in a single loop
      const allTasks = doc.flattenedTasks();
      const taskCount = allTasks.length;
      
      let overdueCount = 0;
      let dueTodayCount = 0;
      let flaggedCount = 0;
      let processedCount = 0;
      const seenIds = new Set();
      
      // Single pass through all tasks
      for (let i = 0; i < taskCount && tasks.length < maxTasks; i++) {
        const task = allTasks[i];
        processedCount++;
        
        try {
          // Skip completed tasks immediately
          if (task.completed()) continue;
          
          // Get basic info once
          const taskId = task.id();
          
          // Skip if we've already added this task
          if (seenIds.has(taskId)) continue;
          
          let shouldInclude = false;
          let reason = '';
          let daysOverdue = 0;
          
          // Check flagged status if needed
          const isFlagged = includeFlagged ? task.flagged() : false;
          
          // Check due date if needed
          let dueDate = null;
          if (includeOverdue || true) { // Always check for due dates
            try {
              const dueDateObj = task.dueDate();
              if (dueDateObj) {
                dueDate = dueDateObj.toISOString();
                const dueTime = dueDateObj.getTime();
                
                if (dueTime < today.getTime()) {
                  // Overdue
                  if (includeOverdue) {
                    shouldInclude = true;
                    reason = 'overdue';
                    daysOverdue = Math.floor((today - dueDateObj) / (1000 * 60 * 60 * 24));
                    overdueCount++;
                  }
                } else if (dueTime < tomorrow.getTime()) {
                  // Due today
                  shouldInclude = true;
                  reason = 'due_today';
                  dueTodayCount++;
                }
              }
            } catch (e) {
              // No due date
            }
          }
          
          // Check flagged if not already included
          if (!shouldInclude && isFlagged) {
            shouldInclude = true;
            reason = 'flagged';
            flaggedCount++;
          }
          
          // Add task if it should be included
          if (shouldInclude) {
            seenIds.add(taskId);
            
            const taskObj = {
              id: taskId,
              name: task.name(),
              reason: reason
            };
            
            if (daysOverdue > 0) {
              taskObj.daysOverdue = daysOverdue;
            }
            
            if (dueDate) {
              taskObj.dueDate = dueDate;
            }
            
            if (isFlagged) {
              taskObj.flagged = true;
            }
            
            // Add details if requested
            if (includeDetails) {
              try {
                taskObj.note = task.note() || '';
                const project = task.containingProject();
                if (project) {
                  taskObj.project = project.name();
                  taskObj.projectId = project.id();
                }
                const tags = task.tags();
                if (tags && tags.length > 0) {
                  taskObj.tags = tags.map(t => t.name());
                }
              } catch (e) {
                // Skip detail errors
              }
            }
            
            tasks.push(taskObj);
          }
          
        } catch (e) {
          // Skip tasks that throw errors
        }
      }
      
      // Return results in standard envelope
      return JSON.stringify({
        ok: true,
        v: '1',
        data: {
          tasks: tasks,
          overdueCount: overdueCount,
          dueTodayCount: dueTodayCount,
          flaggedCount: flaggedCount,
          processedCount: processedCount,
          totalTasks: taskCount,
          optimizationUsed: 'ultra_fast_single_pass'
        }
      });
      
    } catch (error) {
      return JSON.stringify({
        ok: false,
        v: '1',
        error: {
          code: 'TODAY_ULTRA_FAST_FAILED',
          message: (error && (error.message || error.toString())) || 'Unknown error',
          details: "Failed in ultra-fast today's agenda query"
        }
      });
    }
  })();
`;
