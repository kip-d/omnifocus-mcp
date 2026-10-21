import { describe, it, expect } from 'vitest';
import { WriteSchema } from '../../../../../src/tools/unified/schemas/write-schema.js';

/**
 * OMN-343 (slice 2, gate follow-up): DATE_REGEX/DATE_ONLY_REGEX (slice 1)
 * check FORMAT only — "2026-13-01" (month 13), "2026-10-21 25:00" (hour 25),
 * "2026-10-21 23:61" (minute 61), and "2026-02-30" (day-of-month overflow,
 * which `new Date(...)` previously rolled over to 2026-03-02 instead of
 * throwing) all match the format regex. Without a calendar-validity check,
 * these reached `localToUTC` downstream, which threw — and
 * sanitizeDateField's catch SILENTLY DROPPED the field on a task update
 * (success, change ignored) while handleProjectUpdateDirect's bare
 * localToUTC call threw on a project update — the exact F1/F2 target
 * disagreement slice 1 closed for non-conforming FORMATS, surviving for
 * conforming-but-invalid ones. Fixed at the schema (write-schema.ts's
 * `isCalendarValidDate`) so every route rejects identically before any
 * script runs, and sanitizeDateField's catch is now genuinely unreachable
 * (it rethrows — see task-sanitizer.test.ts).
 */

const BAD_DATES: Array<{ label: string; value: string }> = [
  { label: 'month 13', value: '2026-13-01' },
  { label: 'hour 25', value: '2026-10-21 25:00' },
  { label: 'minute 61', value: '2026-10-21 23:61' },
  { label: 'day-of-month overflow (Feb 30)', value: '2026-02-30' },
  { label: 'non-leap-year Feb 29', value: '2026-02-29' },
];

