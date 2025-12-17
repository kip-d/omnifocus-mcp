/**
 * MUTATION CONTRACTS
 *
 * This is the SINGLE SOURCE OF TRUTH for mutation types and validation.
 *
 * Used by:
 * - MutationCompiler (to validate and transform input)
 * - OmniJS script generator (to generate mutation scripts)
 * - Tool wrappers (to understand what mutations were applied)
 *
 * @see docs/plans/2025-11-24-ast-filter-contracts-design.md
 */

// =============================================================================
// OPERATION TYPES
// =============================================================================

/**
 * Supported mutation operations
 */
export type MutationOperation = 'create' | 'update' | 'complete' | 'delete' | 'batch' | 'bulk_delete';

/**
 * Target entity types
 */
export type MutationTarget = 'task' | 'project';

// =============================================================================
// REPETITION RULE
// =============================================================================

/**
 * Day of week specification for BYDAY parameter
 * Can be simple (just day) or positioned (nth occurrence in month)
 *
 * Examples:
 * - { day: 'MO' } → Every Monday
 * - { day: 'FR', position: -1 } → Last Friday of month
 * - { day: 'MO', position: 2 } → Second Monday of month
 */
export interface DayOfWeek {
  day: 'SU' | 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA';
  position?: number; // -1 = last, 1 = first, 2 = second, etc.
}

/**
 * Repetition rule for recurring tasks (RFC 5545 RRULE subset supported by OmniFocus)
 *
 * ## Supported Parameters (OmniFocus 4.x)
 *
 * | Parameter | Type | Example | Description |
 * |-----------|------|---------|-------------|
 * | frequency | string | 'weekly' | FREQ - Required. MINUTELY/HOURLY/DAILY/WEEKLY/MONTHLY/YEARLY |
 * | interval | number | 2 | INTERVAL - Every Nth occurrence (default: 1) |
 * | daysOfWeek | DayOfWeek[] | [{day:'MO'},{day:'WE'}] | BYDAY - Which days |
 * | daysOfMonth | number[] | [1, 15, -1] | BYMONTHDAY - Which days of month (-1 = last) |
 * | count | number | 10 | COUNT - Stop after N occurrences |
 * | endDate | string | '2025-12-31' | UNTIL - Stop on this date |
 * | weekStart | string | 'MO' | WKST - Week start day (default: SU) |
 * | setPositions | number[] | [1, -1] | BYSETPOS - Filter to Nth occurrences |
 *
 * ## NOT Supported by OmniFocus
 * - BYMONTH (restrict to specific months) - OmniFocus explicitly rejects this
 * - BYHOUR, BYMINUTE, BYSECOND
 * - BYYEARDAY, BYWEEKNO
 *
 * ## Common Patterns (for LLM reference)
 *
 * | Natural Language | RepetitionRule |
 * |-----------------|----------------|
 * | "Every day" | { frequency: 'daily', interval: 1 } |
 * | "Every 2 weeks" | { frequency: 'weekly', interval: 2 } |
 * | "Every Monday and Wednesday" | { frequency: 'weekly', interval: 1, daysOfWeek: [{day:'MO'},{day:'WE'}] } |
 * | "On the 15th of each month" | { frequency: 'monthly', interval: 1, daysOfMonth: [15] } |
 * | "Last Friday of each month" | { frequency: 'monthly', interval: 1, daysOfWeek: [{day:'FR', position:-1}] } |
 * | "Every weekday" | { frequency: 'weekly', daysOfWeek: [{day:'MO'},{day:'TU'},{day:'WE'},{day:'TH'},{day:'FR'}] } |
 * | "1st and 15th of month" | { frequency: 'monthly', daysOfMonth: [1, 15] } |
 * | "Daily until Dec 31" | { frequency: 'daily', endDate: '2025-12-31' } |
 * | "Weekly for 10 weeks" | { frequency: 'weekly', count: 10 } |
 */
export interface RepetitionRule {
  /** Required. Recurrence frequency */
  frequency: 'minutely' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly';

