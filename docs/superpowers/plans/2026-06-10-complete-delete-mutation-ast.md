# OMN-128 Slice 5 — complete + delete on the Mutation AST: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate all five complete/delete production paths (task/project single-op, bulk task delete) onto the
OmniJS-native mutation AST, delete the two production-dead template builders and the three legacy task script files, and
close the sandbox-guard holes (OMN-120 + the unguarded single-op task paths).

**Architecture:** Two new statement nodes (`deleteObject`, `bulkDeleteItem`) extend the mutation AST; five new
`MUTATION_DEFS` entries run sandbox guards at dispatch; `buildCompleteScript`/`buildDeleteScript`/
`buildBulkDeleteTasksScript` become thin dispatch wrappers in `mutation-script-builder.ts`; the write tool's handlers
rewire onto them and simplify.

**Tech Stack:** TypeScript, vitest (golden + `node:vm` execution tests), the mutation AST substrate in
`src/contracts/ast/mutation/` (types → defs → validator → emitter).

**Spec:** `docs/superpowers/specs/2026-06-10-complete-delete-mutation-ast-design.md` — section references (§) below
point there. Read it first.

**Conventions for every task:**

- TDD: write the failing test, see it fail, implement, see it pass, commit.
- Run unit tests with `npm run test:unit -- <file>` (vitest; from the worktree root).
- `npm run build` must stay clean (run before any task that executes `dist/`).
- Commit messages: `feat(OMN-128): slice 5 — <what>` (or `test:`/`docs:`/`refactor:` prefixes as fits).
- All paths are relative to the worktree root
  (`/Users/kip/src/omnifocus-mcp/.claude/worktrees/omn-128-slice5-complete-delete`).

---

## File Structure

| File                                                                                                               | Change | Responsibility                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/contracts/ast/mutation/types.ts`                                                                              | modify | `DeleteObjectNode` + `BulkDeleteItemNode` interfaces, `Stmt` union arms, `deleteObject()` + `bulkDeleteItem()` factories                                                             |
| `src/contracts/ast/mutation/emitter.ts`                                                                            | modify | emission cases for both nodes; `_deleted`/`_errors` declaration in `emitProgram` (the `_aborted` ownership pattern)                                                                  |
| `src/contracts/ast/mutation/validator.ts`                                                                          | modify | `stmtConsumedRefs` arms (rule 7 coverage); reserved identifiers `_deleted`/`_errors` + `/^_d\d+$/`/`/^_n\d+$/`; `CALL_METHOD_ALLOWLIST` comment fix                                  |
| `src/contracts/ast/mutation/defs.ts`                                                                               | modify | five input interfaces, `lowerComplete`/`lowerDelete` shared helpers, three `build*Program` fns + bulk, five `MUTATION_DEFS` entries                                                  |
| `src/contracts/ast/mutation-script-builder.ts`                                                                     | modify | `buildCompleteScript`/`buildDeleteScript` bodies → dispatch wrappers; new `buildBulkDeleteTasksScript`; DELETE `buildBatchScript` + `buildBulkDeleteScript`                          |
| `src/contracts/ast/index.ts`                                                                                       | modify | export `buildBulkDeleteTasksScript`; drop dead exports                                                                                                                               |
| `src/tools/unified/OmniFocusWriteTool.ts`                                                                          | modify | rewire `handleTaskComplete`/`handleTaskDelete`/`handleBulkDeleteTasks`; `handleProjectComplete` completionDate; `handleProjectDelete` envelope; fix the OMN-119 comment; import list |
| `src/omnifocus/scripts/tasks/complete-task.ts`, `delete-task.ts`, `delete-tasks-bulk.ts`, `complete-tasks-bulk.ts` | DELETE | legacy unguarded scripts (injection-hazard class; the fourth is caller-less — Task 8)                                                                                                |
| `src/omnifocus/scripts/tasks.ts`                                                                                   | modify | drop the four re-exports                                                                                                                                                             |
| `tests/unit/contracts/ast/mutation/complete.test.ts`                                                               | create | golden + vm + dispatch-guard tests for both complete lowerings                                                                                                                       |
| `tests/unit/contracts/ast/mutation/delete.test.ts`                                                                 | create | golden + vm + dispatch-guard tests for single + bulk delete                                                                                                                          |
| `tests/unit/contracts/ast/mutation/validator.test.ts`, `types.test.ts`, `emitter.test.ts`                          | modify | new-node coverage                                                                                                                                                                    |
| `tests/unit/contracts/ast/mutation-script-builder.test.ts`                                                         | modify | wrapper tests updated; `buildBatchScript`/`buildBulkDeleteScript` describes + the `script structure consistency` callers + imports DELETED (Task 8)                                  |
| `tests/integration/tools/unified/complete-delete-paths.test.ts`                                                    | create | OMN-138 live coverage (sandbox-scoped)                                                                                                                                               |
| `docs/superpowers/specs/2026-06-10-update-task-project-mutation-ast-design.md`                                     | modify | riding doc minors (TWO stale "slice 5+" references — Task 9)                                                                                                                         |

---

### Task 1: `deleteObject` node (types + emitter + validator)

**Files:**

- Modify: `src/contracts/ast/mutation/types.ts`
- Modify: `src/contracts/ast/mutation/emitter.ts`
- Modify: `src/contracts/ast/mutation/validator.ts`
- Test: `tests/unit/contracts/ast/mutation/emitter.test.ts`, `tests/unit/contracts/ast/mutation/validator.test.ts`

- [ ] **Step 1: Write the failing tests**

In `emitter.test.ts`, inside the existing statement-emission describe block (follow the file's existing style):

```ts
it('emits deleteObject as a free-function call', () => {
  expect(emitStmt(deleteObject(ref('task')))).toBe('deleteObject(task);');
});
```

In `validator.test.ts`, in the rule-7 describe block (mirror an existing moveTask/callMethod rule-7 pair):

```ts
it('rule 7: deleteObject consuming an unguarded resolve bind is rejected', () => {
  const program: Program = {
    statements: [resolveTask('task', 't1'), deleteObject(ref('task')), return_({ ok: json(true) })],
    context: 'delete_task',
    snippetDeps: [],
  };
  expect(() => validateMutationProgram(program)).toThrow(/guard/i);
});

