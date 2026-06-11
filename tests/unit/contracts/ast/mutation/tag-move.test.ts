// tests/unit/contracts/ast/mutation/tag-move.test.ts
// OMN-128 slice 6 — nest/unparent/reparent tag lowerings (the moveTag family,
// ONE shared lowering): golden program-shape, vm-execution, and dispatch-guard
// tests. Every program assertion drives through dispatchMutation (the real
// seam, spec §7 non-vacuity discipline) so guard-before-build is exercised.
import vm from 'node:vm';
import { describe, it, expect } from 'vitest';
import {
  dispatchMutation,
  validateMutationProgram,
  emitProgram,
  type Program,
  type ReturnNode,
} from '../../../../../src/contracts/ast/mutation/index.js';

/** The program's terminal return statement (every tag program has one). */
function returnStmt(program: Program): ReturnNode {
  const last = program.statements[program.statements.length - 1];
  if (last.type !== 'return') throw new Error('expected the program to end in a return statement');
  return last;
}

/** Shared no-success-KEY assertion (spec §2.3); 'successfully' in messages is fine. */
function expectNoSuccessKey(omnijs: string): void {
  expect(omnijs).not.toMatch(/\bsuccess\s*:/);
}

describe('nest/tag lowering', () => {
  it('emits resolve → guard → parent resolve → guard → self-check guard → moveTag → return, validates clean', async () => {
    const program = await dispatchMutation('nest/tag', { tagName: 'X', parentTagName: 'P' });
    expect(program.context).toBe('nest_tag');
    expect(program.snippetDeps).toEqual([]);
    expect(program.statements.map((s) => s.type)).toEqual([
      'resolveTag',
      'guard',
      'resolveTag',
      'guard',
      'guard',
      'moveTag',
      'return',
    ]);
    expect(() => validateMutationProgram(program)).not.toThrow();

    // The move itself: underTag position on the resolved parent, with the
    // nest-specific hard-error prefix (spec §4.2).
    expect(program.statements[5]).toMatchObject({
      type: 'moveTag',
      tag: { type: 'ref', name: '_tag' },
      position: { kind: 'underTag', var: '_parent' },
      errorPrefix: 'Failed to nest tag: ',
    });

    const omnijs = emitProgram(program);
    expect(omnijs).toContain('const _tag = flattenedTags.find(t => t.name === "X") || null;');
    expect(omnijs).toContain(
      'if (_tag === null) return JSON.stringify({ error: true, message: "Tag \'X\' not found", context: "nest_tag" });',
    );
    expect(omnijs).toContain('const _parent = flattenedTags.find(t => t.name === "P") || null;');
    expect(omnijs).toContain(
      'if (_parent === null) return JSON.stringify({ error: true, message: "Parent tag not found: P", context: "nest_tag" });',
    );
    // Self-nest check (legacy-faithful, spec §3): identity compared via primaryKey.
    expect(omnijs).toContain(
      'if (_tag.id.primaryKey === _parent.id.primaryKey) return JSON.stringify({ error: true, message: "Cannot nest tag under itself", context: "nest_tag" });',
    );
    expect(omnijs).toContain(
      'try { moveTags([_tag], _parent); } catch (e) { return JSON.stringify({ error: true, message: "Failed to nest tag: " + String(e) }); }',
    );
    // Envelope (spec §2.3): action/tagName/parentTagName/parentTagId/message —
    // parent values read LIVE off the resolved binding, no success key.
    expect(omnijs).toContain('action: "nested"');
    expect(omnijs).toContain('tagName: "X"');
    expect(omnijs).toContain('parentTagName: _parent.name');
    expect(omnijs).toContain('parentTagId: _parent.id.primaryKey');
    expect(omnijs).toContain("message: \"Tag 'X' nested under 'P'\"");
    expectNoSuccessKey(omnijs);
  });

  it('without a parent is a constant error program (verbatim legacy message, id mention and all)', async () => {
    const program = await dispatchMutation('nest/tag', { tagName: 'X' });
    expect(program.statements.map((s) => s.type)).toEqual(['return']);
    const parsed = JSON.parse(vm.runInNewContext(emitProgram(program), {}) as string);
    expect(parsed).toEqual({
      error: true,
      message: 'Parent tag name or ID is required for nest action',
      context: 'nest_tag',
    });
  });
});

