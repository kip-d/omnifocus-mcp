// Import shared safe utilities
import { SAFE_UTILITIES_SCRIPT } from './tasks.js';

export const LIST_TAGS_SCRIPT = `
  const options = {{options}};
  
  ${SAFE_UTILITIES_SCRIPT}
  
  try {
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
    
    // Count task usage if requested and not too many tags
    if (options.includeUsageStats !== false && allTags.length < 200) {
      try {
        const allTasks = doc.flattenedTasks();
        if (allTasks) {
          // Limit task processing to avoid timeouts
          const maxTasksToProcess = Math.min(allTasks.length, 200);
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
    return JSON.stringify({
      error: true,
      message: "Failed to list tags: " + error.toString()
    });
  }
`;

export const MANAGE_TAGS_SCRIPT = `
  const action = {{action}};
  const tagName = {{tagName}};
  const newName = {{newName}};
  const targetTag = {{targetTag}};
  
  ${SAFE_UTILITIES_SCRIPT}
  
  try {
    const allTags = doc.flattenedTags();
    
    // Check if allTags is null or undefined
    if (!allTags) {
      return JSON.stringify({
        error: true,
        message: "Failed to retrieve tags from OmniFocus. The document may not be available or OmniFocus may not be running properly.",
        details: "doc.flattenedTags() returned null or undefined"
      });
    }
    
    switch(action) {
      case 'create':
        // Check if tag already exists
        for (let i = 0; i < allTags.length; i++) {
          if (safeGet(() => allTags[i].name()) === tagName) {
            return JSON.stringify({
              error: true,
              message: "Tag '" + tagName + "' already exists"
            });
          }
        }
        
        // Create new tag using make
        try {
          const tagCollection = safeGet(() => doc.tags);
          if (!tagCollection) {
            return JSON.stringify({
              error: true,
              message: "Failed to access document tags collection"
            });
          }
          
          const newTag = app.make({
            new: 'tag',
            withProperties: { name: tagName },
            at: tagCollection
          });
          
          return JSON.stringify({
            success: true,
            action: 'created',
            tagName: tagName,
            tagId: safeGet(() => newTag.id(), 'unknown'),
            message: "Tag '" + tagName + "' created successfully"
          });
        } catch (createError) {
          // If make fails, try alternate syntax
          try {
            const tagCollection = safeGet(() => doc.tags);
            if (!tagCollection) {
              return JSON.stringify({
                error: true,
                message: "Failed to access document tags collection"
              });
            }
            
            const newTag = safeGet(() => tagCollection.push(app.Tag({ name: tagName })));
            return JSON.stringify({
              success: true,
              action: 'created',
              tagName: tagName,
              message: "Tag '" + tagName + "' created successfully"
            });
          } catch (altError) {
            return JSON.stringify({
              error: true,
              message: "Failed to create tag: " + createError.toString() + " / " + altError.toString()
            });
          }
        }
        
      case 'rename':
        // Find tag to rename
        let tagToRename = null;
        for (let i = 0; i < allTags.length; i++) {
          if (safeGet(() => allTags[i].name()) === tagName) {
            tagToRename = allTags[i];
            break;
          }
        }
        
        if (!tagToRename) {
          return JSON.stringify({
            error: true,
            message: "Tag '" + tagName + "' not found"
          });
        }
        
        // Check if new name already exists
        for (let i = 0; i < allTags.length; i++) {
          if (safeGet(() => allTags[i].name()) === newName) {
            return JSON.stringify({
              error: true,
              message: "Tag '" + newName + "' already exists"
            });
          }
        }
        
        // Rename the tag
        tagToRename.name = newName;
        
        return JSON.stringify({
          success: true,
          action: 'renamed',
          oldName: tagName,
          newName: newName,
          message: "Tag renamed from '" + tagName + "' to '" + newName + "'"
        });
        
      case 'delete':
        // Find tag to delete
        let tagToDelete = null;
        let tagIndex = -1;
        for (let i = 0; i < allTags.length; i++) {
          if (safeGet(() => allTags[i].name()) === tagName) {
            tagToDelete = allTags[i];
            tagIndex = i;
            break;
          }
        }
        
        if (!tagToDelete) {
          return JSON.stringify({
            error: true,
            message: "Tag '" + tagName + "' not found"
          });
        }
        
        // Delete the tag using JXA app.delete method
        // Note: OmniFocus automatically removes the tag from all tasks when deleted
        try {
          app.delete(tagToDelete);
          
          return JSON.stringify({
            success: true,
            action: 'deleted',
            tagName: tagName,
            message: "Tag '" + tagName + "' deleted successfully."
          });
        } catch (deleteError) {
          return JSON.stringify({
            error: true,
            message: "Failed to delete tag: " + deleteError.toString(),
            details: "Tag '" + tagName + "' exists but could not be deleted"
          });
        }
        
      case 'merge':
        // Find source and target tags
        let sourceTag = null;
        let targetTagObj = null;
        
        for (let i = 0; i < allTags.length; i++) {
          if (safeGet(() => allTags[i].name()) === tagName) {
            sourceTag = allTags[i];
          }
          if (safeGet(() => allTags[i].name()) === targetTag) {
            targetTagObj = allTags[i];
          }
        }
        
        if (!sourceTag) {
          return JSON.stringify({
            error: true,
            message: "Source tag '" + tagName + "' not found"
          });
        }
        
        if (!targetTagObj) {
          return JSON.stringify({
            error: true,
            message: "Target tag '" + targetTag + "' not found"
          });
        }
        
        // Move all tasks from source to target
        let mergedCount = 0;
        const mergeTasks = doc.flattenedTasks();
        if (!mergeTasks) {
          return JSON.stringify({
            error: true,
            message: "Failed to retrieve tasks from OmniFocus"
          });
        }
        
        for (let i = 0; i < mergeTasks.length; i++) {
          const task = mergeTasks[i];
          try {
            const taskTags = safeGetTags(task);
            const sourceTagName = safeGet(() => sourceTag.name());
            const targetTagName = safeGet(() => targetTagObj.name());
            
            const hasSourceTag = taskTags.includes(sourceTagName);
            const hasTargetTag = taskTags.includes(targetTagName);
            
            if (hasSourceTag) {
              try {
                // Remove source tag
                task.removeTags([sourceTag]);
                
                // Add target tag if not already present
                if (!hasTargetTag) {
                  task.addTags([targetTagObj]);
                }
                
                mergedCount++;
              } catch (tagError) {
                // Continue if tag operations fail on individual task
              }
            }
          } catch (e) {}
        }
        
        // Delete the source tag using JXA app.delete method
        try {
          app.delete(sourceTag);
          
          return JSON.stringify({
            success: true,
            action: 'merged',
            sourceTag: tagName,
            targetTag: targetTag,
            tasksMerged: mergedCount,
            message: "Merged '" + tagName + "' into '" + targetTag + "'. " + mergedCount + " tasks updated."
          });
        } catch (deleteError) {
          return JSON.stringify({
            success: true,
            action: 'merged_with_warning',
            sourceTag: tagName,
            targetTag: targetTag,
            tasksMerged: mergedCount,
            warning: "Tags were merged but source tag could not be deleted: " + deleteError.toString(),
            message: "Merged " + mergedCount + " tasks but could not delete source tag"
          });
        }
        
      default:
        return JSON.stringify({
          error: true,
          message: "Unknown action: " + action
        });
    }
  } catch (error) {
    return JSON.stringify({
      error: true,
      message: "Failed to manage tag: " + error.toString()
    });
  }
`;