  /** Every Nth occurrence. Default: 1 */
  interval: number;

  /** BYDAY - Days of week, optionally with position for monthly rules */
  daysOfWeek?: DayOfWeek[];

  /** BYMONTHDAY - Days of month (1-31, or negative from end: -1 = last day) */
  daysOfMonth?: number[];

  /** COUNT - Stop after this many occurrences */
  count?: number;

  /** UNTIL - End date in YYYY-MM-DD format */
  endDate?: string;

  /** WKST - Week start day. Default: SU (Sunday) */
  weekStart?: 'SU' | 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA';

  /** BYSETPOS - Filter to specific positions within the period (-1 = last, 1 = first) */
  setPositions?: number[];
}

// =============================================================================
// CREATE DATA
// =============================================================================

/**
 * Data for creating a new task
 */
export interface TaskCreateData {
  name: string;
  note?: string;
  project?: string | null; // null = inbox
  parentTaskId?: string; // For subtask creation
  tags?: string[];
  dueDate?: string; // YYYY-MM-DD or YYYY-MM-DD HH:mm
  deferDate?: string;
  plannedDate?: string;
  flagged?: boolean;
  estimatedMinutes?: number;
  repetitionRule?: RepetitionRule;
}

/**
 * Data for creating a new project
 */
export interface ProjectCreateData {
  name: string;
  note?: string;
  folder?: string;
  tags?: string[];
  dueDate?: string;
  deferDate?: string;
  flagged?: boolean;
  sequential?: boolean;
  status?: 'active' | 'on_hold' | 'completed' | 'dropped';
  reviewInterval?: number; // Days between reviews
}

// =============================================================================
// UPDATE DATA
// =============================================================================

/**
 * Data for updating an existing task
 */
export interface TaskUpdateData {
  name?: string;
  note?: string;
  project?: string | null; // null = move to inbox
  tags?: string[]; // Replace all tags
  addTags?: string[]; // Add to existing tags
  removeTags?: string[]; // Remove from existing tags
  dueDate?: string | null;
  deferDate?: string | null;
  plannedDate?: string | null;
  clearDueDate?: boolean;
  clearDeferDate?: boolean;
  clearPlannedDate?: boolean;
  flagged?: boolean;
  estimatedMinutes?: number;
  clearEstimatedMinutes?: boolean;
  repetitionRule?: RepetitionRule; // Set/update repetition rule
  clearRepeatRule?: boolean;
  status?: 'completed' | 'dropped';
}

/**
 * Data for updating an existing project
 */
export interface ProjectUpdateData {
  name?: string;
  note?: string;
  folder?: string | null;
  tags?: string[];
  addTags?: string[];
  removeTags?: string[];
  dueDate?: string | null;
  deferDate?: string | null;
  clearDueDate?: boolean;
  clearDeferDate?: boolean;
  flagged?: boolean;
  sequential?: boolean;
  status?: 'active' | 'on_hold' | 'completed' | 'dropped';
  reviewInterval?: number;
}

// =============================================================================
// MUTATION TYPES
// =============================================================================

/**
 * Create mutation
 */
export interface CreateMutation {
  operation: 'create';
  target: MutationTarget;
  data: TaskCreateData | ProjectCreateData;
  minimalResponse?: boolean;
}

/**
 * Update mutation
 */
export interface UpdateMutation {
  operation: 'update';
  target: MutationTarget;
  id: string;
  changes: TaskUpdateData | ProjectUpdateData;
  minimalResponse?: boolean;
}

/**
 * Complete mutation
 */
export interface CompleteMutation {
  operation: 'complete';
  target: MutationTarget;
  id: string;
  completionDate?: string; // Custom completion date
  minimalResponse?: boolean;
}

/**
 * Delete mutation
 */
export interface DeleteMutation {
  operation: 'delete';
  target: MutationTarget;
  id: string;
}

/**
 * Batch mutation
 */
