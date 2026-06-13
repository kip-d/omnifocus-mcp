// tests/unit/contracts/ast/mutation/tag-lifecycle.test.ts
// OMN-128 slice 6 — rename/delete/merge tag lowerings: golden program-shape,
// vm-execution (merge, both delete paths), and dispatch-guard tests. Every
// program assertion drives through dispatchMutation (the real seam, spec §7
// non-vacuity discipline) so guard-before-build is exercised.
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

describe('rename/tag lowering', () => {
  it('emits resolve → not-found guard → dup resolve → exists guard → setProp → return, validates clean', async () => {
    const program = await dispatchMutation('rename/tag', { tagName: 'Old Name', newName: 'New Name' });
    expect(program.context).toBe('rename_tag');
    expect(program.snippetDeps).toEqual([]);
    // Order preserved: target-not-found beats duplicate (legacy check order).
    expect(program.statements.map((s) => s.type)).toEqual([
      'resolveTag',
      'guard',
      'resolveTag',
      'guard',
      'setProp',
      'return',
    ]);
    expect(() => validateMutationProgram(program)).not.toThrow();

    // The rename itself: direct-strategy setProp on the resolved target's name.
    expect(program.statements[4]).toMatchObject({
      type: 'setProp',
      target: { type: 'ref', name: '_tag' },
      prop: 'name',
      value: { type: 'json', value: 'New Name' },
      strategy: 'direct',
    });

    const omnijs = emitProgram(program);
    expect(omnijs).toContain('const _tag = flattenedTags.find(t => t.name === "Old Name") || null;');
    expect(omnijs).toContain(
      'if (_tag === null) return JSON.stringify({ error: true, message: "Tag \'Old Name\' not found", context: "rename_tag" });',
    );
    expect(omnijs).toContain('const _dup = flattenedTags.find(t => t.name === "New Name") || null;');
    expect(omnijs).toContain(
      'if (_dup !== null) return JSON.stringify({ error: true, message: "Tag \'New Name\' already exists", context: "rename_tag" });',
    );
    expect(omnijs).toContain('_tag.name = "New Name";');
    // Envelope keys (spec §2.3): action/oldName/newName/message, no success key.
    expect(omnijs).toContain('action: "renamed"');
    expect(omnijs).toContain('oldName: "Old Name"');
    expect(omnijs).toContain('newName: "New Name"');
    expect(omnijs).toContain("message: \"Tag renamed from 'Old Name' to 'New Name'\"");
    expectNoSuccessKey(omnijs);
  });
});

describe('delete/tag lowering', () => {
  it('emits resolve → not-found guard → HARD deleteObject → return, validates clean', async () => {
    const program = await dispatchMutation('delete/tag', { tagName: 'X' });
    expect(program.context).toBe('delete_tag');
    expect(program.snippetDeps).toEqual([]);
    expect(program.statements.map((s) => s.type)).toEqual(['resolveTag', 'guard', 'deleteObject', 'return']);
    expect(() => validateMutationProgram(program)).not.toThrow();

    // NO bestEffort: a failed single-tag delete is a hard error (spec §3 —
    // there is no partial result to preserve, contrast merge).
    const del = program.statements[2];
    expect(del).toMatchObject({ type: 'deleteObject', target: { type: 'ref', name: '_tag' } });
    expect('bestEffort' in del).toBe(false);

    const omnijs = emitProgram(program);
    expect(omnijs).toContain('const _tag = flattenedTags.find(t => t.name === "X") || null;');
    expect(omnijs).toContain(
      'if (_tag === null) return JSON.stringify({ error: true, message: "Tag \'X\' not found", context: "delete_tag" });',
    );
    expect(omnijs).toContain('deleteObject(_tag);');
    expect(omnijs).not.toContain('try { deleteObject(_tag); }'); // hard error, not best-effort
    // Envelope keys (spec §2.3): action/tagName/message — with the legacy
    // trailing period on the message, byte-preserved.
    expect(omnijs).toContain('action: "deleted"');
    expect(omnijs).toContain('tagName: "X"');
    expect(omnijs).toContain('message: "Tag \'X\' deleted successfully."');
    expectNoSuccessKey(omnijs);
  });
});

