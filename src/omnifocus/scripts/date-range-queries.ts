/**
 * Ultra-optimized date range query scripts with JavaScript filtering improvements
 * v1.15.0 - Achieves 67-91% better JavaScript filtering performance
 */

import { getUnifiedHelpers } from './shared/helpers.js';

/**
 * Get upcoming tasks - ULTRA-OPTIMIZED with faster JavaScript filtering
 */
export const GET_UPCOMING_TASKS_ULTRA_OPTIMIZED_SCRIPT = `
  ${getUnifiedHelpers()}
  
  (() => {
    const app = Application('OmniFocus');
    const doc = app.defaultDocument();
    const days = {{days}};
    const includeToday = {{includeToday}};
    const limit = {{limit}};
    
    try {
      const queryStartTime = Date.now();
      
      // Pre-calculate time boundaries as timestamps (faster comparisons)
      const nowTime = Date.now();
      const startTime = includeToday ? nowTime : nowTime + 86400000; // 86400000 = 24*60*60*1000
      const endTime = nowTime + days * 86400000;
      const dayMs = 86400000;
      
      // Get ALL tasks (fast ~127ms for 2000 tasks)
      const allTasks = doc.flattenedTasks();
      const tasks = [];
      let processedCount = 0;
      
      // ULTRA-OPTIMIZED filtering loop
      const len = allTasks.length;
      for (let i = 0; i < len && tasks.length < limit; i++) {
        const task = allTasks[i];
        processedCount++;
        
        try {
          // Early exit - completed check (most common filter)
          // Check if task is effectively completed (including parent project status)
          if (isTaskEffectivelyCompleted(task)) continue;
          
          // Early exit - date check
          const dueDate = task.dueDate();
          if (!dueDate) continue;
          
          // Work with timestamps for faster comparisons
          const dueTime = dueDate.getTime ? dueDate.getTime() : new Date(dueDate).getTime();
          
          // Range check using timestamps only
          if (dueTime < startTime || dueTime > endTime) continue;
          
          // Only now gather the rest of the data (expensive operations last)
          const project = task.containingProject();
          
          tasks.push({
            id: task.id(),
            name: task.name(),
            dueDate: new Date(dueTime).toISOString(),
            flagged: task.flagged(),
            project: project?.name() || null,
            projectId: project?.id() || null,
            daysUntilDue: ((dueTime - nowTime) / dayMs) | 0, // Bitwise OR for fast floor
            note: task.note() || null
          });
        } catch (e) {
          // Silently skip errored tasks (faster than safeGet)
        }
      }
      
      // Sort by due date using cached timestamps
      tasks.sort((a, b) => {
        const aTime = new Date(a.dueDate).getTime();
        const bTime = new Date(b.dueDate).getTime();
        return aTime - bTime;
      });
      
      // Add day of week
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      for (const task of tasks) {
        const dueDateObj = new Date(task.dueDate);
        task.dayOfWeek = dayNames[dueDateObj.getDay()];
      }
      
      const queryEndTime = Date.now();
      
      return JSON.stringify({
        tasks: tasks,
        summary: {
          total: tasks.length,
          days_ahead: days,
          include_today: includeToday,
          start_date: new Date(startTime).toISOString(),
          end_date: new Date(endTime).toISOString(),
          limited: tasks.length >= limit,
          tasks_scanned: processedCount,
          query_time_ms: queryEndTime - queryStartTime,
          query_method: 'ultra_optimized_v3'
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
 * Get overdue tasks - ULTRA-OPTIMIZED with OmniJS bridge
 *
 * OPTIMIZATION (November 2025):
 * - Old approach: JXA property access (~1-2ms per property) = 28+ seconds for 2000 tasks
 * - New approach: Pure OmniJS bridge with direct property access (~0.001ms per property)
 * - Performance: ~100x faster (sub-second vs 28 seconds)
 */
export const GET_OVERDUE_TASKS_ULTRA_OPTIMIZED_SCRIPT = `
  (() => {
    const app = Application('OmniFocus');
    const limit = {{limit}};
    const includeCompleted = {{includeCompleted}};

    try {
      const omniScript = '(' +
        '(() => {' +
          'const tasks = [];' +
          'const nowTime = Date.now();' +
          'const dayMs = 86400000;' +
          'const limit = ' + limit + ';' +
          'const includeCompleted = ' + includeCompleted + ';' +
          'let processedCount = 0;' +
          '' +
          'flattenedTasks.forEach(task => {' +
            'if (tasks.length >= limit) return;' +
            'processedCount++;' +
            'if (!includeCompleted && task.completed) return;' +
            'const proj = task.containingProject;' +
            'if (!includeCompleted && proj && (proj.status === Project.Status.Done || proj.status === Project.Status.Dropped)) return;' +
            'const dueDate = task.dueDate;' +
            'if (!dueDate) return;' +
            'const dueTime = dueDate.getTime();' +
            'if (dueTime >= nowTime) return;' +
            'const daysOverdue = Math.floor((nowTime - dueTime) / dayMs);' +
            '' +
            'tasks.push({' +
              'id: task.id.primaryKey,' +
              'name: task.name,' +
              'dueDate: dueDate.toISOString(),' +
              'flagged: task.flagged || false,' +
              'completed: includeCompleted ? task.completed : false,' +
              'project: proj ? proj.name : null,' +
              'projectId: proj ? proj.id.primaryKey : null,' +
              'daysOverdue: daysOverdue,' +
              'note: task.note || null' +
            '});' +
          '});' +
          'tasks.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());' +
          'return JSON.stringify({' +
            'tasks: tasks,' +
            'summary: {' +
              'total: tasks.length,' +
              'limited: tasks.length >= limit,' +
              'tasks_scanned: processedCount,' +
              'reference_date: new Date(nowTime).toISOString(),' +
              'query_method: "omnijs_bridge_fast"' +
            '}' +
          '});' +
        '})()' +
      ')';

      return app.evaluateJavascript(omniScript);

    } catch (error) {
      return JSON.stringify({
        error: true,
        message: "Failed to get overdue tasks: " + (error && error.toString ? error.toString() : 'Unknown error'),
        details: error && error.message ? error.message : null
      });
    }
  })();
