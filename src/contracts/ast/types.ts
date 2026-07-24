/**
 * AST Node Types for Filter Contracts
 *
 * These types represent filter logic as a tree structure that can be:
 * - Validated (static analysis)
 * - Unit tested (structure, not strings)
 * - Transformed to multiple targets (JXA, OmniJS)
 *
 * @see docs/plans/2025-11-24-ast-filter-contracts-design.md
 */

import { emitFolderPathMatch } from './folder-path-match.js';

// =============================================================================
// COMPARISON OPERATORS
// =============================================================================

/**
 * Operators for comparing values
 */
export type ComparisonOperator =
  | '=='
  | '!='
  | '<'
  | '>'
  | '<='
  | '>='
  | 'includes' // String contains substring
  | 'matches' // Regex match
  | 'some' // Array: at least one matches
  | 'every'; // Array: all match

// =============================================================================
// AST NODE TYPES
// =============================================================================

/**
 * Logical AND of multiple conditions
 */
export interface AndNode {
  type: 'and';
  children: FilterNode[];
}

/**
 * Logical OR of multiple conditions
 */
export interface OrNode {
  type: 'or';
  children: FilterNode[];
}

/**
 * Logical NOT (negation)
 */
export interface NotNode {
  type: 'not';
  child: FilterNode;
}

/**
 * Compare a field against a value
 *
 * Examples:
 * - { field: 'task.completed', operator: '==', value: false }
 * - { field: 'task.flagged', operator: '==', value: true }
 * - { field: 'taskTags', operator: 'some', value: ['work'] }
 */
export interface ComparisonNode {
  type: 'comparison';
  field: string; // e.g., 'task.completed', 'task.flagged', 'taskTags'
  operator: ComparisonOperator;
  value: unknown; // The value to compare against
}

/**
 * Check if a field exists or has a value
 *
 * Examples:
 * - { field: 'task.dueDate', exists: true }  // Must have due date
 * - { field: 'task.dueDate', exists: false } // Must NOT have due date
 */
export interface ExistsNode {
  type: 'exists';
  field: string;
  exists: boolean;
}

/**
 * A constant boolean value (optimization for tautologies/contradictions)
 */
export interface LiteralNode {
  type: 'literal';
  value: boolean;
}

/**
 * Union of all filter node types
 */
export type FilterNode = AndNode | OrNode | NotNode | ComparisonNode | ExistsNode | LiteralNode;

// =============================================================================
// TYPE GUARDS
// =============================================================================

export function isAndNode(node: FilterNode): node is AndNode {
  return node.type === 'and';
}

export function isOrNode(node: FilterNode): node is OrNode {
  return node.type === 'or';
}

export function isNotNode(node: FilterNode): node is NotNode {
  return node.type === 'not';
}

export function isComparisonNode(node: FilterNode): node is ComparisonNode {
  return node.type === 'comparison';
}

export function isExistsNode(node: FilterNode): node is ExistsNode {
  return node.type === 'exists';
}

export function isLiteralNode(node: FilterNode): node is LiteralNode {
  return node.type === 'literal';
}

// =============================================================================
// SYNTHETIC FIELD REGISTRY
// =============================================================================

/**
 * Emitter function for a synthetic field.
 * Receives the comparison operator and value, returns JavaScript code string.
 */
export type SyntheticFieldEmitter = (operator: ComparisonOperator, value: unknown) => string;

/**
 * A synthetic field that doesn't map directly to an OmniFocus property.
 * Each entry declares how to emit for OmniJS (required).
 */
export interface SyntheticFieldDef {
  readonly field: string;
  readonly omnijs: SyntheticFieldEmitter;
}

function emitOmniJSStatusComparison(operator: ComparisonOperator, value: unknown, statusEnum: string): string {
  const matches = value as boolean;
  const shouldEqual = (operator === '==') === matches;
  return `task.taskStatus ${shouldEqual ? '===' : '!=='} ${statusEnum}`;
}

