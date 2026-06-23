import { z } from 'zod';
import type { FilterValue, FlatFilterValue, ReadStatus } from '../schemas/read-schema.js';
import type { ProjectFilter, ProjectStatus } from '../../../contracts/filters.js';
import { STATUS_TO_PROJECT, extractTextCondition, filterDeepEqual, emptyOperatorError } from './filter-merge.js';
import { assertValidFolderPath } from './folder-path-validation.js';

type ProjectInputKey = keyof FlatFilterValue | 'AND' | 'OR' | 'NOT';
// 'compose' = handled by a dedicated operator path (AND-merge / OR-branch /
// NOT-complement), NOT mapped directly and NOT silently dropped. OMN-171
// lifted OR/NOT from 'reject' to 'compose'.
type Disposition = 'map' | 'merge' | 'compose' | 'reject';

/**
 * OMN-156 (C-lite): every input-schema filter key has an explicit projects
 * disposition. `satisfies` makes a NEW schema field a compile error here until
 * someone decides its projects behavior — silent dropping is structurally
 * impossible (the MUTATION_DEFS registration pattern; spec P1).
 * Full per-query-type contracts: OMN-161. OMN-171 (S3): OR/NOT now supported.
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
  OR: 'compose', // OMN-171: branch compilation → ProjectFilter.orBranches
  NOT: 'compose', // OMN-171: {status} → four-state complement folded into status
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

/** The four project states, in canonical order — the universe NOT complements over. */
const ALL_PROJECT_STATUSES: ProjectStatus[] = ['active', 'onHold', 'done', 'dropped'];

function projectsError(path: Array<string | number>, message: string): z.ZodError {
  return new z.ZodError([{ code: z.ZodIssueCode.custom, path: ['query', 'filters', ...path], message }]);
}

/**
 * OMN-171: NOT on projects compiles to the status-array COMPLEMENT over the four
 * project states. Contract (OMN-131 shape): NOT must be exactly { status: <one
 * value> }; everything else hard-rejects. Unlike the tasks-side NOT (2-valued
 * completed only), projects' status is 4-valued so the complement is well-defined
 * for all four states.
 */
function projectNotComplement(notFilter: unknown): ProjectStatus[] {
  const flat = (notFilter ?? {}) as Record<string, unknown>;
  const keys = Object.keys(flat).filter((k) => flat[k] !== undefined);
  if (keys.length === 1 && typeof flat.status === 'string') {
    const excluded = STATUS_TO_PROJECT[flat.status as ReadStatus];
    if (excluded) return ALL_PROJECT_STATUSES.filter((s) => s !== excluded);
    // Unknown status value falls through to the reject below (defense-in-depth;
    // the schema rejects unknown enum values upstream).
  }
  throw projectsError(
    ['NOT'],
    `Unsupported NOT filter on projects queries: ${JSON.stringify(notFilter)}. ` +
      "NOT supports exactly { status: <'active'|'on_hold'|'completed'|'dropped'> } — it compiles to the " +
      'complement of that status over the four project states. For other exclusions express the condition ' +
      'directly (e.g. flagged:false, or a status filter naming the states you want).',
  );
}

/**
 * Map a flat (operator-free) project filter input into a typed ProjectFilter.
 * Used for the AND-merged base AND for each OR branch. `pathPrefix` scopes
 * ZodError paths (OR branches report ['query','filters','OR',i,…]).
 *
 * Steps mirror the prior monolithic transform: 3) reject unsupported keys,
 * 4) id exclusivity, 5) map. NOT folding stays at the caller (top level only).
 */
function mapFlatProjectFilter(merged: Record<string, unknown>, pathPrefix: Array<string | number> = []): ProjectFilter {
  // 3. Reject every unsupported key, all named in one error.
  const offenders = Object.keys(merged).filter(
    (key) => (PROJECT_KEY_DISPOSITION as Record<string, Disposition>)[key] !== 'map',
  );
  if (offenders.length > 0) {
    throw projectsError(
      pathPrefix,
      `Unsupported filter${offenders.length > 1 ? 's' : ''} on projects queries: ${offenders.join(', ')}. ${SUPPORTED} These are task-query filters — did you mean type:'tasks' with a project filter?`,
    );
  }

  // 4. id is an exclusive fast path (design spec §3.3): silently ignoring
  //    co-filters is the same drop class this module closes.
  const keys = Object.keys(merged);
  if (merged.id !== undefined && keys.length > 1) {
    throw projectsError(
      [...pathPrefix, 'id'],
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
        [...pathPrefix, 'status'],
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
          pathPrefix,
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
    // OMN-167: validate the path here so an empty string / empty segment rejects as a
    // VALIDATION_ERROR. Previously `if (filter.folderName)` treated "" as falsy and
    // silently skipped the filter, returning ALL projects. Honor pathPrefix so an OR-branch
    // error reports ['query','filters','OR',i,'folder'], like the sibling projectsError calls.
    assertValidFolderPath(merged.folder, ['query', 'filters', ...pathPrefix, 'folder']);
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

  // 2. NOT → status-array complement (OMN-171). Computed before mapping so it can
  //    intersect the base status below; defer the fold until after the base map.
  let notComplement: ProjectStatus[] | undefined;
  if (NOT !== undefined) {
    notComplement = projectNotComplement(NOT);
  }

  // 3–5. Map the AND-merged base into a typed ProjectFilter.
  const result = mapFlatProjectFilter(merged, []);

  // Fold the NOT complement into the base status by intersection. An empty
  // intersection is a contradiction (e.g. status:'active' AND NOT:{status:'active'}),
  // which must reject loudly rather than silently return zero rows.
  if (notComplement) {
    if (result.status) {
      const intersection = result.status.filter((s) => notComplement!.includes(s));
      if (intersection.length === 0) {
        throw projectsError(
          ['NOT'],
          'NOT { status: … } excludes all of the statuses requested by the other filters ' +
            `(base status [${result.status.join(', ')}] vs NOT-complement [${notComplement.join(', ')}]). ` +
            'The combination is unsatisfiable — drop one of the constraints.',
        );
      }
      result.status = intersection;
    } else {
      result.status = notComplement;
    }
  }

  // 6. OR → branch compilation (OMN-171). Each branch is a flat ProjectFilter;
  //    generateProjectFilterCode joins them with ||, ANDed with the base keys
  //    (mirror of the tasks orBranches path). Branches never nest (one-level schema).
  if (OR !== undefined && Array.isArray(OR)) {
    if (OR.length === 0) throw emptyOperatorError('OR');
    result.orBranches = (OR as FlatFilterValue[]).map((cond, i) => {
      const flat = cond as Record<string, unknown>;
      const definedKeys = Object.values(flat).filter((v) => v !== undefined).length;
      if (definedKeys === 0) {
        throw projectsError(
          ['OR', i],
          `OR[${i}] contains no usable conditions. ` +
            'An empty OR branch would match everything; remove the empty item or add a condition.',
        );
      }
      const branch = mapFlatProjectFilter(flat, ['OR', i]);
      // Defense-in-depth: a branch whose keys all dropped out of the map would
      // match everything. No currently-expressible input hits this (every
      // mappable key produces output), but it guards future transform drift.
      if (Object.values(branch).filter((v) => v !== undefined).length === 0) {
        throw projectsError(
          ['OR', i],
          `OR[${i}] contains no executable conditions — its keys compile to no project-level filter, ` +
            'which would silently match every project. Remove the branch or use a supported projects filter.',
        );
      }
      return branch;
    });
  }

  return result;
}
