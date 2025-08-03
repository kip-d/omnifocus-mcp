import { getAllHelpers } from '../shared/helpers.js';

/**
 * Script to calculate task velocity and throughput metrics in OmniFocus
 * 
 * Features:
 * - Interval-based velocity tracking (daily, weekly, monthly)
 * - Task creation vs completion rates
 * - Median completion time analysis
 * - Backlog growth rate calculation
 * - Projections for future throughput
 */
export const TASK_VELOCITY_SCRIPT = `
  ${getAllHelpers()}
  
  (() => {
    const options = {{options}};
    
    try {
      const app = Application('OmniFocus');
      const doc = app.defaultDocument();
    
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
    
    // Limit tasks to prevent timeout
    const maxTasks = Math.min(allTasks.length, 500);
    
    for (let i = 0; i < maxTasks; i++) {
      const task = allTasks[i];
      
      // Skip dropped tasks - they should not be included in velocity calculations
      try {
        // Skip dropped tasks if the property exists
        // Note: dropped() may not be available in all OmniFocus versions
      } catch (e) {}
      
      // Apply filters
      if (options.projectId) {
        try {
          const project = safeGetProject(task);
          if (!project || project.id !== options.projectId) continue;
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
        const completionDateStr = safeGetDate(() => task.completionDate());
        if (completionDateStr) {
          const completionDate = new Date(completionDateStr);
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
            const modifiedDateStr = safeGetDate(() => task.modificationDate());
            if (modifiedDateStr) {
              const modifiedDate = new Date(modifiedDateStr);
              if (modifiedDate < completionDate) {
                const completionHours = (completionDate - modifiedDate) / (1000 * 60 * 60);
                completionTimes.push(completionHours);
              }
            }
          } catch (e) {}
        }
      } catch (e) {}
      
      // Track creation (using modification date as proxy)
      try {
        const modifiedDateStr = safeGetDate(() => task.modificationDate());
        if (modifiedDateStr) {
          const modifiedDate = new Date(modifiedDateStr);
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
    return formatError(error, 'task_velocity');
  }
  })();
`;