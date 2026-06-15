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
 */

import { describe, it, expect } from 'vitest';
import {
  buildFilteredTasksScript,
  buildInboxScript,
  buildTaskCountScript,
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
