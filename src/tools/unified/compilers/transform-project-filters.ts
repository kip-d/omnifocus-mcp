import { z } from 'zod';
import type { FilterValue, FlatFilterValue, ReadStatus } from '../schemas/read-schema.js';
import type { ProjectFilter, ProjectStatus } from '../../../contracts/filters.js';
import { STATUS_TO_PROJECT, extractTextCondition, filterDeepEqual, emptyOperatorError } from './filter-merge.js';

type ProjectInputKey = keyof FlatFilterValue | 'AND' | 'OR' | 'NOT';
type Disposition = 'map' | 'merge' | 'reject';

/**
 * OMN-156 (C-lite): every input-schema filter key has an explicit projects
 * disposition. `satisfies` makes a NEW schema field a compile error here until
 * someone decides its projects behavior — silent dropping is structurally
 * impossible (the MUTATION_DEFS registration pattern; spec P1).
 * Full per-query-type contracts: OMN-161.
 */
export const PROJECT_KEY_DISPOSITION = {
  id: 'map',
  status: 'map',
  completed: 'map',
  flagged: 'map',
  folder: 'map',
  text: 'map',
  name: 'map',
  AND: 'merge',
  OR: 'reject',
  NOT: 'reject',
  tags: 'reject',
  project: 'reject',
  projectId: 'reject',
  parentTaskId: 'reject',
  dueDate: 'reject',
  deferDate: 'reject',
  plannedDate: 'reject',
  completionDate: 'reject',
  added: 'reject',
  available: 'reject',
  blocked: 'reject',
  inInbox: 'reject',
  estimatedMinutes: 'reject',
} as const satisfies Record<ProjectInputKey, Disposition>;

const SUPPORTED = 'Supported projects filters: status, completed, flagged, name, text, folder, id.';

function projectsError(path: Array<string | number>, message: string): z.ZodError {
  return new z.ZodError([{ code: z.ZodIssueCode.custom, path: ['query', 'filters', ...path], message }]);
}

export function transformProjectFilters(input: FilterValue): ProjectFilter {
  // 1. AND merges in INPUT space (then the merged input transforms below).
  const merged: Record<string, unknown> = Object.create(null);
  const originOf: Record<string, string> = Object.create(null);
  const mergeFrom = (origin: string, flat: Record<string, unknown>) => {
    for (const [key, value] of Object.entries(flat)) {
      if (value === undefined) continue;
      if (Object.hasOwn(merged, key)) {
        if (!filterDeepEqual(merged[key], value)) {
          throw projectsError(
            [],
            `Conflicting values for '${key}' (from ${originOf[key]} and ${origin}): ` +
              `${JSON.stringify(merged[key])} vs ${JSON.stringify(value)}. Filters AND-compose. ${SUPPORTED}`,
          );
        }
        continue;
      }
      merged[key] = value;
      originOf[key] = origin;
    }
  };
  const { AND, OR, NOT, ...top } = input as Record<string, unknown> & FilterValue;
  mergeFrom('filters', top);
  if (AND !== undefined && Array.isArray(AND)) {
    if (AND.length === 0) throw emptyOperatorError('AND');
    (AND as FlatFilterValue[]).forEach((cond, i) => {
      // OMN-161 F7: reject empty AND items symmetrically with tasks.
      const definedKeys = Object.values(cond as Record<string, unknown>).filter((v) => v !== undefined).length;
      if (definedKeys === 0) {
        throw projectsError(
          ['AND', i],
          `AND[${i}] contains no usable conditions. Every AND item must contain at least one filter; ` +
            'remove the empty item or add a condition.',
        );
      }
      mergeFrom(`AND[${i}]`, cond as Record<string, unknown>);
    });
  }

  // 2. OR / NOT: unsupported on projects — loud, with working alternatives (P3; OMN-131 pattern).
  if (OR !== undefined) {
    throw projectsError(
      ['OR'],
      'Logical operator OR is not supported on projects queries. ' +
        'Use a single filters.name / filters.text / filters.status condition, or run one query per alternative.',
    );
  }
  if (NOT !== undefined) {
    throw projectsError(
      ['NOT'],
      'NOT is not supported on projects queries. ' +
        "Express the condition directly: e.g. instead of NOT {status:'completed'} use status:'active', " +
        'or use the status filter for the states you want.',
    );
  }

  // 3. Reject every unsupported key, all named in one error.
  const offenders = Object.keys(merged).filter(
    (key) => (PROJECT_KEY_DISPOSITION as Record<string, Disposition>)[key] !== 'map',
  );
  if (offenders.length > 0) {
    throw projectsError(
      [],
      `Unsupported filter${offenders.length > 1 ? 's' : ''} on projects queries: ${offenders.join(', ')}. ${SUPPORTED} These are task-query filters — did you mean type:'tasks' with a project filter?`,
    );
  }

  // 4. id is an exclusive fast path (design spec §3.3): silently ignoring
  //    co-filters is the same drop class this module closes.
  const keys = Object.keys(merged);
  if (merged.id !== undefined && keys.length > 1) {
    throw projectsError(
      ['id'],
      `'id' is an exact lookup and cannot combine with other filters (got: ${keys.filter((k) => k !== 'id').join(', ')}). ` +
        'Remove the other filters, or drop id to search.',
    );
  }

  // 5. Map.
  const result: ProjectFilter = {};
  if (typeof merged.id === 'string') result.id = merged.id;
  if (typeof merged.flagged === 'boolean') result.flagged = merged.flagged;

  let statusSet: ProjectStatus[] | undefined;
  if (typeof merged.status === 'string') {
    const mapped = STATUS_TO_PROJECT[merged.status as ReadStatus];
    // Defense-in-depth: schema rejects unknown status values upstream, but a
    // future schema-enum addition without a STATUS_TO_PROJECT entry must not
    // silently widen on the status dimension.
    if (!mapped) {
      throw projectsError(
        ['status'],
        `Unknown status value '${String(merged.status)}' for projects queries. Supported: active, on_hold, completed, dropped.`,
      );
    }
    statusSet = [mapped];
  }
  if (typeof merged.completed === 'boolean') {
    // Decision record (design spec §3.3): completed:false is the GTD "still
    // live?" question — dropped is a terminal verdict, excluded for parity with
    // the tasks-side OMN-157 default. status:'dropped' is the explicit vocabulary.
    const completedSet: ProjectStatus[] = merged.completed ? ['done'] : ['active', 'onHold'];
    if (statusSet) {
      const intersection = statusSet.filter((s) => completedSet.includes(s));
      if (intersection.length === 0) {
        throw projectsError(
          [],
          `'completed: ${merged.completed}' contradicts 'status: ${String(merged.status)}' on projects ` +
            "(completed:false means active/on-hold). For dropped projects use status:'dropped' alone; " +
            "for done projects use status:'completed' or completed:true.",
        );
      }
      statusSet = intersection;
    } else {
      statusSet = completedSet;
    }
  }
  if (statusSet) result.status = statusSet;

  if (merged.folder === null) {
    result.topLevelOnly = true;
  } else if (typeof merged.folder === 'string') {
    result.folderName = merged.folder;
  }

  const nameCond = extractTextCondition(merged.name as { contains?: string; matches?: string } | undefined);
  if (nameCond) {
    result.name = nameCond.value;
    result.nameOperator = nameCond.operator;
  }
  const textCond = extractTextCondition(merged.text as { contains?: string; matches?: string } | undefined);
  if (textCond) {
    result.text = textCond.value;
    result.textOperator = textCond.operator;
  }

  return result;
}
