import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatDate, parseDate } from '../../../src/utils/dates.js';

// ---------------------------------------------------------------------------
// Freeze time: 2026-03-01 12:00:00 (a Sunday)
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-03-01T12:00:00'));
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// parseDate
// ---------------------------------------------------------------------------

describe('parseDate', () => {
  // -- Passthrough ----------------------------------------------------------

  it('passes through YYYY-MM-DD unchanged', () => {
    expect(parseDate('2026-03-15')).toBe('2026-03-15');
  });

  it('passes through YYYY-MM-DD HH:mm unchanged', () => {
    expect(parseDate('2026-03-15 14:30')).toBe('2026-03-15 14:30');
  });

  // -- Natural language -----------------------------------------------------

  it('parses "today" to 2026-03-01', () => {
    expect(parseDate('today')).toBe('2026-03-01');
  });

  it('parses "tomorrow" to 2026-03-02', () => {
    expect(parseDate('tomorrow')).toBe('2026-03-02');
  });

  it('parses "yesterday" to 2026-02-28', () => {
    expect(parseDate('yesterday')).toBe('2026-02-28');
  });

  it('parses "next monday" (2026-03-01 is Sunday, next Monday is 2026-03-02)', () => {
    expect(parseDate('next monday')).toBe('2026-03-02');
  });

  it('parses "next friday" correctly', () => {
    // Sunday 2026-03-01 -> next Friday is 2026-03-06
    expect(parseDate('next friday')).toBe('2026-03-06');
  });

  it('parses "next sunday" to the following Sunday (not same day)', () => {
    // Current day is Sunday, so "next sunday" should be 7 days later
    expect(parseDate('next sunday')).toBe('2026-03-08');
  });

  it('parses "in 3 days"', () => {
    expect(parseDate('in 3 days')).toBe('2026-03-04');
  });

  it('parses "in 1 day" (singular)', () => {
    expect(parseDate('in 1 day')).toBe('2026-03-02');
  });

  it('parses "eom" to end of March', () => {
    expect(parseDate('eom')).toBe('2026-03-31');
  });

  it('parses "end of month" to end of March', () => {
    expect(parseDate('end of month')).toBe('2026-03-31');
  });

  it('parses "eow" to next Sunday (2026-03-08)', () => {
    // Current is Sunday 2026-03-01, end of week = next Sunday = 2026-03-08
    expect(parseDate('eow')).toBe('2026-03-08');
  });

  it('parses "end of week" to next Sunday', () => {
    expect(parseDate('end of week')).toBe('2026-03-08');
  });

  // -- Case insensitive -----------------------------------------------------

  it('is case insensitive', () => {
    expect(parseDate('Today')).toBe('2026-03-01');
    expect(parseDate('TOMORROW')).toBe('2026-03-02');
    expect(parseDate('Next Monday')).toBe('2026-03-02');
  });

  // -- Whitespace trimming --------------------------------------------------

  it('trims whitespace', () => {
    expect(parseDate('  today  ')).toBe('2026-03-01');
  });

  // -- Unparseable ----------------------------------------------------------

  it('returns null for unparseable input', () => {
    expect(parseDate('not a date')).toBeNull();
    expect(parseDate('gibberish')).toBeNull();
    expect(parseDate('')).toBeNull();
  });

  // -- Never returns Z suffix or T separator --------------------------------

  it('never returns ISO-8601 with Z suffix or T separator', () => {
    const inputs = [
      'today',
      'tomorrow',
      'yesterday',
      'next monday',
      'in 5 days',
      'eom',
      'eow',
      '2026-03-15',
      '2026-03-15 14:30',
    ];

    for (const input of inputs) {
      const result = parseDate(input);
      if (result !== null) {
        expect(result).not.toContain('Z');
        expect(result).not.toContain('T');
      }
    }
  });
});

// ---------------------------------------------------------------------------
// formatDate
// ---------------------------------------------------------------------------

describe('formatDate', () => {
  it('adds 17:00 for due dates', () => {
    expect(formatDate('2026-03-15', 'due')).toBe('2026-03-15 17:00');
  });

  it('adds 08:00 for defer dates', () => {
    expect(formatDate('2026-03-15', 'defer')).toBe('2026-03-15 08:00');
  });

  it('adds 08:00 for planned dates', () => {
    expect(formatDate('2026-03-15', 'planned')).toBe('2026-03-15 08:00');
  });

  it('adds 12:00 for completion dates', () => {
    expect(formatDate('2026-03-15', 'completion')).toBe('2026-03-15 12:00');
  });

  it('preserves explicit time if already present', () => {
    expect(formatDate('2026-03-15 09:30', 'due')).toBe('2026-03-15 09:30');
    expect(formatDate('2026-03-15 09:30', 'defer')).toBe('2026-03-15 09:30');
    expect(formatDate('2026-03-15 09:30', 'planned')).toBe('2026-03-15 09:30');
    expect(formatDate('2026-03-15 09:30', 'completion')).toBe('2026-03-15 09:30');
  });

  it('trims whitespace from input', () => {
    expect(formatDate('  2026-03-15  ', 'due')).toBe('2026-03-15 17:00');
  });
});
