// tests/unit/contracts/ast/mutation/update-substrate.test.ts
// OMN-128 slice 4 — new substrate nodes for the update family.
import { describe, it, expect } from 'vitest';
import {
  resolveTask,
  resolveParentTask,
  resolveProject,
  resolveProjectById,
  emitStmt,
  emitProgram,
  moveTask,
  moveProject,
  callMethod,
  assignTags,
  setProp,
  guard,
  json,
  ref,
  member,
  newExpr,
  return_,
  validateMutationProgram,
} from '../../../../../src/contracts/ast/mutation/index.js';
import { SNIPPETS } from '../../../../../src/contracts/ast/mutation/snippets.js';

describe('resolveTask node (generalizes resolveParentTask)', () => {
  it('factory builds the typed node', () => {
    expect(resolveTask('task', 'abc123')).toEqual({ type: 'resolveTask', bind: 'task', ref: 'abc123' });
  });

  it('resolveParentTask remains as an alias producing the same node', () => {
    expect(resolveParentTask('parentTask', 'p1')).toEqual({ type: 'resolveTask', bind: 'parentTask', ref: 'p1' });
  });

  it('emits Task.byIdentifier with JSON-quoted ref', () => {
    expect(emitStmt(resolveTask('task', 'abc"123'))).toBe('const task = Task.byIdentifier("abc\\"123") || null;');
  });
});

describe('resolveProjectById node (strict, no name fallback)', () => {
  it('factory builds the typed node', () => {
    expect(resolveProjectById('proj', 'pid1')).toEqual({ type: 'resolveProjectById', bind: 'proj', ref: 'pid1' });
  });

  it('emits Project.byIdentifier ONLY — no flattenedProjects name fallback', () => {
    const emitted = emitStmt(resolveProjectById('proj', 'pid1'));
    expect(emitted).toBe('const proj = Project.byIdentifier("pid1") || null;');
    expect(emitted).not.toContain('flattenedProjects');
  });
});

