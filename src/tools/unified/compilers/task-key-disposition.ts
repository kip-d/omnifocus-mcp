import type { FlatFilterValue } from '../schemas/read-schema.js';

type TaskInputKey = keyof FlatFilterValue | 'AND' | 'OR' | 'NOT';
// Tasks-local union — the projects one is 'map' | 'merge' | 'reject' (transform-project-filters.ts);
// deliberately NOT shared (design spec §3.1).
type Disposition = 'map' | 'compose' | 'reject';

/**
 * OMN-162 (OMN-156 pattern): every input-schema filter key has an explicit
 * TASKS-side disposition. `satisfies` makes a NEW schema field a compile error
 * here until someone decides its tasks behavior — silent inert keys are
 * structurally impossible. 'compose' = structural operator handled by
 * transformFilters (skipped by key enforcement — enforcement rejects on
 * disposition === 'reject' ONLY).
 */
export const TASK_KEY_DISPOSITION = {
  id: 'map',
  status: 'map', // value-level exception: 'on_hold' rejects in transformStatus (OMN-166)
  completed: 'map',
  tags: 'map',
  project: 'map',
  projectId: 'map',
  parentTaskId: 'map',
  dueDate: 'map',
  deferDate: 'map',
  plannedDate: 'map',
  completionDate: 'map',
  added: 'map',
  flagged: 'map',
  blocked: 'map',
  available: 'map',
  inInbox: 'map',
  text: 'map',
  estimatedMinutes: 'map',
  name: 'map',
  folder: 'reject', // OMN-162: inert on tasks — was silent match-all. Capability work: OMN-167.
  AND: 'compose',
  OR: 'compose',
  NOT: 'compose',
} as const satisfies Record<TaskInputKey, Disposition>;

export const FOLDER_TASKS_REJECTION =
  'filters.folder is not supported on tasks or export queries — it previously matched nothing and silently returned all tasks. ' +
  'To get tasks in a folder: query projects with filters.folder first, then query tasks by projectId. ' +
  'folder remains supported on projects queries.';

export const ON_HOLD_TASKS_REJECTION =
  "status:'on_hold' is not supported on tasks or export queries — on-hold is a project status. " +
  "Query projects with status:'on_hold' first, then tasks by projectId. " +
  '(Tasks whose project is on hold also match available:false.)';

// OMN-172 (S4): a terminal status inside an OR branch is unsatisfiable because
// tasks queries exclude that terminal state at the base by default and an OR
// branch cannot re-include it (the base AND-composes over the OR node). Worded
// in compiled terms: at the check site status:'dropped' has already collapsed
// to dropped:true (see the S4 design §3.3).
export const terminalBranchRejection = (branchIndex: number, state: 'dropped' | 'completed'): string =>
  `OR[${branchIndex}] requires ${state} tasks (status:'${state}' / ${state}:true), but tasks queries exclude ` +
  `${state} tasks by default and an OR branch cannot re-include them. To include ${state} tasks, set ` +
  `status:'${state}' (or ${state}:true) at the top level of filters instead of inside an OR branch, or remove the branch.`;
