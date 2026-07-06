/**
 * Script Builder - Generates OmniJS scripts with AST-powered filters
 *
 * This module creates complete OmniJS scripts that use the AST-generated
 * filter predicates instead of inline filter logic.
 *
 * Benefits:
 * - Single source of truth for filter logic (AST)
 * - Validated filters catch errors before script generation
 * - Consistent behavior across all query modes
 * - Smaller, cleaner scripts
 *
 * @see docs/plans/2025-11-24-ast-filter-contracts-design.md
 */

import type { TaskFilter, ProjectFilter, NormalizedTaskFilter, FolderFilter } from '../filters.js';
import { normalizeFilter, stripNormalizedBrand } from '../filters.js';
import {
  generateFilterCode,
  generateProjectFilterCode,
  isEmptyProjectFilter,
  describeProjectFilter,
  generateFolderFilterCode,
  isEmptyFolderFilter,
  describeFolderFilter,
} from './filter-generator.js';
import { buildAST } from './builder.js';
import { sanitizeForScriptComment } from './bridge-escape.js';
import { emitFolderNotFoundGuardsForFilter } from './folder-path-match.js';
import { ACTIONABLE_STATUSES } from './types.js';
import type { OmniFocusTask } from '../../omnifocus/types.js';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Fields valid for sorting, matching the Zod SortFieldEnum in read-schema.ts.
 */
export type SortableField =
  | 'dueDate'
  | 'deferDate'
  | 'plannedDate'
  | 'name'
  | 'flagged'
  | 'estimatedMinutes'
  | 'added'
  | 'modified'
  | 'completionDate';

export interface SortSpec {
  field: SortableField;
  direction: 'asc' | 'desc';
}

export interface ScriptOptions {
  /** Maximum tasks to return */
  limit?: number;
  /** Number of tasks to skip (for pagination) */
  offset?: number;
  /** Fields to include in response */
  fields?: string[];
  /** Whether to include completed tasks (for modes that don't specify) */
  includeCompleted?: boolean;
  /** Sort specifications to apply in-script before limit/offset (user-specified sorts only) */
  sort?: SortSpec[];
  /** When set and > 0, truncate note content to this many characters */
  noteTruncateLength?: number;
}

export interface GeneratedScript {
  /** The complete OmniJS script ready for execution */
  script: string;
  /** Description of what the filter does */
  filterDescription: string;
  /** Whether the filter is empty (matches all tasks) */
  isEmptyFilter: boolean;
}

// =============================================================================
// FIELD PROJECTION HELPERS
// =============================================================================

/**
 * Thin-default fields returned when no explicit fields or details flag is set.
 * Optimized for low token usage — covers the most common query needs.
 *
 * OMN-130: `hasNote` added — lets a client cheaply tell if a task has context
 * worth reading without paying the token cost of the full `note` field.
 * Decision record: `notePreview` (~120-char snippet) was considered as an
 * alternative but rejected — it is redundant with the full `note` field in
 * DETAIL_FIELDS and contradicts the token-cost goal of the lean default.
 * `hasNote` answers "is there context?"; the client requests `note` if yes.
 *
 * OMN-237: `as const satisfies ReadonlyArray<keyof OmniFocusTask>` closes the
 * same interface-drift class OMN-222/OMN-232 closed for TaskFieldEnum and
 * MODE_INJECTED_FIELDS — a field added or renamed here without a matching
 * OmniFocusTask member now fails the build instead of compiling green.
 */
export const MINIMAL_FIELDS = [
  'id',
  'name',
  'flagged',
  'completed',
  'dueDate',
  'deferDate',
  'tags',
  'project',
  'available',
  'hasNote',
] as const satisfies ReadonlyArray<keyof OmniFocusTask>;

/**
 * Heavier fields gated behind details=true or explicit field selection.
 *
 * Must include every TaskFieldEnum member not already in MINIMAL_FIELDS, so
 * `details: true` returns "all fields" as documented. (OMN-51: previously
 * `added`, `modified`, `dropDate`, `completionDate`, and `repetitionRule`
 * were declared in TaskFieldEnum but absent here, leaving them unreachable
 * via `details: true` and silently contradicting the tool description.)
 *
 * Enforced by the parity test in
 * `tests/unit/architecture/schema-impl-parity.test.ts`.
 *
 * OMN-237: `as const satisfies ReadonlyArray<keyof OmniFocusTask>` — see
 * MINIMAL_FIELDS above. This is also the compile-time guard that
 * `effectivePlannedDate` (detail-gated via `details:true`) stays a real
 * OmniFocusTask member; OMN-232 deliberately dropped a runtime stopgap pin
 * for it in favor of this class of fix.
 */
export const DETAIL_FIELDS = [
  'note',
  'estimatedMinutes',
  'plannedDate',
  'effectivePlannedDate',
  'parentTaskId',
  'parentTaskName',
  'blocked',
  'inInbox',
  'projectId',
  // OMN-51: previously omitted, restored to match documented "all fields" behavior.
  'added',
  'modified',
  'dropDate',
  'completionDate',
  'repetitionRule',
  // OMN-153: boolean marker for project-root rows (useful in detail views and
  // for agents that need to distinguish roots from regular tasks).
  'isProjectRoot',
  // OMN-207: action-group ordering, read-side parity with the write side
  // (OMN-198/206). Cheap boolean; reachable via details:true (DETAIL, not the
  // thin MINIMAL default) — mirrors `sequential` in DETAIL_PROJECT_FIELDS.
  'sequential',
] as const satisfies ReadonlyArray<keyof OmniFocusTask>;

/**
 * Full field set — union of MINIMAL + DETAIL. Preserves backward compatibility.
 */
export const DEFAULT_FIELDS = [...MINIMAL_FIELDS, ...DETAIL_FIELDS] as const satisfies ReadonlyArray<
  keyof OmniFocusTask
>;

/**
 * Maximum characters for truncated note content in thin-default responses.
 */
export const NOTE_TRUNCATE_LENGTH = 200;

/**
 * Thin-default fields for project queries.
 */
export const MINIMAL_PROJECT_FIELDS = ['id', 'name', 'status', 'flagged', 'dueDate', 'deferDate', 'folder'];

/**
 * Heavier project fields gated behind details=true.
 *
 * Deliberately excludes OMN-62's `tags`/`plannedDate` (and OMN-60's
 * `reviewInterval`): those are emitted by the script via DEFAULT_PROJECT_FIELDS
 * but surface ONLY when explicitly requested via `fields`, never on a bare
 * `details:true` — keeps the detailed response token-cheap and shape-stable.
 */
// OMN-81: completionDate added — was effectively unavailable on all responses
// (script emitted null for every project due to the completedDate/completionDate
// rename bug); now that the script emits real values, surface it on details:true
// so completed-project responses carry the date without an explicit fields:[...]
// request.
export const DETAIL_PROJECT_FIELDS = [
  'note',
  'folderPath',
  'sequential',
  'lastReviewDate',
  'nextReviewDate',
  'completionDate',
];

/**
 * Resolve effective task fields based on user input and details flag.
 *
 * Priority: explicit fields > details=true (DEFAULT_FIELDS) > MINIMAL_FIELDS
 */
export function resolveEffectiveTaskFields(userFields: string[] | undefined, details: boolean | undefined): string[] {
  if (userFields && userFields.length > 0) return userFields;
  if (details) return [...DEFAULT_FIELDS];
  return [...MINIMAL_FIELDS];
}

/**
 * Resolve effective project fields based on user input and details flag.
 *
 * Priority: explicit fields > details=true (full) > MINIMAL_PROJECT_FIELDS
 */
export function resolveEffectiveProjectFields(
  userFields: string[] | undefined,
  details: boolean | undefined,
): string[] {
  if (userFields && userFields.length > 0) return userFields;
  if (details) return [...MINIMAL_PROJECT_FIELDS, ...DETAIL_PROJECT_FIELDS];
  return MINIMAL_PROJECT_FIELDS;
}

/**
 * Generate the field projection code for a task object
 */
