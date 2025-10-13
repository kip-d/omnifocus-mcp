import { describe, it, expect } from 'vitest';
import {
  invalidDateError,
  parsingError,
  formatErrorWithRecovery,
} from '../../../src/utils/error-messages.js';

describe('error-messages helpers', () => {
  it('invalidDateError lists relative date guidance', () => {
    const e = invalidDateError('dueDate', 'yesterdayish');
    expect(e.message).toContain('dueDate');
    expect(e.recovery?.join(' ')).toContain('Relative dates');
  });

  it('parsingError explains expected vs received', () => {
    const e = parsingError('export', '<html>', 'valid JSON');
    expect(e.recovery?.join(' ')).toContain('valid JSON');
  });

  it('formatErrorWithRecovery formats error with recovery steps', () => {
    const e = invalidDateError('testField', 'bad-value');
    const formatted = formatErrorWithRecovery(e);
    expect(formatted).toContain('testField');
    expect(formatted).toContain('bad-value');
    expect(formatted).toContain('How to fix:');
  });
});

