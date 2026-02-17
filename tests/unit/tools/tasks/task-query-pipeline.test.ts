/**
 * Tests for extracted task query pipeline functions.
 *
 * These functions were extracted from QueryTasksTool to enable
 * direct composition by OmniFocusReadTool.
 */

import { describe, it, expect } from 'vitest';
import {
  augmentFilterForMode,
  getDefaultSort,
  parseTasks,
  sortTasks,
  projectFields,
  scoreForSmartSuggest,
  countTodayCategories,
  type TaskQueryMode,
} from '../../../../src/tools/tasks/task-query-pipeline.js';
import type { OmniFocusTask } from '../../../../src/omnifocus/types.js';
import type { TaskFilter } from '../../../../src/contracts/filters.js';

// =============================================================================
// augmentFilterForMode
// =============================================================================

describe('augmentFilterForMode', () => {
  const baseFilter: TaskFilter = { tags: ['work'] };

  it('returns filter unchanged for undefined mode', () => {
    const result = augmentFilterForMode(undefined, baseFilter);
    expect(result).toEqual(baseFilter);
  });

  it('returns filter unchanged for "all" mode', () => {
    const result = augmentFilterForMode('all', baseFilter);
    expect(result).toEqual(baseFilter);
  });

  it('returns filter unchanged for "inbox" mode', () => {
    const result = augmentFilterForMode('inbox', baseFilter);
    expect(result).toEqual(baseFilter);
  });

  it('returns filter unchanged for "search" mode', () => {
    const result = augmentFilterForMode('search', baseFilter);
    expect(result).toEqual(baseFilter);
  });

  it('does not mutate the original filter', () => {
    const original: TaskFilter = { flagged: true };
    augmentFilterForMode('overdue', original);
    expect(original.completed).toBeUndefined();
    expect(original.dueBefore).toBeUndefined();
  });

  describe('overdue mode', () => {
    it('sets completed=false, dueBefore to now, and operator "<"', () => {
      const result = augmentFilterForMode('overdue', {});
      expect(result.completed).toBe(false);
      expect(result.dueBefore).toBeDefined();
      expect(result.dueDateOperator).toBe('<');
      // dueBefore should be close to now (within 2 seconds)
      const dueBefore = new Date(result.dueBefore!);
      expect(Math.abs(dueBefore.getTime() - Date.now())).toBeLessThan(2000);
    });
  });

  describe('today mode', () => {
    it('sets todayMode, completed=false, dropped=false, tagStatusValid', () => {
      const result = augmentFilterForMode('today', {});
      expect(result.todayMode).toBe(true);
      expect(result.completed).toBe(false);
      expect(result.dropped).toBe(false);
      expect(result.tagStatusValid).toBe(true);
    });

    it('defaults dueSoonDays to 3', () => {
      const result = augmentFilterForMode('today', {});
      expect(result.dueSoonDays).toBe(3);
    });

    it('respects custom daysAhead option', () => {
      const result = augmentFilterForMode('today', {}, { daysAhead: 7 });
      expect(result.dueSoonDays).toBe(7);
    });

    it('sets dueBefore to days ahead from start of today', () => {
      const result = augmentFilterForMode('today', {}, { daysAhead: 5 });
      const dueBefore = new Date(result.dueBefore!);
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const expected = new Date(todayStart);
      expected.setDate(expected.getDate() + 5);
      expect(dueBefore.getTime()).toBe(expected.getTime());
    });

    it('sets dueBefore to a valid date string', () => {
      const result = augmentFilterForMode('today', {});
      expect(result.dueBefore).toBeDefined();
      const dueBefore = new Date(result.dueBefore!);
      expect(dueBefore.toString()).not.toBe('Invalid Date');
    });
  });

  describe('upcoming mode', () => {
    it('sets completed=false with dueAfter and dueBefore range', () => {
      const result = augmentFilterForMode('upcoming', {});
      expect(result.completed).toBe(false);
      expect(result.dueAfter).toBeDefined();
      expect(result.dueBefore).toBeDefined();
    });

    it('defaults to 7-day range', () => {
      const result = augmentFilterForMode('upcoming', {});
      const start = new Date(result.dueAfter!);
      const end = new Date(result.dueBefore!);
      const daysDiff = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      expect(daysDiff).toBe(7);
    });

    it('respects custom daysAhead option', () => {
      const result = augmentFilterForMode('upcoming', {}, { daysAhead: 14 });
      const start = new Date(result.dueAfter!);
      const end = new Date(result.dueBefore!);
      const daysDiff = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      expect(daysDiff).toBe(14);
    });
  });

  describe('available mode', () => {
    it('sets completed=false and available=true', () => {
      const result = augmentFilterForMode('available', {});
      expect(result.completed).toBe(false);
      expect(result.available).toBe(true);
    });
  });

  describe('blocked mode', () => {
    it('sets completed=false and blocked=true', () => {
      const result = augmentFilterForMode('blocked', {});
      expect(result.completed).toBe(false);
      expect(result.blocked).toBe(true);
    });
  });

  describe('flagged mode', () => {
    it('sets flagged=true and defaults completed=false', () => {
      const result = augmentFilterForMode('flagged', {});
      expect(result.flagged).toBe(true);
      expect(result.completed).toBe(false);
    });

    it('preserves explicit completed value', () => {
      const result = augmentFilterForMode('flagged', { completed: true });
      expect(result.flagged).toBe(true);
      expect(result.completed).toBe(true);
    });
  });

  describe('smart_suggest mode', () => {
    it('sets completed=false', () => {
      const result = augmentFilterForMode('smart_suggest', {});
      expect(result.completed).toBe(false);
    });
  });

  it('preserves existing filter properties', () => {
    const result = augmentFilterForMode('overdue', { tags: ['urgent'], flagged: true });
    expect(result.tags).toEqual(['urgent']);
    expect(result.flagged).toBe(true);
    expect(result.completed).toBe(false); // mode-added
  });

  describe('declarative MODE_DEFINITIONS coverage', () => {
    const augmentingModes: TaskQueryMode[] = [
      'overdue',
      'today',
      'upcoming',
      'available',
      'blocked',
      'flagged',
      'smart_suggest',
    ];
    const passthroughModes: TaskQueryMode[] = ['all', 'inbox', 'search'];

    for (const mode of augmentingModes) {
      it(`mode "${mode}" produces augmented filter`, () => {
        const result = augmentFilterForMode(mode, {});
        // Every augmenting mode should add at least one property
        const addedKeys = Object.keys(result);
        expect(addedKeys.length).toBeGreaterThan(0);
      });
    }

    for (const mode of passthroughModes) {
      it(`mode "${mode}" passes filter through unchanged`, () => {
        const filter: TaskFilter = { flagged: true, tags: ['work'] };
        const result = augmentFilterForMode(mode, filter);
        expect(result).toEqual(filter);
      });
    }

    it('handles unknown mode gracefully (no crash, filter unchanged)', () => {
      const filter: TaskFilter = { flagged: true };
      const result = augmentFilterForMode('nonexistent_mode' as TaskQueryMode, filter);
      expect(result).toEqual(filter);
    });
  });
});

