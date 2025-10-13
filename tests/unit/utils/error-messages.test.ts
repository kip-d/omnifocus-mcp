import { describe, it, expect } from 'vitest';
import {
  entityNotFoundError,
  invalidDateError,
  parsingError,
  formatErrorWithRecovery,
} from '../../../src/utils/error-messages.js';

describe('error-messages helpers', () => {
  it('entityNotFoundError includes list tool suggestion', () => {
    const e = entityNotFoundError('Task', 'abc', 'list_tasks');
    expect(e.message).toContain("'abc'");
    expect(e.recovery?.join(' ')).toContain('list_tasks');
  });

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
    const e = entityNotFoundError('Task', 'test-id', 'tasks');
    const formatted = formatErrorWithRecovery(e);
    expect(formatted).toContain('Task');
    expect(formatted).toContain('test-id');
    expect(formatted).toContain('How to fix:');
  });
});

