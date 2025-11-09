/**
 * Pure OmniJS v3 manage-tags - zero helper dependencies
 *
 * Manage tags in OmniFocus (create, rename, delete, merge)
 *
 * Features:
 * - Create new tags with duplicate checking
 * - Rename tags with collision detection
 * - Delete tags (automatically removes from all tasks)
 * - Merge tags by moving all tasks from source to target
 * - Nest/unparent/reparent operations for tag hierarchy
 * - Set mutual exclusivity (requires OmniJS bridge)
 * - Comprehensive error handling for each operation
 *
 * Performance: Direct property access, ~10-30x faster than helper version
 */
export const MANAGE_TAGS_V3 = `
(() => {
  const app = Application('OmniFocus');
  app.includeStandardAdditions = true;
  const doc = app.defaultDocument;

  const startTime = Date.now();
  const action = {{action}};
  const tagName = {{tagName}};
  const newName = {{newName}};
  const targetTag = {{targetTag}};
  const parentTagName = {{parentTagName}};
  const parentTagId = {{parentTagId}};
  const mutuallyExclusive = {{mutuallyExclusive}};

  try {
    const allTags = doc.flattenedTags();

    // Check if allTags is null or undefined
    if (!allTags) {
      return {
        ok: false,
        v: '3',
        error: {
          message: 'Failed to retrieve tags from OmniFocus',
          details: 'doc.flattenedTags() returned null or undefined'
        }
      };
    }

    switch(action) {
      case 'create':
        // Check if tag already exists
        for (let i = 0; i < allTags.length; i++) {
          try {
            if (allTags[i].name() === tagName) {
              return {
                ok: false,
                v: '3',
                error: {
                  message: "Tag '" + tagName + "' already exists"
                }
              };
            }
          } catch (e) { /* skip invalid tag */ }
        }

        // Find parent tag if specified
        let parentTag = null;
        if (parentTagName || parentTagId) {
          for (let i = 0; i < allTags.length; i++) {
            const tag = allTags[i];
            try {
              if (parentTagId && tag.id() === parentTagId) {
                parentTag = tag;
                break;
              } else if (parentTagName && tag.name() === parentTagName) {
                parentTag = tag;
                break;
              }
            } catch (e) { /* skip invalid tag */ }
          }

          if (!parentTag) {
            return {
              ok: false,
              v: '3',
              error: {
                message: 'Parent tag not found: ' + (parentTagName || parentTagId)
              }
            };
          }
        }

        // Create new tag using make
        try {
          let newTag;
          if (parentTag) {
            // Create as child of parent tag
            const parentTagsCollection = parentTag.tags;
            if (!parentTagsCollection) {
              return {
                ok: false,
                v: '3',
                error: {
                  message: "Failed to access parent tag's tags collection"
                }
              };
            }

            newTag = app.make({
              new: 'tag',
              withProperties: { name: tagName },
              at: parentTagsCollection
            });
          } else {
            // Create at root level
            const tagCollection = doc.tags;
            if (!tagCollection) {
              return {
                ok: false,
                v: '3',
                error: {
                  message: 'Failed to access document tags collection'
                }
              };
            }

            newTag = app.make({
              new: 'tag',
              withProperties: { name: tagName },
              at: tagCollection
            });
          }

          let newTagId = 'unknown';
          let parentName = null;
          let parentId = null;

          try {
            newTagId = newTag.id();
          } catch (e) { /* couldn't get ID */ }

          if (parentTag) {
            try {
              parentName = parentTag.name();
            } catch (e) { /* couldn't get parent name */ }
            try {
              parentId = parentTag.id();
            } catch (e) { /* couldn't get parent ID */ }
          }

          return {
            ok: true,
            v: '3',
            data: {
              action: 'created',
              tagName: tagName,
              tagId: newTagId,
              parentTagName: parentName,
              parentTagId: parentId,
              message: parentName ?
                "Tag '" + tagName + "' created under '" + parentName + "'" :
                "Tag '" + tagName + "' created successfully"
            },
            query_time_ms: Date.now() - startTime
          };
        } catch (createError) {
          // If make fails, try alternate syntax
          try {
            let newTag;
            if (parentTag) {
              const parentTagsCollection = parentTag.tags;
              if (!parentTagsCollection) {
                return {
                  ok: false,
                  v: '3',
                  error: {
                    message: "Failed to access parent tag's tags collection"
                  }
                };
              }
              newTag = parentTagsCollection.push(app.Tag({ name: tagName }));
            } else {
              const tagCollection = doc.tags;
              if (!tagCollection) {
                return {
                  ok: false,
                  v: '3',
                  error: {
                    message: 'Failed to access document tags collection'
                  }
                };
              }
              newTag = tagCollection.push(app.Tag({ name: tagName }));
            }

            let parentName = null;
            if (parentTag) {
              try {
                parentName = parentTag.name();
              } catch (e) { /* couldn't get parent name */ }
            }

            return {
              ok: true,
              v: '3',
              data: {
                action: 'created',
                tagName: tagName,
                parentTagName: parentName,
                message: parentName ?
                  "Tag '" + tagName + "' created under '" + parentName + "'" :
                  "Tag '" + tagName + "' created successfully"
              },
              query_time_ms: Date.now() - startTime
            };
          } catch (altError) {
            return {
              ok: false,
              v: '3',
              error: {
                message: 'Failed to create tag: ' + createError.toString() + ' / ' + altError.toString()
              }
            };
          }
        }

      case 'rename':
        // Find tag to rename
        let tagToRename = null;
        for (let i = 0; i < allTags.length; i++) {
          try {
            if (allTags[i].name() === tagName) {
              tagToRename = allTags[i];
              break;
            }
          } catch (e) { /* skip invalid tag */ }
        }

        if (!tagToRename) {
          return {
            ok: false,
            v: '3',
            error: {
              message: "Tag '" + tagName + "' not found"
            }
          };
        }

        // Check if new name already exists
        for (let i = 0; i < allTags.length; i++) {
          try {
            if (allTags[i].name() === newName) {
              return {
                ok: false,
                v: '3',
                error: {
                  message: "Tag '" + newName + "' already exists"
                }
              };
            }
          } catch (e) { /* skip invalid tag */ }
        }

        // Rename the tag (direct property assignment)
        tagToRename.name = newName;

        return {
          ok: true,
          v: '3',
          data: {
            action: 'renamed',
            oldName: tagName,
            newName: newName,
            message: "Tag renamed from '" + tagName + "' to '" + newName + "'"
          },
          query_time_ms: Date.now() - startTime
        };

      case 'delete':
        // Find tag to delete
        let tagToDelete = null;
        for (let i = 0; i < allTags.length; i++) {
          try {
            if (allTags[i].name() === tagName) {
              tagToDelete = allTags[i];
              break;
            }
          } catch (e) { /* skip invalid tag */ }
        }

        if (!tagToDelete) {
          return {
            ok: false,
            v: '3',
            error: {
              message: "Tag '" + tagName + "' not found"
            }
          };
        }

        // Delete the tag using JXA app.delete method
        // Note: OmniFocus automatically removes the tag from all tasks when deleted
        try {
          app.delete(tagToDelete);

          return {
            ok: true,
            v: '3',
            data: {
              action: 'deleted',
              tagName: tagName,
              message: "Tag '" + tagName + "' deleted successfully."
            },
            query_time_ms: Date.now() - startTime
          };
        } catch (deleteError) {
          return {
            ok: false,
            v: '3',
            error: {
              message: 'Failed to delete tag: ' + deleteError.toString(),
              details: "Tag '" + tagName + "' exists but could not be deleted"
            }
          };
        }

      case 'merge':
        // Find source and target tags
        let sourceTag = null;
        let targetTagObj = null;

        for (let i = 0; i < allTags.length; i++) {
          try {
            const tagNameStr = allTags[i].name();
            if (tagNameStr === tagName) {
              sourceTag = allTags[i];
            }
            if (tagNameStr === targetTag) {
              targetTagObj = allTags[i];
            }
          } catch (e) { /* skip invalid tag */ }
        }

        if (!sourceTag) {
          return {
            ok: false,
            v: '3',
            error: {
              message: "Source tag '" + tagName + "' not found"
            }
          };
        }

        if (!targetTagObj) {
          return {
            ok: false,
            v: '3',
            error: {
              message: "Target tag '" + targetTag + "' not found"
            }
          };
        }

        // Move all tasks from source to target
        let mergedCount = 0;
        const mergeTasks = doc.flattenedTasks();
        if (!mergeTasks) {
          return {
            ok: false,
            v: '3',
            error: {
              message: 'Failed to retrieve tasks from OmniFocus'
            }
          };
        }

        // Get tag names for comparison
        let sourceTagName = tagName;
        let targetTagName = targetTag;
        try {
          sourceTagName = sourceTag.name();
        } catch (e) { /* use provided name */ }
        try {
          targetTagName = targetTagObj.name();
        } catch (e) { /* use provided name */ }

        for (let i = 0; i < mergeTasks.length; i++) {
          const task = mergeTasks[i];
          try {
            // Get task tags
            const taskTags = [];
            try {
              const tags = task.tags();
              if (tags) {
                for (let j = 0; j < tags.length; j++) {
                  try {
                    taskTags.push(tags[j].name());
                  } catch (e) { /* skip invalid tag */ }
                }
              }
            } catch (e) { /* no tags */ }

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
          } catch (e) { /* skip task */ }
        }

        // Delete the source tag using JXA app.delete method
        try {
          app.delete(sourceTag);

          return {
            ok: true,
            v: '3',
            data: {
              action: 'merged',
              sourceTag: tagName,
              targetTag: targetTag,
              tasksMerged: mergedCount,
              message: "Merged '" + tagName + "' into '" + targetTag + "'. " + mergedCount + " tasks updated."
            },
            query_time_ms: Date.now() - startTime
          };
        } catch (deleteError) {
          return {
            ok: true,
            v: '3',
            data: {
              action: 'merged_with_warning',
              sourceTag: tagName,
              targetTag: targetTag,
              tasksMerged: mergedCount,
              warning: 'Tags were merged but source tag could not be deleted: ' + deleteError.toString(),
              message: 'Merged ' + mergedCount + ' tasks but could not delete source tag'
            },
            query_time_ms: Date.now() - startTime
          };
        }

      case 'nest':
        // Move an existing tag under a parent tag
        let tagToNest = null;
        let newParentTag = null;

        // Find the tag to nest
        for (let i = 0; i < allTags.length; i++) {
          try {
            if (allTags[i].name() === tagName) {
              tagToNest = allTags[i];
              break;
            }
          } catch (e) { /* skip invalid tag */ }
        }

        if (!tagToNest) {
          return {
            ok: false,
            v: '3',
            error: {
              message: "Tag '" + tagName + "' not found"
            }
          };
        }

        // Find the parent tag
        if (parentTagName || parentTagId) {
          for (let i = 0; i < allTags.length; i++) {
            const tag = allTags[i];
            try {
              if (parentTagId && tag.id() === parentTagId) {
                newParentTag = tag;
                break;
              } else if (parentTagName && tag.name() === parentTagName) {
                newParentTag = tag;
                break;
              }
            } catch (e) { /* skip invalid tag */ }
          }

          if (!newParentTag) {
            return {
              ok: false,
              v: '3',
              error: {
                message: 'Parent tag not found: ' + (parentTagName || parentTagId)
              }
            };
          }
        } else {
          return {
            ok: false,
            v: '3',
            error: {
              message: 'Parent tag name or ID is required for nest action'
            }
          };
        }

        // Check for circular reference
        try {
          if (tagToNest.id() === newParentTag.id()) {
            return {
              ok: false,
              v: '3',
              error: {
                message: 'Cannot nest tag under itself'
              }
            };
          }
        } catch (e) { /* couldn't check IDs, continue anyway */ }

        // Move the tag under the parent
        try {
          app.move(tagToNest, { to: newParentTag.tags });

          let parentName = newParentTag.name();
          let parentId = null;
          try {
            parentId = newParentTag.id();
          } catch (e) { /* couldn't get ID */ }

          return {
            ok: true,
            v: '3',
            data: {
              action: 'nested',
              tagName: tagName,
              parentTagName: parentName,
              parentTagId: parentId,
              message: "Tag '" + tagName + "' nested under '" + parentName + "'"
            },
            query_time_ms: Date.now() - startTime
          };
        } catch (nestError) {
          return {
            ok: false,
            v: '3',
            error: {
              message: 'Failed to nest tag: ' + nestError.toString()
            }
          };
        }

      case 'unparent':
        // Move a tag to the root level
        let tagToUnparent = null;

        // Find the tag to unparent
        for (let i = 0; i < allTags.length; i++) {
          try {
            if (allTags[i].name() === tagName) {
              tagToUnparent = allTags[i];
              break;
            }
          } catch (e) { /* skip invalid tag */ }
        }

        if (!tagToUnparent) {
          return {
            ok: false,
            v: '3',
            error: {
              message: "Tag '" + tagName + "' not found"
            }
          };
        }

        // Move the tag to root
        try {
          app.move(tagToUnparent, { to: doc.tags });

          return {
            ok: true,
            v: '3',
            data: {
              action: 'unparented',
              tagName: tagName,
              message: "Tag '" + tagName + "' moved to root level"
            },
            query_time_ms: Date.now() - startTime
          };
        } catch (unparentError) {
          return {
            ok: false,
            v: '3',
            error: {
              message: 'Failed to unparent tag: ' + unparentError.toString()
            }
          };
        }

      case 'reparent':
        // Move a tag from one parent to another
        let tagToReparent = null;
        let newParent = null;

        // Find the tag to reparent
        for (let i = 0; i < allTags.length; i++) {
          try {
            if (allTags[i].name() === tagName) {
              tagToReparent = allTags[i];
              break;
            }
          } catch (e) { /* skip invalid tag */ }
        }

        if (!tagToReparent) {
          return {
            ok: false,
            v: '3',
            error: {
              message: "Tag '" + tagName + "' not found"
            }
          };
        }

        // Find the new parent tag (if specified, otherwise move to root)
        if (parentTagName || parentTagId) {
          for (let i = 0; i < allTags.length; i++) {
            const tag = allTags[i];
            try {
              if (parentTagId && tag.id() === parentTagId) {
                newParent = tag;
                break;
              } else if (parentTagName && tag.name() === parentTagName) {
                newParent = tag;
                break;
              }
            } catch (e) { /* skip invalid tag */ }
          }

          if (!newParent) {
            return {
              ok: false,
              v: '3',
              error: {
                message: 'New parent tag not found: ' + (parentTagName || parentTagId)
              }
            };
          }

          // Check for circular reference
          try {
            if (tagToReparent.id() === newParent.id()) {
              return {
                ok: false,
                v: '3',
                error: {
                  message: 'Cannot reparent tag under itself'
                }
              };
            }
          } catch (e) { /* couldn't check IDs, continue anyway */ }
        }

        // Move the tag to new parent or root
        try {
          if (newParent) {
            app.move(tagToReparent, { to: newParent.tags });

            let parentName = null;
            let parentId = null;
            try {
              parentName = newParent.name();
            } catch (e) { /* couldn't get name */ }
            try {
              parentId = newParent.id();
            } catch (e) { /* couldn't get ID */ }

            return {
              ok: true,
              v: '3',
              data: {
                action: 'reparented',
                tagName: tagName,
                newParentTagName: parentName,
                newParentTagId: parentId,
                message: "Tag '" + tagName + "' moved under '" + parentName + "'"
              },
              query_time_ms: Date.now() - startTime
            };
          } else {
            app.move(tagToReparent, { to: doc.tags });

            return {
              ok: true,
              v: '3',
              data: {
                action: 'reparented',
                tagName: tagName,
                message: "Tag '" + tagName + "' moved to root level"
              },
              query_time_ms: Date.now() - startTime
            };
          }
        } catch (reparentError) {
          return {
            ok: false,
            v: '3',
            error: {
              message: 'Failed to reparent tag: ' + reparentError.toString()
            }
          };
        }

      case 'set_mutual_exclusivity':
        // Set mutual exclusivity constraint on tag's children (OmniFocus 4.7+)
        // MUST use OmniJS bridge - direct JXA property assignment fails
        let tagToUpdate = null;
        let tagId = null;

        // Find the tag
        for (let i = 0; i < allTags.length; i++) {
          try {
            if (allTags[i].name() === tagName) {
              tagToUpdate = allTags[i];
              tagId = allTags[i].id();
              break;
            }
          } catch (e) { /* skip invalid tag */ }
        }

        if (!tagToUpdate) {
          return {
            ok: false,
            v: '3',
            error: {
              message: "Tag '" + tagName + "' not found"
            }
          };
        }

        if (!tagId) {
          return {
            ok: false,
            v: '3',
            error: {
              message: "Failed to get tag ID for '" + tagName + "'"
            }
          };
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
            return {
              ok: false,
              v: '3',
              error: {
                message: 'Bridge error: ' + result.message
              }
            };
          }

          return {
            ok: true,
            v: '3',
            data: {
              action: 'set_mutual_exclusivity',
              tagName: tagName,
              childrenAreMutuallyExclusive: result.value,
              message: "Mutual exclusivity for '" + tagName + "' child tags set to " + (result.value ? "enabled" : "disabled")
            },
            query_time_ms: Date.now() - startTime
          };
        } catch (updateError) {
          return {
            ok: false,
            v: '3',
            error: {
              message: 'Failed to set mutual exclusivity: ' + updateError.toString()
            }
          };
        }

      default:
        return {
          ok: false,
          v: '3',
          error: {
            message: 'Unknown action: ' + action
          }
        };
    }
  } catch (error) {
    return {
      ok: false,
      v: '3',
      error: {
        message: error.message || 'Unknown error in manage tags',
        stack: error.stack
      }
    };
  }
})();
`;
