// tests/unit/contracts/ast/mutation/update-substrate.test.ts
// OMN-128 slice 4 — new substrate nodes for the update family.
import { describe, it, expect } from 'vitest';
import {
  resolveTask,
  resolveParentTask,
  resolveProjectById,
  emitStmt,
  emitProgram,
  moveTask,
  moveProject,
  callMethod,
  assignTags,
  json,
  ref,
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

  it('validator rejects an unknown mode', () => {
    const node = assignTags(ref('task'), json(['a']), 'b');
    (node as unknown as { mode: unknown }).mode = 'merge';
    expect(() =>
      validateMutationProgram({ statements: [node, return_({ ok: json(true) })], context: 'x', snippetDeps: [] }),
    ).toThrow(/mode/i);
  });

  it('emitProgram throws if remove mode is used without declaring resolveTagByPath', () => {
    const program = {
      statements: [
        assignTags(ref('task'), json(['a']), 'removed', false, undefined, 'remove'),
        return_({ ok: json(true) }),
      ],
      context: 'x',
      snippetDeps: [], // missing resolveTagByPath
    };
    expect(() => emitProgram(program)).toThrow(/resolveTagByPath/);
  });
});

describe('resolveTagByPath snippet', () => {
  it('is registered with parseTagPath dep', () => {
    expect(SNIPPETS.resolveTagByPath.deps).toEqual(['parseTagPath']);
    expect(SNIPPETS.resolveTagByPath.source).toContain('function resolveTagByPath');
  });
});