describe('moveTask node', () => {
  it('emits inbox.beginning for inboxBeginning', () => {
    expect(emitStmt(moveTask(ref('task'), { kind: 'inboxBeginning' }))).toBe('moveTasks([task], inbox.beginning);');
  });

  it('emits project.beginning for projectBeginning', () => {
    expect(emitStmt(moveTask(ref('task'), { kind: 'projectBeginning', var: 'targetProject' }))).toBe(
      'moveTasks([task], targetProject.beginning);',
    );
  });

  it('emits parent.ending for parentEnding', () => {
    expect(emitStmt(moveTask(ref('task'), { kind: 'parentEnding', var: 'parentTask' }))).toBe(
      'moveTasks([task], parentTask.ending);',
    );
  });

  it('emits the containingProject-or-inbox ternary for containerRoot', () => {
    expect(emitStmt(moveTask(ref('task'), { kind: 'containerRoot', taskVar: 'task' }))).toBe(
      'moveTasks([task], task.containingProject ? task.containingProject.beginning : inbox.beginning);',
    );
  });

  it('bestEffort wraps in try/catch recording a labeled warning', () => {
    const emitted = emitStmt(moveTask(ref('task'), { kind: 'inboxBeginning' }, true, 'move'));
    expect(emitted).toMatch(/^try \{ moveTasks/);
    expect(emitted).toContain('_warnings.push("move"');
  });
});

describe('moveProject node', () => {
  it('emits library.beginning for libraryBeginning', () => {
    expect(emitStmt(moveProject(ref('proj'), { kind: 'libraryBeginning' }))).toBe(
      'moveSections([proj], library.beginning);',
    );
  });

  it('emits folder.beginning for folderBeginning', () => {
    expect(emitStmt(moveProject(ref('proj'), { kind: 'folderBeginning', var: 'targetFolder' }))).toBe(
      'moveSections([proj], targetFolder.beginning);',
    );
  });

  it('bestEffort wraps moveProject recording a labeled warning', () => {
    const emitted = emitStmt(moveProject(ref('proj'), { kind: 'libraryBeginning' }, true, 'folder'));
    expect(emitted).toMatch(/^try \{ moveSections/);
    expect(emitted).toContain('_warnings.push("folder"');
  });
});

describe('callMethod node', () => {
  it('emits a method call with emitted args', () => {
    expect(emitStmt(callMethod(ref('task'), 'markComplete', [newExpr('Date', [])]))).toBe(
      'task.markComplete(new Date());',
    );
  });

  it('emits drop with boolean + date args', () => {
    expect(emitStmt(callMethod(ref('task'), 'drop', [json(true), newExpr('Date', [])]))).toBe(
      'task.drop(true, new Date());',
    );
  });

  it('bestEffort wraps with the label', () => {
    const emitted = emitStmt(callMethod(ref('task'), 'markComplete', [newExpr('Date', [])], true, 'status'));
    expect(emitted).toMatch(/^try \{ task\.markComplete/);
    expect(emitted).toContain('_warnings.push("status"');
  });

  it('validator rejects a method outside the allowlist', () => {
    const program = {
      statements: [callMethod(ref('task'), 'deleteObject', []), return_({ ok: json(true) })],
      context: 'update_task',
      snippetDeps: [],
    };
    expect(() => validateMutationProgram(program)).toThrow(/allowlist/i);
  });

  it('validator rejects an untyped moveTask position', () => {
    const node = moveTask(ref('task'), { kind: 'inboxBeginning' });
    (node as unknown as { position: unknown }).position = 'inbox';
    expect(() =>
      validateMutationProgram({ statements: [node, return_({ ok: json(true) })], context: 'x', snippetDeps: [] }),
    ).toThrow(/typed.*position/i);
  });
});

describe('assignTags modes', () => {
  it('default (no mode) emits the create behavior unchanged — create-or-find, no clearTags', () => {
    const emitted = emitStmt(assignTags(ref('task'), json(['a']), 'applied'));
    expect(emitted).toContain('resolveOrCreateTagByPath');
    expect(emitted).not.toContain('clearTags');
  });

  it('replace mode prepends clearTags() inside the best-effort wrap', () => {
    const emitted = emitStmt(assignTags(ref('task'), json(['a']), 'applied', true, 'tags', 'replace'));
    expect(emitted).toContain('task.clearTags();');
    // clearTags participates in the same try as the loop (legacy: whole tag block best-effort)
    expect(emitted.indexOf('try {')).toBeLessThan(emitted.indexOf('task.clearTags()'));
    // ... and PRECEDES the loop (a mutant emitting clearTags after the block must fail)
    expect(emitted.indexOf('task.clearTags()')).toBeLessThan(emitted.indexOf('for (const _tagName'));
    // ... and the loop is the create-or-find ADD loop, not the remove loop
    expect(emitted).toContain('resolveOrCreateTagByPath');
    expect(emitted).toContain('.addTag(');
  });

  it("explicit 'add' mode emits identically to the absent-mode form", () => {
    const explicit = emitStmt(assignTags(ref('task'), json(['a']), 'applied', false, undefined, 'add'));
    const absent = emitStmt(assignTags(ref('task'), json(['a']), 'applied'));
    expect(explicit).toBe(absent);
  });

  it('replace with [] emits clearTags and an empty loop (truthy-empty-array legacy semantics)', () => {
    const emitted = emitStmt(assignTags(ref('task'), json([]), 'applied', true, 'tags', 'replace'));
    expect(emitted).toContain('task.clearTags();');
  });

  it('remove mode resolves WITHOUT creating and calls removeTag', () => {
    const emitted = emitStmt(assignTags(ref('task'), json(['a']), 'removed', true, 'tags', 'remove'));
    expect(emitted).toContain('resolveTagByPath');
    expect(emitted).not.toContain('resolveOrCreateTagByPath');
    expect(emitted).not.toContain('new Tag(');
    expect(emitted).toContain('removeTag');
  });

  it('remove mode warns loudly on an unresolvable tag name (OMN-248, the OMN-136 fail-loud pattern)', () => {
    const emitted = emitStmt(assignTags(ref('task'), json(['a']), 'removed', true, 'tags', 'remove'));
    expect(emitted).toContain('else { _warnings.push("tags: tag not found — not removed: " + _tagName); }');
  });

  it('validator rejects an unknown mode', () => {
    const node = assignTags(ref('task'), json(['a']), 'b');
    (node as unknown as { mode: unknown }).mode = 'merge';
    expect(() =>
      validateMutationProgram({ statements: [node, return_({ ok: json(true) })], context: 'x', snippetDeps: [] }),
    ).toThrow(/mode/i);
  });

  it('emitProgram throws if remove mode is used without declaring its snippets', () => {
    const program = {
      statements: [
        assignTags(ref('task'), json(['a']), 'removed', false, undefined, 'remove'),
        return_({ ok: json(true) }),
      ],
      context: 'x',
      snippetDeps: [], // missing resolveTagByPath (and its parseTagPath dep)
    };
    expect(() => emitProgram(program)).toThrow(/(parseTagPath|resolveTagByPath).*not present in snippetDeps/);
  });

  it('emitProgram succeeds for remove mode when resolveTagByPath is declared (deps pull parseTagPath)', () => {
    const program = {
      statements: [
        assignTags(ref('task'), json(['a : b']), 'removed', false, undefined, 'remove'),
        return_({ ok: json(true) }),
      ],
      context: 'x',
      snippetDeps: ['resolveTagByPath'],
    };
    const emitted = emitProgram(program);
    expect(emitted).toContain('function resolveTagByPath');
    expect(emitted).toContain('function parseTagPath');
  });
});

describe('resolveTagByPath snippet', () => {
  it('is registered with parseTagPath dep', () => {
    expect(SNIPPETS.resolveTagByPath.deps).toEqual(['parseTagPath']);
    expect(SNIPPETS.resolveTagByPath.source).toContain('function resolveTagByPath');
  });
});

describe('rule 7 generalized: resolve binds need a guard before ANY consumer', () => {
  const env = { ok: json(true) };

  it('rejects a setProp consuming an unguarded resolveTask bind', () => {
    const program = {
      statements: [resolveTask('task', 't1'), setProp(ref('task'), 'name', json('x')), return_(env)],
      context: 'update_task',
      snippetDeps: [],
    };
    expect(() => validateMutationProgram(program)).toThrow(/without a guard/i);
  });

  it('rejects a moveTask position consuming an unguarded resolveProject bind', () => {
    const program = {
      statements: [
        resolveTask('task', 't1'),
        guard('task === null', { error: json(true), message: json('Task not found: t1') }),
        resolveProject('targetProject', 'P'),
        moveTask(ref('task'), { kind: 'projectBeginning', var: 'targetProject' }),
        return_(env),
      ],
      context: 'update_task',
      snippetDeps: ['resolveProjectFlexible'],
    };
    expect(() => validateMutationProgram(program)).toThrow(/targetProject.*without a guard/i);
  });

  it('rejects an envelope consuming an unguarded resolve bind', () => {
    const program = {
      statements: [resolveTask('task', 't1'), return_({ taskId: member(ref('task'), 'id.primaryKey') })],
      context: 'update_task',
      snippetDeps: [],
    };
    expect(() => validateMutationProgram(program)).toThrow(/without a guard/i);
  });

  it('rejects a callMethod consuming an unguarded resolveProjectById bind', () => {
    const program = {
      statements: [resolveProjectById('proj', 'p1'), callMethod(ref('proj'), 'markComplete', []), return_(env)],
      context: 'update_project',
      snippetDeps: [],
    };
    expect(() => validateMutationProgram(program)).toThrow(/proj.*without a guard/i);
  });

  it('accepts the guarded shape', () => {
    const program = {
      statements: [
        resolveTask('task', 't1'),
        guard('task === null', { error: json(true), message: json('Task not found: t1') }),
        setProp(ref('task'), 'name', json('x')),
        return_({ taskId: member(ref('task'), 'id.primaryKey') }),
      ],
      context: 'update_task',
      snippetDeps: [],
    };
    expect(() => validateMutationProgram(program)).not.toThrow();
  });
});

describe('rule 10: reserved binds on resolveProjectById', () => {
  it('rejects resolveProjectById binding a reserved emitter identifier', () => {
    const program = {
      statements: [resolveProjectById('_warnings', 'p1'), return_({ ok: json(true) })],
      context: 'update_project',
      snippetDeps: [],
    };
    expect(() => validateMutationProgram(program)).toThrow(/reserved/i);
  });
});