function generateFieldProjection(
  fields: string[],
  context?: { dueSoonDays?: number; noteTruncateLength?: number },
): string {
  const fieldList = fields.length > 0 ? fields : DEFAULT_FIELDS;
  const dueSoonDays = context?.dueSoonDays ?? 3;
  const noteTruncateLength = context?.noteTruncateLength;

  const projections: string[] = [];

  for (const field of fieldList) {
    switch (field) {
      case 'id':
        projections.push('id: task.id.primaryKey');
        break;
      case 'name':
        projections.push('name: task.name');
        break;
      case 'completed':
        projections.push('completed: task.completed || false');
        break;
      case 'flagged':
        projections.push('flagged: task.flagged || false');
        break;
      case 'inInbox':
        projections.push('inInbox: task.inInbox');
        break;
      case 'blocked':
        projections.push('blocked: task.taskStatus === Task.Status.Blocked');
        break;
      case 'available':
        // OMN-130: "actionable now" — uses the shared ACTIONABLE_STATUSES constant from
        // types.ts so WHERE (filter-side emitter) and SELECT (projection) always agree.
        // {Available, DueSoon, Next, Overdue} are actionable; Blocked (deferred / sequential
        // predecessor / on-hold project), Completed, and Dropped are not.
        // indexOf used over Array.includes for OmniJS runtime compatibility.
        projections.push(`available: [${ACTIONABLE_STATUSES.join(', ')}].indexOf(task.taskStatus) !== -1`);
        break;
      case 'hasNote':
        // OMN-130: boolean presence marker — true when the task has any non-empty note text.
        // Trade-off: OmniJS has no note-presence-only API, so (task.note || '') materializes
        // the full note string per task. The boolean avoids sending multi-KB note bodies in
        // minimal responses, but the per-task string read still happens in the OmniJS runtime.
        // A client that needs the note body should request the 'note' field explicitly.
        // Coalesce null/undefined to '' before .length so it never throws on a null note.
        projections.push("hasNote: (task.note || '').length > 0");
        break;
      case 'dueDate':
        projections.push('dueDate: task.dueDate ? task.dueDate.toISOString() : null');
        break;
      case 'deferDate':
        projections.push('deferDate: task.deferDate ? task.deferDate.toISOString() : null');
        break;
      case 'plannedDate':
        projections.push('plannedDate: task.plannedDate ? task.plannedDate.toISOString() : null');
        break;
      case 'effectivePlannedDate':
        projections.push(
          'effectivePlannedDate: task.effectivePlannedDate ? task.effectivePlannedDate.toISOString() : null',
        );
        break;
      case 'completionDate':
        projections.push('completionDate: task.completionDate ? task.completionDate.toISOString() : null');
        break;
      case 'tags':
        projections.push('tags: task.tags ? task.tags.map(t => t.name) : []');
        break;
      case 'note':
        if (noteTruncateLength && noteTruncateLength > 0) {
          projections.push(
            `note: (() => { const n = task.note || ""; return n.length > ${noteTruncateLength} ? n.substring(0, ${noteTruncateLength}) + "..." : n; })()`,
          );
        } else {
          projections.push('note: task.note || ""');
        }
        break;
      case 'project':
        projections.push('project: task.containingProject ? task.containingProject.name : null');
        break;
      case 'projectId':
        projections.push('projectId: task.containingProject ? task.containingProject.id.primaryKey : null');
        break;
      case 'estimatedMinutes':
        projections.push('estimatedMinutes: task.estimatedMinutes || null');
        break;
      case 'repetitionRule':
        projections.push(`repetitionRule: (() => {
          const rule = task.repetitionRule;
          if (!rule) return null;
          try {
            return {
              ruleString: rule.ruleString || null,
              scheduleType: rule.scheduleType ? rule.scheduleType.toString() : null,
              anchorDateKey: rule.anchorDateKey ? rule.anchorDateKey.toString() : null,
              catchUpAutomatically: rule.catchUpAutomatically ?? null
            };
          } catch (e) { return null; }
        })()`);
        break;
      case 'parentTaskId':
        projections.push('parentTaskId: task.parent ? task.parent.id.primaryKey : null');
        break;
      case 'parentTaskName':
        projections.push('parentTaskName: task.parent ? task.parent.name : null');
        break;
      case 'reason':
        projections.push(`reason: (() => {
    const _today = new Date(); _today.setHours(0, 0, 0, 0);
    const _cutoff = new Date(_today); _cutoff.setDate(_cutoff.getDate() + ${dueSoonDays});
    if (task.dueDate && task.dueDate < _today) return 'overdue';
    if (task.dueDate && task.dueDate < _cutoff) return 'due_soon';
    if (task.flagged) return 'flagged';
    return null;
  })()`);
        break;
      case 'daysOverdue':
        projections.push(`daysOverdue: (() => {
    if (!task.dueDate) return 0;
    const _now = new Date(); _now.setHours(0, 0, 0, 0);
    const diff = Math.floor((_now.getTime() - task.dueDate.getTime()) / 86400000);
    return diff > 0 ? diff : 0;
  })()`);
        break;
      case 'modified':
        projections.push('modified: task.modified ? task.modified.toISOString() : null');
        break;
      // OMN-45: `added` and `dropDate` were declared in the field enum but had
      // no projection case, so server responses silently omitted them even when
      // the schema accepted `fields: ["added"]`. The Task properties exist in
      // OmniJS as `task.added` (creation timestamp) and `task.dropDate` (when
      // a task was dropped, null otherwise).
      case 'added':
        projections.push('added: task.added ? task.added.toISOString() : null');
        break;
      case 'dropDate':
        projections.push('dropDate: task.dropDate ? task.dropDate.toISOString() : null');
        break;
      // OMN-153: marker so a project-root row is never again indistinguishable.
      // task.project !== null is the OmniJS definition of "this task IS a project root".
      case 'isProjectRoot':
        projections.push('isProjectRoot: task.project !== null');
        break;
      // OMN-207: action-group ordering, read-side parity with the write side
      // (OMN-198/206). `|| false` returns the stored boolean — false ≠ absent.
      // Mirrors the project projection case (`sequential: project.sequential || false`).
      //
      // Decision (OMN-207 /code-review): report the RAW stored property
      // unconditionally, not conditionally on `task.children.length > 0`.
      // `sequential` governs a task's OWN children's ordering; a leaf's value is
      // vacuous-but-real. Conditional emission was rejected because:
      //   (1) OmniFocus persists `sequential` across leaf↔action-group
      //       transitions (childless tasks with a stored `true` exist), so
      //       omitting it while childless would HIDE a real stored value;
      //   (2) the write side (OMN-198/206) can SET `sequential` on a childless
      //       task — omitting it on read re-opens the exact settable-but-not-
      //       readable honesty gap this ticket closes;
      //   (3) presence-coupled-to-child-count makes the response shape churn as
      //       the tree mutates, breaking shape stability.
      // (`|| false` is a defensive mirror of the project case; OmniJS currently
      // returns a boolean for every task, so it is a no-op today.)
      case 'sequential':
        projections.push('sequential: task.sequential || false');
        break;
    }
  }

  return projections.join(',\n                ');
}

// =============================================================================
// MAIN SCRIPT BUILDER
// =============================================================================

/**
 * Build an OmniJS script that filters tasks using AST-generated predicates
 *
 * @param filter - A NormalizedTaskFilter (must pass through normalizeFilter() first)
 * @param options - Script generation options
 * @returns Generated script ready for execution
 *
 * IMPORTANT: This function requires a NormalizedTaskFilter to ensure:
 * - Legacy properties (includeCompleted) have been converted
 * - Default operators are set
 * - Property name mismatches are caught at compile time
 */
/** Context shared between script-building helper functions */
interface ScriptBuildContext {
  filterCode: { preamble?: string; predicate: string };
  filterDescription: string;
  fieldProjection: string;
  completionCheck: string;
  hasProjectPreamble: boolean;
  projectValue: string | undefined | null;
  limit: number;
  offset: number;
  /**
   * OMN-218: an OmniJS guard statement emitted at the top of the row loop that returns a
   * FOLDER_NOT_FOUND envelope when a string folder PATH filter resolves to no folder.
   * Empty string when there is no folder-path filter (or `folder:null` top-level).
   */
  folderExistsGuard: string;
}

/** Generate the duplicate-project warnings block (shared by sort and no-sort paths) */
function generateWarningsBlock(ctx: ScriptBuildContext): string {
  if (!ctx.hasProjectPreamble) return '';
  return `
  var __warnings = [];
  var __duplicateProjects = [];
  if (typeof __projectTarget_0 !== 'undefined' && __projectTarget_0 && __projectTarget_0.duplicates > 0) {
    __warnings.push("Multiple projects named " + ${JSON.stringify(String(ctx.projectValue || ''))} + " found (" + (__projectTarget_0.duplicates + 1) + " total). Showing tasks from the first match. Use project ID to target a specific one.");
    __duplicateProjects = __projectTarget_0.allMatches;
  }`;
}

/** Generate the warnings metadata fields for JSON.stringify output */
function generateWarningsMetadata(hasProjectPreamble: boolean): string {
  if (!hasProjectPreamble) return '';
  return `warnings: __warnings,
    duplicateProjects: __duplicateProjects.length > 0 ? __duplicateProjects : undefined,`;
}

/** Generate the shared matchesFilter preamble + function declaration */
function generateMatchesFilterBlock(ctx: ScriptBuildContext): string {
  return `${ctx.filterCode.preamble ? ctx.filterCode.preamble + '\n' : ''}
  // AST-generated filter predicate
  // Filter: ${sanitizeForScriptComment(ctx.filterDescription)}
  function matchesFilter(task) {
    const taskTags = task.tags ? task.tags.map(t => t.name) : [];
    return ${ctx.filterCode.predicate};
  }`;
}

/** Build script for sort-before-limit path: collect all -> sort -> slice */
function buildSortedScript(ctx: ScriptBuildContext, sort: SortSpec[]): string {
  const sortComparator = generateSortComparator(sort);
  const warningsBlock = generateWarningsBlock(ctx);
  const warningsMetadata = generateWarningsMetadata(ctx.hasProjectPreamble);
  const matchesFilterBlock = generateMatchesFilterBlock(ctx);
  const offsetMetadata = ctx.offset > 0 ? `offset_applied: ${ctx.offset},` : '';

  return `
(() => {
  ${ctx.folderExistsGuard}
  const allResults = [];

  ${matchesFilterBlock}

  flattenedTasks.forEach(task => {
    ${ctx.completionCheck}

    // Apply AST-generated filter
    if (!matchesFilter(task)) return;

    allResults.push({
      ${ctx.fieldProjection}
    });
  });

  // Sort all matched results in-script before applying limit
  allResults.sort(${sortComparator});

  // Slice for pagination
  const sliced = allResults.slice(${ctx.offset}, ${ctx.offset} + ${ctx.limit});

  ${warningsBlock}

  return JSON.stringify({
    tasks: sliced,
    count: sliced.length,
    total_matched: allResults.length,
    ${offsetMetadata}
    sorted_in_script: true,
    mode: 'ast_filtered',
    filter_description: ${JSON.stringify(ctx.filterDescription)},
    ${warningsMetadata}
  });
})()
`;
}

