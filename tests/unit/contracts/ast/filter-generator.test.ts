import { describe, it, expect } from 'vitest';
import {
  generateFilterCode,
  generateFilterCodeSafe,
  generateFilterFunction,
  generateFilterBlock,
  isEmptyFilter,
  describeFilter,
} from '../../../../src/contracts/ast/filter-generator.js';
import type { TaskFilter } from '../../../../src/contracts/filters.js';

describe('generateFilterCode', () => {
  describe('end-to-end pipeline', () => {
    it('generates OmniJS code for simple boolean filter', () => {
      const filter: TaskFilter = { completed: false };
      const code = generateFilterCode(filter, 'omnijs');

      expect(code).toBe('task.completed === false');
    });

    it('generates JXA code for simple boolean filter', () => {
      const filter: TaskFilter = { completed: false };
      const code = generateFilterCode(filter, 'jxa');

      expect(code).toBe('task.completed() === false');
    });

    it('generates code for combined filters', () => {
      const filter: TaskFilter = {
        completed: false,
        flagged: true,
        tags: ['work'],
        tagsOperator: 'OR',
      };
      const code = generateFilterCode(filter, 'omnijs');

      expect(code).toContain('task.completed === false');
      expect(code).toContain('task.flagged === true');
      expect(code).toContain('taskTags');
      expect(code).toContain('&&'); // All conditions ANDed together
    });

    it('defaults to omnijs target', () => {
      const filter: TaskFilter = { flagged: true };
      const code = generateFilterCode(filter);

      // OmniJS uses direct property access (no parentheses)
      expect(code).toBe('task.flagged === true');
    });

    it('returns true for empty filter', () => {
      const filter: TaskFilter = {};
      const code = generateFilterCode(filter);

      expect(code).toBe('true');
    });
  });

  describe('tag filters', () => {
    it('generates OR tag filter', () => {
      const filter: TaskFilter = { tags: ['urgent', 'important'], tagsOperator: 'OR' };
      const code = generateFilterCode(filter, 'omnijs');

      expect(code).toContain('taskTags.some');
      expect(code).toContain('urgent');
      expect(code).toContain('important');
    });

    it('generates AND tag filter', () => {
      const filter: TaskFilter = { tags: ['work', 'meeting'], tagsOperator: 'AND' };
      const code = generateFilterCode(filter, 'omnijs');

      expect(code).toContain('every');
      expect(code).toContain('work');
      expect(code).toContain('meeting');
    });

    it('generates NOT_IN tag filter', () => {
      const filter: TaskFilter = { tags: ['waiting'], tagsOperator: 'NOT_IN' };
      const code = generateFilterCode(filter, 'omnijs');

      expect(code).toContain('!');
      expect(code).toContain('some');
      expect(code).toContain('waiting');
    });
  });

  describe('date filters', () => {
    it('generates due date before filter', () => {
      const filter: TaskFilter = { dueBefore: '2025-12-31' };
      const code = generateFilterCode(filter, 'omnijs');

      expect(code).toContain('task.dueDate !== null');
      expect(code).toContain('task.dueDate <=');
      expect(code).toContain('2025-12-31');
    });

    it('generates due date after filter', () => {
      const filter: TaskFilter = { dueAfter: '2025-01-01' };
      const code = generateFilterCode(filter, 'omnijs');

      expect(code).toContain('task.dueDate !== null');
      expect(code).toContain('task.dueDate >=');
      expect(code).toContain('2025-01-01');
    });

    it('generates due date range filter (BETWEEN)', () => {
      const filter: TaskFilter = {
        dueAfter: '2025-01-01',
        dueBefore: '2025-12-31',
        dueDateOperator: 'BETWEEN',
      };
      const code = generateFilterCode(filter, 'omnijs');

      expect(code).toContain('task.dueDate !== null');
      expect(code).toContain('>=');
      expect(code).toContain('<=');
    });
  });

  describe('text filters', () => {
    it('generates contains text filter', () => {
      const filter: TaskFilter = { text: 'review', textOperator: 'CONTAINS' };
      const code = generateFilterCode(filter, 'omnijs');

      expect(code).toContain('includes');
      expect(code).toContain('review');
    });

    it('generates matches text filter', () => {
      const filter: TaskFilter = { text: '^meeting', textOperator: 'MATCHES' };
      const code = generateFilterCode(filter, 'omnijs');

      expect(code).toContain('test');
      expect(code).toContain('^meeting');
    });
  });
});