export interface BatchMutation {
  operation: 'batch';
  target: MutationTarget;
  operations: Array<{
    operation: 'create' | 'update';
    target: MutationTarget;
    data?: TaskCreateData | ProjectCreateData;
    id?: string;
    changes?: TaskUpdateData | ProjectUpdateData;
    tempId?: string; // Temporary ID for parent references
    parentTempId?: string; // Reference parent by temp ID
  }>;
  createSequentially?: boolean;
  atomicOperation?: boolean;
  returnMapping?: boolean;
  stopOnError?: boolean;
}

/**
 * Bulk delete mutation
 */
export interface BulkDeleteMutation {
  operation: 'bulk_delete';
  target: MutationTarget;
  ids: string[];
}

/**
 * Union of all mutation types
 */
export type TaskMutation =
  | CreateMutation
  | UpdateMutation
  | CompleteMutation
  | DeleteMutation
  | BatchMutation
  | BulkDeleteMutation;

// =============================================================================
// MUTATION RESULT
// =============================================================================

/**
 * Result of a mutation operation
 */
export interface MutationResult {
  success: boolean;
  operation: MutationOperation;
  target: MutationTarget;
  id?: string; // ID of created/updated/deleted item
  ids?: string[]; // IDs for batch/bulk operations
  changes?: Record<string, { from: unknown; to: unknown }>;
  error?: string;
  tempIdMapping?: Record<string, string>; // For batch operations
}

// =============================================================================
// VALIDATION
// =============================================================================

/**
 * Validation error for mutations
 */
export interface MutationValidationError {
  code: 'MISSING_FIELD' | 'INVALID_VALUE' | 'CONFLICTING_FIELDS' | 'UNKNOWN_OPERATION';
  message: string;
  field?: string;
}

/**
 * Validation result
 */
export interface MutationValidationResult {
  valid: boolean;
  errors: MutationValidationError[];
}

/**
 * Validate a mutation
 */