/**
 * OMN-130: The set of OmniFocus Task.Status values that mean "actionable now".
 *
 * Shared between the projection side (generateFieldProjection 'available' case in
 * script-builder.ts) and the filter side (SYNTHETIC_FIELD_DEFS 'task.available'
 * emitter below) so WHERE and SELECT always agree on what "available" means.
 *
 * Statuses and their semantics (from OmniFocus.d.ts + jxa-omnifocus-expert):
 *   Available — standard ready task
 *   DueSoon   — ready task approaching its due date
 *   Next      — next action in a sequential project (sequentially unlocked)
 *   Overdue   — ready task past its due date
 *
 * NOT in this set (not actionable):
 *   Blocked   — defer date not elapsed, sequential predecessor incomplete, or on-hold project
 *   Completed — terminal state
 *   Dropped   — terminal state
 *
 * Consequence: available:true and blocked:true form a coherent XOR partition over
 * non-terminal tasks. An overdue task → available:true, blocked:false.
 */
export const ACTIONABLE_STATUSES = [
  'Task.Status.Available',
  'Task.Status.DueSoon',
  'Task.Status.Next',
  'Task.Status.Overdue',
] as const;

/**
 * The same set as a ready-to-splice OmniJS array literal, e.g.
 * `${ACTIONABLE_STATUSES_ARRAY_LITERAL}.indexOf(task.taskStatus) !== -1`.
 * Single definition so every generated script stays in lockstep with the
 * canonical set (the old hand-copied forms silently drifted).
 */
export const ACTIONABLE_STATUSES_ARRAY_LITERAL = `[${ACTIONABLE_STATUSES.join(', ')}]`;

/**
 * OMN-270: ready-to-splice OmniJS pass that computes `taskCountsByProject` —
 * a map of project id → `{ total, available, completed }` — in ONE uncapped
 * scan of the global `flattenedTasks`.
 *
 * This is the live replacement for the JXA-only count properties (undefined
 * in OmniJS on both Project and its root task; probed 2026-07-16). All three
 * counts share ONE scope: every non-root descendant of the project, at any
 * depth — so `available <= total` and `completed <= total` hold by
 * construction. (/code-review round 2 of the fixing PR: an earlier revision
 * counted total/completed over DIRECT children — exact JXA parity — while
 * available counted deep descendants, which could report available > total
 * on projects with nested groups. The JXA trio these replace was DEAD — it
 * never shipped a value — so JXA parity is a probe anchor, not a
 * compatibility constraint; scope consistency wins.) Live-probed
 * 2026-07-16: pass total === project.flattenedTasks.length on 219/219
 * projects; the available ===0 boundary (the load-bearing consumer
 * semantic, missing_next_actions/stall detection) is unchanged from
 * PR #227's OMN-269 semantics.
 *
 * Semantics baked in (do not re-derive per call site):
 * - Root tasks appear in the global collection and read as actionable; a
 *   non-null `t.project` marks a root and it is skipped (live-caught in
 *   PR #227: counting roots turned 12 of 13 stalled projects "healthy").
 * - `completed` is the task's own completed flag (matching every other
 *   completed-count in the codebase), not effective status.
 * - One bad task costs only itself (inner catch); a failure of the pass
 *   itself propagates to the script's error envelope — an unreadable count
 *   must not surface as a real 0.
 *
 * Cost, measured live (PR #227, ~2.9k-task DB): well under a second — the
 * per-project section including this pass measured ~0.6s of a ~10s full
 * scan. It is a whole-DB pass regardless of any project filter/limit at the
 * call site; that is inherent to computing per-project descendant counts
 * without per-project subtree re-walks (which are strictly more expensive).
 *
 * ONE definition spliced by every emitter that needs per-project task
 * counts (script-builder's includeTaskCounts block, productivity-stats-v3,
 * projects-for-review) so the root-skip marker, scope, and status set can
 * never drift between call paths — the divergence class OMN-270 fixed.
 */
/**
 * The zero-counts shape for projects with no (readable) tasks — the fallback
 * every splice site of TASK_COUNTS_BY_PROJECT_PASS_SNIPPET uses when a
 * project has no entry in the map. ONE definition so a future shape change
 * (e.g. adding a field) cannot leave one call site emitting a stale zero
 * object (/code-review round 3 of the OMN-270 PR).
 */
export const TASK_COUNTS_ZERO_LITERAL = `{ total: 0, available: 0, completed: 0 }`;

