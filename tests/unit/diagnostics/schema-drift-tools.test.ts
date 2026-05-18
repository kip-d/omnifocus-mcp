// tests/unit/diagnostics/schema-drift-tools.test.ts
import { describe, it, expect } from 'vitest';
import { TOOL_SCHEMA_REGISTRY } from '../../../src/diagnostics/tool-schema-registry.js';
import { canonicalizeInputSchema, canonicalizeZodSchema, diffSchemas } from '../../../src/diagnostics/schema-drift.js';

// Non-vacuity floor (verified against commit 2ce9255). The gate's blocking-findings
// assertion is satisfied trivially if BOTH canonicalizers collapse to {} — e.g. a Zod
// major upgrade renaming `_def.typeName` so `unwrap`/`membersOf` return [] →
// `mergeShapes` → {} → `diffSchemas({}, {})` → []. These exact lower bounds make that
// silent shrink a HARD FAIL (the OMN-65 vacuous-green lesson, applied to the gate itself).
const EXPECTED_MIN_FIELDS: Record<string, number> = {
  system: 4,
  omnifocus_read: 17,
  omnifocus_write: 19,
  omnifocus_analyze: 3,
};

describe('inputSchema <-> Zod drift gate (fails CI on drift)', () => {
  for (const entry of TOOL_SCHEMA_REGISTRY) {
    it(`${entry.name}: advertised schema matches Zod validation`, () => {
      const advertised = canonicalizeInputSchema(entry.getInputSchema(), entry.wrapperKey);
      const zod = canonicalizeZodSchema(entry.zodSchema, entry.wrapperKey);

      // Non-vacuity guard FIRST: both sides must canonicalize to a sane field count.
      // If this fires, the blocking-findings check below is meaningless — fix the
      // canonicalizer (likely `_def` internals; see schema-drift.ts breadcrumb) before
      // trusting a green gate.
      const expectedMin = EXPECTED_MIN_FIELDS[entry.name];
      expect(
        Object.keys(zod).length,
        `${entry.name}: Zod canonicalization collapsed — _def internals may have changed`,
      ).toBeGreaterThanOrEqual(expectedMin);
      expect(
        Object.keys(advertised).length,
        `${entry.name}: advertised canonicalization collapsed — inputSchema shape may have changed`,
      ).toBeGreaterThanOrEqual(expectedMin);

      const findings = diffSchemas(advertised, zod);
      // Some advertised-vs-validated asymmetry is intentional (compact advertised schema).
      // The gate fails ONLY on the high-signal kinds: enum/required/coercion drift.
      const blocking = findings.filter((f) => f.kind !== 'FIELD_MISSING');
      expect(blocking, `${entry.name} drift: ${JSON.stringify(findings, null, 2)}`).toEqual([]);
    });
  }
});
