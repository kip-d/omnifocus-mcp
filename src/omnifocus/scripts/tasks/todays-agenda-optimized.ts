import { getAllHelpers } from '../shared/helpers.js';

/**
 * Optimized script to get today's agenda from OmniFocus
 *
 * Performance optimizations:
 * - Use separate queries for different task categories
 * - Limit total tasks processed
 * - Early returns for better performance
 */
export const TODAYS_AGENDA_OPTIMIZED_SCRIPT = `
  ${getAllHelpers()}
  
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
        // Get incomplete tasks first, then filter for due dates manually
        // Note: {_not: null} doesn't work in JXA
        const incompleteTasks = doc.flattenedTasks.whose({
          completed: false
        })();
        
        // Build list of tasks with due dates
        const tasksWithDue = [];
        const checkLimit = Math.min(1000, incompleteTasks.length); // Limit initial scan
        
        for (let i = 0; i < checkLimit; i++) {
          const task = incompleteTasks[i];
          try {
            if (task.dueDate()) {
              tasksWithDue.push(task);
              if (tasksWithDue.length >= 200) break; // Limit results
            }
          } catch (e) {
            // Skip tasks without due dates
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
        // Get incomplete tasks first, then filter for due dates manually
        const incompleteTasks = doc.flattenedTasks.whose({
          completed: false
        })();
        
        // Build list of tasks with due dates (if not already done)
        const tasksWithDue = [];
        const checkLimit = Math.min(1000, incompleteTasks.length);
        
        for (let i = 0; i < checkLimit; i++) {
          const task = incompleteTasks[i];
          try {
            if (task.dueDate()) {
              tasksWithDue.push(task);
              if (tasksWithDue.length >= 100) break; // Limit for today check
            }
          } catch (e) {
            // Skip tasks without due dates
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
        const flaggedTasks = doc.flattenedTasks.whose({
          completed: false,
          flagged: true
        })();
        
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
