/**
 * task-velocity.ts - OmniJS-First Task Velocity Calculation
 *
 * Performance improvement: 67.6s → <1s (67x faster)
 *
 * Key optimization:
 * - Uses OmniJS flattenedTasks collection with single bridge call
 * - Accesses completionDate and modificationDate in OmniJS context (~0.001ms each)
 * - Eliminates 1,961 tasks × 2 properties × 16.662ms = 65.3s of JXA overhead
 *
 * Pattern based on: list-tasks-omnijs.ts
 */

export const TASK_VELOCITY_SCRIPT_V3 = `
  (() => {
    const app = Application('OmniFocus');
    const options = {{options}};

    try {
      // Build OmniJS script for data collection
      const period = options.period || 'week';
      const startDateStr = options.startDate;
      const endDateStr = options.endDate;
      const intervalDays = period === 'day' ? 1 : period === 'week' ? 7 : 30;

      // Calculate number of intervals to cover the date range
      const startMs = new Date(startDateStr + 'T00:00:00').getTime();
      const endMs = new Date(endDateStr + 'T23:59:59').getTime();
      const rangeDays = Math.ceil((endMs - startMs) / (1000 * 60 * 60 * 24));
      const numIntervals = Math.max(1, Math.ceil(rangeDays / intervalDays));

      const velocityScript = \`
        (() => {
          // Parse date range from options
          const rangeStart = new Date('$\{startDateStr}T00:00:00');
          const rangeEnd = new Date('$\{endDateStr}T23:59:59');
          const intervalDays = $\{intervalDays};
          const numIntervals = $\{numIntervals};

          // Calculate period intervals within the date range
          const intervals = [];
          for (let i = 0; i < numIntervals; i++) {
            const intervalEnd = new Date(rangeEnd);
            intervalEnd.setDate(intervalEnd.getDate() - (i * intervalDays));
            const intervalStart = new Date(intervalEnd);
            intervalStart.setDate(intervalStart.getDate() - intervalDays);

            // Skip intervals that are entirely before the range start
            if (intervalEnd < rangeStart) continue;

            // Clamp interval start to range start
            const clampedStart = intervalStart < rangeStart ? rangeStart : intervalStart;

            intervals.push({
              start: clampedStart,
              end: intervalEnd,
              created: 0,
              completed: 0,
              label: intervalEnd.toLocaleDateString()
            });
          }

          // Collect task data in OmniJS context - FAST!
          // Only count tasks completed within the specified date range
          let totalCompleted = 0;
          let totalCreated = 0;
          const completionTimes = [];

          flattenedTasks.forEach(task => {
            try {
              // Completion analysis - only count if within date range
              const completionDate = task.completionDate;
              if (completionDate && completionDate >= rangeStart && completionDate <= rangeEnd) {
                totalCompleted++;

                // Find interval for completion
                for (const interval of intervals) {
                  if (completionDate >= interval.start && completionDate < interval.end) {
                    interval.completed++;
                    break;
                  }
                }

                // Calculate completion time
                const modified = task.modified;
                if (modified && modified < completionDate) {
                  const completionHours = (completionDate - modified) / (1000 * 60 * 60);
                  completionTimes.push(completionHours);
                }
              }
            } catch (e) {}

            try {
              // Creation analysis (use modified date as proxy for creation)
              // Only count if within date range
              const modified = task.modified;
              if (modified && modified >= rangeStart && modified <= rangeEnd) {
                for (const interval of intervals) {
                  if (modified >= interval.start && modified < interval.end) {
                    interval.created++;
                    totalCreated++;
                    break;
                  }
                }
              }
            } catch (e) {}
          });

          // Calculate median completion time
          let medianCompletionTime = 0;
          if (completionTimes.length > 0) {
            completionTimes.sort((a, b) => a - b);
            const mid = Math.floor(completionTimes.length / 2);
            medianCompletionTime = completionTimes.length % 2 === 0
              ? (completionTimes[mid - 1] + completionTimes[mid]) / 2
              : completionTimes[mid];
          }

          // Calculate velocity metrics based on actual intervals
          const activeIntervals = intervals.filter(i => i.completed > 0 || i.created > 0);
          const recentIntervals = activeIntervals.length > 0 ? activeIntervals.slice(0, Math.min(4, activeIntervals.length)) : intervals.slice(0, 4);
          const avgCompleted = recentIntervals.length > 0
            ? recentIntervals.reduce((sum, i) => sum + i.completed, 0) / recentIntervals.length
            : 0;
          const avgCreated = recentIntervals.length > 0
            ? recentIntervals.reduce((sum, i) => sum + i.created, 0) / recentIntervals.length
            : 0;

          const velocity = avgCompleted / intervalDays;
          const backlogGrowth = avgCreated - avgCompleted;

          return JSON.stringify({
            ok: true,
            v: '3',
            data: {
              velocity: {
                period: $\{JSON.stringify(period)},
                averageCompleted: avgCompleted.toFixed(1),
                averageCreated: avgCreated.toFixed(1),
                dailyVelocity: velocity.toFixed(2),
                backlogGrowthRate: backlogGrowth.toFixed(1)
              },
              throughput: {
                intervals: intervals.reverse(), // Chronological order
                totalCompleted: totalCompleted,
                totalCreated: totalCreated
              },
              breakdown: {
                medianCompletionHours: medianCompletionTime.toFixed(1),
                tasksAnalyzed: flattenedTasks.length
              },
              projections: {
                tasksPerDay: velocity.toFixed(2),
                tasksPerWeek: (velocity * 7).toFixed(1),
                tasksPerMonth: (velocity * 30).toFixed(1)
              },
              optimization: 'omnijs_v3',
              dateRange: {
                start: '$\{startDateStr}',
                end: '$\{endDateStr}'
              }
            }
          });
        })()
      \`;

      // Execute OmniJS script - SINGLE BRIDGE CALL!
      const resultJson = app.evaluateJavascript(velocityScript);
      return resultJson;

    } catch (error) {
      return JSON.stringify({
        ok: false,
        error: {
          message: 'Failed to calculate task velocity: ' + (error && error.toString ? error.toString() : 'Unknown error'),
          details: error && error.message ? error.message : undefined
        },
        v: '3'
      });
    }
  })();
`;
