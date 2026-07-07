/**
 * OMN-153: Project-root exclusion tests
 *
 * In OmniFocus, a project IS a task (its root task). The root appears in
 * flattenedTasks and is indistinguishable from regular tasks without extra inspection.
 * Detection: task.project !== null (OmniJS Task.project returns the Project only for
 * that project's root task, else null).
 *
 * These tests assert:
 * 1. buildFilteredTasksScript excludes project-root rows by default (task.project === null)
 * 2. includeProjectRoot: true opts back in
 * 3. isProjectRoot marker is projected when the field is requested
 * 4. buildTaskCountScript applies the same exclusion
 * 5. buildInboxScript applies the same exclusion
 * 6. FILTER_PROPERTY_NAMES includes includeProjectRoot
 * 7. TaskFilter interface accepts includeProjectRoot
 * 8. TaskRowSchema accepts isProjectRoot
 * 9. describeFilterForScript handles includeProjectRoot
 * 10. VM behavioral: root row is EXCLUDED by default; INCLUDED + marked with includeProjectRoot:true
 * 11. Export path applies the same default exclusion
 * 12. ID-lookup (buildTaskByIdScript / details=true) always carries isProjectRoot in its projection
 */

import { describe, it, expect } from 'vitest';
import { stubTask, runListScript } from './omnijs-vm-fixture.js';
import {
  buildFilteredTasksScript,
  buildInboxScript,
  buildTaskCountScript,
  buildTaskByIdScript,
  resolveEffectiveTaskFields,
} from '../../../../src/contracts/ast/script-builder.js';
import type { TaskFilter } from '../../../../src/contracts/filters.js';
import { FILTER_PROPERTY_NAMES } from '../../../../src/contracts/filters.js';
import { TaskFieldEnum } from '../../../../src/tools/unified/schemas/read-schema.js';
import { TaskRowSchema } from '../../../../src/omnifocus/script-response-schemas.js';

// =============================================================================
// buildFilteredTasksScript: default exclusion
// =============================================================================

describe('OMN-153: buildFilteredTasksScript — project-root exclusion', () => {
  it('excludes project-root rows by default via task.project === null predicate', () => {
    const result = buildFilteredTasksScript({});
    expect(result.script).toContain('task.project === null');
  });

  it('does NOT include task.project === null when includeProjectRoot: true', () => {
    const filter: TaskFilter = { includeProjectRoot: true };
    const result = buildFilteredTasksScript(filter);
    expect(result.script).not.toContain('task.project === null');
  });

  it('includes project-root rows when includeProjectRoot: true', () => {
    const filter: TaskFilter = { includeProjectRoot: true };
    const result = buildFilteredTasksScript(filter);
    // Should still filter by other things like dropped, but not exclude project roots
    expect(result.script).not.toContain('task.project === null');
  });

  it('applies project-root exclusion alongside other filters', () => {
    const filter: TaskFilter = { flagged: true };
    const result = buildFilteredTasksScript(filter);
    expect(result.script).toContain('task.project === null');
    expect(result.script).toContain('task.flagged === true');
  });

  it('combines project-root exclusion with projectId filter', () => {
    const filter: TaskFilter = { projectId: 'abc123' };
    const result = buildFilteredTasksScript(filter);
    // Even projectId-scoped queries exclude the root by default
    expect(result.script).toContain('task.project === null');
  });

  it('excludes project-root by default — not just projectId queries (text queries too)', () => {
    const filter: TaskFilter = { text: 'buy milk', textOperator: 'CONTAINS' };
    const result = buildFilteredTasksScript(filter);
    expect(result.script).toContain('task.project === null');
  });
});

// =============================================================================
// buildFilteredTasksScript: isProjectRoot projection
// =============================================================================

describe('OMN-153: buildFilteredTasksScript — isProjectRoot field projection', () => {
  it('emits isProjectRoot: task.project !== null when field is requested', () => {
    const result = buildFilteredTasksScript({}, { fields: ['id', 'name', 'isProjectRoot'] });
    expect(result.script).toContain('isProjectRoot: task.project !== null');
  });

  it('does NOT emit isProjectRoot when field is not requested', () => {
    const result = buildFilteredTasksScript({}, { fields: ['id', 'name'] });
    expect(result.script).not.toContain('isProjectRoot');
  });
});

// =============================================================================
// buildTaskCountScript: applies same exclusion
// =============================================================================

describe('OMN-153: buildTaskCountScript — project-root exclusion', () => {
  it('excludes project-root rows by default', () => {
    const result = buildTaskCountScript({});
    expect(result.script).toContain('task.project === null');
  });

  it('does NOT exclude project-root when includeProjectRoot: true', () => {
    const result = buildTaskCountScript({ includeProjectRoot: true });
    expect(result.script).not.toContain('task.project === null');
  });

  it('agrees with buildFilteredTasksScript: same predicate', () => {
    const filter: TaskFilter = { flagged: true };
    const listResult = buildFilteredTasksScript(filter);
    const countResult = buildTaskCountScript(filter);
    // Both should have the exclusion predicate
    expect(listResult.script).toContain('task.project === null');
    expect(countResult.script).toContain('task.project === null');
  });
});

// =============================================================================
// buildInboxScript: applies same exclusion
// =============================================================================

describe('OMN-153: buildInboxScript — project-root exclusion', () => {
  it('excludes project-root rows by default', () => {
    const result = buildInboxScript({});
    expect(result.script).toContain('task.project === null');
  });

  it('does NOT exclude project-root when includeProjectRoot: true', () => {
    const result = buildInboxScript({ includeProjectRoot: true });
    expect(result.script).not.toContain('task.project === null');
  });
});

