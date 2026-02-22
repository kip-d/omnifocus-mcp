/**
 * Filter Pipeline Coverage Tests
 *
 * Cross-cutting tests that validate:
 * - QueryCompiler date transformations for all date types
 * - QueryCompiler tag/text/boolean transformations
 * - QueryCompiler logical operator handling (AND/OR/NOT)
 * - Emitter parity: same AST produces valid output from both emitters
 * - Builder → Emitter round-trip for each filter type
 */

import { describe, it, expect } from 'vitest';
import { QueryCompiler } from '../../../../src/tools/unified/compilers/QueryCompiler.js';
import { buildAST } from '../../../../src/contracts/ast/builder.js';
import { emitOmniJS } from '../../../../src/contracts/ast/emitters/omnijs.js';
import { emitJXA } from '../../../../src/contracts/ast/emitters/jxa.js';
import { validateFilterAST } from '../../../../src/contracts/ast/validator.js';
import type { TaskFilter } from '../../../../src/contracts/filters.js';

// =============================================================================
// QueryCompiler.transformFilters
// =============================================================================

describe('QueryCompiler.transformFilters', () => {
  const compiler = new QueryCompiler();

  describe('due date transformations', () => {
    it('transforms dueDate.before to dueBefore', () => {
      const result = compiler.transformFilters({ dueDate: { before: '2025-12-31' } });
      expect(result.dueBefore).toBe('2025-12-31');
    });

    it('transforms dueDate.after to dueAfter', () => {
      const result = compiler.transformFilters({ dueDate: { after: '2025-01-01' } });
      expect(result.dueAfter).toBe('2025-01-01');
    });

    it('transforms dueDate.between to dueAfter + dueBefore + BETWEEN operator', () => {
      const result = compiler.transformFilters({ dueDate: { between: ['2025-01-01', '2025-12-31'] } });
      expect(result.dueAfter).toBe('2025-01-01');
      expect(result.dueBefore).toBe('2025-12-31');
      expect(result.dueDateOperator).toBe('BETWEEN');
    });
  });

  describe('defer date transformations', () => {
    it('transforms deferDate.before to deferBefore', () => {
      const result = compiler.transformFilters({ deferDate: { before: '2025-06-30' } });
      expect(result.deferBefore).toBe('2025-06-30');
    });

    it('transforms deferDate.after to deferAfter', () => {
      const result = compiler.transformFilters({ deferDate: { after: '2025-03-01' } });
      expect(result.deferAfter).toBe('2025-03-01');
    });

    it('transforms deferDate.between to deferAfter + deferBefore', () => {
      const result = compiler.transformFilters({ deferDate: { between: ['2025-01-01', '2025-06-30'] } });
      expect(result.deferAfter).toBe('2025-01-01');
      expect(result.deferBefore).toBe('2025-06-30');
    });
  });

  describe('planned date transformations', () => {
    it('transforms plannedDate.before to plannedBefore', () => {
      const result = compiler.transformFilters({ plannedDate: { before: '2025-09-30' } });
      expect(result.plannedBefore).toBe('2025-09-30');
    });

    it('transforms plannedDate.after to plannedAfter', () => {
      const result = compiler.transformFilters({ plannedDate: { after: '2025-07-01' } });
      expect(result.plannedAfter).toBe('2025-07-01');
    });

    it('transforms plannedDate.between to plannedAfter + plannedBefore + BETWEEN operator', () => {
      const result = compiler.transformFilters({ plannedDate: { between: ['2025-07-01', '2025-09-30'] } });
      expect(result.plannedAfter).toBe('2025-07-01');
      expect(result.plannedBefore).toBe('2025-09-30');
      expect(result.plannedDateOperator).toBe('BETWEEN');
    });
  });

  describe('completion date transformations', () => {
    it('transforms completionDate.before to completionBefore', () => {
      const result = compiler.transformFilters({ completionDate: { before: '2025-12-31' } });
      expect(result.completionBefore).toBe('2025-12-31');
    });

    it('transforms completionDate.after to completionAfter', () => {
      const result = compiler.transformFilters({ completionDate: { after: '2025-01-01' } });
      expect(result.completionAfter).toBe('2025-01-01');
    });

    it('transforms completionDate.between to completionAfter + completionBefore + BETWEEN operator', () => {
      const result = compiler.transformFilters({ completionDate: { between: ['2025-01-01', '2025-06-30'] } });
      expect(result.completionAfter).toBe('2025-01-01');
      expect(result.completionBefore).toBe('2025-06-30');
      expect(result.completionDateOperator).toBe('BETWEEN');
    });
  });

  describe('status transformations', () => {
    it('transforms status: completed to completed: true', () => {
      const result = compiler.transformFilters({ status: 'completed' });
      expect(result.completed).toBe(true);
    });

    it('transforms status: active to completed: false', () => {
      const result = compiler.transformFilters({ status: 'active' });
      expect(result.completed).toBe(false);
    });
  });

  describe('tag transformations', () => {
    it('transforms tags.any to tags + OR operator', () => {
      const result = compiler.transformFilters({ tags: { any: ['work', 'urgent'] } });
      expect(result.tags).toEqual(['work', 'urgent']);
      expect(result.tagsOperator).toBe('OR');
    });

    it('transforms tags.all to tags + AND operator', () => {
      const result = compiler.transformFilters({ tags: { all: ['work', 'client'] } });
      expect(result.tags).toEqual(['work', 'client']);
      expect(result.tagsOperator).toBe('AND');
    });

    it('transforms tags.none to tags + NOT_IN operator', () => {
      const result = compiler.transformFilters({ tags: { none: ['waiting', 'someday'] } });
      expect(result.tags).toEqual(['waiting', 'someday']);
      expect(result.tagsOperator).toBe('NOT_IN');
    });

    it('skips empty tag arrays', () => {
      const result = compiler.transformFilters({ tags: { any: [] } });
      expect(result.tags).toBeUndefined();
    });
  });

  describe('text transformations', () => {
    it('transforms text.contains to text + CONTAINS operator', () => {
      const result = compiler.transformFilters({ text: { contains: 'meeting' } });
      expect(result.text).toBe('meeting');
      expect(result.textOperator).toBe('CONTAINS');
    });

    it('transforms text.matches to text + MATCHES operator', () => {
      const result = compiler.transformFilters({ text: { matches: '^review.*' } });
      expect(result.text).toBe('^review.*');
      expect(result.textOperator).toBe('MATCHES');
    });
  });

  describe('boolean passthrough', () => {
    it('passes through flagged', () => {
      const result = compiler.transformFilters({ flagged: true });
      expect(result.flagged).toBe(true);
    });

    it('passes through available', () => {
      const result = compiler.transformFilters({ available: true });
      expect(result.available).toBe(true);
    });

    it('passes through blocked', () => {
      const result = compiler.transformFilters({ blocked: true });
      expect(result.blocked).toBe(true);
    });

    it('passes through inInbox', () => {
      const result = compiler.transformFilters({ inInbox: true });
      expect(result.inInbox).toBe(true);
    });
  });

  describe('project transformations', () => {
    it('transforms project string to projectId', () => {
      const result = compiler.transformFilters({ project: 'abc123' });
      expect(result.projectId).toBe('abc123');
    });

    it('transforms project null to inInbox: true', () => {
      const result = compiler.transformFilters({ project: null });
      expect(result.inInbox).toBe(true);
    });

    it('passes through folder', () => {
      const result = compiler.transformFilters({ folder: 'Work' });
      expect(result.folder).toBe('Work');
    });

    it('passes through id', () => {
      const result = compiler.transformFilters({ id: 'task-xyz' });
      expect(result.id).toBe('task-xyz');
    });
  });

  describe('logical operator transformations', () => {
    it('merges AND conditions', () => {
      const result = compiler.transformFilters({
        AND: [{ flagged: true }, { status: 'active' }],
      });
      expect(result.flagged).toBe(true);
      expect(result.completed).toBe(false);
    });

    it('handles NOT with completed status', () => {
      const result = compiler.transformFilters({
        NOT: { status: 'completed' },
      });
      expect(result.completed).toBe(false);
    });

    it('handles NOT with active status', () => {
      const result = compiler.transformFilters({
        NOT: { status: 'active' },
      });
      expect(result.completed).toBe(true);
    });

    it('handles OR by using first condition', () => {
      // OR is not fully supported - falls back to first condition
      const result = compiler.transformFilters({
        OR: [{ flagged: true }, { status: 'completed' }],
      });
      expect(result.flagged).toBe(true);
    });

    it('returns empty filter for empty OR array', () => {
      const result = compiler.transformFilters({ OR: [] });
      expect(Object.keys(result).length).toBe(0);
    });
  });

  describe('name filter transformation', () => {
    it('transforms name.contains to search', () => {
      const result = compiler.transformFilters({ name: { contains: 'weekly' } });
      expect(result.search).toBe('weekly');
    });

    it('transforms name.matches to search', () => {
      const result = compiler.transformFilters({ name: { matches: '^Q[1-4]' } });
      expect(result.search).toBe('^Q[1-4]');
    });
  });

  describe('returns empty filter for empty input', () => {
    it('returns empty object for empty input', () => {
      const result = compiler.transformFilters({});
      expect(Object.keys(result).length).toBe(0);
    });
  });
});

