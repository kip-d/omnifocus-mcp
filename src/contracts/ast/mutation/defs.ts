// src/contracts/ast/mutation/defs.ts
// Mutation lowerings: data → typed mutation-AST Program. Plus the guarded
// dispatch registry (MUTATION_DEFS) that runs the build-time sandbox guard
// BEFORE building, so a registered op can never bypass it (the OMN-119/120
// non-bypass property — batch & bulk paths previously skipped the guard).
import type { ProjectCreateData } from '../../mutations.js';
import { validateProjectCreate } from '../mutation-script-builder.js';
import {
  assignTags,
  constructProject,
  dateExpr,
  enumRef,
  guard,
  json,
  member,
  raw,
  readModifyReassign,
  ref,
  resolveFolder,
  return_,
  setProp,
  type Expr,
  type Program,
  type Stmt,
} from './types.js';

const STATUS_ENUM: Record<string, string> = {
  on_hold: 'Project.Status.OnHold',
  completed: 'Project.Status.Done',
  dropped: 'Project.Status.Dropped',
};

/**
 * Convert the schema-normalized "days between reviews" into the most natural
 * (unit, steps) pair, mirroring the original buildCreateProjectScript. Computed
 * at BUILD time so the emitted OmniJS carries plain literals.
 */
function reviewIntervalUnit(days: number): { unit: string; steps: number } {
  if (days % 365 === 0) return { unit: 'years', steps: days / 365 };
  if (days % 30 === 0) return { unit: 'months', steps: days / 30 };
  if (days % 7 === 0) return { unit: 'weeks', steps: days / 7 };
  return { unit: 'days', steps: days };
}

/**
 * Lower a project-create request into a typed mutation Program. Statement order
 * preserves the original builder's behavior (folder resolve+guard, construct,
 * scalar props, dates, status, reviewInterval, tags, return).
 */
export function buildCreateProjectProgram(data: ProjectCreateData): Program {
  // Compile-time exhaustiveness guard (ported from the deleted buildProjectDataObject):
  // forces a build error if ProjectCreateData gains a field this lowering doesn't handle,
  // so a new schema field can't be silently dropped. When this stops compiling, add the
  // field below AND emit the statement that lowers it.
  const _exhaustive: Record<keyof ProjectCreateData, true> = {
    name: true,
    note: true,
    folder: true,
    tags: true,
    dueDate: true,
    deferDate: true,
    plannedDate: true,
    flagged: true,
    sequential: true,
    status: true,
    reviewInterval: true,
  };
  void _exhaustive;

  const statements: Stmt[] = [];
  const snippetDeps: string[] = [];

  // Folder: resolve flexibly, then guard the not-found case so the project is
  // never silently filed at the database root (OMN-127 #1).
  if (data.folder) {
    statements.push(resolveFolder('targetFolder', data.folder));
    statements.push(
      guard('targetFolder === null', {
        error: json(true),
        message: json('Folder not found: ' + data.folder),
        context: json('create_project'),
      }),
    );
    snippetDeps.push('resolveFolderFlexible');
  }

  statements.push(
    constructProject(
      'proj',
      json(data.name),
      data.folder ? { kind: 'resolved', var: 'targetFolder' } : { kind: 'none' },
    ),
  );

  statements.push(setProp(ref('proj'), 'note', json(data.note || '')));
  statements.push(setProp(ref('proj'), 'flagged', json(data.flagged || false)));
  statements.push(setProp(ref('proj'), 'sequential', json(data.sequential || false)));

  for (const field of ['dueDate', 'deferDate', 'plannedDate'] as const) {
    const value = data[field];
    if (value) {
      statements.push(setProp(ref('proj'), field, dateExpr(json(value)), 'dateExpr'));
    }
  }

  // Status: only non-active is emitted, best-effort (a status failure must NOT
  // fail project creation — original swallowed errors in a separate bridge).
  if (data.status && data.status !== 'active') {
    statements.push(setProp(ref('proj'), 'status', enumRef(STATUS_ENUM[data.status]), 'enum', true));
  }

  // reviewInterval: read-modify-reassign the typed instance, best-effort.
  if (data.reviewInterval) {
    const { unit, steps } = reviewIntervalUnit(data.reviewInterval);
    statements.push(
      readModifyReassign(
        ref('proj'),
        'reviewInterval',
        [
          { prop: 'steps', value: json(steps) },
          { prop: 'unit', value: json(unit) },
        ],
        true,
      ),
    );
  }

  // Tags: create-or-find, best-effort (tag failures must NOT fail creation).
  if (data.tags && data.tags.length) {
    statements.push(assignTags(ref('proj'), json(data.tags), 'appliedTags', true));
    snippetDeps.push('resolveOrCreateTagByPath');
  }

  const envelope: Record<string, Expr> = {
    projectId: member(ref('proj'), 'id.primaryKey'),
    name: member(ref('proj'), 'name'),
    note: raw("proj.note || ''"),
    flagged: member(ref('proj'), 'flagged'),
    sequential: member(ref('proj'), 'sequential'),
    dueDate: raw('proj.dueDate ? proj.dueDate.toISOString() : null'),
    deferDate: raw('proj.deferDate ? proj.deferDate.toISOString() : null'),
    plannedDate: raw('proj.plannedDate ? proj.plannedDate.toISOString() : null'),
    folder: data.folder ? raw('targetFolder.name') : json(null),
    tags: data.tags && data.tags.length ? ref('appliedTags') : json([]),
    created: json(true),
  };
  statements.push(return_(envelope));

  return { statements, context: 'create_project', snippetDeps };
}

// =============================================================================
// GUARDED DISPATCH (OMN-119/120 non-bypass)
// =============================================================================

interface MutationDef<T> {
  guard: (data: T) => void;
  build: (data: T) => Program;
}

export const MUTATION_DEFS = {
  'create/project': {
    guard: validateProjectCreate,
    build: buildCreateProjectProgram,
  } as MutationDef<ProjectCreateData>,
} as const;

/**
 * Dispatch a registered mutation: run its build-time sandbox guard, THEN build.
 * The guard cannot be skipped for a registered op — this is the non-bypass
 * property that batch / bulk paths previously violated (OMN-119/120).
 */
// TODO(op #2): widen — data type is per-key (e.g. ProjectUpdateData), not always ProjectCreateData
export function dispatchMutation(key: keyof typeof MUTATION_DEFS, data: ProjectCreateData): Program {
  const def = MUTATION_DEFS[key] as MutationDef<ProjectCreateData>;
  def.guard(data); // build-time sandbox guard — cannot be skipped for a registered op
  return def.build(data);
}
