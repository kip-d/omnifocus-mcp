/**
 * Tag Script Builder - Generates OmniJS scripts for tag queries
 *
 * Tags use MODE-BASED queries (field projection) rather than filter-based
 * queries. This reflects OmniFocus's tag model where you typically want
 * all tags but with different levels of detail.
 *
 * Modes:
 * - 'names': Just string array (fastest)
 * - 'basic': id + name + parentId objects (for most UI)
 * - 'full': All properties + optional usage stats
 *
 * @see docs/plans/2025-11-25-phase3-ast-extension-design.md
 */

import type { TagQueryOptions, TagSortBy } from '../tag-options.js';
import type { TextOperator } from '../filters.js';
import { emitTextCondition, matchVerb } from './text-condition.js';
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
  const { mode, includeEmpty = true, sortBy = 'name', includeUsageStats = false, limit, name, nameOperator } = options;

  switch (mode) {
    case 'names':
      return buildTagNamesScript({ sortBy, limit });
    case 'basic':
      // OMN-170 S2: name filter is supported in basic mode (the read seam's mode).
      return buildBasicTagsScript({ sortBy, limit, name, nameOperator });
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
  /** OMN-170 S2: tag name filter (basic mode only). */
  name?: string;
  nameOperator?: TextOperator;
}

// =============================================================================
// SHARED OMNIS SOURCE FRAGMENTS
// =============================================================================

/**
 * OmniJS source fragment: reads `tag.parent` once and derives `parentId`.
 *
 * Both `buildBasicTagsScript` and `buildFullTagsScript` interpolate these two
 * constants so the parent-accessor logic lives in exactly one place. If OmniJS
 * ever renames `tag.parent` or `id.primaryKey`, update here — not in two
 * separate template strings.
 *
 * Cross-reference: `tests/integration/tools/unified/tag-paths.test.ts`
 * `probeTagByName` uses the equivalent `p ? p.id.primaryKey : null` idiom as
 * its independent test oracle for parent linkage. Keep the two in sync.
 */
/** OmniJS `const parent = tag.parent;` declaration (inside a forEach callback). */
const TAG_PARENT_DECL = 'const parent = tag.parent;';
/** OmniJS expression evaluating to the parent's primary key, or null. */
const TAG_PARENT_ID_EXPR = 'parent ? parent.id.primaryKey : null';

// =============================================================================
// OMNIS NAME PREDICATE
// =============================================================================

/**
 * OMN-170 S2: emit a safe case-insensitive tag-name match predicate (OMN-149
 * pattern — term injected via JSON.stringify only). Returns 'true' (match all)
 * when no name filter is present. Delegates the CONTAINS/MATCHES strategy to the
 * shared {@link emitTextCondition} emitter — single source of truth shared with
 * project-, folder-, and task-name filters (OMN-214/215).
 */
function tagNamePredicate(name?: string, operator?: TextOperator): string {
  if (!name) return 'true';
  return emitTextCondition("(tag.name || '')", name, operator);
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

  const namesOmniJsSource = `
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
    `;

  const script = `
(() => {
  const app = Application('OmniFocus');

  try {
    const startTime = Date.now();

    // OMN-129: program crosses the JXA→OmniJS boundary as a JSON string literal.
    const resultJson = app.evaluateJavascript(${JSON.stringify(namesOmniJsSource)});
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
 * Build script for 'basic' mode - returns {id, name, parentId} objects
 * (OMN-145: parentId is null for top-level tags, a string ID for nested tags)
 * Note: sortBy is ignored in basic mode (always sorted by name)
 */
function buildBasicTagsScript(options: TagScriptOptions = {}): GeneratedScript {
  const { limit, name, nameOperator } = options;
  // sortBy is ignored in basic mode - always sorted by name
  const limitClause = limit ? `const limitCount = ${limit};` : '';
  const limitCheck = limit ? 'if (count >= limitCount) return;' : '';
  const namePredicate = tagNamePredicate(name, nameOperator);
  const hasFilter = !!name;

  // OMN-170 S2 / OMN-129: build the inner OmniJS as a plain source string, then
  // hand it across the JXA→OmniJS boundary as a single JSON.stringify'd string
  // literal (no nested backtick). The name term lands inside this source via
  // namePredicate's JSON.stringify; JSON.stringify at the boundary neutralizes any
  // backtick/${ in the term — killing the OMN-111/113 class outright.
  const tagsOmniJsSource = `
      (() => {
        const tags = [];
        let totalMatched = 0;
        ${limitClause}
        let count = 0;

        // OMN-170 S2: tag name predicate (true = match all when unfiltered).
        function matchesName(tag) { return ${namePredicate}; }

        flattenedTags.forEach(tag => {
          if (!(tag.id && tag.name)) return;
          if (!matchesName(tag)) return;
          totalMatched++;
          ${limitCheck}
          // OMN-145: parentId is always emitted in basic mode (null for top-level tags).
          // Option A (unconditional field) was chosen over an opt-in mode/fields param:
          // an opt-in flag an LLM client won't know to set defeats "make hierarchy
          // reachable"; additive parentId is lower-friction and lower-API-surface.
          // Cost: one O(n) property access on an already-O(n) scan — negligible.
          ${TAG_PARENT_DECL}
          tags.push({
            id: tag.id.primaryKey,
            name: tag.name,
            parentId: ${TAG_PARENT_ID_EXPR}
          });
          count++;
        });

        return JSON.stringify({
          items: tags,
          mode: 'basic',
          total: tags.length,
          total_matched: totalMatched
        });
      })()
    `;

  const script = `
(() => {
  const app = Application('OmniFocus');

  try {
    const startTime = Date.now();

    const resultJson = app.evaluateJavascript(${JSON.stringify(tagsOmniJsSource)});
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
        total_matched: result.total_matched != null ? result.total_matched : (result.total || 0),
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
    filterDescription: hasFilter
      ? `name ${matchVerb(nameOperator)} "${name}"`
      : 'all tags (basic: id + name + parentId)',
    isEmptyFilter: !hasFilter,
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

  const fullOmniJsSource = `
      (() => {
        const tagDataMap = {};
        const tagUsageByName = {};

        // OmniJS: Get all tag data with properties
        flattenedTags.forEach(tag => {
          const tagName = tag.name;
          const tagId = tag.id ? tag.id.primaryKey : null;

          if (!tagName || !tagId) return;

          ${TAG_PARENT_DECL}

          tagDataMap[tagName] = {
            id: tagId,
            name: tagName,
            parentId: ${TAG_PARENT_ID_EXPR},
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
    `;

  const script = `
(() => {
  const app = Application('OmniFocus');

  try {
    const startTime = Date.now();
    const includeUsageStats = ${includeUsageStats};
    const includeEmpty = ${includeEmpty};
    const sortBy = '${sortBy}';
    ${limitClause}

    // OMN-129: program crosses the JXA→OmniJS boundary as a JSON string literal.
    const resultJson = app.evaluateJavascript(${JSON.stringify(fullOmniJsSource)});
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
