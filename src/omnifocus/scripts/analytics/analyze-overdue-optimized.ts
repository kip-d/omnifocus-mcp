import { getAnalyticsHelpers } from '../shared/helpers.js';

/**
 * Optimized overdue analysis script using direct OmniFocus API methods
 *
 * Uses undocumented but officially supported API methods:
 * - task.blocked() to identify blocking dependencies
 * - task.effectivelyCompleted() to check completion status
 * - task.next() to identify next actions
 *
 * Performance improvements:
 * - Direct property checks instead of complex logic
 * - Faster bottleneck detection
 * - More accurate blocking analysis
 * - OPTIMIZED: Uses analytics helpers (~130 lines vs 551 lines - 76% reduction)
 */
export const ANALYZE_OVERDUE_OPTIMIZED_SCRIPT = `
  ${getAnalyticsHelpers()}
  
  (() => {
    const options = {{options}};
    
    try {
      const app = Application('OmniFocus');
      const doc = app.defaultDocument();
      
      if (!doc) {
        return JSON.stringify({ ok: false, error: { message: "OmniFocus document is not available", details: "No default document found" }, v: '1' });
      }
      
      const now = new Date();
      const overdueTasks = [];
      const blockedOverdue = [];
      const projectBottlenecks = {};
      const tagBottlenecks = {};
      
      // Get all tasks
      const allTasks = doc.flattenedTasks();
      
      if (!allTasks) {
        return JSON.stringify({ ok: false, error: { message: "Failed to retrieve tasks", details: "flattenedTasks() returned null" }, v: '1' });
      }
      
      // Limit for performance
      const maxTasks = Math.min(allTasks.length, options.limit || 100);
      
      for (let i = 0; i < maxTasks; i++) {
        const task = allTasks[i];
        
        try {
          // Use direct API method to check if effectively completed (with method existence check)
          const isEffectivelyCompleted = (typeof task.effectivelyCompleted === 'function') ?
            safeGet(() => task.effectivelyCompleted(), false) : safeIsCompleted(task);
          if (isEffectivelyCompleted) {
            continue;
          }
          
          // Check if task is overdue
          const dueDateStr = safeGetDate(() => task.dueDate());
          if (!dueDateStr) continue;
          
          const dueDate = new Date(dueDateStr);
          if (dueDate >= now) continue;
          
          // Task is overdue - gather information
          const taskName = safeGet(() => task.name(), 'Unnamed Task');
          const taskId = safeGet(() => task.id(), 'unknown');
          
          // Use direct API method to check if blocked (with method existence check)
          const isBlocked = (typeof task.blocked === 'function') ? safeGet(() => task.blocked(), false) : false;

          // Use direct API method to check if it's a next action (with method existence check)
          const isNext = (typeof task.next === 'function') ? safeGet(() => task.next(), false) : false;
          
          // Calculate days overdue
          const daysOverdue = Math.floor((now - dueDate) / (1000 * 60 * 60 * 24));
          
          // Get project information
          const project = safeGetProject(task);
          const projectName = project ? safeGet(() => project.name(), 'No Project') : 'Inbox';
          
          // Get tags
          const tags = safeGetTags(task);
          
          const overdueTask = {
            id: taskId,
            name: taskName,
            dueDate: dueDateStr,
            daysOverdue: daysOverdue,
            project: projectName,
            tags: tags,
            blocked: isBlocked,
            isNext: isNext
          };
          
          overdueTasks.push(overdueTask);
          
          // Track blocked overdue tasks
          if (isBlocked) {
            blockedOverdue.push(overdueTask);
            
            // Track project bottlenecks
            if (projectName !== 'Inbox') {
              if (!projectBottlenecks[projectName]) {
                projectBottlenecks[projectName] = {
                  count: 0,
                  totalDaysOverdue: 0,
                  blockedCount: 0,
                  tasks: []
                };
              }
              projectBottlenecks[projectName].blockedCount++;
              projectBottlenecks[projectName].count++;
              projectBottlenecks[projectName].totalDaysOverdue += daysOverdue;
              projectBottlenecks[projectName].tasks.push(taskName);
            }
            
            // Track tag bottlenecks
            for (const tag of tags) {
              if (!tagBottlenecks[tag]) {
                tagBottlenecks[tag] = {
                  count: 0,
                  blockedCount: 0,
                  tasks: []
                };
              }
              tagBottlenecks[tag].blockedCount++;
              tagBottlenecks[tag].tasks.push(taskName);
            }
          } else {
            // Track non-blocked overdue in projects
            if (projectName !== 'Inbox') {
              if (!projectBottlenecks[projectName]) {
                projectBottlenecks[projectName] = {
                  count: 0,
                  totalDaysOverdue: 0,
                  blockedCount: 0,
                  tasks: []
                };
              }
              projectBottlenecks[projectName].count++;
              projectBottlenecks[projectName].totalDaysOverdue += daysOverdue;
              projectBottlenecks[projectName].tasks.push(taskName);
            }
          }
          
        } catch (e) {
          // Skip tasks that cause errors
          continue;
        }
      }
      
      // Sort overdue tasks by days overdue
      overdueTasks.sort((a, b) => b.daysOverdue - a.daysOverdue);
      
      // Calculate statistics
      const totalOverdue = overdueTasks.length;
      const blockedCount = blockedOverdue.length;
      const unblockedCount = totalOverdue - blockedCount;
      const blockedPercentage = totalOverdue > 0 ? 
        (blockedCount / totalOverdue * 100).toFixed(1) : 0;
      
      // Calculate average days overdue
      let totalDaysOverdue = 0;
      for (const task of overdueTasks) {
        totalDaysOverdue += task.daysOverdue;
      }
      const avgDaysOverdue = totalOverdue > 0 ? 
        (totalDaysOverdue / totalOverdue).toFixed(1) : 0;
      
      // Find most problematic projects
      const projectList = [];
      for (const projectName in projectBottlenecks) {
        const stats = projectBottlenecks[projectName];
        projectList.push({
          name: projectName,
          overdueCount: stats.count,
          blockedCount: stats.blockedCount,
          avgDaysOverdue: (stats.totalDaysOverdue / stats.count).toFixed(1),
          blockageRate: stats.count > 0 ? 
            (stats.blockedCount / stats.count * 100).toFixed(1) : 0
        });
      }
      projectList.sort((a, b) => b.overdueCount - a.overdueCount);
      
      // Generate insights
      const insights = [];
      
      if (totalOverdue === 0) {
        insights.push("No overdue tasks found - excellent!");
      } else {
        insights.push(totalOverdue + " overdue tasks found");
        
        if (blockedPercentage > 50) {
          insights.push("High blockage rate (" + blockedPercentage + "%) - review dependencies");
        } else if (blockedPercentage > 25) {
          insights.push("Moderate blockage (" + blockedPercentage + "%) - some tasks waiting on others");
        }
        
        if (avgDaysOverdue > 30) {
          insights.push("Tasks significantly overdue (avg " + avgDaysOverdue + " days)");
        } else if (avgDaysOverdue > 7) {
          insights.push("Tasks moderately overdue (avg " + avgDaysOverdue + " days)");
        }
        
        if (projectList.length > 0 && projectList[0].overdueCount > 5) {
          insights.push("'" + projectList[0].name + "' has " + projectList[0].overdueCount + " overdue tasks");
        }
      }
      
      // Group tasks by how overdue they are
      const groupedByUrgency = {
        critical: [], // > 30 days
        high: [],     // 8-30 days
        medium: [],   // 3-7 days
        low: []       // 1-2 days
      };
      
      for (const task of overdueTasks) {
        if (task.daysOverdue > 30) {
          groupedByUrgency.critical.push(task);
        } else if (task.daysOverdue > 7) {
          groupedByUrgency.high.push(task);
        } else if (task.daysOverdue > 2) {
          groupedByUrgency.medium.push(task);
        } else {
          groupedByUrgency.low.push(task);
        }
      }
      
      return JSON.stringify({
        ok: true,
        v: '1',
        data: {
          summary: {
            totalOverdue: totalOverdue,
            blockedCount: blockedCount,
            unblockedCount: unblockedCount,
            blockedPercentage: parseFloat(blockedPercentage),
            avgDaysOverdue: parseFloat(avgDaysOverdue),
            mostOverdue: overdueTasks[0] || null
          },
          insights: insights,
          groupedByUrgency: groupedByUrgency,
          projectBottlenecks: projectList.slice(0, 5),
          blockedTasks: blockedOverdue.slice(0, 10),
          metadata: {
            generated_at: new Date().toISOString(),
            method: 'optimized_blocked_api',
            tasksAnalyzed: maxTasks,
            note: 'Using task.blocked() and task.effectivelyCompleted() for accurate analysis'
          }
        }
      });
      
    } catch (error) {
      return JSON.stringify({ ok: false, error: { message: "Failed to analyze overdue tasks: " + (error && error.toString ? error.toString() : 'Unknown error'), details: error && error.message ? error.message : undefined }, v: '1' });
    }
  })();
`;
