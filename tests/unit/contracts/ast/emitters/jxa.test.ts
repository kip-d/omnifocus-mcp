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

  describe('synthetic status fields (direct method calls in JXA)', () => {
    it('emits dropped method call for dropped: true', () => {
      const ast: FilterNode = {
        type: 'comparison',
        field: 'task.dropped',
        operator: '==',
        value: true,
      };
      const code = emitJXA(ast);
      // JXA treats dropped as a regular boolean property (no Task.Status enum)
      expect(code).toBe('task.dropped() === true');
    });

    it('emits dropped method call for dropped: false', () => {
      const ast: FilterNode = {
        type: 'comparison',
        field: 'task.dropped',
        operator: '==',
        value: false,
      };
      const code = emitJXA(ast);
      expect(code).toBe('task.dropped() === false');
    });

    it('emits available method call for available: true', () => {
      const ast: FilterNode = {
        type: 'comparison',
        field: 'task.available',
        operator: '==',
        value: true,
      };
      const code = emitJXA(ast);
      expect(code).toBe('task.available() === true');
    });

    it('emits available method call for available: false', () => {
      const ast: FilterNode = {
        type: 'comparison',
        field: 'task.available',
        operator: '==',
        value: false,
      };
      const code = emitJXA(ast);
      expect(code).toBe('task.available() === false');
    });

    it('emits blocked method call for blocked: true', () => {
      const ast: FilterNode = {
        type: 'comparison',
        field: 'task.blocked',
        operator: '==',
        value: true,
      };
      const code = emitJXA(ast);
      expect(code).toBe('task.blocked() === true');
    });

    it('emits blocked method call for blocked: false', () => {
      const ast: FilterNode = {
        type: 'comparison',
        field: 'task.blocked',
        operator: '==',
        value: false,
      };
      const code = emitJXA(ast);
      expect(code).toBe('task.blocked() === false');
    });

    it('emits tagStatusValid method call for tagStatusValid: true', () => {
      const ast: FilterNode = {
        type: 'comparison',
        field: 'task.tagStatusValid',
        operator: '==',
        value: true,
      };
      const code = emitJXA(ast);
      // JXA doesn't have special tagStatusValid handling - uses direct method call
      expect(code).toBe('task.tagStatusValid() === true');
    });

    it('emits inInbox method call', () => {
      const ast: FilterNode = {
        type: 'comparison',
        field: 'task.inInbox',
        operator: '==',
        value: true,
      };
      const code = emitJXA(ast);
      expect(code).toBe('task.inInbox() === true');
    });
  });

  describe('additional date comparison operators', () => {
    it('emits strict less than for dates', () => {
      const ast: FilterNode = {
        type: 'comparison',
        field: 'task.dueDate',
        operator: '<',
        value: '2025-12-31',
      };
      const code = emitJXA(ast);
      expect(code).toBe('task.dueDate() < new Date("2025-12-31")');
    });

    it('emits strict greater than for dates', () => {
      const ast: FilterNode = {
        type: 'comparison',
        field: 'task.dueDate',
        operator: '>',
        value: '2025-01-01',
      };
      const code = emitJXA(ast);
      expect(code).toBe('task.dueDate() > new Date("2025-01-01")');
    });
  });

  describe('note field comparisons', () => {
    it('emits case-insensitive includes for note field', () => {
      const ast: FilterNode = {
        type: 'comparison',
        field: 'task.note',
        operator: 'includes',
        value: 'reference',
      };
      const code = emitJXA(ast);
      expect(code).toBe('task.note().toLowerCase().includes("reference".toLowerCase())');
    });

    it('emits regex match for note field', () => {
      const ast: FilterNode = {
        type: 'comparison',
        field: 'task.note',
        operator: 'matches',
        value: '\\d{4}-\\d{2}-\\d{2}',
      };
      const code = emitJXA(ast);
      expect(code).toBe('/\\d{4}-\\d{2}-\\d{2}/i.test(task.note())');
    });
  });

  describe('NOT around tag comparisons', () => {
    it('emits negated tag some check (NOT_IN pattern)', () => {
      const ast: FilterNode = {
        type: 'not',
        child: {
          type: 'comparison',
          field: 'taskTags',
          operator: 'some',
          value: ['waiting'],
        },
      };
      const code = emitJXA(ast);
      expect(code).toContain('!');
      expect(code).toContain('taskTags.some');
      expect(code).toContain('waiting');
    });
  });

  describe('project != comparison', () => {
    it('emits project not-equal check', () => {
      const ast: FilterNode = {
        type: 'comparison',
        field: 'task.containingProject',
        operator: '!=',
        value: 'abc123',
      };
      const code = emitJXA(ast);
      expect(code).toContain('!');
      expect(code).toContain('task.containingProject()');
      expect(code).toContain('abc123');
    });
  });

  describe('repetition rule exists in JXA', () => {
    it('emits repetitionRule exists check', () => {
      const ast: FilterNode = {
        type: 'exists',
        field: 'task.repetitionRule',
        exists: true,
      };
      const code = emitJXA(ast);
      expect(code).toBe('task.repetitionRule() !== null');
    });

    it('emits repetitionRule null check', () => {
      const ast: FilterNode = {
        type: 'exists',
        field: 'task.repetitionRule',
        exists: false,
      };
      const code = emitJXA(ast);
      expect(code).toBe('task.repetitionRule() === null');
    });
  });

  describe('exists for various date fields', () => {
    it('emits deferDate exists check', () => {
      const ast: FilterNode = {
        type: 'exists',
        field: 'task.deferDate',
        exists: true,
      };
      const code = emitJXA(ast);
      expect(code).toBe('task.deferDate() !== null');
    });

    it('emits plannedDate not exists check', () => {
      const ast: FilterNode = {
        type: 'exists',
        field: 'task.plannedDate',
        exists: false,
      };
      const code = emitJXA(ast);
      expect(code).toBe('task.plannedDate() === null');
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
