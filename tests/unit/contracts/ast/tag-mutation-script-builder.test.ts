// tests/unit/contracts/ast/tag-mutation-script-builder.test.ts
// OMN-201 — direct unit coverage for the seven tag-lifecycle WRAPPER builders.
//
// The lowering layer (dispatchMutation('rename/tag', …) → program → emitProgram)
// is already exercised by tag-lifecycle.test.ts / tag-create.test.ts. What those
// tests never call is the thin wrapper functions in tag-mutation-script-builder.ts
// themselves, so Stryker reported the whole file as NoCoverage (17% mutation
// score). These tests pin the wrapper contract that survived un-mutated:
//   1. the dispatch op-key each wrapper passes ('rename/tag', …) — a mutated key
//      would dispatch a different op, changing the recovered action marker;
//   2. the JXA launcher wrapping (wrapInLauncher → app.evaluateJavascript(...));
//   3. the returned { operation, target } envelope literals.
//
// The sandbox guard (dispatchMutation, MUTATION_DEFS) is OFF here because
// SANDBOX_GUARD_ENABLED is unset, so plain tag names resolve — same as the
// sibling lowering tests.
import { describe, it, expect } from 'vitest';
import {
  buildCreateTagScript,
  buildRenameTagScript,
  buildDeleteTagScript,
  buildMergeTagsScript,
  buildNestTagScript,
  buildUnparentTagScript,
  buildReparentTagScript,
} from '../../../../src/contracts/ast/tag-mutation-script-builder.js';
import type { GeneratedMutationScript } from '../../../../src/contracts/ast/mutation-script-builder.js';
import { recoverInnerPrograms } from '../../../utils/recover-bridge-program.js';

/** The single OmniJS program embedded in a tag mutation's JXA launcher. */
function innerProgram(result: GeneratedMutationScript): string {
  const programs = recoverInnerPrograms(result.script);
  expect(programs).toHaveLength(1);
  return programs[0]!;
}

/**
 * Every wrapper: distinct op-key (proven via the op-specific envelope action in
 * the recovered inner program), the JXA launcher shape, and the { operation,
 * target } return. `data` uses the success path; nest REQUIRES a parent.
 */
const WRAPPERS = [
  {
    name: 'buildCreateTagScript',
    run: () => buildCreateTagScript({ tagName: 'Alpha' }),
    operation: 'create',
    action: 'created',
  },
  {
    name: 'buildRenameTagScript',
    run: () => buildRenameTagScript({ tagName: 'Old Name', newName: 'New Name' }),
    operation: 'rename',
    action: 'renamed',
  },
  {
    name: 'buildDeleteTagScript',
    run: () => buildDeleteTagScript({ tagName: 'Doomed' }),
    operation: 'delete',
    action: 'deleted',
  },
  {
    name: 'buildMergeTagsScript',
    run: () => buildMergeTagsScript({ tagName: 'Alpha', targetTag: 'Beta' }),
    operation: 'merge',
    action: 'merged',
  },
  {
    name: 'buildNestTagScript',
    run: () => buildNestTagScript({ tagName: 'Child', parentTagName: 'Parent' }),
    operation: 'nest',
    action: 'nested',
  },
  {
    name: 'buildUnparentTagScript',
    run: () => buildUnparentTagScript({ tagName: 'Child' }),
    operation: 'unparent',
    action: 'unparented',
  },
  {
    name: 'buildReparentTagScript',
    run: () => buildReparentTagScript({ tagName: 'Child', parentTagName: 'Parent' }),
    operation: 'reparent',
    action: 'reparented',
  },
] as const;

describe('tag-lifecycle wrapper builders', () => {
  describe.each(WRAPPERS)('$name', ({ run, operation, action }) => {
    it(`returns { operation: '${operation}', target: 'tag' }`, async () => {
      const result = await run();
      expect(result.operation).toBe(operation);
      expect(result.target).toBe('tag');
    });

    it('wraps the program in the JXA evaluateJavascript launcher', async () => {
      const result = await run();
      // wrapInLauncher shape — the JXA→OmniJS boundary. A dropped wrap call
      // would leave the script as bare OmniJS with neither marker.
      expect(result.script).toContain("const app = Application('OmniFocus')");
      expect(result.script).toContain('app.evaluateJavascript(');
      // .trim() ran: no surrounding whitespace.
      expect(result.script).toBe(result.script.trim());
    });

    it(`dispatches the right op — recovered program carries the "${action}" action`, async () => {
      const result = await run();
      // The op-specific envelope action proves the wrapper passed the correct
      // dispatch key: a mutated key ('rename/tag' → '') would dispatch a
      // different op (or throw), and this marker would not appear. Asserted as
      // the quoted token (not `action: "…"`) so merge's ternary
      // (`_warnings.length ? "merged_with_warning" : "merged"`) matches too.
      expect(innerProgram(result)).toContain(`"${action}"`);
    });
  });
});

describe('tag-lifecycle wrapper branches', () => {
  it('nest without a parent lowers to a constant error envelope (parent REQUIRED)', async () => {
    const result = await buildNestTagScript({ tagName: 'Child' });
    expect(result.operation).toBe('nest');
    expect(result.target).toBe('tag');
    const inner = innerProgram(result);
    expect(inner).toContain('error: true');
    expect(inner).toContain('Parent tag name or ID is required for nest action');
    expect(inner).not.toContain('action: "nested"');
  });

  it('unparent moves to root — no parent resolution in the recovered program', async () => {
    const result = await buildUnparentTagScript({ tagName: 'Child' });
    const inner = innerProgram(result);
    expect(inner).toContain('action: "unparented"');
  });

  it('create with a parent walks the find-or-create path', async () => {
    const result = await buildCreateTagScript({ tagName: 'Child', parentTagName: 'Parent' });
    expect(result.operation).toBe('create');
    const inner = innerProgram(result);
    expect(inner).toContain('action: "created"');
  });
});