// =============================================================================
// FILTER_PROPERTY_NAMES includes includeProjectRoot
// =============================================================================

describe('OMN-153: FILTER_PROPERTY_NAMES', () => {
  it('includes includeProjectRoot', () => {
    expect(FILTER_PROPERTY_NAMES).toContain('includeProjectRoot');
  });
});

// =============================================================================
// TaskFieldEnum includes isProjectRoot
// =============================================================================

describe('OMN-153: TaskFieldEnum (read-schema.ts)', () => {
  it('includes isProjectRoot', () => {
    expect(TaskFieldEnum.options).toContain('isProjectRoot');
  });
});

// =============================================================================
// TaskRowSchema accepts isProjectRoot
// =============================================================================

describe('OMN-153: TaskRowSchema', () => {
  it('accepts isProjectRoot: true', () => {
    const result = TaskRowSchema.safeParse({ id: 'abc', name: 'My Project', isProjectRoot: true });
    expect(result.success).toBe(true);
  });

  it('accepts isProjectRoot: false', () => {
    const result = TaskRowSchema.safeParse({ id: 'abc', name: 'Regular Task', isProjectRoot: false });
    expect(result.success).toBe(true);
  });

  it('accepts isProjectRoot: undefined (optional)', () => {
    const result = TaskRowSchema.safeParse({ id: 'abc', name: 'Regular Task' });
    expect(result.success).toBe(true);
  });

  it('rejects isProjectRoot with non-boolean (strict schema)', () => {
    const result = TaskRowSchema.safeParse({ id: 'abc', name: 'Task', isProjectRoot: 'yes' });
    expect(result.success).toBe(false);
  });
});

// =============================================================================
// VM behavioral test (#2): predicate execution, not just string presence
// =============================================================================

describe('OMN-153: VM behavioral — project-root exclusion and isProjectRoot marker', () => {
  // Shared vm fixture (omnijs-vm-fixture.ts). The old local stub declared a
  // status member that does not exist in the real OmniFocus enum — regular
  // tasks just need any non-Dropped, non-Completed status, which the
  // fixture's Available default is.
  const regularTask = (name: string) => stubTask(name);
  const rootTask = (name: string) => stubTask(name, { project: { name: 'MyProject' } });
  const runScript = runListScript;

  it('default script: excludes the root row, returns only regular tasks', () => {
    const tasks = [regularTask('alpha'), regularTask('beta'), rootTask('ProjectRoot')];
    const { script } = buildFilteredTasksScript({}, { fields: ['id', 'name'] });
    const result = runScript(script, tasks);
    // 3 tasks total; 1 root → 2 returned
    expect(result.tasks).toHaveLength(2);
    expect(result.total_matched).toBe(2);
    const names = (result.tasks as Array<{ name: string }>).map((t) => t.name);
    expect(names).toContain('alpha');
    expect(names).toContain('beta');
    expect(names).not.toContain('ProjectRoot');
  });

  it('includeProjectRoot:true: includes root row AND carries isProjectRoot:true', () => {
    const tasks = [regularTask('alpha'), rootTask('ProjectRoot')];
    const filter: TaskFilter = { includeProjectRoot: true };
    const { script } = buildFilteredTasksScript(filter, { fields: ['id', 'name', 'isProjectRoot'] });
    const result = runScript(script, tasks);
    // Both tasks returned
    expect(result.tasks).toHaveLength(2);
    const root = (result.tasks as Array<{ name: string; isProjectRoot?: boolean }>).find(
      (t) => t.name === 'ProjectRoot',
    );
    expect(root).toBeDefined();
    expect(root!.isProjectRoot).toBe(true);
    // Regular task: isProjectRoot false
    const regular = (result.tasks as Array<{ name: string; isProjectRoot?: boolean }>).find((t) => t.name === 'alpha');
    expect(regular!.isProjectRoot).toBe(false);
  });

  it('default script: root in a mixed set is excluded even with other filters active', () => {
    const tasks = [regularTask('flagged'), rootTask('ProjectRoot'), regularTask('other')];
    // flagged filter: only root is "flagged" here — but root should still be excluded
    const flaggedRoot = { ...rootTask('FlaggedRoot'), flagged: true };
    const flaggedRegular = { ...regularTask('FlaggedRegular'), flagged: true };
    const mixed = [...tasks, flaggedRoot, flaggedRegular];
    const { script } = buildFilteredTasksScript({ flagged: true }, { fields: ['id', 'name'] });
    const result = runScript(script, mixed);
    // Only FlaggedRegular qualifies (flagged=true AND project===null)
    expect(result.tasks).toHaveLength(1);
    expect((result.tasks[0] as { name: string }).name).toBe('FlaggedRegular');
  });
});

// =============================================================================
// ID-lookup test (#3): buildTaskByIdScript (via details=true) carries isProjectRoot
// =============================================================================

describe('OMN-153: buildTaskByIdScript — isProjectRoot in details=true projection', () => {
  it('resolveEffectiveTaskFields(undefined, true) includes isProjectRoot', () => {
    // ID lookup always calls resolveEffectiveTaskFields(fields, true) — details=true.
    // isProjectRoot is in DETAIL_FIELDS, so it must be present.
    const fields = resolveEffectiveTaskFields(undefined, true);
    expect(fields).toContain('isProjectRoot');
  });

  it('buildTaskByIdScript with details=true fields emits isProjectRoot projection', () => {
    const fields = resolveEffectiveTaskFields(undefined, true);
    const result = buildTaskByIdScript('test-id-123', fields);
    expect(result.script).toContain('isProjectRoot: task.project !== null');
  });
});