/**
 * The project-root-row predicate (OMN-290): the global flattenedTasks
 * collection includes each project's own root task, which reads as
 * actionable — a non-null `task.project` is the live root marker (PR #227).
 * Every analytics pass over flattenedTasks must skip these or a project's
 * root row silently inflates totals (and, for completed/overdue projects,
 * pollutes the completed/overdue counts too).
 *
 * A task whose `task.project` access itself throws is treated as NOT a
 * root row (fail toward counting it, not dropping it) — the property read
 * is the only thing being guarded here, not the rest of that task's
 * analysis; a caller must not let this predicate's own defensiveness
 * silently exclude an otherwise-readable task from unrelated metrics.
 *
 * ONE definition spliced by every emitter that walks flattenedTasks for
 * task-level analytics (task-velocity-v3, productivity-stats-v3,
 * analyze-overdue-v3, workflow-analysis-v3) so the root-skip marker and
 * its failure semantics cannot drift between call paths independently —
 * three of those four sites hand-rolled their own copy before this
 * consolidation (/code-review of the OMN-290 PR). Deliberately NOT
 * spliced into TASK_COUNTS_BY_PROJECT_PASS_SNIPPET below — that snippet
 * is itself spliced inside a nested block at some call sites
 * (productivity-stats-v3's includeProjectStats branch) alongside a
 * top-level splice of this one, and two `function isProjectRootRow`
 * declarations in the same OmniJS script is unnecessary risk for a
 * pre-existing, already-vetted pass this PR doesn't touch.
 */
export const IS_PROJECT_ROOT_ROW_SNIPPET = `function isProjectRootRow(task) {
            try {
              return !!task.project;
            } catch (e) {
              return false;
            }
          }`;

/**
 * Canonical Project.Status → wire-vocabulary map ('active' | 'onHold' |
 * 'done' | 'dropped', String(s) fail-open for statuses a future OmniFocus
 * adds — never a String()/.replace() of the enum, whose tag stringifies as
 * "[object Project.Status: Active]", the OMN-272 defect class).
 *
 * ONE definition spliced by every OmniJS emitter that ships a project
 * status string (fetchSlimmedData, productivity-stats-v3,
 * projects-for-review, and — since OMN-274 — script-builder's read pipeline:
 * buildFilteredProjectsScript, buildProjectByIdScript, and the folder
 * listing's project rows) so the vocabulary cannot drift between call paths —
 * before OMN-272 unified them, projects-for-review had already drifted to
 * 'on-hold', and the script-builder read path stayed on 'on-hold' until
 * OMN-274. Do NOT add an inline copy; splice this.
 *
 * Known non-splice sites, deliberately adjudicated elsewhere:
 * warm-projects-cache normalizes via substring match (adjudicated at that
 * site), and the write-path read-back echo (mutation/defs.ts
 * PROJECT_STATUS_READBACK) deliberately speaks the write TRANSPORT
 * vocabulary ('on_hold'/'completed'), echoing the same enum the write
 * schema accepts — see the adjudication comment at that site (OMN-274).
 */
export const PROJECT_STATUS_STRING_SNIPPET = `function projectStatusString(s) {
            if (s === Project.Status.Active) return 'active';
            if (s === Project.Status.OnHold) return 'onHold';
            if (s === Project.Status.Done) return 'done';
            if (s === Project.Status.Dropped) return 'dropped';
            return String(s);
          }`;

/**
 * Folder.Status sibling of PROJECT_STATUS_STRING_SNIPPET (OMN-274). Folder has
 * only Active/Dropped today; String(s) fail-open surfaces anything OmniFocus
 * adds instead of the old getFolderStatus fallback silently reporting 'active'.
 */
export const FOLDER_STATUS_STRING_SNIPPET = `function folderStatusString(s) {
            if (s === Folder.Status.Active) return 'active';
            if (s === Folder.Status.Dropped) return 'dropped';
            return String(s);
          }`;