describe('generateFilterCodeSafe', () => {
  it('returns success result for valid filter', () => {
    const filter: TaskFilter = { flagged: true };
    const result = generateFilterCodeSafe(filter);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.code).toBe('task.flagged === true');
      expect(result.ast.type).toBe('comparison');
      expect(result.validation.valid).toBe(true);
      expect(result.target).toBe('omnijs');
    }
  });

  it('returns full AST and validation details', () => {
    const filter: TaskFilter = {
      completed: false,
      flagged: true,
    };
    const result = generateFilterCodeSafe(filter);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.ast.type).toBe('and');
      expect(result.validation.errors).toHaveLength(0);
      expect(result.validation.warnings).toHaveLength(0);
    }
  });
});

describe('generateFilterFunction', () => {
  it('generates a callable function', () => {
    const filter: TaskFilter = { completed: false };
    const fnCode = generateFilterFunction(filter, 'omnijs');

    expect(fnCode).toContain('function matchesFilter(task, taskTags)');
    expect(fnCode).toContain('return');
    expect(fnCode).toContain('task.completed === false');
  });

  it('includes taskTags helper in function', () => {
    const filter: TaskFilter = { tags: ['work'], tagsOperator: 'OR' };
    const fnCode = generateFilterFunction(filter, 'omnijs');

    expect(fnCode).toContain('taskTags = taskTags || (task.tags');
  });
});

describe('generateFilterBlock', () => {
  it('generates a complete filter block for OmniJS', () => {
    const filter: TaskFilter = { flagged: true };
    const block = generateFilterBlock(filter);

    expect(block).toContain('const taskTags');
    expect(block).toContain('const matchesFilter');
    expect(block).toContain('if (!matchesFilter) return');
  });
});

describe('isEmptyFilter', () => {
  it('returns true for empty filter', () => {
    expect(isEmptyFilter({})).toBe(true);
  });

  it('returns false for filter with conditions', () => {
    expect(isEmptyFilter({ flagged: true })).toBe(false);
    expect(isEmptyFilter({ completed: false })).toBe(false);
    expect(isEmptyFilter({ tags: ['work'] })).toBe(false);
  });
});

describe('describeFilter', () => {
  it('describes empty filter', () => {
    expect(describeFilter({})).toBe('all tasks');
  });

  it('describes single condition', () => {
    expect(describeFilter({ flagged: true })).toBe('flagged');
    expect(describeFilter({ completed: false })).toBe('not completed');
  });

  it('describes multiple conditions', () => {
    const description = describeFilter({
      completed: false,
      flagged: true,
      tags: ['work', 'urgent'],
      tagsOperator: 'OR',
    });

    expect(description).toContain('not completed');
    expect(description).toContain('flagged');
    expect(description).toContain('tags OR [work, urgent]');
    expect(description).toContain('AND'); // Conditions joined with AND
  });

  it('describes date ranges', () => {
    expect(describeFilter({ dueBefore: '2025-12-31' })).toContain('due before 2025-12-31');
    expect(describeFilter({ dueAfter: '2025-01-01' })).toContain('due after 2025-01-01');
    expect(describeFilter({
      dueAfter: '2025-01-01',
      dueBefore: '2025-12-31',
    })).toContain('due between');
  });

  it('describes text search', () => {
    expect(describeFilter({ text: 'review' })).toContain('name CONTAINS "review"');
    expect(describeFilter({ text: '^meet', textOperator: 'MATCHES' })).toContain('name MATCHES "^meet"');
  });
});
