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
 * Each entry declares how to emit for OmniJS (required) and JXA (null = generic path).
 */
export interface SyntheticFieldDef {
  readonly field: string;
  readonly omnijs: SyntheticFieldEmitter;
  readonly jxa: SyntheticFieldEmitter | null;
}

function emitOmniJSStatusComparison(operator: ComparisonOperator, value: unknown, statusEnum: string): string {
  const matches = value as boolean;
  const shouldEqual = (operator === '==') === matches;
  return `task.taskStatus ${shouldEqual ? '===' : '!=='} ${statusEnum}`;
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
 * Registry of synthetic fields and their emitter functions.
 * Adding a new synthetic field requires one entry here.
 */
export const SYNTHETIC_FIELD_DEFS: readonly SyntheticFieldDef[] = [
  { field: 'task.dropped', omnijs: (op, val) => emitOmniJSStatusComparison(op, val, 'Task.Status.Dropped'), jxa: null },
  {
    field: 'task.available',
    omnijs: (op, val) => emitOmniJSStatusComparison(op, val, 'Task.Status.Available'),
    jxa: null,
  },
  { field: 'task.blocked', omnijs: (op, val) => emitOmniJSStatusComparison(op, val, 'Task.Status.Blocked'), jxa: null },
  { field: 'task.tagStatusValid', omnijs: emitOmniJSTagStatusValid, jxa: null },
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

  // Date properties
  'task.dueDate',
  'task.deferDate',
  'task.plannedDate',
  'task.effectiveDueDate',
  'task.effectiveDeferDate',

  // String properties
  'task.name',
  'task.note',
  'task.id.primaryKey',

  // Relationship properties
  'task.containingProject',
  'task.repetitionRule', // RepetitionRule object or null
  'taskTags', // Special: array of tag names
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
