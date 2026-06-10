/**
 * DRIFT TEST: ProjectUpdateData Field Coverage
 *
 * Ensures buildUpdateProjectScript() handles every field in ProjectUpdateData.
 * Adding a field to ProjectUpdateData without updating this test — or the
 * lowering — will cause a failure.
 *
 * OMN-128 slice 4: the builder emits from the mutation AST with build-time
 * conditional lowering, so a field's KEY STRING no longer appears in the script
 * (the legacy builder embedded the whole `changes` object as JSON). The
 * compile-time Record<keyof ProjectUpdateData, unknown> below is the tripwire
 * that forces FIELD_EVIDENCE to grow with the type; the runtime half asserts
 * field-specific emission EVIDENCE on the DECODED OmniJS program. The
 * compile-time exhaustiveness guard in buildUpdateProjectProgram (defs.ts)
 * carries the same intent structurally on the lowering side.
 */
import { describe, it, expect } from 'vitest';
import { buildUpdateProjectScript } from '../../../../src/contracts/ast/mutation-script-builder.js';
import type { ProjectUpdateData } from '../../../../src/contracts/mutations.js';

/**
 * Decode the OmniJS program back out of a wrapInLauncher script (duplicated
 * from mutation-script-builder.test.ts). Throws loudly when the script is not
 * the launcher shape, so a regression to template assembly fails these tests
 * at the extraction step.
 */
function extractOmniJsProgram(script: string): string {
  const marker = 'app.evaluateJavascript(';
  const start = script.indexOf(marker);
  if (start === -1) throw new Error('script is not the JXA launcher shape (no app.evaluateJavascript call)');
  const rest = script.slice(start + marker.length);
  if (!rest.startsWith('"')) throw new Error('evaluateJavascript argument is not a JSON string literal');
  let end = -1;
  for (let i = 1; i < rest.length; i++) {
    if (rest[i] === '\\') {
      i += 1; // skip the escaped character
      continue;
    }
    if (rest[i] === '"') {
      end = i;
      break;
    }
  }
  if (end === -1) throw new Error('unterminated JSON string literal in evaluateJavascript argument');
  return JSON.parse(rest.slice(0, end + 1)) as string;
}

// Explicit list of all ProjectUpdateData fields with fixture values.
// If you add a field to ProjectUpdateData, you MUST add it here AND to
// FIELD_EVIDENCE below (TypeScript errors on both Records until you do).
const PROJECT_UPDATE_FIELDS: Record<keyof ProjectUpdateData, unknown> = {
  name: 'Test Name',
  note: 'Test note',
  folder: 'Test Folder',
  tags: ['tag1'],
  addTags: ['tag2'],
  removeTags: ['tag3'],
  dueDate: '2026-01-01',
  deferDate: '2026-01-01',
  plannedDate: '2026-01-01',
  clearDueDate: true,
  clearDeferDate: true,
  clearPlannedDate: true,
  flagged: true,
  sequential: true,
  status: 'on_hold',
  reviewInterval: 7,
};

// Per-field emission evidence, asserted against the DECODED OmniJS program.
// Date fixtures pass '2026-01-01' to the builder DIRECTLY (no localToUTC), so
// the date evidence is the raw fixture string.
const FIELD_EVIDENCE: Record<keyof ProjectUpdateData, string> = {
  name: 'proj.name = "Test Name";',
  note: 'proj.note = "Test note";',
  folder: 'Folder not found: Test Folder', // resolve+guard evidence
  tags: 'clearTags',
  addTags: '.addTag(',
  removeTags: '.removeTag(',
  dueDate: 'proj.dueDate = new Date("2026-01-01")',
  deferDate: 'proj.deferDate = new Date("2026-01-01")',
  plannedDate: 'proj.plannedDate = new Date("2026-01-01")',
  clearDueDate: 'proj.dueDate = null;',
  clearDeferDate: 'proj.deferDate = null;',
  clearPlannedDate: 'proj.plannedDate = null;',
  flagged: 'proj.flagged = true;',
  sequential: 'proj.sequential = true;',
  // Assignment form, NOT the bare constant: the envelope's read-back ternary names
  // all four Project.Status constants in EVERY program, so the bare constant would be
  // vacuously satisfied. The `=` (vs the ternary's `===`) makes it a real tripwire.
  status: 'proj.status = Project.Status.OnHold',
  reviewInterval: 'reviewInterval',
};

describe('ProjectUpdateData field coverage (drift test)', () => {
  // Type-level check: if ProjectUpdateData gains a field not in our list, TypeScript
  // will error here because the Record<keyof ProjectUpdateData, unknown> won't match.
  it('field list matches ProjectUpdateData interface', () => {
    // This is a compile-time check. If it compiles, the field list is complete.
    const _typeCheck: Record<keyof ProjectUpdateData, unknown> = PROJECT_UPDATE_FIELDS;
    expect(Object.keys(_typeCheck).length).toBeGreaterThan(0);
  });

  // For each field, verify the DECODED program contains field-specific
  // emission evidence (build-time conditional lowering: only-what-changed).
  for (const [field, value] of Object.entries(PROJECT_UPDATE_FIELDS)) {
    it(`buildUpdateProjectScript handles field: ${field}`, async () => {
      const changes = { [field]: value } as ProjectUpdateData;
      const result = await buildUpdateProjectScript('test-project-id', changes);

      const program = extractOmniJsProgram(result.script);
      expect(program).toContain(FIELD_EVIDENCE[field as keyof ProjectUpdateData]);
    });
  }
});
