/**
 * RESPONSE STRUCTURE CONTRACTS
 *
 * These types define the EXACT structure that:
 * - OmniJS scripts return
 * - Tool wrappers expect to receive
 * - MCP responses contain
 *
 * This eliminates the "double-unwrap" class of bugs where we had:
 * - Script returns: { data: { tasks: [...] } }
 * - Wrapper expects: { tasks: [...] }
 * - Result: undefined.map() errors
 *
 * The double-unwrap saga affected 4+ tools before being identified as a pattern.
 */

// =============================================================================
// SCRIPT OUTPUT CONTRACTS
// =============================================================================

/**
 * What an OmniJS script returns (raw JSON string parsed)
 *
 * Scripts should return this structure directly.
 * The tool wrapper should NOT wrap it again.
 */
export interface ScriptOutput<T> {
  /** The actual data */
  data?: T;

  /** Error information if script failed */
  error?: boolean;
  message?: string;
  stack?: string;

  /** Script-level metadata */
  metadata?: {
    collection?: string;
    mode?: string;
    count?: number;
    query_time_ms?: number;
  };
}

/**
 * Task list script output
 */
export interface TaskListScriptOutput {
  tasks: TaskData[];
  count: number;
  collection?: string;
  mode?: string;
}

/**
 * Project list script output
 */
export interface ProjectListScriptOutput {
  projects: ProjectData[];
  count: number;
}

/**
 * Single task operation output (create, update, complete, delete)
 */
export interface TaskOperationScriptOutput {
  id: string;
  name: string;
  success?: boolean;
  created?: boolean;
  updated?: boolean;
  completed?: boolean;
  deleted?: boolean;
}

// =============================================================================
// DATA STRUCTURES
// =============================================================================

/**
 * Task data as returned by scripts
 */
export interface TaskData {
  id: string;
  name: string;
  completed: boolean;
  flagged: boolean;
  inInbox: boolean;
  blocked?: boolean;
  available?: boolean;
  taskStatus?: string;
  dueDate: string | null;
  deferDate?: string | null;
  plannedDate?: string | null;
  added?: string | null;
  modified?: string | null;
  completionDate?: string | null;
  tags: string[];
  note?: string;
  estimatedMinutes?: number | null;
  project: string | null;
  projectId: string | null;
  parentTaskId?: string;
  parentTaskName?: string;
  repetitionRule?: RepetitionRuleData | null;
}

/**
 * Project data as returned by scripts
 */
export interface ProjectData {
  id: string;
  name: string;
  status: 'active' | 'done' | 'onHold' | 'dropped';
  folder?: string | null;
  taskCount?: number;
  flagged?: boolean;
  dueDate?: string | null;
  deferDate?: string | null;
  completionDate?: string | null;
  note?: string;
  sequential?: boolean;
  reviewInterval?: number | null;
  lastReviewed?: string | null;
}

/**
 * Repetition rule data
 */
export interface RepetitionRuleData {
  recurrence?: string | null;
  repetitionMethod?: string | null;
  ruleString?: string | null;
}

// =============================================================================
// MCP RESPONSE CONTRACTS
// =============================================================================

/**
 * Standard MCP tool response structure
 *
 * This is what the tool wrapper returns to MCP.
 * It wraps the script output with additional metadata.
 */
export interface MCPToolResponse<T> {
  success: boolean;

  /** Summary for quick LLM consumption */
  summary?: {
    total_count: number;
    returned_count: number;
    breakdown?: Record<string, number>;
    key_insights?: string[];
    preview?: unknown[];
  };

  /** The actual data */
  data?: T;

  /** Error information */
  error?: {
    code: string;
    message: string;
    details?: unknown;
    suggestion?: string;
  };

  /** Response metadata */
  metadata?: {
    operation: string;
    timestamp: string;
    from_cache: boolean;
    query_time_ms?: number;
    total_count?: number;
    returned_count?: number;
    filters_applied?: Record<string, unknown>;
    [key: string]: unknown;
  };
}

// =============================================================================
// TYPE GUARDS
// =============================================================================

/**
 * Check if a value is a script error response
 */
export function isScriptError(value: unknown): value is { error: true; message: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'error' in value &&
    (value as Record<string, unknown>).error === true
  );
}

/**
 * Check if a value is a task list response
 */
export function isTaskListOutput(value: unknown): value is TaskListScriptOutput {
  return (
    typeof value === 'object' &&
    value !== null &&
    'tasks' in value &&
    Array.isArray((value as Record<string, unknown>).tasks)
  );
}

/**
 * Check if a value is a project list response
 */
export function isProjectListOutput(value: unknown): value is ProjectListScriptOutput {
  return (
    typeof value === 'object' &&
    value !== null &&
    'projects' in value &&
    Array.isArray((value as Record<string, unknown>).projects)
  );
}

// =============================================================================
// RESPONSE BUILDERS
// =============================================================================

/**
 * Build a success response with proper structure
 *
 * Use this instead of manually constructing responses to ensure consistency.
 */
export function buildSuccessResponse<T>(
  operation: string,
  data: T,
  metadata: Partial<MCPToolResponse<T>['metadata']> = {}
): MCPToolResponse<T> {
  return {
    success: true,
    data,
    metadata: {
      operation,
      timestamp: new Date().toISOString(),
      from_cache: false,
      ...metadata,
    },
  };
}

/**
 * Build an error response with proper structure
 */
export function buildErrorResponse(
  operation: string,
  code: string,
  message: string,
  details?: unknown
): MCPToolResponse<never> {
  return {
    success: false,
    error: {
      code,
      message,
      details,
    },
    metadata: {
      operation,
      timestamp: new Date().toISOString(),
      from_cache: false,
    },
  };
}

// =============================================================================
// UNWRAP HELPERS
// =============================================================================

/**
 * Safely unwrap script output, handling the various wrapper levels
 *
 * This is the FIX for the double-unwrap bugs. Instead of manually unwrapping
 * in each tool, use this helper which understands all the wrapper formats.
 */
export function unwrapScriptOutput<T>(
  raw: unknown,
  expectedShape: 'tasks' | 'projects' | 'task' | 'project'
): T | null {
  if (raw === null || raw === undefined) {
    return null;
  }

  // If it's a string, parse it first
  let parsed = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return null;
  }

  const obj = parsed as Record<string, unknown>;

  // Check for error
  if (obj.error === true) {
    return null;
  }

  // Try to find the data at various nesting levels
  // This handles: { tasks: [...] }, { data: { tasks: [...] } }, { data: { data: { tasks: [...] } } }
  const accessors: Array<(o: Record<string, unknown>) => unknown> = [
    (o) => o[expectedShape],                                    // { tasks: [...] }
    (o) => (o.data as Record<string, unknown>)?.[expectedShape], // { data: { tasks: [...] } }
    (o) => ((o.data as Record<string, unknown>)?.data as Record<string, unknown>)?.[expectedShape], // double-wrapped
  ];

  for (const accessor of accessors) {
    const result = accessor(obj);
    if (result !== undefined) {
      return result as T;
    }
  }

  // For single items, check if the object itself is the item
  if (expectedShape === 'task' && 'id' in obj && 'name' in obj) {
    return obj as T;
  }

  return null;
}
