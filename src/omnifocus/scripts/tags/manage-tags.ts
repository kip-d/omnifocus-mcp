import { getUnifiedHelpers } from '../shared/helpers.js';

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
  ${getUnifiedHelpers()}
  
  (() => {
  const action = {{action}};
  const tagName = {{tagName}};
  const newName = {{newName}};
  const targetTag = {{targetTag}};
  const parentTagName = {{parentTagName}};
  const parentTagId = {{parentTagId}};
  const mutuallyExclusive = {{mutuallyExclusive}};
  
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
        // Move an existing tag under a parent tag using OmniJS bridge
        // JXA's app.move() doesn't work for tag nesting - must use OmniJS moveTags()
        if (!parentTagName && !parentTagId) {
          return JSON.stringify({
            error: true,
            message: "Parent tag name or ID is required for nest action"
          });
        }

        // Use OmniJS bridge for tag nesting
        const nestScript = \`
          (() => {
            const tagToNestName = \${JSON.stringify(tagName)};
            const parentName = \${JSON.stringify(parentTagName || '')};
            const parentId = \${JSON.stringify(parentTagId || '')};

            // Find tag to nest using flattenedTags
            let tagToNest = null;
            flattenedTags.forEach(t => {
              if (t.name === tagToNestName) tagToNest = t;
            });

            if (!tagToNest) {
              return JSON.stringify({
                error: true,
                message: "Tag '" + tagToNestName + "' not found"
              });
            }

            // Find parent tag
            let parentTag = null;
            flattenedTags.forEach(t => {
              if (parentId && t.id.primaryKey === parentId) parentTag = t;
              else if (parentName && t.name === parentName) parentTag = t;
            });

            if (!parentTag) {
              return JSON.stringify({
                error: true,
                message: "Parent tag not found: " + (parentName || parentId)
              });
            }

            // Check for self-reference
            if (tagToNest.id.primaryKey === parentTag.id.primaryKey) {
              return JSON.stringify({
                error: true,
                message: "Cannot nest tag under itself"
              });
            }

            // Use OmniJS moveTags function
            try {
              moveTags([tagToNest], parentTag);
              return JSON.stringify({
                success: true,
                action: 'nested',
                tagName: tagToNestName,
                parentTagName: parentTag.name,
                parentTagId: parentTag.id.primaryKey,
                message: "Tag '" + tagToNestName + "' nested under '" + parentTag.name + "'"
              });
            } catch (e) {
              return JSON.stringify({
                error: true,
                message: "Failed to nest tag: " + e.toString()
              });
            }
          })()
        \`;

        try {
          const nestResult = app.evaluateJavascript(nestScript);
          return nestResult;
        } catch (bridgeError) {
          return JSON.stringify({
            error: true,
            message: "Failed to execute nest operation: " + bridgeError.toString()
          });
        }
        
      case 'unparent':
        // Move a tag to the root level using OmniJS bridge
        // JXA's app.move() doesn't work for tag hierarchy - must use OmniJS moveTags()
        const unparentScript = \`
          (() => {
            const tagToUnparentName = \${JSON.stringify(tagName)};

            // Find tag to unparent using flattenedTags
            let tagToUnparent = null;
            flattenedTags.forEach(t => {
              if (t.name === tagToUnparentName) tagToUnparent = t;
            });

            if (!tagToUnparent) {
              return JSON.stringify({
                error: true,
                message: "Tag '" + tagToUnparentName + "' not found"
              });
            }

            // Move to root (null parent means root level in moveTags)
            try {
              moveTags([tagToUnparent], null);
              return JSON.stringify({
                success: true,
                action: 'unparented',
                tagName: tagToUnparentName,
                message: "Tag '" + tagToUnparentName + "' moved to root level"
              });
            } catch (e) {
              return JSON.stringify({
                error: true,
                message: "Failed to unparent tag: " + e.toString()
              });
            }
          })()
        \`;

        try {
          const unparentResult = app.evaluateJavascript(unparentScript);
          return unparentResult;
        } catch (bridgeError) {
          return JSON.stringify({
            error: true,
            message: "Failed to execute unparent operation: " + bridgeError.toString()
          });
        }

      case 'reparent':
        // Move a tag from one parent to another using OmniJS bridge
        // JXA's app.move() doesn't work for tag hierarchy - must use OmniJS moveTags()
        const reparentScript = \`
          (() => {
            const tagToReparentName = \${JSON.stringify(tagName)};
            const parentName = \${JSON.stringify(parentTagName || '')};
            const parentId = \${JSON.stringify(parentTagId || '')};

            // Find tag to reparent using flattenedTags
            let tagToReparent = null;
            flattenedTags.forEach(t => {
              if (t.name === tagToReparentName) tagToReparent = t;
            });

            if (!tagToReparent) {
              return JSON.stringify({
                error: true,
                message: "Tag '" + tagToReparentName + "' not found"
              });
            }

            // Find new parent tag (if specified)
            let newParent = null;
            if (parentName || parentId) {
              flattenedTags.forEach(t => {
                if (parentId && t.id.primaryKey === parentId) newParent = t;
                else if (parentName && t.name === parentName) newParent = t;
              });

              if (!newParent) {
                return JSON.stringify({
                  error: true,
                  message: "New parent tag not found: " + (parentName || parentId)
                });
              }

              // Check for self-reference
              if (tagToReparent.id.primaryKey === newParent.id.primaryKey) {
                return JSON.stringify({
                  error: true,
                  message: "Cannot reparent tag under itself"
                });
              }
            }

            // Move to new parent or root
            try {
              moveTags([tagToReparent], newParent);
              if (newParent) {
                return JSON.stringify({
                  success: true,
                  action: 'reparented',
                  tagName: tagToReparentName,
                  newParentTagName: newParent.name,
                  newParentTagId: newParent.id.primaryKey,
                  message: "Tag '" + tagToReparentName + "' moved under '" + newParent.name + "'"
                });
              } else {
                return JSON.stringify({
                  success: true,
                  action: 'reparented',
                  tagName: tagToReparentName,
                  message: "Tag '" + tagToReparentName + "' moved to root level"
                });
              }
            } catch (e) {
              return JSON.stringify({
                error: true,
                message: "Failed to reparent tag: " + e.toString()
              });
            }
          })()
        \`;

        try {
          const reparentResult = app.evaluateJavascript(reparentScript);
          return reparentResult;
        } catch (bridgeError) {
          return JSON.stringify({
            error: true,
            message: "Failed to execute reparent operation: " + bridgeError.toString()
          });
        }

      case 'set_mutual_exclusivity':
        // Set mutual exclusivity constraint on tag's children (OmniFocus 4.7+)
        // MUST use OmniJS bridge - direct JXA property assignment fails
        let tagToUpdate = null;
        let tagId = null;

        // Find the tag
        for (let i = 0; i < allTags.length; i++) {
          if (safeGet(() => allTags[i].name()) === tagName) {
            tagToUpdate = allTags[i];
            tagId = safeGet(() => allTags[i].id());
            break;
          }
        }

        if (!tagToUpdate) {
          return JSON.stringify({
            error: true,
            message: "Tag '" + tagName + "' not found"
          });
        }

        if (!tagId) {
          return JSON.stringify({
            error: true,
            message: "Failed to get tag ID for '" + tagName + "'"
          });
        }

        // Set mutual exclusivity property using OmniJS bridge
        try {
          const bridgeScript = \`
            (() => {
              const tag = Tag.byIdentifier(\${JSON.stringify(tagId)});
              if (!tag) {
                return JSON.stringify({ error: true, message: "Tag not found by ID" });
              }
              tag.childrenAreMutuallyExclusive = \${mutuallyExclusive === true};
              return JSON.stringify({ success: true, value: tag.childrenAreMutuallyExclusive });
            })()
          \`;

          const bridgeResult = app.evaluateJavascript(bridgeScript);
          const result = JSON.parse(bridgeResult);

          if (result.error) {
            return JSON.stringify({
              error: true,
              message: "Bridge error: " + result.message
            });
          }

          return JSON.stringify({
            success: true,
            action: 'set_mutual_exclusivity',
            tagName: tagName,
            childrenAreMutuallyExclusive: result.value,
            message: "Mutual exclusivity for '" + tagName + "' child tags set to " + (result.value ? "enabled" : "disabled")
          });
        } catch (updateError) {
          return JSON.stringify({
            error: true,
            message: "Failed to set mutual exclusivity: " + updateError.toString()
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
