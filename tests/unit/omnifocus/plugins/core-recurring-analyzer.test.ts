import { describe, it, expect } from 'vitest';
import { CoreRecurringAnalyzer } from '../../../../src/omnifocus/plugins/CoreRecurringAnalyzer.js';
import type { TaskContext, RepetitionRule } from '../../../../src/omnifocus/plugins/types.js';

function makeTask(partial: Partial<Record<keyof TaskContext, any>> & { name?: string } = {}): TaskContext {
  const now = new Date();
  return {
    id: () => 't1',
    name: () => partial.name ?? 'Task',
    added: () => partial.added?.() ?? now,
    dueDate: () => partial.dueDate?.() ?? null,
    deferDate: () => partial.deferDate?.() ?? null,
    completionDate: () => partial.completionDate?.() ?? null,
    completed: () => partial.completed?.() ?? false,
    dropped: () => partial.dropped?.() ?? false,
    repetitionRule: () => partial.repetitionRule?.() ?? null,
    containingProject: () => partial.containingProject?.() ?? null,
    tags: () => partial.tags?.() ?? [],
    note: () => partial.note?.() ?? null,
  } as TaskContext;
}

describe('CoreRecurringAnalyzer', () => {
  const analyzer = new CoreRecurringAnalyzer();

  it('canAnalyze returns true for any task', () => {
    const task = makeTask({ name: 'Anything' });
    expect(analyzer.canAnalyze(task)).toBe(true);
  });

  it('infers standard rules from task name patterns', () => {
    const daily = analyzer.analyze(makeTask({ name: 'Daily standup' }));
    expect(daily?.isRecurring).toBe(true);
    expect(daily?.frequency).toBe('Daily');

    const weekly = analyzer.analyze(makeTask({ name: 'Weekly review recent activity' }));
    expect(weekly?.frequency).toBe('Weekly');

    const monthly = analyzer.analyze(makeTask({ name: 'Budget review - monthly' }));
    expect(monthly?.frequency).toBe('Monthly');

    const yearly = analyzer.analyze(makeTask({ name: 'Domain renewal .com - yearly' }));
    expect(yearly?.frequency).toBe('Yearly');
  });

  it('infers rules from defer/due date differences (weekly/monthly/yearly)', () => {
    const now = new Date();

    // ~7 days difference -> weekly
    const weekly = analyzer.analyze(makeTask({
      name: 'Task',
      deferDate: () => new Date(now),
      dueDate: () => new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
    }));
    expect(weekly?.frequency).toBe('Weekly');

    // ~30 days -> monthly
    const monthly = analyzer.analyze(makeTask({
      name: 'Task',
      deferDate: () => new Date(now),
      dueDate: () => new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
    }));
    expect(monthly?.frequency).toBe('Monthly');

    // ~730 days -> every 2 years
    const yrs = analyzer.analyze(makeTask({
      name: 'Domain',
      deferDate: () => new Date(now),
      dueDate: () => new Date(now.getTime() + 730 * 24 * 60 * 60 * 1000),
    }));
    expect(yrs?.frequency).toBe('Every 2 years');
  });

  it('uses provided repetition rule and sets nextExpectedDate based on dueDate', () => {
    const now = new Date();
    const due = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const task = makeTask({ name: 'Provided rule', dueDate: () => due, added: () => new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000) });
    const rule: RepetitionRule = { unit: 'days', steps: 1 };
    const res = analyzer.analyze(task, rule)!;
    expect(res.isRecurring).toBe(true);
    expect(res.frequency).toBe('Daily');
    expect(res.nextExpectedDate).toBeDefined();
  });

  it('flags rescheduled when daysSinceAdded exceeds interval * 1.5', () => {
    const now = new Date();
    const oldAdded = new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000); // 20 days
    const task = makeTask({ name: 'Monthly-ish', added: () => oldAdded });
    const res = analyzer.analyze(task, { unit: 'weeks', steps: 1 })!; // intervalDays ~7
    expect(res.type).toBe('rescheduled');
    expect(res.scheduleDeviation).toBe(true);
  });
});

