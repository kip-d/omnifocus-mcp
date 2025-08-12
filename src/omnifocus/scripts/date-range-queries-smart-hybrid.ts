/**
 * SMART Hybrid implementation using lessons learned
 *
 * Strategy:
 * 1. Use JXA whose() for initial bulk filtering (database-level, fast)
 * 2. Use JXA for date comparisons (already has the data)
 * 3. Use Omni Automation ONLY for properties JXA can't get reliably (tags, some dates)
 * 4. Minimize data transfer between environments
 */

import { getAllHelpers } from './shared/helpers.js';

/**
 * Smart hybrid upcoming tasks - uses JXA for filtering, Omni for enhancement
 */
export const GET_UPCOMING_TASKS_SMART_HYBRID_SCRIPT = `
  ${getAllHelpers()}
  
  (() => {
    const app = Application('OmniFocus');
    const doc = app.defaultDocument();
    const days = {{days}};
    const includeToday = {{includeToday}};
    const limit = {{limit}};
    
    try {
      const startTime = Date.now();
      const now = new Date();
      const startDate = includeToday ? now : new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const endDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
      
      // STEP 1: Use JXA whose() for initial filtering - this is FAST
      const incompleteTasks = doc.flattenedTasks.whose({completed: false})();
      
      // STEP 2: Filter by date in JXA - we already have the data, no need for Omni
      const upcomingTasks = [];
      let count = 0;
      
      for (let i = 0; i < incompleteTasks.length && count < limit; i++) {
        const task = incompleteTasks[i];
        const dueDate = safeGet(() => task.dueDate());
        
        if (dueDate) {
          const dueDateObj = new Date(dueDate);
          if (dueDateObj >= startDate && dueDateObj <= endDate) {
            // Collect basic data we can get reliably from JXA
            upcomingTasks.push({
              id: task.id(),
              name: safeGet(() => task.name()),
              dueDate: dueDateObj.toISOString(),
              flagged: safeGet(() => task.flagged()),
              // Get project info from JXA
              project: safeGet(() => {
                const proj = task.containingProject();
                return proj ? proj.name() : null;
              }),
              projectId: safeGet(() => {
                const proj = task.containingProject();
                return proj ? proj.id() : null;
              }),
              // Calculate in JXA
              daysUntilDue: Math.ceil((dueDateObj - now) / (1000 * 60 * 60 * 24))
            });
            count++;
          }
        }
      }
      
      // Sort by due date
      upcomingTasks.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
      
      // STEP 3: Use Omni Automation ONLY for tags (JXA can't get them reliably)
      // But do it efficiently - batch the IDs
      const taskIds = upcomingTasks.map(t => t.id);
      
      if (taskIds.length > 0) {
        const omniScript = \`
          (() => {
            const taskIds = \${JSON.stringify(taskIds)};
            const tagData = {};
            
            // Get tags for each task - this is what JXA struggles with
            for (const id of taskIds) {
              try {
                const task = Task.byIdentifier(id);
                if (task && task.tags) {
                  tagData[id] = task.tags.map(t => t.name);
                }
              } catch (e) {
                // Task might not exist or have tags
                tagData[id] = [];
              }
            }
            
            return JSON.stringify(tagData);
          })()
        \`;
        
        try {
          app.includeStandardAdditions = true;
          const tagDataJson = app.evaluateJavascript(omniScript);
          const tagData = JSON.parse(tagDataJson);
          
          // Merge tag data with our tasks
          for (const task of upcomingTasks) {
            task.tags = tagData[task.id] || [];
          }
        } catch (e) {
          // If Omni Automation fails, continue without tags
          console.log("Failed to get tags via Omni Automation:", e);
        }
      }
      
      // Add day of week
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      for (const task of upcomingTasks) {
        const dueDateObj = new Date(task.dueDate);
        task.dayOfWeek = dayNames[dueDateObj.getDay()];
      }
      
      const endTime = Date.now();
      
      return JSON.stringify({
        tasks: upcomingTasks,
        summary: {
          total: upcomingTasks.length,
          days_ahead: days,
          include_today: includeToday,
          start_date: startDate.toISOString(),
          end_date: endDate.toISOString(),
          limited: count >= limit,
          query_time_ms: endTime - startTime,
          query_method: 'smart_hybrid_jxa_primary'
        }
      });
      
    } catch (error) {
      return JSON.stringify({
        error: true,
        message: "Failed to get upcoming tasks: " + error.toString(),
        details: error.message
      });
    }
  })();
`;

/**
 * Smart hybrid overdue tasks
 */
