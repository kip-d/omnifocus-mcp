# OMN-128 Slice 2: create-task + batch-create on the Mutation AST — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate `buildCreateTaskScript` and `buildBatchCreateTasksScript` to the OmniJS-native mutation AST with one
shared lowering, typed container resolution (loud not-found), and OMN-137 warnings surfaced from all best-effort blocks.

**Architecture:** One `lowerTaskCreate(data, opts)` produces the statement list for "create one task";
`buildCreateTaskProgram` wraps one spec with the full single-create envelope, `buildBatchCreateTasksProgram` unrolls N
specs into per-item try/capture blocks. The emitter gains warnings infrastructure (program-scope `_warnings`, labeled
best-effort catches) that `create/project` inherits. Repetition rules lower to an RRULE string at build time (pure TS) —
the tool layer's two post-create repetition helpers delete.

**Tech Stack:** TypeScript, vitest (incl. `node:vm` execution tests), existing mutation-AST substrate in
`src/contracts/ast/mutation/`.

**Spec:** `docs/superpowers/specs/2026-06-09-create-task-batch-mutation-ast-design.md` — read it first; behavior deltas
in §3.1 are Kip-approved.

**Ground rules for every task:**

- TDD: failing test first, then minimal implementation, then green, then commit.
- Run `npm run build` before any test run that imports changed files (tests run on TS via vitest, but build catches type
  errors across the repo).
- Unit tests: `npx vitest run <file>` for the file under work; `npm run test:unit` before each commit.
- Mirror slice-1 patterns: `src/contracts/ast/mutation/defs.ts` (lowering style, exhaustiveness guard),
  `tests/unit/contracts/ast/mutation/create-project.test.ts` (golden/structural tests),
  `tests/unit/contracts/ast/mutation/emitter.test.ts` (vm-execution pattern with stubbed OmniFocus globals).
- Commit messages: `type(OMN-128): subject` + `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: `lowerRepetitionRule` — pure build-time RRULE lowering

**Files:**

- Create: `src/contracts/ast/mutation/repetition.ts`
- Test: `tests/unit/contracts/ast/mutation/repetition.test.ts`

The legacy runtime OmniJS at `src/contracts/ast/mutation-script-builder.ts` lines ~663–782 is the reference semantics.
Note: that island is dead code on both production paths (the tool layer strips `repetitionRule` pre-script and applies
it post-create), but its mapping rules are the correct spec — they match `applyRepetitionRulePostCreate`'s update-script
path.

- [ ] **Step 1: Write failing tests**

```typescript
// tests/unit/contracts/ast/mutation/repetition.test.ts
import { describe, it, expect } from 'vitest';
import { lowerRepetitionRule } from '../../../../../src/contracts/ast/mutation/repetition.js';

