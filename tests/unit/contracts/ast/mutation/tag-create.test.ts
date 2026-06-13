// tests/unit/contracts/ast/mutation/tag-create.test.ts
// OMN-128 slice 6 — create/tag lowering: golden program-shape + dispatch-guard
// tests. Every envelope/program assertion drives through dispatchMutation (the
// real seam, spec §7 non-vacuity discipline) so guard-before-build is exercised.
import vm from 'node:vm';
import { describe, it, expect } from 'vitest';
import {
  dispatchMutation,
  validateMutationProgram,
  emitProgram,
  type Program,
  type ReturnNode,
  type RawNode,
} from '../../../../../src/contracts/ast/mutation/index.js';
import { TagMutationResultSchema } from '../../../../../src/omnifocus/script-response-schemas.js';
import { expectMatchesSchema } from './assert-schema.js';

/** The program's terminal return statement (every create/tag program has one). */
function returnStmt(program: Program): ReturnNode {
  const last = program.statements[program.statements.length - 1];
  if (last.type !== 'return') throw new Error('expected the program to end in a return statement');
  return last;
}

describe('create/tag lowering — flat, no parent', () => {
  it('emits dup-check resolve → guard → constructTag → return, validates clean', async () => {
    const program = await dispatchMutation('create/tag', { tagName: 'X' });
    expect(program.context).toBe('create_tag');
    expect(program.snippetDeps).toEqual([]);
    expect(program.statements.map((s) => s.type)).toEqual(['resolveTag', 'guard', 'constructTag', 'return']);
    expect(() => validateMutationProgram(program)).not.toThrow();

    const omnijs = emitProgram(program);
    expect(omnijs).toContain('const _dup = flattenedTags.find(t => t.name === "X") || null;');
    expect(omnijs).toContain(
      'if (_dup !== null) return JSON.stringify({ error: true, message: "Tag \'X\' already exists", context: "create_tag" });',
    );
    expect(omnijs).toContain('new Tag("X")');
    // Envelope keys (spec §2.3): action/tagName/tagId/parentTagName/parentTagId/message,
    // ids live, parent keys null literals, and NO success key anywhere.
    expect(omnijs).toContain('action: "created"');
    expect(omnijs).toContain('tagName: "X"');
    expect(omnijs).toContain('tagId: _tag.id.primaryKey');
    expect(omnijs).toContain('parentTagName: null');
    expect(omnijs).toContain('parentTagId: null');
    expect(omnijs).toContain('message: "Tag \'X\' created successfully"');
    expect(omnijs).not.toMatch(/\bsuccess\s*:/); // no success KEY (spec §2.3); 'successfully' in messages is fine
  });
});

describe('create/tag lowering — flat, with parent', () => {
  it('resolves + guards the parent between dup-check and construct; envelope reads live parent values', async () => {
    const program = await dispatchMutation('create/tag', { tagName: 'Child', parentTagName: 'P' });
    expect(program.statements.map((s) => s.type)).toEqual([
      'resolveTag',
      'guard',
      'resolveTag',
      'guard',
      'constructTag',
      'return',
    ]);
    expect(() => validateMutationProgram(program)).not.toThrow();

    const omnijs = emitProgram(program);
    expect(omnijs).toContain('const _parent = flattenedTags.find(t => t.name === "P") || null;');
    expect(omnijs).toContain(
      'if (_parent === null) return JSON.stringify({ error: true, message: "Parent tag not found: P", context: "create_tag" });',
    );
    expect(omnijs).toContain('new Tag("Child", _parent)');
    // Live reads off the resolved parent binding — not echoes (spec §2.2).
    expect(omnijs).toContain('parentTagName: _parent.name');
    expect(omnijs).toContain('parentTagId: _parent.id.primaryKey');
    expect(omnijs).toContain("message: \"Tag 'Child' created under 'P'\"");
    expect(omnijs).not.toMatch(/\bsuccess\s*:/); // no success KEY (spec §2.3); 'successfully' in messages is fine
  });
});

