import { getUnifiedHelpers } from '../shared/helpers.js';

/**
 * Ultra-fast optimized script for today's agenda
 *
 * Single-pass algorithm for maximum performance
 */
export const TODAYS_AGENDA_SCRIPT = `
  ${getUnifiedHelpers()}

  // Helper function for safe completed check
  function safeIsCompleted(task) {
    // Use the isTaskEffectivelyCompleted helper which checks both task completion
    // and parent project completion status
    return isTaskEffectivelyCompleted(task);
  }
  
  (() => {
    const options = {{options}};
    const fields = {{fields}};
    const tasks = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const includeOverdue = options.includeOverdue !== false;
    const includeFlagged = options.includeFlagged !== false;
    const includeDetails = options.includeDetails === true;
    const maxTasks = options.limit || 25;

    // Field selection helper
    function shouldIncludeField(fieldName) {
      return !fields || fields.length === 0 || fields.includes(fieldName);
    }
    
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
          if (safeIsCompleted(task)) continue;
          
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

            const taskObj = {};

            // Always include id (needed for identification)
            if (shouldIncludeField('id')) {
              taskObj.id = taskId;
            }

            // Always include name (core field)
            if (shouldIncludeField('name')) {
              taskObj.name = task.name();
            }

            // Include reason (specific to today's agenda)
            taskObj.reason = reason;

            if (daysOverdue > 0) {
              taskObj.daysOverdue = daysOverdue;
            }

            if (dueDate && shouldIncludeField('dueDate')) {
              taskObj.dueDate = dueDate;
            }

            if (isFlagged && shouldIncludeField('flagged')) {
              taskObj.flagged = true;
            }
            
          // Capture tag names if requested
          if (shouldIncludeField('tags')) {
            let tagNames = null;
            try {
              const tags = task.tags();
              if (tags && tags.length > 0) {
                tagNames = [];
                for (var ti = 0; ti < tags.length; ti++) {
                  try {
                    tagNames.push(tags[ti].name());
                  } catch (tagErr) {}
                }
              }
            } catch (tagsError) {
              tagNames = null;
            }

            if (tagNames && tagNames.length > 0) {
              taskObj.tags = tagNames;
            }
          }

          // Add richer details if requested and fields are selected
          if (includeDetails || shouldIncludeField('note') || shouldIncludeField('project') || shouldIncludeField('projectId')) {
            try {
              if (shouldIncludeField('note')) {
                taskObj.note = task.note() || '';
              }

              if (shouldIncludeField('project') || shouldIncludeField('projectId')) {
                const project = task.containingProject();
                if (project) {
                  if (shouldIncludeField('project')) {
                    taskObj.project = project.name();
                  }
                  if (shouldIncludeField('projectId')) {
                    taskObj.projectId = project.id();
                  }
                }
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
