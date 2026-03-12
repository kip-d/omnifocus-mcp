/**
 * OmniJS Emitter - Transforms FilterAST to OmniJS JavaScript code
 *
 * Generates JavaScript code that can be embedded in OmniJS scripts to filter tasks.
 * OmniJS uses direct property access (task.completed) instead of JXA-style method calls (task.completed()).
 *
 * @see docs/plans/2025-11-24-ast-filter-contracts-design.md
 */

import type { FilterNode, ComparisonNode, ExistsNode, ComparisonOperator } from '../types.js';
import { SYNTHETIC_FIELD_MAP } from '../types.js';

/**
 * Result of emitting a filter node to OmniJS code.
 * Separates setup code (preamble) from the filter expression (predicate).
 */
export interface EmitResult {
  /** Code that runs once before the filter loop (variable declarations, lookups) */
  preamble: string;
  /** The filter predicate expression */
  predicate: string;
}

/**
 * Emit OmniJS JavaScript code from a FilterAST
 *
 * @param ast - The FilterNode to emit
 * @returns EmitResult with preamble and predicate
 */
export function emitOmniJS(ast: FilterNode): EmitResult {
  let projectCounter = 0;
  function nextProjectVar(): string {
    return `__projectTarget_${projectCounter++}`;
  }

  function emitNode(node: FilterNode): EmitResult {
    switch (node.type) {
      case 'literal':
        return { preamble: '', predicate: String(node.value) };

      case 'comparison':
        return emitComparison(node);

      case 'exists':
        return { preamble: '', predicate: emitExists(node) };

      case 'and': {
        if (node.children.length === 0) return { preamble: '', predicate: 'true' };
        const results = node.children.map(emitNode);
        const preamble = results
          .map((r) => r.preamble)
          .filter(Boolean)
          .join('\n');
        const predicate = `(${results.map((r) => r.predicate).join(' && ')})`;
        return { preamble, predicate };
      }

      case 'or': {
        if (node.children.length === 0) return { preamble: '', predicate: 'false' };
        const results = node.children.map(emitNode);
        const preamble = results
          .map((r) => r.preamble)
          .filter(Boolean)
          .join('\n');
        const predicate = `(${results.map((r) => r.predicate).join(' || ')})`;
        return { preamble, predicate };
      }

      case 'not': {
        const child = emitNode(node.child);
        return { preamble: child.preamble, predicate: `!(${child.predicate})` };
      }

      default:
        throw new Error(`Unknown node type: ${(node as FilterNode).type}`);
    }
  }

  function emitComparison(node: ComparisonNode): EmitResult {
    const { field, operator, value } = node;

    // Special handling for taskTags (array operations)
    if (field === 'taskTags') {
      return { preamble: '', predicate: emitTagComparison(operator, value as string[]) };
    }

    // Special handling for project ID
    if (field === 'task.containingProject') {
      return emitProjectComparison(operator, value as string);
    }

    // Synthetic fields: consult registry for special emission logic
    const syntheticDef = SYNTHETIC_FIELD_MAP.get(field);
    if (syntheticDef?.omnijs) {
      return { preamble: '', predicate: syntheticDef.omnijs(operator, value) };
    }

    // Get the field accessor (OmniJS uses direct property access)
    const accessor = getFieldAccessor(field);

    // Handle different operators
    let predicate: string;
    switch (operator) {
      case '==':
        predicate = `${accessor} === ${emitValue(value)}`;
        break;

      case '!=':
        predicate = `${accessor} !== ${emitValue(value)}`;
        break;

      case '<':
      case '>':
      case '<=':
      case '>=':
        predicate = emitDateComparison(accessor, operator, value as string);
        break;

      case 'includes':
        predicate = `${accessor}.toLowerCase().includes(${emitValue(value)}.toLowerCase())`;
        break;

      case 'matches':
        predicate = `/${String(value)}/i.test(${accessor})`;
        break;

      case 'some':
      case 'every':
        // Generic array operators (shouldn't reach here for taskTags)
        predicate = `${accessor}.${operator}(v => ${emitValue(value)}.includes(v))`;
        break;

      default:
        throw new Error(`Unknown operator: ${String(operator)}`);
    }

    return { preamble: '', predicate };
  }

  function emitProjectComparison(operator: ComparisonOperator, projectValue: string): EmitResult {
    const varName = nextProjectVar();
    const val = JSON.stringify(projectValue);

    const preamble = `var ${varName} = (function() {
  var target = ${val};
  var byId = Project.byIdentifier(target);
  if (byId) return { project: byId, method: "id", duplicates: 0, allMatches: [{ id: byId.id.primaryKey, name: byId.name }] };
  var byName = flattenedProjects.byName(target);
  if (!byName) return null;
  var matches = document.projectsMatching(target);
  var exact = matches.filter(function(p) { return p.name === target; });
  return {
    project: byName,
    method: "name",
    duplicates: exact.length - 1,
    allMatches: exact.map(function(p) { return { id: p.id.primaryKey, name: p.name }; })
  };
})();`;

    let predicate: string;
    switch (operator) {
      case '==':
        predicate = `(${varName} && task.containingProject === ${varName}.project)`;
        break;
      case '!=':
        predicate = `(!${varName} || task.containingProject !== ${varName}.project)`;
        break;
      default:
        throw new Error(`Unsupported project operator: ${operator}`);
    }

    return { preamble, predicate };
  }

  return emitNode(ast);
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