describe('create/tag lowering — path syntax (build-time parse, spec §3)', () => {
  it('lowers to bind(_pathStr) → constructTagPath(segments) → return with path/createdSegments', async () => {
    const program = await dispatchMutation('create/tag', { tagName: 'Work : Active' });
    expect(program.statements.map((s) => s.type)).toEqual(['bind', 'constructTagPath', 'return']);
    expect(program.snippetDeps).toContain('createTagPath');
    expect(() => validateMutationProgram(program)).not.toThrow();

    expect(program.statements[1]).toMatchObject({
      type: 'constructTagPath',
      bind: '_tag',
      createdBind: '_created',
      segments: { type: 'json', value: ['Work', 'Active'] },
    });

    const envelope = returnStmt(program).envelope;
    expect(Object.keys(envelope)).toEqual(['action', 'tagName', 'tagId', 'path', 'createdSegments', 'message']);

    // The no-user-data-in-raw rule: the message raw references the _pathStr
    // bind and never carries the user's path string inline.
    const message = envelope.message as RawNode;
    expect(message.type).toBe('raw');
    expect(message.code).toContain('_pathStr');
    expect(message.code).not.toContain('Work : Active');

    const omnijs = emitProgram(program);
    expect(omnijs).toContain('const _pathStr = "Work : Active";');
    expect(omnijs).toContain('createTagPath(["Work","Active"])');
    expect(omnijs).toContain('function createTagPath'); // snippet assembled
    expect(omnijs).not.toMatch(/\bsuccess\s*:/); // no success KEY (spec §2.3); 'successfully' in messages is fine
  });

  it('path + parentTag together is a constant error program (verbatim legacy message)', async () => {
    const program = await dispatchMutation('create/tag', { tagName: 'Work : Active', parentTagName: 'P' });
    expect(program.statements.map((s) => s.type)).toEqual(['return']);
    const parsed = JSON.parse(vm.runInNewContext(emitProgram(program), {}) as string);
    expect(parsed).toEqual({
      error: true,
      message:
        "Cannot use path syntax (' : ' separator) with parentTag parameter. Use either path syntax OR parentTag, not both.",
      context: 'create_tag',
    });
  });

  it('an empty path segment is a constant error program (verbatim legacy message)', async () => {
    const program = await dispatchMutation('create/tag', { tagName: 'Work :  : X' });
    expect(program.statements.map((s) => s.type)).toEqual(['return']);
    const parsed = JSON.parse(vm.runInNewContext(emitProgram(program), {}) as string);
    expect(parsed).toEqual({
      error: true,
      message: 'Invalid tag path: empty segment in "Work :  : X"',
      context: 'create_tag',
    });
  });
});

// The OMN-119/120 non-bypass property for the tag family: dispatch runs the
// relocated name-prefix sandbox guard BEFORE building (spec §2.1).
describe('dispatchMutation create/tag guard (spec §2.1 — relocated sandbox guard)', () => {
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

  it('rejects an unprefixed tagName', () =>
    withGuardEnabled(async () => {
      await expect(dispatchMutation('create/tag', { tagName: 'RealTag' })).rejects.toThrow(/TEST GUARD/);
    }));

  it('resolves a __test- prefixed tagName', () =>
    withGuardEnabled(async () => {
      await expect(dispatchMutation('create/tag', { tagName: '__test-x' })).resolves.toBeDefined();
    }));

  it('rejects an unprefixed parentTagName even with a prefixed tagName (stricter than legacy, sandbox-only)', () =>
    withGuardEnabled(async () => {
      await expect(
        dispatchMutation('create/tag', { tagName: '__test-x', parentTagName: 'RealParent' }),
      ).rejects.toThrow(/TEST GUARD/);
    }));

  it('rejects an unprefixed path form (full-string prefix check)', () =>
    withGuardEnabled(async () => {
      await expect(dispatchMutation('create/tag', { tagName: 'RealA : RealB' })).rejects.toThrow(/TEST GUARD/);
    }));

  it('resolves a prefixed full path string (segments are not individually checked)', () =>
    withGuardEnabled(async () => {
      await expect(dispatchMutation('create/tag', { tagName: '__test-A : B' })).resolves.toBeDefined();
    }));
});

