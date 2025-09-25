import { getFullStatusHelpers } from '../shared/helpers.js';

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
  ${getFullStatusHelpers()}
  
  // Minimal repeat rule extractor (to avoid massive 321-line REPEAT_HELPERS)
  function extractRepeatRuleInfo(repetitionRule) {
    if (!repetitionRule) return null;
    try {
      return {
        method: safeGet(() => repetitionRule.method()?.toString(), 'unknown'),
        ruleString: safeGet(() => repetitionRule.ruleString()?.toString(), ''),
        _source: 'minimal'
      };
    } catch (e) {
      return { _source: 'error', _error: e.toString() };
    }
  }
  
  (() => {
    const filter = {{filter}};
    const fields = {{fields}};
    const tasks = [];
    const tagBridgeCache = Object.create(null);

    // Check if we should skip recurring analysis (default to false for backwards compatibility)
    const skipRecurringAnalysis = filter.skipAnalysis === true;

    // Field selection helper
    function shouldIncludeField(fieldName) {
      return !fields || fields.length === 0 || fields.includes(fieldName);
    }
  
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
    // In JXA context, repetitionRule objects don't have the expected methods
    // We'll return a basic structure that can be enhanced via bridge
    return {
      ruleString: null,
      unit: null,
      steps: null,
      daysOfWeek: null,
      dayOfMonth: null,
      weekOfMonth: null,
      monthOfYear: null,
      _inferenceSource: 'none'
    };
  }
  
  // Extract repeat rule via evaluateJavascript bridge
  function extractRepeatRuleViaBridge(taskId) {
    try {
      const app = Application('OmniFocus');
      const escapedTaskId = JSON.stringify(taskId);
      
      const script = [
        'const task = Task.byIdentifier(' + escapedTaskId + ');',
        'if (task && task.repetitionRule) {',
        '  const rule = task.repetitionRule;',
        '  JSON.stringify({',
        '    hasRule: true,',
        '    ruleString: rule.ruleString || null,',
        '    method: rule.method ? rule.method.name : null',
        '  });',
        '} else {',
        '  JSON.stringify({hasRule: false});',
        '}'
      ].join('');
      
      const result = app.evaluateJavascript(script);
      
      if (result) {
        const parsed = JSON.parse(result);
        if (parsed.hasRule && parsed.ruleString) {
          // Parse the RRULE to extract details
          const ruleData = {
            ruleString: parsed.ruleString,
            method: parsed.method,
            _inferenceSource: 'bridge'
          };
          
          // Parse FREQ
          if (parsed.ruleString.includes('FREQ=DAILY')) {
            ruleData.unit = 'day';
            ruleData.steps = 1;
          } else if (parsed.ruleString.includes('FREQ=WEEKLY')) {
            ruleData.unit = 'week';
            ruleData.steps = 1;
          } else if (parsed.ruleString.includes('FREQ=MONTHLY')) {
            ruleData.unit = 'month';
            ruleData.steps = 1;
          } else if (parsed.ruleString.includes('FREQ=YEARLY')) {
            ruleData.unit = 'year';
            ruleData.steps = 1;
          }
          
          // Parse INTERVAL
          // eslint-disable-next-line no-useless-escape
          const intervalMatch = parsed.ruleString.match(/INTERVAL=([0-9]+)/);
          if (intervalMatch) {
            ruleData.steps = parseInt(intervalMatch[1]);
          }
          
          // Parse BYDAY for weekly patterns
          const bydayMatch = parsed.ruleString.match(/BYDAY=([^;]+)/);
          if (bydayMatch) {
            const dayMap = {
              'MO': 'monday',
              'TU': 'tuesday', 
              'WE': 'wednesday',
              'TH': 'thursday',
              'FR': 'friday',
              'SA': 'saturday',
              'SU': 'sunday'
            };
            const days = bydayMatch[1].split(',').map(d => dayMap[d.trim()] || d).filter(Boolean);
            if (days.length > 0) {
              ruleData.weekdays = days;
            }
          }
          
          return ruleData;
        }
      }
    } catch (e) {
      // Bridge failed, return null
    }
    return null;
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
  
  function fetchTagsViaBridge(ids) {
    if (!ids || ids.length === 0) return null;
    try {
      const app = Application('OmniFocus');
      const scriptParts = [];
      scriptParts.push('(function () {');
      scriptParts.push('  var ids = ' + JSON.stringify(ids) + ';');
      scriptParts.push('  var out = {};');
      scriptParts.push('  for (var i = 0; i < ids.length; i++) {');
      scriptParts.push('    var task = Task.byIdentifier(ids[i]);');
      scriptParts.push('    if (task) {');
      scriptParts.push('      var tagList = task.tags ? task.tags : [];');
      scriptParts.push('      var names = [];');
      scriptParts.push('      for (var j = 0; j < tagList.length; j++) {');
      scriptParts.push('        try { names.push(tagList[j].name); } catch (e) {}');
      scriptParts.push('      }');
      scriptParts.push('      out[ids[i]] = names;');
      scriptParts.push('    }');
      scriptParts.push('  }');
      scriptParts.push('  return JSON.stringify(out);');
      scriptParts.push('})()');

      const bridgeScript = scriptParts.join('\\n');
      const resultJson = app.evaluateJavascript(bridgeScript);
      if (!resultJson) return null;

      const tagMap = JSON.parse(resultJson);
      const keys = Object.keys(tagMap);
      for (let i = 0; i < keys.length; i++) {
        tagBridgeCache[keys[i]] = tagMap[keys[i]] || [];
      }
      return tagMap;
    } catch (bridgeError) {
      return null;
    }
  }

  function hydrateTaskTagsViaBridge(taskObjects) {
    try {
      if (!taskObjects || taskObjects.length === 0) return;
      const ids = [];
      for (let i = 0; i < taskObjects.length; i++) {
        if (taskObjects[i] && taskObjects[i].id) {
          ids.push(taskObjects[i].id);
        }
      }
      let tagMap = null;
      if (ids.length > 0) {
        tagMap = fetchTagsViaBridge(ids);
      }

      for (let i = 0; i < taskObjects.length; i++) {
        const taskObj = taskObjects[i];
        if (!taskObj || !taskObj.id) continue;
        if (tagBridgeCache[taskObj.id]) {
          taskObj.tags = tagBridgeCache[taskObj.id];
        } else if (tagMap && tagMap[taskObj.id]) {
          taskObj.tags = tagMap[taskObj.id];
        }
      }
    } catch (bridgeError) {
      // Ignore bridge errors to keep script resilient
    }
  }

  function passesTagFilter(task, requiredTags) {
    if (!requiredTags || requiredTags.length === 0) return true;

    const taskTags = safeGetTags(task);
    // Case-insensitive tag matching to handle variations
    const taskTagsLower = taskTags.map(tag => tag.toLowerCase());
    const hasAllTags = requiredTags.every(tag => taskTagsLower.includes(tag.toLowerCase()));
    const taskId = safeGet(() => task.id());

    if (taskId && !(taskId in tagBridgeCache)) {
      tagBridgeCache[taskId] = taskTags;
    }

    if (hasAllTags) {
      return true;
    }

    if (!taskId) {
      return false;
    }

    if (tagBridgeCache[taskId] && requiredTags.every(tag => tagBridgeCache[taskId].includes(tag))) {
      return true;
    }

    const tagMap = fetchTagsViaBridge([taskId]);
    if (!tagMap || !tagMap[taskId]) {
      return false;
    }

    return requiredTags.every(tag => tagMap[taskId].includes(tag));
  }

  // Helper function to build task object
  function buildTaskObject(task, filter, skipRecurringAnalysis) {
    const taskObj = {};

    // Core fields (always needed for identification)
    if (shouldIncludeField('id')) {
      taskObj.id = safeGet(() => task.id(), 'unknown');
    }
    if (shouldIncludeField('name')) {
      taskObj.name = safeGet(() => task.name(), 'Unnamed Task');
    }
    if (shouldIncludeField('completed')) {
      taskObj.completed = safeIsCompleted(task);
    }
    if (shouldIncludeField('flagged')) {
      taskObj.flagged = isFlagged(task);
    }

    // Extended status fields
    if (shouldIncludeField('inInbox')) {
      taskObj.inInbox = safeGet(() => task.inInbox(), false);
    }
    if (shouldIncludeField('blocked')) {
      taskObj.blocked = isTaskBlocked(task);
    }
    if (shouldIncludeField('available')) {
      taskObj.available = isTaskAvailableForWork(task);
    }

    // Additional status properties
    const taskStatus = getTaskStatus(task);
    const next = isTaskNext(task);
    if (taskStatus) taskObj.taskStatus = taskStatus;
    if (next) taskObj.next = next;
    
    // Add optional properties using safe utilities
    if (shouldIncludeField('note')) {
      const note = safeGet(() => task.note());
      if (note) taskObj.note = note;
    }

    if (shouldIncludeField('project') || shouldIncludeField('projectId')) {
      const project = safeGetProject(task);
      if (project) {
        if (shouldIncludeField('project')) {
          taskObj.project = project.name;
        }
        if (shouldIncludeField('projectId')) {
          taskObj.projectId = project.id;
        }
      }
    }

    // Get parent task if this is a subtask (no field filtering for internal properties)
    const parentTask = safeGet(() => task.parent());
    if (parentTask) {
      taskObj.parentTaskId = safeGet(() => parentTask.id());
      taskObj.parentTaskName = safeGet(() => parentTask.name());
    }

    if (shouldIncludeField('dueDate')) {
      const dueDate = safeGetDate(() => task.dueDate());
      if (dueDate) taskObj.dueDate = dueDate;
    }

    if (shouldIncludeField('deferDate')) {
      const deferDate = safeGetDate(() => task.deferDate());
      if (deferDate) taskObj.deferDate = deferDate;
    }

    if (shouldIncludeField('tags')) {
      const taskId = taskObj.id || safeGet(() => task.id());
      const cachedTags = tagBridgeCache[taskId];
      if (cachedTags) {
        taskObj.tags = cachedTags;
      } else {
        const tags = safeGetTags(task);
        taskObj.tags = tags;
        if (taskId && !(taskId in tagBridgeCache)) {
          tagBridgeCache[taskId] = tags;
        }
      }
    }
    
    // Extract repeat rule information if present (keep for recurring analysis)
    const repetitionRule = safeGet(() => task.repetitionRule());
    if (repetitionRule) {
      taskObj.repetitionRule = extractRepeatRuleInfo(repetitionRule);
    }

    // Optional datetime fields
    if (shouldIncludeField('added')) {
      const added = safeGetDate(() => task.added());
      if (added) taskObj.added = added;
    }

    if (shouldIncludeField('completionDate')) {
      const completionDate = safeGetDate(() => task.completionDate());
      if (completionDate) taskObj.completionDate = completionDate;
    }

    // Enhanced properties discovered through API exploration
    // Task state properties that affect actionability (avoid duplication with earlier checks)
    const blocked = safeGet(() => task.blocked(), false);
    const next = safeGet(() => task.next(), false);
    if (blocked && !taskObj.blocked) taskObj.blocked = blocked;
    if (next && !taskObj.next) taskObj.next = next;

    // Effective dates (inherited from parent)
    const effectiveDeferDate = safeGetDate(() => task.effectiveDeferDate());
    const effectiveDueDate = safeGetDate(() => task.effectiveDueDate());
    const currentDeferDate = shouldIncludeField('deferDate') ? taskObj.deferDate : safeGetDate(() => task.deferDate());
    const currentDueDate = shouldIncludeField('dueDate') ? taskObj.dueDate : safeGetDate(() => task.dueDate());

    if (effectiveDeferDate && effectiveDeferDate !== currentDeferDate) {
      taskObj.effectiveDeferDate = effectiveDeferDate;
    }
    if (effectiveDueDate && effectiveDueDate !== currentDueDate) {
      taskObj.effectiveDueDate = effectiveDueDate;
    }

    // Include metadata if requested (avoid overhead by default)
    if (filter.includeMetadata || shouldIncludeField('creationDate') || shouldIncludeField('modificationDate')) {
      if (shouldIncludeField('creationDate')) {
        const creationDate = safeGetDate(() => task.creationDate());
        if (creationDate) taskObj.creationDate = creationDate;
      }
      if (shouldIncludeField('modificationDate')) {
        const modificationDate = safeGetDate(() => task.modificationDate());
        if (modificationDate) taskObj.modificationDate = modificationDate;
      }
    }

    // Child task counts (for parent tasks) - no field filtering, always useful for parent tasks
    const numberOfTasks = safeGet(() => task.numberOfTasks(), 0);
    if (numberOfTasks > 0) {
      taskObj.childCounts = {
        total: numberOfTasks,
        available: safeGet(() => task.numberOfAvailableTasks(), 0),
        completed: safeGet(() => task.numberOfCompletedTasks(), 0)
      };
    }

    // Estimated duration
    if (shouldIncludeField('estimatedMinutes')) {
      const estimatedMinutes = safeGetEstimatedMinutes(task);
      if (estimatedMinutes !== null) taskObj.estimatedMinutes = estimatedMinutes;
    }
    
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
        
        // Try to get actual data via evaluateJavascript bridge
        const taskId = safeGet(() => task.id());
        if (taskId && (!ruleData.ruleString || ruleData._inferenceSource === 'none')) {
          const bridgeData = extractRepeatRuleViaBridge(taskId);
          if (bridgeData) {
            ruleData = bridgeData;
          }
        }
        
        // Parse ruleString if available
        if (ruleData.ruleString) {
          const parsedRule = safeParseRuleString(ruleData.ruleString);
          ruleData = { ...ruleData, ...parsedRule };
        }
        
        // Basic fallback - plugins will handle the advanced inference
        if (!ruleData.unit && !ruleData.steps) {
          ruleData._inferenceSource = ruleData._inferenceSource || 'none';
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
        if ((filter.project === null || filter.project === '') && project !== null) return false;
        if (filter.project !== null && filter.project !== '' && (!project || project.name !== filter.project)) return false;
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

      // Quick check if name contains search term
      if (!name.toLowerCase().includes(searchTerm)) {
        // Only get note if name doesn't match and not in fast search mode
        if (filter.fastSearch) {
          return false; // Fast search mode: only search names
        } else {
          const note = safeGet(() => task.note(), '') || '';
          if (!note.toLowerCase().includes(searchTerm)) return false;
        }
      }
    }
    
    // Tags filter (most expensive - only run if needed)
    if (filter.tags && filter.tags.length > 0) {
      if (!passesTagFilter(task, filter.tags)) return false;
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
        // Avoid whose(); scan tags and match by name (case-insensitive)
        const allTags = doc.flattenedTags();
        let tag = null;
        for (let i = 0; i < allTags.length; i++) {
          try {
            const currentTagName = allTags[i].name();
            if (currentTagName && currentTagName.toLowerCase() === tagName.toLowerCase()) {
              tag = allTags[i];
              break;
            }
          } catch (e) { /* ignore bad tag entries */ }
        }
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
                if ((filter.project === "" || filter.project === null) && project) continue;
                if (filter.project !== "" && filter.project !== null && (!project || project.name !== filter.project)) continue;
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
            
            // Early exit when we have enough results
            if (filter.limit && tasks.length >= filter.limit) {
              break;
            }
          }
          
          hydrateTaskTagsViaBridge(tasks);

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
      
      // Early exit when we have enough results
      if (filter.limit && tasks.length >= filter.limit) {
        break;
      }
    }
    
    const endTime = Date.now();
    
    // For performance: estimate has_more based on whether we hit the limit
    const hasMore = count > tasks.length;
    
    hydrateTaskTagsViaBridge(tasks);

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