`;

/**
 * Get tasks in date range - ULTRA-OPTIMIZED with faster JavaScript filtering
 */
export const GET_TASKS_IN_DATE_RANGE_ULTRA_OPTIMIZED_SCRIPT = `
  ${getUnifiedHelpers()}
  
  (() => {
    const app = Application('OmniFocus');
    const doc = app.defaultDocument();
    const params = {{params}};
    const startTimeRange = params.startDate ? new Date(params.startDate).getTime() : null;
    const endTimeRange = params.endDate ? new Date(params.endDate).getTime() : null;
    const dateField = params.dateField || 'dueDate';
    const includeNullDates = params.includeNullDates || false;
    const limit = params.limit || 100;
    
    try {
      const queryStartTime = Date.now();
      
      // Validate inputs
      if (!startTimeRange && !endTimeRange) {
        return JSON.stringify({
          error: true,
          message: "At least one of startDate or endDate must be provided"
        });
      }
      
      // Get ALL tasks then filter manually
      const allTasks = doc.flattenedTasks();
      const tasks = [];
      let processedCount = 0;
      let nullDateCount = 0;
      
      const len = allTasks.length;
      for (let i = 0; i < len && tasks.length < limit; i++) {
        const task = allTasks[i];
        processedCount++;
        
        try {
          // Early exit for non-completion date queries
          // Check if task is effectively completed (including parent project status)
          if (dateField !== 'completionDate' && isTaskEffectivelyCompleted(task)) continue;
          
          // Get the appropriate date field
          let taskDate;
          if (dateField === 'dueDate') {
            taskDate = task.dueDate();
          } else if (dateField === 'deferDate') {
            taskDate = task.deferDate();
          } else if (dateField === 'completionDate') {
            taskDate = task.completionDate();
          }
          
          if (!taskDate) {
            nullDateCount++;
            if (includeNullDates) {
              const project = task.containingProject();
              tasks.push({
                id: task.id(),
                name: task.name(),
                [dateField]: null,
                flagged: task.flagged(),
                completed: isTaskEffectivelyCompleted(task),
                project: project?.name() || null,
                projectId: project?.id() || null
              });
            }
            continue;
          }
          
          // Work with timestamps for faster comparisons
          const taskTime = taskDate.getTime ? taskDate.getTime() : new Date(taskDate).getTime();
          
          // Range check using timestamps
          if (startTimeRange && taskTime < startTimeRange) continue;
          if (endTimeRange && taskTime > endTimeRange) continue;
          
          // Gather remaining data
          const project = task.containingProject();
          tasks.push({
            id: task.id(),
            name: task.name(),
            [dateField]: new Date(taskTime).toISOString(),
            flagged: task.flagged(),
            completed: isTaskEffectivelyCompleted(task),
            project: project?.name() || null,
            projectId: project?.id() || null,
            note: task.note() || null
          });
        } catch (e) {
          // Silently skip errored tasks
        }
      }
      
      // Sort by date using cached field
      tasks.sort((a, b) => {
        const aDate = a[dateField] ? new Date(a[dateField]).getTime() : 0;
        const bDate = b[dateField] ? new Date(b[dateField]).getTime() : 0;
        return aDate - bDate;
      });
      
      const queryEndTime = Date.now();
      
      return JSON.stringify({
        tasks: tasks,
        summary: {
          total: tasks.length,
          date_field: dateField,
          start_date: startTimeRange ? new Date(startTimeRange).toISOString() : null,
          end_date: endTimeRange ? new Date(endTimeRange).toISOString() : null,
          include_null_dates: includeNullDates,
          null_date_count: nullDateCount,
          limited: tasks.length >= limit,
          tasks_scanned: processedCount,
          query_time_ms: queryEndTime - queryStartTime,
          query_method: 'ultra_optimized_v3'
        }
      });
      
    } catch (error) {
      return JSON.stringify({
        error: true,
        message: "Failed to get tasks in date range: " + error.toString(),
        details: error.message
      });
    }
  })();
`;
