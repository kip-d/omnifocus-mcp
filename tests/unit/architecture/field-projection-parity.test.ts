/**
 * OMN-61 Phase 1 — static read-side field parity.
 *
 * Every member of TaskFieldEnum / ProjectFieldEnum MUST be emittable by the
 * AST projection. The enum and the projection switch are hand-maintained with
 * no mechanical link; when they drift, a field is accepted/advertised but
 * silently never returned (root cause of OMN-60, OMN-45/48/49/51/52).
 *
 * This test exercises the real build*Script -> generate*Projection path:
 * request exactly one field and assert the generated script emits a
 * projection key for it. It fails the moment a declared field has no case.
 *
 * The reverse direction (projection emits a key with no enum member) is also
 * checked, with an explicit allowlist for fields that are intentionally
 * context-only (e.g. today-mode derived fields) and not caller-requestable.
 */
import { describe, it, expect } from 'vitest';
import { TaskFieldEnum, ProjectFieldEnum } from '../../../src/tools/unified/schemas/read-schema.js';
import { buildFilteredTasksScript, buildFilteredProjectsScript } from '../../../src/contracts/ast/script-builder.js';

// Projection emits `<field>: task.<...>` / `<field>: project.<...>`.
// Match the key with a non-identifier char before it so e.g. `project:`
// does not spuriously match inside `projectId:`.
function emitsProjectionKey(script: string, field: string): boolean {
  return new RegExp(`(^|[^A-Za-z0-9_])${field}:`).test(script);
}

// Emitted-but-not-declared projection keys that are intentional: derived /
// context-only fields callers cannot request via the Field enums. Adding a
// new emitted key forces a conscious choice here (declare it or allowlist it).
const TASK_CONTEXT_ONLY_KEYS = ['effectivePlannedDate', 'reason', 'daysOverdue'];
const PROJECT_CONTEXT_ONLY_KEYS: string[] = [];

describe('OMN-61: read-side field projection parity', () => {
  describe('TaskFieldEnum — every declared field is emittable', () => {
    for (const field of TaskFieldEnum.options) {
      it(`emits a projection for task field "${field}"`, () => {
        const { script } = buildFilteredTasksScript({} as never, { fields: ['id', field] });
        expect(emitsProjectionKey(script, field), `task projection missing for "${field}"`).toBe(true);
      });
    }
  });

  describe('ProjectFieldEnum — every declared field is emittable', () => {
    for (const field of ProjectFieldEnum.options) {
      it(`emits a projection for project field "${field}"`, () => {
        const { script } = buildFilteredProjectsScript({}, { fields: ['id', field] });
        expect(emitsProjectionKey(script, field), `project projection missing for "${field}"`).toBe(true);
      });
    }
  });

  it('task projection emits no undeclared keys beyond the context-only allowlist', () => {
    // Request every declared field; any projection key in the output that is
    // neither a TaskFieldEnum member nor allowlisted is silent drift.
    const declared = new Set<string>(TaskFieldEnum.options);
    const { script } = buildFilteredTasksScript({} as never, {
      fields: [...TaskFieldEnum.options],
    });
    // Each generate*Projection entry becomes its own line `key: task....`;
    // nested object keys (e.g. inside reviewInterval) are mid-line, not at
    // line start, so a line-anchored match captures only top-level keys.
    const emitted = [...script.matchAll(/^\s*([A-Za-z][A-Za-z0-9_]*):\s*task\./gm)].map((m) => m[1]);
    const undeclared = [...new Set(emitted)].filter((k) => !declared.has(k) && !TASK_CONTEXT_ONLY_KEYS.includes(k));
    expect(undeclared, `undeclared task projection keys: ${undeclared.join(', ')}`).toEqual([]);
  });

  it('project projection emits no undeclared keys beyond the context-only allowlist', () => {
    const declared = new Set<string>(ProjectFieldEnum.options);
    const { script } = buildFilteredProjectsScript({}, { fields: [...ProjectFieldEnum.options] });
    const emitted = [...script.matchAll(/^\s*([A-Za-z][A-Za-z0-9_]*):\s*project\./gm)].map((m) => m[1]);
    const undeclared = [...new Set(emitted)].filter((k) => !declared.has(k) && !PROJECT_CONTEXT_ONLY_KEYS.includes(k));
    expect(undeclared, `undeclared project projection keys: ${undeclared.join(', ')}`).toEqual([]);
  });
});
