// Import shared safe utilities
import { SAFE_UTILITIES_SCRIPT } from './tasks.js';

export const LIST_TAGS_SCRIPT = `
  const options = {{options}};
  
  ${SAFE_UTILITIES_SCRIPT}
  
  try {
    const tags = [];
    const allTags = doc.flattenedTags();
    const allTasks = doc.flattenedTasks();
    
    // Check if collections are null or undefined
    if (!allTags) {
      return JSON.stringify({
        error: true,
        message: "Failed to retrieve tags from OmniFocus. The document may not be available or OmniFocus may not be running properly.",
        details: "doc.flattenedTags() returned null or undefined"
      });
    }
    
    if (!allTasks) {
      return JSON.stringify({
        error: true,
        message: "Failed to retrieve tasks from OmniFocus. The document may not be available or OmniFocus may not be running properly.",
        details: "doc.flattenedTasks() returned null or undefined"
      });
    }
    
    // Count task usage for each tag
    const tagUsage = {};
    
    for (let i = 0; i < allTasks.length; i++) {
      const task = allTasks[i];
      const taskTags = safeGetTags(task);
      
      for (let j = 0; j < taskTags.length; j++) {
        const tagName = taskTags[j];
        
        // Find tag ID by name
        let tagId = null;
        for (let k = 0; k < allTags.length; k++) {
          if (safeGet(() => allTags[k].name()) === tagName) {
            tagId = safeGet(() => allTags[k].id());
            break;
          }
        }
        
        if (tagId) {
          if (!tagUsage[tagId]) {
            tagUsage[tagId] = {
              total: 0,
              active: 0,
              completed: 0
            };
          }
          tagUsage[tagId].total++;
          if (safeIsCompleted(task)) {
            tagUsage[tagId].completed++;
          } else {
            tagUsage[tagId].active++;
          }
        }
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
      
      // Check for child tags
      try {
        const children = tag.tags();
        if (children && Array.isArray(children) && children.length > 0) {
          tagInfo.childCount = children.length;
        }
      } catch (e) {
        // Some tags may not support the tags() method
      }
      
      tags.push(tagInfo);
    }
    
    // Sort tags
    switch(options.sortBy) {
      case 'usage':
        tags.sort((a, b) => b.usage.total - a.usage.total);
        break;
      case 'tasks':
        tags.sort((a, b) => b.usage.active - a.usage.active);
        break;
      case 'name':
      default:
        tags.sort((a, b) => a.name.localeCompare(b.name));
        break;
    }
    
    // Calculate summary
    const totalTags = tags.length;
    const activeTags = tags.filter(t => t.usage.active > 0).length;
    const emptyTags = tags.filter(t => t.usage.total === 0).length;
    
    return JSON.stringify({
      tags: tags,
      summary: {
        totalTags: totalTags,
        activeTags: activeTags,
        emptyTags: emptyTags,
        mostUsed: tags.length > 0 ? tags[0].name : null
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
          const newTag = app.make({
            new: 'tag',
            withProperties: { name: tagName },
            at: doc.tags
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
            const newTag = doc.tags.push(app.Tag({ name: tagName }));
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
        
        // Count tasks using this tag
        let taskCount = 0;
        const tasks = doc.flattenedTasks();
        for (let i = 0; i < tasks.length; i++) {
          try {
            const taskTags = safeGet(() => tasks[i].tags(), []);
            for (let j = 0; j < taskTags.length; j++) {
              if (safeGet(() => taskTags[j].id()) === tagToDelete.id()) {
                taskCount++;
                break;
              }
            }
          } catch (e) {}
        }
        
        // Delete the tag using JXA app.delete method
        app.delete(tagToDelete);
        
        return JSON.stringify({
          success: true,
          action: 'deleted',
          tagName: tagName,
          tasksAffected: taskCount,
          message: "Tag '" + tagName + "' deleted. " + taskCount + " tasks were affected."
        });
        
      case 'merge':
        // Find source and target tags
        let sourceTag = null;
        let targetTagObj = null;
        
        for (let i = 0; i < allTags.length; i++) {
          if (safeGet(() => allTags[i].name()) === tagName) {
            sourceTag = allTags[i];
          }
          if (allTags[i].name() === targetTag) {
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
        const tasks = doc.flattenedTasks();
        
        for (let i = 0; i < tasks.length; i++) {
          const task = tasks[i];
          try {
            const taskTags = safeGet(() => task.tags(), []);
            let hasSourceTag = false;
            let hasTargetTag = false;
            
            for (let j = 0; j < taskTags.length; j++) {
              const tagId = safeGet(() => taskTags[j].id());
              if (tagId === sourceTag.id()) {
                hasSourceTag = true;
              }
              if (tagId === targetTagObj.id()) {
                hasTargetTag = true;
              }
            }
            
            if (hasSourceTag) {
              // Remove source tag
              task.removeTags([sourceTag]);
              
              // Add target tag if not already present
              if (!hasTargetTag) {
                task.addTags([targetTagObj]);
              }
              
              mergedCount++;
            }
          } catch (e) {}
        }
        
        // Delete the source tag using JXA app.delete method
        app.delete(sourceTag);
        
        return JSON.stringify({
          success: true,
          action: 'merged',
          sourceTag: tagName,
          targetTag: targetTag,
          tasksMerged: mergedCount,
          message: "Merged '" + tagName + "' into '" + targetTag + "'. " + mergedCount + " tasks updated."
        });
        
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
