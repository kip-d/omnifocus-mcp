import { describe, it, expect } from 'vitest';
import {
  buildFilteredTasksScript,
  buildInboxScript,
  buildTaskByIdScript,
  buildRecurringTasksScript,
  buildTaskCountScript,
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

describe('buildFilteredTasksScript offset pagination', () => {
  it('skips first N tasks when offset is specified', () => {
    const result = buildFilteredTasksScript({}, { offset: 10, limit: 25 });

    // Should include offset tracking
    expect(result.script).toContain('const offset = 10');
    // Should skip tasks before adding to results
    expect(result.script).toMatch(/skipped\s*<\s*offset/);
  });

  it('generates correct slice logic with offset and limit', () => {
    const result = buildFilteredTasksScript({}, { offset: 5, limit: 10 });

    // Should have both offset and limit variables
    expect(result.script).toContain('const offset = 5');
    expect(result.script).toContain('const limit = 10');
    // Should track skipped count
    expect(result.script).toContain('skipped');
  });

  it('does not include offset logic when offset is 0 or not specified', () => {
    const result = buildFilteredTasksScript({}, { limit: 25 });

    // Should not have offset tracking when not needed
    expect(result.script).not.toContain('const offset =');
    expect(result.script).not.toContain('skipped');
  });

  it('includes offset in metadata', () => {
    const result = buildFilteredTasksScript({}, { offset: 10 });

    expect(result.script).toContain('offset_applied');
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

  it('skips first N tasks when offset is specified', () => {
    const result = buildInboxScript({}, { offset: 5, limit: 10 });

    expect(result.script).toContain('const offset = 5');
    expect(result.script).toMatch(/skipped\s*<\s*offset/);
  });

  it('does not include offset logic when offset is 0 or not specified', () => {
    const result = buildInboxScript({}, { limit: 10 });

    expect(result.script).not.toContain('const offset =');
    expect(result.script).not.toContain('skipped');
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

describe('inInbox field projection', () => {
  it('should use task.inInbox for inInbox field projection (not containingProject)', () => {
    const result = buildFilteredTasksScript(
      {},
      {
        fields: ['id', 'name', 'inInbox'],
      },
    );
    // Must use native task.inInbox, NOT !task.containingProject
    expect(result.script).toContain('inInbox: task.inInbox');
    expect(result.script).not.toContain('inInbox: !task.containingProject');
  });
});

describe('field projections for today mode', () => {
  it('generates reason field IIFE with default 3-day dueSoonDays', () => {
    const result = buildFilteredTasksScript({}, { fields: ['id', 'name', 'reason'] });

    expect(result.script).toContain('reason:');
    expect(result.script).toContain("return 'overdue'");
    expect(result.script).toContain("return 'due_soon'");
    expect(result.script).toContain("return 'flagged'");
    // Default dueSoonDays is 3
    expect(result.script).toContain('getDate() + 3');
  });

  it('generates daysOverdue field IIFE', () => {
    const result = buildFilteredTasksScript({}, { fields: ['id', 'daysOverdue'] });

    expect(result.script).toContain('daysOverdue:');
    expect(result.script).toContain('86400000');
    expect(result.script).toContain('task.dueDate');
  });

  it('generates modified field projection', () => {
    const result = buildFilteredTasksScript({}, { fields: ['id', 'modified'] });

    expect(result.script).toContain('modified:');
    expect(result.script).toContain('task.modified');
    expect(result.script).toContain('toISOString');
  });

  it('threads dueSoonDays to reason field when provided via filter', () => {
    const filter = { todayMode: true, dueBefore: '2026-02-12', dueSoonDays: 5 };
    const result = buildFilteredTasksScript(filter, { fields: ['reason'] });

    expect(result.script).toContain('getDate() + 5');
  });
});

describe('buildRecurringTasksScript', () => {
  describe('basic script generation', () => {
    it('generates valid OmniJS script for recurring tasks', () => {
      const result = buildRecurringTasksScript();

      expect(result.script).toContain('flattenedTasks.forEach');
      expect(result.script).toContain('matchesFilter');
      expect(result.script).toContain('task.repetitionRule !== null'); // hasRepetitionRule filter
      expect(result.isEmptyFilter).toBe(false); // Always has hasRepetitionRule filter
    });

    it('includes AST filter for active tasks by default', () => {
      const result = buildRecurringTasksScript();

      expect(result.script).toContain('task.repetitionRule !== null');
      expect(result.script).toContain('task.completed === false');
      expect(result.script).toContain('task.taskStatus !== Task.Status.Dropped');
      expect(result.filterDescription).toContain('recurring');
      expect(result.filterDescription).toContain('active');
      expect(result.filterDescription).toContain('not dropped');
    });

    it('includes completed tasks when includeCompleted is true', () => {
      const result = buildRecurringTasksScript({ includeCompleted: true });

      // Should NOT have completed === false filter
      expect(result.script).not.toContain('task.completed === false');
      // But should still have dropped filter
      expect(result.script).toContain('task.taskStatus !== Task.Status.Dropped');
    });

    it('includes dropped tasks when includeDropped is true', () => {
      const result = buildRecurringTasksScript({ includeDropped: true });

      // Should NOT have dropped filter
      expect(result.script).not.toContain('Task.Status.Dropped');
      // But should still have completed filter
      expect(result.script).toContain('task.completed === false');
    });
  });

  describe('options handling', () => {
    it('respects limit option', () => {
      const result = buildRecurringTasksScript({ limit: 500 });

      expect(result.script).toContain('limit: 500');
    });

    it('applies project filter when projectId is specified', () => {
      const result = buildRecurringTasksScript({ projectId: 'proj123' });

      expect(result.script).toContain('proj123');
      expect(result.filterDescription).toContain('project');
    });

    it('passes sortBy option to script', () => {
      const result = buildRecurringTasksScript({ sortBy: 'dueDate' });

      expect(result.script).toContain('sortBy: "dueDate"');
    });

    it('passes includeHistory option to script', () => {
      const result = buildRecurringTasksScript({ includeHistory: true });

      expect(result.script).toContain('includeHistory: true');
    });
  });

  describe('script structure', () => {
    it('generates valid IIFE structure', () => {
      const result = buildRecurringTasksScript();

      expect(result.script).toMatch(/^\(\(\) => \{/);
      expect(result.script).toMatch(/\}\)\(\)$/);
    });

    it('returns JSON stringified result with summary', () => {
      const result = buildRecurringTasksScript();

      expect(result.script).toContain('JSON.stringify');
      expect(result.script).toContain('tasks: results');
      expect(result.script).toContain('summary: summary');
      expect(result.script).toContain("mode: 'recurring_ast'");
    });

    it('includes frequency calculation logic', () => {
      const result = buildRecurringTasksScript();

      expect(result.script).toContain('frequencyDesc');
      expect(result.script).toContain('Hourly');
      expect(result.script).toContain('Daily');
      expect(result.script).toContain('Weekly');
      expect(result.script).toContain('Monthly');
    });

    it('includes sorting logic', () => {
      const result = buildRecurringTasksScript();

      expect(result.script).toContain("case 'dueDate':");
      expect(result.script).toContain("case 'frequency':");
      expect(result.script).toContain("case 'project':");
      expect(result.script).toContain("case 'name':");
    });
  });
});

describe('buildTaskCountScript', () => {
  describe('inbox counting', () => {
    it('uses doc.inboxTasks() when inInbox is true', () => {
      const result = buildTaskCountScript({ inInbox: true });
      expect(result.script).toContain('doc.inboxTasks()');
      expect(result.script).not.toContain('doc.flattenedTasks()');
    });

    it('strips inInbox from filter code (already handled by collection)', () => {
      const result = buildTaskCountScript({ inInbox: true });
      // Should NOT generate task.inInbox() check — the collection is pre-filtered
      expect(result.script).not.toContain('task.inInbox()');
    });

    it('defaults to excluding completed tasks for inbox counts', () => {
      const result = buildTaskCountScript({ inInbox: true });
      // Should add completed: false when not explicitly set
      expect(result.script).toContain('task.completed()');
      expect(result.script).toContain('=== false');
    });

    it('respects explicit completed: true for inbox counts', () => {
      const result = buildTaskCountScript({ inInbox: true, completed: true });
      expect(result.script).toContain('doc.inboxTasks()');
      expect(result.script).toContain('task.completed() === true');
    });

    it('does not treat project: null as inbox (that is QueryCompiler concern)', () => {
      // project: null → inInbox: true conversion happens in QueryCompiler,
      // not in normalizeFilter or buildTaskCountScript
      const result = buildTaskCountScript({ project: null } as TaskFilter);
      expect(result.script).toContain('doc.flattenedTasks()');
    });
  });

  describe('non-inbox counting', () => {
    it('uses doc.flattenedTasks() for general queries', () => {
      const result = buildTaskCountScript({ flagged: true });
      expect(result.script).toContain('doc.flattenedTasks()');
      expect(result.script).not.toContain('doc.inboxTasks()');
    });

    it('generates filter code for non-inbox filters', () => {
      const result = buildTaskCountScript({ flagged: true, completed: false });
      expect(result.script).toContain('task.flagged() === true');
      expect(result.script).toContain('task.completed() === false');
    });

    it('generates empty filter as true for no filters', () => {
      const result = buildTaskCountScript({});
      expect(result.script).toContain('doc.flattenedTasks()');
      expect(result.isEmptyFilter).toBe(true);
    });
  });
});
