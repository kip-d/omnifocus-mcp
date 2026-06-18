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
import { recoverInnerProgram } from '../../../utils/recover-bridge-program.js';

/**
 * Every wrapper: distinct op-key (proven via the op-specific envelope action in
 * the recovered inner program), the JXA launcher shape, and the { operation,
 * target } return. `data` uses the success path; nest REQUIRES a parent.
 *
 * `name` is the `describe.each('$name')` block label (untyped interpolation) —
 * keep it in sync with `run` if a builder is renamed.
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
    });

    it(`dispatches the right op — recovered program carries the "${action}" action`, async () => {
      const result = await run();
      // The op-specific envelope action proves the wrapper passed the correct
      // dispatch key: a mutated key ('rename/tag' → '') would dispatch a
      // different op (or throw), and this marker would not appear. Asserted as
      // the quoted token (not `action: "…"`) so merge's ternary
      // (`_warnings.length ? "merged_with_warning" : "merged"`) matches too.
      expect(recoverInnerProgram(result.script)).toContain(`"${action}"`);
    });
  });
});

describe('tag-lifecycle wrapper branches', () => {
  it('nest without a parent lowers to a constant error envelope (parent REQUIRED)', async () => {
    const result = await buildNestTagScript({ tagName: 'Child' });
    expect(result.operation).toBe('nest');
    expect(result.target).toBe('tag');
    const inner = recoverInnerProgram(result.script);
    expect(inner).toContain('error: true');
    expect(inner).toContain('Parent tag name or ID is required for nest action');
    expect(inner).not.toContain('action: "nested"');
  });

  it('unparent moves to root — no parent resolution in the recovered program', async () => {
    const result = await buildUnparentTagScript({ tagName: 'Child' });
    const inner = recoverInnerProgram(result.script);
    expect(inner).toContain('action: "unparented"');
    // Backs the "moves to root, no parent resolution" claim: the root-move op
    // is emitted and no parent binding is ever resolved. Asserts the absence of
    // the binding (`const _parent`), not the bare token, so a future error
    // message that happened to mention "_parent" can't false-fail this.
    expect(inner).toContain('moveTags([_tag], tags.ending)');
    expect(inner).not.toContain('const _parent');
  });

  it('create with a parent walks the find-or-create path', async () => {
    const result = await buildCreateTagScript({ tagName: 'Child', parentTagName: 'Parent' });
    expect(result.operation).toBe('create');
    const inner = recoverInnerProgram(result.script);
    expect(inner).toContain('action: "created"');
    // The parent branch actually ran — distinguishes it from the flat path,
    // which emits `new Tag("Child")` + `parentTagName: null`. Here the parent
    // is resolved and threaded into both the Tag constructor and the envelope.
    expect(inner).toContain('new Tag("Child", _parent)');
    expect(inner).toContain('parentTagName: _parent.name');
  });
});
