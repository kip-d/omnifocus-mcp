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
      const result = generateFilterCode(filter, 'omnijs');

      expect(result.predicate).toBe('task.completed === false');
    });

    it('generates JXA code for simple boolean filter', () => {
      const filter: TaskFilter = { completed: false };
      const result = generateFilterCode(filter, 'jxa');

      expect(result.predicate).toBe('task.completed() === false');
    });

    it('generates code for combined filters', () => {
      const filter: TaskFilter = {
        completed: false,
        flagged: true,
        tags: ['work'],
        tagsOperator: 'OR',
      };
      const result = generateFilterCode(filter, 'omnijs');

      expect(result.predicate).toContain('task.completed === false');
      expect(result.predicate).toContain('task.flagged === true');
      expect(result.predicate).toContain('taskTags');
      expect(result.predicate).toContain('&&'); // All conditions ANDed together
    });

    it('defaults to omnijs target', () => {
      const filter: TaskFilter = { flagged: true };
      const result = generateFilterCode(filter);

      // OmniJS uses direct property access (no parentheses)
      expect(result.predicate).toBe('task.flagged === true');
    });

    it('returns true for empty filter', () => {
      const filter: TaskFilter = {};
      const result = generateFilterCode(filter);

      expect(result.predicate).toBe('true');
    });

    it('generateFilterCode returns EmitResult with preamble and predicate', () => {
      const filter = { completed: false, flagged: true };
      const result = generateFilterCode(filter);
      expect(result).toHaveProperty('preamble');
      expect(result).toHaveProperty('predicate');
      expect(result.preamble).toBe('');
      expect(result.predicate).toContain('task.completed');
    });

    it('generateFilterCode returns preamble for project filter', () => {
      const filter = { projectId: 'My Project' };
      const result = generateFilterCode(filter);
      expect(result.preamble).toContain('Project.byIdentifier');
      expect(result.predicate).toContain('__projectTarget_0');
    });
  });

  describe('tag filters', () => {
    it('generates OR tag filter', () => {
      const filter: TaskFilter = { tags: ['urgent', 'important'], tagsOperator: 'OR' };
      const result = generateFilterCode(filter, 'omnijs');

      expect(result.predicate).toContain('taskTags.some');
      expect(result.predicate).toContain('urgent');
      expect(result.predicate).toContain('important');
    });

    it('generates AND tag filter', () => {
      const filter: TaskFilter = { tags: ['work', 'meeting'], tagsOperator: 'AND' };
      const result = generateFilterCode(filter, 'omnijs');

      expect(result.predicate).toContain('every');
      expect(result.predicate).toContain('work');
      expect(result.predicate).toContain('meeting');
    });

    it('generates NOT_IN tag filter', () => {
      const filter: TaskFilter = { tags: ['waiting'], tagsOperator: 'NOT_IN' };
      const result = generateFilterCode(filter, 'omnijs');

      expect(result.predicate).toContain('!');
      expect(result.predicate).toContain('some');
      expect(result.predicate).toContain('waiting');
    });
  });

  describe('date filters', () => {
    it('generates due date before filter', () => {
      const filter: TaskFilter = { dueBefore: '2025-12-31' };
      const result = generateFilterCode(filter, 'omnijs');

      expect(result.predicate).toContain('task.dueDate !== null');
      expect(result.predicate).toContain('task.dueDate <=');
      expect(result.predicate).toContain('2025-12-31');
    });

    it('generates due date after filter', () => {
      const filter: TaskFilter = { dueAfter: '2025-01-01' };
      const result = generateFilterCode(filter, 'omnijs');

      expect(result.predicate).toContain('task.dueDate !== null');
      expect(result.predicate).toContain('task.dueDate >=');
      expect(result.predicate).toContain('2025-01-01');
    });

    it('generates due date range filter (BETWEEN)', () => {
      const filter: TaskFilter = {
        dueAfter: '2025-01-01',
        dueBefore: '2025-12-31',
        dueDateOperator: 'BETWEEN',
      };
      const result = generateFilterCode(filter, 'omnijs');

      expect(result.predicate).toContain('task.dueDate !== null');
      expect(result.predicate).toContain('>=');
      expect(result.predicate).toContain('<=');
    });
  });

  describe('text filters', () => {
    it('generates contains text filter', () => {
      const filter: TaskFilter = { text: 'review', textOperator: 'CONTAINS' };
      const result = generateFilterCode(filter, 'omnijs');

      expect(result.predicate).toContain('includes');
      expect(result.predicate).toContain('review');
    });

    it('generates matches text filter', () => {
      const filter: TaskFilter = { text: '^meeting', textOperator: 'MATCHES' };
      const result = generateFilterCode(filter, 'omnijs');

      expect(result.predicate).toContain('test');
      expect(result.predicate).toContain('^meeting');
    });
  });

  describe('synthetic status fields end-to-end', () => {
    it('generates OmniJS code for dropped: true using Task.Status enum', () => {
      const filter: TaskFilter = { dropped: true };
      const result = generateFilterCode(filter, 'omnijs');

      expect(result.predicate).toBe('task.taskStatus === Task.Status.Dropped');
    });

    it('generates OmniJS code for dropped: false', () => {
      const filter: TaskFilter = { dropped: false };
      const result = generateFilterCode(filter, 'omnijs');

      expect(result.predicate).toBe('task.taskStatus !== Task.Status.Dropped');
    });

    it('generates OmniJS code for available: true using Task.Status enum', () => {
      const filter: TaskFilter = { available: true };
      const result = generateFilterCode(filter, 'omnijs');

      expect(result.predicate).toBe('task.taskStatus === Task.Status.Available');
    });

    it('generates OmniJS code for blocked: true using Task.Status enum', () => {
      const filter: TaskFilter = { blocked: true };
      const result = generateFilterCode(filter, 'omnijs');

      expect(result.predicate).toBe('task.taskStatus === Task.Status.Blocked');
    });

    it('generates JXA code for dropped: true as direct method call', () => {
      const filter: TaskFilter = { dropped: true };
      const result = generateFilterCode(filter, 'jxa');

      // JXA doesn't use Task.Status enum
      expect(result.predicate).toBe('task.dropped() === true');
    });

    it('generates JXA code for available: true as direct method call', () => {
      const filter: TaskFilter = { available: true };
      const result = generateFilterCode(filter, 'jxa');

      expect(result.predicate).toBe('task.available() === true');
    });
  });

  describe('tagStatusValid end-to-end', () => {
    it('generates OmniJS code for tagStatusValid: true', () => {
      const filter: TaskFilter = { tagStatusValid: true };
      const result = generateFilterCode(filter, 'omnijs');

      expect(result.predicate).toContain('task.tags.length === 0');
      expect(result.predicate).toContain('Tag.Status.Active');
    });

    it('generates OmniJS code for tagStatusValid: false', () => {
      const filter: TaskFilter = { tagStatusValid: false };
      const result = generateFilterCode(filter, 'omnijs');

      expect(result.predicate).toContain('task.tags.length > 0');
      expect(result.predicate).toContain('!task.tags.some');
    });
  });

  describe('defer date end-to-end', () => {
    it('generates OmniJS code for defer date range', () => {
      const filter: TaskFilter = { deferAfter: '2025-01-01', deferBefore: '2025-06-30' };
      const result = generateFilterCode(filter, 'omnijs');

      expect(result.predicate).toContain('task.deferDate !== null');
      expect(result.predicate).toContain('2025-01-01');
      expect(result.predicate).toContain('2025-06-30');
    });

    it('generates JXA code for defer date before', () => {
      const filter: TaskFilter = { deferBefore: '2025-12-31' };
      const result = generateFilterCode(filter, 'jxa');

      expect(result.predicate).toContain('task.deferDate()');
      expect(result.predicate).toContain('!== null');
      expect(result.predicate).toContain('2025-12-31');
    });
  });

  describe('planned date end-to-end', () => {
    it('generates OmniJS code for planned date range', () => {
      const filter: TaskFilter = {
        plannedAfter: '2025-03-01',
        plannedBefore: '2025-03-31',
        plannedDateOperator: 'BETWEEN',
      };
      const result = generateFilterCode(filter, 'omnijs');

      expect(result.predicate).toContain('task.plannedDate !== null');
      expect(result.predicate).toContain('>=');
      expect(result.predicate).toContain('<=');
    });

    it('generates JXA code for planned date after', () => {
      const filter: TaskFilter = { plannedAfter: '2025-01-01' };
      const result = generateFilterCode(filter, 'jxa');

      expect(result.predicate).toContain('task.plannedDate()');
      expect(result.predicate).toContain('2025-01-01');
    });
  });

  describe('JXA target for combined filters', () => {
    it('generates JXA code for combined filters', () => {
      const filter: TaskFilter = {
        completed: false,
        flagged: true,
        tags: ['urgent'],
        tagsOperator: 'OR',
      };
      const result = generateFilterCode(filter, 'jxa');

      expect(result.predicate).toContain('task.completed()');
      expect(result.predicate).toContain('task.flagged()');
      expect(result.predicate).toContain('taskTags');
      expect(result.predicate).toContain('&&');
    });
  });
});

