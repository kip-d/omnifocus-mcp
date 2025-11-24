/**
 * MIGRATION EXAMPLE
 *
 * Shows how existing code would migrate to use the shared contracts.
 *
 * BEFORE: Each mode hand-writes filter logic, property names can mismatch
 * AFTER: Use generated code from shared contracts
 */

import {
  type TaskFilter,
  createFilter,
  validateFilterProperties,
  normalizeFilter,
  generateTaskIterationScript,
  generateFilterBlock,
  unwrapScriptOutput,
  type TaskData,
} from '../index.js';

// =============================================================================
// EXAMPLE 1: QueryCompiler using TaskFilter
// =============================================================================

/**
 * BEFORE: Property names could be anything, no compile-time checking
 *
 * function compile(input) {
 *   return {
 *     includeCompleted: input.status === 'completed',  // WRONG NAME!
 *     tags: input.tags,
 *   };
 * }
 */

/**
 * AFTER: TypeScript enforces correct property names
 */
function compileQuery(input: { status?: string; tags?: string[] }): TaskFilter {
  // createFilter() ensures we use correct property names
  // If we typo 'complted', TypeScript errors immediately
  return createFilter({
    completed: input.status === 'completed' ? true : input.status === 'active' ? false : undefined,
    tags: input.tags,
    tagsOperator: 'OR',
  });
}

// =============================================================================
// EXAMPLE 2: Script Generation (replaces hand-written filter logic)
// =============================================================================

/**
 * BEFORE: Each mode duplicated filter logic, easy to forget one
 *
 * const inboxScript = `
 *   inbox.forEach(task => {
 *     // Forgot to add text filter here!
 *     if (!matchesTagFilter(task, ...)) return;
 *     results.push(...);
 *   });
 * `;
 *
 * const allScript = `
 *   flattenedTasks.forEach(task => {
 *     if (!matchesTagFilter(task, ...)) return;
 *     if (!matchesTextFilter(task, ...)) return;  // Added here
 *     results.push(...);
 *   });
 * `;
 */

/**
 * AFTER: Generate script from filter spec, all filters included automatically
 */
function generateScript(filter: TaskFilter): string {
  // generateTaskIterationScript includes ALL filters from the spec
  // Can't forget one because they're all generated together
  return generateTaskIterationScript(filter, {
    collection: 'flattenedTasks',
    limit: filter.limit || 50,
  });
}

// =============================================================================
// EXAMPLE 3: Response Handling (fixes double-unwrap bugs)
// =============================================================================

/**
 * BEFORE: Manual unwrapping, easy to get wrong
 *
 * function handleResponse(raw) {
 *   const parsed = JSON.parse(raw);
 *   // Bug: Sometimes it's parsed.tasks, sometimes parsed.data.tasks!
 *   return parsed.tasks;  // undefined.map() error
 * }
 */

/**
 * AFTER: Use unwrapScriptOutput which handles all wrapper formats
 */
export function handleResponse(raw: unknown): TaskData[] {
  // unwrapScriptOutput handles:
  // - { tasks: [...] }
  // - { data: { tasks: [...] } }
  // - { data: { data: { tasks: [...] } } }  (the double-wrap bug)
  const tasks = unwrapScriptOutput<TaskData[]>(raw, 'tasks');
  return tasks || [];
}

// =============================================================================
// EXAMPLE 4: Validation (catches typos at runtime)
// =============================================================================

function validateUserInput(input: Record<string, unknown>): void {
  const unknownProps = validateFilterProperties(input);
  if (unknownProps.length > 0) {
    console.warn(`Unknown filter properties: ${unknownProps.join(', ')}`);
    // This catches typos like 'complted' or 'tgas'
  }
}

// =============================================================================
// EXAMPLE 5: Using Filter Block in Custom Script
// =============================================================================

/**
 * For modes that need custom logic beyond basic iteration
 */
export function generateTodayScript(filter: TaskFilter): string {
  const { helpers, filterCalls } = generateFilterBlock(filter);

  return `
    (() => {
      ${helpers}

      const results = [];
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      flattenedTasks.forEach(task => {
        // Custom: Check due date is today
        const dueDate = task.dueDate;
        if (!dueDate) return;
        const taskDate = new Date(dueDate);
        taskDate.setHours(0, 0, 0, 0);
        if (taskDate < today || taskDate >= tomorrow) return;

        // Generated: All standard filters
        ${filterCalls}

        results.push({ id: task.id.primaryKey, name: task.name });
      });

      return JSON.stringify({ tasks: results });
    })()
  `;
}

// =============================================================================
// DEMO
// =============================================================================

export function demo(): void {
  // Compile a query with type safety
  const filter = compileQuery({ status: 'completed', tags: ['urgent'] });
  console.log('Compiled filter:', filter);

  // Normalize (handles legacy properties)
  const normalized = normalizeFilter(filter);
  console.log('Normalized:', normalized);

  // Generate script
  const script = generateScript(normalized);
  console.log('Generated script length:', script.length);

  // Validate unknown input
  validateUserInput({ complted: true }); // Warns: unknown property 'complted'
}
