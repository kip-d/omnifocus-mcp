/**
 * DRIFT TEST: ProjectUpdateData Field Coverage
 *
 * Ensures buildUpdateProjectScript() handles every field in ProjectUpdateData.
 * Adding a field to ProjectUpdateData without updating this test — or the script
 * builder — will cause a failure.
 */
import { describe, it, expect } from 'vitest';
import { buildUpdateProjectScript } from '../../../../src/contracts/ast/mutation-script-builder.js';
import type { ProjectUpdateData } from '../../../../src/contracts/mutations.js';

// Explicit list of all ProjectUpdateData fields.
// If you add a field to ProjectUpdateData, you MUST add it here AND verify
// the script builder handles it.
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

describe('ProjectUpdateData field coverage (drift test)', () => {
  // Type-level check: if ProjectUpdateData gains a field not in our list, TypeScript
  // will error here because the Record<keyof ProjectUpdateData, unknown> won't match.
  it('field list matches ProjectUpdateData interface', () => {
    // This is a compile-time check. If it compiles, the field list is complete.
    const _typeCheck: Record<keyof ProjectUpdateData, unknown> = PROJECT_UPDATE_FIELDS;
    expect(Object.keys(_typeCheck).length).toBeGreaterThan(0);
  });

  // For each field, verify the generated script contains evidence of handling it
  for (const [field, value] of Object.entries(PROJECT_UPDATE_FIELDS)) {
    it(`buildUpdateProjectScript handles field: ${field}`, async () => {
      const changes = { [field]: value } as ProjectUpdateData;
      const result = await buildUpdateProjectScript('test-project-id', changes);

      // The script should contain the field name or its value somewhere
      // (either in the changes JSON, or in conditional handling code)
      const script = result.script;

      // Every field should appear in the serialized changes object at minimum
      expect(script).toContain(field);
    });
  }
});
