import { describe, it, expect } from 'vitest';
import {
  normalizeRepeatMethod,
  normalizeRepeatRuleInput,
  convertToRepetitionRule,
} from '../../../../../src/tools/unified/utils/repeat-rule-normalizer.js';

describe('normalizeRepeatMethod', () => {
  it('returns "fixed" for non-string input', () => {
    expect(normalizeRepeatMethod(123)).toBe('fixed');
    expect(normalizeRepeatMethod(null)).toBe('fixed');
    expect(normalizeRepeatMethod(undefined)).toBe('fixed');
  });

  it('returns "fixed" for "fixed" input', () => {
    expect(normalizeRepeatMethod('fixed')).toBe('fixed');
  });

  it('returns "start-after-completion" for exact match', () => {
    expect(normalizeRepeatMethod('start-after-completion')).toBe('start-after-completion');
  });

  it('returns "due-after-completion" for exact match', () => {
    expect(normalizeRepeatMethod('due-after-completion')).toBe('due-after-completion');
  });

  it('returns "due-after-completion" for "after-completion" alias', () => {
    expect(normalizeRepeatMethod('after-completion')).toBe('due-after-completion');
  });

  it('returns "none" for "none"', () => {
    expect(normalizeRepeatMethod('none')).toBe('none');
  });

  it('is case-insensitive', () => {
    expect(normalizeRepeatMethod('FIXED')).toBe('fixed');
    expect(normalizeRepeatMethod('None')).toBe('none');
  });

  it('trims whitespace', () => {
    expect(normalizeRepeatMethod('  fixed  ')).toBe('fixed');
  });

  it('defaults unknown strings to "fixed"', () => {
    expect(normalizeRepeatMethod('bogus')).toBe('fixed');
  });
});

describe('normalizeRepeatRuleInput', () => {
  it('returns undefined for null input', () => {
    expect(normalizeRepeatRuleInput(null)).toBeUndefined();
  });

  it('returns undefined for undefined input', () => {
    expect(normalizeRepeatRuleInput(undefined)).toBeUndefined();
  });

  it('returns undefined for non-object input', () => {
    expect(normalizeRepeatRuleInput('weekly')).toBeUndefined();
    expect(normalizeRepeatRuleInput(42)).toBeUndefined();
  });

  it('returns undefined when unit is not a string', () => {
    expect(normalizeRepeatRuleInput({ unit: 123 })).toBeUndefined();
    expect(normalizeRepeatRuleInput({})).toBeUndefined();
  });

  it('normalizes a valid repeat rule', () => {
    const result = normalizeRepeatRuleInput({ unit: 'week', steps: 2, method: 'fixed' });
    expect(result).toEqual({ unit: 'week', steps: 2, method: 'fixed' });
  });

  it('defaults steps to 1 when missing', () => {
    const result = normalizeRepeatRuleInput({ unit: 'day' });
    expect(result?.steps).toBe(1);
  });

  it('defaults steps to 1 for non-numeric input', () => {
    const result = normalizeRepeatRuleInput({ unit: 'day', steps: 'abc' });
    expect(result?.steps).toBe(1);
  });

  it('coerces string steps to number', () => {
    const result = normalizeRepeatRuleInput({ unit: 'day', steps: '3' });
    expect(result?.steps).toBe(3);
  });

  it('passes through numeric steps=0 (no floor applied to number type)', () => {
    // String path floors to 1, but number path passes through directly.
    // This matches ManageTaskTool behavior.
    const result = normalizeRepeatRuleInput({ unit: 'day', steps: 0 });
    expect(result?.steps).toBe(0);
  });

  it('normalizes method via normalizeRepeatMethod', () => {
    const result = normalizeRepeatRuleInput({ unit: 'day', method: 'after-completion' });
    expect(result?.method).toBe('due-after-completion');
  });

  it('defaults method to "fixed" when missing', () => {
    const result = normalizeRepeatRuleInput({ unit: 'day' });
    expect(result?.method).toBe('fixed');
  });

  it('passes through weekdays array', () => {
    const result = normalizeRepeatRuleInput({ unit: 'week', weekdays: ['monday', 'wednesday'] });
    expect(result?.weekdays).toEqual(['monday', 'wednesday']);
  });

  it('passes through weekPosition', () => {
    const result = normalizeRepeatRuleInput({ unit: 'month', weekPosition: 'first' });
    expect(result?.weekPosition).toBe('first');
  });

  it('passes through weekday string', () => {
    const result = normalizeRepeatRuleInput({ unit: 'month', weekday: 'friday' });
    expect(result?.weekday).toBe('friday');
  });

  it('passes through deferAnother with valid structure', () => {
    const result = normalizeRepeatRuleInput({
      unit: 'week',
      deferAnother: { unit: 'day', steps: 3 },
    });
    expect(result?.deferAnother).toEqual({ unit: 'day', steps: 3 });
  });

  it('coerces deferAnother string steps to number', () => {
    const result = normalizeRepeatRuleInput({
      unit: 'week',
      deferAnother: { unit: 'day', steps: '5' },
    });
    expect(result?.deferAnother).toEqual({ unit: 'day', steps: 5 });
  });

  it('ignores deferAnother with invalid unit', () => {
    const result = normalizeRepeatRuleInput({
      unit: 'week',
      deferAnother: { unit: 123, steps: 3 },
    });
    expect(result?.deferAnother).toBeUndefined();
  });

  it('ignores deferAnother with invalid steps', () => {
    const result = normalizeRepeatRuleInput({
      unit: 'week',
      deferAnother: { unit: 'day', steps: 'abc' },
    });
    expect(result?.deferAnother).toBeUndefined();
  });
});

