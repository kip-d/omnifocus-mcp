/**
 * assertFieldPersisted — prove a mutated field actually survived the round-trip.
 *
 * OmniJS has a whole class of silent-no-op setter bugs: assigning a plain
 * object / Number / freshly-constructed instance to a strictly-typed property
 * (e.g. `project.reviewInterval = { unit, steps }`) is rejected, the mutation
 * tool still reports success, and the value never persists. `expectOk` only
 * proves the call returned success — it cannot catch a setter that lied.
 *
 * This helper closes that gap: after a mutation, it re-reads the entity and
 * asserts the field holds the expected value, with a diagnostic-rich failure
 * message when it does not. It is generic (caller supplies the read call and
 * an extractor) so it covers the whole silent-setter class, not just
 * reviewInterval.
 *
 * See OMN-41 / OMN-58.
 *
 * Usage:
 *   import { assertFieldPersisted } from '../helpers/assert-field-persisted.js';
 *
 *   await client.callTool('omnifocus_analyze', { ...set_schedule... });
 *   await assertFieldPersisted(client, {
 *     readTool: 'omnifocus_read',
 *     readParams: { query: { type: 'projects', filters: { id: projectId } } },
 *     extract: (r) => r.data.items[0].reviewInterval,
 *     expected: { unit: 'weeks', steps: 2 },
 *     context: 'set_schedule reviewInterval',
 *   });
 */

export interface ClientLike {
  callTool(toolName: string, params?: unknown): Promise<unknown>;
}

export interface AssertFieldPersistedSpec {
  /** Tool to call for the read-back (e.g. 'omnifocus_read'). */
  readTool: string;
  /** Params for the read-back call. */
  readParams: unknown;
  /** Pull the field under test out of the raw read result. */
  extract: (readResult: any) => unknown;
  /** Value the field is expected to hold after the mutation. */
  expected: unknown;
  /** Short label for the failure message (what was being asserted). */
  context?: string;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') {
    return false;
  }
  const ak = Object.keys(a as Record<string, unknown>);
  const bk = Object.keys(b as Record<string, unknown>);
  if (ak.length !== bk.length) return false;
  return ak.every(
    (k) =>
      Object.prototype.hasOwnProperty.call(b, k) &&
      deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]),
  );
}

function show(value: unknown): string {
  if (value === undefined) return 'undefined';
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export async function assertFieldPersisted(client: ClientLike, spec: AssertFieldPersistedSpec): Promise<void> {
  const label = spec.context ? `assertFieldPersisted(${spec.context})` : 'assertFieldPersisted';

  const result = (await client.callTool(spec.readTool, spec.readParams)) as
    | { success?: boolean; error?: unknown }
    | undefined;

  if (!result || result.success === false) {
    const errText = show(result?.error ?? result);
    throw new Error(`${label}: read-back failed — ${errText}`);
  }

  const actual = spec.extract(result);
  if (deepEqual(actual, spec.expected)) {
    return;
  }

  throw new Error(`${label}: field did not persist — expected ${show(spec.expected)}, actual ${show(actual)}`);
}