/** Build script for no-sort fast path: full-population iteration; limit caps projected rows */
function buildUnsortedScript(ctx: ScriptBuildContext): string {
  const useOffset = ctx.offset > 0;
  const offsetVars = useOffset ? `const offset = ${ctx.offset};\n  let skipped = 0;` : '';
  const offsetCheck = useOffset ? 'if (skipped < offset) { skipped++; return; }' : '';
  const offsetMetadata = useOffset ? `offset_applied: ${ctx.offset},` : '';
  const warningsBlock = generateWarningsBlock(ctx);
  const warningsMetadata = generateWarningsMetadata(ctx.hasProjectPreamble);
  const matchesFilterBlock = generateMatchesFilterBlock(ctx);

  return `
(() => {
  ${ctx.folderExistsGuard}
  const results = [];
  let count = 0;
  let totalMatched = 0;
  const limit = ${ctx.limit};
  ${offsetVars}

  ${matchesFilterBlock}

  flattenedTasks.forEach(task => {
    ${ctx.completionCheck}

    // Apply AST-generated filter
    if (!matchesFilter(task)) return;

    // OMN-154: count every match; the limit caps only the projected rows
    totalMatched++;
    if (count >= limit) return;

    ${offsetCheck}

    results.push({
      ${ctx.fieldProjection}
    });
    count++;
  });

  ${warningsBlock}

  return JSON.stringify({
    tasks: results,
    count: results.length,
    total_matched: totalMatched,
    ${offsetMetadata}
    mode: 'ast_filtered',
    filter_description: ${JSON.stringify(ctx.filterDescription)},
    ${warningsMetadata}
  });
})()
`;
}

// =============================================================================
// PROJECT-ROOT EXCLUSION DEFAULT (OMN-153)
// =============================================================================

/**
 * Inject `includeProjectRoot: false` when the caller has not set it.
 *
 * In OmniFocus a project IS a task (its root task). That root row appears in
 * `flattenedTasks` and is indistinguishable from regular tasks without extra
 * inspection. Completing or deleting it completes/deletes the PROJECT — a P5
 * safety hazard. All task-script builders must default-exclude root rows so the
 * hazard cannot arise from a bare query.
 *
 * Detection: `task.project !== null` (OmniJS Task.project returns the Project
 * object only for the root task; null for all other tasks).
 *
 * Called by: buildFilteredTasksScript, buildInboxScript, buildTaskCountScript.
 * Adding a new task-script builder? Route it through this helper — never inline
 * the check.
 *
 * SCOPE: injects includeProjectRoot only (into the PREDICATE filter).
 * The dropped/completed predicate defaults differ per builder (inbox always
 * excludes completed) and stay inline in each builder by design. For the HONESTY
 * SURFACE (filter_description / filters_applied),
 * OMN-190 consolidated all three defaults into applyHonestyDefaults — adding a new
 * builder? Route the predicate through this helper AND the description through
 * applyHonestyDefaults, or the new builder silently under-reports its exclusions.
 */
function applyProjectRootDefault<F extends { includeProjectRoot?: boolean }>(filter: F): F {
  if (filter.includeProjectRoot !== undefined) return filter;
  return { ...filter, includeProjectRoot: false };
}

/**
 * OMN-190: the filter actually applied to the query — the user filter plus the
 * auto-injected safety defaults (completed/dropped/project-root exclusions).
 *
 * Used ONLY for the honesty surface (filter_description + filters_applied) so
 * those report what was really counted, not the user's (often empty) filter.
 * This is DISTINCT from the predicate's effectiveFilter: the list/inbox builders
 * enforce the completed exclusion out-of-band via completionCheck, so `completed`
 * must NOT be fed to generateFilterCode (it would double the check) — but it MUST
 * be described. Reverses the OMN-52 "description keyed to the user filter"
 * convention (that keying was the bug OMN-190 fixes).
 *
 * Gating mirrors each builder exactly so the description never claims an
 * exclusion that wasn't applied: completed/dropped default in only when unset and
 * includeCompleted is false (count has no includeCompleted, so it passes false);
 * project-root routes through the shared applyProjectRootDefault helper.
 */
function applyHonestyDefaults<F extends { completed?: boolean; dropped?: boolean; includeProjectRoot?: boolean }>(
  filter: F,
  includeCompleted: boolean,
): F {
  const f = { ...filter };
  if (!includeCompleted && f.completed === undefined) f.completed = false;
  if (!includeCompleted && f.dropped === undefined) f.dropped = false;
  return applyProjectRootDefault(f);
}

export function buildFilteredTasksScript(filter: NormalizedTaskFilter, options: ScriptOptions = {}): GeneratedScript {
  const { limit = 50, offset = 0, fields = [], includeCompleted = false, sort, noteTruncateLength } = options;

  // OMN-157: dropped is the third terminal state, excluded by default. It is
  // SYNTHETIC in OmniJS (no task.dropped property), so the default MUST route
  // through the AST emitter (taskStatus !== Task.Status.Dropped) — a raw
  // script-level check is a silent no-op. Gating mirrors the completed
  // default: an explicit filter.dropped (incl. status:'dropped', which
  // compiles onto it) or includeCompleted lifts it. isEmptyFilter stays keyed
  // to the user's filter (it gates an optimization, not the surface); the
  // description now reflects the effective filter (OMN-190).
  let effectiveFilter: typeof filter =
    !includeCompleted && filter.dropped === undefined ? { ...filter, dropped: false } : filter;
  // OMN-153: exclude project-root rows by default via the consolidated helper.
  effectiveFilter = applyProjectRootDefault(effectiveFilter);

  // Build the AST to check if empty (user's filter, not the effective one)
  const ast = buildAST(filter);
  const isEmptyFilter = ast.type === 'literal' && ast.value === true;

  // Generate the filter predicate code
  const filterCode = generateFilterCode(effectiveFilter);

  // OMN-190: describe the effective filter (auto-injected completed/dropped/
  // project-root exclusions included) so filter_description never claims "all
  // tasks" for a query that silently excludes three populations.
  const filterDescription = describeFilterForScript(applyHonestyDefaults(filter, includeCompleted));

  // Generate field projection (thread dueSoonDays from filter for reason field)
  const fieldProjection = generateFieldProjection(fields, {
    dueSoonDays: (filter as TaskFilter).dueSoonDays,
    noteTruncateLength,
  });

  // Determine completion filter behavior
  // If filter explicitly sets completed, use that; otherwise, use includeCompleted option
  // (completed IS a real OmniJS property, so the script-level check works here;
  // the dropped default lives in effectiveFilter above)
  const defaultCompletionCheck = includeCompleted ? '' : 'if (task.completed) return;';
  const completionCheck = filter.completed !== undefined ? '' : defaultCompletionCheck;

  // OMN-218: fail loudly on any unresolvable folder PATH — the top-level `filter.folder`
  // AND any OR-branch's `folder` (review round 2). `folder:null` arrives as folderTopLevel,
  // a boolean the collector ignores, so it keeps returning empty-set success (guard stays '').
  const folderExistsGuard = emitFolderNotFoundGuardsForFilter(filter, 'folder');

  const ctx: ScriptBuildContext = {
    filterCode,
    filterDescription,
    fieldProjection,
    completionCheck,
    hasProjectPreamble: !!filterCode.preamble,
    projectValue: filter.projectId ?? filter.project,
    limit,
    offset,
    folderExistsGuard,
  };

  // When sort is specified, collect ALL matching tasks, sort in-script, then slice.
  // This ensures sort+limit returns correctly ordered results instead of arbitrary-then-sorted.
  const script = sort && sort.length > 0 ? buildSortedScript(ctx, sort) : buildUnsortedScript(ctx);

  return {
    script: script.trim(),
    filterDescription,
    isEmptyFilter,
  };
}

/**
 * Generate an OmniJS sort comparator function from sort specifications.
 *
 * Handles multiple sort levels, null-safety (nulls pushed to end),
 * and string/date/number/boolean field types.
 *
 * Modeled on the sort logic in buildRecurringTasksScript (lines 624-650).
 */
function generateSortComparator(sort: SortSpec[]): string {
  const comparisons = sort.map((s) => {
    const dir = s.direction === 'desc' ? -1 : 1;
    // Date fields need Date comparison; others use string/number comparison
    // Field classifications match SortableField union (Zod SortFieldEnum in read-schema.ts).
    // Computed fields (effectivePlannedDate, daysOverdue, available, inInbox) are excluded
    // since they aren't exposed for user-specified sorting.
    const isDateField = ['dueDate', 'deferDate', 'plannedDate', 'completionDate', 'added', 'modified'].includes(
      s.field,
    );
    const isBoolField = ['flagged'].includes(s.field);
    const isNumField = ['estimatedMinutes'].includes(s.field);

    if (isDateField) {
      // Date fields are ISO strings in the projected results; compare as strings (lexicographic ISO works)
      return `
      (() => {
        const av = a.${s.field}, bv = b.${s.field};
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        return (av < bv ? -1 : av > bv ? 1 : 0) * ${dir};
      })()`;
    } else if (isBoolField) {
      return `
      (() => {
        const av = a.${s.field} ? 1 : 0, bv = b.${s.field} ? 1 : 0;
        return (av - bv) * ${dir};
      })()`;
    } else if (isNumField) {
      return `
      (() => {
        const av = a.${s.field}, bv = b.${s.field};
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        return (av - bv) * ${dir};
      })()`;
    } else {
      // String comparison (name, project, etc.)
      return `
      (() => {
        const av = a.${s.field}, bv = b.${s.field};
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        return (String(av).localeCompare(String(bv))) * ${dir};
      })()`;
    }
  });

  return `(a, b) => {
    let c;
    ${comparisons.map((comp) => `c = ${comp};\n    if (c !== 0) return c;`).join('\n    ')}
    return 0;
  }`;
}

