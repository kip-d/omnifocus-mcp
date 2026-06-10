# OMN-128 Slice 4: update-task + update-project (paired) on the Mutation AST — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate `buildUpdateTaskScript` + `buildUpdateProjectScript` to the OmniJS-native mutation AST — build-time
conditional lowerings, resolve-first ordering, OMN-137 warnings, read-back envelopes — opening the update family.

**Architecture:** Per the approved spec, two per-target lowerings (`buildUpdateTaskProgram`,
`buildUpdateProjectProgram`) share update helpers (`lowerDateSetClear`, `lowerTagChanges`, scalar lowering) and new
substrate nodes: `resolveTask` (generalizes `resolveParentTask`), `resolveProjectById`, `moveTask`, `moveProject`,
`callMethod` (allowlisted), and `assignTags` modes (`replace`/`add`/`remove`). The validator gets a per-rule extraction
prep commit, then rule 7 generalizes from resolve→construct to resolve→any-consumer. All six legacy `OMNIJS_*` consts
and `buildUpdateChangesObject` lose their last consumers and are deleted.

**Tech Stack:** TypeScript, vitest (incl. `node:vm` execution tests), existing mutation-AST substrate in
`src/contracts/ast/mutation/`.

**Spec:** `docs/superpowers/specs/2026-06-10-update-task-project-mutation-ast-design.md` — read it first. Behavior
deltas (§2) are deliberate and approved: ID-only targets, resolve-first ordering, OMN-137 warnings, read-back envelopes.

**Ground rules for every task:**

- TDD: failing test first, then minimal implementation, then green, then commit.
- Unit tests: `npx vitest run <file>` for the file under work; `npm run test:unit` + `npm run build` before each commit.
- Mirror established patterns: `src/contracts/ast/mutation/defs.ts` (lowering style, exhaustiveness guard),
  `tests/unit/contracts/ast/mutation/create-task.test.ts` (golden + vm-execution pattern, dispatch-guard negative test),
  `tests/unit/contracts/ast/mutation-script-builder.test.ts` (`extractOmniJsProgram` decode helper).
- Commit messages: `type(OMN-128): subject` + `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

## File map

| File                                                         | Change                                                                                                                       |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `src/contracts/ast/mutation/validator.ts`                    | Task 1: per-rule extraction (behavior-preserving); Task 5: new-node rules + rule-7 generalization                            |
| `src/contracts/ast/mutation/types.ts`                        | Tasks 2–4: `resolveTask` rename, `ResolveProjectByIdNode`, move nodes + position unions, `CallMethodNode`, `assignTags.mode` |
| `src/contracts/ast/mutation/emitter.ts`                      | Tasks 2–4: new emit cases; assignTags mode branches                                                                          |
| `src/contracts/ast/mutation/snippets.ts`                     | Task 4: `resolveTagByPath` snippet (verbatim lift of `OMNIJS_RESOLVE_TAG_PATH`)                                              |
| `src/contracts/mutations.ts`                                 | Task 6: `sequential?: boolean` on `TaskUpdateData` (spec §3, live field)                                                     |
| `src/contracts/ast/mutation/defs.ts`                         | Tasks 6–7: shared helpers, `UpdateTaskInput`/`UpdateProjectInput`, both lowerings, `MUTATION_DEFS` entries                   |
| `src/contracts/ast/mutation/index.ts`                        | Tasks 6–7: barrel exports for the new lowerings                                                                              |
| `src/contracts/ast/mutation-script-builder.ts`               | Task 8: export the 3 guards; thin async AST wrappers; delete legacy bodies, `OMNIJS_*` consts, `buildUpdateChangesObject`    |
| `src/tools/unified/OmniFocusWriteTool.ts`                    | Task 9: `liftWarnings` on both update response paths                                                                         |
| `tests/unit/contracts/ast/mutation/update-substrate.test.ts` | NEW (Tasks 2–5) — node/emitter/validator tests for the new substrate                                                         |
| `tests/unit/contracts/ast/mutation/update-task.test.ts`      | NEW (Task 6) — golden + vm + dispatch-guard tests for update/task                                                            |
| `tests/unit/contracts/ast/mutation/update-project.test.ts`   | NEW (Task 7) — golden + vm + dispatch-guard tests for update/project                                                         |
| `tests/unit/contracts/ast/mutation-script-builder.test.ts`   | Task 8: rewrite both update describe blocks (launcher shape, async)                                                          |
| `tests/unit/tools/unified/OmniFocusWriteTool.test.ts`        | Task 9: warnings lifted on update responses                                                                                  |
| `tests/integration/tools/unified/update-paths.test.ts`       | NEW (Task 10) — OMN-138 live update coverage (sandbox-scoped, persisted read-backs)                                          |

Execution order note: Tasks 2–4 (substrate nodes) are independent of each other but all depend on Task 1 (extraction).
Task 5 (rule-7 generalization) needs the new nodes. Tasks 6–7 need 2–5. Task 8 needs 6–7. Tasks 9–10 need 8.

---

### Task 1: Validator per-rule extraction (behavior-preserving prep)

**Files:**

- Modify: `src/contracts/ast/mutation/validator.ts`

`validateStatementList` is at cognitive complexity 82 (limit 20). Extract each numbered rule into a per-rule function
BEFORE adding slice-4 rules. NO behavior change: the existing validator unit tests pass unchanged, byte-for-byte same
error messages.

- [ ] **Step 1: Run the existing validator tests to capture the green baseline**

Run: `npx vitest run tests/unit/contracts/ast/mutation/` Expected: PASS (all files). This is the baseline the refactor
must preserve.

- [ ] **Step 2: Extract per-rule functions**

Reshape `validateStatementList` into a thin loop that delegates. Keep `ValidationContext` as is. Target shape
(signatures; bodies are verbatim moves of the existing code):

```ts
function validateConstructProjectStmt(stmt: ConstructProjectNode): void; // rules 2/3/10 for constructProject
function validateConstructFolderStmt(stmt: ConstructFolderNode): void; // rules 2/3/10 for constructFolder
function validateSetPropStmt(stmt: SetPropNode): void; // rule 4
function validateConstructTaskStmt(stmt: ConstructTaskNode): void; // rule 5 + reserved bind
function validateGuardStmt(stmt: GuardNode, ctx: ValidationContext): void; // rules 6/8
function validateBatchItemStmt(stmt: BatchItemNode, ctx: ValidationContext): void; // rule 9 + recursion
function validateReservedBinds(stmt: Stmt): void; // rule 10 catch-all for bind/resolve*/assignTags
function validateResolutionGuardDiscipline(statements: Stmt[]): void; // rule 7 (list-level)
```

`validateStatementList` becomes: for each stmt, dispatch to the relevant per-rule functions (a `switch` or sequential
`if`s — keep it boring), then call `validateResolutionGuardDiscipline(statements)` once at the end. The
return-inside-batchItem check (rule 8's second half) stays inline or moves into a tiny `validateReturnStmt(stmt, ctx)` —
your choice, same message.

- [ ] **Step 3: Verify behavior preserved**

Run: `npx vitest run tests/unit/contracts/ast/mutation/ && npm run test:unit` Expected: PASS, zero test edits.

Run: `npx eslint src/contracts/ast/mutation/validator.ts` Expected: the cognitive-complexity warning on
`validateStatementList` is GONE (each extracted function under the limit).

- [ ] **Step 4: Commit**

```bash
git add src/contracts/ast/mutation/validator.ts
git commit -m "refactor(OMN-128): extract validator per-rule functions (behavior-preserving prep)"
```

---

### Task 2: `resolveTask` (rename) + `resolveProjectById` nodes

**Files:**

- Modify: `src/contracts/ast/mutation/types.ts`
- Modify: `src/contracts/ast/mutation/emitter.ts`
- Modify: `src/contracts/ast/mutation/validator.ts`
- Modify: `src/contracts/ast/mutation/defs.ts` (import only — see step 3)
- Create: `tests/unit/contracts/ast/mutation/update-substrate.test.ts`
- Modify (mechanical): `tests/unit/contracts/ast/mutation/create-task.test.ts` if it asserts the `'resolveParentTask'`
  type string

The rename is mechanical: node type string `'resolveParentTask'` → `'resolveTask'`; the `resolveParentTask` factory
survives as an alias so slice-2 lowering code reads unchanged.

- [ ] **Step 1: Write failing tests** — create `tests/unit/contracts/ast/mutation/update-substrate.test.ts`:

```ts
// tests/unit/contracts/ast/mutation/update-substrate.test.ts
// OMN-128 slice 4 — new substrate nodes for the update family.
import { describe, it, expect } from 'vitest';
import {
  resolveTask,
  resolveParentTask,
  resolveProjectById,
  emitStmt,
} from '../../../../../src/contracts/ast/mutation/index.js';

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
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/contracts/ast/mutation/update-substrate.test.ts` Expected: FAIL — `resolveTask` /
`resolveProjectById` not exported.

- [ ] **Step 3: Implement**

`types.ts`: rename the interface and type string; add the new node + factories:

```ts
export interface ResolveTaskNode {
  type: 'resolveTask';
  bind: string;
  ref: string;
}
export interface ResolveProjectByIdNode {
  type: 'resolveProjectById';
  bind: string;
  ref: string;
}
// Stmt union: replace ResolveParentTaskNode with ResolveTaskNode; add ResolveProjectByIdNode.

