// tests/unit/contracts/ast/mutation/create-folder.test.ts
// OMN-128 slice 3 — constructFolder node + create/folder lowering tests.
import vm from 'node:vm';
import { describe, it, expect } from 'vitest';
import {
  constructFolder,
  json,
  emitStmt,
  emitProgram,
  validateMutationProgram,
  resolveFolder,
  guard,
  return_,
  ref,
  member,
  constructProject,
  buildCreateFolderProgram,
  dispatchMutation,
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

describe('rule-7 extension: resolveFolder needs a guard before consumption', () => {
  const wrap = (stmts: Program['statements']): Program => ({
    statements: stmts,
    context: 'create_folder',
    snippetDeps: [],
  });
  const envelope = { ok: json(true) };

  it('rejects resolveFolder → constructFolder with no guard between', () => {
    expect(() =>
      validateMutationProgram(
        wrap([
          resolveFolder('p', 'Personal'),
          constructFolder('f', json('X'), { kind: 'resolved', var: 'p' }),
          return_(envelope),
        ]),
      ),
    ).toThrow(/constructFolder consumes resolution bind "p" without a guard/);
  });

  it('rejects resolveFolder → constructProject with no guard between (pre-existing gap, closed)', () => {
    expect(() =>
      validateMutationProgram(
        wrap([
          resolveFolder('p', 'Personal'),
          constructProject('proj', json('X'), { kind: 'resolved', var: 'p' }),
          return_(envelope),
        ]),
      ),
    ).toThrow(/constructProject consumes resolution bind "p" without a guard/);
  });

  it('accepts the guarded shape', () => {
    expect(() =>
      validateMutationProgram(
        wrap([
          resolveFolder('p', 'Personal'),
          guard('p === null', { error: json(true), message: json('nope'), context: json('create_folder') }),
          constructFolder('f', json('X'), { kind: 'resolved', var: 'p' }),
          return_(envelope),
        ]),
      ),
    ).not.toThrow();
  });
});

describe('buildCreateFolderProgram lowering', () => {
  it('top-level: construct + envelope, no resolve, no snippets', () => {
    const program = buildCreateFolderProgram({ name: 'Home' });
    expect(program.context).toBe('create_folder');
    expect(program.snippetDeps).toEqual([]);
    expect(program.statements.map((s) => s.type)).toEqual(['constructFolder', 'return']);
    expect(() => validateMutationProgram(program)).not.toThrow();

    const omnijs = emitProgram(program);
    expect(omnijs).toContain('const folder = new Folder("Home");');
    expect(omnijs).toContain('folderId: folder.id.primaryKey');
    expect(omnijs).toContain('parentFolder: null');
    expect(omnijs).toContain('warnings: _warnings');
    expect(omnijs).toContain('created: true');
  });

  it('nested: resolve + guard (exact legacy message) + parented construct + snippet dep', () => {
    const program = buildCreateFolderProgram({ name: 'Sub', parentFolder: 'Personal : Areas' });
    expect(program.snippetDeps).toEqual(['resolveFolderFlexible']);
    expect(program.statements.map((s) => s.type)).toEqual(['resolveFolder', 'guard', 'constructFolder', 'return']);
    expect(() => validateMutationProgram(program)).not.toThrow();

    const omnijs = emitProgram(program);
    expect(omnijs).toContain('const targetParent = resolveFolderFlexible("Personal : Areas");');
    expect(omnijs).toContain(
      'if (targetParent === null) return JSON.stringify({ error: true, message: "Parent folder not found: Personal : Areas", context: "create_folder" });',
    );
    expect(omnijs).toContain('const folder = new Folder("Sub", targetParent);');
    expect(omnijs).toContain('parentFolder: targetParent.name');
    // Transitive snippet assembly: the flexible resolver pulls its path helpers.
    expect(omnijs).toContain('function parseFolderPath');
    expect(omnijs).toContain('function resolveFolderPath');
    expect(omnijs).toContain('function resolveFolderFlexible');
  });

  it('user data is JSON-encoded, never spliced (a quote in the name cannot escape)', () => {
    const program = buildCreateFolderProgram({ name: 'He said "hi" \\ `tick`' });
    const omnijs = emitProgram(program);
    expect(omnijs).toContain(JSON.stringify('He said "hi" \\ `tick`'));
  });
});

describe('dispatchMutation create/folder guard (OMN-119/120 non-bypass)', () => {
  it('rejects a non-sandbox folder create when the sandbox guard is enabled', async () => {
    const prev = { NODE_ENV: process.env.NODE_ENV, SG: process.env.SANDBOX_GUARD_ENABLED };
    process.env.NODE_ENV = 'test';
    process.env.SANDBOX_GUARD_ENABLED = 'true';
    try {
      await expect(dispatchMutation('create/folder', { name: 'Rogue', parentFolder: 'Personal' })).rejects.toThrow(
        /TEST GUARD/,
      );
    } finally {
      process.env.NODE_ENV = prev.NODE_ENV;
      process.env.SANDBOX_GUARD_ENABLED = prev.SG;
    }
  });
});

// EXECUTE the emitted program in a vm with stubbed OmniFocus globals — the
// layer that caught slice 1's appliedTags and slice 2's const-in-try bugs.
describe('emitted create-folder program executes (vm)', () => {
  interface FolderStub {
    name: string;
    parent: FolderStub | null;
    children: FolderStub[];
    id: { primaryKey: string };
  }

  function makeSandbox(): {
    sandbox: Record<string, unknown>;
    topLevel: FolderStub[];
    flat: FolderStub[];
    constructorCalls: string[];
  } {
    const topLevel: FolderStub[] = [];
    const flat: FolderStub[] = [];
    const constructorCalls: string[] = [];
    let nextId = 1;
    const FolderCtor = function (this: FolderStub, name: string, parent?: FolderStub) {
      constructorCalls.push(name);
      this.name = name;
      this.parent = parent ?? null;
      this.children = [];
      this.id = { primaryKey: `folder-pk-${nextId++}` };
      (parent ? parent.children : topLevel).push(this);
      flat.push(this);
    } as unknown as Record<string, unknown> & { byIdentifier: (ref: string) => FolderStub | null };
    FolderCtor.byIdentifier = (refStr: string): FolderStub | null =>
      flat.find((f) => f.id.primaryKey === refStr) ?? null;
    const sandbox: Record<string, unknown> = {
      Folder: FolderCtor,
      folders: topLevel,
      flattenedFolders: flat,
    };
    return { sandbox, topLevel, flat, constructorCalls };
  }

  /** Pre-seed a folder hierarchy through the same stub constructor. */
  function seed(sandbox: Record<string, unknown>, name: string, parent?: FolderStub): FolderStub {
    const FolderCtor = sandbox.Folder as new (name: string, parent?: FolderStub) => FolderStub;
    return new FolderCtor(name, parent);
  }

  it('vm A: top-level create returns the success envelope and lands at library root', () => {
    const { sandbox, topLevel } = makeSandbox();
    const program = emitProgram(buildCreateFolderProgram({ name: 'Home' }));
    const parsed = JSON.parse(vm.runInNewContext(program, sandbox) as string);

    expect(parsed.created).toBe(true);
    expect(parsed.name).toBe('Home');
    expect(parsed.folderId).toMatch(/^folder-pk-/);
    expect(parsed.parentFolder).toBeNull();
    expect(parsed.warnings).toEqual([]);
    expect(topLevel.map((f) => f.name)).toEqual(['Home']);

    // No-raw-splice check: the name must appear only JSON-encoded, never as a
    // raw identifier-like splice (e.g. `new Folder(He said` would be invalid JS).
    const raw = emitProgram(buildCreateFolderProgram({ name: 'He said "hi"' }));
    expect(raw).not.toContain('new Folder(He said');
  });

  it('vm B: nested create resolves the parent by name and appends at the END of its children', () => {
    const { sandbox } = makeSandbox();
    const parent = seed(sandbox, 'Personal');
    seed(sandbox, 'Existing Sibling', parent);

    const program = emitProgram(buildCreateFolderProgram({ name: 'Sub', parentFolder: 'Personal' }));
    const parsed = JSON.parse(vm.runInNewContext(program, sandbox) as string);

    expect(parsed.created).toBe(true);
    expect(parsed.parentFolder).toBe('Personal');
    expect(parent.children.map((f) => f.name)).toEqual(['Existing Sibling', 'Sub']); // appended, not prepended
  });

  it('vm C: nested create resolves a " : " path through the seeded hierarchy', () => {
    const { sandbox } = makeSandbox();
    const top = seed(sandbox, 'Personal');
    seed(sandbox, 'Areas', top);

    const program = emitProgram(buildCreateFolderProgram({ name: 'Deep', parentFolder: 'Personal : Areas' }));
    const parsed = JSON.parse(vm.runInNewContext(program, sandbox) as string);

    expect(parsed.created).toBe(true);
    expect(parsed.parentFolder).toBe('Areas'); // resolved parent's own name, legacy-faithful
  });

  it('vm D: parent-not-found returns the error envelope and NEVER constructs a Folder', () => {
    const { sandbox, constructorCalls } = makeSandbox();
    const program = emitProgram(buildCreateFolderProgram({ name: 'Orphan', parentFolder: 'NonExistent' }));
    const parsed = JSON.parse(vm.runInNewContext(program, sandbox) as string);

    expect(parsed.error).toBe(true);
    expect(parsed.message).toBe('Parent folder not found: NonExistent');
    expect(parsed.context).toBe('create_folder');
    expect(constructorCalls).toEqual([]); // guard short-circuits before construct
  });
});
