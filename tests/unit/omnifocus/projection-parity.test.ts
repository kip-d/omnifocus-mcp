/**
 * Projection-parity tests (OMN-158, Task 2).
 *
 * Asserts that TaskRowSchema and ProjectRowSchema enumerate exactly the keys
 * that the projection switch emits — so a new switch case without a schema
 * update (or vice-versa) fails loudly here.
 *
 * Mechanism: readFileSync the TS source, slice the text between the two
 * function declarations, extract `case '(\w+)':` labels from THAT slice only.
 * This avoids picking up unrelated switch labels elsewhere in the file.
 */

import * as fs from 'fs';
import { fileURLToPath, URL } from 'url';
import { describe, it, expect } from 'vitest';
import { TaskRowSchema, ProjectRowSchema } from '../../../src/omnifocus/script-response-schemas.js';

// ---------------------------------------------------------------------------
// Source-slice helpers
// ---------------------------------------------------------------------------

function sliceBetweenFunctions(src: string, startFn: string, endMarker: string): string {
  const startIdx = src.indexOf(`function ${startFn}`);
  if (startIdx === -1) throw new Error(`function ${startFn} not found in source`);
  const endIdx = src.indexOf(endMarker, startIdx + startFn.length);
  if (endIdx === -1) throw new Error(`end marker "${endMarker}" not found after function ${startFn}`);
  return src.slice(startIdx, endIdx);
}

function extractSwitchCaseLabels(slice: string): Set<string> {
  const labels = new Set<string>();
  // Match  case 'fieldName':  patterns
  const re = /case\s+'(\w+)'\s*:/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(slice)) !== null) {
    labels.add(m[1]);
  }
  return labels;
}

// ---------------------------------------------------------------------------
// Load source once
// ---------------------------------------------------------------------------

const scriptBuilderSrc = fs.readFileSync(
  fileURLToPath(new URL('../../../src/contracts/ast/script-builder.ts', import.meta.url)),
  'utf-8',
);

// ---------------------------------------------------------------------------
// Task projection parity
// ---------------------------------------------------------------------------

describe('TaskRowSchema ↔ generateFieldProjection switch-case parity', () => {
  it('schema keys exactly equal the generateFieldProjection switch case labels', () => {
    // Slice: from `function generateFieldProjection` to the next top-level function
    const slice = sliceBetweenFunctions(
      scriptBuilderSrc,
      'generateFieldProjection',
      '\nfunction generateWarningsBlock',
    );
    const switchLabels = extractSwitchCaseLabels(slice);
    const schemaKeys = new Set(Object.keys(TaskRowSchema.shape));

    const missingFromSchema = [...switchLabels].filter((k) => !schemaKeys.has(k));
    const missingFromSwitch = [...schemaKeys].filter((k) => !switchLabels.has(k));

    expect(
      missingFromSchema,
      `Switch has case labels not in TaskRowSchema.shape: ${missingFromSchema.join(', ')}`,
    ).toEqual([]);
    expect(missingFromSwitch, `TaskRowSchema.shape has keys not in switch: ${missingFromSwitch.join(', ')}`).toEqual(
      [],
    );
  });
});

// ---------------------------------------------------------------------------
// Project projection parity
// ---------------------------------------------------------------------------

describe('ProjectRowSchema ↔ generateProjectFieldProjection switch-case parity', () => {
  it('switch case labels are a subset of ProjectRowSchema.shape; difference is exactly {taskCounts, nextTask, stats, noteTruncated}', () => {
    // Slice: from `function generateProjectFieldProjection` to the next top-level function
    const slice = sliceBetweenFunctions(
      scriptBuilderSrc,
      'generateProjectFieldProjection',
      '\nexport function buildFilteredProjectsScript',
    );
    const switchLabels = extractSwitchCaseLabels(slice);
    const schemaKeys = new Set(Object.keys(ProjectRowSchema.shape));

    // Every switch label must be in the schema
    const missingFromSchema = [...switchLabels].filter((k) => !schemaKeys.has(k));
    expect(
      missingFromSchema,
      `Switch has labels not in ProjectRowSchema.shape: ${missingFromSchema.join(', ')}`,
    ).toEqual([]);

    // The difference (schema keys NOT in the switch) must be exactly these four.
    // noteTruncated (OMN-242) piggybacks on the 'note' case rather than being
    // its own switch label — it's emitted conditionally within that case body.
    const expectedExtra = new Set(['taskCounts', 'nextTask', 'stats', 'noteTruncated']);
    const actualExtra = new Set([...schemaKeys].filter((k) => !switchLabels.has(k)));

    expect(actualExtra).toEqual(expectedExtra);
  });
});
