import { describe, it, expect, afterEach, vi } from 'vitest';
import { extractDates } from '../../../../src/tools/capture/date-extraction.js';

// OMN-342: date-suggestion arithmetic and parsing bugs, each under a pinned
// local clock (noon, so no DST or midnight edge interferes).
function pinClock(y: number, m: number, d: number): void {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(y, m - 1, d, 12, 0, 0));
}

afterEach(() => {
  vi.useRealTimers();
});

describe('extractDates — end of month / next month (OMN-342)', () => {
  it.each([
    // [clock, phrase, expected]; setMonth(+1) before setDate(0) overflowed
    // whenever the next month is shorter than today's day-of-month.
    [[2026, 1, 31], 'end of month', '2026-01-31'],
    [[2026, 8, 31], 'end of month', '2026-08-31'],
    [[2026, 7, 31], 'end of month', '2026-07-31'],
    [[2026, 1, 31], 'next month', '2026-02-28'],
    [[2026, 8, 31], 'next month', '2026-09-30'],
    [[2026, 12, 15], 'next month', '2027-01-31'],
  ] as const)('clock %j: "%s" -> %s', ([y, m, d], phrase, expected) => {
    pinClock(y, m, d);
    expect(extractDates(`Finish the report by ${phrase}`).dueDate).toBe(expected);
  });
});

describe('extractDates — explicit dates roll to next year when already past (OMN-342)', () => {
  it('"by March 3" said in September is next March, not a past date', () => {
    pinClock(2026, 9, 29);
    expect(extractDates('Renew the lease by March 3').dueDate).toBe('2027-03-03');
  });

  it('a date later this year stays this year', () => {
    pinClock(2026, 9, 29);
    expect(extractDates('Submit the budget by October 15').dueDate).toBe('2026-10-15');
  });

  it('today itself is not rolled forward', () => {
    pinClock(2026, 9, 29);
    expect(extractDates('Ship it by September 29').dueDate).toBe('2026-09-29');
  });

  it('a past slash date without a year rolls forward too', () => {
    pinClock(2026, 9, 29);
    expect(extractDates('Send invoices by 3/1').dueDate).toBe('2027-03-01');
  });

  it('an explicit year is never rolled', () => {
    pinClock(2026, 9, 29);
    expect(extractDates('Archive files by 3/1/2026').dueDate).toBe('2026-03-01');
  });
});

describe('extractDates — slash dates need a date context (OMN-342)', () => {
  it('a fraction is not a date', () => {
    pinClock(2026, 9, 29);
    expect(extractDates('Buy 1/2 gallon milk').dueDate).toBeUndefined();
  });

  it('a slash date after "by" / "due" still parses', () => {
    pinClock(2026, 9, 29);
    expect(extractDates('Pay rent by 10/15').dueDate).toBe('2026-10-15');
    expect(extractDates('Report due 11/2').dueDate).toBe('2026-11-02');
  });

  it('a fraction next to a real date phrase takes the phrase', () => {
    pinClock(2026, 9, 29);
    expect(extractDates('Buy 1/2 gallon milk by tomorrow').dueDate).toBe('2026-09-30');
  });
});
