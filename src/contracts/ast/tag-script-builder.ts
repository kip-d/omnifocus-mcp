/**
 * Tag Script Builder - Generates OmniJS scripts for tag queries
 *
 * Tags use MODE-BASED queries (field projection) rather than filter-based
 * queries. This reflects OmniFocus's tag model where you typically want
 * all tags but with different levels of detail.
 *
 * Modes:
 * - 'names': Just string array (fastest)
 * - 'basic': id + name objects (for most UI)
 * - 'full': All properties + optional usage stats
 *
 * @see docs/plans/2025-11-25-phase3-ast-extension-design.md
 */

import type { TagQueryOptions, TagSortBy } from '../tag-options.js';
import type { GeneratedScript } from './script-builder.js';

// =============================================================================
// MAIN TAG SCRIPT BUILDER
// =============================================================================

/**
 * Build an OmniJS script that queries tags based on mode
 *
 * @param options - TagQueryOptions specifying mode and options
 * @returns Generated script ready for execution
 */
export function buildTagsScript(options: TagQueryOptions): GeneratedScript {
  const { mode, includeEmpty = true, sortBy = 'name', includeUsageStats = false, limit } = options;

  switch (mode) {
    case 'names':
      return buildTagNamesScript({ sortBy, limit });
    case 'basic':
      return buildBasicTagsScript({ sortBy, limit });
    case 'full':
      return buildFullTagsScript({ includeEmpty, sortBy, includeUsageStats, limit });
    default: {
      // Exhaustive check - this should never be reached
      const _exhaustiveCheck: never = mode;
      throw new Error(`Unknown tag query mode: ${String(_exhaustiveCheck)}`);
    }
  }
}

// =============================================================================
// MODE-SPECIFIC BUILDERS
// =============================================================================

interface TagScriptOptions {
  sortBy?: TagSortBy;
  limit?: number;
}

/**
 * Build script for 'names' mode - just returns tag name strings
 * Note: sortBy is ignored in names mode (always sorted by name)
 */
function buildTagNamesScript(options: TagScriptOptions = {}): GeneratedScript {
  const { limit } = options;
  // sortBy is ignored in names mode - strings are always sorted alphabetically
  const limitClause = limit ? `const limitCount = ${limit};` : '';
  const limitCheck = limit ? 'if (count >= limitCount) return;' : '';

  const script = `
(() => {
  const app = Application('OmniFocus');

  try {
    const startTime = Date.now();

    const omniJsScript = \`
      (() => {
        const tagNames = [];
        ${limitClause}
        let count = 0;

        flattenedTags.forEach(tag => {
          ${limitCheck}
          if (tag.name) {
            tagNames.push(tag.name);
            count++;
          }
        });

        return JSON.stringify({
          items: tagNames,
          mode: 'names',
          total: tagNames.length
        });
      })()
    \`;

    const resultJson = app.evaluateJavascript(omniJsScript);
    const result = JSON.parse(resultJson);

    // Sort by name (only option for names mode)
    if (result.items) {
      result.items.sort((a, b) => a.localeCompare(b));
    }

    const endTime = Date.now();

    return JSON.stringify({
      ok: true,
      v: 'ast',
      items: result.items || [],
      summary: {
        total: result.total || 0,
        insights: ["Found " + (result.total || 0) + " tags (names mode)"],
        query_time_ms: endTime - startTime,
        mode: 'names',
        optimization: 'ast_tag_builder'
      }
    });

  } catch (error) {
    return JSON.stringify({
      ok: false,
      error: {
        message: 'Failed to list tags: ' + (error && error.toString ? error.toString() : 'Unknown error'),
        details: error && error.message ? error.message : undefined
      },
      v: 'ast'
    });
  }
})()
`;

  return {
    script: script.trim(),
    filterDescription: 'all tags (names only)',
    isEmptyFilter: true,
  };
}

/**
 * Build script for 'basic' mode - returns {id, name} objects
 * Note: sortBy is ignored in basic mode (always sorted by name)
 */
function buildBasicTagsScript(options: TagScriptOptions = {}): GeneratedScript {
  const { limit } = options;
  // sortBy is ignored in basic mode - always sorted by name
  const limitClause = limit ? `const limitCount = ${limit};` : '';
  const limitCheck = limit ? 'if (count >= limitCount) return;' : '';

  const script = `
(() => {
  const app = Application('OmniFocus');

  try {
    const startTime = Date.now();

    const omniJsScript = \`
      (() => {
        const tags = [];
        ${limitClause}
        let count = 0;

        flattenedTags.forEach(tag => {
          ${limitCheck}
          if (tag.id && tag.name) {
            tags.push({
              id: tag.id.primaryKey,
              name: tag.name
            });
            count++;
          }
        });

        return JSON.stringify({
          items: tags,
          mode: 'basic',
          total: tags.length
        });
      })()
    \`;

    const resultJson = app.evaluateJavascript(omniJsScript);
    const result = JSON.parse(resultJson);

    // Sort by name
    if (result.items) {
      result.items.sort((a, b) => a.name.localeCompare(b.name));
    }

    const endTime = Date.now();

    return JSON.stringify({
      ok: true,
      v: 'ast',
      items: result.items || [],
      summary: {
        total: result.total || 0,
        insights: ["Found " + (result.total || 0) + " tags (basic mode)"],
        query_time_ms: endTime - startTime,
        mode: 'basic',
        optimization: 'ast_tag_builder'
      }
    });

  } catch (error) {
    return JSON.stringify({
      ok: false,
      error: {
        message: 'Failed to list tags: ' + (error && error.toString ? error.toString() : 'Unknown error'),
        details: error && error.message ? error.message : undefined
      },
      v: 'ast'
    });
  }
})()
`;

  return {
    script: script.trim(),
    filterDescription: 'all tags (basic: id + name)',
    isEmptyFilter: true,
  };
}

