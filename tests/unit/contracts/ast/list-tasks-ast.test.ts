import { describe, it, expect } from 'vitest';
import { buildListTasksScriptV4 } from '../../../../src/omnifocus/scripts/tasks/list-tasks-ast.js';
import type { TaskFilter } from '../../../../src/contracts/filters.js';

describe('buildListTasksScriptV4', () => {
  describe('basic script generation', () => {
    it('generates JXA wrapper with OmniJS script', () => {
      const script = buildListTasksScriptV4({ filter: {} });

      // Should be a JXA script that calls evaluateJavascript
      expect(script).toContain("Application('OmniFocus')");
      expect(script).toContain('evaluateJavascript');
    });

    it('includes AST metadata in response', () => {
      const script = buildListTasksScriptV4({ filter: {} });

      expect(script).toContain("optimization: 'ast_v4'");
      expect(script).toContain("architecture: 'ast_first'");
    });

    it('embeds AST-generated filter predicate', () => {
      const filter: TaskFilter = { completed: false, flagged: true };
      const script = buildListTasksScriptV4({ filter });

      // Should contain the AST-generated filter logic
      expect(script).toContain('task.completed === false');
      expect(script).toContain('task.flagged === true');
    });
  });

  describe('mode routing', () => {
    it('uses inbox collection for inbox mode', () => {
      const script = buildListTasksScriptV4({
        filter: {},
        mode: 'inbox',
      });

      expect(script).toContain('inbox.forEach');
      expect(script).not.toContain('flattenedTasks.forEach');
    });

    it('uses inbox collection when inInbox filter is set', () => {
      const script = buildListTasksScriptV4({
        filter: { inInbox: true },
      });

      expect(script).toContain('inbox.forEach');
    });

    it('uses ID lookup when id filter is set', () => {
      const script = buildListTasksScriptV4({
        filter: { id: 'task-123' },
      });

      expect(script).toContain('task-123');
      expect(script).toContain('task.id.primaryKey === targetId');
    });

    it('uses flattenedTasks for general queries', () => {
      const script = buildListTasksScriptV4({
        filter: { flagged: true },
      });

      expect(script).toContain('flattenedTasks.forEach');
    });
  });

  describe('options handling', () => {
    it('respects limit parameter', () => {
      const script = buildListTasksScriptV4({
        filter: {},
        limit: 100,
      });

      expect(script).toContain('limit_applied: 100');
    });

    it('generates field projections', () => {
      const script = buildListTasksScriptV4({
        filter: {},
        fields: ['id', 'name', 'flagged'],
      });

      expect(script).toContain('id: task.id.primaryKey');
      expect(script).toContain('name: task.name');
      expect(script).toContain('flagged: task.flagged');
    });
  });

  describe('filter types', () => {
    it('handles tag filters', () => {
      const script = buildListTasksScriptV4({
        filter: { tags: ['work', 'urgent'], tagsOperator: 'OR' },
      });

      expect(script).toContain('taskTags');
      expect(script).toContain('some');
    });

    it('handles date filters', () => {
      const script = buildListTasksScriptV4({
        filter: { dueBefore: '2025-12-31' },
      });

      expect(script).toContain('task.dueDate');
      expect(script).toContain('2025-12-31');
    });

    it('handles text filters', () => {
      const script = buildListTasksScriptV4({
        filter: { text: 'review' },
      });

      expect(script).toContain('includes');
      expect(script).toContain('review');
    });

    it('handles combined filters', () => {
      const script = buildListTasksScriptV4({
        filter: {
          completed: false,
          flagged: true,
          tags: ['work'],
          tagsOperator: 'AND',
        },
      });

      expect(script).toContain('task.completed === false');
      expect(script).toContain('task.flagged === true');
      expect(script).toContain('every'); // AND operator for tags
    });
  });

  describe('error handling', () => {
    it('includes try-catch for error handling', () => {
      const script = buildListTasksScriptV4({ filter: {} });

      expect(script).toContain('try {');
      expect(script).toContain('catch (error)');
      expect(script).toContain('error: true');
    });

    it('includes context in error response', () => {
      const script = buildListTasksScriptV4({ filter: {} });

      expect(script).toContain("context: 'list_tasks_v4_ast'");
    });
  });

  describe('script escaping', () => {
    it('properly escapes template strings', () => {
      // Filter with special characters that might break template strings
      const script = buildListTasksScriptV4({
        filter: { text: 'test`value' },
      });

      // Should not break the script structure
      expect(script).toContain('Application');
      expect(script).toContain('evaluateJavascript');
    });
  });
});
