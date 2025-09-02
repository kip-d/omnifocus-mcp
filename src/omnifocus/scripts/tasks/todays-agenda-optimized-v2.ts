/**
 * Today's agenda script OPTIMIZED without whose()
 * Manual filtering is 7x faster than whose() with large databases
 */

import { getBasicHelpers } from '../shared/helpers.js';

export const TODAYS_AGENDA_OPTIMIZED_NO_WHOSE_SCRIPT = `
  ${getBasicHelpers()}
  
  (() => {
    const app = Application('OmniFocus');
    const doc = app.defaultDocument();
    
    const includeFlagged = {{includeFlagged}};
    const includeOverdue = {{includeOverdue}};
    const includeAvailable = {{includeAvailable}};
    const includeDetails = {{includeDetails}};
    const limit = {{limit}};
    
    try {
      const startTime = Date.now();
      const now = new Date();
      const todayStart = new Date(now);
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date(now);
      todayEnd.setHours(23, 59, 59, 999);
      
      // CRITICAL OPTIMIZATION: Get ALL tasks then filter manually
      // This is 7x faster than using whose({completed: false})
      const allTasks = doc.flattenedTasks();
      
      const tasks = {
        overdue: [],
        dueToday: [],
        flagged: []
      };
      
      let processedCount = 0;
      let totalAdded = 0;
      
      // Process all tasks manually (faster than whose())
      for (let i = 0; i < allTasks.length && totalAdded < limit; i++) {
        const task = allTasks[i];
        processedCount++;
        
        // Skip completed tasks
        if (safeGet(() => task.completed())) continue;
        
        // Check if available
        if (includeAvailable && safeGet(() => !isTaskAvailable(task))) continue;
        
        const dueDate = safeGet(() => task.dueDate());
        const dueDateObj = dueDate ? new Date(dueDate) : null;
        const flagged = safeGet(() => task.flagged());
        
        let added = false;
        
        // Check overdue
        if (includeOverdue && dueDateObj && dueDateObj < todayStart) {
          const project = safeGet(() => task.containingProject());
          tasks.overdue.push({
            id: safeGet(() => task.id()),
            name: safeGet(() => task.name()),
            dueDate: dueDateObj.toISOString(),
            flagged: flagged,
            project: project ? safeGet(() => project.name()) : null,
            projectId: project ? safeGet(() => project.id()) : null,
            daysOverdue: Math.floor((now - dueDateObj) / (1000 * 60 * 60 * 24)),
            note: includeDetails ? safeGet(() => task.note()) || null : undefined
          });
          added = true;
          totalAdded++;
        }
        
        // Check due today
        else if (dueDateObj && dueDateObj >= todayStart && dueDateObj <= todayEnd) {
          const project = safeGet(() => task.containingProject());
          tasks.dueToday.push({
            id: safeGet(() => task.id()),
            name: safeGet(() => task.name()),
            dueDate: dueDateObj.toISOString(),
            flagged: flagged,
            project: project ? safeGet(() => project.name()) : null,
            projectId: project ? safeGet(() => project.id()) : null,
            note: includeDetails ? safeGet(() => task.note()) || null : undefined
          });
          added = true;
          totalAdded++;
        }
        
        // Check flagged (only if not already added)
        if (!added && includeFlagged && flagged) {
          const project = safeGet(() => task.containingProject());
          tasks.flagged.push({
            id: safeGet(() => task.id()),
            name: safeGet(() => task.name()),
            dueDate: dueDateObj ? dueDateObj.toISOString() : null,
            flagged: true,
            project: project ? safeGet(() => project.name()) : null,
            projectId: project ? safeGet(() => project.id()) : null,
            note: includeDetails ? safeGet(() => task.note()) || null : undefined
          });
          totalAdded++;
        }
      }
      
      // Sort tasks
      tasks.overdue.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
      tasks.dueToday.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
      
      // Combine into final list
      const allAgendaTasks = [
        ...tasks.overdue,
        ...tasks.dueToday,
        ...tasks.flagged
      ];
      
      const endTime = Date.now();
      
      return JSON.stringify({
        tasks: allAgendaTasks,
        date: now.toISOString(),
        summary: {
          overdue: tasks.overdue.length,
          due_today: tasks.dueToday.length,
          flagged: tasks.flagged.length,
          total: allAgendaTasks.length,
          limited: totalAdded >= limit,
          tasks_scanned: processedCount,
          query_time_ms: endTime - startTime,
          optimization_used: 'optimized_no_whose'
        },
        filters_applied: {
          include_flagged: includeFlagged,
          include_overdue: includeOverdue,
          include_available: includeAvailable,
          include_details: includeDetails,
          limit: limit
        }
      });
      
    } catch (error) {
      return JSON.stringify({
        error: true,
        message: "Failed to get today's agenda: " + error.toString(),
        details: error.message
      });
    }
  })();
`;
