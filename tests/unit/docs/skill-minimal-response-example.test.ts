import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { WriteSchema } from '../../../src/tools/unified/schemas/write-schema.js';

/**
 * OMN-343 (slice 3, F9/D2): the SKILL.md `minimalResponse` example used to show
 * a CREATE ("Also works on update and complete operations" — no longer true
 * now that minimalResponse is update-only). Guards against that drifting back:
 * the line is extracted from the live doc (not re-typed here) and parsed
 * against the real WriteSchema, so a future edit that reintroduces a
 * create/complete example — or a typo that breaks the update one — fails loud.
 */
describe('SKILL.md minimalResponse example (OMN-343 slice 3)', () => {
  const skillPath = join(__dirname, '../../../docs/skills/omnifocus-assistant/SKILL.md');
  const content = readFileSync(skillPath, 'utf-8');

  function extractMutationLiteral(markerComment: string): unknown {
    const lines = content.split('\n');
    const idx = lines.findIndex((l) => l.includes(markerComment));
    expect(idx, `marker comment "${markerComment}" not found in SKILL.md`).toBeGreaterThanOrEqual(0);
    // The example is the next non-empty line, a bare JS object literal
    // starting with `{ mutation: ... }`. Safe to eval here: it's this repo's
    // own doc file, not untrusted input.
    const exampleLine = lines[idx + 1].trim();
    expect(exampleLine.startsWith('{ mutation:')).toBe(true);
    // eslint-disable-next-line no-new-func
    const evaluate = new Function(`return (${exampleLine});`);
    return evaluate();
  }

  it('the documented minimalResponse example validates against WriteSchema', () => {
    const literal = extractMutationLiteral('Reduce response size on mutations');
    const result = WriteSchema.safeParse(literal);
    expect(result.success).toBe(true);
  });

  it('the documented minimalResponse example is an update (not create/complete)', () => {
    const literal = extractMutationLiteral('Reduce response size on mutations') as {
      mutation: { operation: string; minimalResponse?: boolean };
    };
    expect(literal.mutation.operation).toBe('update');
    expect(literal.mutation.minimalResponse).toBe(true);
  });
});
