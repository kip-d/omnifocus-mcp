/**
 * Tests for extracted task query pipeline functions.
 *
 * These functions were extracted from QueryTasksTool to enable
 * direct composition by OmniFocusReadTool.
 */

import { describe, it, expect } from 'vitest';
import {
  parseTasks,
  sortTasks,
  projectFields,
  scoreForSmartSuggest,
} from '../../../../src/tools/tasks/task-query-pipeline.js';
import type { OmniFocusTask } from '../../../../src/omnifocus/types.js';

describe('parseTasks', () => {
  it('returns empty array for null/undefined input', () => {
    expect(parseTasks(null as unknown as unknown[])).toEqual([]);
    expect(parseTasks(undefined as unknown as unknown[])).toEqual([]);
  });

  it('converts date strings to Date objects', () => {
    const raw = [
      { id: '1', name: 'Test', dueDate: '2025-12-31T17:00:00.000Z', completed: false, flagged: false, blocked: false },
    ];
    const result = parseTasks(raw);
    expect(result[0].dueDate).toBeInstanceOf(Date);
  });

  it('preserves non-date fields', () => {
    const raw = [
      {
        id: 'abc',
        name: 'My Task',
        completed: true,
        flagged: false,
        blocked: false,
        parentTaskId: 'parent1',
        inInbox: true,
      },
    ];
    const result = parseTasks(raw);
    expect(result[0].id).toBe('abc');
    expect(result[0].name).toBe('My Task');
    expect(result[0].completed).toBe(true);
    expect(result[0].parentTaskId).toBe('parent1');
    expect(result[0].inInbox).toBe(true);
  });

  it('handles missing date fields gracefully', () => {
    const raw = [{ id: '1', name: 'Test', completed: false, flagged: false, blocked: false }];
    const result = parseTasks(raw);
    expect(result[0].dueDate).toBeUndefined();
    expect(result[0].deferDate).toBeUndefined();
  });
});

describe('sortTasks', () => {
  const tasks: OmniFocusTask[] = [
    { id: '1', name: 'B Task', completed: false, flagged: true, blocked: false, dueDate: '2025-12-31' },
    { id: '2', name: 'A Task', completed: false, flagged: false, blocked: false, dueDate: '2025-06-15' },
    { id: '3', name: 'C Task', completed: false, flagged: true, blocked: false },
  ];

  it('returns tasks unchanged when no sort options', () => {
    expect(sortTasks(tasks)).toBe(tasks);
    expect(sortTasks(tasks, [])).toBe(tasks);
  });

  it('sorts by name ascending', () => {
    const sorted = sortTasks(tasks, [{ field: 'name', direction: 'asc' }]);
    expect(sorted.map((t) => t.name)).toEqual(['A Task', 'B Task', 'C Task']);
  });

  it('sorts by name descending', () => {
    const sorted = sortTasks(tasks, [{ field: 'name', direction: 'desc' }]);
    expect(sorted.map((t) => t.name)).toEqual(['C Task', 'B Task', 'A Task']);
  });

  it('pushes null/undefined values to end', () => {
    const sorted = sortTasks(tasks, [{ field: 'dueDate', direction: 'asc' }]);
    // C Task has no dueDate, should be last
    expect(sorted[sorted.length - 1].id).toBe('3');
  });

  it('sorts booleans: true before false', () => {
    const sorted = sortTasks(tasks, [{ field: 'flagged', direction: 'asc' }]);
    // true comes before false in boolean sort
    expect(sorted[0].flagged).toBe(true);
    expect(sorted[1].flagged).toBe(true);
    expect(sorted[2].flagged).toBe(false);
  });

  it('applies multi-level sorting', () => {
    const sorted = sortTasks(tasks, [
      { field: 'flagged', direction: 'asc' }, // flagged first
      { field: 'name', direction: 'asc' }, // then alphabetical
    ]);
    // First two are flagged (B, C), last is unflagged (A)
    expect(sorted[0].name).toBe('B Task');
    expect(sorted[1].name).toBe('C Task');
    expect(sorted[2].name).toBe('A Task');
  });

  it('does not mutate original array', () => {
    const original = [...tasks];
    sortTasks(tasks, [{ field: 'name', direction: 'asc' }]);
    expect(tasks).toEqual(original);
  });
});

describe('projectFields', () => {
  const tasks: OmniFocusTask[] = [
    { id: '1', name: 'Task One', completed: false, flagged: true, blocked: false, dueDate: '2025-12-31' },
  ];

  it('returns all fields when no selection', () => {
    expect(projectFields(tasks)).toBe(tasks);
    expect(projectFields(tasks, [])).toBe(tasks);
  });

  it('projects only selected fields', () => {
    const result = projectFields(tasks, ['id', 'name']);
    expect(Object.keys(result[0])).toEqual(['id', 'name']);
    expect(result[0].id).toBe('1');
    expect(result[0].name).toBe('Task One');
  });

  it('includes id when explicitly selected', () => {
    const result = projectFields(tasks, ['id', 'flagged']);
    expect(result[0].id).toBe('1');
    expect(result[0].flagged).toBe(true);
  });

  it('omits fields not in the task', () => {
    const result = projectFields(tasks, ['id', 'estimatedMinutes']);
    // estimatedMinutes is not in our test task, so it won't appear
    expect(result[0].id).toBe('1');
    expect(result[0].estimatedMinutes).toBeUndefined();
  });
});

describe('scoreForSmartSuggest', () => {
  it('scores overdue tasks highest', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const tasks: OmniFocusTask[] = [
      { id: '1', name: 'Overdue', completed: false, flagged: false, blocked: false, dueDate: yesterday.toISOString() },
      { id: '2', name: 'Flagged', completed: false, flagged: true, blocked: false },
    ];

    const result = scoreForSmartSuggest(tasks, 10);
    expect(result[0].id).toBe('1'); // Overdue should be first
  });

  it('includes flagged tasks', () => {
    const tasks: OmniFocusTask[] = [
      { id: '1', name: 'Flagged', completed: false, flagged: true, blocked: false },
      { id: '2', name: 'Normal', completed: false, flagged: false, blocked: false },
    ];

    const result = scoreForSmartSuggest(tasks, 10);
    expect(result.some((t) => t.id === '1')).toBe(true);
    // Normal task with 0 score should not appear
    expect(result.some((t) => t.id === '2')).toBe(false);
  });

  it('respects limit', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const tasks: OmniFocusTask[] = Array.from({ length: 10 }, (_, i) => ({
      id: String(i),
      name: `Task ${i}`,
      completed: false,
      flagged: true,
      blocked: false,
      dueDate: yesterday.toISOString(),
    }));

    const result = scoreForSmartSuggest(tasks, 3);
    expect(result.length).toBe(3);
  });

  it('excludes zero-score tasks', () => {
    const tasks: OmniFocusTask[] = [{ id: '1', name: 'No signals', completed: false, flagged: false, blocked: false }];

    const result = scoreForSmartSuggest(tasks, 10);
    expect(result).toHaveLength(0);
  });

  it('boosts available tasks', () => {
    const tasks: OmniFocusTask[] = [
      { id: '1', name: 'Available + Flagged', completed: false, flagged: true, blocked: false, available: true },
      { id: '2', name: 'Flagged only', completed: false, flagged: true, blocked: false, available: false },
    ];

    const result = scoreForSmartSuggest(tasks, 10);
    expect(result[0].id).toBe('1'); // Available+flagged scores higher
  });
});
