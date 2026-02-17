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

  describe('available status comparisons', () => {
    it('emits Task.Status.Available check for available: true', () => {
      const ast: FilterNode = {
        type: 'comparison',
        field: 'task.available',
        operator: '==',
        value: true,
      };
      const code = emitOmniJS(ast);
      expect(code).toBe('task.taskStatus === Task.Status.Available');
    });

    it('emits not available check for available: false', () => {
      const ast: FilterNode = {
        type: 'comparison',
        field: 'task.available',
        operator: '==',
        value: false,
      };
      const code = emitOmniJS(ast);
      expect(code).toBe('task.taskStatus !== Task.Status.Available');
    });

    it('emits not available for available != true', () => {
      const ast: FilterNode = {
        type: 'comparison',
        field: 'task.available',
        operator: '!=',
        value: true,
      };
      const code = emitOmniJS(ast);
      expect(code).toBe('task.taskStatus !== Task.Status.Available');
    });

    it('emits available for available != false', () => {
      const ast: FilterNode = {
        type: 'comparison',
        field: 'task.available',
        operator: '!=',
        value: false,
      };
      const code = emitOmniJS(ast);
      expect(code).toBe('task.taskStatus === Task.Status.Available');
    });
  });

  describe('blocked status comparisons', () => {
    it('emits Task.Status.Blocked check for blocked: true', () => {
      const ast: FilterNode = {
        type: 'comparison',
        field: 'task.blocked',
        operator: '==',
        value: true,
      };
      const code = emitOmniJS(ast);
      expect(code).toBe('task.taskStatus === Task.Status.Blocked');
    });

    it('emits not blocked check for blocked: false', () => {
      const ast: FilterNode = {
        type: 'comparison',
        field: 'task.blocked',
        operator: '==',
        value: false,
      };
      const code = emitOmniJS(ast);
      expect(code).toBe('task.taskStatus !== Task.Status.Blocked');
    });

    it('emits not blocked for blocked != true', () => {
      const ast: FilterNode = {
        type: 'comparison',
        field: 'task.blocked',
        operator: '!=',
        value: true,
      };
      const code = emitOmniJS(ast);
      expect(code).toBe('task.taskStatus !== Task.Status.Blocked');
    });

    it('emits blocked for blocked != false', () => {
      const ast: FilterNode = {
        type: 'comparison',
        field: 'task.blocked',
        operator: '!=',
        value: false,
      };
      const code = emitOmniJS(ast);
      expect(code).toBe('task.taskStatus === Task.Status.Blocked');
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

  describe('additional date comparison operators', () => {
    it('emits strict less than for dates', () => {
      const ast: FilterNode = {
        type: 'comparison',
        field: 'task.dueDate',
        operator: '<',
        value: '2025-12-31',
      };
      const code = emitOmniJS(ast);
      expect(code).toBe('task.dueDate < new Date("2025-12-31")');
    });

    it('emits strict greater than for dates', () => {
      const ast: FilterNode = {
        type: 'comparison',
        field: 'task.dueDate',
        operator: '>',
        value: '2025-01-01',
      };
      const code = emitOmniJS(ast);
      expect(code).toBe('task.dueDate > new Date("2025-01-01")');
    });

    it('emits greater than or equal for dates', () => {
      const ast: FilterNode = {
        type: 'comparison',
        field: 'task.deferDate',
        operator: '>=',
        value: '2025-06-01',
      };
      const code = emitOmniJS(ast);
      expect(code).toBe('task.deferDate >= new Date("2025-06-01")');
    });
  });

  describe('note field comparisons', () => {
    it('emits case-insensitive includes for note field', () => {
      const ast: FilterNode = {
        type: 'comparison',
        field: 'task.note',
        operator: 'includes',
        value: 'important',
      };
      const code = emitOmniJS(ast);
      expect(code).toBe('task.note.toLowerCase().includes("important".toLowerCase())');
    });

    it('emits regex match for note field', () => {
      const ast: FilterNode = {
        type: 'comparison',
        field: 'task.note',
        operator: 'matches',
        value: '\\d+-note',
      };
      const code = emitOmniJS(ast);
      expect(code).toBe('/\\d+-note/i.test(task.note)');
    });
  });

  describe('project comparisons with names', () => {
    it('emits name-based project check for short project strings', () => {
      const ast: FilterNode = {
        type: 'comparison',
        field: 'task.containingProject',
        operator: '==',
        value: 'Work',
      };
      const code = emitOmniJS(ast);
      // Short strings are treated as names, not IDs
      expect(code).toContain('task.containingProject');
      expect(code).toContain('.name');
      expect(code).toContain('Work');
    });

    it('emits ID-based project check for long alphanumeric strings', () => {
      const ast: FilterNode = {
        type: 'comparison',
        field: 'task.containingProject',
        operator: '==',
        value: 'abcdef123456789',
      };
      const code = emitOmniJS(ast);
      expect(code).toContain('id.primaryKey');
      expect(code).toContain('abcdef123456789');
    });

    it('emits project != comparison', () => {
      const ast: FilterNode = {
        type: 'comparison',
        field: 'task.containingProject',
        operator: '!=',
        value: 'Personal',
      };
      const code = emitOmniJS(ast);
      expect(code).toContain('!');
      expect(code).toContain('Personal');
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
          value: ['waiting', 'someday'],
        },
      };
      const code = emitOmniJS(ast);
      expect(code).toContain('!');
      expect(code).toContain('taskTags.some');
      expect(code).toContain('waiting');
      expect(code).toContain('someday');
    });
  });

  describe('tagStatusValid != false', () => {
    it('emits valid tag status check for tagStatusValid != false', () => {
      const ast: FilterNode = {
        type: 'comparison',
        field: 'task.tagStatusValid',
        operator: '!=',
        value: false,
      };
      const code = emitOmniJS(ast);
      // != false should be same as == true
      expect(code).toContain('task.tags.length === 0');
      expect(code).toContain('Tag.Status.Active');
    });
  });

  describe('inInbox comparisons', () => {
    it('emits inInbox true check', () => {
      const ast: FilterNode = {
        type: 'comparison',
        field: 'task.inInbox',
        operator: '==',
        value: true,
      };
      const code = emitOmniJS(ast);
      expect(code).toBe('task.inInbox === true');
    });

    it('emits inInbox false check', () => {
      const ast: FilterNode = {
        type: 'comparison',
        field: 'task.inInbox',
        operator: '==',
        value: false,
      };
      const code = emitOmniJS(ast);
      expect(code).toBe('task.inInbox === false');
    });
  });

  describe('exists for various date fields', () => {
    it('emits deferDate exists check', () => {
      const ast: FilterNode = {
        type: 'exists',
        field: 'task.deferDate',
        exists: true,
      };
      const code = emitOmniJS(ast);
      expect(code).toBe('task.deferDate !== null');
    });

    it('emits plannedDate not exists check', () => {
      const ast: FilterNode = {
        type: 'exists',
        field: 'task.plannedDate',
        exists: false,
      };
      const code = emitOmniJS(ast);
      expect(code).toBe('task.plannedDate === null');
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

    it('handles nested logical nodes', () => {
      const ast: FilterNode = {
        type: 'and',
        children: [
          { type: 'comparison', field: 'task.completed', operator: '==', value: false },
          {
            type: 'or',
            children: [
              { type: 'comparison', field: 'task.flagged', operator: '==', value: true },
              {
                type: 'and',
                children: [
                  { type: 'exists', field: 'task.dueDate', exists: true },
                  { type: 'comparison', field: 'task.dueDate', operator: '<=', value: '2025-12-31' },
                ],
              },
            ],
          },
        ],
      };
      const code = emitOmniJS(ast);
      expect(code).toContain('&&');
      expect(code).toContain('||');
      expect(code).toContain('task.completed === false');
      expect(code).toContain('task.flagged === true');
      expect(code).toContain('task.dueDate !== null');
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
