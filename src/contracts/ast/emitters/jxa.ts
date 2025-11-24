/**
 * JXA Emitter - Transforms FilterAST to JXA JavaScript code
 *
 * Generates JavaScript code that can be embedded in JXA scripts to filter tasks.
 * The generated code assumes a `task` variable is in scope.
 *
 * @see docs/plans/2025-11-24-ast-filter-contracts-design.md
 */

import type { FilterNode, ComparisonNode, ExistsNode, ComparisonOperator } from '../types.js';

/**
 * Emit JXA JavaScript code from a FilterAST
 *
 * @param ast - The FilterNode to emit
 * @returns JavaScript code string
 */
export function emitJXA(ast: FilterNode): string {
  return emitNode(ast);
}

function emitNode(node: FilterNode): string {
  switch (node.type) {
    case 'literal':
      return String(node.value);

    case 'comparison':
      return emitComparison(node);

    case 'exists':
      return emitExists(node);

    case 'and':
      if (node.children.length === 0) return 'true';
      return `(${node.children.map(emitNode).join(' && ')})`;

    case 'or':
      if (node.children.length === 0) return 'false';
      return `(${node.children.map(emitNode).join(' || ')})`;

    case 'not':
      return `!(${emitNode(node.child)})`;

    default:
      throw new Error(`Unknown node type: ${(node as FilterNode).type}`);
  }
}

function emitComparison(node: ComparisonNode): string {
  const { field, operator, value } = node;

  // Special handling for taskTags (array operations)
  if (field === 'taskTags') {
    return emitTagComparison(operator, value as string[]);
  }

  // Special handling for project ID
  if (field === 'task.containingProject') {
    return emitProjectComparison(operator, value as string);
  }

  // Get the field accessor
  const accessor = getFieldAccessor(field);

  // Handle different operators
  switch (operator) {
    case '==':
      return `${accessor} === ${emitValue(value)}`;

    case '!=':
      return `${accessor} !== ${emitValue(value)}`;

    case '<':
    case '>':
    case '<=':
    case '>=':
      return emitDateComparison(accessor, operator, value as string);

    case 'includes':
      return `${accessor}.toLowerCase().includes(${emitValue(value)}.toLowerCase())`;

    case 'matches':
      return `/${String(value)}/i.test(${accessor})`;

    case 'some':
    case 'every':
      // Generic array operators (shouldn't reach here for taskTags)
      return `${accessor}.${operator}(v => ${emitValue(value)}.includes(v))`;

    default:
      throw new Error(`Unknown operator: ${String(operator)}`);
  }
}

function emitTagComparison(operator: ComparisonOperator, tags: string[]): string {
  const tagArray = JSON.stringify(tags);

  switch (operator) {
    case 'some':
      // At least one tag matches
      return `taskTags.some(t => ${tagArray}.includes(t))`;

    case 'every':
      // All specified tags must be present
      return `${tagArray}.every(t => taskTags.includes(t))`;

    default:
      throw new Error(`Unsupported tag operator: ${operator}`);
  }
}

function emitProjectComparison(operator: ComparisonOperator, projectId: string): string {
  // Project can be null, so we need null-safe access
  const accessor = 'task.containingProject()';

  switch (operator) {
    case '==':
      return `(${accessor} && ${accessor}.id().primaryKey() === ${emitValue(projectId)})`;
    case '!=':
      return `(!${accessor} || ${accessor}.id().primaryKey() !== ${emitValue(projectId)})`;
    default:
      throw new Error(`Unsupported project operator: ${operator}`);
  }
}

function emitDateComparison(accessor: string, operator: string, dateStr: string): string {
  // Parse date and create Date object comparison
  return `${accessor} ${operator} new Date("${dateStr}")`;
}

function emitExists(node: ExistsNode): string {
  const accessor = getFieldAccessor(node.field);

  if (node.exists) {
    return `${accessor} !== null`;
  } else {
    return `${accessor} === null`;
  }
}

function getFieldAccessor(field: string): string {
  // Handle nested field access like task.id.primaryKey
  const parts = field.split('.');

  if (parts[0] === 'task') {
    // Convert dot notation to JXA method calls
    // task.completed -> task.completed()
    // task.id.primaryKey -> task.id().primaryKey()
    return parts.slice(1).reduce((acc, part) => {
      if (acc === '') {
        return `task.${part}()`;
      }
      return `${acc}.${part}()`;
    }, '');
  }

  // Non-task fields (like taskTags)
  return field;
}

function emitValue(value: unknown): string {
  if (typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'boolean' || typeof value === 'number') {
    return String(value);
  }
  if (value === null) {
    return 'null';
  }
  if (Array.isArray(value)) {
    return JSON.stringify(value);
  }
  throw new Error(`Unsupported value type: ${typeof value}`);
}