describe('generateFilterCodeSafe', () => {
  it('returns success result for valid filter', () => {
    const filter: TaskFilter = { flagged: true };
    const result = generateFilterCodeSafe(filter);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.code.predicate).toBe('task.flagged === true');
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

describe('generateFilterCodeSafe with JXA target', () => {
  it('returns success with JXA target', () => {
    const filter: TaskFilter = { completed: false, flagged: true };
    const result = generateFilterCodeSafe(filter, 'jxa');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.target).toBe('jxa');
      expect(result.code.predicate).toContain('task.completed()');
      expect(result.code.predicate).toContain('task.flagged()');
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

  it('generateFilterFunction places preamble before function body', () => {
    const filter = { projectId: 'Work' };
    const result = generateFilterFunction(filter);
    const preambleIndex = result.indexOf('__projectTarget_0 = (function');
    const functionIndex = result.indexOf('function matchesFilter');
    expect(preambleIndex).toBeGreaterThanOrEqual(0);
    expect(preambleIndex).toBeLessThan(functionIndex);
  });

  it('generateFilterFunction omits preamble when not needed', () => {
    const filter = { flagged: true };
    const result = generateFilterFunction(filter);
    expect(result).not.toContain('__projectTarget');
    expect(result).toContain('function matchesFilter');
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
    expect(
      describeFilter({
        dueAfter: '2025-01-01',
        dueBefore: '2025-12-31',
      }),
    ).toContain('due between');
  });

  it('describes text search', () => {
    expect(describeFilter({ text: 'review' })).toContain('name CONTAINS "review"');
    expect(describeFilter({ text: '^meet', textOperator: 'MATCHES' })).toContain('name MATCHES "^meet"');
  });

  it('describes blocked filter', () => {
    expect(describeFilter({ blocked: true })).toContain('blocked');
    expect(describeFilter({ blocked: false })).toContain('not blocked');
  });

  it('describes available filter', () => {
    expect(describeFilter({ available: true })).toContain('available');
    expect(describeFilter({ available: false })).toContain('not available');
  });

  it('describes inInbox filter', () => {
    expect(describeFilter({ inInbox: true })).toContain('in inbox');
    expect(describeFilter({ inInbox: false })).toContain('not in inbox');
  });

  it('describes project ID', () => {
    expect(describeFilter({ projectId: 'abc123' })).toContain('in project abc123');
  });

  it('describes ID filter', () => {
    expect(describeFilter({ id: 'task-xyz' })).toContain('id = task-xyz');
  });
});
