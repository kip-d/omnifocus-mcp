import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { localDayKey } from '../../src/utils/timezone.js';
import { analyzeDueDateBunching } from '../../src/omnifocus/scripts/analytics/due-date-bunching-analyzer.js';

// OMN-351: due-date bunching keyed days by cutting the UTC ISO string, so a
// date-only due at 17:00 local in UTC-7 (= 00:00Z the next day) bucketed onto
// the NEXT calendar day.
describe('local day keys under America/Los_Angeles (OMN-351)', () => {
  const savedTZ = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = 'America/Los_Angeles';
  });
  afterAll(() => {
    if (savedTZ === undefined) delete process.env.TZ;
    else process.env.TZ = savedTZ;
  });

  it('the TZ pin is in effect (PDT = UTC-7 in September)', () => {
    expect(new Date(2026, 8, 25).getTimezoneOffset()).toBe(420);
  });

  describe('localDayKey', () => {
    it('an ISO instant maps to its LOCAL calendar day', () => {
      // 2026-09-25 17:00 PDT
      expect(localDayKey('2026-09-26T00:00:00.000Z')).toBe('2026-09-25');
    });

    it('a Date maps to its local calendar day', () => {
      expect(localDayKey(new Date('2026-09-26T00:00:00.000Z'))).toBe('2026-09-25');
    });

    it('a bare YYYY-MM-DD passes through (not reread as UTC midnight)', () => {
      expect(localDayKey('2026-09-25')).toBe('2026-09-25');
    });

    it('a local "YYYY-MM-DD HH:mm" passes through', () => {
      expect(localDayKey('2026-09-25 17:00')).toBe('2026-09-25');
    });

    it('an unparseable string falls back to its first 10 chars', () => {
      expect(localDayKey('not-a-date')).toBe('not-a-date');
    });
  });

  it('analyzeDueDateBunching buckets an evening due onto its local day', () => {
    const tasks = Array.from({ length: 9 }, (_, i) => ({
      id: `t${i}`,
      dueDate: '2026-09-26T00:00:00.000Z',
      completed: false,
      project: 'Work',
    }));

    const result = analyzeDueDateBunching(tasks, { threshold: 8 });

    expect(result.bunchedDates.map((d) => d.date)).toEqual(['2026-09-25']);
  });
});
