import { describe, it, expect } from 'vitest';
import { analyzeNextActions } from '../../../src/omnifocus/scripts/analytics/next-actions-analyzer.js';

describe('analyzeNextActions', () => {
  it('scores clear action tasks highly', () => {
    const tasks = [
      { id: 't1', name: 'Call John about meeting', completed: false },
      { id: 't2', name: 'Write proposal draft', completed: false },
      { id: 't3', name: 'Review PR #123', completed: false }
    ];

    const result = analyzeNextActions(tasks);

    expect(result.clearTasks).toBe(3);
    expect(result.vagueTasks).toBe(0);
    expect(result.averageActionabilityScore).toBeGreaterThan(80);
  });

  it('identifies vague task names', () => {
    const tasks = [
      { id: 't1', name: 'Mom', completed: false },
      { id: 't2', name: 'Project ideas', completed: false },
      { id: 't3', name: 'Stuff', completed: false }
    ];

    const result = analyzeNextActions(tasks);

    expect(result.vagueTasks).toBe(3);
    expect(result.clearTasks).toBe(0);
    expect(result.examples).toHaveLength(3);
    expect(result.examples[0].score).toBeLessThan(50);
  });

  it('skips completed tasks', () => {
    const tasks = [
      { id: 't1', name: 'Vague', completed: true },
      { id: 't2', name: 'Call Sarah', completed: false }
    ];

    const result = analyzeNextActions(tasks);

    expect(result.clearTasks + result.vagueTasks).toBe(1);
  });

  it('provides suggestions for vague tasks', () => {
    const tasks = [
      { id: 't1', name: 'Mom', completed: false }
    ];

    const result = analyzeNextActions(tasks);

    expect(result.examples[0].suggestion).toContain('Call');
  });
});
