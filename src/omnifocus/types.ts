/**
 * Basic type definitions for OmniFocus MCP
 */

import type { RepetitionRuleData } from '../contracts/responses.js';

// Basic OmniFocus entity types
export interface OmniFocusTask {
  id: string;
  name: string;
  completed: boolean;
  flagged: boolean;
  blocked: boolean;
  available?: boolean;
  estimatedMinutes?: number;
  dueDate?: string;
  deferDate?: string;
  completionDate?: string;
  added?: string;
  modified?: string;
  dropDate?: string;
  note?: string;
  projectId?: string;
  project?: string;
  tags?: string[];
  parentTaskId?: string;
  parentTaskName?: string;
  inInbox?: boolean;
  // OMN-207: read-side parity with the write side. Reported as the raw stored
  // property on every task (not conditional on children) — see the decision
  // record in src/contracts/ast/script-builder.ts.
  sequential?: boolean;
  // OMN-222: remaining fields projectFields() can emit via the `field as keyof
  // OmniFocusTask` cast in task-query-pipeline.ts. Types verified against the
  // projection cases in src/contracts/ast/script-builder.ts.
  isProjectRoot?: boolean; // OMN-153: true when task.project !== null (task IS a project root)
  hasNote?: boolean; // OMN-130: cheap presence marker, true when the task has non-empty note text
  noteTruncated?: boolean; // OMN-244: present (true) only when the returned note was truncated
  plannedDate?: string | null; // OMN-62: OF 4.7+ planned date, ISO string, null when task has none
  repetitionRule?: RepetitionRuleData | null; // modern (v4.7+) repetition rule shape, null when task has none
  // Mode-injected fields: not selectable via TaskFieldEnum's `fields:[...]` (so
  // they never reach the `as keyof` cast), but auto-added to the script
  // projection for specific query modes and passed through unprojected when no
  // explicit `fields` selection is made — so they can legitimately appear on a
  // task row returned to callers.
  effectivePlannedDate?: string | null; // details:true — OF 4.7+ effective planned date, ISO string, null when task has none
  reason?: 'overdue' | 'due_soon' | 'flagged' | null; // today mode — category the task was bucketed under
  daysOverdue?: number; // today mode — 0 when not overdue
  // smart_suggest mode (OMN-259) — which mechanical screen signals selected
  // this task (e.g. 'overdue_5d', 'due_today', 'flagged', 'available',
  // 'quick_win'). Evidence for the caller's own re-ranking, not a priority
  // verdict; carried through explicit field projection like noteTruncated.
  screen_reasons?: string[];
}

/**
 * OMN-241: honest type for the output of `projectFields()` in
 * task-query-pipeline.ts. A projected task is a partial slice of
 * OmniFocusTask — only `id` plus the caller-selected fields are
 * guaranteed present. Previously projectFields() built this same
 * shape (Partial<OmniFocusTask> & {id}) but cast it `as OmniFocusTask`,
 * lying to the type system: downstream code could read any field as if
 * it were always populated, with no compile-time signal that most
 * fields are conditionally absent. Consumers that need specific fields
 * beyond `id` must narrow (e.g. `if (task.name) ...`) or accept
 * ProjectedTask and only touch fields they've checked.
 */
export type ProjectedTask = Partial<OmniFocusTask> & Pick<OmniFocusTask, 'id'>;
