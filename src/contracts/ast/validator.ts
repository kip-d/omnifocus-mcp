/**
 * AST Validator - Validates FilterAST for correctness
 *
 * Checks:
 * - Known fields only (catches typos)
 * - No contradictions (e.g., completed: true AND completed: false)
 * - No tautologies (always-true conditions)
 * - Type correctness
 *
 * @see docs/plans/2025-11-24-ast-filter-contracts-design.md
 */

import type { FilterNode, ComparisonNode, ExistsNode, AndNode, OrNode } from './types.js';
import { KNOWN_FIELDS } from './types.js';

// =============================================================================
// VALIDATION RESULT TYPES
// =============================================================================

export interface ValidationError {
  code: 'UNKNOWN_FIELD' | 'CONTRADICTION' | 'TYPE_MISMATCH' | 'INVALID_NODE';
  message: string;
  path?: string;
}

export interface ValidationWarning {
  code: 'TAUTOLOGY' | 'EMPTY_NODE' | 'REDUNDANT';
  message: string;
  path?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

// =============================================================================
// FIELD TYPE DEFINITIONS
// =============================================================================

/**
 * Expected types for known fields
 */
const FIELD_TYPES: Record<string, 'boolean' | 'string' | 'date' | 'array'> = {
  'task.completed': 'boolean',
  'task.flagged': 'boolean',
  'task.blocked': 'boolean',
  'task.available': 'boolean',
  'task.effectiveInInbox': 'boolean',
  'task.dueDate': 'date',
  'task.deferDate': 'date',
  'task.effectiveDueDate': 'date',
  'task.effectiveDeferDate': 'date',
  'task.name': 'string',
  'task.note': 'string',
  'task.id.primaryKey': 'string',
  'task.containingProject': 'string',
  taskTags: 'array',
};

// =============================================================================
// MAIN VALIDATOR
// =============================================================================

/**
 * Validate a FilterAST for correctness
 */
export function validateFilterAST(ast: FilterNode): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  validateNode(ast, errors, warnings, 'root');
  detectContradictions(ast, errors);
  detectTautologies(ast, warnings);

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// =============================================================================
// NODE VALIDATION
// =============================================================================

function validateNode(node: FilterNode, errors: ValidationError[], warnings: ValidationWarning[], path: string): void {
  switch (node.type) {
    case 'literal':
      // Always valid
      break;

    case 'comparison':
      validateComparisonNode(node, errors, path);
      break;

    case 'exists':
      validateExistsNode(node, errors, path);
      break;

    case 'and':
    case 'or':
      validateLogicalNode(node, errors, warnings, path);
      break;

    case 'not':
      validateNode(node.child, errors, warnings, `${path}.child`);
      break;

    default:
      errors.push({
        code: 'INVALID_NODE',
        message: `Unknown node type: ${(node as FilterNode).type}`,
        path,
      });
  }
}

function validateComparisonNode(node: ComparisonNode, errors: ValidationError[], path: string): void {
  // Check field is known
  if (!isKnownField(node.field)) {
    errors.push({
      code: 'UNKNOWN_FIELD',
      message: `Unknown field: '${node.field}'. Did you mean one of: ${suggestField(node.field)}?`,
      path,
    });
    return; // Skip type checking if field is unknown
  }

  // Check type matches
  const expectedType = FIELD_TYPES[node.field];
  if (expectedType && !isTypeCompatible(node.value, expectedType, node.operator)) {
    errors.push({
      code: 'TYPE_MISMATCH',
      message: `Field '${node.field}' expects ${expectedType}, got ${typeof node.value}`,
      path,
    });
  }
}

function validateExistsNode(node: ExistsNode, errors: ValidationError[], path: string): void {
  if (!isKnownField(node.field)) {
    errors.push({
      code: 'UNKNOWN_FIELD',
      message: `Unknown field: '${node.field}'`,
      path,
    });
  }
}

function validateLogicalNode(
  node: AndNode | OrNode,
  errors: ValidationError[],
  warnings: ValidationWarning[],
  path: string,
): void {
  if (node.children.length === 0) {
    warnings.push({
      code: 'EMPTY_NODE',
      message: `Empty ${node.type.toUpperCase()} node`,
      path,
    });
  }

  node.children.forEach((child, index) => {
    validateNode(child, errors, warnings, `${path}.children[${index}]`);
  });
}

// =============================================================================
// CONTRADICTION DETECTION
// =============================================================================

/**
 * Detect contradictions like: completed: true AND completed: false
 */
function detectContradictions(ast: FilterNode, errors: ValidationError[]): void {
  if (ast.type !== 'and') return;

  const comparisons = collectComparisons(ast);
  const fieldValues = new Map<string, unknown[]>();

  for (const comp of comparisons) {
    if (comp.operator === '==') {
      const key = comp.field;
      const values = fieldValues.get(key) || [];
      values.push(comp.value);
      fieldValues.set(key, values);
    }
  }

  for (const [field, values] of fieldValues) {
    if (values.length > 1 && hasContradiction(values)) {
      errors.push({
        code: 'CONTRADICTION',
        message: `Contradictory conditions on field '${field}': ${values.join(' AND ')}`,
      });
    }
  }
}

function hasContradiction(values: unknown[]): boolean {
  // For booleans, true AND false is a contradiction
  if (values.includes(true) && values.includes(false)) {
    return true;
  }
  // For other types, different values in AND is a contradiction
  const uniqueValues = new Set(values.map((v) => JSON.stringify(v)));
  return uniqueValues.size > 1;
}

function collectComparisons(node: FilterNode): ComparisonNode[] {
  const result: ComparisonNode[] = [];

  function collect(n: FilterNode): void {
    switch (n.type) {
      case 'comparison':
        result.push(n);
        break;
      case 'and':
      case 'or':
        n.children.forEach(collect);
        break;
      case 'not':
        collect(n.child);
        break;
    }
  }

  collect(node);
  return result;
}

// =============================================================================
// TAUTOLOGY DETECTION
// =============================================================================

/**
 * Detect tautologies like: completed: true OR completed: false
 */
function detectTautologies(ast: FilterNode, warnings: ValidationWarning[]): void {
  if (ast.type !== 'or') return;

  const comparisons = ast.children.filter((c): c is ComparisonNode => c.type === 'comparison' && c.operator === '==');

  const fieldValues = new Map<string, unknown[]>();

  for (const comp of comparisons) {
    const key = comp.field;
    const values = fieldValues.get(key) || [];
    values.push(comp.value);
    fieldValues.set(key, values);
  }

  for (const [field, values] of fieldValues) {
    // For boolean fields, true OR false is a tautology
    if (values.includes(true) && values.includes(false)) {
      warnings.push({
        code: 'TAUTOLOGY',
        message: `Tautology: '${field}' is both true OR false (always matches)`,
      });
    }
  }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function isKnownField(field: string): boolean {
  return (KNOWN_FIELDS as readonly string[]).includes(field);
}

function isTypeCompatible(
  value: unknown,
  expectedType: 'boolean' | 'string' | 'date' | 'array',
  operator: string,
): boolean {
  switch (expectedType) {
    case 'boolean':
      return typeof value === 'boolean';
    case 'string':
      return typeof value === 'string';
    case 'date':
      return typeof value === 'string'; // Dates represented as ISO strings
    case 'array':
      // For array fields, the value should be an array (for some/every)
      // or could be checked with includes
      return Array.isArray(value) || ['some', 'every'].includes(operator);
    default:
      return true;
  }
}

function suggestField(typo: string): string {
  // Simple Levenshtein-like suggestion
  const suggestions = KNOWN_FIELDS.filter((field) => {
    // Check if typo is similar to field
    const normalizedTypo = typo.toLowerCase();
    const normalizedField = field.toLowerCase();
    return (
      normalizedField.includes(normalizedTypo.slice(5)) || // After 'task.'
      normalizedTypo.includes(normalizedField.slice(5))
    );
  });

  if (suggestions.length > 0) {
    return suggestions.slice(0, 3).join(', ');
  }
  return KNOWN_FIELDS.slice(0, 3).join(', ') + '...';
}