// =============================================================================
// getDefaultSort
// =============================================================================

describe('getDefaultSort', () => {
  it('returns dueDate asc for overdue mode', () => {
    expect(getDefaultSort('overdue')).toEqual([{ field: 'dueDate', direction: 'asc' }]);
  });

  it('returns dueDate asc for upcoming mode', () => {
    expect(getDefaultSort('upcoming')).toEqual([{ field: 'dueDate', direction: 'asc' }]);
  });

  it('returns modified desc for today mode', () => {
    expect(getDefaultSort('today')).toEqual([{ field: 'modified', direction: 'desc' }]);
  });

  it('returns undefined for all mode', () => {
    expect(getDefaultSort('all')).toBeUndefined();
  });

  it('returns undefined for undefined mode', () => {
    expect(getDefaultSort(undefined)).toBeUndefined();
  });

  it('returns undefined for flagged mode', () => {
    expect(getDefaultSort('flagged')).toBeUndefined();
  });

  it('returns undefined for available mode', () => {
    expect(getDefaultSort('available')).toBeUndefined();
  });

  it('returns undefined for blocked mode', () => {
    expect(getDefaultSort('blocked')).toBeUndefined();
  });

  it('returns undefined for smart_suggest mode', () => {
    expect(getDefaultSort('smart_suggest')).toBeUndefined();
  });

  it('returns undefined for inbox mode', () => {
    expect(getDefaultSort('inbox')).toBeUndefined();
  });

  it('returns undefined for search mode', () => {
    expect(getDefaultSort('search')).toBeUndefined();
  });
});