// EXECUTE the emitted programs in a vm with stubbed OmniFocus globals — the
// layer that caught slice 1's appliedTags and slice 2's const-in-try bugs.
describe('emitted create-tag programs execute (vm)', () => {
  interface TagStub {
    name: string;
    parent: TagStub | null;
    children: TagStub[];
    id: { primaryKey: string };
  }

  function makeSandbox(): {
    sandbox: Record<string, unknown>;
    topLevel: TagStub[];
    flat: TagStub[];
    constructorCalls: string[];
  } {
    const topLevel: TagStub[] = [];
    const flat: TagStub[] = [];
    const constructorCalls: string[] = [];
    let nextId = 1;
    const TagCtor = function (this: TagStub, name: string, parent?: TagStub | null) {
      constructorCalls.push(name);
      this.name = name;
      this.parent = parent ?? null;
      this.children = [];
      this.id = { primaryKey: `tag-pk-${nextId++}` };
      (parent ? parent.children : topLevel).push(this);
      flat.push(this);
    };
    const sandbox: Record<string, unknown> = {
      Tag: TagCtor,
      tags: topLevel,
      flattenedTags: flat,
    };
    return { sandbox, topLevel, flat, constructorCalls };
  }

  /** Pre-seed a tag through the same stub constructor. */
  function seed(sandbox: Record<string, unknown>, name: string, parent?: TagStub): TagStub {
    const TagCtor = sandbox.Tag as new (name: string, parent?: TagStub) => TagStub;
    return new TagCtor(name, parent);
  }

  it('vm A: flat create returns live ids, null parent keys, and lands at top level', async () => {
    const { sandbox, topLevel } = makeSandbox();
    const program = emitProgram(await dispatchMutation('create/tag', { tagName: 'X' }));
    const parsed = JSON.parse(vm.runInNewContext(program, sandbox) as string);

    expectMatchesSchema(TagMutationResultSchema, parsed);
    expect(parsed).toEqual({
      action: 'created',
      tagName: 'X',
      tagId: 'tag-pk-1',
      parentTagName: null,
      parentTagId: null,
      message: "Tag 'X' created successfully",
    });
    expect(topLevel.map((t) => t.name)).toEqual(['X']);
  });

  it('vm B: duplicate name returns the error envelope and constructs nothing', async () => {
    const { sandbox, constructorCalls } = makeSandbox();
    seed(sandbox, 'X');
    constructorCalls.length = 0;

    const program = emitProgram(await dispatchMutation('create/tag', { tagName: 'X' }));
    const parsed = JSON.parse(vm.runInNewContext(program, sandbox) as string);

    expect(parsed).toEqual({ error: true, message: "Tag 'X' already exists", context: 'create_tag' });
    expect(constructorCalls).toEqual([]);
  });

  it('vm C: parented create nests under the resolved parent with live parent ids', async () => {
    const { sandbox } = makeSandbox();
    const parent = seed(sandbox, 'P');

    const program = emitProgram(await dispatchMutation('create/tag', { tagName: 'Child', parentTagName: 'P' }));
    const parsed = JSON.parse(vm.runInNewContext(program, sandbox) as string);

    expectMatchesSchema(TagMutationResultSchema, parsed);
    expect(parsed).toEqual({
      action: 'created',
      tagName: 'Child',
      tagId: 'tag-pk-2',
      parentTagName: 'P',
      parentTagId: parent.id.primaryKey,
      message: "Tag 'Child' created under 'P'",
    });
    expect(parent.children.map((t) => t.name)).toEqual(['Child']);
  });

  it('vm D: parent-not-found returns the error envelope and NEVER constructs a Tag', async () => {
    const { sandbox, constructorCalls } = makeSandbox();
    const program = emitProgram(await dispatchMutation('create/tag', { tagName: 'Child', parentTagName: 'Ghost' }));
    const parsed = JSON.parse(vm.runInNewContext(program, sandbox) as string);

    expect(parsed).toEqual({ error: true, message: 'Parent tag not found: Ghost', context: 'create_tag' });
    expect(constructorCalls).toEqual([]);
  });

  it('vm E: path create finds-or-creates segments and reports only the created ones', async () => {
    const { sandbox } = makeSandbox();
    seed(sandbox, 'Work'); // pre-existing first segment

    const program = emitProgram(await dispatchMutation('create/tag', { tagName: 'Work : Active' }));
    const parsed = JSON.parse(vm.runInNewContext(program, sandbox) as string);

    expectMatchesSchema(TagMutationResultSchema, parsed);
    expect(parsed).toEqual({
      action: 'created',
      tagName: 'Active',
      tagId: 'tag-pk-2',
      path: 'Work : Active',
      createdSegments: ['Active'],
      message: "Created 1 tag(s) in path 'Work : Active'",
    });
  });

  it('vm F: a fully-existing path returns createdSegments [] with the already-exists message', async () => {
    const { sandbox } = makeSandbox();
    const work = seed(sandbox, 'Work');
    seed(sandbox, 'Active', work);

    const program = emitProgram(await dispatchMutation('create/tag', { tagName: 'Work : Active' }));
    const parsed = JSON.parse(vm.runInNewContext(program, sandbox) as string);

    expectMatchesSchema(TagMutationResultSchema, parsed);
    expect(parsed.createdSegments).toEqual([]);
    expect(parsed.message).toBe("Tag path 'Work : Active' already exists");
  });
});
