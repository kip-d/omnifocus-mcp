# OMN-162/OMN-166: Tasks-Side Inert Filter Rejection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tasks/export queries reject the two live-verified inert filter keys (`folder` — OMN-162; `status:'on_hold'` —
OMN-166) with steering errors, and a 3-site match-all AST guard kills the `literal(true)` silent-widening hazard
structurally.

**Architecture:** Mirror OMN-156's disposition-registry pattern onto the tasks compile path
(`QueryCompiler.transformFilters`/`transformFlatFilter`), which serves tasks AND export queries (projects route
separately via `transformProjectFilters` — untouched). All rejections are compile-layer `z.ZodError`s (surface as
`VALIDATION_ERROR` via `BaseTool`); the shared Zod schema keeps the `folder` key (projects need it).

**Tech Stack:** TypeScript, Zod, Vitest. No OmniJS/script changes — this is entirely in the compile layer.

**Spec:** `docs/superpowers/specs/2026-06-12-omn-162-tasks-folder-filter-design.md` (read it first; §3.1–§3.3 are the
contract).

**Critical spec rules (implementers MUST honor):**

1. Enforcement rejects on `disposition === 'reject'` ONLY — never `!== 'map'`. The base `transformFlatFilter` call
   receives the FULL input including `AND`/`OR`/`NOT` keys (`QueryCompiler.ts:118`); a `!== 'map'` check would reject
   every operator-using query.
2. Error texts say "tasks or export queries" (the path is shared); they must name the working alternative
   (projects-by-folder → tasks-by-projectId).
3. The base match-all guard counts defined (`!== undefined`) top-level input keys EXCLUDING `AND`/`OR`/`NOT`; zero such
   keys (browse) never triggers it.
4. The tasks module defines its OWN `Disposition` union (`'map' | 'compose' | 'reject'`) — do NOT import the projects
   one (`'map' | 'merge' | 'reject'`).

---

### Task 1: `TASK_KEY_DISPOSITION` registry module + parity test

**Files:**

- Create: `src/tools/unified/compilers/task-key-disposition.ts`
- Test: `tests/unit/tools/unified/compilers/task-key-disposition.test.ts`

- [ ] **Step 1: Write the failing test**

Model on `tests/unit/tools/unified/compilers/transform-project-filters.test.ts:123-142` (the MUTATION_DEFS-pattern
parity block). Use the OMN-47 parity export `FILTER_FIELD_NAMES` from `src/tools/unified/schemas/read-schema.ts:111`.

```typescript
import { describe, it, expect } from 'vitest';
import {
  TASK_KEY_DISPOSITION,
  FOLDER_TASKS_REJECTION,
  ON_HOLD_TASKS_REJECTION,
} from '../../../../../src/tools/unified/compilers/task-key-disposition.js';
import { FILTER_FIELD_NAMES } from '../../../../../src/tools/unified/schemas/read-schema.js';

describe('TASK_KEY_DISPOSITION parity (OMN-162; OMN-156 pattern)', () => {
  it('covers every schema filter key plus AND/OR/NOT — no more, no less', () => {
    const expected = [...FILTER_FIELD_NAMES, 'AND', 'OR', 'NOT'].sort();
    expect(Object.keys(TASK_KEY_DISPOSITION).sort()).toEqual(expected);
  });
  it('AND/OR/NOT are compose (handled structurally, never rejected as keys)', () => {
    expect(TASK_KEY_DISPOSITION.AND).toBe('compose');
    expect(TASK_KEY_DISPOSITION.OR).toBe('compose');
    expect(TASK_KEY_DISPOSITION.NOT).toBe('compose');
  });
  it('folder is reject; every other flat key is map', () => {
    expect(TASK_KEY_DISPOSITION.folder).toBe('reject');
    const nonMap = Object.entries(TASK_KEY_DISPOSITION)
      .filter(([k, d]) => d !== 'map' && !['AND', 'OR', 'NOT'].includes(k))
      .map(([k]) => k);
    expect(nonMap).toEqual(['folder']);
  });
  it('rejection messages name the working alternative', () => {
    expect(FOLDER_TASKS_REJECTION).toMatch(/projects with filters\.folder/);
    expect(FOLDER_TASKS_REJECTION).toMatch(/projectId/);
    expect(ON_HOLD_TASKS_REJECTION).toMatch(/status:'on_hold'/);
    expect(ON_HOLD_TASKS_REJECTION).toMatch(/projectId/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/tools/unified/compilers/task-key-disposition.test.ts` Expected: FAIL — module not found.

