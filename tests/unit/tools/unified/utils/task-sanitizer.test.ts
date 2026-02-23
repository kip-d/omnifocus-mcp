import { describe, it, expect, vi } from 'vitest';
import { localToUTC } from '../../../../../src/utils/timezone.js';
import { sanitizeTaskUpdates } from '../../../../../src/tools/unified/utils/task-sanitizer.js';

// Mock localToUTC to avoid timezone-dependent tests
vi.mock('../../../../../src/utils/timezone.js', () => ({
  localToUTC: vi.fn((dateStr: string, context: string) => `UTC:${dateStr}:${context}`),
}));

const mockedLocalToUTC = vi.mocked(localToUTC);

describe('sanitizeTaskUpdates', () => {
  // --- String fields ---

  it('passes through string name', () => {
    expect(sanitizeTaskUpdates({ name: 'Test' })).toEqual({ name: 'Test' });
  });

  it('passes through string note', () => {
    expect(sanitizeTaskUpdates({ note: 'A note' })).toEqual({ note: 'A note' });
  });

  it('ignores non-string name', () => {
    expect(sanitizeTaskUpdates({ name: 123 })).toEqual({});
  });

  it('ignores non-string note', () => {
    expect(sanitizeTaskUpdates({ note: true })).toEqual({});
  });

  // --- Boolean fields (with MCP bridge coercion) ---

  it('passes through boolean flagged', () => {
    expect(sanitizeTaskUpdates({ flagged: true })).toEqual({ flagged: true });
  });

  it('coerces string "true" flagged to boolean true', () => {
    expect(sanitizeTaskUpdates({ flagged: 'true' })).toEqual({ flagged: true });
  });

  it('coerces string "false" flagged to boolean false', () => {
    expect(sanitizeTaskUpdates({ flagged: 'false' })).toEqual({ flagged: false });
  });

  it('passes through boolean sequential', () => {
    expect(sanitizeTaskUpdates({ sequential: false })).toEqual({ sequential: false });
  });

  it('coerces string sequential to boolean', () => {
    expect(sanitizeTaskUpdates({ sequential: 'true' })).toEqual({ sequential: true });
  });

  // --- Date fields with clear flags ---

  it('clearDueDate sets dueDate to null', () => {
    expect(sanitizeTaskUpdates({ clearDueDate: true })).toEqual({ dueDate: null });
  });

  it('clearDeferDate sets deferDate to null', () => {
    expect(sanitizeTaskUpdates({ clearDeferDate: true })).toEqual({ deferDate: null });
  });

  it('clearPlannedDate sets plannedDate to null', () => {
    expect(sanitizeTaskUpdates({ clearPlannedDate: true })).toEqual({ plannedDate: null });
  });

  it('converts dueDate string via localToUTC with "due" context', () => {
    const result = sanitizeTaskUpdates({ dueDate: '2026-03-01' });
    expect(result.dueDate).toBe('UTC:2026-03-01:due');
  });

  it('converts deferDate string via localToUTC with "defer" context', () => {
    const result = sanitizeTaskUpdates({ deferDate: '2026-03-01' });
    expect(result.deferDate).toBe('UTC:2026-03-01:defer');
  });

  it('converts plannedDate string via localToUTC with "planned" context', () => {
    const result = sanitizeTaskUpdates({ plannedDate: '2026-03-01' });
    expect(result.plannedDate).toBe('UTC:2026-03-01:planned');
  });

  it('converts completionDate string via localToUTC with "completion" context', () => {
    const result = sanitizeTaskUpdates({ completionDate: '2026-03-01' });
    expect(result.completionDate).toBe('UTC:2026-03-01:completion');
  });

  it('allows explicit null plannedDate to clear it', () => {
    expect(sanitizeTaskUpdates({ plannedDate: null })).toEqual({ plannedDate: null });
  });

  it('clear flag takes priority over date value for dueDate', () => {
    expect(sanitizeTaskUpdates({ clearDueDate: true, dueDate: '2026-03-01' })).toEqual({ dueDate: null });
  });

  it('ignores non-string dueDate', () => {
    const result = sanitizeTaskUpdates({ dueDate: 12345 });
    expect(result).toEqual({});
  });

  it('handles localToUTC throwing for invalid date', () => {
    mockedLocalToUTC.mockImplementationOnce(() => {
      throw new Error('Invalid date');
    });
    const result = sanitizeTaskUpdates({ dueDate: 'not-a-date' });
    // Should not include dueDate if conversion fails
    expect(result.dueDate).toBeUndefined();
  });

  // --- Numeric fields ---

  it('clearEstimatedMinutes sets estimatedMinutes to null', () => {
    expect(sanitizeTaskUpdates({ clearEstimatedMinutes: true })).toEqual({ estimatedMinutes: null });
  });

  it('coerces string estimatedMinutes to number', () => {
    expect(sanitizeTaskUpdates({ estimatedMinutes: '30' })).toEqual({ estimatedMinutes: 30 });
  });

  it('passes through numeric estimatedMinutes', () => {
    expect(sanitizeTaskUpdates({ estimatedMinutes: 45 })).toEqual({ estimatedMinutes: 45 });
  });

  it('ignores non-numeric string estimatedMinutes', () => {
    const result = sanitizeTaskUpdates({ estimatedMinutes: 'abc' });
    expect(result.estimatedMinutes).toBeUndefined();
  });

  // --- Project field mapping ---

  it('maps projectId to project', () => {
    expect(sanitizeTaskUpdates({ projectId: 'abc123' })).toEqual({ project: 'abc123' });
  });

  it('maps project field through', () => {
    expect(sanitizeTaskUpdates({ project: 'abc123' })).toEqual({ project: 'abc123' });
  });

  it('prefers projectId over project when both present', () => {
    expect(sanitizeTaskUpdates({ projectId: 'from-id', project: 'from-project' })).toEqual({ project: 'from-id' });
  });

  it('passes through null project (move to inbox)', () => {
    expect(sanitizeTaskUpdates({ project: null })).toEqual({ project: null });
  });

  // --- Tags ---

  it('filters non-string tags', () => {
    expect(sanitizeTaskUpdates({ tags: ['valid', 123, null] })).toEqual({ tags: ['valid'] });
  });

  it('passes through valid tags array', () => {
    expect(sanitizeTaskUpdates({ tags: ['work', 'home'] })).toEqual({ tags: ['work', 'home'] });
  });

  it('filters non-string addTags', () => {
    expect(sanitizeTaskUpdates({ addTags: ['valid', 123] })).toEqual({ addTags: ['valid'] });
  });

  it('filters non-string removeTags', () => {
    expect(sanitizeTaskUpdates({ removeTags: ['valid', null] })).toEqual({ removeTags: ['valid'] });
  });

  // --- parentTaskId ---

  it('passes through parentTaskId', () => {
    expect(sanitizeTaskUpdates({ parentTaskId: 'parent123' })).toEqual({ parentTaskId: 'parent123' });
  });

  it('passes through null parentTaskId', () => {
    expect(sanitizeTaskUpdates({ parentTaskId: null })).toEqual({ parentTaskId: null });
  });

  // --- Repeat rules ---

  it('passes through repetitionRule object', () => {
    const rule = { frequency: 'weekly', interval: 1 };
    expect(sanitizeTaskUpdates({ repetitionRule: rule })).toEqual({ repetitionRule: rule });
  });

  it('ignores non-object repetitionRule', () => {
    expect(sanitizeTaskUpdates({ repetitionRule: 'weekly' })).toEqual({});
  });

  it('passes through repetitionRule: null to clear rule', () => {
    expect(sanitizeTaskUpdates({ repetitionRule: null })).toEqual({ repetitionRule: null });
  });

  // --- Status ---

  it('passes through completed status', () => {
    expect(sanitizeTaskUpdates({ status: 'completed' })).toEqual({ status: 'completed' });
  });

  it('passes through dropped status', () => {
    expect(sanitizeTaskUpdates({ status: 'dropped' })).toEqual({ status: 'dropped' });
  });

  it('ignores invalid status values', () => {
    expect(sanitizeTaskUpdates({ status: 'active' })).toEqual({});
  });

  // --- Edge cases ---

  it('returns empty object for no valid updates', () => {
    expect(sanitizeTaskUpdates({})).toEqual({});
  });

  it('returns empty object for undefined-only values', () => {
    expect(sanitizeTaskUpdates({ name: undefined, flagged: undefined })).toEqual({});
  });

  it('handles multiple fields simultaneously', () => {
    const result = sanitizeTaskUpdates({
      name: 'Task',
      flagged: true,
      dueDate: '2026-03-01',
      tags: ['work'],
      estimatedMinutes: 30,
    });
    expect(result).toEqual({
      name: 'Task',
      flagged: true,
      dueDate: 'UTC:2026-03-01:due',
      tags: ['work'],
      estimatedMinutes: 30,
    });
  });
});