describe('merge/tag lowering', () => {
  it('emits src/tgt resolves+guards → name binds → mergeRetag → bestEffort delete → branching return', async () => {
    const program = await dispatchMutation('merge/tag', { tagName: 'Alpha', targetTag: 'Beta' });
    expect(program.context).toBe('merge_tags');
    expect(program.snippetDeps).toEqual([]);
    expect(program.statements.map((s) => s.type)).toEqual([
      'resolveTag',
      'guard',
      'resolveTag',
      'guard',
      'bind',
      'bind',
      'mergeRetag',
      'deleteObject',
      'return',
    ]);
    expect(() => validateMutationProgram(program)).not.toThrow();

    expect(program.statements[6]).toMatchObject({
      type: 'mergeRetag',
      sourceVar: '_src',
      targetVar: '_tgt',
      bind: '_count',
    });
    // Source delete is the ONE best-effort deleteObject consumer (spec §2.5):
    // retagging already happened, so the failure becomes a labeled warning.
    expect(program.statements[7]).toMatchObject({
      type: 'deleteObject',
      target: { type: 'ref', name: '_src' },
      bestEffort: true,
      label: 'Tags were merged but source tag could not be deleted',
    });

    const omnijs = emitProgram(program);
    expect(omnijs).toContain('const _src = flattenedTags.find(t => t.name === "Alpha") || null;');
    expect(omnijs).toContain(
      'if (_src === null) return JSON.stringify({ error: true, message: "Source tag \'Alpha\' not found", context: "merge_tags" });',
    );
    expect(omnijs).toContain('const _tgt = flattenedTags.find(t => t.name === "Beta") || null;');
    expect(omnijs).toContain(
      'if (_tgt === null) return JSON.stringify({ error: true, message: "Target tag \'Beta\' not found", context: "merge_tags" });',
    );
    expect(omnijs).toContain('const _srcName = "Alpha";');
    expect(omnijs).toContain('const _tgtName = "Beta";');
    expect(omnijs).toContain(
      'try { deleteObject(_src); } catch (e) { _warnings.push("Tags were merged but source tag could not be deleted" + \': \' + (e && e.message ? e.message : String(e))); }',
    );
    expectNoSuccessKey(omnijs);
  });

  it('envelope raw branches on _warnings.length; user names enter via binds ONLY (no-user-data-in-raw)', async () => {
    const program = await dispatchMutation('merge/tag', { tagName: 'Alpha', targetTag: 'Beta' });
    const envelope = returnStmt(program).envelope;
    expect(Object.keys(envelope)).toEqual(['action', 'sourceTag', 'targetTag', 'tasksMerged', 'warning', 'message']);

    expect((envelope.action as RawNode).code).toBe('_warnings.length ? "merged_with_warning" : "merged"');
    expect(envelope.sourceTag).toEqual({ type: 'ref', name: '_srcName' });
    expect(envelope.targetTag).toEqual({ type: 'ref', name: '_tgtName' });
    expect(envelope.tasksMerged).toEqual({ type: 'ref', name: '_count' });
    // `warning` is undefined on the success path — JSON.stringify drops
    // undefined-valued keys, so the key appears only on failure (spec §2.3).
    expect((envelope.warning as RawNode).code).toBe('_warnings.length ? _warnings[0] : undefined');

    // The no-user-data-in-raw rule: the message raw references the _srcName /
    // _tgtName binds and never carries the user's tag names inline.
    const message = envelope.message as RawNode;
    expect(message.type).toBe('raw');
    expect(message.code).toContain('_srcName');
    expect(message.code).toContain('_tgtName');
    expect(message.code).not.toContain('Alpha');
    expect(message.code).not.toContain('Beta');
  });
});