// =============================================================================
// parseTasks
// =============================================================================

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

  it('converts deferDate strings to Date objects', () => {
    const raw = [
      {
        id: '1',
        name: 'Test',
        deferDate: '2025-06-15T08:00:00.000Z',
        completed: false,
        flagged: false,
        blocked: false,
      },
    ];
    const result = parseTasks(raw);
    expect(result[0].deferDate).toBeInstanceOf(Date);
  });

  it('converts completionDate strings to Date objects', () => {
    const raw = [
      {
        id: '1',
        name: 'Test',
        completionDate: '2025-06-10T12:00:00.000Z',
        completed: true,
        flagged: false,
        blocked: false,
      },
    ];
    const result = parseTasks(raw);
    expect(result[0].completionDate).toBeInstanceOf(Date);
  });

  it('converts modified strings to Date objects', () => {
    const raw = [
      { id: '1', name: 'Test', modified: '2025-06-01T10:30:00.000Z', completed: false, flagged: false, blocked: false },
    ];
    const result = parseTasks(raw);
    expect(result[0].modified).toBeInstanceOf(Date);
  });

  it('returns empty array for non-array input', () => {
    expect(parseTasks('not-an-array' as unknown as unknown[])).toEqual([]);
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

  it('always includes id even when not explicitly requested', () => {
    const result = projectFields(tasks, ['name', 'flagged']);
    expect(result[0].id).toBe('1');
    expect(result[0].name).toBe('Task One');
    expect(result[0].flagged).toBe(true);
    // dueDate not requested, should be omitted
    expect(result[0].dueDate).toBeUndefined();
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

// =============================================================================
// countTodayCategories
// =============================================================================

describe('countTodayCategories', () => {
  it('counts tasks by reason field', () => {
    const tasks = [
      { id: '1', name: 'T1', completed: false, flagged: false, blocked: false, reason: 'overdue' },
      { id: '2', name: 'T2', completed: false, flagged: false, blocked: false, reason: 'overdue' },
      { id: '3', name: 'T3', completed: false, flagged: false, blocked: false, reason: 'due_soon' },
      { id: '4', name: 'T4', completed: false, flagged: true, blocked: false, reason: 'flagged' },
    ] as unknown as OmniFocusTask[];

    const result = countTodayCategories(tasks);
    expect(result.overdueCount).toBe(2);
    expect(result.dueSoonCount).toBe(1);
    expect(result.flaggedCount).toBe(1);
  });

  it('returns zeros for empty array', () => {
    const result = countTodayCategories([]);
    expect(result.overdueCount).toBe(0);
    expect(result.dueSoonCount).toBe(0);
    expect(result.flaggedCount).toBe(0);
  });

  it('returns zeros when no tasks have reason field', () => {
    const tasks = [
      { id: '1', name: 'T1', completed: false, flagged: false, blocked: false },
      { id: '2', name: 'T2', completed: false, flagged: false, blocked: false },
    ] as OmniFocusTask[];

    const result = countTodayCategories(tasks);
    expect(result.overdueCount).toBe(0);
    expect(result.dueSoonCount).toBe(0);
    expect(result.flaggedCount).toBe(0);
  });

  it('ignores tasks with unknown reason values', () => {
    const tasks = [
      { id: '1', name: 'T1', completed: false, flagged: false, blocked: false, reason: 'overdue' },
      { id: '2', name: 'T2', completed: false, flagged: false, blocked: false, reason: 'something_else' },
    ] as unknown as OmniFocusTask[];

    const result = countTodayCategories(tasks);
    expect(result.overdueCount).toBe(1);
    expect(result.dueSoonCount).toBe(0);
    expect(result.flaggedCount).toBe(0);
  });
});