describe('unparent/tag lowering', () => {
  it('emits resolve → guard → moveTag-to-root → return, validates clean', async () => {
    const program = await dispatchMutation('unparent/tag', { tagName: 'X' });
    expect(program.context).toBe('unparent_tag');
    expect(program.snippetDeps).toEqual([]);
    expect(program.statements.map((s) => s.type)).toEqual(['resolveTag', 'guard', 'moveTag', 'return']);
    expect(() => validateMutationProgram(program)).not.toThrow();

    expect(program.statements[2]).toMatchObject({
      type: 'moveTag',
      tag: { type: 'ref', name: '_tag' },
      position: { kind: 'root' },
      errorPrefix: 'Failed to unparent tag: ',
    });

    const omnijs = emitProgram(program);
    expect(omnijs).toContain('const _tag = flattenedTags.find(t => t.name === "X") || null;');
    expect(omnijs).toContain(
      'if (_tag === null) return JSON.stringify({ error: true, message: "Tag \'X\' not found", context: "unparent_tag" });',
    );
    expect(omnijs).toContain(
      'try { moveTags([_tag], tags.ending); } catch (e) { return JSON.stringify({ error: true, message: "Failed to unparent tag: " + String(e) }); }',
    );
    // Envelope (spec §2.3): action/tagName/message only.
    expect(Object.keys(returnStmt(program).envelope)).toEqual(['action', 'tagName', 'message']);
    expect(omnijs).toContain('action: "unparented"');
    expect(omnijs).toContain('tagName: "X"');
    expect(omnijs).toContain('message: "Tag \'X\' moved to root level"');
    expectNoSuccessKey(omnijs);
  });
});

describe('reparent/tag lowering', () => {
  it('with a parent: like nest but with reparent wordings and newParent* envelope keys', async () => {
    const program = await dispatchMutation('reparent/tag', { tagName: 'X', parentTagName: 'P' });
    expect(program.context).toBe('reparent_tag');
    expect(program.snippetDeps).toEqual([]);
    expect(program.statements.map((s) => s.type)).toEqual([
      'resolveTag',
      'guard',
      'resolveTag',
      'guard',
      'guard',
      'moveTag',
      'return',
    ]);
    expect(() => validateMutationProgram(program)).not.toThrow();

    expect(program.statements[5]).toMatchObject({
      type: 'moveTag',
      tag: { type: 'ref', name: '_tag' },
      position: { kind: 'underTag', var: '_parent' },
      errorPrefix: 'Failed to reparent tag: ',
    });

    const omnijs = emitProgram(program);
    expect(omnijs).toContain(
      'if (_tag === null) return JSON.stringify({ error: true, message: "Tag \'X\' not found", context: "reparent_tag" });',
    );
    // Reparent-specific parent-not-found wording (legacy: "New parent tag not found").
    expect(omnijs).toContain(
      'if (_parent === null) return JSON.stringify({ error: true, message: "New parent tag not found: P", context: "reparent_tag" });',
    );
    expect(omnijs).toContain(
      'if (_tag.id.primaryKey === _parent.id.primaryKey) return JSON.stringify({ error: true, message: "Cannot reparent tag under itself", context: "reparent_tag" });',
    );
    expect(omnijs).toContain(
      'try { moveTags([_tag], _parent); } catch (e) { return JSON.stringify({ error: true, message: "Failed to reparent tag: " + String(e) }); }',
    );
    // Envelope (spec §2.3): action/tagName/newParentTagName/newParentTagId/message.
    expect(Object.keys(returnStmt(program).envelope)).toEqual([
      'action',
      'tagName',
      'newParentTagName',
      'newParentTagId',
      'message',
    ]);
    expect(omnijs).toContain('action: "reparented"');
    expect(omnijs).toContain('newParentTagName: _parent.name');
    expect(omnijs).toContain('newParentTagId: _parent.id.primaryKey');
    expect(omnijs).toContain("message: \"Tag 'X' moved under 'P'\"");
    expectNoSuccessKey(omnijs);
  });

  it('without a parent moves to root (legacy quirk preserved) — NO parent keys in the envelope', async () => {
    const program = await dispatchMutation('reparent/tag', { tagName: 'X' });
    expect(program.context).toBe('reparent_tag');
    expect(program.statements.map((s) => s.type)).toEqual(['resolveTag', 'guard', 'moveTag', 'return']);
    expect(() => validateMutationProgram(program)).not.toThrow();

    expect(program.statements[2]).toMatchObject({
      type: 'moveTag',
      tag: { type: 'ref', name: '_tag' },
      position: { kind: 'root' },
      errorPrefix: 'Failed to reparent tag: ',
    });

    const omnijs = emitProgram(program);
    expect(omnijs).toContain(
      'try { moveTags([_tag], tags.ending); } catch (e) { return JSON.stringify({ error: true, message: "Failed to reparent tag: " + String(e) }); }',
    );
    // The action stays 'reparented' but the parent keys are ABSENT (spec §2.3).
    expect(Object.keys(returnStmt(program).envelope)).toEqual(['action', 'tagName', 'message']);
    expect(omnijs).toContain('action: "reparented"');
    expect(omnijs).toContain('message: "Tag \'X\' moved to root level"');
    expect(omnijs).not.toContain('newParentTagName');
    expect(omnijs).not.toContain('newParentTagId');
    expectNoSuccessKey(omnijs);
  });
});

