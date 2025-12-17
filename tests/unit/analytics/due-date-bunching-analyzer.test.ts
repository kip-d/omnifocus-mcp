import { describe, it, expect } from 'vitest';
import { analyzeDueDateBunching } from '../../../src/omnifocus/scripts/analytics/due-date-bunching-analyzer.js';

describe('analyzeDueDateBunching', () => {
  it('identifies days with excessive tasks', () => {
    const tasks = [
      { id: 't1', dueDate: '2025-10-20', completed: false, project: 'Work' },
      { id: 't2', dueDate: '2025-10-20', completed: false, project: 'Work' },
      { id: 't3', dueDate: '2025-10-20', completed: false, project: 'Work' },
      { id: 't4', dueDate: '2025-10-20', completed: false, project: 'Home' },
      { id: 't5', dueDate: '2025-10-20', completed: false, project: 'Home' },
      { id: 't6', dueDate: '2025-10-20', completed: false, project: 'Home' },
      { id: 't7', dueDate: '2025-10-20', completed: false, project: 'Home' },
      { id: 't8', dueDate: '2025-10-20', completed: false, project: 'Home' },
      { id: 't9', dueDate: '2025-10-20', completed: false, project: 'Home' },
    ];

    const result = analyzeDueDateBunching(tasks, { threshold: 8 });

    expect(result.bunchedDates).toHaveLength(1);
    expect(result.bunchedDates[0].taskCount).toBe(9);
    expect(result.bunchedDates[0].date).toBe('2025-10-20');
  });

  it('skips completed tasks', () => {
    const tasks = [
      { id: 't1', dueDate: '2025-10-20', completed: true, project: 'Work' },
      { id: 't2', dueDate: '2025-10-20', completed: false, project: 'Work' },
    ];

    const result = analyzeDueDateBunching(tasks, { threshold: 5 });

    expect(result.bunchedDates).toHaveLength(0);
  });

  it('groups by project for bunched dates', () => {
    const tasks = [
      { id: 't1', dueDate: '2025-10-20', completed: false, project: 'Work' },
      { id: 't2', dueDate: '2025-10-20', completed: false, project: 'Work' },
      { id: 't3', dueDate: '2025-10-20', completed: false, project: 'Home' },
      { id: 't4', dueDate: '2025-10-20', completed: false, project: 'Home' },
      { id: 't5', dueDate: '2025-10-20', completed: false, project: 'Home' },
      { id: 't6', dueDate: '2025-10-20', completed: false, project: 'Home' },
      { id: 't7', dueDate: '2025-10-20', completed: false, project: 'Home' },
      { id: 't8', dueDate: '2025-10-20', completed: false, project: 'Home' },
    ];

    const result = analyzeDueDateBunching(tasks, { threshold: 5 });

    expect(result.bunchedDates[0].projects).toContain('Work');
    expect(result.bunchedDates[0].projects).toContain('Home');
  });

  it('calculates average tasks per day', () => {
    const tasks = [
      { id: 't1', dueDate: '2025-10-20', completed: false, project: 'Work' },
      { id: 't2', dueDate: '2025-10-20', completed: false, project: 'Work' },
      { id: 't3', dueDate: '2025-10-21', completed: false, project: 'Work' },
      { id: 't4', dueDate: '2025-10-21', completed: false, project: 'Work' },
    ];

    const result = analyzeDueDateBunching(tasks, { threshold: 10 });

    expect(result.averageTasksPerDay).toBe(2);
  });
});