// EXECUTE the emitted merge program in a vm with stubbed OmniFocus globals —
// BOTH source-delete paths (success and throw), the layer that caught slice 1's
// appliedTags and slice 2's const-in-try bugs.
describe('emitted merge-tag programs execute (vm)', () => {
  interface TagStub {
    name: string;
  }
  interface TaskStub {
    tags: TagStub[];
    removeTag(t: TagStub): void;
    addTag(t: TagStub): void;
  }

  function makeMergeSandbox(opts: { deleteThrows: boolean }): {
    sandbox: Record<string, unknown>;
    src: TagStub;
    tgt: TagStub;
    tasks: TaskStub[];
    deletedTags: TagStub[];
  } {
    const src: TagStub = { name: 'Alpha' };
    const tgt: TagStub = { name: 'Beta' };
    const makeTask = (tags: TagStub[]): TaskStub => ({
      tags: [...tags],
      removeTag(t) {
        this.tags = this.tags.filter((x) => x !== t);
      },
      addTag(t) {
        this.tags.push(t);
      },
    });
    // Two tasks carry the source (one already carries the target too — the
    // addTag-if-absent branch); one carries only the target → count = 2.
    const tasks = [makeTask([src]), makeTask([src, tgt]), makeTask([tgt])];
    const deletedTags: TagStub[] = [];
    const sandbox: Record<string, unknown> = {
      flattenedTags: [src, tgt],
      flattenedTasks: tasks,
      deleteObject: (t: TagStub) => {
        if (opts.deleteThrows) throw new Error('source tag is busy');
        deletedTags.push(t);
      },
    };
    return { sandbox, src, tgt, tasks, deletedTags };
  }

  it('vm A: successful source delete → action "merged", live count, NO warning key', async () => {
    const { sandbox, src, tgt, tasks, deletedTags } = makeMergeSandbox({ deleteThrows: false });
    const program = emitProgram(await dispatchMutation('merge/tag', { tagName: 'Alpha', targetTag: 'Beta' }));
    const parsed = JSON.parse(vm.runInNewContext(program, sandbox) as string);

    expectMatchesSchema(TagMutationResultSchema, parsed);
    expect(parsed).toEqual({
      action: 'merged',
      sourceTag: 'Alpha',
      targetTag: 'Beta',
      tasksMerged: 2,
      message: "Merged 'Alpha' into 'Beta'. 2 tasks updated.",
    });
    // JSON.stringify drops the undefined-valued warning on the success path.
    expect('warning' in parsed).toBe(false);
    // Retagging really happened: no task carries the source, all three carry
    // the target exactly once, and the source tag itself was deleted.
    expect(tasks.every((t) => !t.tags.includes(src))).toBe(true);
    expect(tasks.map((t) => t.tags.filter((x) => x === tgt).length)).toEqual([1, 1, 1]);
    expect(deletedTags).toEqual([src]);
  });

  it('vm B: source delete throws → "merged_with_warning" with labeled warning, partial success preserved', async () => {
    const { sandbox, src, tasks } = makeMergeSandbox({ deleteThrows: true });
    const program = emitProgram(await dispatchMutation('merge/tag', { tagName: 'Alpha', targetTag: 'Beta' }));
    const parsed = JSON.parse(vm.runInNewContext(program, sandbox) as string);

    expectMatchesSchema(TagMutationResultSchema, parsed);
    expect(parsed.action).toBe('merged_with_warning');
    expect(parsed.sourceTag).toBe('Alpha');
    expect(parsed.targetTag).toBe('Beta');
    expect(parsed.tasksMerged).toBe(2);
    expect(parsed.warning).toMatch(/^Tags were merged but source tag could not be deleted:/);
    expect(parsed.message).toBe('Merged 2 tasks but could not delete source tag');
    // The retagging (the partial result the bestEffort exists to preserve)
    // still happened even though the delete failed.
    expect(tasks.every((t) => !t.tags.includes(src))).toBe(true);
  });
});

// The OMN-119/120 non-bypass property: dispatch runs the relocated name-prefix
// sandbox guard BEFORE building, covering EVERY name the op touches (spec §2.1).
describe('dispatchMutation rename/delete/merge tag guards (spec §2.1)', () => {
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

  it('rename rejects an unprefixed tagName', () =>
    withGuardEnabled(async () => {
      await expect(dispatchMutation('rename/tag', { tagName: 'RealTag', newName: '__test-y' })).rejects.toThrow(
        /TEST GUARD/,
      );
    }));

  it('rename rejects an unprefixed newName even with a prefixed tagName', () =>
    withGuardEnabled(async () => {
      await expect(dispatchMutation('rename/tag', { tagName: '__test-x', newName: 'RealName' })).rejects.toThrow(
        /TEST GUARD/,
      );
    }));

  it('rename resolves when BOTH names are prefixed', () =>
    withGuardEnabled(async () => {
      await expect(dispatchMutation('rename/tag', { tagName: '__test-x', newName: '__test-y' })).resolves.toBeDefined();
    }));

  it('delete rejects an unprefixed tagName', () =>
    withGuardEnabled(async () => {
      await expect(dispatchMutation('delete/tag', { tagName: 'RealTag' })).rejects.toThrow(/TEST GUARD/);
    }));

  it('delete resolves a __test- prefixed tagName', () =>
    withGuardEnabled(async () => {
      await expect(dispatchMutation('delete/tag', { tagName: '__test-x' })).resolves.toBeDefined();
    }));

  it('merge rejects an unprefixed tagName', () =>
    withGuardEnabled(async () => {
      await expect(dispatchMutation('merge/tag', { tagName: 'RealSrc', targetTag: '__test-y' })).rejects.toThrow(
        /TEST GUARD/,
      );
    }));

  it('merge rejects an unprefixed targetTag even with a prefixed tagName', () =>
    withGuardEnabled(async () => {
      await expect(dispatchMutation('merge/tag', { tagName: '__test-x', targetTag: 'RealTgt' })).rejects.toThrow(
        /TEST GUARD/,
      );
    }));

  it('merge resolves when BOTH names are prefixed', () =>
    withGuardEnabled(async () => {
      await expect(
        dispatchMutation('merge/tag', { tagName: '__test-x', targetTag: '__test-y' }),
      ).resolves.toBeDefined();
    }));
});