describe('WriteSchema calendar-validity (OMN-343 slice 2 gate follow-up)', () => {
  describe('top level', () => {
    for (const { label, value } of BAD_DATES) {
      it(`rejects ${label} ("${value}") on task update dueDate`, () => {
        const result = WriteSchema.safeParse({
          mutation: { operation: 'update', target: 'task', id: 't1', changes: { dueDate: value } },
        });
        expect(result.success).toBe(false);
        if (!result.success) {
          const issue = result.error.issues.find((i) => i.path.join('.') === 'mutation.changes.dueDate');
          expect(issue).toBeDefined();
          expect(issue?.message).toBe(`Invalid calendar date: "${value}". Date format: YYYY-MM-DD or YYYY-MM-DD HH:mm`);
        }
      });
    }

    it('rejects a calendar-invalid date on task create', () => {
      const result = WriteSchema.safeParse({
        mutation: { operation: 'create', target: 'task', data: { name: 'X', dueDate: '2026-02-30' } },
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const issue = result.error.issues.find((i) => i.path.join('.') === 'mutation.data.dueDate');
        expect(issue?.message).toMatch(/^Invalid calendar date: "2026-02-30"\./);
      }
    });

    it('rejects a calendar-invalid completionDate on complete', () => {
      const result = WriteSchema.safeParse({
        mutation: { operation: 'complete', target: 'task', id: 't1', completionDate: '2026-02-30' },
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const issue = result.error.issues.find((i) => i.path.join('.') === 'mutation.completionDate');
        expect(issue?.message).toMatch(/^Invalid calendar date: "2026-02-30"\./);
      }
    });

    it('rejects a calendar-invalid repetitionRule.endDate (date-only message)', () => {
      const result = WriteSchema.safeParse({
        mutation: {
          operation: 'create',
          target: 'task',
          data: { name: 'X', repetitionRule: { frequency: 'daily', endDate: '2026-02-30' } },
        },
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const issue = result.error.issues.find((i) => i.path.join('.') === 'mutation.data.repetitionRule.endDate');
        expect(issue?.message).toBe(
          'Invalid calendar date: "2026-02-30". Date format: YYYY-MM-DD (date only — RRULE UNTIL has no time component)',
        );
      }
    });
  });

  describe('per batch item', () => {
    it('rejects a calendar-invalid date on a batch update item, naming that item', () => {
      const result = WriteSchema.safeParse({
        mutation: {
          operation: 'batch',
          operations: [
            { operation: 'update', target: 'task', id: 't1', changes: { flagged: true } },
            { operation: 'update', target: 'task', id: 't2', changes: { dueDate: '2026-13-01' } },
          ],
        },
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const issue = result.error.issues.find((i) => i.path.join('.') === 'mutation.operations.1.changes.dueDate');
        expect(issue).toBeDefined();
        expect(issue?.message).toMatch(/^Invalid calendar date: "2026-13-01"\./);
      }
    });

    it('rejects a calendar-invalid date on a batch create item', () => {
      const result = WriteSchema.safeParse({
        mutation: {
          operation: 'batch',
          operations: [{ operation: 'create', target: 'task', data: { name: 'X', deferDate: '2026-02-30' } }],
        },
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const issue = result.error.issues.find((i) => i.path.join('.') === 'mutation.operations.0.data.deferDate');
        expect(issue?.message).toMatch(/^Invalid calendar date: "2026-02-30"\./);
      }
    });
  });

  describe('leap years', () => {
    it('accepts the leap day in a leap year (2028-02-29)', () => {
      const result = WriteSchema.safeParse({
        mutation: { operation: 'update', target: 'task', id: 't1', changes: { dueDate: '2028-02-29' } },
      });
      expect(result.success).toBe(true);
    });

    it('rejects the leap day in a non-leap year (2026-02-29)', () => {
      const result = WriteSchema.safeParse({
        mutation: { operation: 'update', target: 'task', id: 't1', changes: { dueDate: '2026-02-29' } },
      });
      expect(result.success).toBe(false);
    });

    it('accepts 2000-02-29 (divisible by 400 — leap)', () => {
      const result = WriteSchema.safeParse({
        mutation: { operation: 'update', target: 'task', id: 't1', changes: { dueDate: '2000-02-29' } },
      });
      expect(result.success).toBe(true);
    });

    it('rejects 1900-02-29 (divisible by 100, not 400 — not leap)', () => {
      const result = WriteSchema.safeParse({
        mutation: { operation: 'update', target: 'task', id: 't1', changes: { dueDate: '1900-02-29' } },
      });
      expect(result.success).toBe(false);
    });

    // OMN-343 (slice 2, gate finding B): `daysInMonth` passed Number(yearStr)
    // straight to `Date.UTC(year, month, 0)`. Per the ECMAScript spec,
    // `Date.UTC` (and `new Date(...)`) treats a 2-digit-range year 0-99 as
    // 1900+year — so year 100 was silently read back as 2000, making
    // "0100-02-29" validate (2000 IS a leap year) when year 100 actually
    // is NOT (divisible by 100, not by 400). Years >= 100 fall outside that
    // remapping window and were already correct. Fixed by replacing the
    // Date.UTC trick with pure leap-rule arithmetic, so every year behaves
    // the same regardless of magnitude.
    it('rejects 0100-02-29 (year 100: divisible by 100, not 400 — not leap; previously misread as year 2000)', () => {
      const result = WriteSchema.safeParse({
        mutation: { operation: 'update', target: 'task', id: 't1', changes: { dueDate: '0100-02-29' } },
      });
      expect(result.success).toBe(false);
    });

    it('accepts 0096-02-29 (year 96: divisible by 4, not by 100 — leap)', () => {
      const result = WriteSchema.safeParse({
        mutation: { operation: 'update', target: 'task', id: 't1', changes: { dueDate: '0096-02-29' } },
      });
      expect(result.success).toBe(true);
    });

    it('accepts 0400-02-29 (year 400: divisible by 400 — leap) on a batch update item', () => {
      const result = WriteSchema.safeParse({
        mutation: {
          operation: 'batch',
          operations: [{ operation: 'update', target: 'task', id: 't1', changes: { dueDate: '0400-02-29' } }],
        },
      });
      expect(result.success).toBe(true);
    });

    // The concrete manifestation of the Date.UTC two-digit-year remap bug:
    // `Date.UTC` (and `new Date(...)`) maps a year in 0-99 to 1900+year per
    // the ECMAScript spec. Year 0 is the ONLY value in that range whose true
    // leap-ness (0 % 400 === 0 → leap) differs from its remapped twin's
    // (1900 % 400 === 300 → not leap) — every other year 1-99 keeps the same
    // %4/%100 remainder under the +1900 shift, so this is the one case that
    // actually flips under the old `daysInMonth`. Direct repro (pre-fix):
    // `new Date(Date.UTC(0, 2, 0)).getUTCDate()` returns 28, not 29.
    it('accepts 0000-02-29 (year 0: divisible by 400 — leap; previously misread via the year-0-99→1900s remap)', () => {
      const result = WriteSchema.safeParse({
        mutation: { operation: 'update', target: 'task', id: 't1', changes: { dueDate: '0000-02-29' } },
      });
      expect(result.success).toBe(true);
    });
  });

  describe('still accepts valid dates (no regression)', () => {
    it('accepts a valid date-only dueDate', () => {
      expect(
        WriteSchema.safeParse({
          mutation: { operation: 'update', target: 'task', id: 't1', changes: { dueDate: '2026-10-21' } },
        }).success,
      ).toBe(true);
    });

    it('accepts a valid date+time dueDate', () => {
      expect(
        WriteSchema.safeParse({
          mutation: { operation: 'update', target: 'task', id: 't1', changes: { dueDate: '2026-10-21 14:30' } },
        }).success,
      ).toBe(true);
    });

    it('accepts null dueDate (clears the field)', () => {
      expect(
        WriteSchema.safeParse({
          mutation: { operation: 'update', target: 'task', id: 't1', changes: { dueDate: null } },
        }).success,
      ).toBe(true);
    });

    it('accepts a valid repetitionRule.endDate', () => {
      expect(
        WriteSchema.safeParse({
          mutation: {
            operation: 'create',
            target: 'task',
            data: { name: 'X', repetitionRule: { frequency: 'daily', endDate: '2026-12-31' } },
          },
        }).success,
      ).toBe(true);
    });
  });
});