- [ ] **Step 3: Write the module**

```typescript
import type { FlatFilterValue } from '../schemas/read-schema.js';

type TaskInputKey = keyof FlatFilterValue | 'AND' | 'OR' | 'NOT';
// Tasks-local union — the projects one is 'map' | 'merge' | 'reject' (transform-project-filters.ts);
// deliberately NOT shared (spec §3.1).
type Disposition = 'map' | 'compose' | 'reject';

/**
 * OMN-162 (OMN-156 pattern): every input-schema filter key has an explicit
 * TASKS-side disposition. `satisfies` makes a NEW schema field a compile error
 * here until someone decides its tasks behavior — silent inert keys are
 * structurally impossible. 'compose' = structural operator handled by
 * transformFilters (skipped by key enforcement — see spec §3.1 enforcement rule).
 */
export const TASK_KEY_DISPOSITION = {
  id: 'map',
  status: 'map', // value-level exception: 'on_hold' rejects in transformStatus (OMN-166)
  completed: 'map',
  tags: 'map',
  project: 'map',
  projectId: 'map',
  parentTaskId: 'map',
  dueDate: 'map',
  deferDate: 'map',
  plannedDate: 'map',
  completionDate: 'map',
  added: 'map',
  flagged: 'map',
  blocked: 'map',
  available: 'map',
  inInbox: 'map',
  text: 'map',
  estimatedMinutes: 'map',
  name: 'map',
  folder: 'reject', // OMN-162: inert on tasks — was silent match-all. Capability work: OMN-167.
  AND: 'compose',
  OR: 'compose',
  NOT: 'compose',
} as const satisfies Record<TaskInputKey, Disposition>;

export const FOLDER_TASKS_REJECTION =
  'filters.folder is not supported on tasks or export queries — it previously matched nothing and silently returned all tasks. ' +
  'To get tasks in a folder: query projects with filters.folder first, then query tasks by projectId. ' +
  'folder remains supported on projects queries.';

export const ON_HOLD_TASKS_REJECTION =
  "status:'on_hold' is not supported on tasks or export queries — on-hold is a project status. " +
  "Query projects with status:'on_hold' first, then tasks by projectId. " +
  '(Tasks whose project is on hold also match available:false.)';
```

