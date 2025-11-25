import { describe, it, expect } from 'vitest';
import { buildAST } from '../../../../src/contracts/ast/builder.js';
import type { TaskFilter } from '../../../../src/contracts/filters.js';

describe('buildAST', () => {
  describe('empty filter', () => {
    it('returns literal true for empty filter', () => {
      const filter: TaskFilter = {};
      const ast = buildAST(filter);

      expect(ast).toEqual({ type: 'literal', value: true });
    });
  });

  describe('boolean filters', () => {
    it('transforms completed: false', () => {
      const filter: TaskFilter = { completed: false };
      const ast = buildAST(filter);

      expect(ast).toEqual({
        type: 'comparison',
        field: 'task.completed',
        operator: '==',
        value: false,
      });
    });

    it('transforms completed: true', () => {
      const filter: TaskFilter = { completed: true };
      const ast = buildAST(filter);

      expect(ast).toEqual({
        type: 'comparison',
        field: 'task.completed',
        operator: '==',
        value: true,
      });
    });

    it('transforms flagged: true', () => {
      const filter: TaskFilter = { flagged: true };
      const ast = buildAST(filter);

      expect(ast).toEqual({
        type: 'comparison',
        field: 'task.flagged',
        operator: '==',
        value: true,
      });
    });

    it('transforms blocked: true', () => {
      const filter: TaskFilter = { blocked: true };
      const ast = buildAST(filter);

      expect(ast).toEqual({
        type: 'comparison',
        field: 'task.blocked',
        operator: '==',
        value: true,
      });
    });

    it('transforms available: true', () => {
      const filter: TaskFilter = { available: true };
      const ast = buildAST(filter);

      expect(ast).toEqual({
        type: 'comparison',
        field: 'task.available',
        operator: '==',
        value: true,
      });
    });

    it('transforms inInbox: true', () => {
      const filter: TaskFilter = { inInbox: true };
      const ast = buildAST(filter);

      expect(ast).toEqual({
        type: 'comparison',
        field: 'task.effectiveInInbox',
        operator: '==',
        value: true,
      });
    });

    it('transforms dropped: true', () => {
      const filter: TaskFilter = { dropped: true };
      const ast = buildAST(filter);

      expect(ast).toEqual({
        type: 'comparison',
        field: 'task.dropped',
        operator: '==',
        value: true,
      });
    });

    it('transforms dropped: false', () => {
      const filter: TaskFilter = { dropped: false };
      const ast = buildAST(filter);

      expect(ast).toEqual({
        type: 'comparison',
        field: 'task.dropped',
        operator: '==',
        value: false,
      });
    });
  });

  describe('repetition filters', () => {
    it('transforms hasRepetitionRule: true', () => {
      const filter: TaskFilter = { hasRepetitionRule: true };
      const ast = buildAST(filter);

      expect(ast).toEqual({
        type: 'exists',
        field: 'task.repetitionRule',
        exists: true,
      });
    });

    it('transforms hasRepetitionRule: false', () => {
      const filter: TaskFilter = { hasRepetitionRule: false };
      const ast = buildAST(filter);

      expect(ast).toEqual({
        type: 'exists',
        field: 'task.repetitionRule',
        exists: false,
      });
    });
  });

  describe('tag filters', () => {
    it('transforms tags with OR operator', () => {
      const filter: TaskFilter = { tags: ['work', 'urgent'], tagsOperator: 'OR' };
      const ast = buildAST(filter);

      expect(ast).toEqual({
        type: 'comparison',
        field: 'taskTags',
        operator: 'some',
        value: ['work', 'urgent'],
      });
    });

    it('transforms tags with AND operator', () => {
      const filter: TaskFilter = { tags: ['work', 'urgent'], tagsOperator: 'AND' };
      const ast = buildAST(filter);

      expect(ast).toEqual({
        type: 'comparison',
        field: 'taskTags',
        operator: 'every',
        value: ['work', 'urgent'],
      });
    });

    it('transforms tags with NOT_IN operator', () => {
      const filter: TaskFilter = { tags: ['waiting'], tagsOperator: 'NOT_IN' };
      const ast = buildAST(filter);

      expect(ast).toEqual({
        type: 'not',
        child: {
          type: 'comparison',
          field: 'taskTags',
          operator: 'some',
          value: ['waiting'],
        },
      });
    });

    it('defaults to AND operator when not specified', () => {
      const filter: TaskFilter = { tags: ['work'] };
      const ast = buildAST(filter);

      expect(ast).toEqual({
        type: 'comparison',
        field: 'taskTags',
        operator: 'every',
        value: ['work'],
      });
    });
  });

  describe('text filters', () => {
    it('transforms text with CONTAINS operator', () => {
      const filter: TaskFilter = { text: 'review', textOperator: 'CONTAINS' };
      const ast = buildAST(filter);

      expect(ast).toEqual({
        type: 'comparison',
        field: 'task.name',
        operator: 'includes',
        value: 'review',
      });
    });

    it('transforms text with MATCHES operator', () => {
      const filter: TaskFilter = { text: '^review.*', textOperator: 'MATCHES' };
      const ast = buildAST(filter);

      expect(ast).toEqual({
        type: 'comparison',
        field: 'task.name',
        operator: 'matches',
        value: '^review.*',
      });
    });

    it('defaults to CONTAINS operator', () => {
      const filter: TaskFilter = { text: 'review' };
      const ast = buildAST(filter);

      expect(ast).toEqual({
        type: 'comparison',
        field: 'task.name',
        operator: 'includes',
        value: 'review',
      });
    });
  });

  describe('date filters', () => {
    it('transforms dueBefore', () => {
      const filter: TaskFilter = { dueBefore: '2025-12-31' };
      const ast = buildAST(filter);

      expect(ast).toEqual({
        type: 'and',
        children: [
          { type: 'exists', field: 'task.dueDate', exists: true },
          { type: 'comparison', field: 'task.dueDate', operator: '<=', value: '2025-12-31' },
        ],
      });
    });

    it('transforms dueAfter', () => {
      const filter: TaskFilter = { dueAfter: '2025-01-01' };
      const ast = buildAST(filter);

      expect(ast).toEqual({
        type: 'and',
        children: [
          { type: 'exists', field: 'task.dueDate', exists: true },
          { type: 'comparison', field: 'task.dueDate', operator: '>=', value: '2025-01-01' },
        ],
      });
    });

    it('transforms due date range (BETWEEN)', () => {
      const filter: TaskFilter = {
        dueAfter: '2025-01-01',
        dueBefore: '2025-12-31',
        dueDateOperator: 'BETWEEN',
      };
      const ast = buildAST(filter);

      expect(ast).toEqual({
        type: 'and',
        children: [
          { type: 'exists', field: 'task.dueDate', exists: true },
          { type: 'comparison', field: 'task.dueDate', operator: '>=', value: '2025-01-01' },
          { type: 'comparison', field: 'task.dueDate', operator: '<=', value: '2025-12-31' },
        ],
      });
    });

    it('transforms deferBefore', () => {
      const filter: TaskFilter = { deferBefore: '2025-12-31' };
      const ast = buildAST(filter);

      expect(ast).toEqual({
        type: 'and',
        children: [
          { type: 'exists', field: 'task.deferDate', exists: true },
          { type: 'comparison', field: 'task.deferDate', operator: '<=', value: '2025-12-31' },
        ],
      });
    });

    it('transforms deferAfter', () => {
      const filter: TaskFilter = { deferAfter: '2025-01-01' };
      const ast = buildAST(filter);

      expect(ast).toEqual({
        type: 'and',
        children: [
          { type: 'exists', field: 'task.deferDate', exists: true },
          { type: 'comparison', field: 'task.deferDate', operator: '>=', value: '2025-01-01' },
        ],
      });
    });
  });

  describe('project filter', () => {
    it('transforms projectId', () => {
      const filter: TaskFilter = { projectId: 'abc123' };
      const ast = buildAST(filter);

      expect(ast).toEqual({
        type: 'comparison',
        field: 'task.containingProject',
        operator: '==',
        value: 'abc123',
      });
    });
  });

  describe('id filter', () => {
    it('transforms id', () => {
      const filter: TaskFilter = { id: 'task-xyz' };
      const ast = buildAST(filter);

      expect(ast).toEqual({
        type: 'comparison',
        field: 'task.id.primaryKey',
        operator: '==',
        value: 'task-xyz',
      });
    });
  });

  describe('combined filters', () => {
    it('combines multiple filters with AND', () => {
      const filter: TaskFilter = {
        completed: false,
        flagged: true,
        tags: ['work'],
        tagsOperator: 'OR',
      };
      const ast = buildAST(filter);

      expect(ast.type).toBe('and');
      if (ast.type === 'and') {
        expect(ast.children).toHaveLength(3);
        expect(ast.children).toContainEqual({
          type: 'comparison',
          field: 'task.completed',
          operator: '==',
          value: false,
        });
        expect(ast.children).toContainEqual({
          type: 'comparison',
          field: 'task.flagged',
          operator: '==',
          value: true,
        });
        expect(ast.children).toContainEqual({
          type: 'comparison',
          field: 'taskTags',
          operator: 'some',
          value: ['work'],
        });
      }
    });

    it('unwraps single-child AND to the child itself', () => {
      const filter: TaskFilter = { flagged: true };
      const ast = buildAST(filter);

      // Should NOT be wrapped in an AND node
      expect(ast.type).toBe('comparison');
    });
  });
});
