import { getUnifiedHelpers } from '../shared/helpers.js';

/**
 * Script to calculate task velocity and throughput metrics in OmniFocus
 *
 * Optimizations:
 * - Removed artificial 500-task limit for better accuracy
 * - Now analyzes ALL tasks for comprehensive velocity metrics
 * - Uses JXA for best performance balance (OmniJS bridge has too much overhead for this operation)
 *
 * Features:
 * - Interval-based velocity tracking (daily, weekly, monthly)
 * - Task creation vs completion rates
 * - Median completion time analysis
 * - Backlog growth rate calculation
 * - Projections for future throughput
 */
export const TASK_VELOCITY_SCRIPT = `
  ${getUnifiedHelpers()}
  
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
    
    // Analyze tasks - remove 500-task limit for better accuracy
    const allTasks = doc.flattenedTasks();

    if (!allTasks) {
      return JSON.stringify({ ok: false, error: { message: "Failed to retrieve tasks from OmniFocus", details: "doc.flattenedTasks() returned null or undefined" }, v: '1' });
    }

    let totalCompleted = 0;
    let totalCreated = 0;
    const completionTimes = [];
    let medianCompletionTime = 0;

    // Process ALL tasks (removed artificial 500-task limit)
    const tasksAnalyzed = allTasks.length;

    for (let i = 0; i < allTasks.length; i++) {
      const task = allTasks[i];

      try {
        const completionDateStr = safeGetDate(() => task.completionDate());
        if (completionDateStr) {
          const completionDate = new Date(completionDateStr);
          totalCompleted++;

          for (const interval of intervals) {
            if (completionDate >= interval.start && completionDate < interval.end) {
              interval.completed++;
              break;
            }
          }

          const modifiedDateStr = safeGetDate(() => task.modificationDate());
          if (modifiedDateStr) {
            const modifiedDate = new Date(modifiedDateStr);
            if (modifiedDate < completionDate) {
              const completionHours = (completionDate - modifiedDate) / (1000 * 60 * 60);
              completionTimes.push(completionHours);
            }
          }
        }
      } catch (e) {}

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

    // Calculate median
    if (completionTimes.length > 0) {
      completionTimes.sort((a, b) => a - b);
      const mid = Math.floor(completionTimes.length / 2);
      medianCompletionTime = completionTimes.length % 2 === 0 ?
        (completionTimes[mid - 1] + completionTimes[mid]) / 2 :
        completionTimes[mid];
    }

    // Calculate velocity metrics
    const recentIntervals = intervals.slice(0, 4);
    const avgCompleted = recentIntervals.reduce((sum, i) => sum + i.completed, 0) / recentIntervals.length;
    const avgCreated = recentIntervals.reduce((sum, i) => sum + i.created, 0) / recentIntervals.length;
    
    // Calculate projections
    const velocity = avgCompleted / intervalDays;
    const backlogGrowth = avgCreated - avgCompleted;
    
    return JSON.stringify({
      ok: true,
      v: '1',
      data: {
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
          tasksAnalyzed: tasksAnalyzed
        },
        projections: {
          tasksPerDay: velocity.toFixed(2),
          tasksPerWeek: (velocity * 7).toFixed(1),
          tasksPerMonth: (velocity * 30).toFixed(1)
        }
      }
    });
  } catch (error) {
    return JSON.stringify({ ok: false, error: { message: 'Failed to calculate task velocity: ' + (error && error.toString ? error.toString() : 'Unknown error'), details: error && error.message ? error.message : undefined }, v: '1' });
  }
  })();
`;