NOTE: `FlatFilterValue` must be exported from read-schema.ts — verify (transform-project-filters.ts already imports it,
so it is). The final `available:false` sentence is provisional pending Task 7 live verification.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/tools/unified/compilers/task-key-disposition.test.ts` Expected: PASS (all 4).

- [ ] **Step 5: Commit**

```bash
git add src/tools/unified/compilers/task-key-disposition.ts tests/unit/tools/unified/compilers/task-key-disposition.test.ts
git commit -m "feat(OMN-162): TASK_KEY_DISPOSITION registry — tasks-side mirror of OMN-156's disposition pattern"
```

---

### Task 2: Enforce `folder` rejection in `transformFlatFilter`

**Files:**

- Modify: `src/tools/unified/compilers/QueryCompiler.ts` (method `transformFlatFilter`, ~line 174; its three call sites
  ~lines 118, 124, 150 pass an origin)
- Test: `tests/unit/tools/unified/compilers/QueryCompiler.test.ts` (append a new `describe`)

- [ ] **Step 1: Write the failing tests**

Follow the existing test-file conventions (it instantiates `QueryCompiler` and calls `compile`/`transformFilters` — read
the top of the file first). Cover:

```typescript
describe('OMN-162: folder rejects on tasks/export queries', () => {
  // base: filters: { folder: 'Work' } → throws, message matches /not supported on tasks or export/
  //   and names BOTH steering steps: /filters\.folder/ and /projectId/
  // base null shape: filters: { folder: null } → same rejection (folderTopLevel was equally inert)
  // AND item: filters: { AND: [{ folder: 'Work' }] } → throws, error path includes ['query','filters','AND',0]
  // OR branch: filters: { OR: [{ folder: 'Work' }, { flagged: true }] } → throws, path includes ['query','filters','OR',0]
  // export query type: compile({ type: 'export', filters: { folder: 'Work' } }) → throws (shared path)
  // control: filters: { flagged: true } does NOT throw
});
```

Projects regression guard (same file or transform-project-filters.test.ts — wherever projects compile is already
tested): `compile({ type: 'projects', filters: { folder: 'Work' } })` still maps to `folderName` — must NOT regress.

- [ ] **Step 2: Run to verify the new tests fail**

Run: `npx vitest run tests/unit/tools/unified/compilers/QueryCompiler.test.ts` Expected: new describe FAILs (no
rejection thrown); all pre-existing tests PASS.

- [ ] **Step 3: Implement**

In `transformFlatFilter`, add an `origin` parameter (default `'filters'`, e.g. `AND[0]`, `OR[1]` from the call sites —
the call sites already build those strings for `MergeSource.origin`; reuse them). At the TOP of the method:

```typescript
// OMN-162: tasks-side key dispositions. Reject on disposition === 'reject' ONLY —
// the base call passes the full input (AND/OR/NOT included), so a !== 'map'
// check would reject every operator-using query (spec §3.1 enforcement rule).
for (const key of Object.keys(input)) {
  if ((input as Record<string, unknown>)[key] === undefined) continue;
  if ((TASK_KEY_DISPOSITION as Record<string, string>)[key] === 'reject') {
    throw new z.ZodError([
      {
        code: z.ZodIssueCode.custom,
        path: originToPath(origin), // ['query','filters'] | ['query','filters','AND',i] | ['query','filters','OR',i]
        message: FOLDER_TASKS_REJECTION,
      },
    ]);
  }
}
```

Implement `originToPath` as a tiny private helper (parse `AND[i]`/`OR[i]`; plain `'filters'` → `['query','filters']`).
Note: today `folder` is the only `'reject'` key, so a single message constant is fine; if a second reject key is ever
added, switch to a per-key message map (leave a one-line comment saying so). Remove the now-dead
`folder`/`folderTopLevel` mapping at lines ~211-221 **only if** nothing else reaches it through this path —
`transformProjectFilters` has its own folder mapping, so the tasks-side mapping IS dead once rejection precedes it;
delete it and the OMN-96 comment block pointer (the decision record in read-schema.ts stays).

- [ ] **Step 4: Run the full unit suite**

Run: `npm run test:unit` Expected: PASS. If `tests/unit/architecture/schema-impl-parity.test.ts` or filter-merge tests
reference `TaskFilter.folder` mapping, update them to the new contract (rejection) — do not weaken unrelated assertions.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "fix(OMN-162): tasks/export queries reject filters.folder with steering (was silently inert)"
```

---

### Task 3: `status:'on_hold'` value-level rejection (OMN-166)

**Files:**

- Modify: `src/tools/unified/compilers/QueryCompiler.ts` (method `transformStatus`, ~line 256)
- Test: `tests/unit/tools/unified/compilers/QueryCompiler.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
describe('OMN-166: status on_hold rejects on tasks/export queries', () => {
  // filters: { status: 'on_hold' } → throws /not supported on tasks or export/ and /projectId/
  // OR branch { OR: [{ status: 'on_hold' }, { flagged: true }] } → throws (would have been match-all)
  // control: status 'active' | 'completed' | 'dropped' still compile (completed/dropped keys set)
  // projects regression: compile({ type: 'projects', filters: { status: 'on_hold' } }) still maps to ['onHold']
});
```

- [ ] **Step 2: Run to verify they fail** — `npx vitest run tests/unit/tools/unified/compilers/QueryCompiler.test.ts`

- [ ] **Step 3: Implement**

In `transformStatus`, replace the silent no-op (the "`on_hold` has no task-level equivalent … follow-up to OMN-50"
comment at ~line 268) with:

```typescript
} else if (input.status === 'on_hold') {
  // OMN-166: was a silent match-all — on_hold set only the dead projectStatus key.
  throw new z.ZodError([{
    code: z.ZodIssueCode.custom,
    path: ['query', 'filters', 'status'],
    message: ON_HOLD_TASKS_REJECTION,
  }]);
}
```

