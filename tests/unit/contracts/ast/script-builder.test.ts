import { describe, it, expect } from 'vitest';
import {
  buildFilteredTasksScript,
  buildInboxScript,
  buildTaskByIdScript,
  buildRecurringTasksScript,
  buildTaskCountScript,
  buildFilteredProjectsScript,
  MINIMAL_FIELDS,
  DETAIL_FIELDS,
  DEFAULT_FIELDS,
  MINIMAL_PROJECT_FIELDS,
  DETAIL_PROJECT_FIELDS,
  NOTE_TRUNCATE_LENGTH,
  resolveEffectiveTaskFields,
  resolveEffectiveProjectFields,
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

  describe('OR filter (orBranches)', () => {
    it('generates script with || for orBranches', () => {
      const filter: TaskFilter = {
        orBranches: [{ flagged: true }, { completed: false }],
      };
      const result = buildFilteredTasksScript(filter);

      expect(result.script).toContain('||');
      expect(result.script).toContain('task.flagged === true');
      expect(result.script).toContain('task.completed === false');
      expect(result.isEmptyFilter).toBe(false);
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

    it('generates project name comparison for name-like project filter', () => {
      const result = buildTaskCountScript({ project: 'My Project' });
      expect(result.script).toContain('.name()');
      expect(result.script).toContain('My Project');
    });

    it('generates project ID comparison for ID-like project filter', () => {
      const result = buildTaskCountScript({ project: 'n60OG59wsSg' });
      expect(result.script).toContain('.id().primaryKey()');
      expect(result.script).toContain('n60OG59wsSg');
    });
  });
});

describe('buildFilteredTasksScript sort-before-limit', () => {
  describe('sort comparator generation', () => {
    it('includes sort comparator when sort options provided', () => {
      const result = buildFilteredTasksScript(
        {},
        {
          sort: [{ field: 'dueDate', direction: 'asc' }],
          limit: 10,
        },
      );

      expect(result.script).toContain('allResults.sort(');
      expect(result.script).toContain('sorted_in_script: true');
    });

    it('generates multi-level sort comparator', () => {
      const result = buildFilteredTasksScript(
        {},
        {
          sort: [
            { field: 'dueDate', direction: 'asc' },
            { field: 'name', direction: 'desc' },
          ],
          limit: 10,
        },
      );

      expect(result.script).toContain('allResults.sort(');
      // Should reference both fields
      expect(result.script).toContain('a.dueDate');
      expect(result.script).toContain('a.name');
    });

    it('handles desc direction with negative multiplier', () => {
      const result = buildFilteredTasksScript(
        {},
        {
          sort: [{ field: 'name', direction: 'desc' }],
          limit: 10,
        },
      );

      expect(result.script).toContain('* -1');
    });

    it('handles asc direction with positive multiplier', () => {
      const result = buildFilteredTasksScript(
        {},
        {
          sort: [{ field: 'name', direction: 'asc' }],
          limit: 10,
        },
      );

      expect(result.script).toContain('* 1');
    });

    it('generates localeCompare for string fields', () => {
      const result = buildFilteredTasksScript(
        {},
        {
          sort: [{ field: 'name', direction: 'asc' }],
          limit: 10,
        },
      );

      expect(result.script).toContain('localeCompare');
    });

    it('generates date comparison for date fields', () => {
      const result = buildFilteredTasksScript(
        {},
        {
          sort: [{ field: 'dueDate', direction: 'asc' }],
          limit: 10,
        },
      );

      // Date fields use lexicographic comparison on ISO strings
      expect(result.script).toContain('a.dueDate');
      expect(result.script).toContain('b.dueDate');
    });

    it('generates boolean comparison for boolean fields', () => {
      const result = buildFilteredTasksScript(
        {},
        {
          sort: [{ field: 'flagged', direction: 'desc' }],
          limit: 10,
        },
      );

      expect(result.script).toContain('a.flagged');
      expect(result.script).toContain('b.flagged');
    });

    it('generates numeric comparison for numeric fields', () => {
      const result = buildFilteredTasksScript(
        {},
        {
          sort: [{ field: 'estimatedMinutes', direction: 'asc' }],
          limit: 10,
        },
      );

      expect(result.script).toContain('a.estimatedMinutes');
      expect(result.script).toContain('b.estimatedMinutes');
    });
  });

  describe('sort applied before limit', () => {
    it('collects all results before sorting when sort specified', () => {
      const result = buildFilteredTasksScript(
        {},
        {
          sort: [{ field: 'dueDate', direction: 'asc' }],
          limit: 10,
        },
      );

      // Should use allResults pattern (collect all, then sort, then slice)
      expect(result.script).toContain('allResults.push(');
      expect(result.script).toContain('allResults.sort(');
      expect(result.script).toContain('allResults.slice(');
      // Should NOT have the early limit check during iteration
      expect(result.script).not.toContain('if (count >= limit) return');
    });

    it('uses early limit when no sort specified', () => {
      const result = buildFilteredTasksScript({}, { limit: 10 });

      // Should use the fast path with early limit
      expect(result.script).toContain('if (count >= limit) return');
      // Should NOT have allResults pattern
      expect(result.script).not.toContain('allResults');
    });
  });

  describe('response includes total_matched', () => {
    it('includes total_matched count when sort specified', () => {
      const result = buildFilteredTasksScript(
        {},
        {
          sort: [{ field: 'dueDate', direction: 'asc' }],
          limit: 10,
        },
      );

      expect(result.script).toContain('total_matched: allResults.length');
    });

    it('does not include total_matched when no sort specified', () => {
      const result = buildFilteredTasksScript({}, { limit: 10 });

      expect(result.script).not.toContain('total_matched');
    });
  });

  describe('offset with sort', () => {
    it('applies offset via slice when sort specified', () => {
      const result = buildFilteredTasksScript(
        {},
        {
          sort: [{ field: 'dueDate', direction: 'asc' }],
          limit: 10,
          offset: 20,
        },
      );

      // Should slice from offset to offset+limit
      expect(result.script).toContain('allResults.slice(20, 20 + 10)');
      expect(result.script).toContain('offset_applied: 20');
    });

    it('slices from 0 when no offset with sort', () => {
      const result = buildFilteredTasksScript(
        {},
        {
          sort: [{ field: 'name', direction: 'asc' }],
          limit: 5,
        },
      );

      expect(result.script).toContain('allResults.slice(0, 0 + 5)');
    });
  });

  describe('null safety in sort comparator', () => {
    it('pushes nulls to end in date sort', () => {
      const result = buildFilteredTasksScript(
        {},
        {
          sort: [{ field: 'dueDate', direction: 'asc' }],
          limit: 10,
        },
      );

      // Null checks should be present
      expect(result.script).toContain('av == null');
      expect(result.script).toContain('bv == null');
      expect(result.script).toContain('return 1'); // null -> end
      expect(result.script).toContain('return -1'); // non-null -> before null
    });
  });
});

// =============================================================================
// FIELD SET CONSTANTS AND RESOLUTION
// =============================================================================

describe('field set constants', () => {
  it('MINIMAL_FIELDS contains exactly the 9 thin-default fields', () => {
    expect(MINIMAL_FIELDS).toEqual([
      'id',
      'name',
      'flagged',
      'completed',
      'dueDate',
      'deferDate',
      'tags',
      'project',
      'available',
    ]);
  });

  it('DETAIL_FIELDS contains the heavier fields gated behind details=true', () => {
    expect(DETAIL_FIELDS).toContain('note');
    expect(DETAIL_FIELDS).toContain('estimatedMinutes');
    expect(DETAIL_FIELDS).toContain('plannedDate');
    expect(DETAIL_FIELDS).toContain('effectivePlannedDate');
    expect(DETAIL_FIELDS).toContain('parentTaskId');
    expect(DETAIL_FIELDS).toContain('parentTaskName');
    expect(DETAIL_FIELDS).toContain('blocked');
    expect(DETAIL_FIELDS).toContain('inInbox');
    expect(DETAIL_FIELDS).toContain('projectId');
  });

  it('DEFAULT_FIELDS is the union of MINIMAL_FIELDS and DETAIL_FIELDS', () => {
    const combined = [...MINIMAL_FIELDS, ...DETAIL_FIELDS];
    expect(DEFAULT_FIELDS).toEqual(combined);
  });

  it('MINIMAL_FIELDS and DETAIL_FIELDS do not overlap', () => {
    const overlap = MINIMAL_FIELDS.filter((f) => DETAIL_FIELDS.includes(f));
    expect(overlap).toEqual([]);
  });

  it('NOTE_TRUNCATE_LENGTH is 200', () => {
    expect(NOTE_TRUNCATE_LENGTH).toBe(200);
  });

  it('MINIMAL_PROJECT_FIELDS contains the 7 thin-default project fields', () => {
    expect(MINIMAL_PROJECT_FIELDS).toEqual(['id', 'name', 'status', 'flagged', 'dueDate', 'deferDate', 'folder']);
  });

  it('DETAIL_PROJECT_FIELDS contains the heavier project fields', () => {
    expect(DETAIL_PROJECT_FIELDS).toContain('note');
    expect(DETAIL_PROJECT_FIELDS).toContain('folderPath');
    expect(DETAIL_PROJECT_FIELDS).toContain('sequential');
    expect(DETAIL_PROJECT_FIELDS).toContain('lastReviewDate');
    expect(DETAIL_PROJECT_FIELDS).toContain('nextReviewDate');
  });
});

describe('resolveEffectiveTaskFields', () => {
  it('returns explicit user fields when provided', () => {
    const result = resolveEffectiveTaskFields(['id', 'name', 'note'], false);
    expect(result).toEqual(['id', 'name', 'note']);
  });

  it('treats empty array as no fields specified (returns MINIMAL_FIELDS)', () => {
    const result = resolveEffectiveTaskFields([], false);
    expect(result).toEqual(MINIMAL_FIELDS);
  });

  it('returns DEFAULT_FIELDS when details=true and no explicit fields', () => {
    const result = resolveEffectiveTaskFields([], true);
    expect(result).toEqual(DEFAULT_FIELDS);
  });

  it('returns DEFAULT_FIELDS when details=true and undefined fields', () => {
    const result = resolveEffectiveTaskFields(undefined, true);
    expect(result).toEqual(DEFAULT_FIELDS);
  });

  it('returns MINIMAL_FIELDS when details=false and no explicit fields', () => {
    const result = resolveEffectiveTaskFields(undefined, false);
    expect(result).toEqual(MINIMAL_FIELDS);
  });

  it('explicit fields take priority over details=true', () => {
    const result = resolveEffectiveTaskFields(['id', 'name'], true);
    expect(result).toEqual(['id', 'name']);
  });
});

describe('resolveEffectiveProjectFields', () => {
  it('returns explicit user fields when provided', () => {
    const result = resolveEffectiveProjectFields(['id', 'name', 'note'], false);
    expect(result).toEqual(['id', 'name', 'note']);
  });

  it('treats empty array as no fields specified (returns MINIMAL_PROJECT_FIELDS)', () => {
    const result = resolveEffectiveProjectFields([], false);
    expect(result).toEqual(MINIMAL_PROJECT_FIELDS);
  });

  it('returns full project fields when details=true', () => {
    const result = resolveEffectiveProjectFields(undefined, true);
    expect(result).toEqual([...MINIMAL_PROJECT_FIELDS, ...DETAIL_PROJECT_FIELDS]);
  });

  it('returns MINIMAL_PROJECT_FIELDS when details=false', () => {
    const result = resolveEffectiveProjectFields(undefined, false);
    expect(result).toEqual(MINIMAL_PROJECT_FIELDS);
  });

  it('explicit fields take priority over details=true', () => {
    const result = resolveEffectiveProjectFields(['id', 'status'], true);
    expect(result).toEqual(['id', 'status']);
  });
});

// =============================================================================
// NOTE TRUNCATION IN FIELD PROJECTION
// =============================================================================

describe('note truncation in generateFieldProjection', () => {
  it('emits truncated note projection when noteTruncateLength is set', () => {
    const result = buildFilteredTasksScript(
      {},
      {
        fields: ['id', 'note'],
        noteTruncateLength: 200,
      },
    );

    // Should contain the truncation IIFE, not the simple `note: task.note || ""`
    expect(result.script).toContain('substring(0, 200)');
    expect(result.script).toContain('...');
    expect(result.script).not.toMatch(/note: task\.note \|\| ""/);
  });

  it('emits full note when noteTruncateLength is not set', () => {
    const result = buildFilteredTasksScript(
      {},
      {
        fields: ['id', 'note'],
      },
    );

    expect(result.script).toContain('note: task.note || ""');
    expect(result.script).not.toContain('substring');
  });

  it('emits full note when noteTruncateLength is 0', () => {
    const result = buildFilteredTasksScript(
      {},
      {
        fields: ['id', 'note'],
        noteTruncateLength: 0,
      },
    );

    expect(result.script).toContain('note: task.note || ""');
  });

  it('truncation applies in inbox script', () => {
    const result = buildInboxScript(
      {},
      {
        fields: ['id', 'note'],
        noteTruncateLength: 200,
      },
    );

    expect(result.script).toContain('substring(0, 200)');
  });

  it('does not affect buildTaskByIdScript (always full note)', () => {
    const result = buildTaskByIdScript('abc123', ['id', 'note']);

    // ID lookup is a detail view — always full note
    expect(result.script).toContain('note: task.note || ""');
    expect(result.script).not.toContain('substring');
  });
});

describe('note truncation in project field projection', () => {
  it('emits truncated project note when noteTruncateLength is set', () => {
    const result = buildFilteredProjectsScript(
      {},
      {
        fields: ['id', 'note'],
        noteTruncateLength: 200,
      },
    );

    expect(result.script).toContain('substring(0, 200)');
    expect(result.script).not.toMatch(/note: project\.note \|\| ""/);
  });

  it('emits full project note when noteTruncateLength is not set', () => {
    const result = buildFilteredProjectsScript(
      {},
      {
        fields: ['id', 'note'],
      },
    );

    expect(result.script).toContain('note: project.note || ""');
  });
});

// =============================================================================
// PREAMBLE AND WARNING ASSEMBLY TESTS
// =============================================================================

describe('buildFilteredTasksScript preamble and warning injection', () => {
  it('embeds project resolution preamble before matchesFilter', () => {
    const filter = { projectId: 'Work' };
    const result = buildFilteredTasksScript(filter, { limit: 10 });
    expect(result.script).toContain('Project.byIdentifier');
    expect(result.script).toContain('flattenedProjects.byName');
    expect(result.script).toContain('__projectTarget_0');
    const preambleIndex = result.script.indexOf('__projectTarget_0 = (function');
    const matchesFilterIndex = result.script.indexOf('function matchesFilter');
    expect(preambleIndex).toBeLessThan(matchesFilterIndex);
  });

  it('embeds preamble in sort path', () => {
    const filter = { projectId: 'Work' };
    const result = buildFilteredTasksScript(filter, {
      limit: 10,
      sort: [{ field: 'dueDate', direction: 'asc' }],
    });
    expect(result.script).toContain('__projectTarget_0');
    expect(result.script).toContain('allResults.sort');
  });

  it('includes warning assembly code when project filter present', () => {
    const filter = { projectId: 'Home Renovation' };
    const result = buildFilteredTasksScript(filter, { limit: 10 });
    expect(result.script).toContain('__warnings');
    expect(result.script).toContain('__duplicateProjects');
    expect(result.script).toContain('duplicates > 0');
  });

  it('does not include warning assembly when no project filter', () => {
    const filter = { flagged: true };
    const result = buildFilteredTasksScript(filter, { limit: 10 });
    expect(result.script).not.toContain('__warnings');
    expect(result.script).not.toContain('__duplicateProjects');
  });
});