export const TASK_COUNTS_BY_PROJECT_PASS_SNIPPET = `const taskCountsByProject = {};
          flattenedTasks.forEach(t => {
            try {
              if (t.project) return;
              const proj = t.containingProject;
              if (!proj) return;
              const pid = proj.id.primaryKey;
              const counts = taskCountsByProject[pid] || (taskCountsByProject[pid] = ${TASK_COUNTS_ZERO_LITERAL});
              counts.total++;
              if (t.completed) counts.completed++;
              if (${ACTIONABLE_STATUSES_ARRAY_LITERAL}.indexOf(t.taskStatus) !== -1) counts.available++;
            } catch (e) {}
          });`;

/**
 * Emit the OmniJS predicate for the `task.available` filter field.
 *
 * Uses a membership check across ACTIONABLE_STATUSES — NOT a single === comparison
 * (the old single-status form silently excluded Overdue/DueSoon/Next tasks).
 *
 * available:true  → [...statuses].indexOf(task.taskStatus) !== -1
 * available:false → [...statuses].indexOf(task.taskStatus) === -1
 *
 * Separate from emitOmniJSStatusComparison because `dropped` and `blocked` remain
 * single-status comparisons; only `available` uses the multi-member set.
 */
function emitOmniJSAvailable(operator: ComparisonOperator, value: unknown): string {
  const matches = value as boolean;
  const wantMember = (operator === '==') === matches;
  return `${ACTIONABLE_STATUSES_ARRAY_LITERAL}.indexOf(task.taskStatus) ${wantMember ? '!==' : '==='} -1`;
}

function emitOmniJSTagStatusValid(operator: ComparisonOperator, value: unknown): string {
  const isValid = value as boolean;
  if (operator !== '==' && operator !== '!=') {
    throw new Error(`Unsupported tagStatusValid operator: ${operator}`);
  }
  const wantValid = (operator === '==') === isValid;
  if (wantValid) {
    return '(task.tags.length === 0 || task.tags.some(t => t.status === Tag.Status.Active || t.status === Tag.Status.OnHold))';
  }
  return '(task.tags.length > 0 && !task.tags.some(t => t.status === Tag.Status.Active || t.status === Tag.Status.OnHold))';
}

/**
 * OMN-114: parentTaskId filter. Compares the task's parent id, guarding against
 * a null parent before reading `.id.primaryKey` (top-level tasks have no parent).
 */
function emitOmniJSParentTaskId(operator: ComparisonOperator, value: unknown): string {
  const id = JSON.stringify(value as string);
  if (operator === '==') {
    return `(task.parent && task.parent.id.primaryKey === ${id})`;
  }
  if (operator === '!=') {
    return `(!task.parent || task.parent.id.primaryKey !== ${id})`;
  }
  throw new Error(`Unsupported parentTaskId operator: ${operator}`);
}

/**
 * OMN-167: tasks-side folder-path subtree match. `value` is the `Parent : Child`
 * path string; delegates to the shared emitFolderPathMatch over the task's containing
 * project's folder ancestry. The `containingProject ? … : null` guard means inbox
 * tasks (no project) evaluate the leaf expression to null → the walk never runs → no
 * match (Decision 3 — inbox excluded; reached via inInbox instead).
 */
function emitOmniJSFolderMatch(operator: ComparisonOperator, value: unknown): string {
  if (operator !== '==' && operator !== '!=') {
    throw new Error(`Unsupported folderMatch operator: ${operator}`);
  }
  const path = value as string;
  const match = emitFolderPathMatch('(task.containingProject ? task.containingProject.parentFolder : null)', path);
  if (operator === '==') return match;
  // `!=` must STILL exclude inbox tasks (Decision 3): a bare `!match` would let an
  // inbox task (match===false → no containing project) pass `folder != X`. Require a
  // containing project, then negate the subtree match.
  return `(task.containingProject && !${match})`;
}

/**
 * OMN-167: `folder: null` → tasks whose containing project has no parent folder
 * (top-level projects). The `containingProject &&` guard excludes inbox tasks
 * (Decision 1 — folder filtering is purely about the project→folder hierarchy).
 */
function emitOmniJSFolderTopLevel(operator: ComparisonOperator, value: unknown): string {
  if (operator !== '==' && operator !== '!=') {
    throw new Error(`Unsupported folderTopLevel operator: ${operator}`);
  }
  const wantTopLevel = (operator === '==') === (value as boolean);
  const expr = '(task.containingProject && !task.containingProject.parentFolder)';
  if (wantTopLevel) return expr;
  // Negation must STILL exclude inbox (Decision 3): a bare `!expr` would let inbox tasks
  // (expr===false → no containing project) pass. Require a containing project, then negate.
  return '(task.containingProject && !!task.containingProject.parentFolder)';
}