/**
 * Build an OmniJS script for inbox tasks with optional additional filters
 *
 * This function accepts a raw TaskFilter and normalizes it internally
 * after merging with the inbox filter (inInbox: true).
 */
export function buildInboxScript(additionalFilter: TaskFilter = {}, options: ScriptOptions = {}): GeneratedScript {
  const { limit = 50, offset = 0, fields = [], includeCompleted = false, noteTruncateLength } = options;

  // Merge inbox filter with additional filters, then normalize
  const filter = normalizeFilter({ ...additionalFilter, inInbox: true });

  // OMN-157: same default dropped-exclusion as buildFilteredTasksScript —
  // routed through the AST because task.dropped is synthetic (emitter-only)
  let effectiveFilter: NormalizedTaskFilter =
    !includeCompleted && filter.dropped === undefined ? { ...filter, dropped: false } : filter;
  // OMN-153: same default project-root exclusion via consolidated helper.
  effectiveFilter = applyProjectRootDefault(effectiveFilter);

  const filterCode = generateFilterCode(effectiveFilter);
  // OMN-190: describe the effective filter (inbox + auto-injected exclusions),
  // not the user's filter — see buildFilteredTasksScript.
  const filterDescription = describeFilterForScript(applyHonestyDefaults(filter, includeCompleted));
  const fieldProjection = generateFieldProjection(fields, { noteTruncateLength });

  // Determine completion filter - exclude completed by default for inbox
  // (completed is a real OmniJS property; dropped is handled in effectiveFilter)
  const defaultCompletionCheck = includeCompleted ? '' : 'if (task.completed) return;';
  const completionCheck =
    filter.completed !== undefined
      ? '' // AST handles it if explicitly set in filter
      : defaultCompletionCheck;

  // Only include offset logic when offset > 0
  const useOffset = offset > 0;
  const offsetVars = useOffset ? `const offset = ${offset};\n  let skipped = 0;` : '';
  const offsetCheck = useOffset ? 'if (skipped < offset) { skipped++; return; }' : '';
  const offsetMetadata = useOffset ? `offset_applied: ${offset},` : '';

  // OMN-218 (review round 2): inbox mode was missing the guard entirely — a folder
  // filter combined with mode:'inbox' bypassed the loud-error path. Inbox tasks
  // structurally have no containing folder (the filter always matches nothing), but
  // an UNRESOLVABLE folder reference must still error, independent of match count.
  const folderExistsGuard = emitFolderNotFoundGuardsForFilter(filter, 'folder');

  const script = `
(() => {
  ${folderExistsGuard}
  const results = [];
  let count = 0;
  let totalMatched = 0;
  const limit = ${limit};
  ${offsetVars}

  ${filterCode.preamble ? filterCode.preamble + '\n' : ''}
  // AST-generated filter predicate for inbox
  function matchesFilter(task) {
    const taskTags = task.tags ? task.tags.map(t => t.name) : [];
    return ${filterCode.predicate};
  }

  inbox.forEach(task => {
    // Exclude completed tasks by default
    ${completionCheck}

    // Apply AST-generated filter
    if (!matchesFilter(task)) return;

    // OMN-154: count every match; the limit caps only the projected rows
    totalMatched++;
    if (count >= limit) return;

    ${offsetCheck}

    results.push({
      ${fieldProjection}
    });
    count++;
  });

  return JSON.stringify({
    tasks: results,
    count: results.length,
    total_matched: totalMatched,
    ${offsetMetadata}
    mode: 'inbox_ast',
    filter_description: ${JSON.stringify(filterDescription)}
  });
})()
`;

  return {
    script: script.trim(),
    filterDescription,
    isEmptyFilter: false, // Inbox always has inInbox: true
  };
}

/**
 * OMN-225: id-lookup builders must always project `id` so the read tool's
 * id-match guard (OmniFocusReadTool.executeIdLookup / executeProjectIdLookup)
 * can verify `row.id === requested id` BEFORE projectFields() re-adds id
 * downstream. Without id in the row the guard reads undefined and mis-fires
 * ID_MISMATCH for ANY id — the bug was misattributed to freshly-created ids
 * because the failing repro also dropped id from `fields`. Empty `fields`
 * already falls back to the DEFAULT_*_FIELDS set (which includes id) inside the
 * *FieldProjection helpers, so only force id when an explicit list omits it.
 * Single-sourced across both id-lookup builders so a future tweak can't silently
 * re-open the bug on one path. Chosen over relaxing the guard, which would skip
 * the right-task verification when id isn't requested.
 */
function ensureIdField(fields: string[]): string[] {
  return fields.length === 0 || fields.includes('id') ? fields : ['id', ...fields];
}

/**
 * Build an OmniJS script for a specific task by ID
 */
export function buildTaskByIdScript(taskId: string, fields: string[] = []): GeneratedScript {
  const fieldProjection = generateFieldProjection(ensureIdField(fields)); // OMN-225: see ensureIdField

  // OMN-185: resolve the task directly via Task.byIdentifier (O(1)) instead of
  // iterating flattenedTasks (O(n), pays the ~7-10s materialization floor for a
  // single known id). Mirrors OMN-40's Project.byIdentifier fast-path PATTERN.
  // NOTE the layering differs from buildProjectByIdScript: this builder returns
  // only the inner OmniJS body — the caller (list-tasks-ast.ts) wraps it in
  // app.evaluateJavascript — whereas buildProjectByIdScript self-wraps. `Task`
  // is an OmniJS global and is defined ONLY inside that evaluateJavascript
  // wrapper; running this script as bare JXA would throw `Task is not defined`.
  // Task.byIdentifier returns null for an unknown/deleted id, so the guard keeps
  // the {tasks:[], count:0} shape that NOT_FOUND read-backs depend on. The id
  // filter is the sole selector (sibling keys are ignored — unchanged routing in
  // list-tasks-ast.ts), and Task.byIdentifier resolves completed tasks too.
  const script = `
(() => {
  const results = [];
  const targetId = ${JSON.stringify(taskId)};

  const task = Task.byIdentifier(targetId);
  if (task) {
    results.push({
      ${fieldProjection}
    });
  }

  return JSON.stringify({
    tasks: results,
    count: results.length,
    mode: 'id_lookup',
    targetId: targetId
  });
})()
`;

  return {
    script: script.trim(),
    filterDescription: `id = ${taskId}`,
    isEmptyFilter: false,
  };
}

// =============================================================================
// RECURRING TASKS SCRIPT BUILDER
// =============================================================================

/**
 * Options for recurring tasks analysis
 */
export interface RecurringTasksOptions extends ScriptOptions {
  /** Include completed recurring tasks */
  includeCompleted?: boolean;
  /** Include dropped recurring tasks */
  includeDropped?: boolean;
  /** Only active tasks (not completed or dropped) */
  activeOnly?: boolean;
  /** Filter by project ID */
  projectId?: string;
  /** Filter by project name */
  project?: string;
  /** Sort by: 'dueDate' | 'frequency' | 'project' | 'name' */
  sortBy?: 'dueDate' | 'frequency' | 'project' | 'name';
  /** Include completion history */
  includeHistory?: boolean;
}

/**
 * Build an OmniJS script for analyzing recurring tasks
 *
 * Uses AST for filtering (hasRepetitionRule, completed, dropped, projectId)
 * while keeping the domain-specific pattern inference logic.
 */
