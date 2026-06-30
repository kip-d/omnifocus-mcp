/**
 * Basic type definitions for OmniFocus MCP
 */

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
  // record in src/contracts/ast/script-builder.ts. Other projected fields
  // (isProjectRoot, hasNote, plannedDate, repetitionRule) are still absent from
  // this interface and reach projectFields() via the `as keyof` cast; closing
  // that pre-existing gap is out of scope for OMN-207.
  sequential?: boolean;
}