interface FullTagScriptOptions extends TagScriptOptions {
  includeEmpty?: boolean;
  includeUsageStats?: boolean;
}

/**
 * Build script for 'full' mode - returns all properties with optional usage stats
 */
function buildFullTagsScript(options: FullTagScriptOptions = {}): GeneratedScript {
  const { includeEmpty = true, sortBy = 'name', includeUsageStats = false, limit } = options;

  const limitClause = limit ? `const limitCount = ${limit};` : '';

  const script = `
(() => {
  const app = Application('OmniFocus');

  try {
    const startTime = Date.now();
    const includeUsageStats = ${includeUsageStats};
    const includeEmpty = ${includeEmpty};
    const sortBy = '${sortBy}';
    ${limitClause}

    const omniJsScript = \`
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
            childrenAreMutuallyExclusive: tag.childrenAreMutuallyExclusive || false,
            allowsNextAction: tag.allowsNextAction !== false,
            status: tag.status ? tag.status.toString() : 'active'
          };

          // Initialize usage stats
          tagUsageByName[tagName] = { total: 0, active: 0, completed: 0, flagged: 0 };
        });

        // OmniJS: Count usage if requested
        if (${includeUsageStats}) {
          flattenedTasks.forEach(task => {
            const taskTags = task.tags || [];
            const isCompleted = task.completed || false;
            const isFlagged = task.flagged || false;

            taskTags.forEach(tag => {
              const tagName = tag.name;
              if (!tagName || !tagUsageByName[tagName]) return;

              tagUsageByName[tagName].total++;
              if (isCompleted) {
                tagUsageByName[tagName].completed++;
              } else {
                tagUsageByName[tagName].active++;
              }
              if (isFlagged) {
                tagUsageByName[tagName].flagged++;
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
            name: tagData.name,
            allowsNextAction: tagData.allowsNextAction,
            status: tagData.status
          };

          // Add usage if calculated
          if (${includeUsageStats}) {
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

    const resultJson = app.evaluateJavascript(omniJsScript);
    const result = JSON.parse(resultJson);

    // Filter empty tags if requested (only meaningful with usage stats)
    if (!includeEmpty && includeUsageStats && result.items) {
      result.items = result.items.filter(t => t.usage && t.usage.total > 0);
      result.total = result.items.length;
    }

    // Apply limit after filtering
    ${limit ? 'if (result.items && result.items.length > limitCount) { result.items = result.items.slice(0, limitCount); }' : ''}

    // Sort tags
    if (result.items) {
      switch(sortBy) {
        case 'usage':
          result.items.sort((a, b) => (b.usage?.total || 0) - (a.usage?.total || 0));
          break;
        case 'activeTasks':
          result.items.sort((a, b) => (b.usage?.active || 0) - (a.usage?.active || 0));
          break;
        case 'name':
        default:
          result.items.sort((a, b) => a.name.localeCompare(b.name));
          break;
      }
    }

    const endTime = Date.now();

    return JSON.stringify({
      ok: true,
      v: 'ast',
      items: result.items || [],
      summary: {
        total: result.total || 0,
        insights: [
          "Found " + (result.total || 0) + " tags (full mode)",
          includeUsageStats ? "Usage stats included" : "Usage stats not included"
        ],
        query_time_ms: endTime - startTime,
        mode: 'full',
        includeUsageStats: includeUsageStats,
        optimization: 'ast_tag_builder'
      }
    });

  } catch (error) {
    return JSON.stringify({
      ok: false,
      error: {
        message: 'Failed to list tags: ' + (error && error.toString ? error.toString() : 'Unknown error'),
        details: error && error.message ? error.message : undefined
      },
      v: 'ast'
    });
  }
})()
`;

  return {
    script: script.trim(),
    filterDescription: `all tags (full${includeUsageStats ? ' with usage stats' : ''})`,
    isEmptyFilter: true,
  };
}

/**
 * Build script to get active tags only (tags with at least one incomplete task)
 */
export function buildActiveTagsScript(): GeneratedScript {
  const script = `
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
      v: 'ast',
      items: result.items || [],
      summary: {
        total: result.total || 0,
        insights: ["Found " + (result.total || 0) + " active tags with available tasks"],
        query_time_ms: endTime - startTime,
        mode: 'active_only',
        optimization: 'ast_tag_builder'
      }
    });

  } catch (error) {
    return JSON.stringify({
      ok: false,
      error: {
        message: 'Failed to get active tags: ' + (error && error.toString ? error.toString() : 'Unknown error'),
        details: error && error.message ? error.message : undefined
      },
      v: 'ast'
    });
  }
})()
`;

  return {
    script: script.trim(),
    filterDescription: 'active tags (with incomplete tasks)',
    isEmptyFilter: false,
  };
}
