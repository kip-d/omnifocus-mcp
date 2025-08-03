import { getAllHelpers } from '../shared/helpers.js';

/**
 * Script to analyze overdue tasks in OmniFocus
 * 
 * Features:
 * - Overdue task identification and aging analysis
 * - Chronically overdue task detection (3+ months)
 * - Group analysis by project, tag, age, or priority
 * - Pattern detection and recommendations
 * - Recently completed overdue task tracking
 */
export const OVERDUE_ANALYSIS_SCRIPT = `
  const options = {{options}};
  
  ${getAllHelpers()}
  
  // Helper to check if task is completed (add if not in helpers)
  function safeIsCompleted(task) {
    try {
      return task.completed() === true;
    } catch (e) {
      return false;
    }
  }
  
  // Helper to check if task is flagged (add if not in helpers)
  function safeIsFlagged(task) {
    try {
      return task.flagged() === true;
    } catch (e) {
      return false;
    }
  }
  
  try {
    const app = Application('OmniFocus');
    const doc = app.defaultDocument();
    
    const now = new Date();
    // Use same overdue definition as todays_agenda: midnight today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const overdueTasks = [];
    const patterns = {};
    const groupedAnalysis = {};
    
    const allTasks = doc.flattenedTasks();
    
    // Check if allTasks is null or undefined
    if (!allTasks) {
      return JSON.stringify({
        error: true,
        message: "Failed to retrieve tasks from OmniFocus. The document may not be available or OmniFocus may not be running properly.",
        details: "doc.flattenedTasks() returned null or undefined"
      });
    }
    let totalOverdue = 0;
    let recentlyCompletedOverdue = 0;
    let chronicallyOverdue = 0;
    
    // Age buckets for overdue tasks
    const ageBuckets = {
      '1-7 days': 0,
      '1-2 weeks': 0,
      '2-4 weeks': 0,
      '1-3 months': 0,
      '3+ months': 0
    };
    
    for (let i = 0; i < allTasks.length && overdueTasks.length < options.limit; i++) {
      const task = allTasks[i];
      
      try {
        // Skip dropped tasks - they should not be included in overdue analysis
        // Skip dropped tasks if the property exists
        // Note: dropped() may not be available in all OmniFocus versions
        
        const dueDateStr = safeGetDate(() => task.dueDate());
        if (!dueDateStr) continue;
        
        const dueDate = new Date(dueDateStr);
        const completed = safeIsCompleted(task);
        const completionDateStr = completed ? safeGetDate(() => task.completionDate()) : null;
        const completionDate = completionDateStr ? new Date(completionDateStr) : null;
        
        // Check if overdue
        let isOverdue = false;
        let overdueBy = 0;
        
        if (!completed && dueDate < today) {
          isOverdue = true;
          overdueBy = now - dueDate;
          totalOverdue++;
        } else if (completed && completionDate && completionDate > dueDate && options.includeRecentlyCompleted) {
          isOverdue = true;
          overdueBy = completionDate - dueDate;
          recentlyCompletedOverdue++;
        }
        
        if (isOverdue) {
          const overdueDays = Math.ceil(overdueBy / (1000 * 60 * 60 * 24));
          
          // Categorize by age
          if (overdueDays <= 7) {
            ageBuckets['1-7 days']++;
          } else if (overdueDays <= 14) {
            ageBuckets['1-2 weeks']++;
          } else if (overdueDays <= 28) {
            ageBuckets['2-4 weeks']++;
          } else if (overdueDays <= 90) {
            ageBuckets['1-3 months']++;
          } else {
            ageBuckets['3+ months']++;
            chronicallyOverdue++;
          }
          
          // Build task info
          const taskInfo = {
            id: safeGet(() => task.id(), 'unknown'),
            name: safeGet(() => task.name(), 'Unnamed Task'),
            dueDate: dueDateStr,
            overdueDays: overdueDays,
            completed: completed,
            flagged: safeIsFlagged(task)
          };
          
          // Add optional fields
          try {
            const project = safeGetProject(task);
            if (project) {
              taskInfo.project = project.name;
              taskInfo.projectId = project.id;
            }
          } catch (e) {}
          
          try {
            const tags = safeGetTags(task);
            taskInfo.tags = tags;
          } catch (e) {
            taskInfo.tags = [];
          }
          
          if (completionDate) {
            taskInfo.completionDate = completionDate.toISOString();
          }
          
          overdueTasks.push(taskInfo);
          
          // Group analysis
          let groupKey = 'Other';
          switch(options.groupBy) {
            case 'project':
              groupKey = taskInfo.project || 'No Project';
              break;
            case 'tag':
              groupKey = taskInfo.tags.length > 0 ? taskInfo.tags[0] : 'No Tags';
              break;
            case 'age':
              if (overdueDays <= 7) groupKey = '1-7 days';
              else if (overdueDays <= 14) groupKey = '1-2 weeks';
              else if (overdueDays <= 28) groupKey = '2-4 weeks';
              else if (overdueDays <= 90) groupKey = '1-3 months';
              else groupKey = '3+ months';
              break;
            case 'priority':
              groupKey = taskInfo.flagged ? 'Flagged' : 'Normal';
              break;
          }
          
          if (!groupedAnalysis[groupKey]) {
            groupedAnalysis[groupKey] = {
              count: 0,
              avgOverdueDays: 0,
              tasks: []
            };
          }
          
          groupedAnalysis[groupKey].count++;
          groupedAnalysis[groupKey].avgOverdueDays += overdueDays;
          groupedAnalysis[groupKey].tasks.push(taskInfo);
        }
      } catch (e) {
        continue;
      }
    }
    
    // Calculate averages for groups
    const groupKeys = Object.keys(groupedAnalysis || {});
    for (let i = 0; i < groupKeys.length; i++) {
      const group = groupKeys[i];
      const g = groupedAnalysis[group];
      if (g && g.count > 0) {
        g.avgOverdueDays = (g.avgOverdueDays / g.count).toFixed(1);
        // Only keep top 5 tasks per group
        g.tasks = g.tasks.slice(0, 5);
      }
    }
    
    // Identify patterns
    let mostOverdueProject = null;
    try {
      const entries = Object.entries(groupedAnalysis || {});
      mostOverdueProject = entries
        .filter(([key, _]) => options.groupBy === 'project')
        .sort((a, b) => (b[1].count || 0) - (a[1].count || 0))[0];
    } catch (e) {
      // Handle any errors with object operations
    }
    
    const recommendations = [];
    
    if (chronicallyOverdue > 5) {
      recommendations.push({
        type: 'chronic_overdue',
        message: 'You have ' + chronicallyOverdue + ' tasks overdue by more than 3 months. Consider reviewing if these are still relevant.',
        priority: 'high'
      });
    }
    
    if (mostOverdueProject && mostOverdueProject[1].count > 5) {
      recommendations.push({
        type: 'project_bottleneck',
        message: 'Project "' + mostOverdueProject[0] + '" has ' + mostOverdueProject[1].count + ' overdue tasks. This project may need attention.',
        priority: 'medium'
      });
    }
    
    if (totalOverdue > 20) {
      recommendations.push({
        type: 'overdue_backlog',
        message: 'You have ' + totalOverdue + ' overdue tasks. Consider batch processing or rescheduling.',
        priority: 'high'
      });
    }
    
    return JSON.stringify({
      summary: {
        totalOverdue: totalOverdue,
        recentlyCompletedOverdue: recentlyCompletedOverdue,
        chronicallyOverdue: chronicallyOverdue,
        ageBuckets: ageBuckets
      },
      overdueTasks: overdueTasks,
      patterns: {
        mostOverdueGroup: mostOverdueProject ? mostOverdueProject[0] : null,
        avgOverdueDays: overdueTasks.length > 0 ? 
          (overdueTasks.reduce((sum, t) => sum + t.overdueDays, 0) / overdueTasks.length).toFixed(1) : 0
      },
      recommendations: recommendations,
      groupedAnalysis: groupedAnalysis
    });
  } catch (error) {
    return formatError(error, 'overdue_analysis');
  }
`;