it('rule 7: deleteObject after an intervening guard passes', () => {
  const program: Program = {
    statements: [
      resolveTask('task', 't1'),
      guard('task === null', { error: json(true), message: json('Task not found: t1'), context: json('delete_task') }),
      deleteObject(ref('task')),
      return_({ deleted: json(true) }),
    ],
    context: 'delete_task',
    snippetDeps: [],
  };
  expect(() => validateMutationProgram(program)).not.toThrow();
});
```

Add `deleteObject` to each test file's imports from the mutation barrel.

- [ ] **Step 2: Run tests to verify they fail**

Run:
`npm run test:unit -- tests/unit/contracts/ast/mutation/emitter.test.ts tests/unit/contracts/ast/mutation/validator.test.ts`
Expected: FAIL — `deleteObject` is not exported.

- [ ] **Step 3: Implement the node**

`types.ts` — interface near `CallMethodNode`, factory near `callMethod`, and add `DeleteObjectNode` to the `Stmt` union:

```ts
/** deleteObject(<target>) — OmniJS free function (NOT a method; callMethod
 *  cannot express it). No binding, no bestEffort: a failed delete is a hard
 *  error — there is no partial result to preserve (spec §2.4/§4.1). */
export interface DeleteObjectNode {
  type: 'deleteObject';
  target: Expr;
}

export const deleteObject = (target: Expr): DeleteObjectNode => ({ type: 'deleteObject', target });
```

`emitter.ts` — statement case (next to `callMethod`):

```ts
case 'deleteObject':
  return `deleteObject(${emitExpr(node.target)});`;
```

`validator.ts` — `stmtConsumedRefs` arm so the generalized rule 7 covers it:

```ts
case 'deleteObject':
  return exprRefs(stmt.target);
```

While in `validator.ts`, apply the riding doc minor (§1): fix the `CALL_METHOD_ALLOWLIST` export comment so it describes
the allowlist's role without claiming present-tense callers for each method (the stale claim flagged in PR #81's final
review).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:unit -- tests/unit/contracts/ast/mutation/` Expected: PASS (whole directory — confirms no
exhaustiveness-switch break elsewhere; the emitter and `stmtConsumedRefs` both end in `never`-checked defaults, so a
missed arm is a compile error, not a runtime surprise).

- [ ] **Step 5: Commit**

```bash
git add src/contracts/ast/mutation/types.ts src/contracts/ast/mutation/emitter.ts src/contracts/ast/mutation/validator.ts tests/unit/contracts/ast/mutation/
git commit -m "feat(OMN-128): slice 5 — deleteObject statement node"
```

---

### Task 2: `bulkDeleteItem` node + emitter-owned accumulators

**Files:**

- Modify: `src/contracts/ast/mutation/types.ts`
- Modify: `src/contracts/ast/mutation/emitter.ts`
- Modify: `src/contracts/ast/mutation/validator.ts`
- Test: `tests/unit/contracts/ast/mutation/emitter.test.ts`, `tests/unit/contracts/ast/mutation/validator.test.ts`

- [ ] **Step 1: Write the failing tests**

`emitter.test.ts`:

```ts
it('emits bulkDeleteItem as a per-id resolve/capture/delete block with per-item error capture', () => {
  const out = emitStmt(bulkDeleteItem('t1', 0));
  expect(out).toContain('const _d0 = Task.byIdentifier("t1") || null;');
  expect(out).toContain('_errors.push({ taskId: "t1", error: "Task not found" });'); // §2.2: legacy bulk wording
  expect(out).toContain('const _n0 = _d0.name;'); // name captured BEFORE deleteObject
  expect(out.indexOf('const _n0')).toBeLessThan(out.indexOf('deleteObject(_d0);'));
  expect(out.indexOf('deleteObject(_d0);')).toBeLessThan(out.indexOf('_deleted.push({ id: "t1", name: _n0 });'));
  expect(out).toContain('catch (e)'); // continue-on-error: per-item try, no rethrow
});

it('emitProgram declares _deleted/_errors when the program contains bulkDeleteItem nodes', () => {
  const program: Program = {
    statements: [bulkDeleteItem('t1', 0), return_({ deleted: ref('_deleted'), errors: ref('_errors') })],
    context: 'bulk_delete_tasks',
    snippetDeps: [],
  };
  const omnijs = emitProgram(program);
  expect(omnijs).toContain('let _deleted = [];');
  expect(omnijs).toContain('let _errors = [];');
});

it('emitProgram does NOT declare _deleted/_errors for non-bulk programs', () => {
  const omnijs = emitProgram({ statements: [return_({ ok: json(true) })], context: 'x', snippetDeps: [] });
  expect(omnijs).not.toContain('_deleted');
});
```

`validator.test.ts`:

```ts
it('rule 10: _deleted/_errors and _d<i>/_n<i> are reserved emitter identifiers', () => {
  for (const name of ['_deleted', '_errors', '_d0', '_n12']) {
    const program: Program = {
      statements: [bind(name, raw('[]')), return_({ ok: json(true) })],
      context: 'x',
      snippetDeps: [],
    };
    expect(() => validateMutationProgram(program)).toThrow(/reserved/i);
  }
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
`npm run test:unit -- tests/unit/contracts/ast/mutation/emitter.test.ts tests/unit/contracts/ast/mutation/validator.test.ts`
Expected: FAIL — `bulkDeleteItem` not exported; reserved-name binds currently pass.

- [ ] **Step 3: Implement**

`types.ts`:

```ts
/** One id's delete attempt inside a bulk program (spec §4.2): resolve →
 *  not-found else capture-name → deleteObject → push to _deleted, with a
 *  per-item catch pushing to _errors (continue-on-error, legacy-faithful).
 *  Self-contained: consumes no external binds (its own resolve is internal),
 *  so rule 7 does not apply to it. The _deleted/_errors accumulators are
 *  DECLARED by emitProgram when any bulkDeleteItem is present — the _aborted
 *  ownership pattern, not a builder bind. */
export interface BulkDeleteItemNode {
  type: 'bulkDeleteItem';
  id: string;
  index: number;
}