// EXECUTE the emitted programs in a vm with stubbed OmniFocus globals — the
// layer that caught slice 1's appliedTags and slice 2's const-in-try bugs.
describe('emitted tag-move programs execute (vm)', () => {
  interface TagStub {
    name: string;
    id: { primaryKey: string };
  }

  function makeMoveSandbox(opts?: { moveThrows?: boolean }): {
    sandbox: Record<string, unknown>;
    tag: TagStub;
    parent: TagStub;
    rootEnding: object;
    moveCalls: Array<{ tags: TagStub[]; position: TagStub | object }>;
  } {
    const tag: TagStub = { name: 'X', id: { primaryKey: 'pk-x' } };
    const parent: TagStub = { name: 'P', id: { primaryKey: 'pk-p' } };
    // Sentinel for the root insertion location: emitted root moves reference
    // the OmniJS global `tags.ending` (the live API rejects a null position).
    const rootEnding = { location: 'tags.ending' };
    const moveCalls: Array<{ tags: TagStub[]; position: TagStub | object }> = [];
    const sandbox: Record<string, unknown> = {
      flattenedTags: [tag, parent],
      tags: { ending: rootEnding },
      moveTags: (tags: TagStub[], position: TagStub | object) => {
        if (opts?.moveThrows) throw new Error('boom');
        moveCalls.push({ tags, position });
      },
    };
    return { sandbox, tag, parent, rootEnding, moveCalls };
  }

  it('vm A: nest happy path calls moveTags([tag], parent) and returns the live-parent envelope', async () => {
    const { sandbox, tag, parent, moveCalls } = makeMoveSandbox();
    const program = emitProgram(await dispatchMutation('nest/tag', { tagName: 'X', parentTagName: 'P' }));
    const parsed = JSON.parse(vm.runInNewContext(program, sandbox) as string);

    expect(parsed).toEqual({
      action: 'nested',
      tagName: 'X',
      parentTagName: 'P',
      parentTagId: 'pk-p',
      message: "Tag 'X' nested under 'P'",
    });
    expect(moveCalls).toEqual([{ tags: [tag], position: parent }]);
  });

  it('vm B: self-nest returns the guard envelope and moveTags is NOT called', async () => {
    const { sandbox, moveCalls } = makeMoveSandbox();
    const program = emitProgram(await dispatchMutation('nest/tag', { tagName: 'X', parentTagName: 'X' }));
    const parsed = JSON.parse(vm.runInNewContext(program, sandbox) as string);

    expect(parsed).toEqual({ error: true, message: 'Cannot nest tag under itself', context: 'nest_tag' });
    expect(moveCalls).toEqual([]);
  });

  it('vm C: a moveTags throw surfaces as the hard prefixed error envelope (legacy e.toString shape)', async () => {
    const { sandbox } = makeMoveSandbox({ moveThrows: true });
    const program = emitProgram(await dispatchMutation('nest/tag', { tagName: 'X', parentTagName: 'P' }));
    const parsed = JSON.parse(vm.runInNewContext(program, sandbox) as string);

    expect(parsed).toEqual({ error: true, message: 'Failed to nest tag: Error: boom' });
  });

  it('vm D: unparent calls moveTags([tag], tags.ending) and returns the to-root envelope', async () => {
    const { sandbox, tag, rootEnding, moveCalls } = makeMoveSandbox();
    const program = emitProgram(await dispatchMutation('unparent/tag', { tagName: 'X' }));
    const parsed = JSON.parse(vm.runInNewContext(program, sandbox) as string);

    expect(parsed).toEqual({ action: 'unparented', tagName: 'X', message: "Tag 'X' moved to root level" });
    expect(moveCalls).toEqual([{ tags: [tag], position: rootEnding }]);
  });

  it('vm E: reparent without parent executes the legacy to-root quirk with NO parent keys', async () => {
    const { sandbox, tag, rootEnding, moveCalls } = makeMoveSandbox();
    const program = emitProgram(await dispatchMutation('reparent/tag', { tagName: 'X' }));
    const parsed = JSON.parse(vm.runInNewContext(program, sandbox) as string);

    expect(parsed).toEqual({ action: 'reparented', tagName: 'X', message: "Tag 'X' moved to root level" });
    expect('newParentTagName' in parsed).toBe(false);
    expect(moveCalls).toEqual([{ tags: [tag], position: rootEnding }]);
  });
});

