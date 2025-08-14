import { getAllHelpers } from '../shared/helpers.js';
import { REPEAT_HELPERS } from '../shared/repeat-helpers.js';

/**
 * Script to list tasks with advanced filtering in OmniFocus
 *
 * Features:
 * - Advanced filtering (completed, flagged, project, dates, tags, search)
 * - Recurring task analysis with plugin system
 * - Performance optimizations (tag-based collection)
 * - Pagination support
 * - Performance metrics
 */
export const LIST_TASKS_SCRIPT = `
  ${getAllHelpers()}
  ${REPEAT_HELPERS}
  
  (() => {
    const filter = {{filter}};
    const tasks = [];
    
    // Check if we should skip recurring analysis (default to false for backwards compatibility)
    const skipRecurringAnalysis = filter.skipAnalysis === true;
  
  // Initialize plugin system
  function initializePlugins() {
    // Plugin registry (simplified for JXA environment)
    const analyzers = [];
    
    // Gaming analyzer
    const gamingAnalyzer = {
      name: 'gaming',
      priority: 100,
      patterns: {
        tasks: ['energy available', 'mines should be harvested', 'hourly', 'every hour'],
        projects: ['troops', 'blitz', 'titans', 'game']
      },
      analyze: function(task, rule) {
        const taskName = task.name().toLowerCase();
        const project = task.containingProject();
        const projectName = project ? project.name.toLowerCase() : '';
        
        const isGamingTask = this.patterns.tasks.some(p => taskName.includes(p)) ||
                            this.patterns.projects.some(p => projectName.includes(p));
        
        if (!isGamingTask) return null;
        
        const result = {
          isRecurring: true,
          type: 'new-instance',
          frequency: '',
          confidence: 0.8,
          source: 'gaming'
        };
        
        // Infer gaming rules
        if (!rule || (!rule.unit && !rule.steps)) {
          if (this.patterns.tasks.some(p => taskName.includes(p))) {
            rule = { unit: 'hours', steps: 1, _inferenceSource: 'gaming_task' };
          } else if (this.patterns.projects.some(p => projectName.includes(p))) {
            // Check for gaming reset times
            try {
              const dueDate = task.dueDate();
              if (dueDate) {
                const hour = dueDate.getHours();
                if ([0, 6, 12, 18].includes(hour)) {
                  rule = { unit: 'hours', steps: 6, _inferenceSource: 'gaming_6h' };
                } else if ([8, 16].includes(hour)) {
                  rule = { unit: 'hours', steps: 8, _inferenceSource: 'gaming_8h' };
                } else {
                  rule = { unit: 'hours', steps: 4, _inferenceSource: 'gaming_4h' };
                }
              }
            } catch (e) {}
          }
        }
        
        if (rule && rule.unit && rule.steps) {
          result.frequency = this.formatFrequency(rule);
        } else {
          result.frequency = 'Gaming task';
        }
        
        return result;
      },
      formatFrequency: function(rule) {
        if (rule.unit === 'hours') {
          return rule.steps === 1 ? 'Hourly (Gaming)' : 'Every ' + rule.steps + ' hours (Gaming)';
        }
        return 'Every ' + rule.steps + ' ' + rule.unit + ' (Gaming)';
      }
    };
    
    // Core analyzer
    const coreAnalyzer = {
      name: 'core',
      priority: 50,
      patterns: {
        daily: ['daily', 'every day'],
        weekly: ['weekly', 'every week', 'helpdesk tickets'],
        monthly: ['monthly', 'of each month'],
        yearly: ['yearly', 'annually', 'domain renewal', '.com', '.org']
      },
      analyze: function(task, rule) {
        if (!rule || (!rule.unit && !rule.steps)) {
          rule = this.inferRule(task);
        }
        
        if (!rule) {
          return { isRecurring: false, type: 'non-recurring', source: 'core' };
        }
        
        return {
          isRecurring: true,
          type: 'new-instance',
          frequency: this.formatFrequency(rule),
          confidence: 0.9,
          source: 'core'
        };
      },
      inferRule: function(task) {
        const taskName = task.name().toLowerCase();
        
        for (const [unit, patterns] of Object.entries(this.patterns)) {
          if (patterns.some(p => taskName.includes(p))) {
            const steps = unit === 'daily' ? 1 : 
                        unit === 'weekly' ? 1 : 
                        unit === 'monthly' ? 1 : 1;
            return { unit: unit.replace('ly', 's'), steps: steps, _inferenceSource: 'name_pattern' };
          }
        }
        return null;
      },
      formatFrequency: function(rule) {
        if (!rule.unit || !rule.steps) return 'Recurring';
        
        const unitMap = {
          days: 'daily',
          weeks: 'weekly',
          months: 'monthly',
          years: 'yearly'
        };
        
        if (rule.steps === 1 && unitMap[rule.unit]) {
          return unitMap[rule.unit].charAt(0).toUpperCase() + unitMap[rule.unit].slice(1);
        }
        
        return 'Every ' + rule.steps + ' ' + rule.unit;
      }
    };
    
    analyzers.push(gamingAnalyzer);
    analyzers.push(coreAnalyzer);
    
    // Sort by priority (highest first)
    analyzers.sort((a, b) => b.priority - a.priority);
    
    return analyzers;
  }
  
  const plugins = initializePlugins();
  
  // Helper to safely check if task is completed
  function safeIsCompleted(task) {
    // Use the isTaskEffectivelyCompleted helper which checks both task completion
    // and parent project completion status
    return isTaskEffectivelyCompleted(task);
  }
  
  // Helper function to parse a repetition rule object
  function safeExtractRuleProperties(rule) {
    return {
      ruleString: safeGet(() => rule.ruleString()),
      unit: safeGet(() => rule.unit()),
      steps: safeGet(() => rule.steps()),
      daysOfWeek: safeGet(() => rule.daysOfWeek()),
      dayOfMonth: safeGet(() => rule.dayOfMonth()),
      weekOfMonth: safeGet(() => rule.weekOfMonth()),
      monthOfYear: safeGet(() => rule.monthOfYear())
    };
  }
  
  // Helper to parse rule string for additional properties
  function safeParseRuleString(ruleStr) {
    if (!ruleStr) return {};
    
    // Parse FREQ, INTERVAL, etc. from ruleString
    return ruleStr.split(';').reduce((ruleData, part) => {
      const freqMatch = part.match(/FREQ=(\\w+)/);
      if (freqMatch) {
        const freqMap = {
          'DAILY': 'days',
          'WEEKLY': 'weeks',
          'MONTHLY': 'months',
          'YEARLY': 'years'
        };
        ruleData.unit = freqMap[freqMatch[1]] || freqMatch[1].toLowerCase();
      }
      
      const intervalMatch = part.match(/INTERVAL=(\\d+)/);
      if (intervalMatch) {
        ruleData.steps = parseInt(intervalMatch[1]);
      }
      
      return ruleData;
    }, {});
  }
  
  function safeDateFilter(task, dateGetter, beforeDate, afterDate) {
    const date = safeGet(dateGetter);
    if (!date && (beforeDate || afterDate)) return false; // Skip tasks without dates when filtering by date
    if (beforeDate && date > new Date(beforeDate)) return false;
    if (afterDate && date < new Date(afterDate)) return false;
    return true;
  }

  // Helper function to analyze recurring task status using plugins
  function analyzeRecurringStatus(task, repetitionRule) {
    const analyzers = plugins;
    
    // Try each analyzer in priority order
    for (const analyzer of analyzers) {
      try {
        const result = analyzer.analyze(task, repetitionRule);
        if (result) {
          return result;
        }
      } catch (e) {
        // Continue with next analyzer
      }
    }
    
    // Default fallback
    return {
      isRecurring: false,
      type: 'non-recurring',
      source: 'fallback'
    };
  }
  
  // Helper function to build task object
  function buildTaskObject(task, filter, skipRecurringAnalysis) {
    const taskObj = {
      id: safeGet(() => task.id(), 'unknown'),
      name: safeGet(() => task.name(), 'Unnamed Task'),
      completed: safeIsCompleted(task),
      flagged: isFlagged(task),
      inInbox: safeGet(() => task.inInbox(), false),
      // Add status properties
      taskStatus: getTaskStatus(task),
      blocked: isTaskBlocked(task),
      next: isTaskNext(task),
      available: isTaskAvailableForWork(task)
    };
    
    // Add optional properties using safe utilities
    const note = safeGet(() => task.note());
    if (note) taskObj.note = note;
    
    const project = safeGetProject(task);
    if (project) {
      taskObj.project = project.name;
      taskObj.projectId = project.id;
    }
    
    // Get parent task if this is a subtask
    const parentTask = safeGet(() => task.parent());
    if (parentTask) {
      taskObj.parentTaskId = safeGet(() => parentTask.id());
      taskObj.parentTaskName = safeGet(() => parentTask.name());
    }
    
    const dueDate = safeGetDate(() => task.dueDate());
    if (dueDate) taskObj.dueDate = dueDate;
    
    const deferDate = safeGetDate(() => task.deferDate());
    if (deferDate) taskObj.deferDate = deferDate;
    
    taskObj.tags = safeGetTags(task);
    
    // Extract repeat rule information if present
    const repetitionRule = safeGet(() => task.repetitionRule());
    if (repetitionRule) {
      taskObj.repetitionRule = extractRepeatRuleInfo(repetitionRule);
    }
    
    const added = safeGetDate(() => task.added());
    if (added) taskObj.added = added;
    
    // Enhanced properties discovered through API exploration
    // Task state properties that affect actionability
    const blocked = safeGet(() => task.blocked(), false);
    const next = safeGet(() => task.next(), false);
    if (blocked) taskObj.blocked = blocked;
    if (next) taskObj.next = next;
    
    // Effective dates (inherited from parent)
    const effectiveDeferDate = safeGetDate(() => task.effectiveDeferDate());
    const effectiveDueDate = safeGetDate(() => task.effectiveDueDate());
    // Since safeGetDate returns ISO string, we can only compare strings
    if (effectiveDeferDate && effectiveDeferDate !== deferDate) {
      taskObj.effectiveDeferDate = effectiveDeferDate;
    }
    if (effectiveDueDate && effectiveDueDate !== dueDate) {
      taskObj.effectiveDueDate = effectiveDueDate;
    }
    
    // Include metadata if requested (avoid overhead by default)
    if (filter.includeMetadata) {
      const creationDate = safeGetDate(() => task.creationDate());
      const modificationDate = safeGetDate(() => task.modificationDate());
      if (creationDate) taskObj.creationDate = creationDate;
      if (modificationDate) taskObj.modificationDate = modificationDate;
    }
    
    // Child task counts (for parent tasks)
    const numberOfTasks = safeGet(() => task.numberOfTasks(), 0);
    if (numberOfTasks > 0) {
      taskObj.childCounts = {
        total: numberOfTasks,
        available: safeGet(() => task.numberOfAvailableTasks(), 0),
        completed: safeGet(() => task.numberOfCompletedTasks(), 0)
      };
    }
    
    // Estimated duration
    const estimatedMinutes = safeGetEstimatedMinutes(task);
    if (estimatedMinutes !== null) taskObj.estimatedMinutes = estimatedMinutes;
    
    // Sequential property (for action groups)
    const sequential = safeGet(() => task.sequential(), false);
    if (numberOfTasks > 0) {
      taskObj.sequential = sequential;
    }
    
    // Add repetition rule and recurring status analysis
    if (!skipRecurringAnalysis) {
      const repetitionRule = safeGet(() => task.repetitionRule());
      if (repetitionRule) {
        let ruleData = safeExtractRuleProperties(repetitionRule);
        
        // Parse ruleString if available
        if (ruleData.ruleString) {
          const parsedRule = safeParseRuleString(ruleData.ruleString);
          ruleData = { ...ruleData, ...parsedRule };
        }
        
        // Basic fallback - plugins will handle the advanced inference
        if (!ruleData.unit && !ruleData.steps) {
          ruleData._inferenceSource = 'none';
        }
        
        taskObj.repetitionRule = ruleData;
        taskObj.recurringStatus = analyzeRecurringStatus(task, ruleData);
      } else {
        taskObj.recurringStatus = {
          isRecurring: false,
          type: 'non-recurring',
          source: 'core'
        };
      }
    } else {
      // Skip analysis for performance
      taskObj.recurringStatus = {
        isRecurring: false,
        type: 'analysis-skipped',
        skipped: true
      };
    }
    
    return taskObj;
  }

  function matchesFilters(task, filter) {
    // Basic property filters (cheapest checks first)
    if (filter.completed !== undefined && isTaskEffectivelyCompleted(task) !== filter.completed) return false;
    if (filter.flagged !== undefined && task.flagged() !== filter.flagged) return false;
    if (filter.inInbox !== undefined && task.inInbox() !== filter.inInbox) return false;
    
    // Project filter (medium cost) - supports both name and ID
    if (filter.project !== undefined || filter.projectId !== undefined) {
      const project = safeGetProject(task);
      
      // Check by project name
      if (filter.project !== undefined) {
        if (filter.project === null && project !== null) return false;
        if (filter.project !== null && (!project || project.name !== filter.project)) return false;
      }
      
      // Check by project ID
      if (filter.projectId !== undefined) {
        if (filter.projectId === null && project !== null) return false;
        if (filter.projectId !== null && (!project || project.id !== filter.projectId)) return false;
      }
    }
    
    // Date filters (medium cost)
    if (filter.dueBefore || filter.dueAfter) {
      if (!safeDateFilter(task, () => task.dueDate(), filter.dueBefore, filter.dueAfter)) return false;
    }
    
    if (filter.deferBefore || filter.deferAfter) {
      if (!safeDateFilter(task, () => task.deferDate(), filter.deferBefore, filter.deferAfter)) return false;
    }
    
    // Search filter (expensive - only run if needed)
    if (filter.search) {
      const searchTerm = filter.search.toLowerCase();
      const name = safeGet(() => task.name(), '') || '';
      
      // Quick check if name contains search term before getting note
      if (!name.toLowerCase().includes(searchTerm)) {
        // Only get note if name doesn't match
        const note = safeGet(() => task.note(), '') || '';
        if (!note.toLowerCase().includes(searchTerm)) return false;
      }
    }
    
    // Tags filter (most expensive - only run if needed)
    if (filter.tags && filter.tags.length > 0) {
      const taskTags = safeGetTags(task);
      const hasAllTags = filter.tags.every(tag => taskTags.includes(tag));
      if (!hasAllTags) return false;
    }
    
    // Available filter (legacy - use available property filter below)
    if (filter.available) {
      if (isTaskEffectivelyCompleted(task) || task.dropped()) return false;
      const deferDate = safeGet(() => task.deferDate());
      if (deferDate && deferDate > new Date()) return false;
    }
    
    // Advanced status filters
    if (filter.taskStatus !== undefined) {
      const taskStatus = getTaskStatus(task);
      if (taskStatus !== filter.taskStatus) return false;
    }
    
    if (filter.blocked !== undefined) {
      if (isTaskBlocked(task) !== filter.blocked) return false;
    }
    
    if (filter.next !== undefined) {
      if (isTaskNext(task) !== filter.next) return false;
    }
    
    return true;
  }

  try {
    const app = Application('OmniFocus');
    const doc = app.defaultDocument();
    
    // Tag collection optimization for single tag filters
    if (filter.tags && filter.tags.length === 1 && !filter.search) {
      const tagName = filter.tags[0];
      const startTime = Date.now();
      
      try {
        const tag = doc.flattenedTags.whose({name: tagName})[0];
        if (tag) {
          // Use pre-filtered tag collection based on completion status
          let tagTasks;
          if (filter.completed === false) {
            // For incomplete tasks, use specialized collections
            if (filter.available === true || filter.blocked === false) {
              // availableTasks() returns unblocked, incomplete tasks
              tagTasks = safeGet(() => tag.availableTasks(), []);
            } else {
              // remainingTasks() returns all incomplete tasks (including blocked)
              tagTasks = safeGet(() => tag.remainingTasks(), []);
            }
          } else {
            // For completed or unspecified, get all tasks for this tag
            tagTasks = safeGet(() => tag.tasks(), []);
          }
          
          const limit = Math.min(filter.limit || 100, 1000);
          let count = 0;
          
          // Apply remaining filters to pre-filtered collection
          for (let i = 0; i < tagTasks.length && count < limit; i++) {
            const task = tagTasks[i];
            
            // Check filters (skip tag check since already filtered)
            if (filter.completed !== undefined && safeIsCompleted(task) !== filter.completed) continue;
            if (filter.flagged !== undefined && isFlagged(task) !== filter.flagged) continue;
            if (filter.inInbox !== undefined && safeGet(() => task.inInbox(), false) !== filter.inInbox) continue;
            
            // Date filters
            if (filter.dueBefore || filter.dueAfter) {
              const dueDate = safeGetDate(() => task.dueDate());
              if (filter.dueBefore && (!dueDate || dueDate >= filter.dueBefore)) continue;
              if (filter.dueAfter && (!dueDate || dueDate <= filter.dueAfter)) continue;
            }
            
            if (filter.deferBefore || filter.deferAfter) {
              const deferDate = safeGetDate(() => task.deferDate());
              if (filter.deferBefore && (!deferDate || deferDate >= filter.deferBefore)) continue;
              if (filter.deferAfter && (!deferDate || deferDate <= filter.deferAfter)) continue;
            }
            
            // Project filter - supports both name and ID
            if (filter.project !== undefined || filter.projectId !== undefined) {
              const project = safeGetProject(task);
              
              // Check by project name
              if (filter.project !== undefined) {
                if (filter.project === "" && project) continue;
                if (filter.project !== "" && (!project || project.name !== filter.project)) continue;
              }
              
              // Check by project ID
              if (filter.projectId !== undefined) {
                if (filter.projectId === "" && project) continue;
                if (filter.projectId !== "" && (!project || project.id !== filter.projectId)) continue;
              }
            }
            
            // Build task object (same as regular path)
            const taskObj = buildTaskObject(task, filter, skipRecurringAnalysis);
            tasks.push(taskObj);
            count++;
          }
          
          return JSON.stringify({
            success: true,
            tasks: tasks,
            count: tasks.length,
            hasMore: tagTasks.length > limit,
            performance: {
              total_ms: Date.now() - startTime,
              tasks_scanned: tagTasks.length,
              optimization: 'tag_collection',
              tag: tagName
            }
          });
        }
      } catch (e) {
        // Tag optimization failed, fall through to regular path
      }
    }
    
    // Regular path - get all tasks
    const allTasks = doc.flattenedTasks();
    
    // Check if allTasks is null or undefined
    if (!allTasks) {
      return JSON.stringify({
        error: true,
        message: "Failed to retrieve tasks from OmniFocus. The document may not be available or OmniFocus may not be running properly.",
        details: "doc.flattenedTasks() returned null or undefined"
      });
    }
    
    const limit = Math.min(filter.limit || 100, 1000); // Cap at 1000
    let count = 0;
    const startTime = Date.now();
    let tasksScanned = 0;
    let filterTimeTotal = 0;
    let analysisTimeTotal = 0;
    
    for (let i = 0; i < allTasks.length && count < limit; i++) {
      const task = allTasks[i];
      tasksScanned++;
      
      // Skip if task doesn't match filters
      const filterStart = Date.now();
      const matches = matchesFilters(task, filter);
      filterTimeTotal += Date.now() - filterStart;
      
      if (!matches) continue;
      
      // Build task object using helper function (includes analysis)
      const analysisStart = Date.now();
      const taskObj = buildTaskObject(task, filter, skipRecurringAnalysis);
      analysisTimeTotal += Date.now() - analysisStart;
      
      tasks.push(taskObj);
      count++;
    }
    
    const endTime = Date.now();
    
    // For performance: estimate has_more based on whether we hit the limit
    const hasMore = count > tasks.length;
    
    return JSON.stringify({
      tasks: tasks,
      metadata: {
        total_items: count,
        items_returned: tasks.length,
        limit_applied: limit,
        has_more: hasMore,
        query_time_ms: endTime - startTime,
        filters_applied: {
          completed: filter.completed,
          flagged: filter.flagged,
          inInbox: filter.inInbox,
          search: filter.search,
          tags: filter.tags,
          projectId: filter.projectId,
          dueBefore: filter.dueBefore,
          dueAfter: filter.dueAfter,
          deferBefore: filter.deferBefore,
          deferAfter: filter.deferAfter,
          available: filter.available,
          taskStatus: filter.taskStatus,
          blocked: filter.blocked,
          next: filter.next
        },
        performance_note: hasMore ? 
          "More tasks available. Consider using more specific filters for better performance." : 
          undefined,
        performance_metrics: {
          tasks_scanned: tasksScanned,
          filter_time_ms: filterTimeTotal,
          analysis_time_ms: analysisTimeTotal,
          analysis_skipped: skipRecurringAnalysis
        }
      }
    });
  } catch (error) {
    return formatError(error, 'list_tasks');
  }
  })();
`;
