// tests/unit/omnifocus/scripts/analytics/task-velocity-daterange.test.ts
// OMN-334 (AUDIT #6) — task_velocity's range bounds reached the nested OmniJS
// program as raw splices: `new Date('${startDateStr}T00:00:00')`. A quote in the
// value rewrote the program running inside OmniFocus, and a "YYYY-MM-DD HH:mm"
// value became Invalid Date, so the op returned ok:true with every count 0.
// The tool now passes UTC instants (localDateBoundToUTC) and the script embeds
// them as JSON literals.
import { describe, it, expect } from 'vitest';
import { TASK_VELOCITY_SCRIPT_V3 } from '../../../../../src/omnifocus/scripts/analytics/task-velocity-v3.js';
import { TASK_VELOCITY_V3_SCHEMA } from '../../../../../src/omnifocus/response-schemas/analyze.js';
import { localDateBoundToUTC } from '../../../../../src/utils/timezone.js';
import { stubTask } from '../../../contracts/ast/omnijs-vm-fixture.js';
import { runAnalyticsScript } from './run-analytics-script.js';

type VelocityEnvelope = {
  ok: boolean;
  error?: { message: string };
  data: {
    throughput: { totalCompleted: number };
    dateRange: { start: string; end: string };
  };
};

function completedAt(name: string, when: Date): unknown {
  return { ...stubTask(name), completed: true, completionDate: when };
}

describe('OMN-334 — task_velocity range bounds', () => {
  it('honors "YYYY-MM-DD HH:mm" bounds to the minute', () => {
    const db = {
      flattenedTasks: [
        completedAt('before start time', new Date(2026, 8, 1, 8, 59)),
        completedAt('inside', new Date(2026, 8, 10, 12, 0)),
        completedAt('after end time', new Date(2026, 8, 26, 17, 1)),
      ],
    };
    const parsed = runAnalyticsScript(
      TASK_VELOCITY_SCRIPT_V3,
      {
        period: 'day',
        startDate: localDateBoundToUTC('2026-09-01 09:00', 'start'),
        endDate: localDateBoundToUTC('2026-09-26 17:00', 'end'),
      },
      db,
    ) as VelocityEnvelope;

    expect(parsed.ok).toBe(true);
    expect(TASK_VELOCITY_V3_SCHEMA.safeParse(parsed).success).toBe(true);
    expect(parsed.data.throughput.totalCompleted).toBe(1);
  });

  it('date-only bounds include the whole last local day', () => {
    const db = { flattenedTasks: [completedAt('late on the end day', new Date(2026, 8, 26, 23, 30))] };
    const parsed = runAnalyticsScript(
      TASK_VELOCITY_SCRIPT_V3,
      {
        period: 'day',
        startDate: localDateBoundToUTC('2026-09-01', 'start'),
        endDate: localDateBoundToUTC('2026-09-26', 'end'),
      },
      db,
    ) as VelocityEnvelope;

    expect(parsed.data.throughput.totalCompleted).toBe(1);
  });

  it('a quote in a bound stays data — it cannot rewrite the OmniJS program', () => {
    // Schema validation rejects this first; the script must not depend on it.
    // Pre-fix this closed the string literal and threw from inside OmniFocus.
    // Post-fix the payload reaches the inner program's range guard intact, as an
    // unparseable date — the guard's own message proves the program ran as written.
    const payload = "2026-09-01'); throw new Error('INJECTED'); ('";
    const parsed = runAnalyticsScript(
      TASK_VELOCITY_SCRIPT_V3,
      { period: 'day', startDate: payload, endDate: payload },
      { flattenedTasks: [] },
    ) as VelocityEnvelope;

    expect(parsed.ok).toBe(false);
    expect(parsed.error?.message).toMatch(/^Invalid task_velocity date range/);
    expect(parsed.error?.message).not.toContain('INJECTED');
  });

  // Review of #281: the tool's schema is the only thing ordering and validating
  // the bounds; a caller that bypasses it must get an error, not ok:true with
  // every count 0 (the silent-zero class this ticket removes).
  it.each([
    ['unparseable', 'not a date', localDateBoundToUTC('2026-09-26', 'end')],
    ['swapped', localDateBoundToUTC('2026-09-26', 'start'), localDateBoundToUTC('2026-09-01', 'end')],
    ['missing', undefined, localDateBoundToUTC('2026-09-26', 'end')],
  ])('an %s range is an error, not ok:true with zeros', (_label, startDate, endDate) => {
    const parsed = runAnalyticsScript(
      TASK_VELOCITY_SCRIPT_V3,
      { period: 'day', startDate, endDate },
      { flattenedTasks: [completedAt('would count', new Date(2026, 8, 10, 12, 0))] },
    ) as VelocityEnvelope;

    expect(parsed.ok).toBe(false);
    expect(parsed.error?.message).toMatch(/^Invalid task_velocity date range/);
  });
});
