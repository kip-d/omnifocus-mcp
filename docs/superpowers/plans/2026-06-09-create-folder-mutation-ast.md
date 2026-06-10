# OMN-128 Slice 3: create-folder on the Mutation AST — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate `buildCreateFolderScript` to the OmniJS-native mutation AST — one `constructFolder` node, one
lowering, one `MUTATION_DEFS` entry — finishing the create family.

**Architecture:** The substrate already fits: `FolderResolution`, the `resolveFolder` node, and the
`resolveFolderFlexible` snippet all shipped in slice 1. This slice adds a `constructFolder` statement node (near-clone
of `constructProject`), the `buildCreateFolderProgram` lowering, the `'create/folder'` guarded dispatch key, and extends
validator rule 7 (resolution-guard discipline) to folder resolution. The legacy JXA shell and both its
`evaluateJavascript` islands (parent lookup + the JXA→OmniJS id bridge) are deleted, not migrated.

**Tech Stack:** TypeScript, vitest (incl. `node:vm` execution tests), existing mutation-AST substrate in
`src/contracts/ast/mutation/`.

**Spec:** `docs/superpowers/specs/2026-06-09-create-folder-mutation-ast-design.md` — read it first.

**Ground rules for every task:**

- TDD: failing test first, then minimal implementation, then green, then commit.
- Unit tests: `npx vitest run <file>` for the file under work; `npm run test:unit` + `npm run build` before each commit.
- Mirror established patterns: `src/contracts/ast/mutation/defs.ts` (lowering style, exhaustiveness guard),
  `tests/unit/contracts/ast/mutation/create-task.test.ts` (golden + vm-execution pattern, dispatch-guard negative test),
  `tests/unit/contracts/ast/mutation-script-builder.test.ts` (`extractOmniJsProgram` decode helper for launcher-shape
  assertions).
- Commit messages: `type(OMN-128): subject` + `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

## File map

| File                                                       | Change                                                                                                          |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `src/contracts/ast/mutation/types.ts`                      | `ConstructFolderNode` interface, `Stmt` union member, `constructFolder` factory                                 |
| `src/contracts/ast/mutation/emitter.ts`                    | `case 'constructFolder'` in `emitStmt`                                                                          |
| `src/contracts/ast/mutation/validator.ts`                  | constructFolder rules (typed parent, notFound illegal, reserved bind); rule-7 extension to folder resolution    |
| `src/contracts/ast/mutation/defs.ts`                       | `buildCreateFolderProgram` lowering; `'create/folder'` in `MUTATION_DEFS`                                       |
| `src/contracts/ast/mutation/index.ts`                      | barrel: `buildCreateFolderProgram` (types/factories ride the existing `export *`)                               |
| `src/contracts/ast/mutation-script-builder.ts`             | export `validateFolderCreate`; `buildCreateFolderScript` → thin async AST wrapper; legacy template body deleted |
| `src/tools/unified/OmniFocusWriteTool.ts`                  | `handleFolderCreate`: `await` builder, spread `liftWarnings`                                                    |
| `tests/unit/contracts/ast/mutation/create-folder.test.ts`  | NEW — node/emitter/validator/golden/vm/guard tests                                                              |
| `tests/unit/contracts/ast/mutation-script-builder.test.ts` | rewrite `buildCreateFolderScript` describe block (async, launcher shape)                                        |
| `tests/integration/tools/unified/create-paths.test.ts`     | OMN-138: folder-create live coverage (nested create read-back; loud not-found on unguarded child server)        |

---

### Task 1: `constructFolder` node — types, emitter, validator basics

**Files:**

- Modify: `src/contracts/ast/mutation/types.ts`
- Modify: `src/contracts/ast/mutation/emitter.ts`
- Modify: `src/contracts/ast/mutation/validator.ts`
- Create: `tests/unit/contracts/ast/mutation/create-folder.test.ts`

Types, emitter, and validator land together in this task: adding the union member makes the emitter's `never` default a
compile error until its case exists, so they cannot be split across commits.

- [ ] **Step 1: Write failing tests** — create `tests/unit/contracts/ast/mutation/create-folder.test.ts`:

```ts
// tests/unit/contracts/ast/mutation/create-folder.test.ts
// OMN-128 slice 3 — constructFolder node + create/folder lowering tests.
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
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/contracts/ast/mutation/create-folder.test.ts` Expected: FAIL — `constructFolder` is not
exported (import error).

- [ ] **Step 3: Implement.** In `src/contracts/ast/mutation/types.ts`, after `ConstructTaskNode`:

```ts
export interface ConstructFolderNode {
  type: 'constructFolder';
  bind: string;
  name: Expr;
  parent: FolderResolution;
}
```

Add `ConstructFolderNode` to the `Stmt` union (after `ConstructTaskNode`). After the `constructTask` factory:

```ts
export const constructFolder = (bindVar: string, name: Expr, parent: FolderResolution): ConstructFolderNode => ({
  type: 'constructFolder',
  bind: bindVar,
  name,
  parent,
});
```

In `src/contracts/ast/mutation/emitter.ts`, after `case 'constructProject'`:

```ts
    case 'constructFolder': {
      // Near-clone of constructProject at the folder altitude. `new Folder(name,
      // parentFolder)` appends inside the parent (OmniJS position param), matching
      // the legacy `targetParent.folders.push(folder)`; omitted position = library
      // root. `const`, not `var`: folders have no batch path, so no cross-item
      // hoisting concern (contrast constructTask).
      const name = emitExpr(node.name);
      switch (node.parent.kind) {
        case 'resolved':
          return `const ${node.bind} = new Folder(${name}, ${node.parent.var});`;
        case 'none':
          return `const ${node.bind} = new Folder(${name});`;
        case 'notFound':
          throw new Error(
            'constructFolder with parent.kind="notFound" is illegal — it must be Guarded earlier (validator enforces this).',
          );
        default: {
          const _x: never = node.parent;
          throw new Error(`Unknown folder resolution: ${JSON.stringify(_x)}`);
        }
      }
    }
