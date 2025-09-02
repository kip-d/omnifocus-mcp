/**
 * Hybrid today's agenda script using evaluateJavascript bridge
 * Massive performance improvement for daily task views
 */

import { getBasicHelpers } from '../shared/helpers.js';

/**
 * Get today's agenda using Omni Automation API for better performance
 */
export const TODAYS_AGENDA_HYBRID_SCRIPT = `
  ${getBasicHelpers()}
  
  (() => {
    const includeFlagged = {{includeFlagged}};
    const includeOverdue = {{includeOverdue}};
    const includeAvailable = {{includeAvailable}};
    const includeDetails = {{includeDetails}};
    const limit = {{limit}};
    
    try {
      const startTime = Date.now();
      const app = Application('OmniFocus');
      const doc = app.defaultDocument();
      
      // Build the Omni Automation script for fast filtering
      const omniScript = \`
        (() => {
          const now = new Date();
          const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
          const limit = \${limit};
          const includeFlagged = \${includeFlagged};
          const includeOverdue = \${includeOverdue};
          const includeAvailable = \${includeAvailable};
          
          const tasks = [];
          const categories = {
            overdue: [],
            due_today: [],
            flagged: []
          };
          
          // Process all tasks efficiently in Omni Automation
          for (const task of flattenedTasks) {
            // Skip completed tasks
            if (task.completed) continue;
            
            // Check if available (if required)
            if (includeAvailable && (task.blocked || (task.deferDate && task.deferDate > now))) {
              continue;
            }
            
            let includeTask = false;
            let reason = '';
            
            // Check overdue
            if (includeOverdue && task.dueDate && task.dueDate < todayStart) {
              includeTask = true;
              reason = 'overdue';
              categories.overdue.push(task.id.primaryKey);
            }
            // Check due today
            else if (task.dueDate && task.dueDate >= todayStart && task.dueDate < todayEnd) {
              includeTask = true;
              reason = 'due_today';
              categories.due_today.push(task.id.primaryKey);
            }
            // Check flagged
            else if (includeFlagged && task.flagged) {
              includeTask = true;
              reason = 'flagged';
              categories.flagged.push(task.id.primaryKey);
            }
            
            if (includeTask) {
              const taskObj = {
                id: task.id.primaryKey,
                name: task.name,
                reason: reason,
                completed: false,
                flagged: task.flagged,
                blocked: task.blocked || false,
                next: task.next || false
              };
              
              // Add dates
              if (task.dueDate) {
                taskObj.dueDate = task.dueDate.toISOString();
                if (task.dueDate < todayStart) {
                  taskObj.isOverdue = true;
                  taskObj.daysOverdue = Math.floor((todayStart - task.dueDate) / (1000 * 60 * 60 * 24));
                }
              }
              if (task.deferDate) taskObj.deferDate = task.deferDate.toISOString();
              if (task.completionDate) taskObj.completionDate = task.completionDate.toISOString();
              
              // Add project info
              const project = task.containingProject;
              if (project) {
                taskObj.project = project.name;
                taskObj.projectId = project.id.primaryKey;
              }
              
              // Add note if details requested
              if (\${includeDetails} && task.note) {
                taskObj.note = task.note;
              }
              
              // Add tags
              try {
                const tags = task.tags.map(t => t.name);
                if (tags.length > 0) taskObj.tags = tags;
              } catch (e) {
                // No tags
              }
              
              // Add parent task info
              if (task.parent && task.parent !== task.containingProject) {
                taskObj.parentTaskId = task.parent.id.primaryKey;
                taskObj.parentTaskName = task.parent.name;
              }
              
              // Estimated duration
              if (task.estimatedMinutes) {
                taskObj.estimatedMinutes = task.estimatedMinutes;
              }
              
              tasks.push(taskObj);
              
              if (tasks.length >= limit) break;
            }
          }
          
          // Sort tasks by priority: overdue first, then due today, then flagged
          tasks.sort((a, b) => {
            // Overdue comes first
            if (a.reason === 'overdue' && b.reason !== 'overdue') return -1;
            if (b.reason === 'overdue' && a.reason !== 'overdue') return 1;
            
            // Then due today
            if (a.reason === 'due_today' && b.reason === 'flagged') return -1;
            if (b.reason === 'due_today' && a.reason === 'flagged') return 1;
            
            // Within same category, sort by due date
            if (a.dueDate && b.dueDate) {
              return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
            }
            
            // Tasks with due dates before those without
            if (a.dueDate && !b.dueDate) return -1;
            if (!a.dueDate && b.dueDate) return 1;
            
            // Finally by name
            return a.name.localeCompare(b.name);
          });
          
          return JSON.stringify({
            tasks: tasks,
            summary: {
              total: tasks.length,
              overdue: categories.overdue.length,
              due_today: categories.due_today.length,
              flagged: categories.flagged.length
            }
          });
        })()
      \`;
      
      // Execute via bridge
      app.includeStandardAdditions = true;
      const resultJson = app.evaluateJavascript(omniScript);
      const result = JSON.parse(resultJson);
      
      const endTime = Date.now();
      
      // Build response
      return JSON.stringify({
        tasks: result.tasks,
        summary: result.summary,
        metadata: {
          query_time_ms: endTime - startTime,
          query_method: 'hybrid_omni_automation',
          filters: {
            include_flagged: includeFlagged,
            include_overdue: includeOverdue,
            include_available: includeAvailable,
            include_details: includeDetails
          },
          limit_applied: limit,
          reference_date: new Date().toISOString()
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
