import { describe, it, expect } from 'vitest';
import * as vm from 'node:vm';
import {
  buildFilteredTasksScript,
  buildInboxScript,
  buildTaskByIdScript,
  buildProjectByIdScript,
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
import { normalizeFilter } from '../../../../src/contracts/filters.js';
import { recoverInnerProgram } from '../../../utils/recover-bridge-program.js';

describe('OMN-190: honesty surface reflects the effective filter', () => {
  // For an empty/default query the generated script silently excludes completed,
  // dropped, and project-root rows. filter_description (all builders) and
  // filters_applied (count path) must reflect those auto-injected defaults, or
  // an LLM consumer reasoning "this is the full population" is wrong by 3 silent
  // exclusions. See the describe<->filters_applied invariant (OMN-172/177).

  it('list path describes the effective defaults for an empty filter', () => {
    expect(buildFilteredTasksScript({}).filterDescription).toBe('active AND not dropped AND exclude project roots');
  });

  it('inbox path describes inbox plus the effective defaults', () => {
    // BOOLEAN_FILTER_DESCRIPTORS order: completed, dropped, ..., inInbox, includeProjectRoot
    expect(buildInboxScript({}).filterDescription).toBe('active AND not dropped AND inbox AND exclude project roots');
  });

  it('count path describes AND echoes the effective defaults', () => {
    const inner = recoverInnerProgram(buildTaskCountScript({}).script);
    expect(inner).toContain('filter_description: "active AND not dropped AND exclude project roots"');
    // filters_applied echoes the effective filter, not the raw (empty) user filter
    expect(inner).toContain('"completed":false');
    expect(inner).toContain('"dropped":false');
    expect(inner).toContain('"includeProjectRoot":false');
    // and never leaks the normalized brand key (OMN-177)
    expect(inner).not.toContain('__normalized__');
  });

  it('includeCompleted lifts the completed/dropped defaults from the description', () => {
    // root exclusion still applies (only includeProjectRoot controls it)
    expect(buildFilteredTasksScript({}, { includeCompleted: true }).filterDescription).toBe('exclude project roots');
  });

  it('an explicit includeProjectRoot:true is reflected honestly', () => {
    expect(buildFilteredTasksScript(normalizeFilter({ includeProjectRoot: true })).filterDescription).toBe(
      'active AND not dropped AND include project roots',
    );
    const inner = recoverInnerProgram(buildTaskCountScript({ includeProjectRoot: true }).script);
    expect(inner).toContain('"includeProjectRoot":true');
    expect(inner).toContain('include project roots');
  });
});

describe('buildFilteredTasksScript', () => {
  describe('basic script generation', () => {
    it('generates valid OmniJS script for empty filter', () => {
      const result = buildFilteredTasksScript({});

      expect(result.script).toContain('flattenedTasks.forEach');
      expect(result.script).toContain('matchesFilter');
      // OMN-157: even an "empty" user filter compiles the default dropped
      // exclusion into the predicate (dropped is synthetic — AST-only)
      expect(result.script).toContain('task.taskStatus !== Task.Status.Dropped');
      expect(result.isEmptyFilter).toBe(true);
      // OMN-190: filter_description now reflects the EFFECTIVE filter (the
      // auto-injected completed/dropped/project-root exclusions actually
      // applied), not the user's empty filter. "all tasks" was a lie — the
      // query silently excludes three populations.
      expect(result.filterDescription).toBe('active AND not dropped AND exclude project roots');
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

    it('OMN-207: projects task `sequential` as a real boolean (mirror of project side)', () => {
      const result = buildFilteredTasksScript({}, { fields: ['id', 'sequential'] });

      // `|| false` so the value is the stored boolean — false ≠ "field absent"
      // (the same load-bearing distinction OMN-206 locked on the write side).
      expect(result.script).toContain('sequential: task.sequential || false');
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

    // OMN-157: dropped is the third terminal state — bare/search/all/inbox paths
    // must exclude it by default. task.dropped is SYNTHETIC (no such OmniJS
    // property), so the default must compile through the AST emitter as a
    // taskStatus comparison — a raw `if (task.dropped)` check is a silent no-op.
    it('excludes dropped tasks by default via the AST predicate', () => {
      const result = buildFilteredTasksScript({});

      expect(result.script).toContain('task.taskStatus !== Task.Status.Dropped');
      // The broken raw-property form must never reappear
      expect(result.script).not.toContain('if (task.dropped)');
    });

    it('includes dropped tasks when includeCompleted option is true', () => {
      // includeCompleted is the "everything" knob (export); it lifts both defaults
      const result = buildFilteredTasksScript({}, { includeCompleted: true });

      expect(result.script).not.toContain('Task.Status.Dropped');
    });

    it('uses explicit dropped:true filter over the default', () => {
      const result = buildFilteredTasksScript({ dropped: true });

      expect(result.script).toContain('task.taskStatus === Task.Status.Dropped');
      expect(result.script).not.toContain('task.taskStatus !== Task.Status.Dropped');
    });

    it('explicit dropped:false replaces the default rather than stacking', () => {
      const result = buildFilteredTasksScript({ dropped: false });

      const occurrences = result.script.match(/task\.taskStatus !== Task\.Status\.Dropped/g) ?? [];
      expect(occurrences).toHaveLength(1);
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

  // OMN-202: mutation testing (OMN-201 baseline) found the date-field
  // `case` labels in generateFieldProjection unpinned — a regression that
  // swapped one date field's source property for another's (or dropped its
  // toISOString()/null-guard) would not be caught. Each assertion below pins
  // BOTH the field's own OmniJS source property (so a mutant reading the wrong
  // task property, e.g. `deferDate` falling through to read `task.dueDate`,
  // is caught) AND the exact key it projects to (so a mutant emitting the
  // wrong output key is caught).
  describe('date field projections (OMN-202)', () => {
    it.each([['dueDate'], ['deferDate'], ['plannedDate'], ['completionDate'], ['effectivePlannedDate']])(
      'projects %s reading task.%s with ISO/null guard',
      (field) => {
        const result = buildFilteredTasksScript({}, { fields: ['id', field] });
        expect(result.script).toContain(`${field}: task.${field} ? task.${field}.toISOString() : null`);
      },
    );

    it('requesting all five date fields together emits five distinct, non-cross-contaminated projections', () => {
      // Guards against a mutant that makes one case fall through to another
      // (e.g. `case 'deferDate':` dropping through into the `case 'dueDate':`
      // body) — each key must read its OWN source property, not a sibling's.
      const result = buildFilteredTasksScript(
        {},
        { fields: ['id', 'dueDate', 'deferDate', 'plannedDate', 'completionDate', 'effectivePlannedDate'] },
      );
      expect(result.script).toContain('dueDate: task.dueDate ? task.dueDate.toISOString() : null');
      expect(result.script).toContain('deferDate: task.deferDate ? task.deferDate.toISOString() : null');
      expect(result.script).toContain('plannedDate: task.plannedDate ? task.plannedDate.toISOString() : null');
      expect(result.script).toContain('completionDate: task.completionDate ? task.completionDate.toISOString() : null');
      expect(result.script).toContain(
        'effectivePlannedDate: task.effectivePlannedDate ? task.effectivePlannedDate.toISOString() : null',
      );
      // Each field's projection appears exactly once — a fallthrough mutant
      // that duplicates one field's projection line under two case labels
      // would push one of these counts to 2.
      const occurrences = (needle: string) => result.script.split(needle).length - 1;
      expect(occurrences('dueDate: task.dueDate')).toBe(1);
      expect(occurrences('deferDate: task.deferDate')).toBe(1);
      expect(occurrences('plannedDate: task.plannedDate')).toBe(1);
      expect(occurrences('completionDate: task.completionDate')).toBe(1);
      expect(occurrences('effectivePlannedDate: task.effectivePlannedDate')).toBe(1);
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

    it('OR branches on the same ==-field are not a contradiction (OMN-226)', () => {
      // "tasks in project A or project B" — must not throw "Contradictory conditions"
      const result = buildFilteredTasksScript({ orBranches: [{ projectId: 'AAA' }, { projectId: 'BBB' }] });

      expect(result.script).toContain('||');
      expect(result.script).toContain('AAA');
      expect(result.script).toContain('BBB');
    });
  });

  describe('OR queries compose with defaults and modes (OMN-151 V6 / OMN-157)', () => {
    it('buildFilteredTasksScript with orBranches still applies the default dropped-exclusion', () => {
      const { script } = buildFilteredTasksScript({ orBranches: [{ flagged: true }, { inInbox: true }] });
      // OMN-157 default now survives beside OR: dropped is SYNTHETIC so it emits as taskStatus comparison
      expect(script).toContain('task.taskStatus !== Task.Status.Dropped');
    });

    it('buildTaskCountScript with orBranches agrees (countOnly path, spec §3.2 / C15)', () => {
      const { script } = buildTaskCountScript({ orBranches: [{ flagged: true }, { inInbox: true }] });
      // same buildAST route — count predicate matches the row predicate
      expect(script).toContain('task.taskStatus !== Task.Status.Dropped');
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

  // OMN-157: inbox path must also exclude dropped by default — via the AST
  // predicate (task.dropped is synthetic; a raw property check is a no-op)
  it('excludes dropped tasks by default via the AST predicate', () => {
    const result = buildInboxScript();

    expect(result.script).toContain('task.taskStatus !== Task.Status.Dropped');
    expect(result.script).not.toContain('if (task.dropped)');
  });

  it('uses explicit dropped:true filter over the default', () => {
    const result = buildInboxScript({ dropped: true });

    expect(result.script).toContain('task.taskStatus === Task.Status.Dropped');
    expect(result.script).not.toContain('task.taskStatus !== Task.Status.Dropped');
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
  it('uses Task.byIdentifier for O(1) lookup, never iterates flattenedTasks (OMN-185)', () => {
    const result = buildTaskByIdScript('abc123');

    // OMN-185: mirror OMN-40's project fast path. A task id-lookup must resolve
    // directly via Task.byIdentifier — iterating flattenedTasks pays the ~7-10s
    // materialization floor for a single known id.
    expect(result.script).toContain('Task.byIdentifier(targetId)');
    expect(result.script).not.toContain('flattenedTasks');
    expect(result.script).not.toContain('task.id.primaryKey === targetId');
    expect(result.script).toContain('targetId');
    expect(result.script).toContain('abc123');
  });

  it('guards the not-found case so a null task yields empty results (OMN-185)', () => {
    const result = buildTaskByIdScript('abc123');

    // Task.byIdentifier returns null for an unknown/deleted id; the guard keeps
    // the {tasks:[], count:0} shape that NOT_FOUND read-back assertions rely on.
    expect(result.script).toContain('if (task)');
  });

  it('preserves the id_lookup result shape', () => {
    const result = buildTaskByIdScript('abc123');

    expect(result.script).toContain("mode: 'id_lookup'");
    expect(result.script).toContain('count: results.length');
    expect(result.script).toContain('targetId: targetId');
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

describe('buildTaskByIdScript (vm-executed, OMN-185)', () => {
  // Execute the generated OmniJS body with a stubbed Task.byIdentifier. This is a
  // behavioral oracle the string-contains tests cannot be: a casing typo
  // (`task.byIdentifier`), a dropped `mode` key, or a broken projection would pass
  // the toContain checks but fail here. Mirrors the OMN-154 runTaskScript harness.
  function runById(
    script: string,
    tasksById: Record<string, unknown>,
  ): { tasks: any[]; count: number; mode: string; targetId: string } {
    const Task = { byIdentifier: (id: string) => tasksById[id] ?? null };
    const sandbox: Record<string, unknown> = { Task, JSON };
    return JSON.parse(vm.runInNewContext(script, sandbox) as string);
  }

  it('found: returns the single task with id_lookup shape', () => {
    const { script } = buildTaskByIdScript('id-abc', ['id', 'name', 'flagged']);
    const result = runById(script, {
      'id-abc': { id: { primaryKey: 'id-abc' }, name: 'Found', flagged: true },
    });

    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0]).toMatchObject({ id: 'id-abc', name: 'Found', flagged: true });
    expect(result.count).toBe(1);
    expect(result.mode).toBe('id_lookup');
    expect(result.targetId).toBe('id-abc');
  });

  it('not found: null from byIdentifier yields empty results (count 0)', () => {
    const { script } = buildTaskByIdScript('missing', ['id', 'name']);
    const result = runById(script, {}); // no entry → byIdentifier returns null

    expect(result.tasks).toHaveLength(0);
    expect(result.count).toBe(0);
    expect(result.mode).toBe('id_lookup');
    expect(result.targetId).toBe('missing');
  });
});

describe('OMN-225: id-lookup always projects id so the id-match guard can verify it', () => {
  // The read tool's id-lookup guard (executeIdLookup / executeProjectIdLookup)
  // checks `row.id === requestedId` BEFORE projectFields() re-adds id. The script
  // projects only the caller's requested fields, so a `fields` list that omits
  // "id" left the row without an id → the guard read undefined and mis-fired
  // ID_MISMATCH for ANY id (fresh or long-existing), not just freshly-created ones.

  it('buildTaskByIdScript projects id even when the caller omits it from fields', () => {
    const { script } = buildTaskByIdScript('abc123', ['name', 'sequential']);
    expect(script).toContain('id: task.id.primaryKey');
  });

  it('buildTaskByIdScript: vm-executed row carries id when fields omit it', () => {
    const Task = {
      byIdentifier: (id: string) =>
        id === 'abc123' ? { id: { primaryKey: 'abc123' }, name: 'X', sequential: true } : null,
    };
    const { script } = buildTaskByIdScript('abc123', ['name', 'sequential']);
    const result = JSON.parse(vm.runInNewContext(script, { Task, JSON }) as string);

    expect(result.tasks).toHaveLength(1);
    // The row the guard inspects MUST carry id even though the caller asked only
    // for name + sequential.
    expect(result.tasks[0].id).toBe('abc123');
  });

  it('buildTaskByIdScript does not duplicate the id projection when fields include it', () => {
    const { script } = buildTaskByIdScript('abc123', ['id', 'name']);
    const matches = script.match(/id: task\.id\.primaryKey/g) ?? [];
    expect(matches).toHaveLength(1);
  });

  it('buildProjectByIdScript projects id even when the caller omits it from fields', () => {
    const { script } = buildProjectByIdScript('proj123', ['name', 'status']);
    expect(script).toContain('id: project.id.primaryKey');
  });

  it('buildProjectByIdScript does not duplicate the id projection when fields include it', () => {
    const { script } = buildProjectByIdScript('proj123', ['id', 'name']);
    const matches = script.match(/id: project\.id\.primaryKey/g) ?? [];
    expect(matches).toHaveLength(1);
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

  // OMN-45: `added` and `dropDate` were declared in the schema field enum but
  // had no projection case in script-builder, so server responses silently
  // omitted them even when the user explicitly requested them.
  it('generates added field projection (OMN-45 regression)', () => {
    const result = buildFilteredTasksScript({}, { fields: ['id', 'added'] });

    expect(result.script).toContain('added:');
    expect(result.script).toContain('task.added');
    expect(result.script).toContain('toISOString');
  });

  it('generates dropDate field projection (OMN-45 regression)', () => {
    const result = buildFilteredTasksScript({}, { fields: ['id', 'dropDate'] });

    expect(result.script).toContain('dropDate:');
    expect(result.script).toContain('task.dropDate');
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
  // OMN-157: count parity — the OMN-52 shim defaults completed:false; dropped
  // must get the same default or countOnly diverges from the list path.
  describe('terminal-state defaults (parity with list path)', () => {
    it('defaults to excluding dropped tasks', () => {
      const result = buildTaskCountScript({});

      expect(result.script).toContain('task.taskStatus !== Task.Status.Dropped');
    });

    it('honors explicit dropped:true over the default', () => {
      const result = buildTaskCountScript({ dropped: true });

      expect(result.script).toContain('task.taskStatus === Task.Status.Dropped');
      expect(result.script).not.toContain('task.taskStatus !== Task.Status.Dropped');
    });
  });

  // OMN-177: the count script echoes the raw input filter into filters_applied.
  // When the caller passes an already-normalized (branded) filter — as the count
  // path does — JSON.stringify must not carry the internal __normalized__ brand
  // onto the wire.
  describe('filters_applied brand leak (OMN-177)', () => {
    it('omits the __normalized__ brand from a branded input filter', () => {
      const branded = normalizeFilter({ deferBefore: '2026-12-31' });
      // sanity: the input really is branded
      expect((branded as Record<string, unknown>).__normalized__).toBe(true);

      const { script } = buildTaskCountScript(branded);

      expect(script).not.toContain('__normalized__');
      // the real filter key is still echoed
      expect(script).toContain('deferBefore');
    });
  });

  describe('inbox counting', () => {
    it('uses OmniJS inbox global when inInbox is true', () => {
      const result = buildTaskCountScript({ inInbox: true });
      expect(result.script).toContain('evaluateJavascript');
      expect(result.script).toContain('inbox');
      expect(result.script).not.toContain('doc.inboxTasks()');
      expect(result.script).not.toContain('doc.flattenedTasks()');
    });

    it('strips inInbox from filter code (already handled by collection)', () => {
      const result = buildTaskCountScript({ inInbox: true });
      // Should NOT generate task.inInbox check — the collection is pre-filtered
      expect(result.script).not.toContain('task.inInbox');
    });

    it('defaults to excluding completed tasks for inbox counts', () => {
      const result = buildTaskCountScript({ inInbox: true });
      // Should add completed: false when not explicitly set (OmniJS property access, no ())
      expect(result.script).toContain('task.completed');
      expect(result.script).toContain('=== false');
    });

    it('respects explicit completed: true for inbox counts', () => {
      const result = buildTaskCountScript({ inInbox: true, completed: true });
      expect(result.script).toContain('inbox');
      expect(result.script).toContain('task.completed === true');
    });

    it('does not treat project: null as inbox (that is QueryCompiler concern)', () => {
      // project: null → inInbox: true conversion happens in QueryCompiler,
      // not in normalizeFilter or buildTaskCountScript
      const result = buildTaskCountScript({ project: null } as TaskFilter);
      expect(result.script).toContain('flattenedTasks');
      expect(result.script).not.toContain('doc.flattenedTasks()');
    });
  });

  describe('non-inbox counting', () => {
    it('uses OmniJS flattenedTasks global for general queries', () => {
      const result = buildTaskCountScript({ flagged: true });
      expect(result.script).toContain('evaluateJavascript');
      expect(result.script).toContain('flattenedTasks');
      expect(result.script).not.toContain('doc.flattenedTasks()');
      expect(result.script).not.toContain('doc.inboxTasks()');
    });

    it('generates filter code for non-inbox filters', () => {
      const result = buildTaskCountScript({ flagged: true, completed: false });
      expect(result.script).toContain('task.flagged === true');
      expect(result.script).toContain('task.completed === false');
    });

    it('iterates flattenedTasks for no filters and applies completed-exclusion default', () => {
      const result = buildTaskCountScript({});
      expect(result.script).toContain('flattenedTasks');
      expect(result.script).not.toContain('doc.flattenedTasks()');
      // OMN-52: an "empty" input filter is no longer empty after normalization —
      // the count path applies the same `completed: false` default as the list
      // path so both produce equivalent counts. The AST therefore contains a
      // task.completed === false comparison node, so isEmptyFilter is false.
      expect(result.isEmptyFilter).toBe(false);
      expect(result.script).toMatch(/task\.completed\s*===\s*false/);
    });

    it('generates project name comparison for name-like project filter', () => {
      const result = buildTaskCountScript({ project: 'My Project' });
      expect(result.script).toContain('.name');
      expect(result.script).toContain('My Project');
    });

    it('generates project ID comparison for ID-like project filter', () => {
      const result = buildTaskCountScript({ project: 'n60OG59wsSg' });
      expect(result.script).toContain('.id.primaryKey');
      expect(result.script).toContain('n60OG59wsSg');
    });

    it('uses omnijs_count discriminator (not pure_jxa)', () => {
      const r = buildTaskCountScript({ flagged: true });
      expect(r.script).toContain('omnijs_count');
      expect(r.script).not.toContain('pure_jxa');
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

    it('includes total_matched on the unsorted path too (OMN-154)', () => {
      const result = buildFilteredTasksScript({ flagged: true }, { limit: 5 });
      expect(result.script).toContain('total_matched: totalMatched');
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
// OMN-154: VM-EXECUTED POPULATION COUNT TESTS
// =============================================================================

describe('OMN-154: generated scripts count the full population (vm-executed)', () => {
  // Minimal stub matching what the generated predicate/projection touches.
  // The default dropped-exclusion (OMN-157) emits a taskStatus check, so the
  // sandbox provides Task.Status and per-task taskStatus.
  const Task = { Status: { Dropped: 'Dropped', Active: 'Active' } };
  const stubTask = (name: string, flagged: boolean) => ({
    id: { primaryKey: `id-${name}` },
    name,
    flagged,
    completed: false,
    taskStatus: Task.Status.Active,
    inInbox: false,
    tags: [],
    notes: '',
    dueDate: null,
    deferDate: null,
    estimatedMinutes: null,
    effectiveDueDate: null,
    effectiveDeferDate: null,
    containingProject: null,
    // OMN-153: task.project is null for regular tasks in OmniJS (non-null only for
    // a project's root task). Include it so the default project-root exclusion predicate
    // (task.project === null) works correctly in these vm-executed tests.
    project: null,
    available: true,
    blocked: false,
  });

  function runTaskScript(script: string, tasks: unknown[]): { tasks: unknown[]; count: number; total_matched: number } {
    const sandbox: Record<string, unknown> = { flattenedTasks: tasks, inbox: tasks, Task, JSON };
    return JSON.parse(vm.runInNewContext(script, sandbox) as string);
  }

  it('unsorted path: limit 2 against 5 matches → 2 rows, total_matched 5', () => {
    const tasks = [
      stubTask('a', true),
      stubTask('b', true),
      stubTask('c', true),
      stubTask('d', true),
      stubTask('e', true),
      stubTask('f', false),
    ];
    const { script } = buildFilteredTasksScript({ flagged: true }, { limit: 2 });
    const result = runTaskScript(script, tasks);
    expect(result.tasks).toHaveLength(2);
    expect(result.count).toBe(2);
    expect(result.total_matched).toBe(5);
  });

  it('unsorted path with offset: total_matched counts offset-skipped matches too', () => {
    const tasks = [stubTask('a', true), stubTask('b', true), stubTask('c', true), stubTask('d', true)];
    const { script } = buildFilteredTasksScript({ flagged: true }, { limit: 2, offset: 1 });
    const result = runTaskScript(script, tasks);
    expect(result.tasks).toHaveLength(2); // skipped 1, took 2
    expect(result.total_matched).toBe(4);
  });

  it('unsorted path: population equal to limit → total_matched == count', () => {
    const tasks = [stubTask('a', true), stubTask('b', true)];
    const { script } = buildFilteredTasksScript({ flagged: true }, { limit: 5 });
    const result = runTaskScript(script, tasks);
    expect(result.count).toBe(2);
    expect(result.total_matched).toBe(2);
  });

  it('inbox path: limit 1 against 3 matches → total_matched 3', () => {
    const inboxTasks = [
      { ...stubTask('a', false), inInbox: true },
      { ...stubTask('b', false), inInbox: true },
      { ...stubTask('c', false), inInbox: true },
    ];
    const { script } = buildInboxScript({}, { limit: 1 });
    const result = runTaskScript(script, inboxTasks);
    expect(result.tasks).toHaveLength(1);
    expect(result.total_matched).toBe(3);
  });

  it('sorted path still reports total_matched (regression)', () => {
    const tasks = [stubTask('b', true), stubTask('a', true), stubTask('c', true)];
    const { script } = buildFilteredTasksScript(
      { flagged: true },
      { limit: 2, sort: [{ field: 'name', direction: 'asc' }] },
    );
    const result = runTaskScript(script, tasks);
    expect(result.tasks).toHaveLength(2);
    expect(result.total_matched).toBe(3);
  });
});

// =============================================================================
// FIELD SET CONSTANTS AND RESOLUTION
// =============================================================================

describe('field set constants', () => {
  it('MINIMAL_FIELDS contains exactly the 10 thin-default fields (OMN-130: hasNote added)', () => {
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
      'hasNote',
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

    // OMN-129: buildFilteredProjectsScript crosses the JSON.stringify boundary, so
    // assert on the recovered (decoded) program where the double quotes are unescaped.
    expect(recoverInnerProgram(result.script)).toContain('note: project.note || ""');
  });

  it('emits a reviewInterval projection when the reviewInterval field is requested (OMN-60)', () => {
    const result = buildFilteredProjectsScript({}, { fields: ['id', 'reviewInterval'] });

    expect(result.script).toContain('reviewInterval: project.reviewInterval');
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
    // OMN-224: status-aware name resolution scans flattenedProjects (byName removed).
    expect(result.script).toContain('flattenedProjects.filter(function(p) { return p.name === target; })');
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

// =============================================================================
// OMN-154: PROJECTS SCRIPT POPULATION COUNT TESTS
// =============================================================================

describe('OMN-154: projects script counts the full population', () => {
  const Project = {
    Status: { Active: 'Active', Done: 'Done', Dropped: 'Dropped', OnHold: 'OnHold' },
  };
  const stubProject = (name: string, status: string) => ({
    id: { primaryKey: `id-${name}` },
    name,
    status,
    flagged: false,
    folder: null,
    rootTask: null,
    note: '',
  });

  it('script text includes total_matched and the wrapper forwards it', () => {
    const result = buildFilteredProjectsScript({ status: ['active'] }, { limit: 2 });
    expect(result.script).toContain('total_matched: totalMatched');
    // JXA wrapper forwards it in its metadata block
    expect(result.script).toContain('total_matched: result.total_matched');
  });

  it('vm: limit 2 against 4 active → 2 rows, total_matched 4', () => {
    const projects = [
      stubProject('p1', Project.Status.Active),
      stubProject('p2', Project.Status.Active),
      stubProject('p3', Project.Status.Active),
      stubProject('p4', Project.Status.Active),
      stubProject('p5', Project.Status.Done),
    ];
    const generated = buildFilteredProjectsScript({ status: ['active'] }, { limit: 2, performanceMode: 'lite' });
    // Double-vm: the generated artifact is a JXA wrapper embedding OmniJS via
    // app.evaluateJavascript. Stub Application so evaluateJavascript runs the
    // inner OmniJS in the same sandbox — exercising BOTH layers as generated.
    const sandbox: Record<string, unknown> = {
      flattenedProjects: projects,
      Project,
      JSON,
      Application: () => ({
        evaluateJavascript: (src: string) => vm.runInNewContext(src, sandbox) as string,
      }),
    };
    const raw = vm.runInNewContext(generated.script, sandbox) as string;
    const parsed = JSON.parse(raw) as {
      projects: unknown[];
      metadata: { total_matched: number; returned_count: number; total_available: number };
    };
    expect(parsed.projects).toHaveLength(2);
    expect(parsed.metadata.returned_count).toBe(2);
    expect(parsed.metadata.total_matched).toBe(4);
    expect(parsed.metadata.total_available).toBe(5); // pre-filter total, unchanged
  });
});