```

In `src/contracts/ast/mutation/validator.ts`, inside `validateStatementList` after the `constructProject` block (mirror
rules 2/3/10 — reuse the existing `FOLDER_KINDS` set):

```ts
if (stmt.type === 'constructFolder') {
  const parent = stmt.parent as unknown;
  // Rules 2/3 at the folder altitude: typed FolderResolution; notFound illegal.
  if (typeof parent !== 'object' || parent === null || !FOLDER_KINDS.has((parent as { kind?: string }).kind ?? '')) {
    throw new Error(
      'Invalid constructFolder: parent must be a typed FolderResolution object ' +
        'with kind in {resolved, none, notFound}, not a string or untyped value.',
    );
  }
  if ((parent as { kind: string }).kind === 'notFound') {
    throw new Error(
      'Invalid constructFolder: parent.kind="notFound" is illegal — ' +
        'the not-found case must be handled by a preceding guard that returns.',
    );
  }
  assertNotReserved(stmt.bind, 'constructFolder bind');
}
```

Also update the validator's doc comment (rules 2/3/10 mention constructFolder now).

- [ ] **Step 4: Run to verify green**

Run: `npx vitest run tests/unit/contracts/ast/mutation/create-folder.test.ts` → PASS. Run:
`npm run build && npm run test:unit` → clean / green (the union growth must not break other switches).

- [ ] **Step 5: Commit**

```bash
git add src/contracts/ast/mutation/types.ts src/contracts/ast/mutation/emitter.ts \
  src/contracts/ast/mutation/validator.ts tests/unit/contracts/ast/mutation/create-folder.test.ts
