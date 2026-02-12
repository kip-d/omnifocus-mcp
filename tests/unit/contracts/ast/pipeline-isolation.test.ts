/**
 * Pipeline Isolation Tests
 *
 * Tests each pipeline stage independently to verify:
 * - AST builder produces abstract nodes (no OmniJS syntax)
 * - Emitters work with hand-crafted AST (no builder dependency)
 * - Validator works with hand-crafted AST (no builder/emitter dependency)
 * - Compiler output is always normalized
 * - FilterPipeline fluent API works end-to-end
 */

import { describe, it, expect } from 'vitest';
import { buildAST } from '../../../../src/contracts/ast/builder.js';
import { validateFilterAST } from '../../../../src/contracts/ast/validator.js';
import { emitOmniJS } from '../../../../src/contracts/ast/emitters/omnijs.js';
import { emitJXA } from '../../../../src/contracts/ast/emitters/jxa.js';
import { FilterPipeline } from '../../../../src/contracts/ast/filter-generator.js';
import { QueryCompiler } from '../../../../src/tools/unified/compilers/QueryCompiler.js';
import { isNormalizedFilter } from '../../../../src/contracts/filters.js';
import type { FilterNode } from '../../../../src/contracts/ast/types.js';
import type { TaskFilter } from '../../../../src/contracts/filters.js';

// =============================================================================
// AST BUILDER ISOLATION
// =============================================================================

describe('AST builder isolation', () => {
  it('produces abstract field names, not OmniJS-specific syntax', () => {
    const filter: TaskFilter = { completed: false, flagged: true };
    const ast = buildAST(filter);
    const serialized = JSON.stringify(ast);

    // Should use abstract field names like task.completed, not task.completed()
    expect(serialized).not.toContain('()');
    expect(serialized).toContain('task.completed');
    expect(serialized).toContain('task.flagged');
  });

  it('does not embed Date constructors or new Date() in AST', () => {
    const filter: TaskFilter = { dueBefore: '2025-12-31' };
    const ast = buildAST(filter);
    const serialized = JSON.stringify(ast);

    // AST should store raw date strings, not JavaScript Date expressions
    expect(serialized).not.toContain('new Date');
    expect(serialized).toContain('2025-12-31');
  });

  it('produces pure tree structure with no side effects', () => {
    const filter: TaskFilter = { tags: ['work'], tagsOperator: 'OR' };
    const ast1 = buildAST(filter);
    const ast2 = buildAST(filter);

    // Same input should produce structurally identical output
    expect(ast1).toEqual(ast2);
  });
});

// =============================================================================
// EMITTER ISOLATION (hand-crafted AST, no builder dependency)
// =============================================================================

describe('emitter isolation', () => {
  describe('OmniJS emitter with hand-crafted AST', () => {
    it('emits correct code for a comparison node', () => {
      const ast: FilterNode = {
        type: 'comparison',
        field: 'task.flagged',
        operator: '==',
        value: true,
      };
      const code = emitOmniJS(ast);
      expect(code).toBe('task.flagged === true');
    });

    it('emits correct code for an AND node', () => {
      const ast: FilterNode = {
        type: 'and',
        children: [
          { type: 'comparison', field: 'task.completed', operator: '==', value: false },
          { type: 'exists', field: 'task.dueDate', exists: true },
        ],
      };
      const code = emitOmniJS(ast);
      expect(code).toContain('task.completed === false');
      expect(code).toContain('task.dueDate !== null');
      expect(code).toContain('&&');
    });

    it('emits correct code for an OR node', () => {
      const ast: FilterNode = {
        type: 'or',
        children: [
          { type: 'comparison', field: 'task.flagged', operator: '==', value: true },
          { type: 'comparison', field: 'task.completed', operator: '==', value: false },
        ],
      };
      const code = emitOmniJS(ast);
      expect(code).toContain('||');
    });
  });

  describe('JXA emitter with hand-crafted AST', () => {
    it('emits method-call syntax for JXA', () => {
      const ast: FilterNode = {
        type: 'comparison',
        field: 'task.flagged',
        operator: '==',
        value: true,
      };
      const code = emitJXA(ast);
      // JXA uses method calls: task.flagged()
      expect(code).toBe('task.flagged() === true');
    });
  });
});

// =============================================================================
// VALIDATOR ISOLATION (hand-crafted AST, no builder/emitter dependency)
// =============================================================================

describe('validator isolation', () => {
  it('validates a hand-crafted valid AST', () => {
    const ast: FilterNode = {
      type: 'and',
      children: [
        { type: 'comparison', field: 'task.completed', operator: '==', value: false },
        { type: 'comparison', field: 'task.flagged', operator: '==', value: true },
      ],
    };
    const result = validateFilterAST(ast);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects a hand-crafted AST with unknown field', () => {
    const ast: FilterNode = {
      type: 'comparison',
      field: 'task.nonexistentField',
      operator: '==',
      value: true,
    };
    const result = validateFilterAST(ast);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'UNKNOWN_FIELD')).toBe(true);
  });

  it('detects contradiction in hand-crafted AST', () => {
    const ast: FilterNode = {
      type: 'and',
      children: [
        { type: 'comparison', field: 'task.completed', operator: '==', value: true },
        { type: 'comparison', field: 'task.completed', operator: '==', value: false },
      ],
    };
    const result = validateFilterAST(ast);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'CONTRADICTION')).toBe(true);
  });
});