export const resolveTask = (bindVar: string, refStr: string): ResolveTaskNode => ({
  type: 'resolveTask',
  bind: bindVar,
  ref: refStr,
});
/** Alias retained for the slice-2 create lowerings' readability (same node). */
export const resolveParentTask = resolveTask;
export const resolveProjectById = (bindVar: string, refStr: string): ResolveProjectByIdNode => ({
  type: 'resolveProjectById',
  bind: bindVar,
  ref: refStr,
});
```

`emitter.ts`: rename `case 'resolveParentTask'` → `case 'resolveTask'` (same emission); add:

```ts
case 'resolveProjectById':
  return `const ${node.bind} = Project.byIdentifier(${JSON.stringify(node.ref)}) || null;`;
```

`validator.ts`: in the rule-7 resolve-type check and the rule-10 reserved-bind dispatch, replace `'resolveParentTask'`
with `'resolveTask'` and add `'resolveProjectById'` to both sets.

`defs.ts`: no behavior change — the `resolveParentTask` import keeps working via the alias.

Grep for stragglers: `grep -rn "resolveParentTask\|'resolveTask'" src/ tests/` — fix any test asserting the old type
string.

- [ ] **Step 4: Verify green**

Run: `npx vitest run tests/unit/contracts/ast/mutation/ && npm run test:unit && npm run build` Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A src tests
git commit -m "feat(OMN-128): resolveTask node (generalizes resolveParentTask) + strict resolveProjectById"
```

---

### Task 3: `moveTask` + `moveProject` + `callMethod` nodes

**Files:**

- Modify: `src/contracts/ast/mutation/types.ts`
- Modify: `src/contracts/ast/mutation/emitter.ts`
- Modify: `src/contracts/ast/mutation/validator.ts`
- Modify: `tests/unit/contracts/ast/mutation/update-substrate.test.ts`

- [ ] **Step 1: Write failing tests** — append to `update-substrate.test.ts`:

```ts
import {
  moveTask,
  moveProject,
  callMethod,
  json,
  ref,
  newExpr,
} from '../../../../../src/contracts/ast/mutation/index.js';

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
```

