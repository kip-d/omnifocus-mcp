import { describe, it, expect } from 'vitest';
import { GamingRecurringAnalyzer } from '../../../../src/omnifocus/plugins/GamingRecurringAnalyzer.js';
import type { TaskContext, RepetitionRule } from '../../../../src/omnifocus/plugins/types.js';

function makeTask(opts: {
  name?: string;
  projectName?: string;
  addedDaysAgo?: number;
  dueInHours?: number | null;
  deferOffsetHours?: number | null;
} = {}): TaskContext {
  const now = new Date();
  const added = new Date(now.getTime() - (opts.addedDaysAgo ?? 0) * 24 * 60 * 60 * 1000);
  const due = opts.dueInHours === null ? null : (opts.dueInHours !== undefined ? new Date(now.getTime() + opts.dueInHours * 60 * 60 * 1000) : null);
  const defer = opts.deferOffsetHours === null ? null : (opts.deferOffsetHours !== undefined ? new Date(now.getTime() + (opts.deferOffsetHours ?? 0) * 60 * 60 * 1000) : null);
  return {
    id: () => 'g1',
    name: () => opts.name ?? 'Play game',
    added: () => added,
    dueDate: () => due,
    deferDate: () => defer,
    completionDate: () => null,
    completed: () => false,
    dropped: () => false,
    repetitionRule: () => null,
    containingProject: () => opts.projectName ? ({ name: () => opts.projectName!, id: () => 'p1' }) : null,
    tags: () => [],
    note: () => null,
  } as TaskContext;
}

describe('GamingRecurringAnalyzer', () => {
  const analyzer = new GamingRecurringAnalyzer();

  it('canAnalyze when name or project indicates gaming', () => {
    expect(analyzer.canAnalyze(makeTask({ name: 'Energy available in game' }))).toBe(true);
    expect(analyzer.canAnalyze(makeTask({ name: 'Harvest mines', projectName: 'Mobile Game - Titans' }))).toBe(true);
    expect(analyzer.canAnalyze(makeTask({ name: 'Unrelated', projectName: 'Work' }))).toBe(false);
  });

  it('analyze with provided hourly rule sets frequency and nextExpectedDate', () => {
    const task = makeTask({ name: 'Hourly energy', dueInHours: 1, addedDaysAgo: 2 });
    const rule: RepetitionRule = { unit: 'hours', steps: 1 };
    const res = analyzer.analyze(task, rule)!;
    expect(res.isRecurring).toBe(true);
    expect(res.frequency).toContain('Hourly');
    expect(res.nextExpectedDate).toBeDefined();
    // addedDaysAgo=2 vs interval of 1h -> rescheduled
    expect(res.type).toBe('rescheduled');
  });

  it('infers 8-hour cycle from project reset hour', () => {
    // due hour 16 → expect 8-hour rule per analyzer
    const now = new Date();
    const at16 = new Date(now);
    at16.setHours(16, 0, 0, 0);
    const task = makeTask({ name: 'Collect', projectName: 'Blitz Game', addedDaysAgo: 0, dueInHours: (at16.getTime()-now.getTime())/(1000*60*60) });
    const res = analyzer.analyze(task)!;
    expect(res.isRecurring).toBe(true);
    expect(res.frequency).toContain('Every 8 hours');
  });

  it('infers hourly from task name patterns', () => {
    const task = makeTask({ name: 'Every hour - energy available', addedDaysAgo: 0 });
    const res = analyzer.analyze(task)!;
    expect(res.frequency).toContain('Hourly');
    expect(res.confidence).toBeGreaterThan(0.5);
  });
});