Keep the trailing `projectStatus` mapping for the OTHER values exactly as-is (filter-merge uses it for conflict naming;
conflicts surface under the internal name `projectStatus` — known and accepted, spec §3.2).

- [ ] **Step 4: Run unit suite** — `npm run test:unit` → PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "fix(OMN-166): tasks/export queries reject status:'on_hold' with steering (was silently inert)"
```

---

### Task 4: 3-site match-all AST guard

**Files:**

- Modify: `src/tools/unified/compilers/QueryCompiler.ts` (`transformFilters`, ~lines 117-167; `usableKeyCount`
  ~line 392)
- Test: `tests/unit/tools/unified/compilers/QueryCompiler.test.ts`

- [ ] **Step 1: Write the failing tests**

The guard's firing condition can no longer be reached through the public input (folder/on_hold reject earlier), so test
the exported helper directly with a hand-built `TaskFilter`, plus non-firing paths through `transformFilters`:

```typescript
describe('OMN-162: match-all compile guard (literal(true) hazard)', () => {
  // helper: compilesToMatchAll({ folder: 'X' } as TaskFilter) === true   (synthetic inert key — type still has folder)
  // helper: compilesToMatchAll({ flagged: true }) === false
  // helper: compilesToMatchAll({}) === true (matches everything — callers gate on key count)
  // transformFilters does NOT throw for one minimal filter per supported key family (spec §3.3 invariant):
  //   id, status:'active', completed, tags:{any:['x']}, project, projectId, parentTaskId,
  //   dueDate:{before:...}, deferDate, plannedDate, completionDate, added,
  //   flagged, blocked, available, inInbox, text:{contains}, name:{contains}, estimatedMinutes:{lessThan:30}
  //   — assert each compiles without throwing, both as base AND as a single OR branch with a {flagged:true} sibling.
  // transformFilters does NOT throw for filters: {} and for absent filters (browse).
});
```

- [ ] **Step 2: Verify new tests fail** (helper doesn't exist).

- [ ] **Step 3: Implement**

Export from QueryCompiler module (or a small helper file) using the AST layer:

```typescript
import { buildAST } from '../../../contracts/ast/builder.js';
import { isLiteralNode } from '../../../contracts/ast/types.js';

export function compilesToMatchAll(filter: TaskFilter): boolean {
  const node = buildAST(filter);
  return isLiteralNode(node) && node.value === true;
}
```

Wire three sites in `transformFilters` (keep the existing `usableKeyCount === 0` checks FIRST — their "empty item"
message is better for genuinely empty items):

1. each `AND[i]`: after the zero-key check, `if (compilesToMatchAll(transformed)) throw` — message per spec §3.3, path
   `['query','filters','AND',i]`;
2. each `OR[i]`: same, path `['query','filters','OR',i]`;
3. base: after `mergeConflictChecked` and BEFORE attaching `orBranches` — if the input had ≥1 defined top-level key
   excluding `AND`/`OR`/`NOT`, and `compilesToMatchAll(merged)`, throw with path `['query','filters']`.

Error text (OR shown; AND/base substitute the site name):

> `OR[${i}] contains no executable conditions — its keys are accepted by the schema but compile to no task-level filter, which would silently match every task. Remove the branch or use a supported tasks filter.`

CAUTION: `buildAST` accepts `TaskFilter | NormalizedTaskFilter` — the merged/transformed values here are plain
`TaskFilter`s; no normalization needed before the check. Do NOT pass the final filter with `orBranches` attached to the
base-site check.

- [ ] **Step 4: Run unit suite** — `npm run test:unit` → PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "fix(OMN-162): 3-site match-all compile guard — branches/base that compile to literal(true) reject"
```

---

### Task 5: Documentation & advertisement sync

**Files:**

- Modify: `docs/spec/read-filters.md` (lines ~99 §3.4 row, ~197 §8 D7 row, ~225 C12 row — grep `folder` to catch all)
- Modify: `src/tools/unified/OmniFocusReadTool.ts` (description, FILTER OPERATORS block ~line 244)
- Modify: `src/tools/unified/schemas/read-schema.ts` (folder field comment ~line 102)

- [ ] **Step 1: read-filters.md**

