// Import shared safe utilities
import { SAFE_UTILITIES_SCRIPT } from './tasks.js';

export const PRODUCTIVITY_STATS_SCRIPT = `
  const options = {{options}};
  
  ${SAFE_UTILITIES_SCRIPT}
  
  try {
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
    
    for (let i = 0; i < allTasks.length; i++) {
      const task = allTasks[i];
      
      // Skip dropped tasks - they should not be included in productivity stats
      try {
        if (safeGet(() => task.dropped && task.dropped(), false)) continue;
      } catch (e) {}
      
      // Check if task is in period
      let inPeriod = false;
      let createdInPeriod = false;
      
      try {
        const completionDate = safeGetDate(() => task.completionDate);
        if (completionDate && completionDate >= periodStart) {
          inPeriod = true;
          completedTasks++;
          
          // Check if completed on time
          const dueDate = safeGetDate(() => task.dueDate);
          if (dueDate) {
            if (completionDate > dueDate) {
              overdueCompleted++;
            } else {
              onTimeCompleted++;
            }
          }
          
          // Daily stats
          const dayKey = completionDate.toISOString().split('T')[0];
          dailyStats[dayKey] = (dailyStats[dayKey] || 0) + 1;
        }
      } catch (e) {}
      
      // Check creation date (if available through modified date as proxy)
      try {
        const modifiedDate = safeGetDate(() => task.modificationDate);
        if (modifiedDate && modifiedDate >= periodStart) {
          createdInPeriod = true;
          createdTasks++;
        }
      } catch (e) {}
      
      if (inPeriod || createdInPeriod || !safeIsCompleted(task)) {
        totalTasks++;
        
        // Group by requested dimension
        let groupKey = 'Other';
        
        switch(options.groupBy) {
          case 'project':
            try {
              const project = safeGetProject(task);
              groupKey = project ? project.name() : 'No Project';
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
              const date = safeGetDate(() => task.completionDate) || safeGetDate(() => task.modificationDate);
              if (date) {
                groupKey = date.toLocaleDateString();
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
      for (let key in dailyStats) {
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
    return JSON.stringify({
      error: true,
      message: "Failed to calculate productivity stats: " + error.toString()
    });
  }
`;