// =============================================================================
// COMPILER NORMALIZATION
// =============================================================================

describe('compiler normalization', () => {
  it('compile() output passes isNormalizedFilter check', () => {
    const compiler = new QueryCompiler();
    const result = compiler.compile({
      query: {
        type: 'tasks',
        filters: { status: 'active', flagged: true },
      },
    });

    expect(isNormalizedFilter(result.filters)).toBe(true);
  });

  it('compile() with empty filters still returns normalized filter', () => {
    const compiler = new QueryCompiler();
    const result = compiler.compile({
      query: { type: 'tasks' },
    });

    expect(isNormalizedFilter(result.filters)).toBe(true);
  });
});

// =============================================================================
// FilterPipeline FLUENT API
// =============================================================================

describe('FilterPipeline', () => {
  it('builds AST via .build()', () => {
    const pipeline = FilterPipeline.from({ flagged: true }).build();
    const ast = pipeline.ast;
    expect(ast.type).toBe('comparison');
    if (ast.type === 'comparison') {
      expect(ast.field).toBe('task.flagged');
      expect(ast.value).toBe(true);
    }
  });

  it('auto-builds when accessing .ast without calling .build()', () => {
    const pipeline = FilterPipeline.from({ completed: false });
    const ast = pipeline.ast;
    expect(ast.type).toBe('comparison');
  });

  it('validates via .validate()', () => {
    const pipeline = FilterPipeline.from({ flagged: true }).build().validate();
    const validation = pipeline.validation;
    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);
  });

  it('auto-builds and auto-validates when calling .emit()', () => {
    const code = FilterPipeline.from({ flagged: true }).emit('omnijs');
    expect(code).toBe('task.flagged === true');
  });

  it('emits JXA code', () => {
    const code = FilterPipeline.from({ flagged: true }).emit('jxa');
    expect(code).toBe('task.flagged() === true');
  });

  it('defaults to omnijs target', () => {
    const code = FilterPipeline.from({ completed: false }).emit();
    expect(code).toBe('task.completed === false');
  });

  it('emits true for empty filter', () => {
    const code = FilterPipeline.from({}).emit('omnijs');
    expect(code).toBe('true');
  });

  it('handles complex filter through full pipeline', () => {
    const filter: TaskFilter = {
      completed: false,
      flagged: true,
      tags: ['work'],
      tagsOperator: 'OR',
      dueBefore: '2025-12-31',
    };
    const code = FilterPipeline.from(filter).emit('omnijs');

    expect(code).toContain('task.completed === false');
    expect(code).toContain('task.flagged === true');
    expect(code).toContain('taskTags');
    expect(code).toContain('2025-12-31');
  });
});

// =============================================================================
// CROSS-STAGE CONTRACT: build -> validate -> emit for each filter type
// =============================================================================

describe('cross-stage contract', () => {
  const filterCases: Array<{ name: string; filter: TaskFilter }> = [
    { name: 'completed', filter: { completed: false } },
    { name: 'flagged', filter: { flagged: true } },
    { name: 'blocked', filter: { blocked: true } },
    { name: 'available', filter: { available: true } },
    { name: 'inInbox', filter: { inInbox: true } },
    { name: 'dropped', filter: { dropped: false } },
    { name: 'hasRepetitionRule', filter: { hasRepetitionRule: true } },
    { name: 'tagStatusValid', filter: { tagStatusValid: true } },
    { name: 'tags (OR)', filter: { tags: ['urgent'], tagsOperator: 'OR' } },
    { name: 'tags (AND)', filter: { tags: ['work', 'home'], tagsOperator: 'AND' } },
    { name: 'tags (NOT_IN)', filter: { tags: ['waiting'], tagsOperator: 'NOT_IN' } },
    { name: 'text (CONTAINS)', filter: { text: 'review', textOperator: 'CONTAINS' } },
    { name: 'text (MATCHES)', filter: { text: '^meet', textOperator: 'MATCHES' } },
    { name: 'dueAfter', filter: { dueAfter: '2025-01-01' } },
    { name: 'dueBefore', filter: { dueBefore: '2025-12-31' } },
    { name: 'deferAfter', filter: { deferAfter: '2025-01-01' } },
    { name: 'deferBefore', filter: { deferBefore: '2025-12-31' } },
    { name: 'plannedAfter', filter: { plannedAfter: '2025-06-01' } },
    { name: 'plannedBefore', filter: { plannedBefore: '2025-12-31' } },
    { name: 'projectId', filter: { projectId: 'proj-123' } },
    { name: 'id', filter: { id: 'task-abc' } },
  ];

  for (const { name, filter } of filterCases) {
    it(`build -> validate -> emit (omnijs) succeeds for ${name}`, () => {
      const ast = buildAST(filter);
      expect(ast.type).not.toBe('literal');

      const validation = validateFilterAST(ast);
      expect(
        validation.valid,
        `Validation failed for ${name}: ${validation.errors.map((e) => e.message).join('; ')}`,
      ).toBe(true);

      const code = emitOmniJS(ast);
      expect(code.length).toBeGreaterThan(0);
      expect(code).not.toBe('true');
    });

    it(`build -> validate -> emit (jxa) succeeds for ${name}`, () => {
      const ast = buildAST(filter);
      const validation = validateFilterAST(ast);
      expect(validation.valid).toBe(true);

      const code = emitJXA(ast);
      expect(code.length).toBeGreaterThan(0);
      expect(code).not.toBe('true');
    });
  }
});
