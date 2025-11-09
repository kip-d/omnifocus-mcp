/**
 * Date Fields Bridge - Get added/modified/dropDate via OmniJS
 *
 * These fields cannot be accessed via JXA due to Date type conversion limitations.
 * This bridge uses the EMBEDDED BRIDGE HELPER PATTERN from minimal-tag-bridge.ts.
 *
 * ============================================================================
 * 🎯 PATTERN IMPLEMENTATION: Date Field Retrieval
 * ============================================================================
 *
 * PROBLEM SOLVED:
 * - JXA cannot access task.added, task.modified, or task.dropDate properties
 * - Direct access throws "Can't convert types" error
 * - Pure OmniJS CAN access these properties as properties (not methods)
 *
 * SOLUTION:
 * - Embed bridge function that calls evaluateJavascript()
 * - In OmniJS context, access properties as: task.added (not task.added())
 * - Return date map indexed by task ID for efficient merging
 *
 * USAGE PATTERN (see list-tasks.ts lines 427-465):
 * ```typescript
 * import { getDateFieldsBridge } from '../shared/date-fields-bridge.js';
 *
 * export const MY_SCRIPT = `
 *   ${getDateFieldsBridge()}  // ← Embed bridge function
 *
 *   (() => {
 *     const app = Application('OmniFocus');
 *     const results = []; // Your filtered tasks
 *
 *     // Check if date fields requested
 *     const needsDateFields = shouldIncludeField('added') ||
 *                             shouldIncludeField('modified') ||
 *                             shouldIncludeField('dropDate');
 *
 *     if (needsDateFields && results.length > 0) {
 *       // Collect task IDs
 *       const taskIds = results.map(t => t.id);
 *
 *       // Get date fields via bridge (single call for all tasks)
 *       const dateFields = bridgeGetDateFields(app, taskIds);
 *
 *       // Merge into results
 *       for (const task of results) {
 *         if (dateFields[task.id]) {
 *           task.added = dateFields[task.id].added;
 *           task.modified = dateFields[task.id].modified;
 *           task.dropDate = dateFields[task.id].dropDate;
 *         }
 *       }
 *     }
 *
 *     return JSON.stringify({ tasks: results });
 *   })()
 * `;
 * ```
 *
 * KEY DIFFERENCES FROM TAG BRIDGE:
 * - Tags: SET operation (bridgeSetTags)
 * - Dates: GET operation (bridgeGetDateFields)
 * - Tags: Per-task calls
 * - Dates: Bulk retrieval for efficiency
 *
 * PERFORMANCE:
 * - Single evaluateJavascript() call for all tasks
 * - Returns object map for O(1) lookups during merge
 * - Early exit when all requested tasks found
 *
 * RELATED FILES:
 * - minimal-tag-bridge.ts - Original pattern (tag assignment)
 * - list-tasks.ts - Complete implementation example
 * - docs/dev/PATTERN_INDEX.md - Pattern documentation
 *
 * LESSON LEARNED:
 * This implementation took 10 minutes after finding the minimal-tag-bridge
 * pattern. Initial attempt (two-stage query from TypeScript) took 2+ hours
 * and was eventually scrapped. ALWAYS search for existing patterns first!
 * ============================================================================
 */

export const DATE_FIELDS_BRIDGE = `
  // Get added/modified/dropDate for multiple tasks via OmniJS bridge
  // Returns: {taskId: {added, modified, dropDate}, ...}
  function bridgeGetDateFields(app, taskIds) {
    if (!taskIds || taskIds.length === 0) {
      return {};
    }

    try {
      // Build OmniJS script to extract date fields
      const idsArray = JSON.stringify(taskIds);
      const omnijsScript = [
        '(() => {',
        '  const targetIds = new Set(' + idsArray + ');',
        '  const tasks = flattenedTasks;',
        '  const results = {};',
        '  ',
        '  for (let i = 0; i < tasks.length; i++) {',
        '    const task = tasks[i];',
        '    try {',
        '      const taskId = task.id.primaryKey;',
        '      if (targetIds.has(taskId)) {',
        '        results[taskId] = {',
        '          added: task.added ? task.added.toISOString() : null,',
        '          modified: task.modified ? task.modified.toISOString() : null,',
        '          dropDate: task.dropDate ? task.dropDate.toISOString() : null',
        '        };',
        '        ',
        '        // Early exit if we found all tasks',
        '        if (Object.keys(results).length >= targetIds.size) {',
        '          break;',
        '        }',
        '      }',
        '    } catch (e) {',
        '      // Skip tasks that error',
        '    }',
        '  }',
        '  ',
        '  return JSON.stringify(results);',
        '})()'
      ].join('\\n');

      const jsonResult = app.evaluateJavascript(omnijsScript);
      return JSON.parse(jsonResult);
    } catch (e) {
      // Return empty object on failure - graceful degradation
      return {};
    }
  }
`;

/**
 * Get date fields bridge helper - ~1KB embedded function
 *
 * Usage in scripts:
 * ```
 * import { getDateFieldsBridge } from '../shared/date-fields-bridge.js';
 *
 * export const MY_SCRIPT = `
 *   ${getDateFieldsBridge()}
 *
 *   (() => {
 *     const app = Application('OmniFocus');
 *     // ... build tasks ...
 *     const taskIds = tasks.map(t => t.id);
 *     const dateFields = bridgeGetDateFields(app, taskIds);
 *
 *     // Merge into tasks
 *     for (const task of tasks) {
 *       if (dateFields[task.id]) {
 *         task.added = dateFields[task.id].added;
 *         task.modified = dateFields[task.id].modified;
 *         task.dropDate = dateFields[task.id].dropDate;
 *       }
 *     }
 *   })()
 * `;
 * ```
 */
export function getDateFieldsBridge(): string {
  return DATE_FIELDS_BRIDGE;
}
