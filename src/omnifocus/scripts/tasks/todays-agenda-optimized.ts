import { getBasicHelpers } from '../shared/helpers.js';

/**
 * Optimized script to get today's agenda from OmniFocus
 *
 * Performance optimizations:
 * - Use separate queries for different task categories
 * - Limit total tasks processed
 * - Early returns for better performance
 */
export const TODAYS_AGENDA_OPTIMIZED_SCRIPT = `
  ${getBasicHelpers()}
  
  (() => {
    const options = {{options}};
    const tasks = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
  
  try {
    const app = Application('OmniFocus');
    const doc = app.defaultDocument();
    
    const startTime = Date.now();
    const maxTasks = options.limit || 50;
    
    // Pre-compute option flags
    const checkOverdue = options.includeOverdue !== false;
    const checkDueToday = options.includeDueToday !== false;
    const checkFlagged = options.includeFlagged !== false;
    const includeDetails = options.includeDetails === true;
    
    let dueTodayCount = 0;
    let overdueCount = 0;
    let flaggedCount = 0;
    
    // Strategy: Query specific task sets separately for better performance
    let queryMethod = 'optimized_separate_queries';
    
    // 1. Get overdue tasks (if needed)
    if (checkOverdue && tasks.length < maxTasks) {
      try {
        // CRITICAL PERFORMANCE FIX: Never use whose() - it's catastrophically slow
        // Get all tasks and filter manually for <1 second performance
        const allTasks = doc.flattenedTasks();
        
        // Build list of incomplete tasks with due dates
        const tasksWithDue = [];
        const taskCount = allTasks.length;
        const checkLimit = Math.min(2000, taskCount); // Process up to 2000 tasks
        
        for (let i = 0; i < checkLimit; i++) {
          const task = allTasks[i];
          try {
            // Skip completed tasks first (most common filter)
            if (task.completed()) continue;
            
            // Check for due date
            if (task.dueDate()) {
              tasksWithDue.push(task);
              if (tasksWithDue.length >= 200) break; // Limit results
            }
          } catch (e) {
            // Skip tasks that throw errors
          }
        }
        
        // Process tasks with due dates for overdue check
        const overdueLimit = Math.min(200, tasksWithDue.length);
        
        for (let i = 0; i < overdueLimit && tasks.length < maxTasks; i++) {
          const task = tasksWithDue[i];
          const dueDate = safeGetDate(() => task.dueDate());
          
          if (dueDate && new Date(dueDate) < today) {
            const taskObj = {
              id: safeGet(() => task.id(), 'unknown'),
              name: safeGet(() => task.name(), 'Unnamed Task'),
              dueDate: dueDate,
              reason: 'overdue',
              daysOverdue: Math.floor((today - new Date(dueDate)) / (1000 * 60 * 60 * 24))
            };
            
            if (includeDetails) {
              taskObj.note = safeGet(() => task.note(), '');
              taskObj.flagged = safeGet(() => task.flagged(), false);
              const project = safeGetProject(task);
              if (project) {
                taskObj.project = project.name;
                taskObj.projectId = project.id;
              }
              taskObj.tags = safeGetTags(task);
            }
            
            tasks.push(taskObj);
            overdueCount++;
          }
        }
      } catch (e) {
        // Continue with other queries if this fails
      }
    }
    
    // 2. Get tasks due today (if needed)
    if (checkDueToday && tasks.length < maxTasks) {
      try {
        // CRITICAL PERFORMANCE FIX: Never use whose() - manual filtering is 25x faster
        const allTasks = doc.flattenedTasks();
        
        // Build list of incomplete tasks with due dates
        const tasksWithDue = [];
        const taskCount = allTasks.length;
        const checkLimit = Math.min(2000, taskCount);
        
        for (let i = 0; i < checkLimit; i++) {
          const task = allTasks[i];
          try {
            // Skip completed tasks first
            if (task.completed()) continue;
            
            if (task.dueDate()) {
              tasksWithDue.push(task);
              if (tasksWithDue.length >= 100) break; // Limit for today check
            }
          } catch (e) {
            // Skip tasks that throw errors
          }
        }
        
        const todayLimit = Math.min(100, tasksWithDue.length);
        
        for (let i = 0; i < todayLimit && tasks.length < maxTasks; i++) {
          const task = tasksWithDue[i];
          const dueDate = safeGetDate(() => task.dueDate());
          
          if (dueDate) {
            const dueDateObj = new Date(dueDate);
            if (dueDateObj >= today && dueDateObj < tomorrow) {
              // Check if already added as overdue
              const taskId = safeGet(() => task.id(), 'unknown');
              if (!tasks.some(t => t.id === taskId)) {
                const taskObj = {
                  id: taskId,
                  name: safeGet(() => task.name(), 'Unnamed Task'),
                  dueDate: dueDate,
                  reason: 'due_today'
                };
                
                if (includeDetails) {
                  taskObj.note = safeGet(() => task.note(), '');
                  taskObj.flagged = safeGet(() => task.flagged(), false);
                  const project = safeGetProject(task);
                  if (project) {
                    taskObj.project = project.name;
                    taskObj.projectId = project.id;
                  }
                  taskObj.tags = safeGetTags(task);
                }
                
                tasks.push(taskObj);
                dueTodayCount++;
              }
            }
          }
        }
      } catch (e) {
        // Continue with other queries if this fails
      }
    }
    
    // 3. Get flagged tasks (if needed and still have room)
    if (checkFlagged && tasks.length < maxTasks) {
      try {
        // CRITICAL PERFORMANCE FIX: Manual filtering instead of whose()
        const allTasks = doc.flattenedTasks();
        const flaggedTasks = [];
        const taskCount = allTasks.length;
        
        // Collect flagged incomplete tasks
        for (let i = 0; i < taskCount && flaggedTasks.length < 50; i++) {
          const task = allTasks[i];
          try {
            // Skip completed tasks
            if (task.completed()) continue;
            // Check if flagged
            if (task.flagged()) {
              flaggedTasks.push(task);
            }
          } catch (e) {
            // Skip tasks that throw errors
          }
        }
        
        const flaggedLimit = Math.min(50, flaggedTasks.length);
        
        for (let i = 0; i < flaggedLimit && tasks.length < maxTasks; i++) {
          const task = flaggedTasks[i];
          const taskId = safeGet(() => task.id(), 'unknown');
          
          // Skip if already added
          if (!tasks.some(t => t.id === taskId)) {
            const taskObj = {
              id: taskId,
              name: safeGet(() => task.name(), 'Unnamed Task'),
              flagged: true,
              reason: 'flagged'
            };
            
            const dueDate = safeGetDate(() => task.dueDate());
            if (dueDate) taskObj.dueDate = dueDate;
            
            if (includeDetails) {
              taskObj.note = safeGet(() => task.note(), '');
              const project = safeGetProject(task);
              if (project) {
                taskObj.project = project.name;
                taskObj.projectId = project.id;
              }
              taskObj.tags = safeGetTags(task);
            }
            
            tasks.push(taskObj);
            flaggedCount++;
          }
        }
      } catch (e) {
        // Continue if this fails
      }
    }
    
    // Sort tasks by priority: overdue first, then due today, then flagged
    tasks.sort((a, b) => {
      const reasonOrder = { overdue: 0, due_today: 1, flagged: 2 };
      const aOrder = reasonOrder[a.reason] || 999;
      const bOrder = reasonOrder[b.reason] || 999;
      
      if (aOrder !== bOrder) return aOrder - bOrder;
      
      // Within same reason, sort by due date
      if (a.dueDate && b.dueDate) {
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      }
      
      return 0;
    });
    
    const endTime = Date.now();
    
    return JSON.stringify({
      tasks: tasks,
      summary: {
        total: tasks.length,
        overdue: overdueCount,
        dueToday: dueTodayCount,
        flagged: flaggedCount,
        query_method: queryMethod,
        query_time_ms: endTime - startTime,
        limited: tasks.length >= maxTasks,
        options: options
      }
    });
    
  } catch (error) {
    return formatError(error, 'todays_agenda');
  }
  })();
`;