describe('convertToRepetitionRule', () => {
  it('returns undefined for null/undefined input', () => {
    expect(convertToRepetitionRule(null)).toBeUndefined();
    expect(convertToRepetitionRule(undefined)).toBeUndefined();
  });

  it('converts day unit to daily frequency', () => {
    const result = convertToRepetitionRule({ unit: 'day', steps: 1, method: 'fixed' });
    expect(result?.frequency).toBe('daily');
    expect(result?.interval).toBe(1);
  });

  it('converts week unit to weekly frequency', () => {
    const result = convertToRepetitionRule({ unit: 'week', steps: 2, method: 'fixed' });
    expect(result?.frequency).toBe('weekly');
    expect(result?.interval).toBe(2);
  });

  it('converts month unit to monthly frequency', () => {
    const result = convertToRepetitionRule({ unit: 'month', steps: 1, method: 'fixed' });
    expect(result?.frequency).toBe('monthly');
  });

  it('converts year unit to yearly frequency', () => {
    const result = convertToRepetitionRule({ unit: 'year', steps: 1, method: 'fixed' });
    expect(result?.frequency).toBe('yearly');
  });

  it('converts minute unit to minutely frequency', () => {
    const result = convertToRepetitionRule({ unit: 'minute', steps: 30, method: 'fixed' });
    expect(result?.frequency).toBe('minutely');
    expect(result?.interval).toBe(30);
  });

  it('converts hour unit to hourly frequency', () => {
    const result = convertToRepetitionRule({ unit: 'hour', steps: 4, method: 'fixed' });
    expect(result?.frequency).toBe('hourly');
    expect(result?.interval).toBe(4);
  });

  it('defaults to daily for unknown unit', () => {
    const result = convertToRepetitionRule({ unit: 'bogus' as never, steps: 1, method: 'fixed' });
    expect(result?.frequency).toBe('daily');
    expect(result?.interval).toBe(1);
  });

  it('maps fixed method correctly', () => {
    const result = convertToRepetitionRule({ unit: 'day', steps: 1, method: 'fixed' });
    expect(result?.method).toBe('fixed');
    expect(result?.scheduleType).toBe('regularly');
    expect(result?.anchorDateKey).toBe('due-date');
  });

  it('maps start-after-completion to defer-after-completion', () => {
    const result = convertToRepetitionRule({ unit: 'day', steps: 1, method: 'start-after-completion' });
    expect(result?.method).toBe('defer-after-completion');
    expect(result?.scheduleType).toBe('from-completion');
    expect(result?.anchorDateKey).toBe('defer-date');
  });

  it('maps due-after-completion correctly', () => {
    const result = convertToRepetitionRule({ unit: 'day', steps: 1, method: 'due-after-completion' });
    expect(result?.method).toBe('due-after-completion');
    expect(result?.scheduleType).toBe('from-completion');
    expect(result?.anchorDateKey).toBe('due-date');
  });

  it('maps none method correctly', () => {
    const result = convertToRepetitionRule({ unit: 'day', steps: 1, method: 'none' });
    expect(result?.method).toBe('none');
    expect(result?.scheduleType).toBe('regularly');
  });

  it('defaults method to fixed when not provided', () => {
    const result = convertToRepetitionRule({ unit: 'day', steps: 1, method: '' });
    expect(result?.method).toBe('fixed');
  });

  it('defaults steps to 1 when falsy', () => {
    const result = convertToRepetitionRule({ unit: 'day', steps: 0, method: 'fixed' });
    expect(result?.interval).toBe(1);
  });

  it('sets catchUpAutomatically to true by default', () => {
    const result = convertToRepetitionRule({ unit: 'day', steps: 1, method: 'fixed' });
    expect(result?.catchUpAutomatically).toBe(true);
  });
});