git commit -m "feat(OMN-128): constructFolder mutation-AST node (types, emitter, validator)"
```

---

### Task 2: Validator rule-7 extension — folder resolution joins the guard discipline

**Files:**

- Modify: `src/contracts/ast/mutation/validator.ts`
- Test: `tests/unit/contracts/ast/mutation/create-folder.test.ts`

- [ ] **Step 1: Write failing tests** (append to create-folder.test.ts):

```ts
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
    ).toThrow(/consumes resolution bind "p" without a guard/);
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
    ).toThrow(/consumes resolution bind "p" without a guard/);
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
```

- [ ] **Step 2: Run to verify failure** — the two reject cases pass validation today (rule 7 ignores `resolveFolder`),
      so the `toThrow` assertions FAIL.

- [ ] **Step 3: Implement.** In `validator.ts`, replace the rule-7 loop's resolve filter and the constructTask-only
      consumer check with a per-construct consumed-bind accessor:

```ts
// Rule 7: resolution-guard discipline, at THIS list level. A failed
// resolution (null bind) reaching `new Task` / `new Project` / `new Folder` /
// moveTasks explodes with an opaque runtime TypeError instead of a typed
// envelope — so every consumed resolution bind must be guarded between
// resolve and construct. The cond check is string-level: same trust model as
// GuardNode.cond generally. (Slice 3 widened this from constructTask-only to
// all three constructs — resolveFolder → constructProject was a pre-existing
// enforcement gap.)
const consumedBind = (construct: Stmt): string | null => {
  if (construct.type === 'constructTask' && construct.container.kind !== 'inbox') return construct.container.var;
  if (construct.type === 'constructProject' && construct.folder.kind === 'resolved') return construct.folder.var;
  if (construct.type === 'constructFolder' && construct.parent.kind === 'resolved') return construct.parent.var;
  return null;
};
for (let ri = 0; ri < statements.length; ri++) {
  const resolve = statements[ri];
  if (resolve.type !== 'resolveProject' && resolve.type !== 'resolveParentTask' && resolve.type !== 'resolveFolder')
    continue;
  // Word-boundary match, not substring: a guard on `proj` must not satisfy
  // bind `p`. Regex-escaped for safety even though binds are identifiers.
  const bindPattern = new RegExp(`\\b${resolve.bind.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
  for (let ci = 0; ci < statements.length; ci++) {
    const construct = statements[ci];
    if (consumedBind(construct) !== resolve.bind) continue;
    const guarded = statements.some((s, si) => si > ri && si < ci && s.type === 'guard' && bindPattern.test(s.cond));
    if (!guarded) {
      throw new Error(
        `Invalid mutation program: ${construct.type} consumes resolution bind "${resolve.bind}" ` +
          'without a guard between the resolve and the construct (the guard cond must mention the bind).',
      );
    }
  }
}
```

Note the error message now leads with `${construct.type}` — for constructTask programs it renders identically to the old
text, so existing rule-7 tests keep passing. Update the rule-7 doc comment at the top of the file to name the widened
coverage.

- [ ] **Step 4: Run to verify green**

Run:
`npx vitest run tests/unit/contracts/ast/mutation/create-folder.test.ts tests/unit/contracts/ast/mutation/validator.test.ts tests/unit/contracts/ast/mutation/create-project.test.ts`
→ PASS (the slice-1 lowering already guards, so no churn).

- [ ] **Step 5: Commit**

```bash
git add src/contracts/ast/mutation/validator.ts tests/unit/contracts/ast/mutation/create-folder.test.ts
git commit -m "feat(OMN-128): extend validator rule 7 to folder resolution (closes resolveFolder→construct gap)"
```

---

### Task 3: `buildCreateFolderProgram` lowering + `create/folder` dispatch + guard export

**Files:**

- Modify: `src/contracts/ast/mutation/defs.ts`
- Modify: `src/contracts/ast/mutation/index.ts`
- Modify: `src/contracts/ast/mutation-script-builder.ts` (export `validateFolderCreate` only — body swap is Task 5)
- Test: `tests/unit/contracts/ast/mutation/create-folder.test.ts`

- [ ] **Step 1: Write failing tests** (append; extend the import list with `buildCreateFolderProgram`,
      `dispatchMutation`, `emitProgram`):

```ts
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
```

- [ ] **Step 2: Run to verify failure** — `buildCreateFolderProgram` not exported.

- [ ] **Step 3: Implement.** In `mutation-script-builder.ts`: add `export` to `function validateFolderCreate`. In
      `defs.ts`: extend the `FolderCreateData` type import (from `'../../mutations.js'`) and the `validateFolderCreate`
      import; add `constructFolder` to the types import; then:

```ts
/**
 * Lower a folder-create request into a typed mutation Program (OMN-128 slice 3).
 * Statement order preserves the legacy builder: parent resolve + guard (loud
 * not-found, exact legacy message — already loud since OMN-127), construct,
 * return. The legacy JXA→OmniJS id-bridge island is deleted, not migrated:
 * folderId reads id.primaryKey directly off the fresh binding. `warnings` is
 * additive (always [] today — no best-effort statements) for one-semantics
 * uniformity across migrated create envelopes.
 */
export function buildCreateFolderProgram(data: FolderCreateData): Program {
  // Compile-time exhaustiveness guard (same discipline as the other create
  // lowerings): a new FolderCreateData field cannot be silently dropped.
  const _exhaustive: Record<keyof FolderCreateData, true> = {
    name: true,
    parentFolder: true,
  };
  void _exhaustive;

  const statements: Stmt[] = [];
  const snippetDeps: string[] = [];

  if (data.parentFolder) {
    statements.push(resolveFolder('targetParent', data.parentFolder));
    statements.push(
      guard('targetParent === null', {
        error: json(true),
        message: json('Parent folder not found: ' + data.parentFolder),
        context: json('create_folder'),
      }),
    );
    snippetDeps.push('resolveFolderFlexible');
  }

  statements.push(
    constructFolder(
      'folder',
      json(data.name),
      data.parentFolder ? { kind: 'resolved', var: 'targetParent' } : { kind: 'none' },
    ),
  );

  const envelope: Envelope = {
    folderId: member(ref('folder'), 'id.primaryKey'),
    name: member(ref('folder'), 'name'),
    parentFolder: data.parentFolder ? raw('targetParent.name') : json(null),
    warnings: ref('_warnings'),
    created: json(true),
  };
  statements.push(return_(envelope));

  return { statements, context: 'create_folder', snippetDeps };
}
```

Register in `MUTATION_DEFS` (after `'create/project'`):

```ts
  'create/folder': {
    guard: validateFolderCreate,
    build: buildCreateFolderProgram,
  } as MutationDef<FolderCreateData>,
```

Barrel (`index.ts`): add `buildCreateFolderProgram` to the `defs.js` export list (the node type and factory ride the
existing `export * from './types.js'`).

- [ ] **Step 4: Run to verify green**

Run: `npx vitest run tests/unit/contracts/ast/mutation/create-folder.test.ts` → PASS. Run:
`npm run build && npm run test:unit` → clean / green.

- [ ] **Step 5: Commit**

```bash
git add src/contracts/ast/mutation/defs.ts src/contracts/ast/mutation/index.ts \
  src/contracts/ast/mutation-script-builder.ts tests/unit/contracts/ast/mutation/create-folder.test.ts
git commit -m "feat(OMN-128): buildCreateFolderProgram lowering + guarded create/folder dispatch"
```

---

### Task 4: vm-execution tests — the emitted program actually runs

**Files:**

- Test: `tests/unit/contracts/ast/mutation/create-folder.test.ts`

No production code expected — these tests prove the emitted string executes (the layer that caught both prior
compose-time scope bugs). If a vm test fails, fix the substrate, not the test.

- [ ] **Step 1: Write the tests** (append; this task adds `import vm from 'node:vm';` to the test file's imports — do
      NOT add it earlier, an unused import fails lint on the Task 1–3 commits):

```ts
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
```

- [ ] **Step 2: Run**

Run: `npx vitest run tests/unit/contracts/ast/mutation/create-folder.test.ts` Expected: PASS (the substrate from Tasks
1–3 should execute cleanly; a failure here is a real substrate bug — debug it, do not weaken the test).

- [ ] **Step 3: Commit**

```bash
git add tests/unit/contracts/ast/mutation/create-folder.test.ts
git commit -m "test(OMN-128): vm-execution coverage for the create-folder program"
```

---

### Task 5: Swap `buildCreateFolderScript` to the AST path; delete the template body; rewrite legacy tests

**Files:**

- Modify: `src/contracts/ast/mutation-script-builder.ts`
- Modify: `tests/unit/contracts/ast/mutation-script-builder.test.ts` (the `buildCreateFolderScript` describe block,
  currently near line 1146)

- [ ] **Step 1: Rewrite the legacy describe block first (failing tests).** Every test becomes async and awaits the
      builder (a sync call would hand `.script` a Promise property read of `undefined`, not a loud failure). Replace the
      whole block with:

```ts
// OMN-128 slice 3: buildCreateFolderScript emits ONE OmniJS program from the
// mutation AST (dispatchMutation → emitProgram → wrapInLauncher) — the legacy
// JXA shell and both its evaluateJavascript islands (parent lookup + the
// JXA→OmniJS id bridge) are gone. Runtime behavior (vm execution, guard
// short-circuits) is covered in tests/unit/contracts/ast/mutation/create-folder.test.ts.
describe('buildCreateFolderScript (OMN-128 AST emission)', () => {
  it('emits the JXA launcher around a JSON-encoded OmniJS program', async () => {
    const result = await buildCreateFolderScript({ name: 'Home' });

    expect(result.script).toContain("Application('OmniFocus')");
    expect(result.script).toContain('app.evaluateJavascript(');
    expect(result.operation).toBe('create');
    expect(result.target).toBe('folder');
    expect(result.description).toBe('Create folder: Home');

    const program = extractOmniJsProgram(result.script);
    expect(program).toContain('const folder = new Folder("Home");');
    expect(program).toContain('folderId: folder.id.primaryKey');
  });

  it('nested create resolves the parent in-program via the shared flexible resolver', async () => {
    const result = await buildCreateFolderScript({ name: 'Sub', parentFolder: 'Personal' });

    const program = extractOmniJsProgram(result.script);
    expect(program).toContain('const targetParent = resolveFolderFlexible("Personal");');
    expect(program).toContain('function parseFolderPath');
    expect(program).toContain('function resolveFolderPath');
    expect(program).toContain('const folder = new Folder("Sub", targetParent);');
  });

  it('parent-not-found is a loud in-program guard with the legacy message', async () => {
    const result = await buildCreateFolderScript({ name: 'Orphan', parentFolder: 'NonExistent' });

    const program = extractOmniJsProgram(result.script);
    expect(program).toContain('Parent folder not found: NonExistent');
    expect(program).toContain('if (targetParent === null) return JSON.stringify(');
  });

  it('generates syntactically valid JavaScript', async () => {
    const result = await buildCreateFolderScript({ name: 'Test Folder', parentFolder: 'Parent : Child' });

    // Syntax-only validation: Function(body) parses but does not execute — for
    // both the launcher and the decoded OmniJS program.
    expect(() => Function(result.script)).not.toThrow();
    expect(() => Function(extractOmniJsProgram(result.script))).not.toThrow();
  });
});
```

(The legacy "includes folder ID bridging logic" test is deleted outright — the bridge it asserts is the thing this slice
removes.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/contracts/ast/mutation-script-builder.test.ts` Expected: FAIL — builder is still
sync/template (`await` on non-Promise is harmless, but the launcher-shape `extractOmniJsProgram` extraction throws on
the legacy template).

- [ ] **Step 3: Swap the builder.** Replace `buildCreateFolderScript`'s entire body in `mutation-script-builder.ts`
      with:

```ts
/**
 * Build a JXA script for creating a folder.
 * Supports:
 * - Top-level folders (no parentFolder)
 * - Nested folders (parentFolder by name, path " : " or "/", or ID)
 */
export async function buildCreateFolderScript(data: FolderCreateData): Promise<GeneratedMutationScript> {
  // Emit from the mutation AST. dispatchMutation runs the build-time sandbox
  // guard (validateFolderCreate) BEFORE building, so it can never be bypassed;
  // the emitter produces ONE OmniJS program (native `new Folder(...)`, parent
  // resolved in-program with a loud not-found guard) wrapped in a data-free JXA
  // launcher. The old template-string body — a JXA shell with two
  // evaluateJavascript islands (parent lookup + the JXA→OmniJS id bridge) — is
  // gone (OMN-128). Async because dispatchMutation awaits its (possibly async)
  // sandbox guard.
  const program = await dispatchMutation('create/folder', data);
  validateMutationProgram(program);
  const omnijs = emitProgram(program);
  const script = wrapInLauncher(omnijs, program.context);

  return {
    script: script.trim(),
    operation: 'create',
    target: 'folder',
    description: `Create folder: ${data.name}`,
  };
}
```

Note: the direct `validateFolderCreate(data)` call inside the old body is gone — the guard now runs at dispatch (the
non-bypass chokepoint). Do NOT delete the `OMNIJS_PARSE_FOLDER_PATH` / `OMNIJS_RESOLVE_FOLDER_PATH` /
`OMNIJS_RESOLVE_FOLDER_FLEXIBLE` consts — the update builders still interpolate them (their migration is slice 4+).

- [ ] **Step 4: Run to verify green**

Run: `npx vitest run tests/unit/contracts/ast/mutation-script-builder.test.ts` → PASS. Run: `npm run build` → expect ONE
compile error at the call site: `handleFolderCreate` still reads `generatedScript.script` off what is now a
`Promise<GeneratedMutationScript>`. That error is the seam surfacing at compile time — deliberate. The build is broken
between this step and Step 5; do NOT commit in that window. If the build is clean instead, STOP and check the call site
really awaits.

- [ ] **Step 5: Fix the call site (minimal `await` only — the warnings plumbing is Task 6's separate commit).** In
      `src/tools/unified/OmniFocusWriteTool.ts` `handleFolderCreate`:

```ts
const generatedScript = await buildCreateFolderScript(folderData);
```

Run: `npm run build && npm run test:unit` → clean / green.

- [ ] **Step 6: Commit**

```bash
git add src/contracts/ast/mutation-script-builder.ts src/tools/unified/OmniFocusWriteTool.ts \
  tests/unit/contracts/ast/mutation-script-builder.test.ts
git commit -m "feat(OMN-128): buildCreateFolderScript emits from the mutation AST; legacy template body deleted"
```

---

### Task 6: Tool layer — warnings pass-through

**Files:**

- Modify: `src/tools/unified/OmniFocusWriteTool.ts` (`handleFolderCreate` success response)

- [ ] **Step 1: Apply the create-task/create-project precedent.** In `handleFolderCreate`'s success return:

```ts
return createSuccessResponseV2(
  'omnifocus_write',
  { folder: result.data, operation: 'create_folder', ...liftWarnings(result.data) },
  undefined,
  {
    ...timer.toMetadata(),
    operation: 'create_folder',
  },
);
```

(`liftWarnings` returns `{}` when warnings are empty/missing, so the happy path is byte-identical to today's response.
Folder creates have no best-effort statements yet — this is uniformity plumbing, spec §3.)

- [ ] **Step 2: Verify**

Run: `npm run build && npm run test:unit` → clean / green. `npx eslint src/` (or `npm run lint`) → 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/tools/unified/OmniFocusWriteTool.ts
git commit -m "feat(OMN-128): create_folder response lifts OMN-137 warnings (uniform create envelope)"
```

---

### Task 7: OMN-138 — live integration coverage for folder creation

**Files:**

- Modify: `tests/integration/tools/unified/create-paths.test.ts`

Two live behaviors the unit suite cannot prove: (a) a real nested create persists parentage in real OmniFocus, (b) the
loud not-found guard fires at the real seam and creates nothing. Follow the suite's existing harness exactly —
run-scoped names, per-id cleanup where possible, the unguarded-child-server pattern for the not-found probe (its long
header comment explains why the guarded server masks the script-level guard).

- [ ] **Step 1: Add fixtures + two tests.** Fixture names near the existing ones:

```ts
const FOLDER_NAME = runScopedName(`${OMN138_MARKER}_folder_${TS}`);
const BOGUS_PARENT = `__TEST__ Nonexistent Parent ${OMN138_MARKER} ${TS}`;
```

Test 4 (guarded server — sandbox parent passes `validateFolderCreate`):

```ts
// ── 4. Folder create (OMN-128 slice 3): nested create persists parentage ─
it('creates a folder under the sandbox and the parentage persists on read-back', async () => {
  const res = await client.callTool('omnifocus_write', {
    mutation: {
      operation: 'create_folder',
      data: { name: FOLDER_NAME, parentFolder: SANDBOX_FOLDER_NAME },
    },
  });
  expectOk(res, 'sandbox folder create');
  const folderId = res.data?.folder?.folderId;
  expect(folderId, `created folder id (response: ${JSON.stringify(res.data).slice(0, 300)})`).toBeTruthy();
  expect(res.data.folder.parentFolder).toBe(SANDBOX_FOLDER_NAME);
  // Clean create: no lifted warnings (OMN-137 lifts only when non-empty).
  expect(res.data.warnings).toBeUndefined();

  // Independent read-back — never trust the write response's own echo.
  const read = await client.callTool('omnifocus_read', { query: { type: 'folders' } });
  expectOk(read, 'folders read-back');
  const folders = read.data?.folders ?? [];
  const created = folders.find((f: any) => f.id === folderId);
  expect(created, `folder ${folderId} not found on read-back`).toBeTruthy();
  expect(created.path ?? created.name).toContain(FOLDER_NAME);
  // No per-id folder delete op exists; the folder lives inside the sandbox,
  // so afterAll's fullCleanup() cascade removes it (residue assertion guards).
}, 120000);
```

(`SANDBOX_FOLDER_NAME` — import it from the sandbox-manager helper alongside the existing imports; check its actual
export name in `tests/integration/helpers/sandbox-manager.ts` first.)

Test 5 (unguarded child server — same pattern as the existing not-found test, with the same env shape incl.
`OMNIFOCUS_MCP_DISABLE_FAILURE_LOG: '1'`):

```ts
// ── 5. Folder create: loud parent-not-found, nothing created ─────────────
it('folder create with nonexistent parent errors loudly and creates nothing', async () => {
  const env: Record<string, string | undefined> = {
    ...process.env,
    NODE_ENV: 'development',
    OMNIFOCUS_MCP_DISABLE_FAILURE_LOG: '1',
  };
  delete env.SANDBOX_GUARD_ENABLED;
  const serverPath = path.join(__dirname, '../../../../dist/index.js');
  const unguarded = spawn('node', [serverPath], { stdio: ['pipe', 'pipe', 'pipe'], env });

  let res: any;
  try {
    await initializeServer(unguarded);
    res = await callToolOn(unguarded, 'omnifocus_write', {
      mutation: { operation: 'create_folder', data: { name: FOLDER_NAME + '-orphan', parentFolder: BOGUS_PARENT } },
    });
  } finally {
    unguarded.kill();
  }

  expect(res.success, `expected error, got: ${JSON.stringify(res).slice(0, 300)}`).toBe(false);
  expect(JSON.stringify(res.error)).toContain('Parent folder not found');

  // Regression half: nothing was created anywhere (read on the main server).
  const read = await client.callTool('omnifocus_read', { query: { type: 'folders' } });
  expectOk(read, 'folders read-back after not-found probe');
  const ghost = (read.data?.folders ?? []).find((f: any) => String(f.name).includes('-orphan'));
  expect(ghost, `not-found probe created a folder: ${JSON.stringify(ghost)}`).toBeUndefined();
}, 120000);
```

NOTE for the implementer: the folders read path caches for 5 minutes (`folders_list_basic`). The write path invalidates
the `folders` cache on create, but the **not-found probe writes nothing and so invalidates nothing** — if an earlier
test's read primed the cache, a stale-but-correct list is fine for the ghost check (the ghost was never created). The
parentage read-back in test 4 happens after a successful create on the SAME server, which invalidated the cache — fresh
read guaranteed.

- [ ] **Step 2: Run the suite (background, never foreground — orphan class OMN-143)**

Run via Bash `run_in_background: true`: `npm run test:integration -- create-paths` Expected: all create-paths tests PASS
(existing 3 + new 2). Check `pgrep -fl vitest` is empty afterward.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/tools/unified/create-paths.test.ts
git commit -m "test(OMN-138): live folder-create coverage — nested parentage + loud not-found"
```

---

### Task 8: Gates

- [ ] `npm run build` — clean.
- [ ] `npm run test:unit` — green.
- [ ] `npm run lint` — 0 errors.
- [ ] Full `npm run test:integration` via `run_in_background` — green; verify no orphaned vitest after
      (`pgrep -fl vitest`).
- [ ] Commit anything outstanding.

---

### Task 9: Live `/verify` matrix (parent session, NOT a subagent)

Spec §5.1, summarized. Verification runs against the **worktree's built `dist/`** over stdio JSON-RPC (slice-2 lesson:
the omnifocus-dev MCP server loads the main tree's code — wrong artifact). `pgrep -fl vitest` first.

| #   | Probe                                                                                                                      | Server            |
| --- | -------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| 1   | Non-sandbox folder create refused (`TEST GUARD`), nothing created                                                          | guarded           |
| 2   | Nested create under sandbox by name; read back parent + primaryKey id; sibling pre-created → new folder at END of children | guarded           |
| 3   | Nested create under a `" : "` path (pre-create the child first)                                                            | unguarded bounded |
| 4   | Nested create by parent **id**                                                                                             | unguarded bounded |
| 5   | Bogus parent → `Parent folder not found`, zero folders created                                                             | unguarded bounded |
| 6   | Top-level create lands at library root                                                                                     | unguarded bounded |

All artifacts `__TEST__`-prefixed or sandbox-scoped; full sweep + residue check after. Record findings in the verify
notes (Obsidian, slice-2 precedent) — including the §6 insertion-position result.

---

### Task 10: Finish — PR + review gate

- [ ] Update `docs/superpowers/specs/2026-06-09-create-folder-mutation-ast-design.md` if implementation deviated.
- [ ] Push branch; open PR against `kip-d/omnifocus-mcp` main (never the upstream fork), titled
      `feat(OMN-128): slice 3 — create-folder on the mutation AST`.
- [ ] Dispatch the final `superpowers:code-reviewer` over the PR's commit range (base = freshly-fetched origin/main).
      Mutation-verify carve-out: allowed with restore-confirmation (this PR changes test shapes).
- [ ] Merge ONLY on "Safe to merge": `gh pr merge <n> --repo kip-d/omnifocus-mcp --squash --auto` (never `--admin`).
- [ ] Verify the squash SHA landed on freshly-fetched main.

---

## Out of scope (do not let tasks grow into these)

- update-task / update-project (slice 4, paired), complete, delete, batch-mixed `buildBatchScript`, bulk-delete, tag
  builders.
- OMN-129 (read-side boundary retrofit), OMN-141 (batch stopOnError flattening), OMN-142 (name filter matches notes).
- mkdir-p folder-path creation (legacy never had it; parents must exist).
- A per-id folder delete operation (would be nice for test cleanup; not this slice).
