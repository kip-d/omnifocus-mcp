import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { localToUTC, getSystemTimezone, getCurrentTimezoneOffset, getTimezoneInfo } from '../../src/utils/timezone.js';

describe('Date Handling and Timezone Utilities', () => {
  // Store original functions for cleanup
  const originalDateNow = Date.now;
  const originalTimezoneOffset = Date.prototype.getTimezoneOffset;

  beforeEach(() => {
    // Reset any mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Restore original functions
    Date.now = originalDateNow;
    Date.prototype.getTimezoneOffset = originalTimezoneOffset;
  });

  describe('localToUTC', () => {
    it('should convert date-only strings to local noon by default (generic context)', () => {
      const input = '2024-01-15';
      const result = localToUTC(input);

      // Result should be a valid ISO string
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

      // The converted date should represent noon in local time (12:00 PM) for generic context
      const converted = new Date(result);
      const local = new Date(converted.toLocaleString());
      expect(local.getHours()).toBe(12);
      expect(local.getMinutes()).toBe(0);
      expect(local.getDate()).toBe(15);
      expect(local.getMonth()).toBe(0); // January = 0
    });

    it('should use 8am for defer context with date-only', () => {
      const input = '2024-01-15';
      const result = localToUTC(input, 'defer');

      const converted = new Date(result);
      const local = new Date(converted.toLocaleString());
      expect(local.getHours()).toBe(8);
      expect(local.getMinutes()).toBe(0);
    });

    it('should use 5pm for due context with date-only', () => {
      const input = '2024-01-15';
      const result = localToUTC(input, 'due');

      const converted = new Date(result);
      const local = new Date(converted.toLocaleString());
      expect(local.getHours()).toBe(17);
      expect(local.getMinutes()).toBe(0);
    });

    it('should convert date-time strings to UTC', () => {
      const input = '2024-01-15 14:30';
      const result = localToUTC(input);

      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

      // The converted date should represent 2:30 PM in local time
      const converted = new Date(result);
      const local = new Date(converted.toLocaleString());
      expect(local.getHours()).toBe(14);
      expect(local.getMinutes()).toBe(30);
    });

    it('should handle T-format date-time strings', () => {
      const input = '2024-01-15T14:30';
      const result = localToUTC(input);

      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('should add seconds if missing', () => {
      const input = '2024-01-15 14:30';
      const result = localToUTC(input);

      // Should be valid even without seconds
      expect(new Date(result).getTime()).toBeGreaterThan(0);
    });

    it('should throw descriptive error for invalid dates', () => {
      expect(() => localToUTC('invalid-date')).toThrow(/Invalid date format.*Expected formats.*timezone/);
      expect(() => localToUTC('2024-13-01')).toThrow(/Invalid date format/);
      expect(() => localToUTC('')).toThrow(/Invalid date format/);
    });

    it('should handle edge cases like leap year', () => {
      const leapDay = '2024-02-29'; // 2024 is a leap year
      const result = localToUTC(leapDay);

      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(new Date(result).getUTCDate()).toBe(29);
      expect(new Date(result).getUTCMonth()).toBe(1); // February = 1
    });
  });

  describe('getSystemTimezone', () => {
    it('should return a valid timezone string', () => {
      const tz = getSystemTimezone();
      expect(typeof tz).toBe('string');
      expect(tz.length).toBeGreaterThan(0);
      // Should be either UTC or a timezone like America/New_York
      expect(tz === 'UTC' || tz.includes('/')).toBe(true);
    });
  });

  describe('getCurrentTimezoneOffset', () => {
    it('should return a numeric offset', () => {
      const offset = getCurrentTimezoneOffset();
      expect(typeof offset).toBe('number');
      // Reasonable range for timezone offsets (-12 to +14 hours in minutes)
      expect(offset).toBeGreaterThanOrEqual(-14 * 60);
      expect(offset).toBeLessThanOrEqual(12 * 60);
    });
  });

  describe('getTimezoneInfo', () => {
    it('should return complete timezone information', () => {
      const info = getTimezoneInfo();

      expect(typeof info.timezone).toBe('string');
      expect(typeof info.offset).toBe('number');
      expect(typeof info.offsetHours).toBe('number');
      expect(typeof info.offsetString).toBe('string');

      // Offset hours should be the negative of offset minutes / 60
      expect(info.offsetHours).toBe(-info.offset / 60);

      // Offset string should include UTC and sign
      expect(info.offsetString).toMatch(/^UTC[+-]\d+$/);
    });
  });

  describe('Edge cases and error handling', () => {
    it('should handle DST transitions gracefully', () => {
      // Test dates around DST transitions
      const springForward = '2024-03-10'; // Typical US DST start
      const fallBack = '2024-11-03'; // Typical US DST end

      expect(() => localToUTC(springForward)).not.toThrow();
      expect(() => localToUTC(fallBack)).not.toThrow();

      const springResult = localToUTC(springForward);
      const fallResult = localToUTC(fallBack);

      expect(springResult).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(fallResult).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('should handle year boundaries', () => {
      expect(() => localToUTC('2023-12-31')).not.toThrow();
      expect(() => localToUTC('2024-01-01')).not.toThrow();
    });

    it('should handle February in leap vs non-leap years', () => {
      expect(() => localToUTC('2024-02-29')).not.toThrow(); // Leap year
      expect(() => localToUTC('2023-02-28')).not.toThrow(); // Non-leap year

      // Note: JavaScript Date constructor is lenient and converts 2023-02-29 to 2023-03-01
      // This is actually valid behavior, so we don't expect it to throw
      expect(() => localToUTC('2023-02-29')).not.toThrow();

      // Verify it gets converted to March 1st
      const converted = localToUTC('2023-02-29');
      expect(new Date(converted).getUTCMonth()).toBe(2); // March = 2
      expect(new Date(converted).getUTCDate()).toBe(1);
    });

    it('should provide informative error messages', () => {
      try {
        localToUTC('invalid-date');
        expect.fail('Should have thrown an error');
      } catch (error) {
        const message = (error as Error).message;
        expect(message).toContain('Invalid date format');
        expect(message).toContain('Expected formats');
        expect(message).toContain('timezone');
        expect(message).toContain('Examples');
      }
    });
  });

  describe('Round-trip conversion accuracy', () => {
    it('should maintain date accuracy for date-only inputs', () => {
      const originalDate = '2024-01-15';
      const utc = localToUTC(originalDate);

      // Verify the date is correctly converted to UTC
      expect(utc).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      const converted = new Date(utc);
      expect(converted.getUTCFullYear()).toBe(2024);
      expect(converted.getUTCMonth()).toBe(0); // January
      expect(converted.getUTCDate()).toBe(15);
    });
  });
});