// The OMN-119/120 non-bypass property: dispatch runs the relocated name-prefix
// sandbox guard BEFORE building, covering EVERY name the op touches (spec §2.1).
describe('dispatchMutation nest/unparent/reparent tag guards (spec §2.1)', () => {
  async function withGuardEnabled(fn: () => Promise<void>): Promise<void> {
    const prev = { NODE_ENV: process.env.NODE_ENV, SG: process.env.SANDBOX_GUARD_ENABLED };
    process.env.NODE_ENV = 'test';
    process.env.SANDBOX_GUARD_ENABLED = 'true';
    try {
      await fn();
    } finally {
      process.env.NODE_ENV = prev.NODE_ENV;
      process.env.SANDBOX_GUARD_ENABLED = prev.SG;
    }
  }

  it('nest rejects an unprefixed tagName', () =>
    withGuardEnabled(async () => {
      await expect(dispatchMutation('nest/tag', { tagName: 'RealTag', parentTagName: '__test-p' })).rejects.toThrow(
        /TEST GUARD/,
      );
    }));

  it('nest rejects an unprefixed parentTagName even with a prefixed tagName', () =>
    withGuardEnabled(async () => {
      await expect(dispatchMutation('nest/tag', { tagName: '__test-x', parentTagName: 'RealParent' })).rejects.toThrow(
        /TEST GUARD/,
      );
    }));

  it('nest resolves when BOTH names are prefixed', () =>
    withGuardEnabled(async () => {
      await expect(
        dispatchMutation('nest/tag', { tagName: '__test-x', parentTagName: '__test-p' }),
      ).resolves.toBeDefined();
    }));

  it('unparent rejects an unprefixed tagName', () =>
    withGuardEnabled(async () => {
      await expect(dispatchMutation('unparent/tag', { tagName: 'RealTag' })).rejects.toThrow(/TEST GUARD/);
    }));

  it('unparent resolves a __test- prefixed tagName', () =>
    withGuardEnabled(async () => {
      await expect(dispatchMutation('unparent/tag', { tagName: '__test-x' })).resolves.toBeDefined();
    }));

  it('reparent rejects an unprefixed tagName', () =>
    withGuardEnabled(async () => {
      await expect(dispatchMutation('reparent/tag', { tagName: 'RealTag', parentTagName: '__test-p' })).rejects.toThrow(
        /TEST GUARD/,
      );
    }));

  it('reparent rejects an unprefixed parentTagName even with a prefixed tagName', () =>
    withGuardEnabled(async () => {
      await expect(
        dispatchMutation('reparent/tag', { tagName: '__test-x', parentTagName: 'RealParent' }),
      ).rejects.toThrow(/TEST GUARD/);
    }));

  it('reparent resolves when BOTH names are prefixed', () =>
    withGuardEnabled(async () => {
      await expect(
        dispatchMutation('reparent/tag', { tagName: '__test-x', parentTagName: '__test-p' }),
      ).resolves.toBeDefined();
    }));

  it('reparent resolves with a prefixed tagName and NO parent (parent guard only when present)', () =>
    withGuardEnabled(async () => {
      await expect(dispatchMutation('reparent/tag', { tagName: '__test-x' })).resolves.toBeDefined();
    }));
});
