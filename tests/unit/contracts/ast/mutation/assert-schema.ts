// tests/unit/contracts/ast/mutation/assert-schema.ts
// OMN-158 Task 4: shared helper for schema↔emission tie-in asserts.
// Usage: expectMatchesSchema(SomeSchema, parsed) — surfaces real Zod issues on failure.
import { expect } from 'vitest';
import type { ZodTypeAny } from 'zod';

export function expectMatchesSchema(schema: ZodTypeAny, value: unknown): void {
  const sp = schema.safeParse(value);
  expect(sp.error?.issues ?? []).toEqual([]);
  expect(sp.success).toBe(true);
}
