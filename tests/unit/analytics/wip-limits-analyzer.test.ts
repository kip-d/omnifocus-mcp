import { describe, it, expect } from 'vitest';
import { analyzeWipLimits } from '../../../src/omnifocus/scripts/analytics/wip-limits-analyzer.js';

describe('analyzeWipLimits', () => {
  it('identifies projects over WIP limit', () => {
    const projects = [
      {
        id: 'p1',
        name: 'Overloaded Project',
        status: 'active',
        tasks: [
          { id: 't1', completed: false, blocked: false, deferDate: null },
          { id: 't2', completed: false, blocked: false, deferDate: null },
          { id: 't3', completed: false, blocked: false, deferDate: null },
          { id: 't4', completed: false, blocked: false, deferDate: null },
          { id: 't5', completed: false, blocked: false, deferDate: null },
          { id: 't6', completed: false, blocked: false, deferDate: null }, // 6 available
        ],
      },
    ];

    const result = analyzeWipLimits(projects, { wipLimit: 5 });

    expect(result.projectsOverWipLimit).toHaveLength(1);
    expect(result.projectsOverWipLimit[0].availableTasks).toBe(6);
    expect(result.projectsOverWipLimit[0].limit).toBe(5);
  });

  it('excludes blocked and deferred tasks from available count', () => {
    const futureDate = new Date('2025-12-01').toISOString();
    const projects = [
      {
        id: 'p1',
        name: 'Project',
        status: 'active',
        tasks: [
          { id: 't1', completed: false, blocked: false, deferDate: null }, // available
          { id: 't2', completed: false, blocked: true, deferDate: null }, // blocked
          { id: 't3', completed: false, blocked: false, deferDate: futureDate }, // deferred
          { id: 't4', completed: true, blocked: false, deferDate: null }, // completed
        ],
      },
    ];

    const result = analyzeWipLimits(projects, { wipLimit: 5 });

    expect(result.healthyProjects).toBe(1);
    expect(result.overloadedProjects).toBe(0);
  });

  it('skips dropped and completed projects', () => {
    const projects = [
      { id: 'p1', name: 'Dropped', status: 'dropped', tasks: [] },
      { id: 'p2', name: 'Done', status: 'done', tasks: [] },
    ];

    const result = analyzeWipLimits(projects, { wipLimit: 5 });

    expect(result.healthyProjects).toBe(0);
    expect(result.overloadedProjects).toBe(0);
  });

  it('handles sequential projects differently', () => {
    const projects = [
      {
        id: 'p1',
        name: 'Sequential Project',
        status: 'active',
        sequential: true,
        tasks: [
          { id: 't1', completed: false, blocked: false, deferDate: null },
          { id: 't2', completed: false, blocked: true, deferDate: null }, // Only first is available
        ],
      },
    ];

    const result = analyzeWipLimits(projects, { wipLimit: 5 });

    expect(result.healthyProjects).toBe(1);
  });
});
