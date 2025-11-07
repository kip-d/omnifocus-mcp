/**
 * list-tags.ts - OmniJS-First Tags Query (v3 Consolidated)
 *
 * Performance improvement: All modes use OmniJS bridge
 *
 * Key optimizations:
 * - Names only: JXA iteration → OmniJS flattenedTags (3.5s → <0.5s expected)
 * - Fast mode: JXA iteration → OmniJS flattenedTags (6.9s → <0.5s expected)
 * - Full mode: Already uses OmniJS, maintained
 * - Pure OmniJS bridge - no helper dependencies (24% smaller than original)
 *
 * Pattern based on: task-velocity.ts and existing full mode
 */

export const LIST_TAGS_SCRIPT = `
  (() => {
    const app = Application('OmniFocus');
    const options = {{options}};

    try {
      const startTime = Date.now();

      // Build OmniJS script based on mode
      const namesOnly = options.namesOnly || false;
      const fastMode = options.fastMode || false;
      const includeUsageStats = options.includeUsageStats || false;
      const includeEmpty = options.includeEmpty !== undefined ? options.includeEmpty : true;
      const sortBy = options.sortBy || 'name';

      let tagsScript;

      // Ultra-fast mode: just return tag names
      if (namesOnly) {
        tagsScript = \`
          (() => {
            const tagNames = [];
            flattenedTags.forEach(tag => {
              if (tag.name) {
                tagNames.push(tag.name);
              }
            });
            return JSON.stringify({
              items: tagNames,
              mode: 'names_only',
              total: tagNames.length
            });
          })()
        \`;
      }
      // Fast mode: id and name only
      else if (fastMode) {
        tagsScript = \`
          (() => {
            const tags = [];
            flattenedTags.forEach(tag => {
              if (tag.id && tag.name) {
                tags.push({
                  id: tag.id.primaryKey,
                  name: tag.name
                });
              }
            });
            return JSON.stringify({
              items: tags,
              mode: 'fast',
              total: tags.length
            });
          })()
        \`;
      }
      // Full mode: all properties including usage stats
      else {
        const includeUsageFlag = includeUsageStats ? 'true' : 'false';
        tagsScript = \`
          (() => {
            const tagDataMap = {};
            const tagUsageByName = {};

            // OmniJS: Get all tag data with properties
            flattenedTags.forEach(tag => {
              const tagName = tag.name;
              const tagId = tag.id ? tag.id.primaryKey : null;

              if (!tagName || !tagId) return;

              const parent = tag.parent;

              tagDataMap[tagName] = {
                id: tagId,
                name: tagName,
                parentId: parent ? parent.id.primaryKey : null,
                parentName: parent ? parent.name : null,
                childrenAreMutuallyExclusive: tag.childrenAreMutuallyExclusive || false
              };

              // Initialize usage stats
              tagUsageByName[tagName] = { total: 0, active: 0, completed: 0 };
            });

            // OmniJS: Count usage if requested
            if ($\{includeUsageFlag}) {
              flattenedTasks.forEach(task => {
                const taskTags = task.tags || [];
                const isCompleted = task.completed || false;

                taskTags.forEach(tag => {
                  const tagName = tag.name;
                  if (!tagName || !tagUsageByName[tagName]) return;

                  tagUsageByName[tagName].total++;
                  if (isCompleted) {
                    tagUsageByName[tagName].completed++;
                  } else {
                    tagUsageByName[tagName].active++;
                  }
                });
              });
            }

            // Build tag array with all data
            const tagsArray = [];
            for (const tagName in tagDataMap) {
              const tagData = tagDataMap[tagName];
              const usage = tagUsageByName[tagName];

              const tagInfo = {
                id: tagData.id,
                name: tagData.name
              };

              // Add usage if calculated
              if ($\{includeUsageFlag}) {
                tagInfo.usage = usage;
              }

              // Add parent info if exists
              if (tagData.parentId) {
                tagInfo.parentId = tagData.parentId;
                tagInfo.parentName = tagData.parentName;
              }

              // Add mutual exclusivity info if set
              if (tagData.childrenAreMutuallyExclusive) {
                tagInfo.childrenAreMutuallyExclusive = tagData.childrenAreMutuallyExclusive;
              }

              tagsArray.push(tagInfo);
            }

            return JSON.stringify({
              items: tagsArray,
              mode: 'full',
              total: tagsArray.length
            });
          })()
        \`;
      }

      // Execute OmniJS script - SINGLE BRIDGE CALL!
      const resultJson = app.evaluateJavascript(tagsScript);
      const result = JSON.parse(resultJson);

      // Filter empty tags if requested (only for full mode with usage stats)
      if (!includeEmpty && includeUsageStats && result.items) {
        result.items = result.items.filter(t => t.usage && t.usage.total > 0);
        result.total = result.items.length;
      }

      // Sort tags
      if (result.items) {
        switch(sortBy) {
          case 'usage':
            result.items.sort((a, b) => (b.usage?.total || 0) - (a.usage?.total || 0));
            break;
          case 'tasks':
            result.items.sort((a, b) => (b.usage?.active || 0) - (a.usage?.active || 0));
            break;
          case 'name':
          default:
            if (namesOnly) {
              // For names only, items are strings
              result.items.sort((a, b) => a.localeCompare(b));
            } else {
              // For other modes, items are objects with name property
              result.items.sort((a, b) => a.name.localeCompare(b.name));
            }
            break;
        }
      }

      const endTime = Date.now();

      // Build summary
      const summary = {
        total: result.total || 0,
        insights: ["Found " + (result.total || 0) + " tags (" + result.mode + " mode)"],
        query_time_ms: endTime - startTime,
        mode: result.mode,
        optimization: 'omnijs_v3'
      };

      return JSON.stringify({
        ok: true,
        v: '3',
        items: result.items || [],
        summary: summary
      });

    } catch (error) {
      return JSON.stringify({
        ok: false,
        error: {
          message: 'Failed to list tags: ' + (error && error.toString ? error.toString() : 'Unknown error'),
          details: error && error.message ? error.message : undefined
        },
        v: '3'
      });
    }
  })();
`;