export const bulkDeleteItem = (id: string, index: number): BulkDeleteItemNode => ({
  type: 'bulkDeleteItem',
  id,
  index,
});
```

Add to the `Stmt` union. `emitter.ts` statement case (next to `batchItem`, which documents the same ownership split):

```ts
case 'bulkDeleteItem': {
  const idLit = JSON.stringify(node.id);
  const dVar = `_d${node.index}`;
  const nVar = `_n${node.index}`;
  return [
    `const ${dVar} = Task.byIdentifier(${idLit}) || null;`,
    `if (${dVar} === null) {`,
    `  _errors.push({ taskId: ${idLit}, error: "Task not found" });`,
    `} else {`,
    `  try {`,
    `    const ${nVar} = ${dVar}.name;`,
    `    deleteObject(${dVar});`,
    `    _deleted.push({ id: ${idLit}, name: ${nVar} });`,
    `  } catch (e) {`,
    `    _errors.push({ taskId: ${idLit}, error: String(e && e.message ? e.message : e) });`,
    `  }`,
    `}`,
  ].join('\n');
}
```

In `emitProgram`, mirror the existing `hasStopOnError` block:

```ts
const hasBulkDelete = program.statements.some((s) => s.type === 'bulkDeleteItem');
```

and when true, prepend `let _deleted = [];\nlet _errors = [];` to the program body (same placement as the `_aborted`
declaration).

`validator.ts`: extend `RESERVED_EMITTER_IDENTIFIERS` with `'_deleted', '_errors'` and add patterns `/^_d\d+$/`,
`/^_n\d+$/` beside `RESERVED_ITEM_VAR_PATTERN` (update the reserved-name error message accordingly). `stmtConsumedRefs`
gets `case 'bulkDeleteItem': return [];` ONLY if the default arm doesn't already cover it — check first; the existing
`default: return []` covers it, so likely no edit. Verify the rule-10 walker visits whatever statement-name fields exist
(bulkDeleteItem binds nothing, so no walker change).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:unit -- tests/unit/contracts/ast/mutation/` Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/contracts/ast/mutation/ tests/unit/contracts/ast/mutation/
git commit -m "feat(OMN-128): slice 5 — bulkDeleteItem node + emitter-owned _deleted/_errors"
```

---

### Task 3: Complete lowerings (`complete/task`, `complete/project`)

**Files:**

- Modify: `src/contracts/ast/mutation/defs.ts`
- Create: `tests/unit/contracts/ast/mutation/complete.test.ts`

- [ ] **Step 1: Write the failing tests** (mirror `update-task.test.ts`'s golden + vm structure)

```ts
// tests/unit/contracts/ast/mutation/complete.test.ts
// OMN-128 slice 5 — golden + vm-execution tests for the complete lowerings.
import vm from 'node:vm';
import { describe, it, expect } from 'vitest';
import {
  buildCompleteTaskProgram,
  buildCompleteProjectProgram,
  validateMutationProgram,
  emitProgram,
} from '../../../../../src/contracts/ast/mutation/index.js';

describe('buildCompleteTaskProgram — golden emission', () => {
  it('emits resolve, guard, markComplete, read-back envelope — nothing else', () => {
    const program = buildCompleteTaskProgram({ taskId: 't1' });
    expect(() => validateMutationProgram(program)).not.toThrow();
    expect(program.statements.map((s) => s.type)).toEqual(['resolveTask', 'guard', 'callMethod', 'return']);
    expect(program.context).toBe('complete_task');

    const omnijs = emitProgram(program);
    expect(omnijs).toContain('const task = Task.byIdentifier("t1") || null;');
    expect(omnijs).toContain(
      'if (task === null) return JSON.stringify({ error: true, message: "Task not found: t1", context: "complete_task" });',
    );
    expect(omnijs).toContain('task.markComplete();'); // no completionDate → bare call ("now"), spec §3
    expect(omnijs).toContain('task.completionDate ? task.completionDate.toISOString() : null'); // live read-back
    expect(omnijs).not.toContain('_warnings.push'); // §2.4: no best-effort steps
  });

  it('lowers completionDate to a markComplete Date argument', () => {
    const omnijs = emitProgram(buildCompleteTaskProgram({ taskId: 't1', completionDate: '2026-06-10T16:00:00.000Z' }));
    expect(omnijs).toContain('task.markComplete(new Date("2026-06-10T16:00:00.000Z"));');
  });
});

describe('buildCompleteProjectProgram — golden emission', () => {
  it('resolves strictly by id with the entity-named guard message (§2.2 delta from bare "Not found")', () => {
    const program = buildCompleteProjectProgram({ projectId: 'p1' });
    expect(() => validateMutationProgram(program)).not.toThrow();
    const omnijs = emitProgram(program);
    expect(omnijs).toContain('const proj = Project.byIdentifier("p1") || null;');
    expect(omnijs).toContain('"Project not found: p1"');
    expect(omnijs).toContain('proj.markComplete();');
    expect(omnijs).toContain('projectId: proj.id.primaryKey'); // §2.3: no success key, live ids
    expect(omnijs).not.toContain('success');
  });
});

describe('emitted complete programs execute (vm)', () => {
  function makeSandbox(found: boolean) {
    const calls: unknown[][] = [];
    const completionDate = new Date('2026-06-10T16:00:00.000Z');
    const task = {
      id: { primaryKey: 't1' },
      name: 'Fixture',
      completionDate,
      markComplete: (...args: unknown[]) => calls.push(args),
    };
    return {
      calls,
      sandbox: { Task: { byIdentifier: () => (found ? task : null) }, JSON },
    };
  }

  it('returns the read-back envelope on success', () => {
    const { sandbox, calls } = makeSandbox(true);
    const program = emitProgram(buildCompleteTaskProgram({ taskId: 't1' }));
    const parsed = JSON.parse(vm.runInNewContext(program, sandbox) as string);
    expect(parsed).toEqual({
      taskId: 't1',
      name: 'Fixture',
      completed: true,
      completionDate: '2026-06-10T16:00:00.000Z',
    });
    expect(calls).toHaveLength(1);
  });

  it('not-found returns the typed error envelope with ZERO mutations', () => {
    const { sandbox, calls } = makeSandbox(false);
    const program = emitProgram(buildCompleteTaskProgram({ taskId: 'missing' }));
    const parsed = JSON.parse(vm.runInNewContext(program, sandbox) as string);
    expect(parsed).toEqual({ error: true, message: 'Task not found: missing', context: 'complete_task' });
    expect(calls).toHaveLength(0);
  });
});
```

(Note for the vm tests: `emitProgram` output is the bare OmniJS program — check how `update-task.test.ts` builds its vm
sandbox and follow it exactly, including any IIFE-wrapping helper it uses.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:unit -- tests/unit/contracts/ast/mutation/complete.test.ts` Expected: FAIL —
`buildCompleteTaskProgram` not exported.

