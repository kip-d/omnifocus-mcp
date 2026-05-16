/**
 * Unit tests for the assertFieldPersisted integration helper (OMN-41).
 *
 * The helper's job: after a mutation, read the entity back and prove a field
 * actually persisted — catching the silent-no-op class of OmniJS setter bugs
 * (e.g. set-review-schedule.ts assigning a plain object OmniFocus rejects).
 *
 * These tests exercise the helper's own logic with a fake client (the
 * dependency-injected callTool seam) — no live OmniFocus required.
 */
import { describe, it, expect } from 'vitest';
import { assertFieldPersisted } from '../../../tests/integration/helpers/assert-field-persisted.js';

type FakeResult = { success: boolean; error?: unknown; data?: unknown };

function fakeClient(result: FakeResult) {
  const calls: Array<{ tool: string; params: unknown }> = [];
  return {
    calls,
    callTool: (tool: string, params: unknown) => {
      calls.push({ tool, params });
      return Promise.resolve(result);
    },
  };
}

describe('assertFieldPersisted', () => {
  it('resolves when the extracted field deep-equals the expected value', async () => {
    const client = fakeClient({
      success: true,
      data: { project: { reviewInterval: { unit: 'weeks', steps: 2 } } },
    });

    await expect(
      assertFieldPersisted(client, {
        readTool: 'omnifocus_read',
        readParams: { query: { type: 'projects' } },
        extract: (r) => (r.data as { project: { reviewInterval: unknown } }).project.reviewInterval,
        expected: { unit: 'weeks', steps: 2 },
        context: 'reviewInterval round-trip',
      }),
    ).resolves.toBeUndefined();
  });

  it('throws a diagnostic error naming context, expected, and actual when the field did not persist', async () => {
    const client = fakeClient({
      success: true,
      data: { project: { reviewInterval: null } },
    });

    await expect(
      assertFieldPersisted(client, {
        readTool: 'omnifocus_read',
        readParams: { query: { type: 'projects' } },
        extract: (r) => (r.data as { project: { reviewInterval: unknown } }).project.reviewInterval,
        expected: { unit: 'weeks', steps: 2 },
        context: 'reviewInterval round-trip',
      }),
    ).rejects.toThrow(
      /reviewInterval round-trip[\s\S]*expected[\s\S]*weeks[\s\S]*steps[\s\S]*(actual|got)[\s\S]*null/i,
    );
  });

  it('throws and surfaces the read error when the read-back call itself fails', async () => {
    const client = fakeClient({
      success: false,
      error: 'Project not found: abc123',
    });

    await expect(
      assertFieldPersisted(client, {
        readTool: 'omnifocus_read',
        readParams: { query: { type: 'projects' } },
        extract: (r) => (r.data as { project: { reviewInterval: unknown } }).project.reviewInterval,
        expected: { unit: 'weeks', steps: 2 },
        context: 'reviewInterval round-trip',
      }),
    ).rejects.toThrow(/read-back failed[\s\S]*Project not found: abc123/i);
  });
});
