import { describe, it, expect, expectTypeOf } from 'vitest';
import {
  CREATE_TASK_ONLY_FIELDS,
  CREATE_PROJECT_ONLY_FIELDS,
  UPDATE_TASK_ONLY_FIELDS,
  UPDATE_PROJECT_ONLY_FIELDS,
  CreateDataSchema,
  UpdateChangesSchema,
} from '../../../../../src/tools/unified/schemas/write-schema.js';
import type {
  TaskCreateData,
  ProjectCreateData,
  TaskUpdateData,
  ProjectUpdateData,
} from '../../../../../src/contracts/mutations.js';

/**
 * OMN-343 (slice 2, gate finding A): write-schema.ts's CREATE_TASK_ONLY_FIELDS
 * / CREATE_PROJECT_ONLY_FIELDS / UPDATE_TASK_ONLY_FIELDS /
 * UPDATE_PROJECT_ONLY_FIELDS tables were hand-copied off the `_exhaustive:
 * Record<keyof T, true>` guards in src/contracts/ast/mutation/defs.ts
 * (ground truth for TaskCreateData/ProjectCreateData/TaskUpdateData/
 * ProjectUpdateData) with nothing keeping them in sync. A new task-only
 * field added to TaskCreateData forces defs.ts's exhaustiveness guard to
 * update (compile error there), but write-schema.ts's table is a plain
 * array literal — nothing forces it to grow, so the new field would
 * validate for projects too and be silently dropped by the project
 * builder, which doesn't read it. That's the exact defect class OMN-343
 * closes for every other field; this test closes it for the tables
 * themselves.
 *
 * `expectTypeOf(...).toEqualTypeOf(...)` is a COMPILE-TIME assertion: a
 * mismatch fails `npm run typecheck:test`, not `npm run test:unit` (the
 * `it(...)` bodies below are reached and pass trivially at runtime — the
 * real check happens when `tsc -p tsconfig.test.json` type-checks this
 * file). This is deliberate: it SURFACES a tuple being stale at the layer
 * every contributor runs before declaring work complete (CLAUDE.md's
 * pre-completion checklist runs typecheck:test), not only when someone
 * thinks to run this specific test.
 *
 * Deliberate exceptions (fields whose schema name differs from the
 * contract name, or contract-only fields that are not client inputs) go in
 * the four `*Ignored` types below, named and justified individually. All
 * four are `never` today: every tuple element matches the contract
 * set-difference exactly, with no renames or internal-only fields on
 * either side. Keep them minimal — a new entry here silences the guard
 * instead of fixing the tuple.
 */
type CreateTaskOnlyIgnored = never;
type CreateProjectOnlyIgnored = never;
type UpdateTaskOnlyIgnored = never;
type UpdateProjectOnlyIgnored = never;

describe('target-mismatch field tables ↔ contract types (compile-time sync guard)', () => {
  it('CREATE_TASK_ONLY_FIELDS equals keyof TaskCreateData - keyof ProjectCreateData', () => {
    expectTypeOf<(typeof CREATE_TASK_ONLY_FIELDS)[number]>().toEqualTypeOf<
      Exclude<keyof TaskCreateData, keyof ProjectCreateData | CreateTaskOnlyIgnored>
    >();
    expect(true).toBe(true); // this test's teeth are the type assertion above, checked by typecheck:test
  });

  it('CREATE_PROJECT_ONLY_FIELDS equals keyof ProjectCreateData - keyof TaskCreateData', () => {
    expectTypeOf<(typeof CREATE_PROJECT_ONLY_FIELDS)[number]>().toEqualTypeOf<
      Exclude<keyof ProjectCreateData, keyof TaskCreateData | CreateProjectOnlyIgnored>
    >();
    expect(true).toBe(true);
  });

  it('UPDATE_TASK_ONLY_FIELDS equals keyof TaskUpdateData - keyof ProjectUpdateData', () => {
    expectTypeOf<(typeof UPDATE_TASK_ONLY_FIELDS)[number]>().toEqualTypeOf<
      Exclude<keyof TaskUpdateData, keyof ProjectUpdateData | UpdateTaskOnlyIgnored>
    >();
    expect(true).toBe(true);
  });

  it('UPDATE_PROJECT_ONLY_FIELDS equals keyof ProjectUpdateData - keyof TaskUpdateData', () => {
    expectTypeOf<(typeof UPDATE_PROJECT_ONLY_FIELDS)[number]>().toEqualTypeOf<
      Exclude<keyof ProjectUpdateData, keyof TaskUpdateData | UpdateProjectOnlyIgnored>
    >();
    expect(true).toBe(true);
  });

  // Runtime companion checks: a typo in a tuple (e.g. 'estimatedMinute')
  // would still be a VALID string literal type-wise if it happened to
  // collide with nothing, and couldn't be caught by the type assertions
  // above in every malformed shape (e.g. a duplicate entry doesn't change
  // the union). These catch that class directly.
  const tables: Array<{
    name: string;
    fields: readonly string[];
    schema: typeof CreateDataSchema | typeof UpdateChangesSchema;
  }> = [
    { name: 'CREATE_TASK_ONLY_FIELDS', fields: CREATE_TASK_ONLY_FIELDS, schema: CreateDataSchema },
    { name: 'CREATE_PROJECT_ONLY_FIELDS', fields: CREATE_PROJECT_ONLY_FIELDS, schema: CreateDataSchema },
    { name: 'UPDATE_TASK_ONLY_FIELDS', fields: UPDATE_TASK_ONLY_FIELDS, schema: UpdateChangesSchema },
    { name: 'UPDATE_PROJECT_ONLY_FIELDS', fields: UPDATE_PROJECT_ONLY_FIELDS, schema: UpdateChangesSchema },
  ];

  for (const { name, fields, schema } of tables) {
    it(`${name} has no duplicate entries`, () => {
      expect(new Set(fields).size).toBe(fields.length);
    });

    it(`${name}'s fields all exist on the corresponding Zod schema shape`, () => {
      const shapeKeys = Object.keys(schema.shape);
      for (const field of fields) {
        expect(shapeKeys, `"${field}" (from ${name}) is not a key of the schema shape`).toContain(field);
      }
    });
  }
});