// =============================================================================
// Emitter Parity: same AST → both emitters produce valid output
// =============================================================================

describe('emitter parity', () => {
  const testFilters: Array<{ name: string; filter: TaskFilter }> = [
    { name: 'empty filter', filter: {} },
    { name: 'completed false', filter: { completed: false } },
    { name: 'flagged true', filter: { flagged: true } },
    { name: 'tags OR', filter: { tags: ['work', 'urgent'], tagsOperator: 'OR' } },
    { name: 'tags AND', filter: { tags: ['work'], tagsOperator: 'AND' } },
    { name: 'tags NOT_IN', filter: { tags: ['waiting'], tagsOperator: 'NOT_IN' } },
    { name: 'text CONTAINS', filter: { text: 'review', textOperator: 'CONTAINS' } },
    { name: 'text MATCHES', filter: { text: '^meet', textOperator: 'MATCHES' } },
    { name: 'due date before', filter: { dueBefore: '2025-12-31' } },
    { name: 'due date after', filter: { dueAfter: '2025-01-01' } },
    {
      name: 'due date BETWEEN',
      filter: { dueAfter: '2025-01-01', dueBefore: '2025-12-31', dueDateOperator: 'BETWEEN' },
    },
    { name: 'defer date before', filter: { deferBefore: '2025-06-30' } },
    { name: 'planned date after', filter: { plannedAfter: '2025-03-01' } },
    { name: 'completion date before', filter: { completionBefore: '2025-12-31' } },
    { name: 'completion date after', filter: { completionAfter: '2025-01-01' } },
    {
      name: 'completion date BETWEEN',
      filter: { completionAfter: '2025-01-01', completionBefore: '2025-12-31', completionDateOperator: 'BETWEEN' },
    },
    { name: 'project ID', filter: { projectId: 'abc123' } },
    { name: 'task ID', filter: { id: 'task-xyz' } },
    { name: 'inInbox', filter: { inInbox: true } },
    { name: 'hasRepetitionRule', filter: { hasRepetitionRule: true } },
    {
      name: 'combined filter',
      filter: { completed: false, flagged: true, tags: ['work'], dueBefore: '2025-12-31' },
    },
  ];

  for (const { name, filter } of testFilters) {
    it(`both emitters produce non-empty output for: ${name}`, () => {
      const ast = buildAST(filter);

      const omnijsCode = emitOmniJS(ast);
      const jxaCode = emitJXA(ast);

      expect(omnijsCode.length).toBeGreaterThan(0);
      expect(jxaCode.length).toBeGreaterThan(0);
    });

    it(`AST validates for: ${name}`, () => {
      const ast = buildAST(filter);
      const validation = validateFilterAST(ast);

      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });
  }
});

