import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { isLocalDateString, localDateBoundToUTC, formatBoundForDisplay } from '../../src/utils/timezone.js';
import { ReadSchema } from '../../src/tools/unified/schemas/read-schema.js';

// OMN-332: read-side date filters use the SAME local-time semantics as writes.
// Date-only bounds are whole local days, inclusive (Kip, 2026-09-28: option A).
describe('local date bounds under America/Detroit (OMN-332)', () => {
  const savedTZ = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = 'America/Detroit';
  });
  afterAll(() => {
    if (savedTZ === undefined) delete process.env.TZ;
    else process.env.TZ = savedTZ;
  });

  it('the TZ pin is in effect (EDT = UTC-4 in March)', () => {
    expect(new Date(2026, 2, 31).getTimezoneOffset()).toBe(240);
  });

  it('date-only start bound is local midnight', () => {
    expect(localDateBoundToUTC('2026-03-01', 'start')).toBe('2026-03-01T05:00:00.000Z'); // EST
  });

  it('date-only end bound is the last millisecond of the local day', () => {
    expect(localDateBoundToUTC('2026-03-31', 'end')).toBe('2026-04-01T03:59:59.999Z'); // EDT
  });

  it('a task due at the default 17:00 local on the end date falls inside', () => {
    const dueAt17 = new Date(2026, 2, 31, 17, 0).getTime();
    expect(dueAt17).toBeLessThanOrEqual(Date.parse(localDateBoundToUTC('2026-03-31', 'end')));
    expect(dueAt17).toBeGreaterThanOrEqual(Date.parse(localDateBoundToUTC('2026-03-31', 'start')));
  });

  it('a datetime bound is the exact local instant for either edge', () => {
    expect(localDateBoundToUTC('2026-03-31 17:00', 'start')).toBe('2026-03-31T21:00:00.000Z');
    expect(localDateBoundToUTC('2026-03-31 17:00', 'end')).toBe('2026-03-31T21:00:00.000Z');
  });

  it('the spring-forward day still ends at local 23:59:59.999', () => {
    expect(localDateBoundToUTC('2026-03-08', 'end')).toBe('2026-03-09T03:59:59.999Z');
  });

  // OMN-332 review: descriptions render bounds in local time, not raw UTC.
  it('formatBoundForDisplay renders an ISO instant as local "YYYY-MM-DD HH:mm"', () => {
    expect(formatBoundForDisplay('2026-04-01T03:59:59.999Z')).toBe('2026-03-31 23:59');
    expect(formatBoundForDisplay('2026-03-01T05:00:00.000Z')).toBe('2026-03-01 00:00');
    expect(formatBoundForDisplay('2026-03-31T21:00:00.000Z')).toBe('2026-03-31 17:00');
  });

  it('formatBoundForDisplay passes a non-date through unchanged', () => {
    expect(formatBoundForDisplay('not a date')).toBe('not a date');
  });

  it('formatBoundForDisplay leaves an already-local date string alone (no UTC misread)', () => {
    expect(formatBoundForDisplay('2025-12-31')).toBe('2025-12-31');
    expect(formatBoundForDisplay('2025-12-31 17:00')).toBe('2025-12-31 17:00');
  });
});

describe('isLocalDateString (OMN-332)', () => {
  it.each(['2026-03-31', '2026-03-31 17:00', '2024-02-29', '2026-12-31 23:59', '2026-01-01 00:00', '0050-01-01'])(
    'accepts %j',
    (s) => {
      expect(isLocalDateString(s)).toBe(true);
    },
  );

  it.each([
    '2026-02-30',
    '2023-02-29',
    '2026-13-01',
    '2026-03-31 24:00',
    '2026-03-31 17:60',
    '2026-03-31T17:00',
    '2026-03-31T17:00:00Z',
    '2026-3-31',
    '2026-03-31 17:00:00',
    '',
    'tomorrow',
    '2026-01-01") || true || ("',
    '2026-01-01\n',
  ])('rejects %j', (s) => {
    expect(isLocalDateString(s)).toBe(false);
  });

  it('localDateBoundToUTC throws on a non-local-date string', () => {
    expect(() => localDateBoundToUTC('2026-01-01") || true || ("', 'end')).toThrow();
  });
});

describe('ReadSchema rejects malformed date filters (OMN-332)', () => {
  const parse = (dueDate: unknown) => ReadSchema.safeParse({ query: { type: 'tasks', filters: { dueDate } } });

  it.each([
    { before: '2026-01-01") || true || ("' },
    { after: '2026-03-31T17:00:00Z' },
    { between: ['2026-03-01', 'next week'] },
  ])('rejects %j', (dueDate) => {
    const result = parse(dueDate);
    expect(result.success).toBe(false);
  });

  it('names the accepted formats in the error', () => {
    const result = parse({ before: 'tomorrow' });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain('YYYY-MM-DD');
  });

  it.each([{ before: '2026-03-31' }, { after: '2026-03-31 08:00' }, { between: ['2026-03-01', '2026-03-31'] }])(
    'accepts %j',
    (dueDate) => {
      expect(parse(dueDate).success).toBe(true);
    },
  );
});