export function buildRecurringTasksScript(options: RecurringTasksOptions = {}): GeneratedScript {
  const {
    limit = 1000,
    includeCompleted = false,
    includeDropped = false,
    activeOnly = true,
    projectId,
    project,
    sortBy = 'name',
    includeHistory = false,
  } = options;

  // Build AST filter from options
  const filter: TaskFilter = {
    hasRepetitionRule: true, // Only recurring tasks
  };

  // Apply completion/dropped filters based on options
  if (activeOnly && !includeCompleted && !includeDropped) {
    filter.completed = false;
    filter.dropped = false;
  } else {
    if (!includeCompleted) {
      filter.completed = false;
    }
    if (!includeDropped) {
      filter.dropped = false;
    }
  }

  // Apply project filter if specified
  if (projectId) {
    filter.projectId = projectId;
  }

  // Normalize the filter before generating code
  const normalizedFilter = normalizeFilter(filter);

  // Generate the filter predicate using AST
  const filterCode = generateFilterCode(normalizedFilter);
  const filterDescription = describeFilterForScript(normalizedFilter);

  // Build the AST to check if empty (it won't be - we always have hasRepetitionRule)
  const ast = buildAST(normalizedFilter);
  const isEmptyFilter = ast.type === 'literal' && ast.value === true;

  // The script with AST-generated filter predicate and domain-specific inference logic
  const script = `
(() => {
  const options = {
    project: ${JSON.stringify(project)},
    sortBy: ${JSON.stringify(sortBy)},
    includeHistory: ${includeHistory},
    limit: ${limit}
  };

  const results = [];
  const now = new Date();
  let count = 0;

  ${filterCode.preamble ? filterCode.preamble + '\n' : ''}
  // AST-generated filter predicate
  // Filter: ${sanitizeForScriptComment(filterDescription)}
  function matchesFilter(task) {
    const taskTags = task.tags ? task.tags.map(t => t.name) : [];
    return ${filterCode.predicate};
  }

  // Helper to fetch repeat rule via bridge for complete data
  function fetchRepeatRuleViaBridge(taskId) {
    try {
      const task = Task.byIdentifier(taskId);
      if (!task || !task.repetitionRule) return null;
      const rule = task.repetitionRule;
      const method = rule.method ? (typeof rule.method === 'string' ? rule.method : (rule.method.name || null)) : null;
      return { ruleString: rule.ruleString || null, method: method };
    } catch (e) {
      return null;
    }
  }

  // Process each task
  flattenedTasks.forEach(task => {
    if (count >= options.limit) return;

    // Apply AST-generated filter
    if (!matchesFilter(task)) return;

    const taskInfo = {
      id: task.id.primaryKey,
      name: task.name,
      repetitionRule: {}
    };

    // Extract repetition rule properties
    const rule = task.repetitionRule;
    const ruleData = {};

    // Try official OmniFocus API properties
    ['method', 'ruleString', 'anchorDateKey', 'catchUpAutomatically', 'scheduleType'].forEach(prop => {
      try {
        const value = rule[prop];
        if (value !== undefined && value !== null && value !== '') {
          ruleData[prop] = value;
        }
      } catch (e) {}
    });

    // Parse RRULE format
    if (ruleData.ruleString) {
      try {
        const ruleStr = ruleData.ruleString.toString();
        if (ruleStr.includes('FREQ=HOURLY')) { ruleData.unit = 'hours'; ruleData.steps = 1; }
        else if (ruleStr.includes('FREQ=DAILY')) { ruleData.unit = 'days'; ruleData.steps = 1; }
        else if (ruleStr.includes('FREQ=WEEKLY')) { ruleData.unit = 'weeks'; ruleData.steps = 1; }
        else if (ruleStr.includes('FREQ=MONTHLY')) { ruleData.unit = 'months'; ruleData.steps = 1; }
        else if (ruleStr.includes('FREQ=YEARLY')) { ruleData.unit = 'years'; ruleData.steps = 1; }

        const intervalMatch = ruleStr.match(/INTERVAL=(\\d+)/);
        if (intervalMatch) { ruleData.steps = parseInt(intervalMatch[1]); }
        ruleData._inferenceSource = 'ruleString';
      } catch (e) {}
    }

    // Bridge fallback for missing data
    if (!ruleData.ruleString || !ruleData.method) {
      const bridgeRule = fetchRepeatRuleViaBridge(task.id.primaryKey);
      if (bridgeRule && bridgeRule.ruleString) {
        ruleData.ruleString = bridgeRule.ruleString;
        if (bridgeRule.method) { ruleData.method = bridgeRule.method; }
        ruleData._inferenceSource = 'bridge';
      }
    }

    taskInfo.repetitionRule = ruleData;

    // Add project info
    const proj = task.containingProject;
    if (proj) {
      taskInfo.project = proj.name;
      taskInfo.projectId = proj.id.primaryKey;
    }

    // Project name filter (if specified)
    if (options.project && taskInfo.project && taskInfo.project !== options.project) {
      return;
    }

    // Add dates
    if (task.deferDate) { taskInfo.deferDate = task.deferDate.toISOString(); }
    if (task.dueDate) {
      taskInfo.dueDate = task.dueDate.toISOString();
      if (!task.completed) {
        taskInfo.nextDue = task.dueDate.toISOString();
        taskInfo.daysUntilDue = Math.floor((task.dueDate - now) / (1000 * 60 * 60 * 24));
        if (taskInfo.daysUntilDue < 0) {
          taskInfo.isOverdue = true;
          taskInfo.overdueDays = Math.abs(taskInfo.daysUntilDue);
        }
      }
    }

    // Completion history
    if (options.includeHistory && task.completionDate) {
      taskInfo.lastCompleted = task.completionDate.toISOString();
    }

    // Calculate frequency description
    let frequencyDesc = '';
    if (ruleData.unit && ruleData.steps) {
      const s = ruleData.steps;
      switch(ruleData.unit) {
        case 'hours': frequencyDesc = s === 1 ? 'Hourly' : 'Every ' + s + ' hours'; break;
        case 'days': frequencyDesc = s === 1 ? 'Daily' : s === 7 ? 'Weekly' : s === 14 ? 'Biweekly' : 'Every ' + s + ' days'; break;
        case 'weeks': frequencyDesc = s === 1 ? 'Weekly' : 'Every ' + s + ' weeks'; break;
        case 'months': frequencyDesc = s === 1 ? 'Monthly' : s === 3 ? 'Quarterly' : 'Every ' + s + ' months'; break;
        case 'years': frequencyDesc = s === 1 ? 'Yearly' : 'Every ' + s + ' years'; break;
      }
    }

    // Fallback: infer from task name
    if (!frequencyDesc) {
      const taskName = task.name.toLowerCase();
      if (taskName.includes('hourly') || taskName.includes('every hour')) { frequencyDesc = 'Hourly'; ruleData.unit = 'hours'; ruleData.steps = 1; }
      else if (taskName.includes('daily') || taskName.includes('every day')) { frequencyDesc = 'Daily'; ruleData.unit = 'days'; ruleData.steps = 1; }
      else if (taskName.includes('weekly') || taskName.includes('every week')) { frequencyDesc = 'Weekly'; ruleData.unit = 'weeks'; ruleData.steps = 1; }
      else if (taskName.includes('monthly') || taskName.includes('every month')) { frequencyDesc = 'Monthly'; ruleData.unit = 'months'; ruleData.steps = 1; }
      else if (taskName.includes('yearly') || taskName.includes('annually')) { frequencyDesc = 'Yearly'; ruleData.unit = 'years'; ruleData.steps = 1; }
      else if (taskName.includes('quarterly')) { frequencyDesc = 'Quarterly'; ruleData.unit = 'months'; ruleData.steps = 3; }
      else if (taskName.includes('biweekly')) { frequencyDesc = 'Biweekly'; ruleData.unit = 'weeks'; ruleData.steps = 2; }
      else { frequencyDesc = 'Unknown Pattern'; }
    }

    taskInfo.frequency = frequencyDesc;
    taskInfo.repetitionRule = ruleData;
    results.push(taskInfo);
    count++;
  });

  // Sort results
  switch(options.sortBy) {
    case 'dueDate':
      results.sort((a, b) => {
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return new Date(a.dueDate) - new Date(b.dueDate);
      });
      break;
    case 'frequency':
      results.sort((a, b) => {
        const aFreq = (a.repetitionRule.steps || 1) * ({ hours: 1/24, days: 1, weeks: 7, months: 30, years: 365 }[a.repetitionRule.unit] || 999);
        const bFreq = (b.repetitionRule.steps || 1) * ({ hours: 1/24, days: 1, weeks: 7, months: 30, years: 365 }[b.repetitionRule.unit] || 999);
        return aFreq - bFreq;
      });
      break;
    case 'project':
      results.sort((a, b) => {
        if (!a.project) return 1;
        if (!b.project) return -1;
        return a.project.localeCompare(b.project);
      });
      break;
    case 'name':
    default:
      results.sort((a, b) => a.name.localeCompare(b.name));
  }

  // Summary statistics
  const summary = {
    totalRecurring: results.length,
    overdue: results.filter(t => t.isOverdue).length,
    dueThisWeek: results.filter(t => t.daysUntilDue >= 0 && t.daysUntilDue <= 7).length,
    byFrequency: {}
  };

  results.forEach(task => {
    const freq = task.frequency || 'Unknown';
    summary.byFrequency[freq] = (summary.byFrequency[freq] || 0) + 1;
  });

  return JSON.stringify({
    tasks: results,
    summary: summary,
    mode: 'recurring_ast',
    filter_description: ${JSON.stringify(filterDescription)}
  });
})()
`;

  return {
    script: script.trim(),
    filterDescription,
    isEmptyFilter,
  };
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/** Boolean filter fields and their true/false descriptions */
const BOOLEAN_FILTER_DESCRIPTORS: Array<{ key: keyof TaskFilter; trueLabel: string; falseLabel: string }> = [
  { key: 'completed', trueLabel: 'completed', falseLabel: 'active' },
  { key: 'dropped', trueLabel: 'dropped', falseLabel: 'not dropped' },
  { key: 'hasRepetitionRule', trueLabel: 'recurring', falseLabel: 'non-recurring' },
  { key: 'flagged', trueLabel: 'flagged', falseLabel: 'not flagged' },
  { key: 'blocked', trueLabel: 'blocked', falseLabel: 'not blocked' },
  { key: 'available', trueLabel: 'available', falseLabel: 'not available' },
  { key: 'inInbox', trueLabel: 'inbox', falseLabel: 'not inbox' },
  // OMN-153: includeProjectRoot appears in filters_applied; describe it so
  // filter_description never contradicts filters_applied ("all tasks" + key present).
  { key: 'includeProjectRoot', trueLabel: 'include project roots', falseLabel: 'exclude project roots' },
];

/**
 * Date-range descriptors. OMN-172 (F10): every date-range key that can appear in
 * `filters_applied` must be describable, or `filter_description` reads "all tasks"
 * while `filters_applied` shows the key (self-contradiction). `due` was the only
 * one described before S4; defer/planned/completion/added are backfilled here.
 */
const DATE_RANGE_DESCRIPTORS: ReadonlyArray<{ label: string; after: keyof TaskFilter; before: keyof TaskFilter }> = [
  { label: 'due', after: 'dueAfter', before: 'dueBefore' },
  { label: 'defer', after: 'deferAfter', before: 'deferBefore' },
  { label: 'planned', after: 'plannedAfter', before: 'plannedBefore' },
  { label: 'completion', after: 'completionAfter', before: 'completionBefore' },
  { label: 'added', after: 'addedAfter', before: 'addedBefore' },
];

function describeDateRange(
  filter: TaskFilter,
  label: string,
  after: keyof TaskFilter,
  before: keyof TaskFilter,
): string | undefined {
  const a = filter[after] as string | undefined;
  const b = filter[before] as string | undefined;
  if (!a && !b) return undefined;
  if (a && b) return `${label}: ${a} to ${b}`;
  if (b) return `${label} before: ${b}`;
  return `${label} after: ${a}`;
}

// OMN-49: estimated-duration filters (explicit !== undefined — 0 is a valid estimate).
function describeEstimateFilters(filter: TaskFilter): string[] {
  const out: string[] = [];
  if (filter.estimatedMinutesEquals !== undefined) out.push(`estimate = ${filter.estimatedMinutesEquals}m`);
  if (filter.estimatedMinutesLessThan !== undefined) out.push(`estimate < ${filter.estimatedMinutesLessThan}m`);
  if (filter.estimatedMinutesGreaterThan !== undefined) out.push(`estimate > ${filter.estimatedMinutesGreaterThan}m`);
  return out;
}

// Scalar id-like filters described as `label: value` (truthy-gated; these ids are never empty-string-valid).
const SCALAR_FILTER_DESCRIPTORS: ReadonlyArray<{ key: keyof TaskFilter; label: string }> = [
  { key: 'parentTaskId', label: 'parent' },
  { key: 'projectId', label: 'project' },
  { key: 'id', label: 'id' },
];

function describeScalarFilters(filter: TaskFilter): string[] {
  const out: string[] = [];
  for (const { key, label } of SCALAR_FILTER_DESCRIPTORS) {
    // These are all string id fields; the typeof narrows the keyof-widened union to string.
    const value = filter[key];
    if (typeof value === 'string' && value) out.push(`${label}: ${value}`);
  }
  return out;
}

// OMN-172 (F10): exported so the forcing-function coverage test can assert every
// describable filter key produces a fragment (reconciles filter_description with
// filters_applied). See tests/unit/contracts/ast/describe-filter-coverage.test.ts.
export function describeFilterForScript(filter: TaskFilter): string {
  const conditions: string[] = [];

  for (const { key, trueLabel, falseLabel } of BOOLEAN_FILTER_DESCRIPTORS) {
    if (filter[key] !== undefined) {
      conditions.push(filter[key] ? trueLabel : falseLabel);
    }
  }

  if (filter.tags && filter.tags.length > 0) {
    conditions.push(`tags[${filter.tagsOperator || 'AND'}]: ${filter.tags.join(', ')}`);
  }
  if (filter.text || filter.search) {
    conditions.push(`text: "${filter.text || filter.search}"`);
  }
  if (filter.name) {
    // OMN-142: name-only filter (distinct from text, which matches notes)
    conditions.push(`name: "${filter.name}"`);
  }

  for (const { label, after, before } of DATE_RANGE_DESCRIPTORS) {
    const range = describeDateRange(filter, label, after, before);
    if (range) conditions.push(range);
  }

  conditions.push(...describeEstimateFilters(filter));

  if (filter.tagStatusValid !== undefined) {
    conditions.push(filter.tagStatusValid ? 'tag status valid' : 'tag status invalid');
  }

  conditions.push(...describeScalarFilters(filter));

  return conditions.length > 0 ? conditions.join(' AND ') : 'all tasks';
}

// =============================================================================
// PROJECT SCRIPT BUILDER
// =============================================================================

/**
 * Options for project queries
 */
export interface ProjectScriptOptions {
  /** Maximum projects to return */
  limit?: number;
  /** Fields to include in response */
  fields?: string[];
  /** Include task statistics (expensive) */
  includeStats?: boolean;
  /** Performance mode: 'normal' includes task counts, 'lite' skips them */
  performanceMode?: 'normal' | 'lite';
  /** When set and > 0, truncate note content to this many characters */
  noteTruncateLength?: number;
}

/**
 * Default fields to include in project response
 */
const DEFAULT_PROJECT_FIELDS = [
  'id',
  'name',
  'status',
  'flagged',
  'note',
  'dueDate',
  'deferDate',
  'folder',
  'folderPath',
  'sequential',
  'lastReviewDate',
  'nextReviewDate',
  'reviewInterval', // OMN-60: emitted by the script so it can be projected when requested
  'tags', // OMN-62: emitted by the script so it can be projected when requested
  'plannedDate', // OMN-62: emitted by the script so it can be projected when requested
];

/**
 * Generate the field projection code for a project object
 */
function generateProjectFieldProjection(fields: string[], context?: { noteTruncateLength?: number }): string {
  const fieldList = fields.length > 0 ? fields : DEFAULT_PROJECT_FIELDS;
  const noteTruncateLength = context?.noteTruncateLength;
  const projections: string[] = [];

  for (const field of fieldList) {
    switch (field) {
      case 'id':
        projections.push('id: project.id.primaryKey');
        break;
      case 'name':
        projections.push('name: project.name || "Unnamed Project"');
        break;
      case 'status':
        projections.push('status: getProjectStatus(project)');
        break;
      case 'flagged':
        projections.push('flagged: project.flagged || false');
        break;
      case 'note':
        if (noteTruncateLength && noteTruncateLength > 0) {
          // OMN-242: signal truncation via a sibling flag, only emitted when it
          // actually fired, so responses stay byte-identical for the common case.
          projections.push(
            `...(() => { const n = project.note || ""; const truncated = n.length > ${noteTruncateLength}; return truncated ? { note: n.substring(0, ${noteTruncateLength}) + "...", noteTruncated: true } : { note: n }; })()`,
          );
        } else {
          projections.push('note: project.note || ""');
        }
        break;
      case 'dueDate':
        projections.push('dueDate: project.dueDate ? project.dueDate.toISOString() : null');
        break;
      case 'deferDate':
        projections.push('deferDate: project.deferDate ? project.deferDate.toISOString() : null');
        break;
      case 'folder':
        projections.push('folder: project.parentFolder ? project.parentFolder.name : null');
        break;
      case 'folderPath':
        projections.push('folderPath: project.parentFolder ? getFolderPath(project.parentFolder) : null');
        break;
      case 'folderId':
        projections.push('folderId: project.parentFolder ? project.parentFolder.id.primaryKey : null');
        break;
      case 'sequential':
        projections.push('sequential: project.sequential || false');
        break;
      case 'lastReviewDate':
        projections.push('lastReviewDate: project.lastReviewDate ? project.lastReviewDate.toISOString() : null');
        break;
      case 'nextReviewDate':
        projections.push('nextReviewDate: project.nextReviewDate ? project.nextReviewDate.toISOString() : null');
        break;
      case 'reviewInterval':
        // OMN-60: OmniJS reviewInterval.unit is a plural string ('weeks'),
        // .steps a number (verified via raw probe). null when unset.
        projections.push(
          'reviewInterval: project.reviewInterval ? { unit: project.reviewInterval.unit, steps: project.reviewInterval.steps } : null',
        );
        break;
      case 'completionDate':
        // OMN-81: was 'completedDate' reading `project.completedDate` — the
        // OmniJS Project class has no such property (canonical name is
        // `completionDate`, per the .d.ts at OmniFocus-4.8.x), so the script
        // emitted null for EVERY project regardless of completion state.
        // Aligned with the canonical API + the rest of the codebase.
        projections.push('completionDate: project.completionDate ? project.completionDate.toISOString() : null');
        break;
      case 'defaultSingletonActionHolder':
        projections.push('defaultSingletonActionHolder: project.defaultSingletonActionHolder || false');
        break;
      case 'tags':
        // OMN-62: mirrors task tags projection; project.tags verified live (OF 4.8.9)
        projections.push('tags: project.tags ? project.tags.map(t => t.name) : []');
        break;
      case 'plannedDate':
        // OMN-62: OF 4.7+; project.plannedDate accessor verified live via raw OmniJS probe
        projections.push('plannedDate: project.plannedDate ? project.plannedDate.toISOString() : null');
        break;
    }
  }

  return projections.join(',\n                ');
}

/**
 * Build an OmniJS script that filters projects using AST-generated predicates
 *
 * @param filter - The ProjectFilter to apply
 * @param options - Script generation options
 * @returns Generated script ready for execution
 */
export function buildFilteredProjectsScript(
  filter: ProjectFilter,
  options: ProjectScriptOptions = {},
): GeneratedScript {
  const { limit = 50, fields = [], includeStats = false, performanceMode = 'normal', noteTruncateLength } = options;

  // Generate the filter predicate code
  const filterCode = generateProjectFilterCode(filter);
  const isEmptyFilterValue = isEmptyProjectFilter(filter);
  const filterDescription = describeProjectFilter(filter);

  // Generate field projection
  const fieldProjection = generateProjectFieldProjection(fields, { noteTruncateLength });

  // Include task counts only in normal mode
  const includeTaskCounts = performanceMode !== 'lite';

  // OMN-218: fail loudly on any unresolvable folder PATH — top-level + OR branches
  // (review round 2). Not folder:null / topLevelOnly (boolean, ignored by the collector).
  // Skipped when `id` is set (review round 3, PR #168): `id` is documented elsewhere
  // (buildProjectByIdScript / buildTaskByIdScript) as the sole selector — sibling keys
  // are ignored. countOnly routes id+folder queries THROUGH this builder instead of the
  // dedicated id-lookup path (compiled.countOnly is checked before projectFilter.id in
  // OmniFocusReadTool), so without this guard an id-scoped countOnly query could newly
  // hard-error on a typo'd folder where the equivalent non-countOnly query ignores it.
  const folderGuard = filter.id ? '' : emitFolderNotFoundGuardsForFilter(filter, 'folderName');

  const omniJsSource = `
      (() => {
        ${folderGuard}
        const results = [];
        let count = 0;
        let totalMatched = 0;
        const limit = ${limit};

        // Helper to get project status string
        function getProjectStatus(project) {
          if (project.status === Project.Status.Done) return 'done';
          if (project.status === Project.Status.Dropped) return 'dropped';
          if (project.status === Project.Status.OnHold) return 'on-hold';
          return 'active';
        }

        // Helper to build folder path
        function getFolderPath(folder) {
          if (!folder) return '';
          const parts = [];
          let current = folder;
          while (current) {
            parts.unshift(current.name);
            current = current.parent;
          }
          return parts.join('/');
        }

        // AST-generated filter predicate
        // Filter: ${sanitizeForScriptComment(filterDescription)}
        function matchesFilter(project) {
          return ${filterCode};
        }

        flattenedProjects.forEach(project => {
          // Apply AST-generated filter
          if (!matchesFilter(project)) return;

          // OMN-154: count every match; the limit caps only the projected rows
          totalMatched++;
          if (count >= limit) return;

          const proj = {
            ${fieldProjection}
          };

          ${
            includeTaskCounts
              ? `
          // Task counts (normal mode)
          const rootTask = project.rootTask;
          if (rootTask) {
            proj.taskCounts = {
              total: rootTask.numberOfTasks || 0,
              available: rootTask.numberOfAvailableTasks || 0,
              completed: rootTask.numberOfCompletedTasks || 0
            };
          }

          // Next task
          const nextTask = project.nextTask;
          if (nextTask) {
            proj.nextTask = {
              id: nextTask.id.primaryKey,
              name: nextTask.name,
              flagged: nextTask.flagged || false,
              dueDate: nextTask.dueDate ? nextTask.dueDate.toISOString() : null
            };
          }
          `
              : ''
          }

          ${
            includeStats
              ? `
          // Include stats (expensive)
          const tasks = project.flattenedTasks;
          if (tasks && tasks.length > 0) {
            let active = 0, completed = 0, overdue = 0, flagged = 0;
            const now = new Date();

            tasks.forEach(task => {
              if (task.completed) {
                completed++;
              } else {
                active++;
                if (task.dueDate && task.dueDate < now) overdue++;
              }
              if (task.flagged) flagged++;
            });

            proj.stats = {
              active: active,
              completed: completed,
              total: tasks.length,
              completionRate: tasks.length > 0 ? Math.round((completed / tasks.length) * 100) : 0,
              overdue: overdue,
              flagged: flagged
            };
          }
          `
              : ''
          }

          results.push(proj);
          count++;
        });

        return JSON.stringify({
          projects: results,
          count: results.length,
          total_matched: totalMatched,
          total_available: flattenedProjects.length
        });
      })()
    `;

  const script = `
(() => {
  const app = Application('OmniFocus');

  try {
    const resultJson = app.evaluateJavascript(${JSON.stringify(omniJsSource)});
    const result = JSON.parse(resultJson);

    // OMN-218: propagate an in-script error envelope (e.g. the folder-not-found guard)
    // verbatim rather than mangling it into a success shape with undefined rows.
    if (result && result.error) {
      return resultJson;
    }

    return JSON.stringify({
      projects: result.projects,
      metadata: {
        total_available: result.total_available,
        total_matched: result.total_matched,
        returned_count: result.count,
        limit_applied: ${limit},
        performance_mode: '${performanceMode}',
        stats_included: ${includeStats},
        optimization: 'ast_filtered',
        filter_description: ${JSON.stringify(filterDescription)}
      }
    });

  } catch (error) {
    return JSON.stringify({
      error: true,
      message: error.message || String(error),
      context: 'list_projects_ast'
    });
  }
})()
`;

  return {
    script: script.trim(),
    filterDescription,
    isEmptyFilter: isEmptyFilterValue,
  };
}

/**
 * Build an OmniJS script for a specific project by ID
 */
export function buildProjectByIdScript(projectId: string, fields: string[] = []): GeneratedScript {
  const fieldProjection = generateProjectFieldProjection(ensureIdField(fields)); // OMN-225: see ensureIdField

  const omniJsSource = `
      (() => {
        const results = [];
        const targetId = ${JSON.stringify(projectId)};

        function getProjectStatus(project) {
          if (project.status === Project.Status.Done) return 'done';
          if (project.status === Project.Status.Dropped) return 'dropped';
          if (project.status === Project.Status.OnHold) return 'on-hold';
          return 'active';
        }

        function getFolderPath(folder) {
          if (!folder) return '';
          const parts = [];
          let current = folder;
          while (current) {
            parts.unshift(current.name);
            current = current.parent;
          }
          return parts.join('/');
        }

        // Use Project.byIdentifier for O(1) lookup
        const project = Project.byIdentifier(targetId);
        if (project) {
          results.push({
            ${fieldProjection}
          });
        }

        return JSON.stringify({
          projects: results,
          count: results.length,
          mode: 'id_lookup',
          targetId: targetId
        });
      })()
    `;

  const script = `
(() => {
  const app = Application('OmniFocus');

  try {
    const resultJson = app.evaluateJavascript(${JSON.stringify(omniJsSource)});
    return resultJson;

  } catch (error) {
    return JSON.stringify({
      error: true,
      message: error.message || String(error),
      context: 'project_by_id'
    });
  }
})()
`;

  return {
    script: script.trim(),
    filterDescription: `id = ${projectId}`,
    isEmptyFilter: false,
  };
}

// =============================================================================
// FOLDER SCRIPT BUILDER
// =============================================================================

/**
 * Options for folder queries
 */
export interface FolderScriptOptions {
  /** Maximum folders to return */
  limit?: number;
  /** Include projects in each folder */
  includeProjects?: boolean;
  /** Include child subfolders */
  includeSubfolders?: boolean;
  /**
   * OMN-170 S2: typed folder filter (name / parent / topLevelOnly). Replaces the
   * legacy `search` string — the predicate is generated by generateFolderFilterCode.
   */
  filter?: FolderFilter;
  /** Sort by field: 'name' | 'depth' | 'path' */
  sortBy?: 'name' | 'depth' | 'path';
  /** Sort order */
  sortOrder?: 'asc' | 'desc';
}

/**
 * Build an OmniJS script that lists folders with hierarchy info.
 *
 * Replaces the legacy `buildListFoldersScriptV3()`. Uses OmniJS bridge for
 * correct parent hierarchy access (`folder.parent` works in OmniJS, not JXA).
 *
 * @param options - Folder query options
 * @returns Generated script ready for execution
 */
export function buildFilteredFoldersScript(options: FolderScriptOptions = {}): GeneratedScript {
  const {
    limit = 100,
    includeProjects = false,
    includeSubfolders = true,
    filter = {},
    sortBy = 'path',
    sortOrder = 'asc',
  } = options;

  const isEmpty = isEmptyFolderFilter(filter);
  const filterDescription = describeFolderFilter(filter);
  // OMN-170 S2 / OMN-129: generated inside the OmniJS body; value terms injected via
  // JSON.stringify, and the whole source crosses the boundary via JSON.stringify below.
  const folderPredicate = generateFolderFilterCode(filter);

  const omniJsSource = `
      (() => {
        const results = [];
        let count = 0;
        let totalMatched = 0;
        const limit = ${limit};
        const includeProjects = ${includeProjects};
        const includeSubfolders = ${includeSubfolders};

        // OMN-170 S2: AST-generated folder filter predicate (name/parent/topLevel).
        function matchesFilter(folder) {
          return ${folderPredicate};
        }

        // Helper to build folder path by walking up parent chain
        function getFolderPath(folder) {
          if (!folder) return '';
          const parts = [];
          let current = folder;
          while (current) {
            parts.unshift(current.name);
            current = current.parent;
          }
          return parts.join('/');
        }

        // Helper to calculate depth
        function getFolderDepth(folder) {
          let depth = 0;
          let current = folder.parent;
          while (current) {
            depth++;
            current = current.parent;
          }
          return depth;
        }

        // Helper to get folder status
        function getFolderStatus(folder) {
          if (folder.status === Folder.Status.Dropped) return 'dropped';
          return 'active';
        }

        // Process all folders
        flattenedFolders.forEach(folder => {
          // OMN-170 S2: filter FIRST, then count the match (OMN-154 honesty),
          // then cap projected rows by limit — so total_available reports the
          // full matching population, not just the returned slice.
          if (!matchesFilter(folder)) return;
          totalMatched++;
          if (count >= limit) return;

          const depth = getFolderDepth(folder);
          const path = getFolderPath(folder);

          // Build folder object
          const folderObj = {
            id: folder.id.primaryKey,
            name: folder.name || 'Unnamed Folder',
            status: getFolderStatus(folder),
            depth: depth,
            path: path,
          };

          // Parent info
          if (folder.parent) {
            folderObj.parentId = folder.parent.id.primaryKey;
            folderObj.parentName = folder.parent.name;
          }

          // Child folders
          if (includeSubfolders && folder.folders && folder.folders.length > 0) {
            folderObj.children = [];
            folder.folders.forEach(child => {
              folderObj.children.push({
                id: child.id.primaryKey,
                name: child.name
              });
            });
            folderObj.childCount = folder.folders.length;
          }

          // Projects in folder (direct children only)
          if (includeProjects && folder.projects && folder.projects.length > 0) {
            folderObj.projects = [];
            folder.projects.forEach(proj => {
              folderObj.projects.push({
                id: proj.id.primaryKey,
                name: proj.name,
                status: proj.status === Project.Status.Active ? 'active' :
                        proj.status === Project.Status.OnHold ? 'on-hold' :
                        proj.status === Project.Status.Done ? 'done' : 'dropped'
              });
            });
            folderObj.projectCount = folder.projects.length;
          }

          results.push(folderObj);
          count++;
        });

        // Sort results
        const sortBy = '${sortBy}';
        const sortOrder = '${sortOrder}';

        results.sort((a, b) => {
          let valueA, valueB;

          switch (sortBy) {
            case 'depth':
              valueA = a.depth;
              valueB = b.depth;
              break;
            case 'path':
              valueA = a.path.toLowerCase();
              valueB = b.path.toLowerCase();
              break;
            case 'name':
            default:
              valueA = a.name.toLowerCase();
              valueB = b.name.toLowerCase();
          }

          if (sortOrder === 'desc') {
            return valueA < valueB ? 1 : valueA > valueB ? -1 : 0;
          } else {
            return valueA > valueB ? 1 : valueA < valueB ? -1 : 0;
          }
        });

        return JSON.stringify({
          success: true,
          folders: results,
          metadata: {
            returned_count: results.length,
            total_available: totalMatched
          }
        });
      })()
    `;

  const script = `
(() => {
  const app = Application('OmniFocus');

  try {
    const result = app.evaluateJavascript(${JSON.stringify(omniJsSource)});
    return result;

  } catch (error) {
    return JSON.stringify({
      error: true,
      message: error.message || String(error),
      context: 'list_folders_ast'
    });
  }
})()
`;

  return {
    script: script.trim(),
    filterDescription,
    isEmptyFilter: isEmpty,
  };
}

// =============================================================================
// TASK COUNT SCRIPT BUILDER
// =============================================================================

/**
 * Options for task count queries
 */
export interface TaskCountOptions {
  /** Maximum tasks to scan (for performance) */
  maxScan?: number;
}

/**
 * Build a JXA script that counts tasks matching AST-generated filters by
 * delegating the scan to OmniJS via a single app.evaluateJavascript() call.
 *
 * Performance (OMN-57): pure-JXA counting iterates doc.flattenedTasks() with
 * a per-element Apple-Event round-trip per task and per accessor — ~51 s for a
 * ~2900-task DB. Running the count inside OmniJS removes that per-element IPC
 * (one bridge round-trip total) → ~10 s. The remaining ~7-10 s is the
 * flattenedTasks materialization, an irreducible floor with the public API.
 * NOTE: the "evaluateJavascript is ~40x slower" heuristic holds only for
 * SMALL result sets where bridge-setup cost dominates; for whole-DB iteration
 * the per-element JXA IPC dominates and the bridge wins. Do not "optimize"
 * this back to pure JXA.
 *
 * @param filter - TaskFilter criteria to count (normalized internally)
 * @param options - Count options (maxScan limit)
 * @returns Complete JXA script (delegates to OmniJS) ready for execution
 */
export function buildTaskCountScript(filter: TaskFilter = {}, options: TaskCountOptions = {}): GeneratedScript {
  const { maxScan = 10000 } = options;

  // Normalize filter to ensure consistent property names
  const normalizedFilter = normalizeFilter(filter);

  // Determine if we're counting inbox tasks
  const checkInbox = normalizedFilter.inInbox === true;

  // OMN-52: Match the OmniJS list path's implicit default of excluding completed
  // tasks when the user hasn't asked for them. The OmniJS path hardcodes
  // `if (task.completed) return;` regardless of filter — without the matching
  // default here, the same filter produces different counts via countOnly vs
  // standard path (verified live: standard returned 134, countOnly returned 284
  // for `estimatedMinutesLessThan: 30` due to 150 completed tasks slipping in).
  //
  // For inbox queries, also strip inInbox from the predicate since the
  // pre-filtered inbox collection (`doc.inboxTasks()`) already handles it.
  //
  // OMN-190: effectiveFilter is what we describe + echo (the honesty surface).
  // It carries the auto-injected completed/dropped/project-root defaults AND
  // keeps inInbox (so inbox counts are described as inbox). The predicate's
  // filterForCode is the same set minus inInbox for the pre-filtered collection.
  // Count has no includeCompleted option, so the defaults always apply (pass false).
  const effectiveFilter = applyHonestyDefaults(normalizedFilter, false);
  const filterForCode = (() => {
    if (!checkInbox) return effectiveFilter;
    const f = { ...effectiveFilter };
    delete f.inInbox;
    return f;
  })();

  // Build AST and generate OmniJS filter code
  const ast = buildAST(filterForCode);
  const isEmptyFilterValue = ast.type === 'literal' && ast.value === true;
  const filterCode = generateFilterCode(filterForCode);
  // OMN-190: describe the effective filter so the count never claims "all tasks"
  // while silently excluding completed/dropped/project-root rows.
  const filterDescription = describeFilterForScript(effectiveFilter);

  // Check if the filter needs tags - only fetch tags if the filter uses them
  const needsTags = filterCode.predicate.includes('taskTags');

  // OMN-218: countOnly parity with the list path — any unresolvable folder PATH (top-level
  // or OR-branch, review round 2) fails loudly instead of silently counting 0.
  // folder:null / folderTopLevel is a different (boolean) flag and stays a valid 0-count.
  // Skipped when `id` is set (review round 3, PR #168): `id` is documented elsewhere
  // (buildTaskByIdScript) as the sole selector — sibling keys are ignored. countOnly
  // routes id+folder queries THROUGH this builder instead of the dedicated id-lookup
  // path (compiled.countOnly is checked before filter.id in OmniFocusReadTool), so
  // without this guard an id-scoped countOnly query could newly hard-error on a typo'd
  // folder where the equivalent non-countOnly query ignores it entirely.
  const folderGuard = normalizedFilter.id ? '' : emitFolderNotFoundGuardsForFilter(normalizedFilter, 'folder');

  // Count runs in OmniJS (see JSDoc): one bridge round-trip, no per-task IPC.
  const omniJsSource = `
(() => {
  try {
    ${folderGuard}
    const startTime = Date.now();
    const maxScan = ${maxScan};
    let count = 0;
    let scanned = 0;
    // OmniJS globals (property access, no parens): inbox is the pre-filtered
    // inbox collection, flattenedTasks the whole-DB flattened collection.
    const tasks = ${checkInbox ? 'inbox' : 'flattenedTasks'};
    const totalTasks = tasks.length;
    ${filterCode.preamble ? filterCode.preamble + '\n    ' : ''}// Filter: ${sanitizeForScriptComment(filterDescription)}
    function matchesFilter(task${needsTags ? ', taskTags' : ''}) {
      return ${filterCode.predicate};
    }
    // maxScan bounds only this loop -- NOT the flattenedTasks materialization
    // above, which is the real cost. limited:true no longer implies a perf saving (OMN-57).
    for (let i = 0; i < tasks.length && scanned < maxScan; i++) {
      scanned++;
      try {
        const task = tasks[i];
        ${
          needsTags
            ? `let taskTags = [];
        try { const tg = task.tags; if (tg) taskTags = tg.map(t => t.name); } catch (e) {}
        if (matchesFilter(task, taskTags)) {`
            : 'if (matchesFilter(task)) {'
        }
          count++;
        }
      } catch (e) {}
    }
    const endTime = Date.now();
    return JSON.stringify({
      count: count,
      filters_applied: ${JSON.stringify(stripNormalizedBrand(effectiveFilter))},
      query_time_ms: endTime - startTime,
      optimization: 'omnijs_count${needsTags ? '_with_tags' : '_no_tags'}',
      filter_description: ${JSON.stringify(filterDescription)},
      scanned: scanned,
      total_tasks: totalTasks,
      ...(scanned >= maxScan ? { warning: 'Count may be incomplete due to scan limit', limited: true } : { limited: false })
    });
  } catch (error) {
    return JSON.stringify({ error: true, message: (error && error.message) || String(error), context: 'task_count_omnijs' });
  }
})()
`;

  const script = `
(() => {
  const app = Application('OmniFocus');

  try {
    return app.evaluateJavascript(${JSON.stringify(omniJsSource)});
  } catch (e) {
    return JSON.stringify({ error: true, message: e.message || String(e), context: 'task_count_omnijs' });
  }
})()
`;

  return {
    script: script.trim(),
    filterDescription,
    isEmptyFilter: isEmptyFilterValue,
  };
}
