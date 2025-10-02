import { getUnifiedHelpers } from '../shared/helpers.js';

/**
 * Optimized script to list tags in OmniFocus
 *
 * Optimizations:
 * - Fast mode: Skip parent/child relationships for basic listing
 * - Early filtering of empty tags to reduce processing
 * - Minimal property access for better performance
 * - Option to get just tag names (ultra-fast mode)
 */
export const LIST_TAGS_SCRIPT = `
  ${getUnifiedHelpers()}
  
  (() => {
    const options = {{options}};
    const fastMode = options.fastMode || false;
    const namesOnly = options.namesOnly || false;
    
    try {
      const app = Application('OmniFocus');
      const doc = app.defaultDocument();
      const startTime = Date.now();
      
      const allTags = doc.flattenedTags();
      
      if (!allTags) {
        return JSON.stringify({
          error: true,
          message: "Failed to retrieve tags from OmniFocus",
          details: "doc.flattenedTags() returned null or undefined"
        });
      }
      
      // Ultra-fast mode: just return tag names
      if (namesOnly) {
        const tagNames = [];
        for (let i = 0; i < allTags.length; i++) {
          const name = safeGet(() => allTags[i].name());
          if (name) tagNames.push(name);
        }
        
        const endTime = Date.now();
        return JSON.stringify({
          items: tagNames,
          summary: {
            total: tagNames.length,
            insights: ["Found " + tagNames.length + " tags (names only mode)"],
            query_time_ms: endTime - startTime,
            mode: 'names_only'
          }
        });
      }
      
      // Fast mode: minimal property access
      if (fastMode) {
        const tags = [];
        
        for (let i = 0; i < allTags.length; i++) {
          const tag = allTags[i];
          const tagInfo = {
            id: safeGet(() => tag.id(), 'unknown'),
            name: safeGet(() => tag.name(), 'Unnamed Tag')
          };
          tags.push(tagInfo);
        }
        
        // Simple alphabetical sort
        tags.sort((a, b) => a.name.localeCompare(b.name));
        
        const endTime = Date.now();
        return JSON.stringify({
          items: tags,
          summary: {
            total: tags.length,
            insights: ["Found " + tags.length + " tags (fast mode)"],
            query_time_ms: endTime - startTime,
            mode: 'fast'
          }
        });
      }
      
      // Full mode with optional usage stats (existing implementation)
      const tags = [];
      const tagUsage = {};
      const tagMap = {};
      
      // Build tag map
      for (let i = 0; i < allTags.length; i++) {
        const tag = allTags[i];
        const tagId = safeGet(() => tag.id());
        const tagName = safeGet(() => tag.name());
        if (tagId && tagName) {
          tagMap[tagName] = tagId;
          tagUsage[tagId] = { total: 0, active: 0, completed: 0 };
        }
      }
      
      // Count usage if requested
      if (options.includeUsageStats === true && !options.includeEmpty) {
        // If we're excluding empty tags, we need usage stats to filter
        try {
          const allTasks = doc.flattenedTasks();
          if (allTasks) {
            const maxTasksToProcess = Math.min(allTasks.length, 5000);
            for (let i = 0; i < maxTasksToProcess; i++) {
              const task = allTasks[i];
              if (!task) continue;
              
              const taskTags = safeGetTags(task);
              const isCompleted = safeIsCompleted(task);
              
              for (let j = 0; j < taskTags.length; j++) {
                const tagName = taskTags[j];
                const tagId = tagMap[tagName];
                
                if (tagId && tagUsage[tagId]) {
                  tagUsage[tagId].total++;
                  if (isCompleted) {
                    tagUsage[tagId].completed++;
                  } else {
                    tagUsage[tagId].active++;
                  }
                }
              }
            }
          }
        } catch (taskError) {
          // Continue without usage stats
        }
      }
      
      // Build full tag list
      for (let i = 0; i < allTags.length; i++) {
        const tag = allTags[i];
        const tagId = safeGet(() => tag.id(), 'unknown');
        const usage = tagUsage[tagId] || { total: 0, active: 0, completed: 0 };
        
        // Skip empty tags if requested
        if (!options.includeEmpty && usage.total === 0) continue;
        
        const tagInfo = {
          id: tagId,
          name: safeGet(() => tag.name(), 'Unnamed Tag')
        };
        
        // Only add usage if calculated
        if (options.includeUsageStats) {
          tagInfo.usage = usage;
        }
        
        // Only get parent info if not in fast mode
        const parent = safeGet(() => tag.parent());
        if (parent) {
          tagInfo.parentId = safeGet(() => parent.id());
          tagInfo.parentName = safeGet(() => parent.name());
        }
        
        tags.push(tagInfo);
      }
      
      // Sort tags
      switch(options.sortBy) {
        case 'usage':
          tags.sort((a, b) => (b.usage?.total || 0) - (a.usage?.total || 0));
          break;
        case 'tasks':
          tags.sort((a, b) => (b.usage?.active || 0) - (a.usage?.active || 0));
          break;
        case 'name':
        default:
          tags.sort((a, b) => a.name.localeCompare(b.name));
          break;
      }
      
      const endTime = Date.now();
      
      // Calculate summary
      const totalTags = tags.length;
      const activeTags = options.includeUsageStats ? 
        tags.filter(t => t.usage && t.usage.active > 0).length : 'unknown';
      const emptyTags = options.includeUsageStats ? 
        tags.filter(t => !t.usage || t.usage.total === 0).length : 'unknown';
      
      return JSON.stringify({
        items: tags,
        summary: {
          total: totalTags,
          insights: ["Found " + totalTags + " tags (" + activeTags + " active, " + emptyTags + " empty)"],
          query_time_ms: endTime - startTime,
          mode: 'full'
        }
      });
      
    } catch (error) {
      return formatError(error, 'list_tags_optimized');
    }
  })();
`;

/**
 * Get just active tags (tags with at least one incomplete task)
 * This is much faster than full tag listing
 */
export const GET_ACTIVE_TAGS_SCRIPT = `
  ${getUnifiedHelpers()}
  
  (() => {
    try {
      const app = Application('OmniFocus');
      const doc = app.defaultDocument();
      const startTime = Date.now();
      
      // Get all tags first
      const allTags = doc.flattenedTags();
      if (!allTags) {
        return JSON.stringify({
          error: true,
          message: "Failed to retrieve tags from OmniFocus",
          details: "doc.flattenedTags() returned null or undefined"
        });
      }
      
      // Check each tag for available tasks (much faster than iterating through all tasks)
      const activeTags = [];
      
      for (let i = 0; i < allTags.length; i++) {
        const tag = allTags[i];
        try {
          // Use availableTaskCount property which is pre-computed by OmniFocus
          const availableCount = safeGet(() => tag.availableTaskCount(), 0);
          if (availableCount > 0) {
            const tagName = safeGet(() => tag.name());
            if (tagName) {
              activeTags.push(tagName);
            }
          }
        } catch (e) {
          // Skip tags that error
          continue;
        }
      }
      
      // Sort alphabetically
      activeTags.sort();
      
      const endTime = Date.now();
      
      return JSON.stringify({
        items: activeTags,
        summary: {
          total: activeTags.length,
          insights: ["Found " + activeTags.length + " active tags with available tasks"],
          query_time_ms: endTime - startTime,
          mode: 'active_only'
        }
      });
      
    } catch (error) {
      return formatError(error, 'get_active_tags');
    }
  })();
`;