export const TASK_VELOCITY_SCRIPT = `
  const options = {{options}};
  
  ${SAFE_UTILITIES_SCRIPT}
  
  try {
    const now = new Date();
    const velocityData = [];
    const throughput = {};
    
    // Calculate period intervals
    const intervals = [];
    const intervalDays = options.period === 'day' ? 1 : options.period === 'week' ? 7 : 30;
    const numIntervals = options.period === 'day' ? 30 : options.period === 'week' ? 12 : 12;
    
    for (let i = 0; i < numIntervals; i++) {
      const intervalEnd = new Date(now);
      intervalEnd.setDate(intervalEnd.getDate() - (i * intervalDays));
      const intervalStart = new Date(intervalEnd);
      intervalStart.setDate(intervalStart.getDate() - intervalDays);
      
      intervals.push({
        start: intervalStart,
        end: intervalEnd,
        created: 0,
        completed: 0,
        label: intervalEnd.toLocaleDateString()
      });
    }
    
    // Analyze tasks
    const allTasks = doc.flattenedTasks();
    
    // Check if allTasks is null or undefined
    if (!allTasks) {
      return JSON.stringify({
        error: true,
        message: "Failed to retrieve tasks from OmniFocus. The document may not be available or OmniFocus may not be running properly.",
        details: "doc.flattenedTasks() returned null or undefined"
      });
    }
    let totalCompleted = 0;
    let totalCreated = 0;
    const completionTimes = [];
    
    for (let i = 0; i < allTasks.length; i++) {
      const task = allTasks[i];
      
      // Skip dropped tasks - they should not be included in velocity calculations
      try {
        if (safeGet(() => task.dropped && task.dropped(), false)) continue;
      } catch (e) {}
      
      // Apply filters
      if (options.projectId) {
        try {
          const project = safeGetProject(task);
          if (!project || project.id() !== options.projectId) continue;
        } catch (e) {
          continue;
        }
      }
      
      if (options.tags && options.tags.length > 0) {
        try {
          const taskTags = safeGetTags(task);
          const hasTag = options.tags.some(tag => taskTags.includes(tag));
          if (!hasTag) continue;
        } catch (e) {
          continue;
        }
      }
      
      // Track completion
      try {
        const completionDate = safeGetDate(() => task.completionDate);
        if (completionDate) {
          totalCompleted++;
          
          // Find which interval this belongs to
          for (const interval of intervals) {
            if (completionDate >= interval.start && completionDate < interval.end) {
              interval.completed++;
              break;
            }
          }
          
          // Calculate completion time if we have creation date
          try {
            const modifiedDate = safeGetDate(() => task.modificationDate);
            if (modifiedDate && modifiedDate < completionDate) {
              const completionHours = (completionDate - modifiedDate) / (1000 * 60 * 60);
              completionTimes.push(completionHours);
            }
          } catch (e) {}
        }
      } catch (e) {}
      
      // Track creation (using modification date as proxy)
      try {
        const modifiedDate = safeGetDate(() => task.modificationDate);
        if (modifiedDate) {
          for (const interval of intervals) {
            if (modifiedDate >= interval.start && modifiedDate < interval.end) {
              interval.created++;
              totalCreated++;
              break;
            }
          }
        }
      } catch (e) {}
    }
    
    // Calculate velocity metrics
    const recentIntervals = intervals.slice(0, 4);
    const avgCompleted = recentIntervals.reduce((sum, i) => sum + i.completed, 0) / recentIntervals.length;
    const avgCreated = recentIntervals.reduce((sum, i) => sum + i.created, 0) / recentIntervals.length;
    
    // Calculate median completion time
    let medianCompletionTime = 0;
    if (completionTimes.length > 0) {
      completionTimes.sort((a, b) => a - b);
      const mid = Math.floor(completionTimes.length / 2);
      medianCompletionTime = completionTimes.length % 2 === 0 ?
        (completionTimes[mid - 1] + completionTimes[mid]) / 2 :
        completionTimes[mid];
    }
    
    // Calculate projections
    const velocity = avgCompleted / intervalDays;
    const backlogGrowth = avgCreated - avgCompleted;
    
    return JSON.stringify({
      velocity: {
        period: options.period,
        averageCompleted: avgCompleted.toFixed(1),
        averageCreated: avgCreated.toFixed(1),
        dailyVelocity: velocity.toFixed(2),
        backlogGrowthRate: backlogGrowth.toFixed(1)
      },
      throughput: {
        intervals: intervals.reverse(), // Show chronologically
        totalCompleted: totalCompleted,
        totalCreated: totalCreated
      },
      breakdown: {
        medianCompletionHours: medianCompletionTime.toFixed(1),
        tasksAnalyzed: allTasks.length
      },
      projections: {
        tasksPerDay: velocity.toFixed(2),
        tasksPerWeek: (velocity * 7).toFixed(1),
        tasksPerMonth: (velocity * 30).toFixed(1)
      }
    });
  } catch (error) {
    return JSON.stringify({
      error: true,
      message: "Failed to calculate task velocity: " + error.toString()
    });
  }
`;

export const OVERDUE_ANALYSIS_SCRIPT = `
  const options = {{options}};
  
  ${SAFE_UTILITIES_SCRIPT}
  
  try {
    const now = new Date();
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
        if (safeGet(() => task.dropped && task.dropped(), false)) continue;
        
        const dueDate = safeGetDate(() => task.dueDate);
        if (!dueDate) continue;
        
        const completed = safeIsCompleted(task);
        const completionDate = completed ? safeGetDate(() => task.completionDate) : null;
        
        // Check if overdue
        let isOverdue = false;
        let overdueBy = 0;
        
        if (!completed && dueDate < now) {
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
            dueDate: dueDate.toISOString(),
            overdueDays: overdueDays,
            completed: completed,
            flagged: safeIsFlagged(task)
          };
          
          // Add optional fields
          try {
            const project = safeGetProject(task);
            if (project) {
              taskInfo.project = project.name();
              taskInfo.projectId = project.id();
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
    for (const group in groupedAnalysis) {
      const g = groupedAnalysis[group];
      g.avgOverdueDays = (g.avgOverdueDays / g.count).toFixed(1);
      // Only keep top 5 tasks per group
      g.tasks = g.tasks.slice(0, 5);
    }
    
    // Identify patterns
    const mostOverdueProject = Object.entries(groupedAnalysis)
      .filter(([key, _]) => options.groupBy === 'project')
      .sort((a, b) => b[1].count - a[1].count)[0];
    
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
    return JSON.stringify({
      error: true,
      message: "Failed to analyze overdue tasks: " + error.toString()
    });
  }
`;