- [ ] **Step 3: Implement in `defs.ts`** (new section after the update lowerings)

```ts
// =============================================================================
// LIFECYCLE LOWERINGS (slice 5) — complete + delete, single and bulk
// =============================================================================

export interface CompleteTaskInput {
  taskId: string;
  completionDate?: string | null;
}
export interface CompleteProjectInput {
  projectId: string;
  completionDate?: string | null;
}

/** Shared complete lowering (spec §4.2) — task/project differ only in the
 *  resolve node, guard message, and envelope id key. completionDate is already
 *  UTC-converted by the tool layer; absent → bare markComplete() ("now"). */
function lowerComplete(kind: 'task' | 'project', id: string, completionDate?: string | null): Program {
  const isTask = kind === 'task';
  const v = isTask ? 'task' : 'proj';
  const context = isTask ? 'complete_task' : 'complete_project';
  const statements: Stmt[] = [
    isTask ? resolveTask(v, id) : resolveProjectById(v, id),
    guard(`${v} === null`, {
      error: json(true),
      message: json(`${isTask ? 'Task' : 'Project'} not found: ${id}`),
      context: json(context),
    }),
    callMethod(ref(v), 'markComplete', completionDate ? [dateExpr(json(completionDate))] : []),
    return_({
      [isTask ? 'taskId' : 'projectId']: member(ref(v), 'id.primaryKey'),
      name: member(ref(v), 'name'),
      completed: json(true),
      // Live read-back, not an echo (spec §3). Builder-internal raw — no user data.
      completionDate: raw(`${v}.completionDate ? ${v}.completionDate.toISOString() : null`),
    }),
  ];
  return { statements, context, snippetDeps: [] };
}

export function buildCompleteTaskProgram(input: CompleteTaskInput): Program {
  const _exhaustive: Record<keyof CompleteTaskInput, true> = { taskId: true, completionDate: true };
  void _exhaustive;
  return lowerComplete('task', input.taskId, input.completionDate);
}

export function buildCompleteProjectProgram(input: CompleteProjectInput): Program {
  const _exhaustive: Record<keyof CompleteProjectInput, true> = { projectId: true, completionDate: true };
  void _exhaustive;
  return lowerComplete('project', input.projectId, input.completionDate);
}
```

Add any newly used factories (`dateExpr`, `raw`, …) to the existing `types.js` import in `defs.ts`. **Also add
`buildCompleteTaskProgram`/`buildCompleteProjectProgram` (and their input interfaces) to
`src/contracts/ast/mutation/index.ts`** — the barrel enumerates defs exports explicitly (the node factories ride
`export * from './types.js'`, but defs exports do not), and this task's tests import through the barrel.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:unit -- tests/unit/contracts/ast/mutation/complete.test.ts` Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/contracts/ast/mutation/defs.ts tests/unit/contracts/ast/mutation/complete.test.ts
git commit -m "feat(OMN-128): slice 5 — complete/task + complete/project lowerings"
```

---

### Task 4: Delete lowerings (single + bulk)

**Files:**

- Modify: `src/contracts/ast/mutation/defs.ts`
- Create: `tests/unit/contracts/ast/mutation/delete.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/contracts/ast/mutation/delete.test.ts
// OMN-128 slice 5 — golden + vm tests for single + bulk delete lowerings.
import vm from 'node:vm';
import { describe, it, expect } from 'vitest';
import {
  buildDeleteTaskProgram,
  buildDeleteProjectProgram,
  buildBulkDeleteTasksProgram,
  validateMutationProgram,
  emitProgram,
} from '../../../../../src/contracts/ast/mutation/index.js';

describe('buildDeleteTaskProgram — golden emission', () => {
  it('captures name BEFORE deleteObject and echoes the requested id (spec §3)', () => {
    const program = buildDeleteTaskProgram({ taskId: 't1' });
    expect(() => validateMutationProgram(program)).not.toThrow();
    expect(program.statements.map((s) => s.type)).toEqual(['resolveTask', 'guard', 'bind', 'deleteObject', 'return']);
    const omnijs = emitProgram(program);
    expect(omnijs.indexOf('task.name')).toBeLessThan(omnijs.indexOf('deleteObject(task);'));
    expect(omnijs).toContain('"Task not found: t1"');
    expect(omnijs).toContain('taskId: "t1"'); // deliberate echo — object unreadable post-delete
    expect(omnijs).not.toContain('success');
  });
});

describe('buildDeleteProjectProgram — golden emission', () => {
  it('strict byIdentifier resolve, entity-named message (§2.2 delta)', () => {
    const omnijs = emitProgram(buildDeleteProjectProgram({ projectId: 'p1' }));
    expect(omnijs).toContain('const proj = Project.byIdentifier("p1") || null;');
    expect(omnijs).toContain('"Project not found: p1"');
    expect(omnijs).toContain('deleteObject(proj);');
    expect(omnijs).toContain('projectId: "p1"');
  });
});

describe('buildBulkDeleteTasksProgram — golden emission', () => {
  it('unrolls one bulkDeleteItem per id plus the accumulator envelope', () => {
    const program = buildBulkDeleteTasksProgram({ taskIds: ['a', 'b', 'c'] });
    expect(() => validateMutationProgram(program)).not.toThrow();
    expect(program.statements.map((s) => s.type)).toEqual([
      'bulkDeleteItem',
      'bulkDeleteItem',
      'bulkDeleteItem',
      'return',
    ]);
    const omnijs = emitProgram(program);
    expect(omnijs).toContain('let _deleted = [];');
    expect(omnijs).toContain('"Deleted " + _deleted.length + " of " + 3 + " tasks"');
  });
});

