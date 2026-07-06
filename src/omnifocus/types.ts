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
  plannedDate?: string; // OMN-62: OF 4.7+ planned date, ISO string
  repetitionRule?: RepetitionRuleData; // modern (v4.7+) repetition rule shape, null when task has none
  // Mode-injected fields: not selectable via TaskFieldEnum's `fields:[...]` (so
  // they never reach the `as keyof` cast), but auto-added to the script
  // projection for specific query modes and passed through unprojected when no
  // explicit `fields` selection is made — so they can legitimately appear on a
  // task row returned to callers.
  effectivePlannedDate?: string; // details:true — OF 4.7+ effective planned date, ISO string
  reason?: 'overdue' | 'due_soon' | 'flagged' | null; // today mode — category the task was bucketed under
  daysOverdue?: number; // today mode — 0 when not overdue
}