// =============================================================================
// Builder → Validator round-trip for synthetic fields
// =============================================================================

describe('synthetic field validation', () => {
  it('dropped field passes validation', () => {
    const ast = buildAST({ dropped: true });
    const validation = validateFilterAST(ast);
    expect(validation.valid).toBe(true);
  });

  it('available field passes validation', () => {
    const ast = buildAST({ available: true });
    const validation = validateFilterAST(ast);
    expect(validation.valid).toBe(true);
  });

  it('blocked field passes validation', () => {
    const ast = buildAST({ blocked: true });
    const validation = validateFilterAST(ast);
    expect(validation.valid).toBe(true);
  });

  it('tagStatusValid field passes validation', () => {
    const ast = buildAST({ tagStatusValid: true });
    const validation = validateFilterAST(ast);
    expect(validation.valid).toBe(true);
  });

  it('detects contradiction: completed true AND false', () => {
    // Manually construct contradictory AST (builder would never produce this)
    const ast = {
      type: 'and' as const,
      children: [
        { type: 'comparison' as const, field: 'task.completed', operator: '==' as const, value: true },
        { type: 'comparison' as const, field: 'task.completed', operator: '==' as const, value: false },
      ],
    };
    const validation = validateFilterAST(ast);
    expect(validation.valid).toBe(false);
    expect(validation.errors.some((e) => e.code === 'CONTRADICTION')).toBe(true);
  });
});

// =============================================================================
// DATE_FILTER_DEFS coverage
// =============================================================================

describe('DATE_FILTER_DEFS data-driven date handling', () => {
  it('handles all three date types (due, defer, planned) in single filter', () => {
    const filter: TaskFilter = {
      dueBefore: '2025-12-31',
      deferAfter: '2025-01-01',
      plannedBefore: '2025-06-30',
    };
    const ast = buildAST(filter);

    expect(ast.type).toBe('and');
    if (ast.type !== 'and') return;

    // Should have 3 date condition groups
    const dateGroups = ast.children.filter((c) => c.type === 'and' && c.children.some((gc) => gc.type === 'exists'));
    expect(dateGroups).toHaveLength(3);
  });

  it('applies exclusive operator < to dueDate', () => {
    const filter: TaskFilter = { dueBefore: '2025-12-31', dueDateOperator: '<' };
    const ast = buildAST(filter);

    expect(ast.type).toBe('and');
    if (ast.type !== 'and') return;

    const dateComp = ast.children.find((c) => c.type === 'comparison' && c.field === 'task.dueDate');
    expect(dateComp).toBeDefined();
    if (dateComp && dateComp.type === 'comparison') {
      expect(dateComp.operator).toBe('<');
    }
  });

  it('applies exclusive operator > to deferDate', () => {
    const filter: TaskFilter = { deferAfter: '2025-01-01', deferDateOperator: '>' };
    const ast = buildAST(filter);

    expect(ast.type).toBe('and');
    if (ast.type !== 'and') return;

    const dateComp = ast.children.find((c) => c.type === 'comparison' && c.field === 'task.deferDate');
    expect(dateComp).toBeDefined();
    if (dateComp && dateComp.type === 'comparison') {
      expect(dateComp.operator).toBe('>');
    }
  });
});