describe('lowerRepetitionRule', () => {
  it('lowers a minimal weekly rule', () => {
    expect(lowerRepetitionRule({ frequency: 'weekly', interval: 1 })).toEqual({
      rrule: 'FREQ=WEEKLY',
      scheduleTypePath: 'Task.RepetitionScheduleType.Regularly',
      anchorPath: 'Task.AnchorDateKey.DueDate',
      catchUp: true,
    });
  });

  it('emits INTERVAL only when > 1', () => {
    expect(lowerRepetitionRule({ frequency: 'daily', interval: 3 }).rrule).toBe('FREQ=DAILY;INTERVAL=3');
    expect(lowerRepetitionRule({ frequency: 'daily', interval: 1 }).rrule).toBe('FREQ=DAILY');
  });

  it('lowers BYDAY with and without positions', () => {
    expect(
      lowerRepetitionRule({
        frequency: 'monthly',
        interval: 1,
        daysOfWeek: [{ day: 'MO', position: 2 }, { day: 'FR' }],
      }).rrule,
    ).toBe('FREQ=MONTHLY;BYDAY=2MO,FR');
  });

  it('lowers BYMONTHDAY, COUNT, UNTIL, WKST, BYSETPOS', () => {
    expect(
      lowerRepetitionRule({
        frequency: 'monthly',
        interval: 1,
        daysOfMonth: [1, -1],
        count: 5,
        endDate: '2026-12-31',
        weekStart: 'MO',
        setPositions: [-1],
      }).rrule,
    ).toBe('FREQ=MONTHLY;BYMONTHDAY=1,-1;COUNT=5;UNTIL=20261231;WKST=MO;BYSETPOS=-1');
  });

  it('derives scheduleType from deprecated method when scheduleType absent', () => {
    expect(
      lowerRepetitionRule({ frequency: 'weekly', interval: 1, method: 'due-after-completion' }).scheduleTypePath,
    ).toBe('Task.RepetitionScheduleType.FromCompletion');
    expect(lowerRepetitionRule({ frequency: 'weekly', interval: 1, method: 'fixed' }).scheduleTypePath).toBe(
      'Task.RepetitionScheduleType.Regularly',
    );
  });

  it('explicit scheduleType wins over method', () => {
    expect(
      lowerRepetitionRule({
        frequency: 'weekly',
        interval: 1,
        method: 'due-after-completion',
        scheduleType: 'regularly',
      }).scheduleTypePath,
    ).toBe('Task.RepetitionScheduleType.Regularly');
  });

  it('defer-after-completion implies DeferDate anchor', () => {
    const out = lowerRepetitionRule({ frequency: 'weekly', interval: 1, method: 'defer-after-completion' });
    expect(out.anchorPath).toBe('Task.AnchorDateKey.DeferDate');
    expect(out.scheduleTypePath).toBe('Task.RepetitionScheduleType.FromCompletion');
  });

  it('explicit anchorDateKey wins', () => {
    expect(lowerRepetitionRule({ frequency: 'weekly', interval: 1, anchorDateKey: 'planned-date' }).anchorPath).toBe(
      'Task.AnchorDateKey.PlannedDate',
    );
  });

  it('catchUpAutomatically false is honored; default is true', () => {
    expect(lowerRepetitionRule({ frequency: 'weekly', interval: 1, catchUpAutomatically: false }).catchUp).toBe(false);
    expect(lowerRepetitionRule({ frequency: 'weekly', interval: 1 }).catchUp).toBe(true);
  });

  it('throws loud on invalid frequency (build time, not runtime)', () => {
    expect(() => lowerRepetitionRule({ frequency: 'fortnightly' as never, interval: 1 })).toThrow(/frequency/i);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/contracts/ast/mutation/repetition.test.ts` Expected: FAIL — cannot resolve
`repetition.js`.

- [ ] **Step 3: Implement**

```typescript
// src/contracts/ast/mutation/repetition.ts
// Build-time lowering of RepetitionRule → the constructor args for OmniJS
// `new Task.RepetitionRule(rrule, null, scheduleType, anchorDateKey, catchUp)`.
// Replaces the legacy runtime island (mutation-script-builder.ts) — same mapping
// rules, but computed in TS where they are typed and unit-testable, and invalid
// input fails loudly at build time instead of inside evaluateJavascript.
import type { RepetitionRule } from '../../mutations.js';

export interface LoweredRepetitionRule {
  rrule: string;
  scheduleTypePath: string; // OmniJS enum path, emitted via enumRef
  anchorPath: string; // OmniJS enum path, emitted via enumRef
  catchUp: boolean;
}

const FREQ_MAP: Record<string, string> = {
  minutely: 'MINUTELY',
  hourly: 'HOURLY',
  daily: 'DAILY',
  weekly: 'WEEKLY',
  monthly: 'MONTHLY',
  yearly: 'YEARLY',
};

const SCHEDULE_MAP: Record<string, string> = {
  regularly: 'Task.RepetitionScheduleType.Regularly',
  'from-completion': 'Task.RepetitionScheduleType.FromCompletion',
  none: 'Task.RepetitionScheduleType.None',
};

const ANCHOR_MAP: Record<string, string> = {
  'due-date': 'Task.AnchorDateKey.DueDate',
  'defer-date': 'Task.AnchorDateKey.DeferDate',
  'planned-date': 'Task.AnchorDateKey.PlannedDate',
};

export function lowerRepetitionRule(rule: RepetitionRule): LoweredRepetitionRule {
  const freq = FREQ_MAP[rule.frequency];
  if (!freq) throw new Error(`Invalid repetition frequency: ${String(rule.frequency)}`);

  let rrule = `FREQ=${freq}`;
  if (rule.interval && rule.interval > 1) rrule += `;INTERVAL=${rule.interval}`;
  if (rule.daysOfWeek && rule.daysOfWeek.length > 0) {
    const byDay = rule.daysOfWeek.map((d) => (d.position ? `${d.position}${d.day}` : d.day)).join(',');
    rrule += `;BYDAY=${byDay}`;
  }
  if (rule.daysOfMonth && rule.daysOfMonth.length > 0) rrule += `;BYMONTHDAY=${rule.daysOfMonth.join(',')}`;
  if (rule.count && rule.count > 0) rrule += `;COUNT=${rule.count}`;
  if (rule.endDate) rrule += `;UNTIL=${rule.endDate.replace(/-/g, '')}`;
  if (rule.weekStart) rrule += `;WKST=${rule.weekStart}`;
  if (rule.setPositions && rule.setPositions.length > 0) rrule += `;BYSETPOS=${rule.setPositions.join(',')}`;

  // method and scheduleType/anchorDateKey are mutually exclusive in the OF API:
  // always pass null for method; derive scheduleType from method when absent.
  let scheduleTypePath: string;
  if (rule.scheduleType) {
    scheduleTypePath = SCHEDULE_MAP[rule.scheduleType] ?? 'Task.RepetitionScheduleType.Regularly';
  } else if (rule.method === 'due-after-completion' || rule.method === 'defer-after-completion') {
    scheduleTypePath = 'Task.RepetitionScheduleType.FromCompletion';
  } else {
    scheduleTypePath = 'Task.RepetitionScheduleType.Regularly';
  }

  let anchorPath: string;
  if (rule.anchorDateKey) {
    anchorPath = ANCHOR_MAP[rule.anchorDateKey] ?? 'Task.AnchorDateKey.DueDate';
  } else if (rule.method === 'defer-after-completion') {
    anchorPath = 'Task.AnchorDateKey.DeferDate';
  } else {
    anchorPath = 'Task.AnchorDateKey.DueDate';
  }

  return { rrule, scheduleTypePath, anchorPath, catchUp: rule.catchUpAutomatically !== false };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/unit/contracts/ast/mutation/repetition.test.ts` Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/contracts/ast/mutation/repetition.ts tests/unit/contracts/ast/mutation/repetition.test.ts
git commit -m "feat(OMN-128): lowerRepetitionRule — build-time RRULE lowering for the mutation AST"
```

---

### Task 2: `resolveProjectFlexible` snippet

**Files:**

- Modify: `src/contracts/ast/mutation/snippets.ts`
- Test: `tests/unit/contracts/ast/mutation/snippets.test.ts` (extend)

- [ ] **Step 1: Write failing test** — extend the existing snippets test file:

```typescript
describe('resolveProjectFlexible', () => {
  it('is registered with no deps and resolves byIdentifier then by name', () => {
    expect(SNIPPETS.resolveProjectFlexible).toBeDefined();
    expect(SNIPPETS.resolveProjectFlexible.deps).toEqual([]);
    const src = SNIPPETS.resolveProjectFlexible.source;
    expect(src).toContain('function resolveProjectFlexible');
    expect(src).toContain('Project.byIdentifier');
    expect(src).toContain('flattenedProjects');
    expect(src).toContain('return null'); // not-found is null — guard handles loudness
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run tests/unit/contracts/ast/mutation/snippets.test.ts` → FAIL.

- [ ] **Step 3: Implement** — add to `snippets.ts` (legacy semantics from both old builders: id first, then exact name;
      no silent fallback decision here — resolution returns null, the _guard_ decides):

```typescript
const resolveProjectFlexible = `
function resolveProjectFlexible(target) {
  var byId = Project.byIdentifier(target);
  if (byId) return byId;
  for (var i = 0; i < flattenedProjects.length; i++) {
    if (flattenedProjects[i].name === target) return flattenedProjects[i];
  }
  return null;
}`;
```

and register: `resolveProjectFlexible: { source: resolveProjectFlexible, deps: [] },`

- [ ] **Step 4: Run to verify pass** — same command → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/contracts/ast/mutation/snippets.ts tests/unit/contracts/ast/mutation/snippets.test.ts
git commit -m "feat(OMN-128): resolveProjectFlexible snippet — single-source project resolution"
```

---

### Task 3: Type/node additions — `ContainerResolution`, resolve nodes, `constructTask`, `batchItem`, guard mode, best-effort labels

**Files:**

- Modify: `src/contracts/ast/mutation/types.ts`
- Test: `tests/unit/contracts/ast/mutation/types.test.ts` (extend)

- [ ] **Step 1: Write failing tests** — factory shape tests mirroring the existing ones:

```typescript
import {
  constructTask,
  resolveProject,
  resolveParentTask,
  batchItem,
  guard,
  setProp,
  assignTags,
  ref,
  json,
} from '../../../../../src/contracts/ast/mutation/types.js';

describe('slice-2 node factories', () => {
  it('resolveProject / resolveParentTask carry bind + ref', () => {
    expect(resolveProject('p', 'Work')).toEqual({ type: 'resolveProject', bind: 'p', ref: 'Work' });
    expect(resolveParentTask('pt', 'abc')).toEqual({ type: 'resolveParentTask', bind: 'pt', ref: 'abc' });
  });

  it('constructTask carries a typed ContainerResolution', () => {
    expect(constructTask('t', json('X'), { kind: 'inbox' })).toEqual({
      type: 'constructTask',
      bind: 't',
      name: json('X'),
      container: { kind: 'inbox' },
    });
    expect(constructTask('t', json('X'), { kind: 'project', var: 'p' }).container).toEqual({
      kind: 'project',
      var: 'p',
    });
  });

  it('guard supports throw mode (default return)', () => {
    expect(guard('x === null', { message: json('nope') }).mode).toBeUndefined();
    expect(guard('x === null', { message: json('nope') }, 'throw').mode).toBe('throw');
  });

  it('setProp / assignTags accept a warnings label', () => {
    expect(setProp(ref('t'), 'repetitionRule', json(1), 'direct', true, 'repetitionRule').label).toBe('repetitionRule');
    expect(assignTags(ref('t'), json(['a']), 'applied_0', true, 'tags').label).toBe('tags');
  });

  it('batchItem wraps statements with tempId, taskVar, index, stopOnError', () => {
    const node = batchItem('tmp1', 0, '_t0', [constructTask('_t0', json('X'), { kind: 'inbox' })], true);
    expect(node.type).toBe('batchItem');
    expect(node.tempId).toBe('tmp1');
    expect(node.index).toBe(0);
    expect(node.taskVar).toBe('_t0');
    expect(node.stopOnError).toBe(true);
    expect(node.statements).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run tests/unit/contracts/ast/mutation/types.test.ts` → FAIL.

- [ ] **Step 3: Implement** in `types.ts`:

```typescript
// --- Typed fail-able container resolution (slice 2) ---
export type ContainerResolution =
  | { kind: 'inbox' }
  | { kind: 'project'; var: string }
  | { kind: 'parentTask'; var: string }
  | { kind: 'tempIdRef'; var: string }; // batch-only: a task created earlier in the same program

export interface ResolveProjectNode {
  type: 'resolveProject';
  bind: string;
  ref: string;
}
export interface ResolveParentTaskNode {
  type: 'resolveParentTask';
  bind: string;
  ref: string;
}
export interface ConstructTaskNode {
  type: 'constructTask';
  bind: string;
  name: Expr;
  container: ContainerResolution;
}
// Batch composition: one item's statements wrapped in try/capture. Emits
// results.push({tempId, taskId, success, warnings}) on success and
// ({tempId, taskId:null, success:false, error, warnings}) on failure.
export interface BatchItemNode {
  type: 'batchItem';
  tempId: string;
  index: number; // for per-item internal var names (_w<i>)
  taskVar: string; // the constructTask bind inside statements — read for taskId
  statements: Stmt[];
  stopOnError: boolean;
}
```

Extend `GuardNode` with `mode?: 'return' | 'throw'`; extend `SetPropNode` and `AssignTagsNode` with `label?: string`
(warnings attribution). Add the new nodes to the `Stmt` union. Factories (keep existing signatures backward-compatible —
new params trail with defaults):

```typescript
export const resolveProject = (bindVar: string, refStr: string): ResolveProjectNode => ({
  type: 'resolveProject',
  bind: bindVar,
  ref: refStr,
});
export const resolveParentTask = (bindVar: string, refStr: string): ResolveParentTaskNode => ({
  type: 'resolveParentTask',
  bind: bindVar,
  ref: refStr,
});
export const constructTask = (bindVar: string, name: Expr, container: ContainerResolution): ConstructTaskNode => ({
  type: 'constructTask',
  bind: bindVar,
  name,
  container,
});
export const batchItem = (
  tempId: string,
  index: number,
  taskVar: string,
  statements: Stmt[],
  stopOnError: boolean,
): BatchItemNode => ({ type: 'batchItem', tempId, index, taskVar, statements, stopOnError });
// guard gains an optional trailing mode; setProp/assignTags gain optional trailing label.
```

- [ ] **Step 4: Run to verify pass** — types test PASS; then `npm run build` — expect compile errors in
      `emitter.ts`/`validator.ts` exhaustiveness switches (`_x: never`). **That is the designed tripwire.** Add
      temporary `case` stubs that `throw new Error('not implemented: <node>')` for the three new statement types so the
      build is green; Tasks 5–6 replace them.

- [ ] **Step 5: Commit**

```bash
git add src/contracts/ast/mutation/types.ts src/contracts/ast/mutation/emitter.ts src/contracts/ast/mutation/validator.ts tests/unit/contracts/ast/mutation/types.test.ts
git commit -m "feat(OMN-128): mutation-AST node types for task creation + batch composition"
```

---

### Task 4: Emitter warnings infrastructure (OMN-137) + `create/project` inheritance

**Files:**

- Modify: `src/contracts/ast/mutation/emitter.ts`, `src/contracts/ast/mutation/defs.ts`
- Test: `tests/unit/contracts/ast/mutation/emitter.test.ts`, `tests/unit/contracts/ast/mutation/create-project.test.ts`
  (update goldens)

Design (spec §3.1.2): every program declares `let _warnings = [];` as its first statement — **unconditionally**.
Rationale: conditional declaration recreates the `appliedTags` ReferenceError class (a consumer referencing an
undeclared binding); one dead `let` is free. Best-effort catches become
`catch (e) { _warnings.push(<label> + ': ' + (e && e.message ? e.message : String(e))); }`. The `dateExpr` self-wrap
keeps swallow semantics (spec §3.1, deliberate).

- [ ] **Step 1: Write failing tests** — in `emitter.test.ts`:

```typescript
it('every program declares _warnings at program scope', () => {
  const program = emitProgram({ statements: [return_({ ok: json(true) })], context: 'x', snippetDeps: [] });
  expect(program).toContain('let _warnings = [];');
});

it('bestEffort setProp failure pushes a labeled warning instead of swallowing', () => {
  const stmt = setProp(ref('proj'), 'status', enumRef('Project.Status.OnHold'), 'enum', true, 'status');
  const out = emitStmt(stmt);
  expect(out).toContain('catch (e)');
  expect(out).toContain('_warnings.push("status" + \': \'');
  expect(out).not.toContain('catch (e) {}');
});

// vm-execution: a throwing best-effort block surfaces in the envelope warnings
it('vm: warnings populated when a best-effort block throws, envelope still returned', () => {
  // Build a program: bestEffort setProp on a throwing target, then return {warnings: ref('_warnings')}.
  // Sandbox stub: a target object whose property setter throws (use Object.defineProperty in the sandbox).
  // Assert: JSON.parse(result).warnings has length 1 and contains the label.
});
```

(Write the vm test concretely following the existing vm pattern at the bottom of `emitter.test.ts` — stub globals,
`vm.runInNewContext`, parse the returned JSON envelope.)

- [ ] **Step 2: Run to verify failure** — `npx vitest run tests/unit/contracts/ast/mutation/emitter.test.ts` → FAIL.

- [ ] **Step 3: Implement** in `emitter.ts`:

1. `emitProgram`: prepend `let _warnings = [];` to the body (before snippets is fine; first line of `inner`).
2. A shared helper inside the module:

```typescript
function bestEffortCatch(label: string): string {
  return `catch (e) { _warnings.push(${JSON.stringify(label)} + ': ' + (e && e.message ? e.message : String(e))); }`;
}
```

3. `setProp` wrap: `node.bestEffort ? `try { ${block} } ${bestEffortCatch(node.label ?? node.prop)}` : block` (the
   `readModifyReassign` and `enum` strategies route through the same wrap — they already do).
4. `assignTags` guarded loop: replace `catch (e) {}` with `bestEffortCatch(node.label ?? 'tags')`.

Then in `defs.ts` (`buildCreateProjectProgram`): add `warnings: ref('_warnings')` to the envelope, and pass labels at
the best-effort call sites (`'status'`, `'reviewInterval'`, `'tags'`).

- [ ] **Step 4: Run to verify pass** — emitter tests PASS;
      `npx vitest run tests/unit/contracts/ast/mutation/create-project.test.ts` will FAIL on stale goldens — update them
      to expect the `_warnings` declaration, labeled catches, and `warnings:` in the envelope. All green, then
      `npm run test:unit` (expect fallout only in these two files; fix goldens, never weaken assertions).

- [ ] **Step 5: Commit**

```bash
git add src/contracts/ast/mutation/emitter.ts src/contracts/ast/mutation/defs.ts tests/unit/contracts/ast/mutation/
git commit -m "feat(OMN-128/OMN-137): best-effort failures surface as envelope warnings (create/project inherits)"
```

---

### Task 5: Emitter — new statement emissions

**Files:**

- Modify: `src/contracts/ast/mutation/emitter.ts`
- Test: `tests/unit/contracts/ast/mutation/emitter.test.ts` (extend)

- [ ] **Step 1: Write failing tests**

```typescript
describe('slice-2 statement emission', () => {
  it('resolveProject emits a resolveProjectFlexible call with JSON-escaped ref', () => {
    expect(emitStmt(resolveProject('p', 'My "Q" Project'))).toBe(
      'const p = resolveProjectFlexible("My \\"Q\\" Project");',
    );
  });

  it('resolveParentTask emits Task.byIdentifier with null fallback', () => {
    expect(emitStmt(resolveParentTask('pt', 'abc123'))).toBe('const pt = Task.byIdentifier("abc123") || null;');
  });

  it('constructTask: inbox has no move; resolved containers move to <var>.ending', () => {
    expect(emitStmt(constructTask('t', json('X'), { kind: 'inbox' }))).toBe('const t = new Task("X");');
    expect(emitStmt(constructTask('t', json('X'), { kind: 'project', var: 'p' }))).toBe(
      'const t = new Task("X");\nmoveTasks([t], p.ending);',
    );
    // parentTask and tempIdRef emit identically to project (var-based move)
  });

  it('guard throw-mode emits a throw, not a return', () => {
    const g = guard('p === null', { message: json('Project not found: X') }, 'throw');
    expect(emitStmt(g)).toBe('if (p === null) throw new Error("Project not found: X");');
  });

  it('batchItem emits try/capture with per-item warnings slice and results push', () => {
    const node = batchItem('tmp1', 0, '_t0', [constructTask('_t0', json('A'), { kind: 'inbox' })], false);
    const out = emitStmt(node);
    expect(out).toContain('const _w0 = _warnings.length;');
    expect(out).toContain(
      'results.push({ tempId: "tmp1", taskId: _t0.id.primaryKey, success: true, warnings: _warnings.slice(_w0) });',
    );
    expect(out).toContain('catch (e)');
    expect(out).toContain('success: false');
    expect(out).not.toContain('_aborted'); // stopOnError false
    const stop = emitStmt(batchItem('tmp1', 0, '_t0', [constructTask('_t0', json('A'), { kind: 'inbox' })], true));
    expect(stop).toContain('_aborted = true;');
  });
});
```

- [ ] **Step 2: Run to verify failure** — emitter tests FAIL on the Task-3 stubs.

- [ ] **Step 3: Implement** the four cases in `emitStmt`:

```typescript
case 'resolveProject':
  return `const ${node.bind} = resolveProjectFlexible(${JSON.stringify(node.ref)});`;
case 'resolveParentTask':
  return `const ${node.bind} = Task.byIdentifier(${JSON.stringify(node.ref)}) || null;`;
case 'constructTask': {
  const construct = `const ${node.bind} = new Task(${emitExpr(node.name)});`;
  if (node.container.kind === 'inbox') return construct;
  return `${construct}\nmoveTasks([${node.bind}], ${node.container.var}.ending);`;
}
case 'batchItem': {
  const wVar = `_w${node.index}`;
  const body = node.statements.map(emitStmt).join('\n');
  const ok = `results.push({ tempId: ${JSON.stringify(node.tempId)}, taskId: ${node.taskVar}.id.primaryKey, success: true, warnings: _warnings.slice(${wVar}) });`;
  const fail = `results.push({ tempId: ${JSON.stringify(node.tempId)}, taskId: null, success: false, error: String(e && e.message ? e.message : e), warnings: _warnings.slice(${wVar}) });`;
  const abort = node.stopOnError ? '\n  _aborted = true;' : '';
  return `const ${wVar} = _warnings.length;\ntry {\n${body}\n${ok}\n} catch (e) {\n${fail}${abort}\n}`;
}
```

Guard: in the `guard` case, when `node.mode === 'throw'` emit
`if (${node.cond}) throw new Error(${emitExpr(node.envelope.message)});` (validator will require `message` for
throw-mode guards).

- [ ] **Step 4: Run to verify pass** — emitter tests PASS; `npm run build` clean.

- [ ] **Step 5: Commit**

```bash
git add src/contracts/ast/mutation/emitter.ts tests/unit/contracts/ast/mutation/emitter.test.ts
git commit -m "feat(OMN-128): emit resolveProject/resolveParentTask/constructTask/batchItem + guard throw-mode"
```

---

### Task 6: Validator rules + program-size guard

**Files:**

- Modify: `src/contracts/ast/mutation/validator.ts`, `src/contracts/ast/mutation/emitter.ts` (size check)
- Test: `tests/unit/contracts/ast/mutation/validator.test.ts` (extend)

- [ ] **Step 1: Write failing tests**

```typescript
describe('slice-2 validator rules', () => {
  it('rejects constructTask with an untyped container', () => {
    /* container: 'Work' as never → throws */
  });
  it('rejects throw-mode guard without a message expr', () => {
    /* guard('x', {}, 'throw') → throws */
  });
  it('requires resolveProject/resolveParentTask binds to be guarded before constructTask consumes them', () => {
    // Program: resolveProject('p', 'X') then constructTask consuming {kind:'project', var:'p'}
    // WITHOUT an intervening guard mentioning `p` → throws.
    // With guard('p === null', {...}) between them → passes.
  });
  it('validates batchItem inner statements recursively (e.g. inner setProp invariants)', () => {
    /* bad inner setProp → throws */
  });
  it('batchItem statements must include a constructTask binding taskVar', () => {
    /* taskVar mismatch → throws */
  });
});

// In emitter.test.ts:
it('emitProgram throws loudly when the assembled program exceeds the size ceiling', () => {
  // Build a program with enough statements to exceed EMITTED_PROGRAM_SIZE_LIMIT
  // (export the constant; or construct ~30k bind statements). Assert the error
  // message names the limit and the actual size — no silent truncation.
});
```

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement:**

In `validator.ts`:

- `CONTAINER_KINDS = new Set(['inbox', 'project', 'parentTask', 'tempIdRef'])`; rule: `constructTask.container` must be
  a typed object with a known kind; non-inbox kinds require a non-empty `var`.
- Guard rule: `mode === 'throw'` requires `envelope.message` to be defined.
- Resolution-guard rule (the typed fail-able discipline, enforced structurally): for each
  `resolveProject`/`resolveParentTask` bind that is later consumed by a `constructTask` container var, there must be an
  intervening `guard` whose `cond` contains that bind name. (String-level check on `cond` — same trust model as
  `GuardNode.cond` generally.)
- `batchItem`: recurse `validateStatements` into `node.statements`; require the inner statements to contain a
  `constructTask` whose `bind === node.taskVar`; require the inner final statement NOT to be a `return` (items don't
  return — the program does). Adjust Rule 1 (return-terminated) to apply to the top level only.

In `emitter.ts`:

```typescript
// OmniJS bridge limit is 261KB measured (docs/dev/SCRIPT_SIZE_LIMITS.md); 200KB
// leaves launcher + JSON-escape headroom. Loud failure, never silent truncation.
export const EMITTED_PROGRAM_SIZE_LIMIT = 200_000;
```

At the end of `emitProgram`: if `result.length > EMITTED_PROGRAM_SIZE_LIMIT` throw with both numbers in the message and
the advice "split the batch".

- [ ] **Step 4: Run to verify pass** — validator + emitter tests PASS; `npm run test:unit` green.

- [ ] **Step 5: Commit**

```bash
git add src/contracts/ast/mutation/validator.ts src/contracts/ast/mutation/emitter.ts tests/unit/contracts/ast/mutation/
git commit -m "feat(OMN-128): validator rules for task nodes + emitted-program size guard"
```

---

### Task 7: `lowerTaskCreate` + `buildCreateTaskProgram` + `create/task` registration + per-key dispatch typing

**Files:**

- Modify: `src/contracts/ast/mutation/defs.ts`, `src/contracts/ast/mutation-script-builder.ts` (export
  `validateTaskCreate`)
- Test: Create `tests/unit/contracts/ast/mutation/create-task.test.ts` (mirror `create-project.test.ts` structure:
  structural assertions + vm execution)

- [ ] **Step 1: Write failing tests** — key cases (mirror create-project.test.ts's style; add vm-execution with stubbed
      `Task`, `Project.byIdentifier`, `flattenedProjects`, `moveTasks`, `flattenedTags`, `Tag`):

1. Inbox minimal: program has `new Task("X")`, no `moveTasks`, envelope has `taskId/name/inInbox/warnings/created`.
2. Project by ref: `resolveProjectFlexible` snippet dep declared; guard makes not-found loud (`Project not found: <ref>`
   in a return-mode guard); `moveTasks` to `.ending`.
3. parentTaskId: `Task.byIdentifier` + guard + move.
4. Container priority: parentTaskId wins over project when both set (legacy batch priority order, spec §3).
5. All scalar fields: note/flagged/dates(dateExpr)/estimatedMinutes(only when set; **0 is dropped** — legacy falsy check
   preserved).
6. Tags: `assignTags` with bind from `names`, best-effort, snippetDeps include `resolveOrCreateTagByPath`.
7. repetitionRule: emitted
   `new Task.RepetitionRule("FREQ=WEEKLY", null, Task.RepetitionScheduleType.Regularly, Task.AnchorDateKey.DueDate, true)`
   inside a labeled best-effort wrap.
8. Exhaustiveness: type-level — `lowerTaskCreate` contains `Record<keyof TaskCreateData, true>`.
9. Guard non-bypass: `dispatchMutation('create/task', …)` rejects (async) when the sandbox guard env-vars are set and
   data violates the sandbox (mirror the create/project guard test).
10. vm: full-field program runs to a valid envelope; vm: project-not-found program returns the error envelope and
    **constructs no task** (stub `Task` constructor with a spy — assert not called).

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement** in `defs.ts`:

```typescript
export interface TaskLoweringNames {
  taskVar: string; // 'task' (single) or '_t<i>' (batch)
  tagsVar: string; // 'appliedTags' or 'appliedTags_<i>'
  resolveVarPrefix: string; // '' (single) or '_<i>' suffix discipline for resolver binds
  guardMode: 'return' | 'throw'; // single returns the error envelope; batch items throw
}

export function lowerTaskCreate(
  data: TaskCreateData,
  names: TaskLoweringNames,
  container?: ContainerResolution, // batch overrides (tempIdRef); single derives from data
): { statements: Stmt[]; snippetDeps: string[] };
```

Behavior:

- Exhaustiveness guard `Record<keyof TaskCreateData, true>` (name, note, project, parentTaskId, tags, dueDate,
  deferDate, plannedDate, flagged, estimatedMinutes, repetitionRule).
- Container derivation (priority per spec §3): explicit `container` arg (batch tempIdRef) → `data.parentTaskId`
  (resolveParentTask + guard `=== null` → message `Parent task not found: <ref>`) → `data.project` non-null
  (resolveProject + guard → `Project not found: <ref>`) → inbox. Guard mode from `names.guardMode`; return-mode guards
  use the slice-1 error envelope shape `{ error: json(true), message: json(...), context: json('create_task') }`.
- `constructTask(names.taskVar, json(data.name), containerResolution)`.
- `setProp` note (`json(data.note || '')`), flagged (`json(data.flagged || false)`); dates via `dateExpr` strategy only
  when set; `estimatedMinutes` only when truthy (legacy falsy check — document with a comment).
- Tags: `assignTags(ref(taskVar), json(data.tags), names.tagsVar, true, 'tags')` + snippet dep.
- Repetition: `lowerRepetitionRule(data.repetitionRule)` → the `setProp`/`newExpr` shape from Task 1,
  `bestEffort: true, label: 'repetitionRule'`.

`buildCreateTaskProgram(data)`: statements from
`lowerTaskCreate(data, { taskVar: 'task', tagsVar: 'appliedTags', guardMode: 'return', … })` + `return_` envelope:

```typescript
{
  taskId: member(ref('task'), 'id.primaryKey'),
  name: member(ref('task'), 'name'),
  note: raw("task.note || ''"),
  flagged: member(ref('task'), 'flagged'),
  dueDate: raw('task.dueDate ? task.dueDate.toISOString() : null'),
  deferDate: raw('task.deferDate ? task.deferDate.toISOString() : null'),
  plannedDate: raw('task.plannedDate ? task.plannedDate.toISOString() : null'),
  estimatedMinutes: raw('task.estimatedMinutes || null'),
  tags: data.tags?.length ? ref('appliedTags') : json([]),
  project: raw('task.containingProject ? task.containingProject.name : null'),
  inInbox: member(ref('task'), 'inInbox'),
  warnings: ref('_warnings'),
  created: json(true),
}
```

Registration + typing (lands the slice-1 `TODO(op #2)` — delete that TODO comment):

```typescript
export const MUTATION_DEFS = {
  'create/project': {
    guard: validateProjectCreate,
    build: buildCreateProjectProgram,
  } as MutationDef<ProjectCreateData>,
  'create/task': { guard: validateTaskCreate, build: buildCreateTaskProgram } as MutationDef<TaskCreateData>,
} as const;

interface MutationDef<T> {
  guard: (data: T) => void | Promise<void>;
  build: (data: T) => Program;
}
type MutationData<K extends keyof typeof MUTATION_DEFS> =
  (typeof MUTATION_DEFS)[K] extends MutationDef<infer T> ? T : never;

export async function dispatchMutation<K extends keyof typeof MUTATION_DEFS>(
  key: K,
  data: MutationData<K>,
): Promise<Program> {
  const def = MUTATION_DEFS[key] as MutationDef<MutationData<K>>;
  await def.guard(data); // build-time sandbox guard — cannot be skipped for a registered op
  return def.build(data);
}
```

Export `validateTaskCreate` from `mutation-script-builder.ts` (currently module-private).

- [ ] **Step 4: Run to verify pass** — new test file PASS; `npm run build` will flag `buildCreateProjectScript` calling
      now-async `dispatchMutation` — make `buildCreateProjectScript` async and `await` (callers fixed in Task 10; if the
      build needs them now, update the two call sites' `await` in the same commit and say so in the commit body).
      `npm run test:unit` green.

- [ ] **Step 5: Commit**

```bash
git add src/contracts/ast/mutation/defs.ts src/contracts/ast/mutation-script-builder.ts tests/unit/contracts/ast/mutation/create-task.test.ts
git commit -m "feat(OMN-128): lowerTaskCreate + create/task dispatch with per-key typing and async guard"
```

---

### Task 8: Swap `buildCreateTaskScript` to the AST path; delete the template body

**Files:**

- Modify: `src/contracts/ast/mutation-script-builder.ts` (replace ~lines 503–815 body; delete `buildTaskDataObject`)
- Test: `tests/unit/contracts/ast/mutation-script-builder.test.ts` (rewrite the `buildCreateTaskScript` describe block)

- [ ] **Step 1: Rewrite the test block first.** The 19 legacy cases assert template internals (nonce bridge,
      `Project.byIdentifier` index dance, JXA `app.Task({...})`) that must now FAIL. Rewrite to assert the new contract
      — emitted script contains `evaluateJavascript`, a `JSON.stringify`'d program (no nested backticks: assert
      ``script.split('`').length === 1`` for the OmniJS payload), program contains `new Task(`, loud `Project not found`
      guard, **no** `__BRIDGE_` nonce, **no** `flattenedProjects()[`. Keep/port behavioral cases (dates, tags, special
      characters — special chars now proven safe by JSON.stringify boundary assertions).

- [ ] **Step 2: Run to verify failure** — new assertions fail against the legacy implementation.

- [ ] **Step 3: Implement** — mirror `buildCreateProjectScript`'s post-slice-1 shape exactly:

```typescript
export async function buildCreateTaskScript(data: TaskCreateData): Promise<GeneratedMutationScript> {
  const program = await dispatchMutation('create/task', data);
  validateMutationProgram(program);
  const omnijs = emitProgram(program);
  return {
    script: wrapInLauncher(omnijs, 'create_task'),
    operation: 'create',
    target: 'task',
    description: `Create task: ${data.name}`,
  };
}
```

Delete the entire template body and `buildTaskDataObject`. The standalone `await validateTaskCreate(data)` call
disappears — the guard now runs inside `dispatchMutation` (non-bypass).

- [ ] **Step 4: Run to verify pass** — `npx vitest run tests/unit/contracts/ast/mutation-script-builder.test.ts` PASS;
      `npm run build`; `npm run test:unit` (tool-layer tests mocking this builder may need their mocks' return shapes
      checked — fix forward, don't weaken).

- [ ] **Step 5: Commit**

```bash
git add src/contracts/ast/mutation-script-builder.ts tests/unit/contracts/ast/mutation-script-builder.test.ts
git commit -m "refactor(OMN-128): buildCreateTaskScript emits from the mutation AST — template body + nonce bridge deleted"
```

---

### Task 9: Batch program + swap `buildBatchCreateTasksScript`

**Files:**

- Modify: `src/contracts/ast/mutation/defs.ts`, `src/contracts/ast/mutation-script-builder.ts`
- Test: `tests/unit/contracts/ast/mutation/create-task-batch.test.ts` (create),
  `tests/unit/contracts/ast/mutation-script-builder.test.ts` (batch describe block)

- [ ] **Step 1: Write failing tests** — `create-task-batch.test.ts`:

1. Two specs → program contains `_t0`/`_t1`, `appliedTags_0`/`appliedTags_1` (no redeclaration), two `results.push`
   pairs.
2. `parentTempId` chain: item 1's container is `{kind:'tempIdRef', var:'_t0'}` → emitted `moveTasks([_t1], _t0.ending)`;
   forward/missing `parentTempId` → **build-time** throw naming the tempId.
3. stopOnError=true → `_aborted` flag + `if (!_aborted)` item gating; false → no gating.
4. vm: 2-item batch with tags on both runs to `{results:[…,…]}` with both `success:true` (proves the collision fix at
   runtime, not just by string assert).
5. vm: middle item throws (stub `moveTasks` to throw for a chosen container) → stopOnError=false yields
   `[ok, fail, ok]`; true yields `[ok, fail]` only.
6. Per-item warnings isolation: item 0's best-effort failure lands in item 0's `warnings`, not item 1's.
7. Guard non-bypass for `'batch-create/tasks'` (sandbox negative test).

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement:**

In `defs.ts`:

```typescript
export interface BatchCreateTasksData {
  specs: BatchTaskSpec[];
  stopOnError?: boolean;
}

export function buildBatchCreateTasksProgram(data: BatchCreateTasksData): Program {
  // Exhaustiveness guard over BatchTaskSpec keys (tempId, name, note, flagged, tags,
  // dueDate, deferDate, plannedDate, estimatedMinutes, parentTempId, parentTaskId, projectId).
  const statements: Stmt[] = [bind('results', raw_array()), …];
  // const results = []; let _aborted = false; (raw/bind nodes as in slice-1 idiom)
  const tempIdToVar = new Map<string, string>();
  data.specs.forEach((spec, i) => {
    let container: ContainerResolution | undefined;
    if (spec.parentTempId) {
      const parentVar = tempIdToVar.get(spec.parentTempId);
      if (!parentVar) throw new Error(`parentTempId "${spec.parentTempId}" not created earlier in batch (item ${i})`);
      container = { kind: 'tempIdRef', var: parentVar };
    }
    const { statements: itemStmts, snippetDeps } = lowerTaskCreate(toTaskCreateData(spec), {
      taskVar: `_t${i}`, tagsVar: `appliedTags_${i}`, guardMode: 'throw', …
    }, container);
    statements.push(batchItem(spec.tempId, i, `_t${i}`, itemStmts, data.stopOnError === true));
    tempIdToVar.set(spec.tempId, `_t${i}`);
  });
  statements.push(return_({ results: ref('results') }));
  return { statements, context: 'batch_create_tasks', snippetDeps: dedupe(allDeps) };
}
```

`toTaskCreateData(spec)` maps `projectId → project`, passes `parentTaskId`, drops `tempId`/`parentTempId` (handled at
this layer). The emitter handles `_aborted` gating: when any batchItem has `stopOnError`, wrap each item's emission in
`if (!_aborted) { … }` and declare `let _aborted = false;` (extend the batchItem emission from Task 5 accordingly —
implement the declaration at `emitProgram` level when the program contains any batchItem).

Guard: add to `mutation-script-builder.ts`:

```typescript
export async function validateBatchTaskSpecs(specs: ReadonlyArray<BatchTaskSpec>): Promise<void> {
  if (!isTestMode()) return;
  const inBatch = new Set(specs.map((s) => s.tempId));
  for (const spec of specs) {
    if (spec.parentTempId && inBatch.has(spec.parentTempId)) {
      validateTestTags(spec.tags); // container guarded transitively via the in-batch parent
      continue;
    }
    await validateTaskCreate({
      name: spec.name,
      project: spec.projectId,
      parentTaskId: spec.parentTaskId,
      tags: spec.tags,
    });
  }
}
```

(Extract the tag-prefix tail of `validateTaskCreate` into `validateTestTags(tags)` and reuse — keep
`validateTaskCreate`'s behavior identical.)

Register:
`'batch-create/tasks': { guard: (d) => validateBatchTaskSpecs(d.specs), build: buildBatchCreateTasksProgram } as MutationDef<BatchCreateTasksData>`.

Swap the builder (now **async** — spec §1):

```typescript
export async function buildBatchCreateTasksScript(
  specs: BatchTaskSpec[],
  options: { stopOnError?: boolean } = {},
): Promise<GeneratedMutationScript> {
  const program = await dispatchMutation('batch-create/tasks', { specs, stopOnError: options.stopOnError === true });
  validateMutationProgram(program);
  const omnijs = emitProgram(program);
  return {
    script: wrapInLauncher(omnijs, 'batch_create_tasks'),
    operation: 'create',
    target: 'task',
    description: `Batch-create ${specs.length} task(s)`,
  };
}
```

Delete the legacy `omniBody` template. **Launcher-shape note:** legacy batch returned the OmniJS payload RAW (comment at
old lines ~919–921: pre-wrapping would double-wrap under `OmniAutomation.executeJson`). `wrapInLauncher` also returns
`app.evaluateJavascript(...)` raw, so the shape is preserved — verify in Step 4 by checking the batch caller's parsing
(`OmniFocusWriteTool.ts` ~line 1818 onward) still receives `{results: […]}` via a unit test at the tool layer.

- [ ] **Step 4: Run to verify pass** — new tests + full `npm run test:unit`; fix the batch describe block in
      `mutation-script-builder.test.ts` the same way as Task 8 Step 1.

- [ ] **Step 5: Commit**

```bash
git add src/contracts/ast/mutation/defs.ts src/contracts/ast/mutation-script-builder.ts tests/unit/contracts/ast/mutation/create-task-batch.test.ts tests/unit/contracts/ast/mutation-script-builder.test.ts
git commit -m "refactor(OMN-128): buildBatchCreateTasksScript emits unrolled AST program — byTempId map deleted"
```

---

### Task 10: Tool layer — awaits, in-program repetition, warnings pass-through

**Files:**

- Modify: `src/tools/unified/OmniFocusWriteTool.ts`
- Test: `tests/unit/tools/` (existing write-tool test files covering create; extend)

- [ ] **Step 1: Write failing tests** — tool-layer unit tests (mock `execJson`):

1. `handleTaskCreate` passes `repetitionRule` through to the builder (spy on `buildCreateTaskScript` args) and does
   **not** issue a second post-create script.
2. A create response with `warnings: ['tags: boom']` in the script envelope surfaces `warnings` in the MCP response data
   (single create, project create, and batch per-item).
3. Batch fast path awaits the now-async `buildBatchCreateTasksScript`.

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement:**
- Line ~416–435: keep `createArgs` assembly, **add** `repetitionRule` into `convertedTaskData` (it needs no UTC
  conversion), delete the `repetitionRuleForCreate` extraction and the line ~455 `applyRepetitionRulePostCreate` call.
- Batch orchestrator per-item create (~line 2003–2034): add `repetitionRule: item.repetitionRule` to `taskData`, delete
  the `applyRepetitionRuleSilently` call.
- Delete both helpers (`applyRepetitionRulePostCreate` ~line 673, `applyRepetitionRuleSilently` ~line 2107) after
  `grep -n "applyRepetitionRule" src/ -r` confirms no other callers.
- `await` the two `buildCreateProjectScript` call sites (~1211, ~1944) and the `buildBatchCreateTasksScript` site
  (~1818).
- Warnings pass-through: in `handleTaskCreate`'s success response and `handleProjectCreate`'s, lift
  `parsedResult.warnings` into the response data when non-empty (key: `warnings`); batch results already carry per-item
  objects — ensure the per-item `warnings` field survives the result mapping.

**Behavior note for the commit body:** repetition failures were a silent post-create log line; they are now an explicit
`warnings` entry on a successful create (OMN-137 semantics, Kip-approved).

- [ ] **Step 4: Run to verify pass** — `npm run build && npm run test:unit` green.

- [ ] **Step 5: Commit**

```bash
git add src/tools/unified/OmniFocusWriteTool.ts tests/unit/tools/
git commit -m "feat(OMN-128/OMN-137): tool layer — in-program repetition, warnings pass-through, async builder awaits"
```

---

### Task 11: Barrel exports + dead-code sweep

**Files:**

- Modify: `src/contracts/ast/mutation/index.ts`
- Test: extend one mutation test file to import via the barrel (slice-1 carry-over #3)

- [ ] **Step 1:** Add new exports (`lowerRepetitionRule`, `lowerTaskCreate`, `buildCreateTaskProgram`,
      `buildBatchCreateTasksProgram`, new node factories/types) to `index.ts`. Convert `create-task.test.ts`'s imports
      to use the barrel (`../../../../../src/contracts/ast/mutation/index.js`) so the barrel is exercised by tests.
- [ ] **Step 2:** Dead-code sweep with the cascade rule in mind (barrel edits reveal masked orphans):
      `npx ts-prune | grep -i "mutation\|repetition"` and
      `grep -rn "OMNIJS_PARSE_TAG_PATH\|OMNIJS_RESOLVE_OR_CREATE_TAG_PATH" src/` — the legacy snippet consts in
      `mutation-script-builder.ts` may now be unused by the create paths but still used by update/tag builders; delete
      ONLY what has zero remaining references, list survivors in the commit body.
- [ ] **Step 3:** `npm run build && npm run test:unit && npm run lint` — all green.
- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "chore(OMN-128): barrel exports exercised by tests + dead legacy create-path code removed"
```

---

### Task 12: Gates + OMN-138 live integration tests

**Files:**

- Create: `tests/integration/tools/unified/create-paths.test.ts` (follow the structure/conventions of
  `tests/integration/tools/unified/field-roundtrip.test.ts`, incl. `__TEST__` naming + cleanup discipline — see memory
  note on integration inbox leaks: clean up created tasks by id in `afterAll`, not folder-scoped only)

- [ ] **Step 1:** Write live integration tests (these run against real OmniFocus via `npm run test:integration` — use
      npm, not bun):

1. Single create round-trip: inbox task (`__TEST__`-prefixed) with note/dates/flag/estimatedMinutes/tags + weekly
   repetition → read back every field via `omnifocus_read`-equivalent script or the read tool harness used by the
   existing tests → delete.
2. Loud not-found: create with bogus project → expect error response, then **search for the task name and assert zero
   hits** (regression check for the silent inbox-fallback).
3. Batch: 3-item `parentTempId` chain → assert parentage via read-back → delete all.

- [ ] **Step 2:** `npm run build && npm run test:unit && npm run lint` — green.
- [ ] **Step 3:** `npm run test:integration` — green (requires OmniFocus running; ~4min).
- [ ] **Step 4: Commit**

```bash
git add tests/integration/tools/unified/create-paths.test.ts
git commit -m "test(OMN-128/OMN-138): live integration coverage for single + batch create paths"
```

---

### Task 13: Live `/verify` matrix + unguarded-window pressure test (parent session, NOT a subagent)

This task is executed in the main session with Kip-visible output — it drives the real OmniFocus database.

- [ ] **Step 1:** Via the **guarded** `omnifocus-dev` server (edit src → `/mcp` reconnect; sandbox
      `__MCP_TEST_SANDBOX__`), run spec §6.1 items 1–6 (all-fields create, by-name/by-id project, subtask, loud
      not-found, batch chain + stopOnError both ways, warnings path, repetition read-back).
- [ ] **Step 2:** Negative guard checks: non-sandbox single create AND non-sandbox batch spec both refused server-side
      (`TEST GUARD` errors).
- [ ] **Step 3:** Pressure-test the residual **unguarded ad-hoc window** needed for non-sandbox verifies (root placement
      equivalent for tasks = inbox; arbitrary project): enumerate what is exposed while the unguarded server runs, how
      long, and what bounds it; record findings + mitigation in the verify notes (Obsidian verify-findings note per
      slice-1 convention).
- [ ] **Step 4:** Record the full verify transcript summary in the PR body; any bug found → fix + regression test
      (vm-execution layer if it's a runtime-shape bug, per the slice-1 `appliedTags` lesson) before proceeding.
- [ ] **Step 5:** Cleanup: delete all `__TEST__`/sandbox artifacts created during verify.

---

### Task 14: Finish — docs touch, PR, review gate

- [ ] **Step 1:** Update `docs/dev/OMNIJS-FIRST-PATTERN.md` ONLY if it references the create-task template as an example
      (grep first); update `src/contracts/ast/mutation/` header comments that say "create/project vertical slice" to
      reflect the broader op set. Do NOT version-pin or count tests in prose (CLAUDE.md stable-anchor rule;
      `tests/unit/docs/claude-md-paths.test.ts` guards path references).
- [ ] **Step 2:** `git pull --rebase` (against freshly-fetched main), full gates one more time:
      `npm run build && npm run test:unit && npm run lint && npm run test:integration`.
- [ ] **Step 3:** Push branch, open PR with `--repo kip-d/omnifocus-mcp` targeting `main`; PR body: spec/plan links,
      behavior deltas (loud not-found, OMN-137 warnings incl. create/project, repetition in-program + helpers deleted),
      verify findings, the standard footer.
- [ ] **Step 4:** Final whole-PR `superpowers:code-reviewer` over the commit range; merge ONLY on "Safe to merge" via
      `gh pr merge <n> --repo kip-d/omnifocus-mcp --squash --auto` (never `--admin`). Verify the squash SHA lands on
      freshly-fetched main.
- [ ] **Step 5:** Linear OMN-128 comment (lifecycle-precise: merged ≠ deployed), note OMN-137 partial landing (create
      paths only — ticket stays open for update/delete paths), OMN-138 partial landing, and OMN-134/OMN-136 erasure
      check (per the 2026-06-09 daily-note analysis: nonce dance deleted on create paths this slice).

---

## Out of scope (do not let tasks grow into these)

- `sequential` on task create: `handleTaskCreate` collects it but `TaskCreateData` has no such field — pre-existing
  silent drop, NOT introduced here; file/extend a ticket if it matters, don't fix in this PR.
- `estimatedMinutes: 0` dropped (legacy falsy check) — preserved deliberately.
- Date-validation tightening (`Invalid Date` swallow in `dateExpr`) — schema-layer work.
- update/complete/delete/bulk/tag builders; OMN-129 read-side retrofit.
- The TempIdResolver-based slow batch orchestration (projects + mixed ops) beyond the per-item create call-site changes
  in Task 10.
