import { describe, it, expect } from 'vitest';
import {
  buildFilteredTasksScript,
  buildInboxScript,
  buildTaskByIdScript,
} from '../../../../src/contracts/ast/script-builder.js';
import type { TaskFilter } from '../../../../src/contracts/filters.js';

describe('buildFilteredTasksScript', () => {
  describe('basic script generation', () => {
    it('generates valid OmniJS script for empty filter', () => {
      const result = buildFilteredTasksScript({});

      expect(result.script).toContain('flattenedTasks.forEach');
      expect(result.script).toContain('matchesFilter');
      expect(result.script).toContain('return true'); // Empty filter returns true
      expect(result.isEmptyFilter).toBe(true);
      expect(result.filterDescription).toBe('all tasks');
    });

    it('generates script with AST filter predicate', () => {
      const filter: TaskFilter = { completed: false, flagged: true };
      const result = buildFilteredTasksScript(filter);

      expect(result.script).toContain('task.completed === false');
      expect(result.script).toContain('task.flagged === true');
      expect(result.isEmptyFilter).toBe(false);
    });

    it('respects limit option', () => {
      const result = buildFilteredTasksScript({}, { limit: 100 });

      expect(result.script).toContain('const limit = 100');
    });

    it('generates field projections', () => {
      const result = buildFilteredTasksScript({}, { fields: ['id', 'name', 'flagged'] });

      expect(result.script).toContain('id: task.id.primaryKey');
      expect(result.script).toContain('name: task.name');
      expect(result.script).toContain('flagged: task.flagged');
    });

    it('excludes completed tasks by default', () => {
      const result = buildFilteredTasksScript({});

      expect(result.script).toContain('if (task.completed) return');
    });

    it('includes completed tasks when option is true', () => {
      const result = buildFilteredTasksScript({}, { includeCompleted: true });

      expect(result.script).not.toContain('if (task.completed) return');
    });

    it('uses filter completion status over option', () => {
      // When filter explicitly sets completed, it should be in the predicate
      const result = buildFilteredTasksScript({ completed: true });

      // Should NOT have the default completion check (AST handles it)
      expect(result.script).not.toMatch(/if \(task\.completed\) return;/);
      // Should have the AST filter checking completed
      expect(result.script).toContain('task.completed === true');
    });
  });

  describe('tag filters', () => {
    it('generates script with OR tag filter', () => {
      const filter: TaskFilter = { tags: ['work', 'urgent'], tagsOperator: 'OR' };
      const result = buildFilteredTasksScript(filter);

      expect(result.script).toContain('taskTags');
      expect(result.script).toContain('some');
      expect(result.script).toContain('work');
      expect(result.script).toContain('urgent');
    });

    it('generates script with AND tag filter', () => {
      const filter: TaskFilter = { tags: ['work', 'meeting'], tagsOperator: 'AND' };
      const result = buildFilteredTasksScript(filter);

      expect(result.script).toContain('every');
    });

    it('generates script with NOT_IN tag filter', () => {
      const filter: TaskFilter = { tags: ['waiting'], tagsOperator: 'NOT_IN' };
      const result = buildFilteredTasksScript(filter);

      expect(result.script).toContain('!');
      expect(result.script).toContain('some');
    });
  });

  describe('date filters', () => {
    it('generates script with due date range', () => {
      const filter: TaskFilter = {
        dueAfter: '2025-01-01',
        dueBefore: '2025-12-31',
      };
      const result = buildFilteredTasksScript(filter);

      expect(result.script).toContain('task.dueDate');
      expect(result.script).toContain('2025-01-01');
      expect(result.script).toContain('2025-12-31');
    });
  });

  describe('text filters', () => {
    it('generates script with text search', () => {
      const filter: TaskFilter = { text: 'review', textOperator: 'CONTAINS' };
      const result = buildFilteredTasksScript(filter);

      expect(result.script).toContain('includes');
      expect(result.script).toContain('review');
    });
  });

  describe('combined filters', () => {
    it('generates script with multiple filter types', () => {
      const filter: TaskFilter = {
        completed: false,
        flagged: true,
        tags: ['work'],
        tagsOperator: 'OR',
        text: 'important',
      };
      const result = buildFilteredTasksScript(filter);

      expect(result.script).toContain('task.completed === false');
      expect(result.script).toContain('task.flagged === true');
      expect(result.script).toContain('taskTags.some');
      expect(result.script).toContain('includes');
      expect(result.filterDescription).toContain('active');
      expect(result.filterDescription).toContain('flagged');
    });
  });

  describe('script structure', () => {
    it('generates valid IIFE structure', () => {
      const result = buildFilteredTasksScript({});

      expect(result.script).toMatch(/^\(\(\) => \{/);
      expect(result.script).toMatch(/\}\)\(\)$/);
    });

    it('returns JSON stringified result', () => {
      const result = buildFilteredTasksScript({});

      expect(result.script).toContain('JSON.stringify');
      expect(result.script).toContain('tasks: results');
      expect(result.script).toContain('count: results.length');
      expect(result.script).toContain("mode: 'ast_filtered'");
    });
  });
});

describe('buildInboxScript', () => {
  it('generates script using inbox collection', () => {
    const result = buildInboxScript();

    expect(result.script).toContain('inbox.forEach');
    expect(result.script).not.toContain('flattenedTasks.forEach');
  });

  it('applies additional filters', () => {
    const result = buildInboxScript({ flagged: true });

    expect(result.script).toContain('inbox.forEach');
    expect(result.script).toContain('task.flagged === true');
  });

  it('respects limit option', () => {
    const result = buildInboxScript({}, { limit: 10 });

    expect(result.script).toContain('const limit = 10');
  });

  it('generates field projections', () => {
    const result = buildInboxScript({}, { fields: ['id', 'name'] });

    expect(result.script).toContain('id: task.id.primaryKey');
    expect(result.script).toContain('name: task.name');
  });
});

describe('buildTaskByIdScript', () => {
  it('generates script to find task by ID', () => {
    const result = buildTaskByIdScript('abc123');

    expect(result.script).toContain('targetId');
    expect(result.script).toContain('abc123');
    expect(result.script).toContain('task.id.primaryKey === targetId');
  });

  it('generates field projections', () => {
    const result = buildTaskByIdScript('abc123', ['id', 'name', 'flagged']);

    expect(result.script).toContain('id: task.id.primaryKey');
    expect(result.script).toContain('name: task.name');
    expect(result.script).toContain('flagged: task.flagged');
  });

  it('sets correct filter description', () => {
    const result = buildTaskByIdScript('abc123');

    expect(result.filterDescription).toBe('id = abc123');
  });
});
