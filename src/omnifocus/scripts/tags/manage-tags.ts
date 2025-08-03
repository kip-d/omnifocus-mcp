import { getAllHelpers } from '../shared/helpers.js';

/**
 * Script to manage tags in OmniFocus (create, rename, delete, merge)
 * 
 * Features:
 * - Create new tags with duplicate checking
 * - Rename tags with collision detection
 * - Delete tags (automatically removes from all tasks)
 * - Merge tags by moving all tasks from source to target
 * - Comprehensive error handling for each operation
 */
export const MANAGE_TAGS_SCRIPT = `
  ${getAllHelpers()}
  
  (() => {
  
  try {
    const app = Application('OmniFocus');
    const doc = app.defaultDocument();
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
    return formatError(error, 'manage_tags');
  }
  })();
`;