export function validateMutation(mutation: TaskMutation): MutationValidationResult {
  const errors: MutationValidationError[] = [];

  switch (mutation.operation) {
    case 'create':
      validateCreateMutation(mutation, errors);
      break;
    case 'update':
      validateUpdateMutation(mutation, errors);
      break;
    case 'complete':
      validateCompleteMutation(mutation, errors);
      break;
    case 'delete':
      validateDeleteMutation(mutation, errors);
      break;
    case 'batch':
      validateBatchMutation(mutation, errors);
      break;
    case 'bulk_delete':
      validateBulkDeleteMutation(mutation, errors);
      break;
    default: {
      const _exhaustive: never = mutation;
      errors.push({
        code: 'UNKNOWN_OPERATION',
        message: `Unknown operation: ${String(_exhaustive)}`,
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

function validateCreateMutation(mutation: CreateMutation, errors: MutationValidationError[]): void {
  if (!mutation.data) {
    errors.push({
      code: 'MISSING_FIELD',
      message: 'Create mutation requires data',
      field: 'data',
    });
    return;
  }

  if (!mutation.data.name || mutation.data.name.trim() === '') {
    errors.push({
      code: 'MISSING_FIELD',
      message: 'Task/Project name is required',
      field: 'data.name',
    });
  }

  // Validate dates if provided
  if (mutation.data.dueDate && !isValidDateFormat(mutation.data.dueDate)) {
    errors.push({
      code: 'INVALID_VALUE',
      message: 'Invalid due date format. Use YYYY-MM-DD or YYYY-MM-DD HH:mm',
      field: 'data.dueDate',
    });
  }

  if (mutation.data.deferDate && !isValidDateFormat(mutation.data.deferDate)) {
    errors.push({
      code: 'INVALID_VALUE',
      message: 'Invalid defer date format. Use YYYY-MM-DD or YYYY-MM-DD HH:mm',
      field: 'data.deferDate',
    });
  }

  // Validate repetition rule if provided
  if ('repetitionRule' in mutation.data && mutation.data.repetitionRule) {
    validateRepetitionRule(mutation.data.repetitionRule, errors);
  }
}

function validateUpdateMutation(mutation: UpdateMutation, errors: MutationValidationError[]): void {
  if (!mutation.id) {
    errors.push({
      code: 'MISSING_FIELD',
      message: 'Update mutation requires id',
      field: 'id',
    });
  }

  if (!mutation.changes || Object.keys(mutation.changes).length === 0) {
    errors.push({
      code: 'MISSING_FIELD',
      message: 'Update mutation requires changes',
      field: 'changes',
    });
  }

  // Check for conflicting tag operations
  if (mutation.changes) {
    if (mutation.changes.tags && (mutation.changes.addTags || mutation.changes.removeTags)) {
      errors.push({
        code: 'CONFLICTING_FIELDS',
        message: 'Cannot use tags with addTags/removeTags. Use one or the other.',
        field: 'changes.tags',
      });
    }
  }

  // Validate dates if provided
  if (mutation.changes?.dueDate && typeof mutation.changes.dueDate === 'string') {
    if (!isValidDateFormat(mutation.changes.dueDate)) {
      errors.push({
        code: 'INVALID_VALUE',
        message: 'Invalid due date format',
        field: 'changes.dueDate',
      });
    }
  }
}

function validateCompleteMutation(mutation: CompleteMutation, errors: MutationValidationError[]): void {
  if (!mutation.id) {
    errors.push({
      code: 'MISSING_FIELD',
      message: 'Complete mutation requires id',
      field: 'id',
    });
  }

  if (mutation.completionDate && !isValidDateFormat(mutation.completionDate)) {
    errors.push({
      code: 'INVALID_VALUE',
      message: 'Invalid completion date format',
      field: 'completionDate',
    });
  }
}

function validateDeleteMutation(mutation: DeleteMutation, errors: MutationValidationError[]): void {
  if (!mutation.id) {
    errors.push({
      code: 'MISSING_FIELD',
      message: 'Delete mutation requires id',
      field: 'id',
    });
  }
}

function validateBatchMutation(mutation: BatchMutation, errors: MutationValidationError[]): void {
  if (!mutation.operations || mutation.operations.length === 0) {
    errors.push({
      code: 'MISSING_FIELD',
      message: 'Batch mutation requires operations',
      field: 'operations',
    });
    return;
  }

  if (mutation.operations.length > 100) {
    errors.push({
      code: 'INVALID_VALUE',
      message: 'Batch operations limited to 100 items',
      field: 'operations',
    });
  }

  // Validate each operation
  mutation.operations.forEach((op, index) => {
    if (op.operation === 'create' && (!op.data || !op.data.name)) {
      errors.push({
        code: 'MISSING_FIELD',
        message: `Batch operation ${index}: Create requires name`,
        field: `operations[${index}].data.name`,
      });
    }
    if (op.operation === 'update' && !op.id && !op.changes) {
      errors.push({
        code: 'MISSING_FIELD',
        message: `Batch operation ${index}: Update requires id and changes`,
        field: `operations[${index}]`,
      });
    }
  });
}

function validateBulkDeleteMutation(mutation: BulkDeleteMutation, errors: MutationValidationError[]): void {
  if (!mutation.ids || mutation.ids.length === 0) {
    errors.push({
      code: 'MISSING_FIELD',
      message: 'Bulk delete requires ids',
      field: 'ids',
    });
  }

  if (mutation.ids && mutation.ids.length > 100) {
    errors.push({
      code: 'INVALID_VALUE',
      message: 'Bulk delete limited to 100 items',
      field: 'ids',
    });
  }
}

const VALID_FREQUENCIES = ['minutely', 'hourly', 'daily', 'weekly', 'monthly', 'yearly'];
const VALID_DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

function validateRepetitionRule(rule: RepetitionRule, errors: MutationValidationError[]): void {
  // Validate frequency
  if (!VALID_FREQUENCIES.includes(rule.frequency)) {
    errors.push({
      code: 'INVALID_VALUE',
      message: `Invalid frequency: ${rule.frequency}. Must be one of: ${VALID_FREQUENCIES.join(', ')}`,
      field: 'repetitionRule.frequency',
    });
  }

  // Validate interval
  if (rule.interval < 1) {
    errors.push({
      code: 'INVALID_VALUE',
      message: 'Interval must be at least 1',
      field: 'repetitionRule.interval',
    });
  }

  // Validate daysOfWeek (BYDAY)
  if (rule.daysOfWeek) {
    for (const daySpec of rule.daysOfWeek) {
      if (!VALID_DAYS.includes(daySpec.day)) {
        errors.push({
          code: 'INVALID_VALUE',
          message: `Invalid day: ${daySpec.day}. Must be one of: ${VALID_DAYS.join(', ')}`,
          field: 'repetitionRule.daysOfWeek',
        });
        break;
      }
      // Validate position if provided (-5 to 5, but not 0)
      if (daySpec.position !== undefined && (daySpec.position === 0 || daySpec.position < -5 || daySpec.position > 5)) {
        errors.push({
          code: 'INVALID_VALUE',
          message: `Invalid position: ${daySpec.position}. Must be 1-5 or -1 to -5 (not 0)`,
          field: 'repetitionRule.daysOfWeek',
        });
        break;
      }
    }
  }

  // Validate daysOfMonth (BYMONTHDAY)
  if (rule.daysOfMonth) {
    for (const day of rule.daysOfMonth) {
      if (day === 0 || day < -31 || day > 31) {
        errors.push({
          code: 'INVALID_VALUE',
          message: `Invalid day of month: ${day}. Must be 1-31 or -1 to -31 (not 0)`,
          field: 'repetitionRule.daysOfMonth',
        });
        break;
      }
    }
  }

  // Validate count (COUNT)
  if (rule.count !== undefined && rule.count < 1) {
    errors.push({
      code: 'INVALID_VALUE',
      message: 'Count must be at least 1',
      field: 'repetitionRule.count',
    });
  }

  // Validate endDate (UNTIL)
  if (rule.endDate && !/^\d{4}-\d{2}-\d{2}$/.test(rule.endDate)) {
    errors.push({
      code: 'INVALID_VALUE',
      message: 'End date must be in YYYY-MM-DD format',
      field: 'repetitionRule.endDate',
    });
  }

  // Validate weekStart (WKST)
  if (rule.weekStart && !VALID_DAYS.includes(rule.weekStart)) {
    errors.push({
      code: 'INVALID_VALUE',
      message: `Invalid week start: ${rule.weekStart}. Must be one of: ${VALID_DAYS.join(', ')}`,
      field: 'repetitionRule.weekStart',
    });
  }

  // Validate setPositions (BYSETPOS)
  if (rule.setPositions) {
    for (const pos of rule.setPositions) {
      if (pos === 0 || pos < -366 || pos > 366) {
        errors.push({
          code: 'INVALID_VALUE',
          message: `Invalid set position: ${pos}. Must be 1-366 or -1 to -366 (not 0)`,
          field: 'repetitionRule.setPositions',
        });
        break;
      }
    }
  }

  // Warn about conflicting COUNT and UNTIL (both provided)
  if (rule.count !== undefined && rule.endDate) {
    errors.push({
      code: 'CONFLICTING_FIELDS',
      message: 'Cannot specify both count and endDate. Use one or the other.',
      field: 'repetitionRule',
    });
  }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Check if a string is a valid date format
 */
function isValidDateFormat(dateStr: string): boolean {
  // Accept YYYY-MM-DD or YYYY-MM-DD HH:mm
  const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;
  const dateTimePattern = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/;

  return dateOnlyPattern.test(dateStr) || dateTimePattern.test(dateStr);
}

/**
 * Known mutation property names (for validation)
 */
export const MUTATION_PROPERTY_NAMES = [
  'operation',
  'target',
  'data',
  'id',
  'changes',
  'completionDate',
  'minimalResponse',
  'operations',
  'createSequentially',
  'atomicOperation',
  'returnMapping',
  'stopOnError',
  'ids',
] as const;

/**
 * Create a type-safe mutation object
 */
export function createMutation<T extends TaskMutation>(mutation: T): T {
  return mutation;
}
