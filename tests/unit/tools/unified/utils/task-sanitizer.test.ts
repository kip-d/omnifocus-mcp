import { describe, it, expect, vi } from 'vitest';
import { localToUTC } from '../../../../../src/utils/timezone.js';
import { sanitizeTaskUpdates } from '../../../../../src/tools/unified/utils/task-sanitizer.js';

// Mock localToUTC to avoid timezone-dependent tests
vi.mock('../../../../../src/utils/timezone.js', () => ({
  localToUTC: vi.fn((dateStr: string, context: string) => `UTC:${dateStr}:${context}`),
}));

const mockedLocalToUTC = vi.mocked(localToUTC);

// OMN-343 (slice 2) + OMN-362/364/365: sanitizeTaskUpdates no longer coerces
// or filters malformed types — UpdateChangesSchema (the real call path's
// input) already guarantees every field's type, and WriteSchema's superRefine
// already rejects target-mismatched fields and task on_hold before
// `compiled.changes` is built. These tests pin the function's behavior for
// LEGAL, already-typed input (what the builders must keep receiving
// unchanged) plus the date-conversion / clear-flag merging that is still this
// function's job. They do NOT test malformed-input handling (string "true"
// for a boolean, non-numeric estimatedMinutes, non-string tags, …) — those
// inputs can no longer reach this function via the schema-validated call
// path, and the function no longer defends against them (see the file-level
// comment in task-sanitizer.ts).
describe('sanitizeTaskUpdates', () => {
  // --- String fields ---

  it('passes through string name', () => {
    expect(sanitizeTaskUpdates({ name: 'Test' })).toEqual({ name: 'Test' });
  });

  it('passes through string note', () => {
    expect(sanitizeTaskUpdates({ note: 'A note' })).toEqual({ note: 'A note' });
  });

  // --- Boolean fields ---

  it('passes through boolean flagged', () => {
    expect(sanitizeTaskUpdates({ flagged: true })).toEqual({ flagged: true });
  });

  it('passes through boolean sequential', () => {
    expect(sanitizeTaskUpdates({ sequential: false })).toEqual({ sequential: false });
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

  it('allows explicit null plannedDate to clear it', () => {
    expect(sanitizeTaskUpdates({ plannedDate: null })).toEqual({ plannedDate: null });
  });

  it('clear flag takes priority over date value for dueDate', () => {
    expect(sanitizeTaskUpdates({ clearDueDate: true, dueDate: '2026-03-01' })).toEqual({ dueDate: null });
  });

  // OMN-343 (slice 1, flipped for slice 2): the NL-string case this test used
  // to pin ("not-a-date") is now rejected UPSTREAM at the schema boundary —
  // UpdateChangesSchema's DATE_REGEX (write-schema.ts) never lets a
  // non-conforming format reach this function at all, so the real call path
  // no longer hits sanitizeDateField's catch block for that case. The
  // try/catch here stays as defense-in-depth for a narrower residual: a
  // regex-conforming but CALENDAR-invalid date (e.g. "2026-02-30") that
  // `localToUTC`'s `new Date(...)` parsing still rejects. This test exercises
  // that residual path directly (bypassing the schema, as a unit test of
  // this function necessarily does) and pins the still-silent drop — a
  // narrower, documented gap, not the broad one OMN-343 closed.
  it('drops a calendar-invalid date when localToUTC throws (residual defense-in-depth, not a schema-reachable case)', () => {
    mockedLocalToUTC.mockImplementationOnce(() => {
      throw new Error('Invalid date');
    });
    const result = sanitizeTaskUpdates({ dueDate: '2026-02-30' });
    // Should not include dueDate if conversion fails
    expect(result.dueDate).toBeUndefined();
  });

  // --- Numeric fields ---

  it('clearEstimatedMinutes sets estimatedMinutes to null', () => {
    expect(sanitizeTaskUpdates({ clearEstimatedMinutes: true })).toEqual({ estimatedMinutes: null });
  });

  it('passes through numeric estimatedMinutes', () => {
    expect(sanitizeTaskUpdates({ estimatedMinutes: 45 })).toEqual({ estimatedMinutes: 45 });
  });

  it('clearEstimatedMinutes wins over a simultaneous estimatedMinutes value', () => {
    expect(sanitizeTaskUpdates({ clearEstimatedMinutes: true, estimatedMinutes: 45 })).toEqual({
      estimatedMinutes: null,
    });
  });

  // --- Project field ---

  it('passes through project field', () => {
    expect(sanitizeTaskUpdates({ project: 'abc123' })).toEqual({ project: 'abc123' });
  });

  it('passes through null project (move to inbox)', () => {
    expect(sanitizeTaskUpdates({ project: null })).toEqual({ project: null });
  });

  // --- Tags ---

  it('passes through valid tags array', () => {
    expect(sanitizeTaskUpdates({ tags: ['work', 'home'] })).toEqual({ tags: ['work', 'home'] });
  });

  it('passes through addTags array', () => {
    expect(sanitizeTaskUpdates({ addTags: ['valid'] })).toEqual({ addTags: ['valid'] });
  });

  it('passes through removeTags array', () => {
    expect(sanitizeTaskUpdates({ removeTags: ['valid'] })).toEqual({ removeTags: ['valid'] });
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

  // OMN-377: 'active' reopens a dropped or completed task.
  it('passes through active status (reopen)', () => {
    expect(sanitizeTaskUpdates({ status: 'active' })).toEqual({ status: 'active' });
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