export const GET_OVERDUE_TASKS_SMART_HYBRID_SCRIPT = `
  ${getAllHelpers()}
  
  (() => {
    const app = Application('OmniFocus');
    const doc = app.defaultDocument();
    const limit = {{limit}};
    const includeCompleted = {{includeCompleted}};
    
    try {
      const startTime = Date.now();
      const now = new Date();
      
      // STEP 1: Use JXA for initial filtering
      let tasksToCheck;
      if (includeCompleted) {
        // If including completed, we need all tasks
        tasksToCheck = doc.flattenedTasks();
      } else {
        // Use whose() for fast filtering
        tasksToCheck = doc.flattenedTasks.whose({completed: false})();
      }
      
      // STEP 2: Filter for overdue in JXA
      const overdueTasks = [];
      let count = 0;
      
      for (let i = 0; i < tasksToCheck.length && count < limit; i++) {
        const task = tasksToCheck[i];
        
        // Skip completed if needed
        if (!includeCompleted && isTaskEffectivelyCompleted(task)) continue;
        
        const dueDate = safeGet(() => task.dueDate());
        if (dueDate) {
          const dueDateObj = new Date(dueDate);
          if (dueDateObj < now) {
            overdueTasks.push({
              id: task.id(),
              name: safeGet(() => task.name()),
              dueDate: dueDateObj.toISOString(),
              flagged: safeGet(() => task.flagged()),
              completed: safeGet(() => task.completed()),
              project: safeGet(() => {
                const proj = task.containingProject();
                return proj ? proj.name() : null;
              }),
              projectId: safeGet(() => {
                const proj = task.containingProject();
                return proj ? proj.id() : null;
              }),
              daysOverdue: Math.floor((now - dueDateObj) / (1000 * 60 * 60 * 24))
            });
            count++;
          }
        }
      }
      
      // Sort by most overdue first
      overdueTasks.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
      
      // STEP 3: Get tags via Omni Automation (optional enhancement)
      const taskIds = overdueTasks.map(t => t.id);
      
      if (taskIds.length > 0) {
        const omniScript = \`
          (() => {
            const taskIds = \${JSON.stringify(taskIds)};
            const tagData = {};
            
            for (const id of taskIds) {
              try {
                const task = Task.byIdentifier(id);
                if (task && task.tags) {
                  tagData[id] = task.tags.map(t => t.name);
                }
              } catch (e) {
                tagData[id] = [];
              }
            }
            
            return JSON.stringify(tagData);
          })()
        \`;
        
        try {
          app.includeStandardAdditions = true;
          const tagDataJson = app.evaluateJavascript(omniScript);
          const tagData = JSON.parse(tagDataJson);
          
          for (const task of overdueTasks) {
            task.tags = tagData[task.id] || [];
          }
        } catch (e) {
          // Continue without tags if Omni fails
        }
      }
      
      const endTime = Date.now();
      
      return JSON.stringify({
        tasks: overdueTasks,
        summary: {
          total: overdueTasks.length,
          limited: count >= limit,
          query_time_ms: endTime - startTime,
          reference_date: now.toISOString(),
          query_method: 'smart_hybrid_jxa_primary'
        }
      });
      
    } catch (error) {
      return JSON.stringify({
        error: true,
        message: "Failed to get overdue tasks: " + error.toString(),
        details: error.message
      });
    }
  })();
`;

/**
 * For search, we can use Omni Automation's optimized tasksMatching()
 */
export const SEARCH_TASKS_SMART_HYBRID_SCRIPT = `
  (() => {
    const app = Application('OmniFocus');
    const searchTerm = {{searchTerm}};
    const limit = {{limit}};
    
    try {
      const startTime = Date.now();
      
      // Use Omni Automation's optimized search
      const omniScript = \`
        (() => {
          const matches = tasksMatching("\${searchTerm}");
          const limit = \${limit};
          const results = [];
          
          for (let i = 0; i < Math.min(matches.length, limit); i++) {
            const task = matches[i];
            results.push({
              id: task.id.primaryKey,
              name: task.name,
              completed: task.completed,
              flagged: task.flagged,
              dueDate: task.dueDate ? task.dueDate.toISOString() : null,
              deferDate: task.deferDate ? task.deferDate.toISOString() : null,
              project: task.containingProject ? task.containingProject.name : null,
              projectId: task.containingProject ? task.containingProject.id.primaryKey : null,
              tags: task.tags ? task.tags.map(t => t.name) : [],
              note: task.note || null
            });
          }
          
          return JSON.stringify({
            tasks: results,
            total: matches.length,
            limited: matches.length > limit
          });
        })()
      \`;
      
      app.includeStandardAdditions = true;
      const resultJson = app.evaluateJavascript(omniScript);
      const result = JSON.parse(resultJson);
      
      const endTime = Date.now();
      
      return JSON.stringify({
        ...result,
        summary: {
          search_term: searchTerm,
          total: result.total,
          limited: result.limited,
          query_time_ms: endTime - startTime,
          query_method: 'omni_tasks_matching'
        }
      });
      
    } catch (error) {
      return JSON.stringify({
        error: true,
        message: "Failed to search tasks: " + error.toString()
      });
    }
  })();
`;
