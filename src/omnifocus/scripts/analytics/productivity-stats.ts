import { getAllHelpers } from '../shared/helpers.js';

/**
 * Script to calculate productivity statistics in OmniFocus
 * 
 * Features:
 * - Period-based analysis (today, week, month, quarter, year)
 * - Completion rate tracking
 * - On-time vs overdue completion analysis
 * - Daily task completion trends
 * - Grouping by project, tag, or day
 */
export const PRODUCTIVITY_STATS_SCRIPT = `
  ${getAllHelpers()}
  
  (() => {
    const options = {{options}};
  
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
    const stats = {};
    const periodStart = new Date();
    
    // Calculate period start date
    switch(options.period) {
      case 'today':
        periodStart.setHours(0, 0, 0, 0);
        break;
      case 'week':
        periodStart.setDate(now.getDate() - 7);
        break;
      case 'month':
        periodStart.setMonth(now.getMonth() - 1);
        break;
      case 'quarter':
        periodStart.setMonth(now.getMonth() - 3);
        break;
      case 'year':
        periodStart.setFullYear(now.getFullYear() - 1);
        break;
    }
    
    const allTasks = doc.flattenedTasks();
    
    // Check if allTasks is null or undefined
    if (!allTasks) {
      return JSON.stringify({
        error: true,
        message: "Failed to retrieve tasks from OmniFocus. The document may not be available or OmniFocus may not be running properly.",
        details: "doc.flattenedTasks() returned null or undefined"
      });
    }
    let totalTasks = 0;
    let completedTasks = 0;
    let createdTasks = 0;
    let overdueCompleted = 0;
    let onTimeCompleted = 0;
    
    const groupedStats = {};
    const dailyStats = {};
    
    // Add a reasonable limit to prevent timeouts
    const maxTasks = Math.min(allTasks.length, 500);
    
    for (let i = 0; i < maxTasks; i++) {
      const task = allTasks[i];
      
      // Skip dropped tasks if the property exists
      // Note: dropped() may not be available in all OmniFocus versions
      
      // Check if task is in period
      let inPeriod = false;
      let createdInPeriod = false;
      
      try {
        const completionDateStr = safeGetDate(() => task.completionDate());
        if (completionDateStr) {
          const completionDate = new Date(completionDateStr);
          if (completionDate >= periodStart) {
            inPeriod = true;
            completedTasks++;
            
            // Check if completed on time
            const dueDateStr = safeGetDate(() => task.dueDate());
            if (dueDateStr) {
              const dueDate = new Date(dueDateStr);
              if (completionDate > dueDate) {
                overdueCompleted++;
              } else {
                onTimeCompleted++;
              }
            }
            
            // Daily stats
            const dayKey = completionDateStr.split('T')[0];
            dailyStats[dayKey] = (dailyStats[dayKey] || 0) + 1;
          }
        }
      } catch (e) {}
      
      // Check creation date (if available through modified date as proxy)
      try {
        const modifiedDateStr = safeGetDate(() => task.modificationDate());
        if (modifiedDateStr) {
          const modifiedDate = new Date(modifiedDateStr);
          if (modifiedDate >= periodStart) {
            createdInPeriod = true;
            createdTasks++;
          }
        }
      } catch (e) {}
      
      if (inPeriod || createdInPeriod) {
        totalTasks++;
        
        // Group by requested dimension
        let groupKey = 'Other';
        
        switch(options.groupBy) {
          case 'project':
            try {
              const project = safeGetProject(task);
              groupKey = project ? project.name : 'No Project';
            } catch (e) {}
            break;
          case 'tag':
            try {
              const tags = safeGetTags(task);
              groupKey = tags.length > 0 ? tags[0] : 'No Tags';
            } catch (e) {}
            break;
          case 'day':
            try {
              const dateStr = safeGetDate(() => task.completionDate()) || safeGetDate(() => task.modificationDate());
              if (dateStr) {
                groupKey = new Date(dateStr).toLocaleDateString();
              }
            } catch (e) {}
            break;
        }
        
        if (!groupedStats[groupKey]) {
          groupedStats[groupKey] = {
            total: 0,
            completed: 0,
            overdue: 0,
            flagged: 0
          };
        }
        
        groupedStats[groupKey].total++;
        if (safeIsCompleted(task)) groupedStats[groupKey].completed++;
        if (safeIsFlagged(task)) groupedStats[groupKey].flagged++;
      }
    }
    
    // Calculate completion rate
    const completionRate = totalTasks > 0 ? (completedTasks / totalTasks * 100).toFixed(1) : 0;
    const onTimeRate = completedTasks > 0 ? (onTimeCompleted / completedTasks * 100).toFixed(1) : 0;
    
    // Calculate daily average
    const daysInPeriod = Math.ceil((now - periodStart) / (1000 * 60 * 60 * 24));
    const dailyAverage = (completedTasks / daysInPeriod).toFixed(1);
    
    // Find best and worst days
    let dailyValues = [];
    try {
      // Convert dailyStats object to array of values
      const keys = Object.keys(dailyStats || {});
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        if (dailyStats[key] !== undefined) {
          dailyValues.push(dailyStats[key]);
        }
      }
    } catch (e) {
      dailyValues = [];
    }
    let bestDay = 0;
    let worstDay = 0;
    if (dailyValues.length > 0) {
      bestDay = dailyValues[0];
      worstDay = dailyValues[0];
      for (let i = 1; i < dailyValues.length; i++) {
        if (dailyValues[i] > bestDay) bestDay = dailyValues[i];
        if (dailyValues[i] < worstDay) worstDay = dailyValues[i];
      }
    }
    
    return JSON.stringify({
      stats: groupedStats,
      summary: {
        period: options.period,
        totalTasks: totalTasks,
        completedTasks: completedTasks,
        createdTasks: createdTasks,
        completionRate: parseFloat(completionRate),
        onTimeRate: parseFloat(onTimeRate),
        dailyAverage: parseFloat(dailyAverage),
        overdueCompleted: overdueCompleted,
        onTimeCompleted: onTimeCompleted
      },
      trends: {
        dailyStats: dailyStats,
        bestDay: bestDay,
        worstDay: worstDay,
        daysInPeriod: daysInPeriod
      }
    });
  } catch (error) {
    return formatError(error, 'productivity_stats');
  }
  })();
`;