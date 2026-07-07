/**
 * Shared node:vm sandbox fixture for executing generated OmniJS in unit tests.
 *
 * Single source of truth for the Task.Status stub, the stub-task shape, and
 * the script runners. Before this existed, four hand-rolled copies lived in
 * the AST test files and had already drifted from the real API (one declared
 * a non-existent `Task.Status.Active`; two omitted `Completed`) — exactly the
 * staleness an "agreement pin" must not inherit. Extend HERE, not per-file.
 */

import * as vm from 'node:vm';

/**
 * The real OmniFocus Task.Status members, verbatim. Generated scripts reference
 * these via property access (`Task.Status.Dropped`); the values are opaque
 * tokens — only identity between a stub task's `taskStatus` and the enum
 * member matters to the predicates.
 */
export const Task = {
  Status: {
    Available: 'Available',
    Blocked: 'Blocked',
    Completed: 'Completed',
    Dropped: 'Dropped',
    DueSoon: 'DueSoon',
    Next: 'Next',
    Overdue: 'Overdue',
  },
} as const;

export type StatusName = keyof typeof Task.Status;

export interface StubTask {
  id: { primaryKey: string };
  name: string;
  flagged: boolean;
  completed: boolean;
  taskStatus: string;
  inInbox: boolean;
  tags: unknown[];
  dueDate: null;
  deferDate: null;
  containingProject: null;
  note: string | null;
  /** non-null marks the row as a project root (OMN-153: `task.project !== null`). */
  project: null | { name: string };
}

export function stubTask(name: string, overrides: Partial<StubTask> = {}): StubTask {
  return {
    id: { primaryKey: `id-${name}` },
    name,
    flagged: false,
    completed: false,
    taskStatus: Task.Status.Available,
    inInbox: false,
    tags: [],
    dueDate: null,
    deferDate: null,
    containingProject: null,
    note: null,
    project: null,
    ...overrides,
  };
}

function makeSandbox(tasks: StubTask[]): Record<string, unknown> {
  return {
    flattenedTasks: tasks,
    // The OmniJS `inbox` global is the pre-filtered inbox collection.
    inbox: tasks.filter((t) => t.inInbox),
    Task,
    JSON,
    Date,
  };
}

export interface ListScriptResult {
  tasks: Array<Record<string, unknown>>;
  count: number;
  total_matched: number;
}

/** Run a generated LIST/INBOX script (raw OmniJS IIFE) against stub collections. */
export function runListScript(script: string, tasks: StubTask[]): ListScriptResult {
  return JSON.parse(vm.runInNewContext(script, makeSandbox(tasks)) as string) as ListScriptResult;
}

/**
 * Run a generated COUNT script. Unlike the list script, count is JXA-wrapped:
 * `Application('OmniFocus').evaluateJavascript(<omnijs source>)`. The stub
 * routes evaluateJavascript back into the same sandbox, so the test exercises
 * the real bridge shape rather than fishing the inner source out with a regex.
 */
export function runCountScript(
  script: string,
  tasks: StubTask[],
): { count: number; error?: boolean; message?: string } {
  const sandbox = makeSandbox(tasks);
  const context = vm.createContext(sandbox);
  sandbox.Application = () => ({
    evaluateJavascript: (src: string) => vm.runInContext(src, context),
  });
  return JSON.parse(vm.runInContext(script, context) as string) as {
    count: number;
    error?: boolean;
    message?: string;
  };
}
