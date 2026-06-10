// tests/unit/contracts/ast/mutation/create-folder.test.ts
// OMN-128 slice 3 — constructFolder node + create/folder lowering tests.
import { describe, it, expect } from 'vitest';
import {
  constructFolder,
  json,
  emitStmt,
  validateMutationProgram,
  return_,
  ref,
  member,
  type Program,
} from '../../../../../src/contracts/ast/mutation/index.js';

describe('constructFolder node (types + emitter)', () => {
  it('factory builds the typed node', () => {
    const node = constructFolder('f', json('Home'), { kind: 'none' });
    expect(node).toEqual({ type: 'constructFolder', bind: 'f', name: json('Home'), parent: { kind: 'none' } });
  });

  it('emits top-level construction for kind none', () => {
    expect(emitStmt(constructFolder('f', json('Home'), { kind: 'none' }))).toBe('const f = new Folder("Home");');
  });

  it('emits parented construction for kind resolved', () => {
    expect(emitStmt(constructFolder('f', json('Home'), { kind: 'resolved', var: 'targetParent' }))).toBe(
      'const f = new Folder("Home", targetParent);',
    );
  });

  it('throws at emit time for kind notFound', () => {
    expect(() => emitStmt(constructFolder('f', json('Home'), { kind: 'notFound' }))).toThrow(/notFound.*illegal/i);
  });
});

describe('constructFolder validator rules', () => {
  const wrap = (stmts: Program['statements']): Program => ({
    statements: stmts,
    context: 'create_folder',
    snippetDeps: [],
  });
  const envelope = { folderId: member(ref('f'), 'id.primaryKey') };

  it('rejects parent.kind notFound (must be guard-handled earlier)', () => {
    expect(() =>
      validateMutationProgram(wrap([constructFolder('f', json('X'), { kind: 'notFound' }), return_(envelope)])),
    ).toThrow(/notFound.*illegal/i);
  });

  it('rejects an untyped parent (string smuggled past the types)', () => {
    const node = constructFolder('f', json('X'), { kind: 'none' });
    (node as unknown as { parent: unknown }).parent = 'Personal';
    expect(() => validateMutationProgram(wrap([node, return_(envelope)]))).toThrow(/typed FolderResolution/i);
  });

  it('rejects a reserved emitter identifier as bind', () => {
    expect(() =>
      validateMutationProgram(wrap([constructFolder('_warnings', json('X'), { kind: 'none' }), return_(envelope)])),
    ).toThrow(/reserved emitter identifier/i);
  });
});
