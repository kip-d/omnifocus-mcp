// tests/unit/omnifocus/scripts/analytics/productivity-period.test.ts
// OMN-250 (OMN-148 drift D4+D23) — the productivity_stats period vocabulary is
// reconciled: every value the Zod enum can send has a switch case, and a value
// with no case fails LOUD (error envelope), never NaN→null→schema-rejection.
import vm from 'node:vm';
import { describe, it, expect } from 'vitest';
import { PRODUCTIVITY_STATS_SCRIPT_V3 } from '../../../../../src/omnifocus/scripts/analytics/productivity-stats-v3.js';
import { PRODUCTIVITY_STATS_V3_SCHEMA } from '../../../../../src/omnifocus/response-schemas/analyze.js';
import { AnalyzeSchema } from '../../../../../src/tools/unified/schemas/analyze-schema.js';

/** Execute the two-layer JXA→OmniJS script against an empty fake database. */
function runScript(options: Record<string, unknown>): unknown {
  const script = PRODUCTIVITY_STATS_SCRIPT_V3.replace('{{options}}', JSON.stringify(options));
  const inner = {
    flattenedTasks: [],
    flattenedProjects: [],
    flattenedTags: [],
    Task: { Status: { Blocked: 'blocked' } },
    Project: { Status: { Active: 'active' } },
    JSON,
  };
  const outer = {
    Application: () => ({ evaluateJavascript: (src: string) => vm.runInNewContext(src, inner) }),
    JSON,
  };
  return JSON.parse(vm.runInNewContext(script, outer) as string);
}

/** Mirror the script's daysInPeriod arithmetic: ceil((now − midnight(now − backDays))/86400000).
 * The result is backDays+1 for most of the day (the start is midnight-anchored,
 * `now` isn't) — pinned as CURRENT behavior, matching the spec draft §3.2. */
function expectedDaysInPeriod(backDays: number): number {
  const now = new Date();
  const start = new Date();
  start.setDate(now.getDate() - backDays);
  start.setHours(0, 0, 0, 0);
  return Math.ceil((now.getTime() - start.getTime()) / 86400000);
}

describe('OMN-250 — productivity_stats period vocabulary', () => {
  it("period 'day' (a legal Zod value) produces a VALID envelope with midnight-today semantics", () => {
    const parsed = runScript({ period: 'day', includeProjectStats: false, includeTagStats: false }) as {
      ok: boolean;
      data: { summary: { daysInPeriod: number; dailyAverage: number } };
    };
    expect(parsed.ok).toBe(true);
    // Pre-fix: 'day' matched no case → daysInPeriod 0 → dailyAverage NaN →
    // JSON null → the strict envelope schema REJECTED the response.
    expect(PRODUCTIVITY_STATS_V3_SCHEMA.safeParse(parsed).success).toBe(true);
    expect(parsed.data.summary.daysInPeriod).toBe(expectedDaysInPeriod(0)); // 1, except exactly at midnight
    expect(parsed.data.summary.dailyAverage).toBe(0);
  });

  it("period 'week' unchanged: midnight-anchored 7-day lookback, schema-valid (regression pin)", () => {
    const parsed = runScript({ period: 'week', includeProjectStats: false, includeTagStats: false }) as {
      ok: boolean;
      data: { summary: { daysInPeriod: number } };
    };
    expect(parsed.ok).toBe(true);
    expect(PRODUCTIVITY_STATS_V3_SCHEMA.safeParse(parsed).success).toBe(true);
    // NOTE: 8 for most of the day (midnight-anchored start + ceil), not 7 —
    // pinned current behavior, surfaced red-first while writing this test.
    expect(parsed.data.summary.daysInPeriod).toBe(expectedDaysInPeriod(7));
  });

  it("period 'month' unchanged: calendar-month lookback, schema-valid (regression pin)", () => {
    const parsed = runScript({ period: 'month', includeProjectStats: false, includeTagStats: false }) as {
      ok: boolean;
      data: { summary: { daysInPeriod: number } };
    };
    expect(parsed.ok).toBe(true);
    expect(parsed.data.summary.daysInPeriod).toBeGreaterThanOrEqual(28);
    expect(parsed.data.summary.daysInPeriod).toBeLessThanOrEqual(31);
  });

  it('an unknown period fails LOUD with the error envelope (never a silent no-match)', () => {
    // 'quarter' was one of three switch branches the Zod enum could never send
    // (D23) — post-reconciliation the switch matches the enum exactly and
    // anything else is a loud error, guarding future vocabulary drift.
    const parsed = runScript({ period: 'quarter', includeProjectStats: false, includeTagStats: false }) as {
      ok: boolean;
      error?: { message: string };
    };
    expect(parsed.ok).toBe(false);
    expect(parsed.error?.message).toContain('Unknown period');
    expect(parsed.error?.message).toContain('quarter');
  });

  it('the Zod boundary still accepts exactly day|week|month (dual-schema pin)', () => {
    const base = (groupBy: string) => ({
      analysis: { type: 'productivity_stats', params: { groupBy } },
    });
    expect(AnalyzeSchema.safeParse(base('day')).success).toBe(true);
    expect(AnalyzeSchema.safeParse(base('week')).success).toBe(true);
    expect(AnalyzeSchema.safeParse(base('month')).success).toBe(true);
    expect(AnalyzeSchema.safeParse(base('quarter')).success).toBe(false);
    expect(AnalyzeSchema.safeParse(base('today')).success).toBe(false);
  });
});
