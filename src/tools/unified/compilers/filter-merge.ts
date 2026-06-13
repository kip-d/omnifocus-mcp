import { z } from 'zod';
import type { TaskFilter, ProjectStatus } from '../../../contracts/filters.js';
import type { ReadStatus } from '../schemas/read-schema.js';

/**
 * OMN-156: shared status vocabulary for project-level status mapping.
 * Moved from QueryCompiler.transformStatus to prevent circular imports when
 * transformProjectFilters (Task 6 wiring) imports from this module.
 *
 * OMN-161 F4: `satisfies` binds this map to the ReadStatus enum —
 * adding a new status value to READ_STATUS_VALUES without a matching
 * entry here is a compile error.
 */
export const STATUS_TO_PROJECT = {
  active: 'active',
  on_hold: 'onHold',
  completed: 'done',
  dropped: 'dropped',
} as const satisfies Record<ReadStatus, ProjectStatus>;

/**
 * Extract a text condition (contains / matches) from a text filter object.
 * Returns null when the input is absent or has no recognized operator.
 */
export function extractTextCondition(
  f: { contains?: string; matches?: string } | undefined,
): { value: string; operator: 'CONTAINS' | 'MATCHES' } | null {
  if (!f) return null;
  if ('contains' in f && f.contains) return { value: f.contains, operator: 'CONTAINS' };
  if ('matches' in f && f.matches) return { value: f.matches, operator: 'MATCHES' };
  return null;
}

/**
 * OMN-151: reverse-map from internal TaskFilter keys to the input-schema
 * vocabulary, so conflict errors name the keys the caller actually sent.
 * Keys not listed map to themselves (identical in both vocabularies).
 */
const INPUT_KEY_OF: Record<string, string> = {
  completed: 'status/completed',
  projectStatus: 'status',
  dropped: 'status',
  dueBefore: 'dueDate',
  dueAfter: 'dueDate',
  dueDateOperator: 'dueDate',
  deferBefore: 'deferDate',
  deferAfter: 'deferDate',
  deferDateOperator: 'deferDate',
  plannedBefore: 'plannedDate',
  plannedAfter: 'plannedDate',
  plannedDateOperator: 'plannedDate',
  completionBefore: 'completionDate',
  completionAfter: 'completionDate',
  completionDateOperator: 'completionDate',
  addedBefore: 'added',
  addedAfter: 'added',
  addedDateOperator: 'added',
  estimatedMinutesEquals: 'estimatedMinutes',
  estimatedMinutesLessThan: 'estimatedMinutes',
  estimatedMinutesGreaterThan: 'estimatedMinutes',
  projectId: 'project/projectId',
  inInbox: 'project/inInbox',
  nameOperator: 'name',
  textOperator: 'text',
  tagsOperator: 'tags',
  orBranches: 'OR',
  folderTopLevel: 'folder',
};

export function inputKeyOf(internalKey: string): string {
  return INPUT_KEY_OF[internalKey] ?? internalKey;
}

/** Order-sensitive structural equality. Arrays/objects compare by shape; order matters (tag lists are semantic). */
export function filterDeepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => filterDeepEqual(v, b[i]));
  }
  if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
    const ak = Object.keys(a as object);
    const bk = Object.keys(b as object);
    return (
      ak.length === bk.length &&
      ak.every((k) => filterDeepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
    );
  }
  return false;
}

export interface MergeSource {
  /** Where the keys came from, for error messages: 'filters', 'AND[0]', 'NOT', … */
  origin: string;
  filter: TaskFilter;
}

/**
 * OMN-151: AND-merge transformed filter fragments. A key acquiring two
 * non-deep-equal values is a hard conflict — silently letting the last
 * write win produced wrong result sets (V2). ZodError rides the existing
 * BaseTool handler → VALIDATION_ERROR / InvalidParams.
 */
export function mergeConflictChecked(sources: MergeSource[]): TaskFilter {
  const result: Record<string, unknown> = {};
  const originOf: Record<string, string> = {};
  for (const { origin, filter } of sources) {
    for (const [key, value] of Object.entries(filter)) {
      if (value === undefined) continue;
      if (Object.hasOwn(result, key)) {
        if (!filterDeepEqual(result[key], value)) {
          throw new z.ZodError([
            {
              code: z.ZodIssueCode.custom,
              path: ['query', 'filters'],
              message:
                `Conflicting values for '${inputKeyOf(key)}' (from ${originOf[key]} and ${origin}): ` +
                `${JSON.stringify(result[key])} vs ${JSON.stringify(value)}. ` +
                'All filters AND-compose, so conflicting values are unsatisfiable or unrepresentable. ' +
                'Use OR for alternatives, or combine into a single condition.',
            },
          ]);
        }
        continue;
      }
      result[key] = value;
      originOf[key] = origin;
    }
  }
  return result as TaskFilter;
}

/** OMN-151: empty AND/OR arrays are caller bugs — reject, never compile to match-all (P3). */
export function emptyOperatorError(op: 'AND' | 'OR'): z.ZodError {
  return new z.ZodError([
    {
      code: z.ZodIssueCode.custom,
      path: ['query', 'filters', op],
      message:
        `${op}: [] is empty. ` +
        (op === 'AND'
          ? 'A vacuous AND would match everything — almost certainly not intended. '
          : 'An OR with no alternatives matches nothing. ') +
        'Omit the operator, or supply at least one condition.',
    },
  ]);
}