(Adjust imports at the top of the file: `emitStmt`, `validateMutationProgram`, `return_` as needed.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/contracts/ast/mutation/update-substrate.test.ts` Expected: FAIL — factories not
exported.

- [ ] **Step 3: Implement**

`types.ts`:

```ts
export type TaskMovePosition =
  | { kind: 'inboxBeginning' }
  | { kind: 'projectBeginning'; var: string }
  | { kind: 'parentEnding'; var: string }
  | { kind: 'containerRoot'; taskVar: string };

export interface MoveTaskNode {
  type: 'moveTask';
  task: Expr;
  position: TaskMovePosition;
  bestEffort?: boolean;
  label?: string;
}

export type ProjectMovePosition = { kind: 'libraryBeginning' } | { kind: 'folderBeginning'; var: string };

export interface MoveProjectNode {
  type: 'moveProject';
  project: Expr;
  position: ProjectMovePosition;
  bestEffort?: boolean;
  label?: string;
}

export interface CallMethodNode {
  type: 'callMethod';
  target: Expr;
  method: string;
  args: Expr[];
  bestEffort?: boolean;
  label?: string;
}
// Add all three to the Stmt union. Factories follow the setProp pattern
// (...(bestEffort ? { bestEffort } : {}), ...(label ? { label } : {})).
```

`emitter.ts` (positions emitted via small exhaustive switches with `never` defaults, like FolderResolution handling):

```ts
case 'moveTask': {
  const pos = emitTaskMovePosition(node.position);
  const stmt = `moveTasks([${emitExpr(node.task)}], ${pos});`;
  return node.bestEffort ? `try { ${stmt} } ${bestEffortCatch(node.label ?? 'move')}` : stmt;
}
case 'moveProject': {
  const pos = node.position.kind === 'libraryBeginning' ? 'library.beginning' : `${node.position.var}.beginning`;
  const stmt = `moveSections([${emitExpr(node.project)}], ${pos});`;
  return node.bestEffort ? `try { ${stmt} } ${bestEffortCatch(node.label ?? 'folder')}` : stmt;
}
case 'callMethod': {
  const call = `${emitExpr(node.target)}.${node.method}(${node.args.map(emitExpr).join(', ')});`;
  return node.bestEffort ? `try { ${call} } ${bestEffortCatch(node.label ?? node.method)}` : call;
}
```

with:

```ts
function emitTaskMovePosition(p: TaskMovePosition): string {
  switch (p.kind) {
    case 'inboxBeginning':
      return 'inbox.beginning';
    case 'projectBeginning':
      return `${p.var}.beginning`;
    case 'parentEnding':
      return `${p.var}.ending`;
    case 'containerRoot':
      return `${p.taskVar}.containingProject ? ${p.taskVar}.containingProject.beginning : inbox.beginning`;
    default: {
      const _x: never = p;
      throw new Error(`Unknown task move position: ${JSON.stringify(_x)}`);
    }
  }
}
```

`validator.ts` — new per-rule functions (slice-4 rules 11–13, document them in the JSDoc rule list):

```ts
export const CALL_METHOD_ALLOWLIST: readonly string[] = ['markComplete', 'drop'];

function validateMoveTaskStmt(stmt: MoveTaskNode): void {
  // Rule 11: typed position object with a known kind; non-parameterless kinds
  // require a non-empty string var/taskVar (mirrors rules 2/5).
}
function validateMoveProjectStmt(stmt: MoveProjectNode): void; // rule 11 at project altitude
function validateCallMethodStmt(stmt: CallMethodNode): void; // rule 12: method must be in CALL_METHOD_ALLOWLIST
```

- [ ] **Step 4: Verify green**

Run: `npx vitest run tests/unit/contracts/ast/mutation/ && npm run test:unit && npm run build` Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A src tests
git commit -m "feat(OMN-128): moveTask/moveProject/callMethod nodes (typed positions, allowlist, OMN-137 labels)"
```

---

### Task 4: `assignTags` modes + `resolveTagByPath` snippet

**Files:**

- Modify: `src/contracts/ast/mutation/types.ts`
- Modify: `src/contracts/ast/mutation/emitter.ts`
- Modify: `src/contracts/ast/mutation/snippets.ts`
- Modify: `src/contracts/ast/mutation/validator.ts`
- Modify: `tests/unit/contracts/ast/mutation/update-substrate.test.ts`

- [ ] **Step 1: Write failing tests** — append to `update-substrate.test.ts`:

```ts
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
});

describe('resolveTagByPath snippet', () => {
  it('is registered with parseTagPath dep', () => {
    expect(SNIPPETS.resolveTagByPath.deps).toEqual(['parseTagPath']);
    expect(SNIPPETS.resolveTagByPath.source).toContain('function resolveTagByPath');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/contracts/ast/mutation/update-substrate.test.ts` Expected: FAIL.

- [ ] **Step 3: Implement**

`snippets.ts`: lift `OMNIJS_RESOLVE_TAG_PATH` from `mutation-script-builder.ts` **verbatim** into a `resolveTagByPath`
snippet with `deps: ['parseTagPath']` (do NOT delete the legacy const yet — Task 8 does that).

`types.ts`: add to `AssignTagsNode`:

```ts
// Tag application mode (slice 4): 'add' (absent = legacy create behavior,
// create-or-find + addTag), 'replace' (clearTags() first, then add), 'remove'
// (resolve WITHOUT create, removeTag, missing names silently skipped — legacy).
mode?: 'replace' | 'add' | 'remove';
```

and a trailing optional `mode` param on the `assignTags` factory.

`emitter.ts` — `case 'assignTags'` gains mode branches. `add`/`replace`/absent reuse the existing create-or-find loop;
`replace` prepends `${target}.clearTags();` as the first line INSIDE the wrapped block; `remove` swaps the loop body:

```ts
const removeLoop = [
  `for (const _tagName of ${tags}) {`,
  '  var _segs = parseTagPath(_tagName);',
  '  var _tag;',
  '  if (_segs) { _tag = resolveTagByPath(_segs); }',
  '  else { _tag = flattenedTags.find(t => t.name === _tagName); }',
  `  if (_tag) { ${target}.removeTag(_tag); ${node.bind}.push(_tag.name); }`,
  '}',
].join('\n');
```

The `let ${node.bind} = [];` hoisted declaration stays for ALL modes (the slice-1 ReferenceError lesson).

`validator.ts`: rule 13 — `assignTags.mode`, when present, must be in `{replace, add, remove}` (extend the assignTags
handling; reserved-bind check already applies).

Note the emitter's snippet-coverage guard (`emitProgram`) catches a remove-mode program missing `resolveTagByPath` in
`snippetDeps` automatically — add one test for that:

```ts
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
```

- [ ] **Step 4: Verify green**

Run: `npx vitest run tests/unit/contracts/ast/mutation/ && npm run test:unit && npm run build` Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A src tests
git commit -m "feat(OMN-128): assignTags replace/add/remove modes + resolveTagByPath snippet"
```

---

### Task 5: Rule 7 generalization — resolve binds guarded before ANY consumer

**Files:**

- Modify: `src/contracts/ast/mutation/validator.ts`
- Modify: `tests/unit/contracts/ast/mutation/update-substrate.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
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
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/contracts/ast/mutation/update-substrate.test.ts` Expected: FAIL — the first/third tests
pass validation today (rule 7 only covers constructs).

- [ ] **Step 3: Implement** — in `validateResolutionGuardDiscipline`:

```ts
/** Collect ref names from an Expr tree. raw/json/enumRef carry none by design —
 * raw is builder-internal (same trust model as GuardNode.cond). */
function exprRefs(expr: Expr): string[] {
  switch (expr.type) {
    case 'ref':
      return [expr.name];
    case 'member':
      return exprRefs(expr.object);
    case 'new':
      return expr.args.flatMap(exprRefs);
    case 'dateExpr':
      return exprRefs(expr.value);
    default:
      return [];
  }
}

/** Refs a statement consumes (the rule-7 generalization, slice 4). */
function stmtConsumedRefs(stmt: Stmt): string[] {
  switch (stmt.type) {
    case 'setProp':
      return [
        ...exprRefs(stmt.target),
        ...(stmt.value ? exprRefs(stmt.value) : []),
        ...(stmt.mutations ?? []).flatMap((m) => exprRefs(m.value)),
      ];
    case 'assignTags':
      return [...exprRefs(stmt.target), ...exprRefs(stmt.tags)];
    case 'moveTask': {
      const positionVars =
        stmt.position.kind === 'projectBeginning' || stmt.position.kind === 'parentEnding'
          ? [stmt.position.var]
          : stmt.position.kind === 'containerRoot'
            ? [stmt.position.taskVar]
            : [];
      return [...exprRefs(stmt.task), ...positionVars];
    }
    case 'moveProject':
      return [...exprRefs(stmt.project), ...(stmt.position.kind === 'folderBeginning' ? [stmt.position.var] : [])];
    case 'callMethod':
      return [...exprRefs(stmt.target), ...stmt.args.flatMap(exprRefs)];
    case 'constructTask':
      return stmt.container.kind !== 'inbox' ? [stmt.container.var] : [];
    case 'constructProject':
      return stmt.folder.kind === 'resolved' ? [stmt.folder.var] : [];
    case 'constructFolder':
      return stmt.parent.kind === 'resolved' ? [stmt.parent.var] : [];
    case 'return':
      return Object.values(stmt.envelope).flatMap(exprRefs);
    case 'bind':
      return exprRefs(stmt.expr);
    default:
      return [];
  }
}
```

The discipline loop changes from "find consuming constructs" to "find ANY later statement whose `stmtConsumedRefs`
include the resolve bind"; resolve types are now `resolveFolder | resolveProject | resolveProjectById | resolveTask`.
Guard detection (word-boundary cond match) is unchanged. The error message keeps its shape
(`${stmt.type} consumes resolution bind "..." without a guard...`).

Existing create programs stay valid (every create lowering guards immediately after each resolve) — the full suite is
the regression check.

- [ ] **Step 4: Verify green**

Run: `npx vitest run tests/unit/contracts/ast/mutation/ && npm run test:unit && npm run build` Expected: PASS —
including all slice 1–3 tests, proving the generalization doesn't over-fire.

- [ ] **Step 5: Commit**

```bash
git add -A src tests
git commit -m "feat(OMN-128): generalize validator rule 7 to all resolve-bind consumers"
```

---

### Task 6: `update/task` lowering + shared helpers + dispatch registration

**Files:**

- Modify: `src/contracts/mutations.ts` (add `sequential?: boolean` to `TaskUpdateData` — spec §3, the field is LIVE)
- Modify: `src/contracts/ast/mutation/defs.ts`
- Modify: `src/contracts/ast/mutation/index.ts`
- Modify: `src/contracts/ast/mutation-script-builder.ts` (export `validateTaskInSandbox`, `validateTagChanges`)
- Create: `tests/unit/contracts/ast/mutation/update-task.test.ts`

- [ ] **Step 1: Write failing tests** — create `tests/unit/contracts/ast/mutation/update-task.test.ts`. Follow the
      golden + vm pattern of `create-task.test.ts`. Core cases (write them all):

```ts
// Golden: only-what-changed emission
it('rename-only update emits resolve, guard, one setProp, return — nothing else', () => {
  const program = buildUpdateTaskProgram({ taskId: 't1', changes: { name: 'New name' } });
  validateMutationProgram(program);
  const omnijs = emitProgram(program);
  expect(omnijs).toContain('const task = Task.byIdentifier("t1") || null;');
  expect(omnijs).toContain('if (task === null) return JSON.stringify({ error: true, message: "Task not found: t1", context: "update_task" });');
  expect(omnijs).toContain('task.name = "New name";');
  expect(omnijs).not.toContain('moveTasks');
  expect(omnijs).not.toContain('dueDate');
  expect(omnijs).not.toContain('addTag');
});

// Resolve-first ordering (spec §2.2): destination guards precede ALL applies
it('emits destination resolve+guard BEFORE any setProp', () => {
  const program = buildUpdateTaskProgram({ taskId: 't1', changes: { name: 'x', project: 'Work' } });
  const omnijs = emitProgram(program);
  expect(omnijs.indexOf('Project not found: Work')).toBeLessThan(omnijs.indexOf('task.name = "x";'));
  expect(omnijs.indexOf('task.name = "x";')).toBeLessThan(omnijs.indexOf('moveTasks'));
});

// Set-vs-clear, BOTH representations (spec §3 plan note)
it('dueDate: null and clearDueDate: true both emit a null assignment', () => {
  for (const changes of [{ dueDate: null }, { clearDueDate: true }] as const) {
    const omnijs = emitProgram(buildUpdateTaskProgram({ taskId: 't1', changes }));
    expect(omnijs).toContain('task.dueDate = null;');
    expect(omnijs).not.toContain('new Date');
  }
});

it('clear flag WINS over a simultaneous value (legacy clear-applied-last)', () => {
  const omnijs = emitProgram(buildUpdateTaskProgram({ taskId: 't1', changes: { dueDate: '2026-06-12 17:00', clearDueDate: true } }));
  expect(omnijs).toContain('task.dueDate = null;');
  expect(omnijs).not.toContain('new Date("2026-06-12 17:00")');
});

// estimatedMinutes: 0 sets 0 (legacy !== undefined check); clear flag wins
it('estimatedMinutes: 0 emits an assignment of 0', () => {
  const omnijs = emitProgram(buildUpdateTaskProgram({ taskId: 't1', changes: { estimatedMinutes: 0 } }));
  expect(omnijs).toContain('task.estimatedMinutes = 0;');
});

// Moves
it('project: null moves to inbox.beginning, best-effort labeled move', () => { ... });
it('parentTaskId: null emits the containerRoot ternary', () => { ... });
it('parentTaskId: "" behaves like null (legacy)', () => { ... });

// Tags: replace clears; remove resolves without create; distinct binds
it('tags + addTags + removeTags emit three mode blocks with distinct binds', () => { ... });
it('tags: [] emits clearTags with an empty loop (truthy-empty-array legacy)', () => { ... });

// Repetition
it('repetitionRule: null assigns null', () => { ... });
it('repetitionRule object lowers at build time via lowerRepetitionRule', () => { ... });

// Status
it('status completed emits task.markComplete(new Date()) best-effort labeled status', () => { ... });
it('status dropped emits task.drop(true, new Date())', () => { ... });

// Envelope
it('envelope reads back primaryKey/name/flagged and carries warnings', () => {
  const omnijs = emitProgram(buildUpdateTaskProgram({ taskId: 't1', changes: { name: 'x' } }));
  expect(omnijs).toContain('taskId: task.id.primaryKey');
  expect(omnijs).toContain('warnings: _warnings');
});

// sequential is lowered (spec §3 — live field)
it('sequential lowers to a setProp', () => {
  const omnijs = emitProgram(buildUpdateTaskProgram({ taskId: 't1', changes: { sequential: true } }));
  expect(omnijs).toContain('task.sequential = true;');
});

// vm-execution tests (mirror create-task.test.ts's vm harness):
it('vm: not-found target returns the error envelope and mutates NOTHING', () => { ... stub Task.byIdentifier → null; assert envelope.error === true and no stub setter was touched ... });
it('vm: rename-only update returns read-back envelope with empty warnings', () => { ... });
it('vm: a throwing moveTasks records a labeled warning but the update still returns success', () => { ... });
it('vm: replace mode calls clearTags before addTag', () => { ... });

// Dispatch guard (mirror create-task.test.ts's guard test):
it('dispatchMutation update/task runs the sandbox guard (test mode refuses non-sandbox task)', () => { ... });
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/contracts/ast/mutation/update-task.test.ts` Expected: FAIL — `buildUpdateTaskProgram`
does not exist.

- [ ] **Step 3: Implement in `defs.ts`**

Add `sequential?: boolean;` to `TaskUpdateData` in `src/contracts/mutations.ts` first (with the comment
`// Live on tasks (action groups): the shared update schema + sanitizer forward it — spec §3 slice 4`).

Shared helpers + lowering (complete code):

```ts
export interface UpdateTaskInput {
  taskId: string;
  changes: TaskUpdateData;
}
export interface UpdateProjectInput {
  projectId: string;
  changes: ProjectUpdateData;
}

type DateChanges = Pick<
  TaskUpdateData,
  'dueDate' | 'deferDate' | 'plannedDate' | 'clearDueDate' | 'clearDeferDate' | 'clearPlannedDate'
>;

/** Set-vs-clear date lowering shared by both update targets (spec §3): clear
 * flag or explicit null → null assignment; string → dateExpr. Clear WINS over
 * a simultaneous value (legacy applied the clear after the set). */
function lowerDateSetClear(targetVar: string, changes: DateChanges): Stmt[] {
  const stmts: Stmt[] = [];
  const fields = [
    { field: 'dueDate', clear: 'clearDueDate' },
    { field: 'deferDate', clear: 'clearDeferDate' },
    { field: 'plannedDate', clear: 'clearPlannedDate' },
  ] as const;
  for (const { field, clear } of fields) {
    if (changes[clear] === true || changes[field] === null) {
      stmts.push(setProp(ref(targetVar), field, json(null), 'direct'));
    } else if (changes[field] !== undefined) {
      stmts.push(setProp(ref(targetVar), field, dateExpr(json(changes[field])), 'dateExpr'));
    }
  }
  return stmts;
}

type TagChanges = Pick<TaskUpdateData, 'tags' | 'addTags' | 'removeTags'>;

/** Tag lowering shared by both update targets: replace (clearTags + create-or-find),
 * add (create-or-find), remove (resolve WITHOUT create). Presence-truthy like the
 * legacy checks — `tags: []` clears all. Distinct binds per mode. */
function lowerTagChanges(targetVar: string, changes: TagChanges): { statements: Stmt[]; snippetDeps: string[] } {
  const statements: Stmt[] = [];
  const snippetDeps: string[] = [];
  if (changes.tags) {
    statements.push(assignTags(ref(targetVar), json(changes.tags), 'replacedTags', true, 'tags', 'replace'));
    snippetDeps.push('resolveOrCreateTagByPath');
  }
  if (changes.addTags) {
    statements.push(assignTags(ref(targetVar), json(changes.addTags), 'addedTags', true, 'tags', 'add'));
    snippetDeps.push('resolveOrCreateTagByPath');
  }
  if (changes.removeTags) {
    statements.push(assignTags(ref(targetVar), json(changes.removeTags), 'removedTags', true, 'tags', 'remove'));
    snippetDeps.push('resolveTagByPath');
  }
  return { statements, snippetDeps };
}

/** Scalar lowering shared by both update targets. */
function lowerUpdateScalars(
  targetVar: string,
  changes: { name?: string; note?: string; flagged?: boolean; sequential?: boolean },
): Stmt[] {
  const stmts: Stmt[] = [];
  if (changes.name !== undefined) stmts.push(setProp(ref(targetVar), 'name', json(changes.name)));
  if (changes.note !== undefined) stmts.push(setProp(ref(targetVar), 'note', json(changes.note)));
  if (changes.flagged !== undefined) stmts.push(setProp(ref(targetVar), 'flagged', json(changes.flagged)));
  if (changes.sequential !== undefined) stmts.push(setProp(ref(targetVar), 'sequential', json(changes.sequential)));
  return stmts;
}
```

`buildUpdateTaskProgram` (complete code — the exhaustiveness guard lists all 19 keys):

```ts
export function buildUpdateTaskProgram(input: UpdateTaskInput): Program {
  const { taskId, changes } = input;
  const _exhaustive: Record<keyof TaskUpdateData, true> = {
    name: true,
    note: true,
    project: true,
    parentTaskId: true,
    tags: true,
    addTags: true,
    removeTags: true,
    dueDate: true,
    deferDate: true,
    plannedDate: true,
    clearDueDate: true,
    clearDeferDate: true,
    clearPlannedDate: true,
    flagged: true,
    sequential: true,
    estimatedMinutes: true,
    clearEstimatedMinutes: true,
    repetitionRule: true,
    status: true,
  };
  void _exhaustive;

  const statements: Stmt[] = [];
  const snippetDeps: string[] = [];
  const errEnv = (message: string): Envelope => ({
    error: json(true),
    message: json(message),
    context: json('update_task'),
  });

  // Resolve-first (spec §2.2): target, then every destination, each guarded —
  // a not-found reference fails LOUD with zero mutations applied.
  statements.push(resolveTask('task', taskId));
  statements.push(guard('task === null', errEnv('Task not found: ' + taskId)));

  let projectMove: TaskMovePosition | undefined;
  if (changes.project !== undefined) {
    if (changes.project === null) {
      projectMove = { kind: 'inboxBeginning' };
    } else {
      statements.push(resolveProject('targetProject', changes.project));
      statements.push(guard('targetProject === null', errEnv('Project not found: ' + changes.project)));
      snippetDeps.push('resolveProjectFlexible');
      projectMove = { kind: 'projectBeginning', var: 'targetProject' };
    }
  }

  let parentMove: TaskMovePosition | undefined;
  if (changes.parentTaskId !== undefined) {
    if (changes.parentTaskId === null || changes.parentTaskId === '') {
      parentMove = { kind: 'containerRoot', taskVar: 'task' }; // legacy: '' behaves like null
    } else {
      statements.push(resolveTask('parentTask', changes.parentTaskId));
      statements.push(guard('parentTask === null', errEnv('Parent task not found: ' + changes.parentTaskId)));
      parentMove = { kind: 'parentEnding', var: 'parentTask' };
    }
  }

  // Applies in legacy order: scalars → dates → estimatedMinutes → moves → tags → repetition → status.
  statements.push(...lowerUpdateScalars('task', changes));
  statements.push(...lowerDateSetClear('task', changes));

  if (changes.clearEstimatedMinutes) {
    statements.push(setProp(ref('task'), 'estimatedMinutes', json(null), 'direct'));
  } else if (changes.estimatedMinutes !== undefined) {
    // !== undefined, NOT truthy: update sets 0 (legacy; create drops 0 — preserved asymmetry, spec §3).
    statements.push(setProp(ref('task'), 'estimatedMinutes', json(changes.estimatedMinutes), 'direct'));
  }

  if (projectMove) statements.push(moveTask(ref('task'), projectMove, true, 'move'));
  if (parentMove) statements.push(moveTask(ref('task'), parentMove, true, 'move'));

  const tagLowering = lowerTagChanges('task', changes);
  statements.push(...tagLowering.statements);
  snippetDeps.push(...tagLowering.snippetDeps);

  if (changes.repetitionRule === null) {
    statements.push(setProp(ref('task'), 'repetitionRule', json(null), 'direct'));
  } else if (changes.repetitionRule) {
    const lowered = lowerRepetitionRule(changes.repetitionRule);
    statements.push(
      setProp(
        ref('task'),
        'repetitionRule',
        newExpr('Task.RepetitionRule', [
          json(lowered.rrule),
          json(null),
          enumRef(lowered.scheduleTypePath),
          enumRef(lowered.anchorPath),
          json(lowered.catchUp),
        ]),
        'direct',
        true,
        'repetitionRule',
      ),
    );
  }

  if (changes.status === 'completed') {
    statements.push(callMethod(ref('task'), 'markComplete', [newExpr('Date', [])], true, 'status'));
  } else if (changes.status === 'dropped') {
    statements.push(callMethod(ref('task'), 'drop', [json(true), newExpr('Date', [])], true, 'status'));
  }

  statements.push(
    return_({
      taskId: member(ref('task'), 'id.primaryKey'),
      name: member(ref('task'), 'name'),
      flagged: member(ref('task'), 'flagged'),
      updated: json(true),
      warnings: ref('_warnings'),
    }),
  );

  return { statements, context: 'update_task', snippetDeps };
}
```

Registry (in `MUTATION_DEFS`; `validateTaskInSandbox` + `validateTagChanges` exported from
`mutation-script-builder.ts`):

```ts
'update/task': {
  guard: async (d) => {
    await validateTaskInSandbox(d.taskId, 'update');
    validateTagChanges(d.changes);
  },
  build: buildUpdateTaskProgram,
} as MutationDef<UpdateTaskInput>,
```

Barrel (`index.ts`): export `buildUpdateTaskProgram` and the input types.

- [ ] **Step 4: Verify green**

Run: `npx vitest run tests/unit/contracts/ast/mutation/ && npm run test:unit && npm run build` Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A src tests
git commit -m "feat(OMN-128): update/task lowering — resolve-first, set-vs-clear, tag modes, OMN-137 warnings"
```

---

### Task 7: `update/project` lowering + dispatch registration

**Files:**

- Modify: `src/contracts/ast/mutation/defs.ts`
- Modify: `src/contracts/ast/mutation/index.ts`
- Modify: `src/contracts/ast/mutation-script-builder.ts` (export `validateProjectInSandbox`)
- Create: `tests/unit/contracts/ast/mutation/update-project.test.ts`

- [ ] **Step 1: Write failing tests** — mirror the Task 6 structure. Project-specific cases (write them all):

```ts
it('target resolves via Project.byIdentifier ONLY — name fallback dead (spec §2.1)', () => {
  const omnijs = emitProgram(buildUpdateProjectProgram({ projectId: 'p1', changes: { name: 'x' } }));
  expect(omnijs).toContain('const proj = Project.byIdentifier("p1") || null;');
  expect(omnijs).not.toContain('flattenedProjects.find');
});

it('status active emits Project.Status.Active (update supports active; create does not)', () => { ... });
it('status set is best-effort labeled status', () => { ... });
it('folder: null emits moveSections to library.beginning', () => { ... });
it('folder string resolves flexibly with loud guard BEFORE applies (Folder not found: <ref>, context update_project)', () => { ... });
it('reviewInterval lowers via readModifyReassign with build-time unit conversion', () => { ... });
it('envelope status is a READ-BACK ternary over Project.Status, not an input echo (spec §2.4)', () => {
  const omnijs = emitProgram(buildUpdateProjectProgram({ projectId: 'p1', changes: { status: 'on_hold' } }));
  expect(omnijs).toContain("proj.status === Project.Status.Active ? 'active'");
  expect(omnijs).not.toContain('"on_hold"' + ', updated'); // no echo of the requested value in the envelope
});

// vm tests:
it('vm: status failure records a labeled warning, update still succeeds, envelope status reads the LIVE value', () => { ... });
it('vm: not-found project mutates nothing and returns the error envelope', () => { ... });

// dispatch guard:
it('dispatchMutation update/project runs the sandbox guard', () => { ... });
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/contracts/ast/mutation/update-project.test.ts` Expected: FAIL.

- [ ] **Step 3: Implement** — `buildUpdateProjectProgram` (complete code):

```ts
const PROJECT_STATUS_UPDATE_ENUM: Record<string, string> = {
  active: 'Project.Status.Active',
  on_hold: 'Project.Status.OnHold',
  completed: 'Project.Status.Done',
  dropped: 'Project.Status.Dropped',
};

/** Live status read-back for the update envelope (spec §2.4) — builder-internal
 * raw (no user data), mapping Project.Status constants to the legacy lowercase
 * strings so the envelope key keeps its shape. */
const PROJECT_STATUS_READBACK =
  "proj.status === Project.Status.Active ? 'active' : " +
  "proj.status === Project.Status.OnHold ? 'on_hold' : " +
  "proj.status === Project.Status.Done ? 'completed' : 'dropped'";

export function buildUpdateProjectProgram(input: UpdateProjectInput): Program {
  const { projectId, changes } = input;
  const _exhaustive: Record<keyof ProjectUpdateData, true> = {
    name: true,
    note: true,
    folder: true,
    tags: true,
    addTags: true,
    removeTags: true,
    dueDate: true,
    deferDate: true,
    plannedDate: true,
    clearDueDate: true,
    clearDeferDate: true,
    clearPlannedDate: true,
    flagged: true,
    sequential: true,
    status: true,
    reviewInterval: true,
  };
  void _exhaustive;

  const statements: Stmt[] = [];
  const snippetDeps: string[] = [];
  const errEnv = (message: string): Envelope => ({
    error: json(true),
    message: json(message),
    context: json('update_project'),
  });

  statements.push(resolveProjectById('proj', projectId));
  statements.push(guard('proj === null', errEnv('Project not found: ' + projectId)));

  let folderMove: ProjectMovePosition | undefined;
  if (changes.folder !== undefined) {
    if (changes.folder === null) {
      folderMove = { kind: 'libraryBeginning' };
    } else {
      statements.push(resolveFolder('targetFolder', changes.folder));
      statements.push(guard('targetFolder === null', errEnv('Folder not found: ' + changes.folder)));
      snippetDeps.push('resolveFolderFlexible');
      folderMove = { kind: 'folderBeginning', var: 'targetFolder' };
    }
  }

  // Applies in legacy order: scalars → reviewInterval → dates → status → folder move → tags.
  statements.push(...lowerUpdateScalars('proj', changes));

  if (changes.reviewInterval !== undefined) {
    const { unit, steps } = reviewIntervalUnit(changes.reviewInterval);
    statements.push(
      readModifyReassign(
        ref('proj'),
        'reviewInterval',
        [
          { prop: 'steps', value: json(steps) },
          { prop: 'unit', value: json(unit) },
        ],
        true,
        'reviewInterval',
      ),
    );
  }

  statements.push(...lowerDateSetClear('proj', changes));

  if (changes.status) {
    statements.push(
      setProp(ref('proj'), 'status', enumRef(PROJECT_STATUS_UPDATE_ENUM[changes.status]), 'enum', true, 'status'),
    );
  }

  if (folderMove) statements.push(moveProject(ref('proj'), folderMove, true, 'folder'));

  const tagLowering = lowerTagChanges('proj', changes);
  statements.push(...tagLowering.statements);
  snippetDeps.push(...tagLowering.snippetDeps);

  statements.push(
    return_({
      projectId: member(ref('proj'), 'id.primaryKey'),
      name: member(ref('proj'), 'name'),
      flagged: member(ref('proj'), 'flagged'),
      status: raw(PROJECT_STATUS_READBACK),
      updated: json(true),
      warnings: ref('_warnings'),
    }),
  );

  return { statements, context: 'update_project', snippetDeps };
}
```

Registry entry mirrors update/task with `validateProjectInSandbox`. Barrel export.

- [ ] **Step 4: Verify green**

Run: `npx vitest run tests/unit/contracts/ast/mutation/ && npm run test:unit && npm run build` Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A src tests
git commit -m "feat(OMN-128): update/project lowering — strict target, status read-back, folder move, OMN-137"
```

---

### Task 8: Rewire the builders; delete the legacy bodies + OMNIJS consts

**Files:**

- Modify: `src/contracts/ast/mutation-script-builder.ts`
- Modify: `tests/unit/contracts/ast/mutation-script-builder.test.ts`

- [ ] **Step 1: Write failing tests** — rewrite the two update describe blocks in `mutation-script-builder.test.ts`
      following the slice-3 `buildCreateFolderScript` pattern (`extractOmniJsProgram` helper, launcher-shape
      assertions):

```ts
it('buildUpdateTaskScript wraps ONE OmniJS program in the data-free launcher', async () => {
  const { script, operation, target } = await buildUpdateTaskScript('t1', { name: 'x' });
  expect(operation).toBe('update');
  expect(target).toBe('task');
  expect(script).toContain('app.evaluateJavascript(');
  const program = extractOmniJsProgram(script);
  expect(program).toContain('Task.byIdentifier("t1")');
  expect(script).not.toContain('${'); // no template interpolation residue
});

it('buildUpdateProjectScript has NO name fallback in the emitted program', async () => {
  const { script } = await buildUpdateProjectScript('p1', { name: 'x' });
  expect(extractOmniJsProgram(script)).not.toContain('flattenedProjects.find');
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/contracts/ast/mutation-script-builder.test.ts` Expected: FAIL (legacy script shape).

- [ ] **Step 3: Implement** — replace both builder bodies with thin AST wrappers (slice-3 pattern):

```ts
export async function buildUpdateTaskScript(taskId: string, changes: TaskUpdateData): Promise<GeneratedMutationScript> {
  // Emit from the mutation AST. dispatchMutation runs the build-time sandbox guard
  // (validateTaskInSandbox + validateTagChanges) BEFORE building; the emitter
  // produces ONE OmniJS program — resolve-first ordering, set-vs-clear lowering,
  // OMN-137 labeled warnings — wrapped in a data-free JXA launcher. The old
  // template-string body (nested-backtick island, runtime `if (changes.x)` forest,
  // silent inbox of swallowed failures) is gone (OMN-128 slice 4).
  const program = await dispatchMutation('update/task', { taskId, changes });
  validateMutationProgram(program);
  const omnijs = emitProgram(program);
  return {
    script: wrapInLauncher(omnijs, program.context).trim(),
    operation: 'update',
    target: 'task',
    description: `Update task: ${taskId}`,
  };
}
```

(`buildUpdateProjectScript` identical at the project key.) The direct `validateTaskInSandbox`/`validateTagChanges` calls
at the top of the old bodies are REMOVED — the dispatch guard owns them now (export the three validators for `defs.ts`).

Delete (verify each with grep before deleting — `grep -n "<name>" src/ tests/ -r`):

- the two legacy template bodies
- `buildUpdateChangesObject` (last consumers were the two builders)
- ALL six `OMNIJS_*` consts (`OMNIJS_PARSE_TAG_PATH`, `OMNIJS_RESOLVE_OR_CREATE_TAG_PATH`, `OMNIJS_RESOLVE_TAG_PATH`,
  `OMNIJS_PARSE_FOLDER_PATH`, `OMNIJS_RESOLVE_FOLDER_PATH`, `OMNIJS_RESOLVE_FOLDER_FLEXIBLE`) — the update builders were
  their last interpolation sites (verified 2026-06-10); `resolveTagByPath`'s source now lives in the snippet registry
  (Task 4)
- the `SNIPPETS` import in `mutation-script-builder.ts` if the consts were its last use

- [ ] **Step 4: Verify green + full sweep**

Run:
`npx vitest run tests/unit/contracts/ast/ && npm run test:unit && npm run build && npx ts-prune | grep -i "mutation" || true`
Expected: PASS; no new orphans from this file (exported validators are consumed by defs.ts).

- [ ] **Step 5: Commit**

```bash
git add -A src tests
git commit -m "feat(OMN-128): rewire update builders to the mutation AST; delete legacy bodies + OMNIJS consts"
```

---

### Task 9: Tool layer — lift warnings on update responses

**Files:**

- Modify: `src/tools/unified/OmniFocusWriteTool.ts`
- Modify: `tests/unit/tools/unified/OmniFocusWriteTool.test.ts`

- [ ] **Step 1: Write failing tests** — mirror the slice-2 create-warnings tests in `OmniFocusWriteTool.test.ts`: mock
      `execJson` to return an update envelope containing `warnings: ['status: boom']`, assert the tool response carries
      a top-level `warnings` array; and the inverse (empty `warnings` in the envelope → NO `warnings` key in the
      response — omit-when-empty convention). Cover BOTH `update task` and `update project` mutations.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/tools/unified/OmniFocusWriteTool.test.ts` Expected: FAIL.

- [ ] **Step 3: Implement**

In `buildTaskUpdateResponse`: payload becomes `{ task: transformedResult, ...liftWarnings(parsedUpdateResult) }`. In
`handleTaskUpdate`'s `minimalResponse` branch: spread `...liftWarnings(parsedUpdateResult)` as well (a warning is
exactly what a minimal response must not drop — OMN-137). NOTE: `unwrapUpdateResult` runs before both — lift from the
unwrapped value.

In `handleProjectUpdateDirect`: the envelope is spread at the top level, which would always include `warnings: []`.
Destructure it out and lift:

```ts
const { warnings: _envelopeWarnings, ...projectData } = result.data as Record<string, unknown>;
return createSuccessResponseV2(
  'omnifocus_write',
  { operation: 'update', target: 'project', ...projectData, ...liftWarnings(result.data) },
  undefined,
  timer.toMetadata(),
);
```

Check the tool DESCRIPTION string for any mention of update-target name fallback; update if present (spec §6 — expected:
none).

- [ ] **Step 4: Verify green**

Run: `npx vitest run tests/unit/tools/unified/OmniFocusWriteTool.test.ts && npm run test:unit && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A src tests
git commit -m "feat(OMN-128): lift OMN-137 warnings on update responses (task + project, incl. minimal)"
```

---

### Task 10: OMN-138 live integration coverage for update paths

**Files:**

- Create: `tests/integration/tools/unified/update-paths.test.ts` (mirror `create-paths.test.ts`'s server/sandbox
  harness)

Sandbox-scoped (`__MCP_TEST_SANDBOX__`); read-backs assert PERSISTED values via follow-up reads, never envelope echoes
(spec §7, the slice-3 vacuous-parentage lesson).

- [ ] **Step 1: Write the tests** — coverage matrix:

| Case                                                          | Assertion (read-back, not echo)                                           |
| ------------------------------------------------------------- | ------------------------------------------------------------------------- |
| rename + flag a sandbox task                                  | follow-up read returns new name + flagged                                 |
| dueDate set then `clearDueDate`                               | read shows date, then null                                                |
| `tags: [...]` replace on a `__test-` tagged task              | read shows exactly the new tag set                                        |
| `addTags`/`removeTags`                                        | read shows union/difference                                               |
| move task to a sandbox project (`changes.project`)            | read shows containing project ID == sandbox project's id                  |
| `project: null`                                               | read shows `inInbox: true`                                                |
| update-task not-found target                                  | error envelope `Task not found:`; nothing created/changed                 |
| update-project rename + `status: on_hold`                     | project read shows status on_hold (persisted), envelope carries read-back |
| update-project not-found target (a project NAME passed as id) | error envelope `Project not found:` — the §2.1 delta, loud                |

The not-found probes run against the guarded server only if the guard permits them (it refuses non-sandbox IDs with
`TEST GUARD`); where the guard intercepts first, assert the TEST GUARD refusal instead — the unguarded-window probes
belong to the live `/verify` matrix, not this suite.

- [ ] **Step 2: Build, then run the integration suite IN THE BACKGROUND** (carry-over: NEVER a killable foreground shell
      — orphaned vitest teardowns hit live sessions; OMN-143 lock guards re-entry):

Run: `npm run build`, then `npm run test:integration` via `run_in_background: true`; poll the output file. Expected:
PASS including the new file.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/tools/unified/update-paths.test.ts
git commit -m "test(OMN-128): OMN-138 live integration coverage for update paths"
```

---

### Task 11: Full verification + live `/verify` matrix

- [ ] **Step 1: Full suites**

Run: `npm run test:unit && npm run build` — PASS. Run: `npm run test:integration` (background, as Task 10) — PASS. Run:
`pgrep -fl vitest` — EMPTY before any live probing.

- [ ] **Step 2: Live `/verify` matrix** (the external seam — mandatory; mocked tests prove wiring, not the artifact):

One-shot stdio JSON-RPC driver (`of-call.mjs` pattern from slices 2–3 — recreate in the job tmp dir, run against THIS
worktree's built `dist/`). Guarded probes (test-mode server, sandbox fixtures):

1. rename+flag+dueDate a sandbox task → follow-up read shows all three persisted
2. tag replace/add/remove on a sandbox task (`__test-` tags) → reads show exact sets; warnings empty
3. move sandbox task between sandbox projects + to inbox → containing project read-backs
4. update-project status/reviewInterval/folder within sandbox → persisted status + parent folder ID read-backs
5. forced warning: update a sandbox task with a repetition rule the API rejects (or equivalent) → success envelope with
   labeled warning, other changes persisted

Bounded unguarded window (one call per process, killed in `finally` — slice-2/3 exposure assessment):

6. not-found task id → `Task not found:` envelope, `query_time_ms` shows the script ran, nothing mutated
7. project NAME passed as update id → `Project not found:` (the §2.1 delta proven live)
8. folder move destination not-found → `Folder not found:`, project unmoved (read-back)

Cleanup: sandbox cascade delete; residue check (the slice-3 pattern).

- [ ] **Step 3: Record findings** — append a verify record note to Obsidian (`OMN-128 Slice 4 - Verify Findings`),
      update the OmniFocus task, then proceed to superpowers:finishing-a-development-branch (PR → final SAFE-gated
      review → `gh pr merge --squash --auto`).

---

## Carry-overs that bind every task

- `npm run test:integration` ONLY via background execution; `pgrep -fl vitest` before live probes (orphan class).
- Sandbox guard pre-flight is ID-only — non-sandbox/not-found live probes need the bounded unguarded window.
- Write-response echoes are NOT read-backs — every live assertion reads the persisted field.
- Folders/projects reads are name-sorted and capped — placement verifies use direct reads by ID, osascript if order
  matters.
- The reviewer mutation-verify carve-out (feedback_review_gates §4b) applies to per-task code-quality reviews here —
  test shapes change in Tasks 6–9.
