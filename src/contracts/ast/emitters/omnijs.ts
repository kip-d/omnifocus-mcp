/**
 * OmniJS Emitter - Transforms FilterAST to OmniJS JavaScript code
 *
 * Generates JavaScript code that can be embedded in OmniJS scripts to filter tasks.
 * OmniJS uses direct property access (task.completed) instead of JXA-style method calls (task.completed()).
 *
 * @see docs/plans/2025-11-24-ast-filter-contracts-design.md
 */

import type { FilterNode, ComparisonNode, ExistsNode, ComparisonOperator } from '../types.js';

/**
 * Emit OmniJS JavaScript code from a FilterAST
 *
 * @param ast - The FilterNode to emit
 * @returns JavaScript code string
 */
export function emitOmniJS(ast: FilterNode): string {
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

  // Synthetic status fields: OmniFocus uses taskStatus enum, not boolean properties
  if (field === 'task.dropped') {
    return emitStatusComparison(operator, value as boolean, 'Task.Status.Dropped');
  }

  if (field === 'task.available') {
    return emitStatusComparison(operator, value as boolean, 'Task.Status.Available');
  }

  if (field === 'task.blocked') {
    return emitStatusComparison(operator, value as boolean, 'Task.Status.Blocked');
  }

  // Special handling for 'tagStatusValid' synthetic field
  // Matches OmniFocus perspective: "Has a tag that is active or on hold" OR "Untagged"
  if (field === 'task.tagStatusValid') {
    return emitTagStatusValidComparison(operator, value as boolean);
  }

  // Get the field accessor (OmniJS uses direct property access)
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

function emitProjectComparison(operator: ComparisonOperator, projectValue: string): string {
  const accessor = 'task.containingProject';

  // Determine if value looks like an ID (alphanumeric with possible - or _, length > 10)
  // or a project name (anything else)
  const isLikelyId = /^[a-zA-Z0-9_-]+$/.test(projectValue) && projectValue.length > 10;
  const prop = isLikelyId ? 'id.primaryKey' : 'name';
  const val = emitValue(projectValue);

  switch (operator) {
    case '==':
      return `(${accessor} && ${accessor}.${prop} === ${val})`;
    case '!=':
      return `(!${accessor} || ${accessor}.${prop} !== ${val})`;
    default:
      throw new Error(`Unsupported project operator: ${operator}`);
  }
}

/**
 * Emit a taskStatus enum comparison for synthetic boolean fields (dropped, available, blocked).
 *
 * OmniFocus uses Task.Status enum values (Available, Completed, Dropped, Blocked, etc.)
 * rather than boolean properties. The AST uses synthetic boolean fields that this function
 * converts to the appropriate enum comparison.
 */
function emitStatusComparison(operator: ComparisonOperator, matches: boolean, statusEnum: string): string {
  // XOR: '==' + true means ===, '==' + false means !==, '!=' inverts
  const shouldEqual = (operator === '==') === matches;
  return `task.taskStatus ${shouldEqual ? '===' : '!=='} ${statusEnum}`;
}

function emitTagStatusValidComparison(operator: ComparisonOperator, isValid: boolean): string {
  // OmniFocus perspective rule: task must have an active/on-hold tag, or have no tags at all.
  // This excludes tasks whose ONLY tags are dropped/inactive.
  if (operator !== '==' && operator !== '!=') {
    throw new Error(`Unsupported tagStatusValid operator: ${operator}`);
  }

  const wantValid = (operator === '==') === isValid;
  if (wantValid) {
    return '(task.tags.length === 0 || task.tags.some(t => t.status === Tag.Status.Active || t.status === Tag.Status.OnHold))';
  }
  return '(task.tags.length > 0 && !task.tags.some(t => t.status === Tag.Status.Active || t.status === Tag.Status.OnHold))';
}

function emitDateComparison(accessor: string, operator: string, dateStr: string): string {
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
  // OmniJS uses direct property access, not method calls
  // task.completed -> task.completed (not task.completed())
  // task.id.primaryKey -> task.id.primaryKey (not task.id().primaryKey())
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
