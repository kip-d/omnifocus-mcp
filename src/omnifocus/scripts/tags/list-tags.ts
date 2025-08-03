import { getAllHelpers } from '../shared/helpers.js';

/**
 * Script to list all tags in OmniFocus with optional usage statistics
 * 
 * Features:
 * - Lists all tags with hierarchical information
 * - Optional usage statistics (task counts by tag)
 * - Sorting by name, usage, or active task count
 * - Option to exclude empty tags
 * - Performance optimized with tag map for O(1) lookups
 */
export const LIST_TAGS_SCRIPT = `
  const options = {{options}};
  
  ${getAllHelpers()}
  
  try {
    const app = Application('OmniFocus');
    const doc = app.defaultDocument();
    const startTime = Date.now();
    const tags = [];
    const allTags = doc.flattenedTags();
    
    // Check if collections are null or undefined
    if (!allTags) {
      return JSON.stringify({
        error: true,
        message: "Failed to retrieve tags from OmniFocus. The document may not be available or OmniFocus may not be running properly.",
        details: "doc.flattenedTags() returned null or undefined"
      });
    }
    
    // Initialize tag usage and build tag map for faster lookups
    const tagUsage = {};
    const tagMap = {};
    
    // First pass: build tag map for O(1) lookups
    for (let i = 0; i < allTags.length; i++) {
      const tag = allTags[i];
      const tagId = safeGet(() => tag.id());
      const tagName = safeGet(() => tag.name());
      if (tagId && tagName) {
        tagMap[tagName] = tagId;
        tagUsage[tagId] = { total: 0, active: 0, completed: 0 };
      }
    }
    
    // Count task usage only if explicitly requested
    // Note: This iterates through tasks and can be slow on large databases
    if (options.includeUsageStats === true) {
      try {
        const allTasks = doc.flattenedTasks();
        if (allTasks) {
          // Limit task processing to avoid timeouts
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
        // Continue without usage stats if task processing fails
      }
    }
    
    // Build tag list
    for (let i = 0; i < allTags.length; i++) {
      const tag = allTags[i];
      const tagId = safeGet(() => tag.id(), 'unknown');
      const usage = tagUsage[tagId] || { total: 0, active: 0, completed: 0 };
      
      // Skip empty tags if requested
      if (!options.includeEmpty && usage.total === 0) continue;
      
      const tagInfo = {
        id: tagId,
        name: safeGet(() => tag.name(), 'Unnamed Tag'),
        usage: usage,
        status: 'active' // Tags don't have status in OmniFocus
      };
      
      // Check for parent tag
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
        tags.sort((a, b) => {
          const aName = a.name || '';
          const bName = b.name || '';
          return aName.localeCompare(bName);
        });
        break;
    }
    
    // Calculate summary
    const totalTags = tags.length;
    const activeTags = tags.filter(t => t.usage && t.usage.active > 0).length;
    const emptyTags = tags.filter(t => !t.usage || t.usage.total === 0).length;
    
    const endTime = Date.now();
    
    return JSON.stringify({
      tags: tags,
      summary: {
        totalTags: totalTags,
        activeTags: activeTags,
        emptyTags: emptyTags,
        mostUsed: tags.length > 0 ? tags[0].name : null,
        query_time_ms: endTime - startTime
      }
    });
  } catch (error) {
    return formatError(error, 'list_tags');
  }
`;