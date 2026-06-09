import { describe, it, expect } from 'vitest';
import { lowerRepetitionRule } from '../../../../../src/contracts/ast/mutation/repetition.js';

describe('lowerRepetitionRule', () => {
  it('lowers a minimal weekly rule', () => {
    expect(lowerRepetitionRule({ frequency: 'weekly', interval: 1 })).toEqual({
      rrule: 'FREQ=WEEKLY',
      scheduleTypePath: 'Task.RepetitionScheduleType.Regularly',
      anchorPath: 'Task.AnchorDateKey.DueDate',
      catchUp: true,
    });
  });

  it('emits INTERVAL only when > 1', () => {
    expect(lowerRepetitionRule({ frequency: 'daily', interval: 3 }).rrule).toBe('FREQ=DAILY;INTERVAL=3');
    expect(lowerRepetitionRule({ frequency: 'daily', interval: 1 }).rrule).toBe('FREQ=DAILY');
  });

  it('lowers BYDAY with and without positions', () => {
    expect(
      lowerRepetitionRule({
        frequency: 'monthly',
        interval: 1,
        daysOfWeek: [{ day: 'MO', position: 2 }, { day: 'FR' }],
      }).rrule,
    ).toBe('FREQ=MONTHLY;BYDAY=2MO,FR');
  });

  it('lowers BYMONTHDAY, COUNT, UNTIL, WKST, BYSETPOS', () => {
    expect(
      lowerRepetitionRule({
        frequency: 'monthly',
        interval: 1,
        daysOfMonth: [1, -1],
        count: 5,
        endDate: '2026-12-31',
        weekStart: 'MO',
        setPositions: [-1],
      }).rrule,
    ).toBe('FREQ=MONTHLY;BYMONTHDAY=1,-1;COUNT=5;UNTIL=20261231;WKST=MO;BYSETPOS=-1');
  });

  it('derives scheduleType from deprecated method when scheduleType absent', () => {
    expect(
      lowerRepetitionRule({ frequency: 'weekly', interval: 1, method: 'due-after-completion' }).scheduleTypePath,
    ).toBe('Task.RepetitionScheduleType.FromCompletion');
    expect(lowerRepetitionRule({ frequency: 'weekly', interval: 1, method: 'fixed' }).scheduleTypePath).toBe(
      'Task.RepetitionScheduleType.Regularly',
    );
  });

  it('explicit scheduleType wins over method', () => {
    expect(
      lowerRepetitionRule({
        frequency: 'weekly',
        interval: 1,
        method: 'due-after-completion',
        scheduleType: 'regularly',
      }).scheduleTypePath,
    ).toBe('Task.RepetitionScheduleType.Regularly');
  });

  it('defer-after-completion implies DeferDate anchor', () => {
    const out = lowerRepetitionRule({ frequency: 'weekly', interval: 1, method: 'defer-after-completion' });
    expect(out.anchorPath).toBe('Task.AnchorDateKey.DeferDate');
    expect(out.scheduleTypePath).toBe('Task.RepetitionScheduleType.FromCompletion');
  });

  it('explicit anchorDateKey wins', () => {
    expect(lowerRepetitionRule({ frequency: 'weekly', interval: 1, anchorDateKey: 'planned-date' }).anchorPath).toBe(
      'Task.AnchorDateKey.PlannedDate',
    );
  });

  it('explicit scheduleType from-completion maps to FromCompletion', () => {
    expect(
      lowerRepetitionRule({ frequency: 'weekly', interval: 1, scheduleType: 'from-completion' }).scheduleTypePath,
    ).toBe('Task.RepetitionScheduleType.FromCompletion');
  });

  it('explicit anchorDateKey due-date and defer-date map to their enum paths', () => {
    expect(lowerRepetitionRule({ frequency: 'weekly', interval: 1, anchorDateKey: 'due-date' }).anchorPath).toBe(
      'Task.AnchorDateKey.DueDate',
    );
    expect(lowerRepetitionRule({ frequency: 'weekly', interval: 1, anchorDateKey: 'defer-date' }).anchorPath).toBe(
      'Task.AnchorDateKey.DeferDate',
    );
  });

  it('catchUpAutomatically false is honored; default is true', () => {
    expect(lowerRepetitionRule({ frequency: 'weekly', interval: 1, catchUpAutomatically: false }).catchUp).toBe(false);
    expect(lowerRepetitionRule({ frequency: 'weekly', interval: 1 }).catchUp).toBe(true);
  });

  it('throws loud on invalid frequency (build time, not runtime)', () => {
    expect(() => lowerRepetitionRule({ frequency: 'fortnightly' as never, interval: 1 })).toThrow(/frequency/i);
  });

  it('throws loud on never-cast garbage scheduleType / anchorDateKey', () => {
    expect(() => lowerRepetitionRule({ frequency: 'weekly', interval: 1, scheduleType: 'sometimes' as never })).toThrow(
      /scheduleType/i,
    );
    expect(() =>
      lowerRepetitionRule({ frequency: 'weekly', interval: 1, anchorDateKey: 'start-date' as never }),
    ).toThrow(/anchorDateKey/i);
  });
});
