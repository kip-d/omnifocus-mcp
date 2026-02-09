import { describe, it, expect } from 'vitest';
import { emitOmniJS } from '../../../../../src/contracts/ast/emitters/omnijs.js';
import type { FilterNode } from '../../../../../src/contracts/ast/types.js';

describe('emitOmniJS', () => {
  describe('literal nodes', () => {
    it('emits true for literal true', () => {
      const ast: FilterNode = { type: 'literal', value: true };
      const code = emitOmniJS(ast);
      expect(code).toBe('true');
    });

    it('emits false for literal false', () => {
      const ast: FilterNode = { type: 'literal', value: false };
      const code = emitOmniJS(ast);
      expect(code).toBe('false');
    });
  });

  describe('comparison nodes', () => {
    it('emits equality check for boolean field (direct property access)', () => {
      const ast: FilterNode = {
        type: 'comparison',
        field: 'task.completed',
        operator: '==',
        value: false,
      };
      const code = emitOmniJS(ast);
      // OmniJS uses direct property access, not method calls
      expect(code).toBe('task.completed === false');
    });

    it('emits equality check for true value', () => {
      const ast: FilterNode = {
        type: 'comparison',
        field: 'task.flagged',
        operator: '==',
        value: true,
      };
      const code = emitOmniJS(ast);
      expect(code).toBe('task.flagged === true');
    });

    it('emits inequality check', () => {
      const ast: FilterNode = {
        type: 'comparison',
        field: 'task.completed',
        operator: '!=',
        value: true,
      };
      const code = emitOmniJS(ast);
      expect(code).toBe('task.completed !== true');
    });

    it('emits less than comparison for dates', () => {
      const ast: FilterNode = {
        type: 'comparison',
        field: 'task.dueDate',
        operator: '<=',
        value: '2025-12-31',
      };
      const code = emitOmniJS(ast);
      expect(code).toBe('task.dueDate <= new Date("2025-12-31")');
    });

    it('emits includes for string contains', () => {
      const ast: FilterNode = {
        type: 'comparison',
        field: 'task.name',
        operator: 'includes',
        value: 'review',
      };
      const code = emitOmniJS(ast);
      expect(code).toBe('task.name.toLowerCase().includes("review".toLowerCase())');
    });

    it('emits regex match for matches operator', () => {
      const ast: FilterNode = {
        type: 'comparison',
        field: 'task.name',
        operator: 'matches',
        value: '^review.*',
      };
      const code = emitOmniJS(ast);
      expect(code).toBe('/^review.*/i.test(task.name)');
    });

    it('emits project ID check', () => {
      const ast: FilterNode = {
        type: 'comparison',
        field: 'task.containingProject',
        operator: '==',
        value: 'abc123',
      };
      const code = emitOmniJS(ast);
      expect(code).toContain('task.containingProject');
      expect(code).toContain('abc123');
    });

    it('emits task ID check', () => {
      const ast: FilterNode = {
        type: 'comparison',
        field: 'task.id.primaryKey',
        operator: '==',
        value: 'xyz789',
      };
      const code = emitOmniJS(ast);
      expect(code).toBe('task.id.primaryKey === "xyz789"');
    });
  });

  describe('dropped status comparisons', () => {
    it('emits Task.Status.Dropped check for dropped: true', () => {
      const ast: FilterNode = {
        type: 'comparison',
        field: 'task.dropped',
        operator: '==',
        value: true,
      };
      const code = emitOmniJS(ast);
      expect(code).toBe('task.taskStatus === Task.Status.Dropped');
    });

    it('emits not dropped check for dropped: false', () => {
      const ast: FilterNode = {
        type: 'comparison',
        field: 'task.dropped',
        operator: '==',
        value: false,
      };
      const code = emitOmniJS(ast);
      expect(code).toBe('task.taskStatus !== Task.Status.Dropped');
    });

    it('emits not dropped for dropped != true', () => {
      const ast: FilterNode = {
        type: 'comparison',
        field: 'task.dropped',
        operator: '!=',
        value: true,
      };
      const code = emitOmniJS(ast);
      expect(code).toBe('task.taskStatus !== Task.Status.Dropped');
    });

    it('emits dropped for dropped != false', () => {
      const ast: FilterNode = {
        type: 'comparison',
        field: 'task.dropped',
        operator: '!=',
        value: false,
      };
      const code = emitOmniJS(ast);
      expect(code).toBe('task.taskStatus === Task.Status.Dropped');
    });
  });

  describe('repetition rule comparisons', () => {
    it('emits repetitionRule exists check for hasRepetitionRule: true', () => {
      const ast: FilterNode = {
        type: 'exists',
        field: 'task.repetitionRule',
        exists: true,
      };
      const code = emitOmniJS(ast);
      expect(code).toBe('task.repetitionRule !== null');
    });

    it('emits repetitionRule null check for hasRepetitionRule: false', () => {
      const ast: FilterNode = {
        type: 'exists',
        field: 'task.repetitionRule',
        exists: false,
      };
      const code = emitOmniJS(ast);
      expect(code).toBe('task.repetitionRule === null');
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
      const code = emitOmniJS(ast);
      expect(code).toContain('taskTags');
      expect(code).toContain('some');
    });

    it('emits every check for AND tags', () => {
      const ast: FilterNode = {
        type: 'comparison',
        field: 'taskTags',
        operator: 'every',
        value: ['work', 'urgent'],
      };
      const code = emitOmniJS(ast);
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
      const code = emitOmniJS(ast);
      expect(code).toBe('task.dueDate !== null');
    });

    it('emits null check for exists: false', () => {
      const ast: FilterNode = {
        type: 'exists',
        field: 'task.dueDate',
        exists: false,
      };
      const code = emitOmniJS(ast);
      expect(code).toBe('task.dueDate === null');
    });
  });

  describe('tagStatusValid comparisons', () => {
    it('emits tag status check for tagStatusValid: true', () => {
      const ast: FilterNode = {
        type: 'comparison',
        field: 'task.tagStatusValid',
        operator: '==',
        value: true,
      };
      const code = emitOmniJS(ast);
      expect(code).toContain('task.tags.length === 0');
      expect(code).toContain('Tag.Status.Active');
      expect(code).toContain('Tag.Status.OnHold');
      expect(code).toContain('||');
    });

    it('emits negated tag status check for tagStatusValid: false', () => {
      const ast: FilterNode = {
        type: 'comparison',
        field: 'task.tagStatusValid',
        operator: '==',
        value: false,
      };
      const code = emitOmniJS(ast);
      expect(code).toContain('task.tags.length > 0');
      expect(code).toContain('!task.tags.some');
    });

    it('emits negated check for tagStatusValid != true', () => {
      const ast: FilterNode = {
        type: 'comparison',
        field: 'task.tagStatusValid',
        operator: '!=',
        value: true,
      };
      const code = emitOmniJS(ast);
      // != true should be same as == false
      expect(code).toContain('task.tags.length > 0');
      expect(code).toContain('!task.tags.some');
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
      const code = emitOmniJS(ast);
      expect(code).toBe('(task.completed === false && task.flagged === true)');
    });

    it('emits OR with || operator', () => {
      const ast: FilterNode = {
        type: 'or',
        children: [
          { type: 'comparison', field: 'task.flagged', operator: '==', value: true },
          { type: 'comparison', field: 'task.blocked', operator: '==', value: true },
        ],
      };
      const code = emitOmniJS(ast);
      // task.blocked is a synthetic field that maps to Task.Status.Blocked
      expect(code).toBe('(task.flagged === true || task.taskStatus === Task.Status.Blocked)');
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
      const code = emitOmniJS(ast);
      expect(code).toBe('!(task.completed === true)');
    });

    it('returns true for empty AND', () => {
      const ast: FilterNode = { type: 'and', children: [] };
      const code = emitOmniJS(ast);
      expect(code).toBe('true');
    });

    it('returns false for empty OR', () => {
      const ast: FilterNode = { type: 'or', children: [] };
      const code = emitOmniJS(ast);
      expect(code).toBe('false');
    });
  });
});
