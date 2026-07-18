// OMN-274 (spec: Technical/specs/OMN-274-read-path-status-vocabulary.md):
// script-builder's read pipeline carried THREE separately-maintained inline
// Project.Status maps (two getProjectStatus helpers + a folder-listing
// ternary) that emitted the drifted hyphenated 'on-hold' AND failed closed to
// hardcoded fallbacks ('active'/'dropped') — three different silent wrong
// answers for a future OmniFocus status, and a cross-endpoint vocabulary
// mismatch with the OMN-272-unified analytics emitters. All three now splice
// PROJECT_STATUS_STRING_SNIPPET, and getFolderStatus splices its new sibling
// FOLDER_STATUS_STRING_SNIPPET — one definition per enum, String(s) fail-open.
// These tests pin the splice structure so an inline copy can't reappear.
import { describe, it, expect } from 'vitest';
import {
  buildFilteredProjectsScript,
  buildProjectByIdScript,
  buildFilteredFoldersScript,
} from '../../../../src/contracts/ast/script-builder.js';
import { PROJECT_STATUS_STRING_SNIPPET, FOLDER_STATUS_STRING_SNIPPET } from '../../../../src/contracts/ast/types.js';

/**
 * Some builders embed their OmniJS source JSON-escaped (inside the
 * evaluateJavascript bridge string), so the spliced snippet appears with \n
 * escaped. Containment must accept either form — same snippet, same identity.
 */
function expectSnippet(script: string, snippet: string): void {
  const escaped = JSON.stringify(snippet).slice(1, -1);
  expect(script.includes(snippet) || script.includes(escaped)).toBe(true);
}

const PROJECT_SCRIPTS: Array<[string, string]> = [
  [
    'buildFilteredProjectsScript',
    buildFilteredProjectsScript({}, { fields: ['id', 'name', 'status'], limit: 10 }).script,
  ],
  ['buildProjectByIdScript', buildProjectByIdScript('proj-1', ['id', 'name', 'status']).script],
];

describe('OMN-274 — read-path Project.Status vocabulary (unified, no drift)', () => {
  it.each(PROJECT_SCRIPTS)('%s splices the ONE canonical project map', (_name, script) => {
    expectSnippet(script, PROJECT_STATUS_STRING_SNIPPET);
  });

  it.each(PROJECT_SCRIPTS)('%s carries no drifted vocabulary or inline copy', (_name, script) => {
    expect(script).not.toContain("'on-hold'");
    expect(script).not.toContain('getProjectStatus');
  });

  it('folder listing splices BOTH canonical maps (project ternary + folder helper gone)', () => {
    const script = buildFilteredFoldersScript({ includeProjects: true, limit: 10 }).script;
    expectSnippet(script, PROJECT_STATUS_STRING_SNIPPET);
    expectSnippet(script, FOLDER_STATUS_STRING_SNIPPET);
    expect(script).not.toContain("'on-hold'");
    expect(script).not.toContain('getFolderStatus');
  });

  it('folder listing omits the project status map when includeProjects is false (no unused splice)', () => {
    // projectStatusString is only called inside the includeProjects branch —
    // splicing it unconditionally would ship an unused function in every
    // includeProjects:false script against the 261KB OmniJS bridge budget.
    const script = buildFilteredFoldersScript({ includeProjects: false, limit: 10 }).script;
    expectSnippet(script, FOLDER_STATUS_STRING_SNIPPET);
    const escapedProjectSnippet = JSON.stringify(PROJECT_STATUS_STRING_SNIPPET).slice(1, -1);
    expect(script.includes(PROJECT_STATUS_STRING_SNIPPET) || script.includes(escapedProjectSnippet)).toBe(false);
    expect(script).not.toContain('function projectStatusString');
  });

  it('both snippets fail OPEN (String(s)), never to a hardcoded status', () => {
    // The old inline maps returned 'active'/'active'/'dropped' for an unknown
    // status — three different silent wrong answers. The snippets surface the
    // raw value instead.
    expect(PROJECT_STATUS_STRING_SNIPPET).toContain('return String(s)');
    expect(FOLDER_STATUS_STRING_SNIPPET).toContain('return String(s)');
  });
});