/**
 * Registry of synthetic fields and their emitter functions.
 * Adding a new synthetic field requires one entry here.
 */
export const SYNTHETIC_FIELD_DEFS: readonly SyntheticFieldDef[] = [
  { field: 'task.parentTaskId', omnijs: emitOmniJSParentTaskId },
  { field: 'task.dropped', omnijs: (op, val) => emitOmniJSStatusComparison(op, val, 'Task.Status.Dropped') },
  // OMN-130: task.available uses emitOmniJSAvailable (4-status membership check),
  // NOT emitOmniJSStatusComparison — that helper is single-status only.
  { field: 'task.available', omnijs: emitOmniJSAvailable },
  { field: 'task.blocked', omnijs: (op, val) => emitOmniJSStatusComparison(op, val, 'Task.Status.Blocked') },
  { field: 'task.tagStatusValid', omnijs: emitOmniJSTagStatusValid },
  // OMN-167: folder-path subtree match + top-level (folder:null) on tasks.
  { field: 'task.folderMatch', omnijs: emitOmniJSFolderMatch },
  { field: 'task.folderTopLevel', omnijs: emitOmniJSFolderTopLevel },
];

/** Lookup map for fast field-to-def resolution in emitters. */
export const SYNTHETIC_FIELD_MAP: ReadonlyMap<string, SyntheticFieldDef> = new Map(
  SYNTHETIC_FIELD_DEFS.map((def) => [def.field, def]),
);

// =============================================================================
// KNOWN FIELDS
// =============================================================================

/**
 * Valid field names for filter comparisons
 * Used by validator to catch typos
 */
export const KNOWN_FIELDS = [
  // Boolean properties
  'task.completed',
  'task.flagged',
  'task.blocked',
  'task.available',
  'task.inInbox',

  // Status properties
  'task.taskStatus', // TaskStatus enum: active, completed, dropped
  'task.dropped', // Synthetic: taskStatus === Task.Status.Dropped (computed in emitter)
  'task.tagStatusValid', // Synthetic: has active/on-hold tag or untagged (computed in emitter)
  'task.parentTaskId', // OMN-114 synthetic: task.parent.id.primaryKey === <id> (null-guarded, computed in emitter)
  'task.folderMatch', // OMN-167 synthetic: containing project's folder ancestry ⊇ path (subtree, computed in emitter)
  'task.folderTopLevel', // OMN-167 synthetic: folder:null → containing project has no parent folder (computed in emitter)

  // Date properties
  'task.dueDate',
  'task.deferDate',
  'task.plannedDate',
  'task.completionDate',
  'task.effectiveDueDate',
  'task.effectiveDeferDate',
  // OMN-48: filter by creation timestamp.
  'task.added',

  // String properties
  'task.name',
  'task.note',
  'task.id.primaryKey',

  // Relationship properties
  'task.containingProject',
  'task.project', // OMN-153: Task.project (OmniJS) — non-null ONLY for the project's root task
  'task.repetitionRule', // RepetitionRule object or null
  'taskTags', // Special: array of tag names

  // Numeric properties (OMN-49)
  'task.estimatedMinutes',
] as const;

export type KnownField = (typeof KNOWN_FIELDS)[number];

// =============================================================================
// FACTORY FUNCTIONS (for convenient AST construction)
// =============================================================================

export function and(...children: FilterNode[]): AndNode {
  return { type: 'and', children };
}

export function or(...children: FilterNode[]): OrNode {
  return { type: 'or', children };
}

export function not(child: FilterNode): NotNode {
  return { type: 'not', child };
}

export function compare(field: string, operator: ComparisonOperator, value: unknown): ComparisonNode {
  return { type: 'comparison', field, operator, value };
}

export function exists(field: string, exists: boolean = true): ExistsNode {
  return { type: 'exists', field, exists };
}

export function literal(value: boolean): LiteralNode {
  return { type: 'literal', value };
}
