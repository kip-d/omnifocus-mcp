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
  const action = {{action}};
  const tagName = {{tagName}};
  const newName = {{newName}};
  const targetTag = {{targetTag}};
  const parentTagName = {{parentTagName}};
  const parentTagId = {{parentTagId}};
  
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
        
        // Find parent tag if specified
        let parentTag = null;
        if (parentTagName || parentTagId) {
          for (let i = 0; i < allTags.length; i++) {
            const tag = allTags[i];
            if (parentTagId && safeGet(() => tag.id()) === parentTagId) {
              parentTag = tag;
              break;
            } else if (parentTagName && safeGet(() => tag.name()) === parentTagName) {
              parentTag = tag;
              break;
            }
          }
          
          if (!parentTag) {
            return JSON.stringify({
              error: true,
              message: "Parent tag not found: " + (parentTagName || parentTagId)
            });
          }
        }
        
        // Create new tag using make
        try {
          let newTag;
          if (parentTag) {
            // Create as child of parent tag
            const parentTagsCollection = safeGet(() => parentTag.tags);
            if (!parentTagsCollection) {
              return JSON.stringify({
                error: true,
                message: "Failed to access parent tag's tags collection"
              });
            }
            
            newTag = app.make({
              new: 'tag',
              withProperties: { name: tagName },
              at: parentTagsCollection
            });
          } else {
            // Create at root level
            const tagCollection = safeGet(() => doc.tags);
            if (!tagCollection) {
              return JSON.stringify({
                error: true,
                message: "Failed to access document tags collection"
              });
            }
            
            newTag = app.make({
              new: 'tag',
              withProperties: { name: tagName },
              at: tagCollection
            });
          }
          
          return JSON.stringify({
            success: true,
            action: 'created',
            tagName: tagName,
            tagId: safeGet(() => newTag.id(), 'unknown'),
            parentTagName: parentTag ? safeGet(() => parentTag.name()) : null,
            parentTagId: parentTag ? safeGet(() => parentTag.id()) : null,
            message: parentTag ? 
              "Tag '" + tagName + "' created under '" + safeGet(() => parentTag.name()) + "'" :
              "Tag '" + tagName + "' created successfully"
          });
        } catch (createError) {
          // If make fails, try alternate syntax
          try {
            let newTag;
            if (parentTag) {
              const parentTagsCollection = safeGet(() => parentTag.tags);
              if (!parentTagsCollection) {
                return JSON.stringify({
                  error: true,
                  message: "Failed to access parent tag's tags collection"
                });
              }
              newTag = safeGet(() => parentTagsCollection.push(app.Tag({ name: tagName })));
            } else {
              const tagCollection = safeGet(() => doc.tags);
              if (!tagCollection) {
                return JSON.stringify({
                  error: true,
                  message: "Failed to access document tags collection"
                });
              }
              newTag = safeGet(() => tagCollection.push(app.Tag({ name: tagName })));
            }
            
            return JSON.stringify({
              success: true,
              action: 'created',
              tagName: tagName,
              parentTagName: parentTag ? safeGet(() => parentTag.name()) : null,
              message: parentTag ?
                "Tag '" + tagName + "' created under '" + safeGet(() => parentTag.name()) + "'" :
                "Tag '" + tagName + "' created successfully"
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
        
      case 'nest':
        // Move an existing tag under a parent tag
        let tagToNest = null;
        let newParentTag = null;
        
        // Find the tag to nest
        for (let i = 0; i < allTags.length; i++) {
          if (safeGet(() => allTags[i].name()) === tagName) {
            tagToNest = allTags[i];
            break;
          }
        }
        
        if (!tagToNest) {
          return JSON.stringify({
            error: true,
            message: "Tag '" + tagName + "' not found"
          });
        }
        
        // Find the parent tag
        if (parentTagName || parentTagId) {
          for (let i = 0; i < allTags.length; i++) {
            const tag = allTags[i];
            if (parentTagId && safeGet(() => tag.id()) === parentTagId) {
              newParentTag = tag;
              break;
            } else if (parentTagName && safeGet(() => tag.name()) === parentTagName) {
              newParentTag = tag;
              break;
            }
          }
          
          if (!newParentTag) {
            return JSON.stringify({
              error: true,
              message: "Parent tag not found: " + (parentTagName || parentTagId)
            });
          }
        } else {
          return JSON.stringify({
            error: true,
            message: "Parent tag name or ID is required for nest action"
          });
        }
        
        // Check for circular reference
        if (safeGet(() => tagToNest.id()) === safeGet(() => newParentTag.id())) {
          return JSON.stringify({
            error: true,
            message: "Cannot nest tag under itself"
          });
        }
        
        // Move the tag under the parent
        try {
          app.move(tagToNest, { to: newParentTag.tags });
          
          return JSON.stringify({
            success: true,
            action: 'nested',
            tagName: tagName,
            parentTagName: safeGet(() => newParentTag.name()),
            parentTagId: safeGet(() => newParentTag.id()),
            message: "Tag '" + tagName + "' nested under '" + safeGet(() => newParentTag.name()) + "'"
          });
        } catch (nestError) {
          return JSON.stringify({
            error: true,
            message: "Failed to nest tag: " + nestError.toString()
          });
        }
        
      case 'unparent':
        // Move a tag to the root level
        let tagToUnparent = null;
        
        // Find the tag to unparent
        for (let i = 0; i < allTags.length; i++) {
          if (safeGet(() => allTags[i].name()) === tagName) {
            tagToUnparent = allTags[i];
            break;
          }
        }
        
        if (!tagToUnparent) {
          return JSON.stringify({
            error: true,
            message: "Tag '" + tagName + "' not found"
          });
        }
        
        // Move the tag to root
        try {
          app.move(tagToUnparent, { to: doc.tags });
          
          return JSON.stringify({
            success: true,
            action: 'unparented',
            tagName: tagName,
            message: "Tag '" + tagName + "' moved to root level"
          });
        } catch (unparentError) {
          return JSON.stringify({
            error: true,
            message: "Failed to unparent tag: " + unparentError.toString()
          });
        }
        
      case 'reparent':
        // Move a tag from one parent to another
        let tagToReparent = null;
        let newParent = null;
        
        // Find the tag to reparent
        for (let i = 0; i < allTags.length; i++) {
          if (safeGet(() => allTags[i].name()) === tagName) {
            tagToReparent = allTags[i];
            break;
          }
        }
        
        if (!tagToReparent) {
          return JSON.stringify({
            error: true,
            message: "Tag '" + tagName + "' not found"
          });
        }
        
        // Find the new parent tag (if specified, otherwise move to root)
        if (parentTagName || parentTagId) {
          for (let i = 0; i < allTags.length; i++) {
            const tag = allTags[i];
            if (parentTagId && safeGet(() => tag.id()) === parentTagId) {
              newParent = tag;
              break;
            } else if (parentTagName && safeGet(() => tag.name()) === parentTagName) {
              newParent = tag;
              break;
            }
          }
          
          if (!newParent) {
            return JSON.stringify({
              error: true,
              message: "New parent tag not found: " + (parentTagName || parentTagId)
            });
          }
          
          // Check for circular reference
          if (safeGet(() => tagToReparent.id()) === safeGet(() => newParent.id())) {
            return JSON.stringify({
              error: true,
              message: "Cannot reparent tag under itself"
            });
          }
        }
        
        // Move the tag to new parent or root
        try {
          if (newParent) {
            app.move(tagToReparent, { to: newParent.tags });
            
            return JSON.stringify({
              success: true,
              action: 'reparented',
              tagName: tagName,
              newParentTagName: safeGet(() => newParent.name()),
              newParentTagId: safeGet(() => newParent.id()),
              message: "Tag '" + tagName + "' moved under '" + safeGet(() => newParent.name()) + "'"
            });
          } else {
            app.move(tagToReparent, { to: doc.tags });
            
            return JSON.stringify({
              success: true,
              action: 'reparented',
              tagName: tagName,
              message: "Tag '" + tagName + "' moved to root level"
            });
          }
        } catch (reparentError) {
          return JSON.stringify({
            error: true,
            message: "Failed to reparent tag: " + reparentError.toString()
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
