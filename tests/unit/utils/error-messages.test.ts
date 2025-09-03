import { describe, it, expect } from 'vitest';
import {
  entityNotFoundError,
  invalidParameterError,
  invalidDateError,
  scriptExecutionError,
  parsingError,
  omniFocusNotRunningError,
  permissionError,
  tagCreationLimitationError,
  parentTaskLimitationError,
  scriptTimeoutError,
  perspectiveError,
  formatErrorWithRecovery,
} from '../../../src/utils/error-messages.js';

describe('error-messages helpers', () => {
  it('entityNotFoundError includes list tool suggestion', () => {
    const e = entityNotFoundError('Task', 'abc', 'list_tasks');
    expect(e.message).toContain("'abc'");
    expect(e.recovery?.join(' ')).toContain('list_tasks');
  });

  it('invalidParameterError provides example and expected format', () => {
    const e = invalidParameterError('dueDate', 'nope', 'YYYY-MM-DD', '2025-01-01');
    expect(e.recovery?.join(' ')).toContain('YYYY-MM-DD');
    expect(e.recovery?.join(' ')).toContain('2025-01-01');
  });

  it('invalidDateError lists relative date guidance', () => {
    const e = invalidDateError('dueDate', 'yesterdayish');
    expect(e.message).toContain('dueDate');
    expect(e.recovery?.join(' ')).toContain('Relative dates');
  });

  it('scriptExecutionError prepends suggestion when provided', () => {
    const e = scriptExecutionError('update task', 'Apple event failed', 'Grant Automation permission');
    const fmt = formatErrorWithRecovery(e);
    expect(fmt).toContain('Grant Automation permission');
    expect(fmt).toContain('How to fix:');
  });

  it('parsingError explains expected vs received', () => {
    const e = parsingError('export', '<html>', 'valid JSON');
    expect(e.recovery?.join(' ')).toContain('valid JSON');
  });

  it('omniFocusNotRunningError has actionable steps', () => {
    const e = omniFocusNotRunningError('update');
    expect(formatErrorWithRecovery(e)).toContain('Open OmniFocus');
  });

  it('permissionError includes Automation path', () => {
    const e = permissionError('create_task');
    expect(e.recovery?.join(' ')).toContain('Automation');
  });

  it('tag creation and parent task limitation errors provide guidance', () => {
    expect(formatErrorWithRecovery(tagCreationLimitationError())).toContain('update_task');
    expect(formatErrorWithRecovery(parentTaskLimitationError())).toContain('parentTaskId');
  });

  it('scriptTimeoutError suggests performance options', () => {
    const e = scriptTimeoutError('query');
    expect(e.recovery?.join(' ')).toContain('skipAnalysis');
  });

  it('perspectiveError handles notFound and access cases', () => {
    const nf = perspectiveError('Foo');
    expect(nf.message).toContain('not found');
    const access = perspectiveError('Foo', false);
    expect(access.message).toContain('Cannot access');
  });
});