- §3.4 `folder` (tasks) row → "Rejects with steering on tasks/export queries (OMN-162): error names the
  projects-by-folder → tasks-by-projectId recipe. Capability work parked as OMN-167. (Was: zero implementation, silent
  no-op.)"
- §8 D7 row: resolution column → "RESOLVED by OMN-162 (rejection); capability = OMN-167".
- Add a D-row or note for on_hold if §8 tracks it (grep `on_hold` in the doc; the tasks `status` vocabulary row in §3
  must say on_hold rejects with steering → OMN-166).
- C12 row (~225): update the tasks-folder clause to "tasks folder → rejects (OMN-162)".

- [ ] **Step 2: Tool description** (`OmniFocusReadTool.ts` ~line 244)

Change the folder line to:

```
- folder (projects queries ONLY): "<name>" matches folder-name substring; null = top-level projects only. On tasks/export queries folder and status: "on_hold" are rejected with guidance (query projects first, then tasks by projectId)
```

- [ ] **Step 3: Schema comment** (`read-schema.ts` ~line 102): append to the folder field comment: "Tasks/export queries
      REJECT this key with steering (OMN-162) — enforcement in QueryCompiler via TASK_KEY_DISPOSITION." Do not change
      the Zod type (projects need the key; OMN-122 layering).

- [ ] **Step 4: Verify guards**

Run: `npm run test:unit` (the claude-md-paths/doc-reference CI guard runs here) Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "docs(OMN-162): read-filters spec + tool description + schema comment reflect tasks-side rejection"
```

---

### Task 6: Integration tests (live)

**Files:**

- Create: `tests/integration/tasks-filter-rejection.test.ts`

- [ ] **Step 1: Write the test file**

Mirror `tests/integration/projects-filter-rejection.test.ts` exactly (shared client via `getSharedClient`,
`RUN_INTEGRATION_TESTS` gate, read-only — no fixtures, no sandbox, no cleanup):

- tasks + `filters: { folder: 'Bills' }` → rejects, `/not supported on tasks or export/i` and `/projectId/`
- tasks + `filters: { OR: [{ folder: 'Bills' }, { flagged: true }] }` → rejects (the live match-all shape from the
  OMN-162 probe)
- tasks + `filters: { status: 'on_hold' }` → rejects, `/on-hold is a project status/i`
- regression: projects + `filters: { folder: 'Bills' }` → succeeds (folder still works on projects)
- control: tasks + `filters: { flagged: true }, limit: 1` → succeeds

- [ ] **Step 2: Do NOT run the integration suite here** — it runs once in Task 8 (full suite, ~15-16 min, OMN-143
      rules). Typecheck only: `npm run build` → PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/tasks-filter-rejection.test.ts && git commit -m "test(OMN-162/OMN-166): integration coverage — tasks-side folder/on_hold rejection, projects regression"
```

---

### Task 7: Live verification of the `available:false` hint — ✅ RESOLVED AT PLAN TIME

- [x] **Verified 2026-06-12 on prod (buildId e3d84ef9):** on-hold project `iTUbAGEhKtX` ("Dungeon Boss") has 2
      incomplete tasks; `{projectId, completed:false, available:false}` also counts 2 (2/2 match). The `available:false`
      parenthetical in `ON_HOLD_TASKS_REJECTION` is verified — keep it as written in Task 1. Implementers: no action.

---

### Task 8: Full gates

- [ ] **Step 1:** `npm run build` → clean. `npm run test:unit` → all pass.
- [ ] **Step 2:** Full integration suite per OMN-143 rules: launch with `run_in_background` (NEVER foreground, NEVER
      kill; ~15-16 min): `npm run test:integration`. All pass; pre-existing failures (if any) triaged against main
      before blaming this branch.
- [ ] **Step 3:** Conformance: `npm run conformance` (probe owns the Ollama lifecycle since OMN-163 — no manual
      start/stop). Compare against 2026-06-12 baselines (95% primary / 89% secondary); the description/schema changes
      touch the conformance surface. A drop ≥2 points blocks the PR pending investigation.
- [ ] **Step 4:** Commit any straggler fixes; hand off to PR + review gates (controller: code-review subagent, SAFE
      verdict gates the `gh pr merge --squash --auto` merge; PR targets kip-d/omnifocus-mcp).