describe('emitted delete programs execute (vm)', () => {
  it('single delete: envelope with pre-delete name; deleteObject called once', () => {
    const deleted: unknown[] = [];
    const task = { id: { primaryKey: 't1' }, name: 'Doomed' };
    const sandbox = { Task: { byIdentifier: () => task }, deleteObject: (o: unknown) => deleted.push(o), JSON };
    const parsed = JSON.parse(
      vm.runInNewContext(emitProgram(buildDeleteTaskProgram({ taskId: 't1' })), sandbox) as string,
    );
    expect(parsed).toEqual({ taskId: 't1', name: 'Doomed', deleted: true });
    expect(deleted).toEqual([task]);
  });

  it('single delete not-found: typed error, deleteObject NEVER called', () => {
    const deleted: unknown[] = [];
    const sandbox = { Task: { byIdentifier: () => null }, deleteObject: (o: unknown) => deleted.push(o), JSON };
    const parsed = JSON.parse(
      vm.runInNewContext(emitProgram(buildDeleteTaskProgram({ taskId: 'x' })), sandbox) as string,
    );
    expect(parsed).toEqual({ error: true, message: 'Task not found: x', context: 'delete_task' });
    expect(deleted).toEqual([]);
  });

  it('bulk: continue-on-error with mixed found/not-found/throwing ids', () => {
    const tasks: Record<string, { id: { primaryKey: string }; name: string }> = {
      a: { id: { primaryKey: 'a' }, name: 'A' },
      c: { id: { primaryKey: 'c' }, name: 'C' },
    };
    const deleted: string[] = [];
    const sandbox = {
      Task: { byIdentifier: (id: string) => tasks[id] ?? null },
      deleteObject: (o: { name: string }) => {
        if (o.name === 'C') throw new Error('locked');
        deleted.push(o.name);
      },
      JSON,
    };
    const parsed = JSON.parse(
      vm.runInNewContext(emitProgram(buildBulkDeleteTasksProgram({ taskIds: ['a', 'b', 'c'] })), sandbox) as string,
    );
    expect(parsed.deleted).toEqual([{ id: 'a', name: 'A' }]);
    expect(parsed.errors).toEqual([
      { taskId: 'b', error: 'Task not found' },
      { taskId: 'c', error: 'locked' },
    ]);
    expect(parsed.message).toBe('Deleted 1 of 3 tasks');
    expect(deleted).toEqual(['A']); // 'b' skipped, 'c' threw, loop continued
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:unit -- tests/unit/contracts/ast/mutation/delete.test.ts` Expected: FAIL — builders not exported.

- [ ] **Step 3: Implement in `defs.ts`**

```ts
export interface DeleteTaskInput {
  taskId: string;
}
export interface DeleteProjectInput {
  projectId: string;
}
export interface BulkDeleteTasksInput {
  taskIds: string[];
}

/** Shared single-delete lowering (spec §4.2): resolve → guard → capture name →
 *  deleteObject → envelope. The id is a deliberate echo: the object no longer
 *  exists to read (spec §3); name is captured pre-delete. */
function lowerDelete(kind: 'task' | 'project', id: string): Program {
  const isTask = kind === 'task';
  const v = isTask ? 'task' : 'proj';
  const nameVar = isTask ? 'taskName' : 'projName';
  const context = isTask ? 'delete_task' : 'delete_project';
  const statements: Stmt[] = [
    isTask ? resolveTask(v, id) : resolveProjectById(v, id),
    guard(`${v} === null`, {
      error: json(true),
      message: json(`${isTask ? 'Task' : 'Project'} not found: ${id}`),
      context: json(context),
    }),
    bind(nameVar, member(ref(v), 'name')),
    deleteObject(ref(v)),
    return_({
      [isTask ? 'taskId' : 'projectId']: json(id),
      name: ref(nameVar),
      deleted: json(true),
    }),
  ];
  return { statements, context, snippetDeps: [] };
}

export function buildDeleteTaskProgram(input: DeleteTaskInput): Program {
  const _exhaustive: Record<keyof DeleteTaskInput, true> = { taskId: true };
  void _exhaustive;
  return lowerDelete('task', input.taskId);
}

export function buildDeleteProjectProgram(input: DeleteProjectInput): Program {
  const _exhaustive: Record<keyof DeleteProjectInput, true> = { projectId: true };
  void _exhaustive;
  return lowerDelete('project', input.projectId);
}

/** Bulk task delete (spec §4.2): ids ≤ 100 by schema; per-item continue-on-error
 *  unroll; emitProgram owns the _deleted/_errors declarations. */
export function buildBulkDeleteTasksProgram(input: BulkDeleteTasksInput): Program {
  const _exhaustive: Record<keyof BulkDeleteTasksInput, true> = { taskIds: true };
  void _exhaustive;
  const statements: Stmt[] = input.taskIds.map((id, i) => bulkDeleteItem(id, i));
  statements.push(
    return_({
      deleted: ref('_deleted'),
      errors: ref('_errors'),
      // Builder-internal raw: the only interpolation is the build-time count.
      message: raw(`"Deleted " + _deleted.length + " of " + ${input.taskIds.length} + " tasks"`),
    }),
  );
  return { statements, context: 'bulk_delete_tasks', snippetDeps: [] };
}
```

Add `buildDeleteTaskProgram`/`buildDeleteProjectProgram`/`buildBulkDeleteTasksProgram` (and their input interfaces) to
the `src/contracts/ast/mutation/index.ts` barrel — same reason as Task 3 (defs exports are enumerated, and this task's
tests import through the barrel).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:unit -- tests/unit/contracts/ast/mutation/delete.test.ts` Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/contracts/ast/mutation/defs.ts tests/unit/contracts/ast/mutation/delete.test.ts
git commit -m "feat(OMN-128): slice 5 — delete/task, delete/project, bulk delete lowerings"
```

---

### Task 5: Registry entries + dispatch guards

**Files:**

- Modify: `src/contracts/ast/mutation/defs.ts` (MUTATION_DEFS)
- Modify: `src/contracts/ast/mutation/index.ts` (export the new builders/inputs if the barrel enumerates them — match
  how slice 4's exports were added)
- Test: `tests/unit/contracts/ast/mutation/complete.test.ts`, `delete.test.ts` (dispatch-guard describes)

- [ ] **Step 1: Write the failing tests** — mirror the existing
      `dispatchMutation update/task guard (OMN-119/120 non-bypass)` describe in `update-task.test.ts` EXACTLY (same
      env-var setup/teardown for test mode, same sandbox-refusal assertion shape). One describe per new key:

- `complete/task` + `delete/task` + `bulk_delete/task`: non-sandbox task id in test mode → rejects with the TEST GUARD
  error; guard runs BEFORE build (assert build not reached, as the existing tests do).
- `complete/project` + `delete/project`: same via `validateProjectInSandbox`.
- `bulk_delete/task`: one bad id among good ones rejects the whole dispatch (all-ids pre-flight, §2.1).

- [ ] **Step 2: Run to verify they fail**

Run:
`npm run test:unit -- tests/unit/contracts/ast/mutation/complete.test.ts tests/unit/contracts/ast/mutation/delete.test.ts`
Expected: FAIL — keys not in MUTATION_DEFS (TypeScript error on the key literal).

- [ ] **Step 3: Implement** — extend `MUTATION_DEFS` (after `update/project`):

```ts
  'complete/task': {
    guard: (d) => validateTaskInSandbox(d.taskId, 'complete'),
    build: buildCompleteTaskProgram,
  } as MutationDef<CompleteTaskInput>,
  'complete/project': {
    guard: (d) => validateProjectInSandbox(d.projectId, 'complete'),
    build: buildCompleteProjectProgram,
  } as MutationDef<CompleteProjectInput>,
  'delete/task': {
    guard: (d) => validateTaskInSandbox(d.taskId, 'delete'),
    build: buildDeleteTaskProgram,
  } as MutationDef<DeleteTaskInput>,
  'delete/project': {
    guard: (d) => validateProjectInSandbox(d.projectId, 'delete'),
    build: buildDeleteProjectProgram,
  } as MutationDef<DeleteProjectInput>,
  'bulk_delete/task': {
    // ALL ids pre-flight before any delete executes (spec §2.1); no-op outside test mode.
    guard: async (d) => {
      await Promise.all(d.taskIds.map((id) => validateTaskInSandbox(id, 'bulk delete')));
    },
    build: buildBulkDeleteTasksProgram,
  } as MutationDef<BulkDeleteTasksInput>,
```

- [ ] **Step 4: Run the full mutation test directory**

Run: `npm run test:unit -- tests/unit/contracts/ast/mutation/` Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/contracts/ast/mutation/ tests/unit/contracts/ast/mutation/
git commit -m "feat(OMN-128): slice 5 — five lifecycle MUTATION_DEFS entries with dispatch guards"
```

---

### Task 6: Builder wrappers in `mutation-script-builder.ts`

**Files:**

- Modify: `src/contracts/ast/mutation-script-builder.ts`
- Modify: `src/contracts/ast/index.ts`
- Test: `tests/unit/contracts/ast/mutation-script-builder.test.ts`

- [ ] **Step 1: Update the existing builder tests** — in `mutation-script-builder.test.ts`, find the
      `buildCompleteScript`/`buildDeleteScript` describes and rewrite their assertions for the new emission (mirror how
      the slice-4 wrapper tests assert: script contains the launcher, the byIdentifier resolve, the entity-named
      message; NOT the legacy `'(' +` island concatenation). Add a `buildBulkDeleteTasksScript` describe:

```ts
describe('buildBulkDeleteTasksScript', () => {
  it('emits one launcher-wrapped program with per-id blocks', async () => {
    const result = await buildBulkDeleteTasksScript({ taskIds: ['t1', 't2'] });
    expect(result.operation).toBe('bulk_delete');
    expect(result.target).toBe('task');
    expect(result.script).toContain('Task.byIdentifier("t1")');
    expect(result.script).toContain('Task.byIdentifier("t2")');
    expect(result.script).toContain('evaluateJavascript'); // launcher boundary
  });
});
```

- [ ] **Step 2: Run to verify the new/changed tests fail**

Run: `npm run test:unit -- tests/unit/contracts/ast/mutation-script-builder.test.ts` Expected: FAIL — old emission
asserted / new export missing.

- [ ] **Step 3: Implement** — replace the BODIES of `buildCompleteScript` and `buildDeleteScript` (signatures unchanged
      — `rollbackBatchCreations` and the project handlers depend on them, spec §1) with the slice-4 wrapper shape:

```ts
export async function buildCompleteScript(
  target: MutationTarget,
  id: string,
  completionDate?: string,
): Promise<GeneratedMutationScript> {
  // Emit from the mutation AST. dispatchMutation runs the build-time sandbox
  // guard BEFORE building (covers the previously unguarded single-op task
  // path, spec §2.1); the emitter produces ONE OmniJS program — strict
  // byIdentifier resolve, live completionDate read-back — wrapped in a
  // data-free JXA launcher. The old template body is gone (OMN-128 slice 5).
  const program =
    target === 'task'
      ? await dispatchMutation('complete/task', { taskId: id, completionDate })
      : await dispatchMutation('complete/project', { projectId: id, completionDate });
  validateMutationProgram(program);
  return {
    script: wrapInLauncher(emitProgram(program), program.context).trim(),
    operation: 'complete',
    target,
    description: `Complete ${target}: ${id}`,
  };
}

export async function buildDeleteScript(target: MutationTarget, id: string): Promise<GeneratedMutationScript> {
  const program =
    target === 'task'
      ? await dispatchMutation('delete/task', { taskId: id })
      : await dispatchMutation('delete/project', { projectId: id });
  validateMutationProgram(program);
  return {
    script: wrapInLauncher(emitProgram(program), program.context).trim(),
    operation: 'delete',
    target,
    description: `Delete ${target}: ${id}`,
  };
}

export async function buildBulkDeleteTasksScript(input: { taskIds: string[] }): Promise<GeneratedMutationScript> {
  const program = await dispatchMutation('bulk_delete/task', { taskIds: input.taskIds });
  validateMutationProgram(program);
  return {
    script: wrapInLauncher(emitProgram(program), program.context).trim(),
    operation: 'bulk_delete',
    target: 'task',
    description: `Bulk delete ${input.taskIds.length} task(s)`,
  };
}
```

The explicit `validateTaskInSandbox`/`validateProjectInSandbox` calls at the top of the old bodies are REMOVED — the
guard now runs inside `dispatchMutation` (do not double-guard). Export `buildBulkDeleteTasksScript` from
`src/contracts/ast/index.ts`. Do NOT delete `buildBatchScript`/`buildBulkDeleteScript` yet — that's Task 8.

- [ ] **Step 4: Run to verify pass**

Run: `npm run test:unit -- tests/unit/contracts/ast/mutation-script-builder.test.ts tests/unit/contracts/ast/mutation/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/contracts/ast/mutation-script-builder.ts src/contracts/ast/index.ts tests/unit/contracts/ast/mutation-script-builder.test.ts
git commit -m "feat(OMN-128): slice 5 — complete/delete/bulk builders dispatch through the mutation AST"
```

---

### Task 7: Tool-layer rewiring (`OmniFocusWriteTool.ts`)

**Files:**

- Modify: `src/tools/unified/OmniFocusWriteTool.ts`
- Test: existing tool unit tests under `tests/unit/tools/` that cover complete/delete/bulk responses (grep
  `handleTaskComplete\|bulk_delete\|deleted_id` under `tests/unit/tools/` to find them)

- [ ] **Step 1: Update/extend the tool unit tests first** for the new envelope expectations (§2.3): task responses
      expose `task.taskId` (not `task.id`); project delete response carries
      `{ project: { projectId, name, deleted: true } }`; project complete forwards `completionDate`; no inner `success`
      key inside `task`/`project` data. Follow the existing tests' mock pattern for `execJson`/`omniAutomation` — mock
      the SCRIPT RESULT the way `OmniAutomation.executeJson` actually delivers it (`{success: true, data: <envelope>}`),
      not hand-rolled shapes (the wrong-seam lesson).

- [ ] **Step 2: Run to verify the changed tests fail**

Run: `npm run test:unit -- tests/unit/tools/` Expected: the edited tests FAIL against current handler behavior.

- [ ] **Step 3: Implement the rewiring**

1. **Imports:** drop `buildCompleteTaskScript`, `buildDeleteTaskScript` from the `omnifocus/scripts` import and
   `buildBulkDeleteTasksScript` from the same; import `buildBulkDeleteTasksScript` from `../../contracts/ast/index.js`
   alongside `buildCompleteScript`/`buildDeleteScript` (already imported).
2. **`handleTaskComplete`:** replace the script build with
   `const generated = await buildCompleteScript('task', taskId, compiled.completionDate ? localToUTC(compiled.completionDate, 'completion') : undefined);`
   then `const result = await this.execJson(generated.script);` and the uniform pattern: `isScriptError(result)` →
   existing error response (keep the `isJxaAccessDenied` remap and `SCRIPT_ERROR` code); else
   `createSuccessResponseV2('omnifocus_write', { task: result.data }, …)` keeping the existing metadata keys
   (`completed_id`, `input_params`). Delete the `'success' in res` re-wrapping block.
3. **`handleTaskDelete`:** same shape with `buildDeleteScript('task', taskId)`; keep the existing cache invalidations
   and `deleted_id` metadata.
4. **`handleProjectComplete`:** signature gains the optional date —
   `handleProjectComplete(projectId: string, completionDate?: string)`; pass
   `compiled.completionDate ? localToUTC(compiled.completionDate, 'completion') : undefined` from BOTH call sites (the
   `handleProjectOperation` switch and the batch dispatch site — grep `handleProjectComplete(`); forward into
   `buildCompleteScript('project', projectId, completionDate)`.
5. **`handleProjectDelete`:** change the success response to `{ project: result.data, operation: 'delete' }` (§2.3b).
6. **`handleBulkDeleteTasks`:**
   `const generated = await buildBulkDeleteTasksScript({ taskIds: taskIds.map((id) => id as string) }); const result = await this.execJson(generated.script);`
   — the rest (`collectBulkDeleteResults`, cache clear) is unchanged.
7. **Fix the OMN-119 comment in `routeToBatch`** (§2.1): it claims complete/delete sub-ops were already guarded — update
   it to say they NOW dispatch through guarded builders (slice 5) and creates remain tool-layer-guarded.
8. **Tool description string:** grep the class's description/inputSchema text for complete/delete/bulk_delete claims;
   update any that describe legacy behavior (e.g., if anything mentions name-based matching or differing envelopes).

- [ ] **Step 4: Run to verify pass**

Run: `npm run test:unit -- tests/unit/tools/ && npm run build` Expected: PASS, clean build.

- [ ] **Step 5: Commit**

```bash
git add src/tools/unified/OmniFocusWriteTool.ts tests/unit/tools/
git commit -m "feat(OMN-128): slice 5 — write-tool handlers dispatch complete/delete through the AST builders"
```

---

### Task 8: Deletions — legacy scripts + dead builders (+ cascade round)

**Files:**

- Delete: `src/omnifocus/scripts/tasks/complete-task.ts`, `src/omnifocus/scripts/tasks/delete-task.ts`,
  `src/omnifocus/scripts/tasks/delete-tasks-bulk.ts`, AND `src/omnifocus/scripts/tasks/complete-tasks-bulk.ts`
  (`buildBulkCompleteTasksScript` — a fourth legacy script in the same hazard class with ZERO callers beyond its
  `tasks.ts` re-export; verified by grep, found in plan review)
- Modify: `src/omnifocus/scripts/tasks.ts` (drop the four re-exports)
- Modify: `src/contracts/ast/mutation-script-builder.ts` (delete `buildBatchScript`, `buildBulkDeleteScript`, and
  now-orphaned `BatchOperation`/`BatchOptions` IMPORTS if they lose their last use in this file — the types themselves
  live in `src/contracts/mutations.ts` and are still used by the batch envelope/compiler; verify with
  `grep -rn "BatchOperation\|BatchOptions" src/ | grep -v test`)
- Modify: `src/contracts/ast/index.ts` (drop the two dead exports)
- Modify: `tests/unit/contracts/ast/mutation-script-builder.test.ts` — THREE touchpoints: the `buildBatchScript`
  describe, the `buildBulkDeleteScript` describe, AND the `script structure consistency` describe (~line 1003), which
  calls both builders directly; also drop both names from the file's imports. Missing any of these leaves a
  non-compiling test file.

- [ ] **Step 1: Delete the files and exports listed above**
- [ ] **Step 2: Build + grep for stragglers**

```bash
npm run build
grep -rn "buildCompleteTaskScript\|buildDeleteTaskScript\|buildBulkCompleteTasksScript\|buildBatchScript\|buildBulkDeleteScript" src/ tests/
grep -rn "delete-tasks-bulk\|complete-task\|delete-task" src/ --include="*.ts" | grep -v "delete-task" | head
```

Expected: build clean; greps return ONLY the new `buildBulkDeleteTasksScript` (substring collision with the deleted name
is expected — read the matches).

- [ ] **Step 3: Cascade round (`project_cascading_discovery_rule`)** — run `npx ts-prune` (or the repo's configured
      dead-code check; check `package.json` scripts for a `prune`/`deadcode` entry) and inspect NEW orphans created by
      the deletions (e.g., helpers only the deleted files imported, like `getUnifiedHelpers` consumers — that helper has
      many other users, so expect no change there, but VERIFY). Delete what this slice orphaned; leave pre-existing
      findings alone (note them in the PR description instead).

- [ ] **Step 4: Full unit suite**

Run: `npm run test:unit` Expected: PASS (count will drop by the deleted describes — that's expected; no other failures).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(OMN-128): slice 5 — delete legacy complete/delete scripts + dead batch/bulk builders (OMN-134 residue)"
```

---

### Task 9: Riding doc minor + CLAUDE-path guard check

**Files:**

- Modify: `docs/superpowers/specs/2026-06-10-update-task-project-mutation-ast-design.md` — TWO stale "slice 5+"
  references: (a) §4.2's `OMNIJS_RESOLVE_TAG_PATH` "survives only until the tag builders migrate (slice 5+)" sentence
  (~line 150) — tag builders are slice 6, reword to "(slice 6)"; (b) the §1 out-of-scope list's "bulk-delete, tag
  builders (slice 5+)" (~line 29) — bulk-delete is THIS slice; reword to "bulk-delete (slice 5), tag builders (slice
  6)".

- [ ] **Step 1: Make the edits** (the `CALL_METHOD_ALLOWLIST` comment was already fixed in Task 1).
- [ ] **Step 2: Run the docs-path guard** — `npm run test:unit -- tests/unit/docs/` (CLAUDE.md/doc path-rot tests must
      still pass; the deleted script files must not be referenced by any guarded doc — if the guard fails, fix the
      referencing doc in the same commit).
- [ ] **Step 3: Commit**

```bash
git add docs/
git commit -m "docs(OMN-128): slice 5 — riding minors from PR #81 review"
```

---

### Task 10: OMN-138 live integration coverage

**Files:**

- Create: `tests/integration/tools/unified/complete-delete-paths.test.ts`

**Pattern:** mirror `tests/integration/tools/unified/update-paths.test.ts` — same harness/setup helpers, sandbox folder
scoping (`__MCP_TEST_SANDBOX__`), fixture creation through the real tool, and READ-BACK assertions on persisted state
(never envelope echoes — slice-3 lesson). Read that file fully before writing this one.

- [ ] **Step 1: Write the tests** (each creates its own sandbox fixtures through the write tool):

1. **Complete a task** (with explicit `completionDate`): read back via a tasks query that can see completed tasks
   (`filters: { completed: true }` or `details: true` — check how update-paths reads back) and assert `completed` and
   the persisted `completionDate`.
2. **Complete a project:** read back project status `completed` via an explicit `fields` projection (reviewInterval
   precedent — `project_project_read_field_gate`).
3. **Delete a task / delete a project:** read back **absence** (query by id-filter or name returns 0 rows).
4. **Bulk delete:** create 2 sandbox tasks, request deletion of `[id1, id2, 'bogus-id']`; assert response
   `successCount === 2`, one error entry carrying `taskId: 'bogus-id'`; read back absence of both real tasks. (live
   test-mode deviation: the all-ids guard pre-flight refuses the whole dispatch — asserted as whole-dispatch refusal +
   zero deletes; per-item continue-on-error is covered by the vm unit layer + the parent-session unguarded /verify
   matrix)
5. **Not-found single ops:** complete + delete with a bogus id → loud `SCRIPT_ERROR` with the entity-named message.

- [ ] **Step 2: Build, then run the integration suite in the background**

```bash
npm run build
```

Then run `npm run test:integration` ONLY via run_in_background (OMN-143 / `tooling_integration_run_orphan_class`: killed
foreground shells orphan vitest). After it completes, check `pgrep -fl vitest` is empty. Expected: new file passes; no
regressions in `update-paths`/`create-paths`.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/tools/unified/complete-delete-paths.test.ts
git commit -m "test(OMN-128): slice 5 — OMN-138 live complete/delete/bulk coverage"
```

---

### Task 11: Full verification sweep

- [ ] **Step 1:** `npm run build` — clean.
- [ ] **Step 2:** `npm run test:unit` — all pass.
- [ ] **Step 3:** `npm run lint` (the repo's standard invocation; the one pre-existing
      `sonarjs/different-types-comparison` warning in validator.ts is allowed; nothing new).
- [ ] **Step 4:** `npm run test:integration` via run_in_background — all pass; `pgrep -fl vitest` empty after.
- [ ] **Step 5:** Emitted-size sanity: the 100-id bulk program is well under the 200 KB guard (the validator enforces
      it; no manual check needed — just confirm the validator test for the size rule still passes).
- [ ] **Step 6:** Commit anything outstanding; the branch is ready for the live `/verify` matrix (spec §7), which the
      parent session runs — NOT part of this plan's subagent tasks.

---

## Post-plan (parent session, not subagent tasks)

Per spec §7 and `feedback_review_gates`: live `/verify` matrix (guarded sandbox probes; decoy-fixture guard probes for
§2.1; bounded unguarded window for not-found messages via the `of-call.mjs` one-shot driver recreated in the job tmp
dir), then `superpowers:finishing-a-development-branch` → PR → final `superpowers:code-reviewer` gated on SAFE →
`gh pr merge --repo kip-d/omnifocus-mcp --squash --auto`.
