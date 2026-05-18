// tests/unit/diagnostics/schema-drift-tools.test.ts
import { describe, it, expect } from 'vitest';
import { TOOL_SCHEMA_REGISTRY } from '../../../src/diagnostics/tool-schema-registry.js';
import { canonicalizeInputSchema, canonicalizeZodSchema, diffSchemas } from '../../../src/diagnostics/schema-drift.js';

describe('inputSchema <-> Zod drift gate (fails CI on drift)', () => {
  for (const entry of TOOL_SCHEMA_REGISTRY) {
    it(`${entry.name}: advertised schema matches Zod validation`, () => {
      const findings = diffSchemas(
        canonicalizeInputSchema(entry.getInputSchema(), entry.wrapperKey),
        canonicalizeZodSchema(entry.zodSchema, entry.wrapperKey),
      );
      // Some advertised-vs-validated asymmetry is intentional (compact advertised schema).
      // The gate fails ONLY on the high-signal kinds: enum/required/coercion drift.
      const blocking = findings.filter((f) => f.kind !== 'FIELD_MISSING');
      expect(blocking, `${entry.name} drift: ${JSON.stringify(findings, null, 2)}`).toEqual([]);
    });
  }
});
