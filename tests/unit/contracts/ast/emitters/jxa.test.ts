import { describe, it, expect } from 'vitest';
import { emitJXA } from '../../../../../src/contracts/ast/emitters/jxa.js';
import type { FilterNode } from '../../../../../src/contracts/ast/types.js';

describe('emitJXA', () => {
  describe('literal nodes', () => {
    it('emits true for literal true', () => {
      const ast: FilterNode = { type: 'literal', value: true };
      const code = emitJXA(ast);
      expect(code).toBe('true');
    });

    it('emits false for literal false', () => {
      const ast: FilterNode = { type: 'literal', value: false };
      const code = emitJXA(ast);
      expect(code).toBe('false');
    });
  });

  describe('comparison nodes', () => {
    it('emits equality check for boolean field', () => {
      const ast: FilterNode = {
        type: 'comparison',
        field: 'task.completed',
        operator: '==',
        value: false,
      };
      const code = emitJXA(ast);
      expect(code).toBe('task.completed() === false');
    });

    it('emits equality check for true value', () => {
      const ast: FilterNode = {
        type: 'comparison',
        field: 'task.flagged',
        operator: '==',
        value: true,
      };
      const code = emitJXA(ast);
      expect(code).toBe('task.flagged() === true');
    });

    it('emits inequality check', () => {
      const ast: FilterNode = {
        type: 'comparison',
        field: 'task.completed',
        operator: '!=',
        value: true,
      };
      const code = emitJXA(ast);
      expect(code).toBe('task.completed() !== true');
    });

    it('emits less than comparison for dates', () => {
      const ast: FilterNode = {
        type: 'comparison',
        field: 'task.dueDate',
        operator: '<=',
        value: '2025-12-31',
      };
      const code = emitJXA(ast);
      expect(code).toBe('task.dueDate() <= new Date("2025-12-31")');
    });

    it('emits greater than comparison for dates', () => {
      const ast: FilterNode = {
        type: 'comparison',
        field: 'task.dueDate',
        operator: '>=',
        value: '2025-01-01',
      };
      const code = emitJXA(ast);
      expect(code).toBe('task.dueDate() >= new Date("2025-01-01")');
    });

    it('emits includes for string contains', () => {
      const ast: FilterNode = {
        type: 'comparison',
        field: 'task.name',
        operator: 'includes',
        value: 'review',
      };
      const code = emitJXA(ast);
      expect(code).toBe('task.name().toLowerCase().includes("review".toLowerCase())');
    });

    it('emits regex match for matches operator', () => {
      const ast: FilterNode = {
        type: 'comparison',
        field: 'task.name',
        operator: 'matches',
        value: '^review.*',
      };
      const code = emitJXA(ast);
      expect(code).toBe('/^review.*/i.test(task.name())');
    });

    it('emits project ID check', () => {
      const ast: FilterNode = {
        type: 'comparison',
        field: 'task.containingProject',
        operator: '==',
        value: 'abc123',
      };
      const code = emitJXA(ast);
      expect(code).toContain('task.containingProject()');
      expect(code).toContain('abc123');
    });

    it('emits task ID check', () => {
      const ast: FilterNode = {
        type: 'comparison',
        field: 'task.id.primaryKey',
        operator: '==',
        value: 'xyz789',
      };
      const code = emitJXA(ast);
      expect(code).toBe('task.id().primaryKey() === "xyz789"');
    });
  });

  describe('tag comparisons', () => {
    it('emits some check for OR tags', () => {
      const ast: FilterNode = {
        type: 'comparison',
        field: 'taskTags',
        operator: 'some',
        value: ['work', 'urgent'],
      };
      const code = emitJXA(ast);
      expect(code).toContain('taskTags');
      expect(code).toContain('some');
      expect(code).toContain('work');
      expect(code).toContain('urgent');
    });

    it('emits every check for AND tags', () => {
      const ast: FilterNode = {
        type: 'comparison',
        field: 'taskTags',
        operator: 'every',
        value: ['work', 'urgent'],
      };
      const code = emitJXA(ast);
      expect(code).toContain('taskTags');
      expect(code).toContain('every');
    });
  });

  describe('exists nodes', () => {
    it('emits null check for exists: true', () => {
      const ast: FilterNode = {
        type: 'exists',
        field: 'task.dueDate',
        exists: true,
      };
      const code = emitJXA(ast);
      expect(code).toBe('task.dueDate() !== null');
    });

    it('emits null check for exists: false', () => {
      const ast: FilterNode = {
        type: 'exists',
        field: 'task.dueDate',
        exists: false,
      };
      const code = emitJXA(ast);
      expect(code).toBe('task.dueDate() === null');
    });
  });

  describe('logical nodes', () => {
    it('emits AND with && operator', () => {
      const ast: FilterNode = {
        type: 'and',
        children: [
          { type: 'comparison', field: 'task.completed', operator: '==', value: false },
          { type: 'comparison', field: 'task.flagged', operator: '==', value: true },
        ],
      };
      const code = emitJXA(ast);
      expect(code).toBe('(task.completed() === false && task.flagged() === true)');
    });

    it('emits OR with || operator', () => {
      const ast: FilterNode = {
        type: 'or',
        children: [
          { type: 'comparison', field: 'task.flagged', operator: '==', value: true },
          { type: 'comparison', field: 'task.blocked', operator: '==', value: true },
        ],
      };
      const code = emitJXA(ast);
      expect(code).toBe('(task.flagged() === true || task.blocked() === true)');
    });

    it('emits NOT with ! operator', () => {
      const ast: FilterNode = {
        type: 'not',
        child: {
          type: 'comparison',
          field: 'task.completed',
          operator: '==',
          value: true,
        },
      };
      const code = emitJXA(ast);
      expect(code).toBe('!(task.completed() === true)');
    });

    it('handles nested logical nodes', () => {
      const ast: FilterNode = {
        type: 'and',
        children: [
          { type: 'comparison', field: 'task.completed', operator: '==', value: false },
          {
            type: 'or',
            children: [
              { type: 'comparison', field: 'task.flagged', operator: '==', value: true },
              { type: 'comparison', field: 'task.blocked', operator: '==', value: true },
            ],
          },
        ],
      };
      const code = emitJXA(ast);
      expect(code).toContain('&&');
      expect(code).toContain('||');
    });

    it('returns true for empty AND', () => {
      const ast: FilterNode = { type: 'and', children: [] };
      const code = emitJXA(ast);
      expect(code).toBe('true');
    });

    it('returns false for empty OR', () => {
      const ast: FilterNode = { type: 'or', children: [] };
      const code = emitJXA(ast);
      expect(code).toBe('false');
    });
  });
});