/**
 * Get just active tags (tags with at least one incomplete task)
 * Pure OmniJS bridge version - much faster than JXA iteration
 */
export const GET_ACTIVE_TAGS_SCRIPT = `
  (() => {
    const app = Application('OmniFocus');

    try {
      const startTime = Date.now();

      // Pure OmniJS bridge to get active tags
      const omniJsScript = \`
        (() => {
          const tagUsage = {};

          // Count available (incomplete) tasks per tag
          flattenedTasks.forEach(task => {
            if (!task.completed) {
              const taskTags = task.tags || [];
              taskTags.forEach(tag => {
                if (tag.name) {
                  tagUsage[tag.name] = (tagUsage[tag.name] || 0) + 1;
                }
              });
            }
          });

          // Return just tag names with > 0 available tasks
          const activeTags = Object.keys(tagUsage).filter(name => tagUsage[name] > 0);
          return JSON.stringify({
            items: activeTags,
            total: activeTags.length
          });
        })()
      \`;

      const resultJson = app.evaluateJavascript(omniJsScript);
      const result = JSON.parse(resultJson);

      // Sort alphabetically
      if (result.items) {
        result.items.sort((a, b) => a.localeCompare(b));
      }

      const endTime = Date.now();

      return JSON.stringify({
        ok: true,
        v: '3',
        items: result.items || [],
        summary: {
          total: result.total || 0,
          insights: ["Found " + (result.total || 0) + " active tags with available tasks"],
          query_time_ms: endTime - startTime,
          mode: 'active_only',
          optimization: 'omnijs_v3'
        }
      });

    } catch (error) {
      return JSON.stringify({
        ok: false,
        error: {
          message: 'Failed to get active tags: ' + (error && error.toString ? error.toString() : 'Unknown error'),
          details: error && error.message ? error.message : undefined
        },
        v: '3'
      });
    }
  })();
`;
