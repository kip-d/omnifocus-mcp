# OMN-154 Count Honesty Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `metadata.total_count` reports the full matching population (not the returned rows) on tasks, projects, and
folders read queries, with `truncated: true` whenever rows are missing.

**Architecture:** OmniJS scripts count every predicate match while still capping the rows they project (the scan already
traverses the whole collection — the limit check is a `forEach` body-skip). The envelope consumes the population at ONE
seam: a shared `applyCountHonesty` helper called by both response builders. Handlers pass the script's `total_matched`
through (and into caches). See the approved spec: `docs/superpowers/specs/2026-06-12-omn-154-count-honesty-design.md` —
R1–R9 and D1–D7 are normative; read it before starting.

**Tech Stack:** TypeScript, Zod, vitest (unit + live integration), OmniJS script generation in
`src/contracts/ast/script-builder.ts`, `node:vm` for executing generated OmniJS in unit tests.

**Worktree:** `/Users/kip/src/omnifocus-mcp/.claude/worktrees/omn-154-count-honesty`, branch
`worktree-omn-154-count-honesty`. All commands run from this directory.

**Conventions that bite:**

- `npm run build` before anything that executes the server.
- Unit tests: `npx vitest run <file>` (fast, safe). Integration tests: ONLY via `npm run test:integration` as a
  background process — never kill a running vitest integration process (orphaned teardowns hit the live OmniFocus
  database).
- The pre-commit hook runs prettier via lint-staged; committed files may be reformatted — that's expected.
- Metadata keys are snake_case (an ESLint rule enforces this).

---

### Task 1: `applyCountHonesty` helper + response-builder wiring

The single envelope seam (spec §5.3, R1/R2/R3/R5/R9).

**Files:**

- Modify: `src/utils/response-format.ts` (helper + `createTaskResponseV2` + `createListResponseV2`)
- Test: `tests/unit/utils/count-honesty.test.ts` (new file)

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/utils/count-honesty.test.ts`:

```typescript
/**
 * OMN-154: applyCountHonesty — the one envelope seam where population counts
 * land. R1 (total_count = population), R2 (truncated iff offset + returned <
 * population), R3 (summary headline counts + insight line), R5 (one truncated
 * flag), R9 (no-population fallback preserves current behavior).
 */
import { describe, it, expect } from 'vitest';
import { createTaskResponseV2, createListResponseV2 } from '../../../src/utils/response-format.js';

const task = (name: string) => ({ id: `id-${name}`, name, flagged: false, completed: false });

describe('OMN-154 applyCountHonesty via createTaskResponseV2', () => {
  it('R1: total_count = population, returned_count = rows', () => {
    const r = createTaskResponseV2('tasks', [task('a'), task('b')], {}, { population: 48 });
    expect(r.metadata.total_count).toBe(48);
    expect(r.metadata.returned_count).toBe(2);
  });

  it('R2: truncated true when offset + returned < population', () => {
    const r = createTaskResponseV2('tasks', [task('a'), task('b')], {}, { population: 48 });
    expect(r.metadata.truncated).toBe(true);
  });

  it('R2: complete response has NO truncated key (absent, not false)', () => {
    const r = createTaskResponseV2('tasks', [task('a'), task('b')], {}, { population: 2 });
    expect(r.metadata.total_count).toBe(2);
    expect('truncated' in r.metadata).toBe(false);
  });

  it('R2: last page of a paginated walk reads complete (offset participates)', () => {
    // population 10, offset 8, returned 2 → 8 + 2 = 10 → complete
    const r = createTaskResponseV2('tasks', [task('a'), task('b')], {}, { population: 10, offset: 8 });
    expect('truncated' in r.metadata).toBe(false);
  });

  it('R2: offset past the end reads complete', () => {
    // population 10, offset 50, returned 0 → 50 + 0 >= 10 → complete
    const r = createTaskResponseV2('tasks', [], {}, { population: 10, offset: 50 });
    expect('truncated' in r.metadata).toBe(false);
  });

  it('R2: middle page reads truncated', () => {
    const r = createTaskResponseV2('tasks', [task('a'), task('b')], {}, { population: 10, offset: 2 });
    expect(r.metadata.truncated).toBe(true);
  });

  it('R3: summary.total_count = population; returned_count stays rows; insight line present', () => {
    const r = createTaskResponseV2('tasks', [task('a'), task('b')], {}, { population: 48 });
    expect(r.summary.total_count).toBe(48);
    expect(r.summary.returned_count).toBe(2);
    expect(r.summary.key_insights?.[0]).toBe('Showing 2 of 48 matching tasks (truncated)');
  });

  it('R3: complete response gets no insight line', () => {
    const r = createTaskResponseV2('tasks', [task('a'), task('b')], {}, { population: 2 });
    expect(r.summary.key_insights ?? []).not.toContain('Showing 2 of 2 matching tasks (truncated)');
  });

  it('R9: no counts argument → exact current behavior (echo, no truncated)', () => {
    const r = createTaskResponseV2('tasks', [task('a'), task('b')]);
    expect(r.metadata.total_count).toBe(2);
    expect('truncated' in r.metadata).toBe(false);
  });

  it('R9: population wins over caller-supplied metadata total_count', () => {
    // countOnly injects total_count via the metadata spread; when a population
    // is ALSO supplied, the population is authoritative.
    const r = createTaskResponseV2('tasks', [], { total_count: 7 }, { population: 9 });
    expect(r.metadata.total_count).toBe(9);
  });

  it('R9: metadata spread still wins when no population (countOnly path)', () => {
    const r = createTaskResponseV2('tasks', [], { total_count: 42 });
    expect(r.metadata.total_count).toBe(42);
  });
});

describe('OMN-154 applyCountHonesty via createListResponseV2 (projects)', () => {
  const project = (name: string) => ({ id: `id-${name}`, name, status: 'active' });

  it('R1/R3: total_count and summary.total_projects = population', () => {
    const r = createListResponseV2('projects', [project('p1'), project('p2')], 'projects', {}, { population: 160 });
    expect(r.metadata.total_count).toBe(160);
    expect(r.metadata.returned_count).toBe(2);
    expect(r.metadata.truncated).toBe(true);
    expect((r.summary as Record<string, unknown>).total_projects).toBe(160);
  });

  it('R3: projects key_insight gets the truncation notice prepended', () => {
    const r = createListResponseV2('projects', [project('p1'), project('p2')], 'projects', {}, { population: 160 });
    const insight = (r.summary as Record<string, unknown>).key_insight as string;
    expect(insight.startsWith('Showing 2 of 160 matching projects (truncated)')).toBe(true);
  });

  it('R2: complete projects response has no truncated key', () => {
    const r = createListResponseV2('projects', [project('p1')], 'projects', {}, { population: 1 });
    expect('truncated' in r.metadata).toBe(false);
  });

  it('R9: no counts → echo behavior unchanged', () => {
    const r = createListResponseV2('projects', [project('p1')], 'projects');
    expect(r.metadata.total_count).toBe(1);
    expect('truncated' in r.metadata).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/utils/count-honesty.test.ts` Expected: FAIL — the builders accept no 4th/5th argument
yet, so `total_count` echoes rows (e.g. first test gets 2, not 48).

- [ ] **Step 3: Implement the helper and wire the builders**

In `src/utils/response-format.ts`:

(a) Add the option type + helper (place near `StandardMetadataV2`):

```typescript
/**
 * OMN-154: population counts supplied by handlers when the script reports a
 * pre-limit match count (`total_matched`).
 */
export interface CountHonestyInput {
  /** Full matching population (post-filter, pre-offset/limit). */
  population?: number;
  /** Offset the caller applied; participates in the truncation formula (R2/D5). */
  offset?: number;
}

/**
 * OMN-154 R1/R2/R3: make headline counts report the population and truncation
 * unmistakable. Mutates the already-built response IN PLACE, after the
 * metadata spread — population is authoritative over caller metadata.
 * No-op when no population is supplied (R9: id-lookups, countOnly,
 * perspectives keep current behavior).
 */
export function applyCountHonesty(
  response: { summary?: Record<string, unknown>; metadata: StandardMetadataV2 },
  counts: CountHonestyInput | undefined,
  itemNoun: 'tasks' | 'projects' | 'folders',
): void {
  if (counts?.population === undefined) return;
  const population = counts.population;
  const offset = counts.offset ?? 0;
  const returned = typeof response.metadata.returned_count === 'number' ? response.metadata.returned_count : 0;
  const isTruncated = offset + returned < population;

  response.metadata.total_count = population;
  if (isTruncated) {
    response.metadata.truncated = true;
  }

  const summary = response.summary;
  if (!summary) return;
  if ('total_count' in summary) summary.total_count = population;
  if ('total_projects' in summary) summary.total_projects = population;
  if (isTruncated) {
    const notice = `Showing ${returned} of ${population} matching ${itemNoun} (truncated)`;
    if (Array.isArray(summary.key_insights)) {
      (summary.key_insights as string[]).unshift(notice);
    } else {
      const existing = typeof summary.key_insight === 'string' ? summary.key_insight : undefined;
      summary.key_insight = existing ? `${notice}; ${existing}` : notice;
    }
  }
}
```

(b) `createTaskResponseV2` — add the 4th parameter and apply the helper just before returning. Build the response into a
`const response = { ... }` (the current object literal), then:

```typescript
export function createTaskResponseV2<T>(
  operation: string,
  tasks: T[],
  metadata: Partial<StandardMetadataV2> = {},
  counts?: CountHonestyInput,
): StandardResponseV2<{ tasks: T[] }> {
  // ... existing body unchanged, but capture the literal:
  const response: StandardResponseV2<{ tasks: T[] }> = {
    /* existing literal exactly as today */
  };
  applyCountHonesty(response as { summary?: Record<string, unknown>; metadata: StandardMetadataV2 }, counts, 'tasks');
  return response;
}
```

(c) `createListResponseV2` — same pattern, 5th parameter `counts?: CountHonestyInput`, noun
`itemType === 'projects' ? 'projects' : 'tasks'` is wrong — use:

```typescript
const noun: 'tasks' | 'projects' | 'folders' =
  itemType === 'projects' ? 'projects' : itemType === 'folders' ? 'folders' : 'tasks';
applyCountHonesty(response as { summary?: Record<string, unknown>; metadata: StandardMetadataV2 }, counts, noun);
```

Do NOT change any existing caller in this task — the new parameters are optional (R9).

- [ ] **Step 4: Run the new tests and the existing response-format tests**

Run: `npx vitest run tests/unit/utils/count-honesty.test.ts tests/unit/utils/response-format-utilities.test.ts`
Expected: ALL PASS (existing tests exercise the no-counts path, which R9 keeps byte-identical).

- [ ] **Step 5: Commit**

```bash
git add src/utils/response-format.ts tests/unit/utils/count-honesty.test.ts
git commit -m "feat(OMN-154): applyCountHonesty envelope seam (R1/R2/R3/R9)"
```

---

### Task 2: Unsorted-tasks and inbox scripts emit `total_matched`

Spec R8. The scripts already traverse the whole collection; hoist the limit short-circuit below the predicate and count
every match.

**Files:**

- Modify: `src/contracts/ast/script-builder.ts` (`buildUnsortedScript` ~line 424, `buildInboxScript` ~line 600)
- Test: `tests/unit/contracts/ast/script-builder.test.ts` (flip the pinning test at ~line 778; add vm-execution tests)

- [ ] **Step 1: Flip the pinning test and add failing tests**

In `tests/unit/contracts/ast/script-builder.test.ts`, find the test
`'does not include total_matched when no sort specified'` (~line 778) and REPLACE it — the old expectation pins the bug
(cluster pattern: tests pin bugs):

```typescript
it('includes total_matched on the unsorted path too (OMN-154)', () => {
  const result = buildFilteredTasksScript({ flagged: true }, { limit: 5 });
  expect(result.script).toContain('total_matched: totalMatched');
});
```

In the same describe block (or a new `describe('OMN-154 population counting', ...)`), add vm-execution tests so the
counting is verified by running the generated OmniJS, not by string-matching (the repo's recurring vacuous-green class —
copy the sandbox style from `tests/unit/contracts/ast/mutation/emitter.test.ts`):

```typescript
import * as vm from 'node:vm';

describe('OMN-154: generated scripts count the full population (vm-executed)', () => {
  // Minimal stub matching what the generated predicate/projection touches.
  // The default dropped-exclusion (OMN-157) emits a taskStatus check, so the
  // sandbox provides Task.Status and per-task taskStatus.
  const Task = { Status: { Dropped: 'Dropped', Active: 'Active' } };
  const stubTask = (name: string, flagged: boolean) => ({
    id: { primaryKey: `id-${name}` },
    name,
    flagged,
    completed: false,
    taskStatus: Task.Status.Active,
    inInbox: false,
    tags: [],
    notes: '',
  });

  function runTaskScript(script: string, tasks: unknown[]): { tasks: unknown[]; count: number; total_matched: number } {
    const sandbox: Record<string, unknown> = { flattenedTasks: tasks, inbox: tasks, Task, JSON };
    return JSON.parse(vm.runInNewContext(script, sandbox) as string);
  }

  it('unsorted path: limit 2 against 5 matches → 2 rows, total_matched 5', () => {
    const tasks = [
      stubTask('a', true),
      stubTask('b', true),
      stubTask('c', true),
      stubTask('d', true),
      stubTask('e', true),
      stubTask('f', false),
    ];
    const { script } = buildFilteredTasksScript({ flagged: true }, { limit: 2 });
    const result = runTaskScript(script, tasks);
    expect(result.tasks).toHaveLength(2);
    expect(result.count).toBe(2);
    expect(result.total_matched).toBe(5);
  });

  it('unsorted path with offset: total_matched counts offset-skipped matches too', () => {
    const tasks = [stubTask('a', true), stubTask('b', true), stubTask('c', true), stubTask('d', true)];
    const { script } = buildFilteredTasksScript({ flagged: true }, { limit: 2, offset: 1 });
    const result = runTaskScript(script, tasks);
    expect(result.tasks).toHaveLength(2); // skipped 1, took 2
    expect(result.total_matched).toBe(4);
  });

  it('unsorted path: population equal to limit → total_matched == count', () => {
    const tasks = [stubTask('a', true), stubTask('b', true)];
    const { script } = buildFilteredTasksScript({ flagged: true }, { limit: 5 });
    const result = runTaskScript(script, tasks);
    expect(result.count).toBe(2);
    expect(result.total_matched).toBe(2);
  });

  it('inbox path: limit 1 against 3 matches → total_matched 3', () => {
    const inboxTasks = [
      { ...stubTask('a', false), inInbox: true },
      { ...stubTask('b', false), inInbox: true },
      { ...stubTask('c', false), inInbox: true },
    ];
    const { script } = buildInboxScript({}, { limit: 1 });
    const result = runTaskScript(script, inboxTasks);
    expect(result.tasks).toHaveLength(1);
    expect(result.total_matched).toBe(3);
  });

  it('sorted path still reports total_matched (regression)', () => {
    const tasks = [stubTask('b', true), stubTask('a', true), stubTask('c', true)];
    const { script } = buildFilteredTasksScript(
      { flagged: true },
      { limit: 2, sort: [{ field: 'name', direction: 'asc' }] },
    );
    const result = runTaskScript(script, tasks);
    expect(result.tasks).toHaveLength(2);
    expect(result.total_matched).toBe(3);
  });
});
```

NOTE for the implementer: the stub-task shape may need extra properties if the default field projection touches more
than id/name/flagged/dueDate/deferDate/tags/project/available — run the test, read the vm error, extend the stub. Do NOT
weaken the assertions. If `buildInboxScript`'s inbox collection or completion check differs (it iterates the `inbox`
global), the sandbox above already provides `inbox`.

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx vitest run tests/unit/contracts/ast/script-builder.test.ts` Expected: the flipped pinning test and all new vm
tests FAIL (`total_matched` undefined on unsorted/inbox paths); the sorted-path regression test PASSES.

- [ ] **Step 3: Restructure the two script bodies**

In `src/contracts/ast/script-builder.ts`, `buildUnsortedScript` — current loop:

```javascript
flattenedTasks.forEach(task => {
  if (count >= limit) return;
  ${ctx.completionCheck}
  // Apply AST-generated filter
  if (!matchesFilter(task)) return;
  ${offsetCheck}
  results.push({ ... });
  count++;
});
```

becomes (declare `let totalMatched = 0;` beside `let count = 0;`):

```javascript
flattenedTasks.forEach(task => {
  ${ctx.completionCheck}
  // Apply AST-generated filter
  if (!matchesFilter(task)) return;
  // OMN-154: count every match; the limit caps only the projected rows
  totalMatched++;
  if (count >= limit) return;
  ${offsetCheck}
  results.push({ ... });
  count++;
});
```

and the return payload gains one line:

```javascript
return JSON.stringify({
  tasks: results,
  count: results.length,
  total_matched: totalMatched,
  ${offsetMetadata}
  ...
});
```

Apply the identical transformation to `buildInboxScript` (same loop shape over `inbox.forEach`; its completion check is
`${completionCheck}` before the predicate — keep it before `totalMatched++` so the population respects the completion
default, matching countOnly's predicate).

Do NOT touch `buildSortedScript` (already compliant: `total_matched: allResults.length`).

- [ ] **Step 4: Run the full script-builder test file**

Run: `npx vitest run tests/unit/contracts/ast/script-builder.test.ts tests/unit/contracts/ast/list-tasks-ast.test.ts`
Expected: ALL PASS.

- [ ] **Step 5: Commit**

```bash
git add src/contracts/ast/script-builder.ts tests/unit/contracts/ast/script-builder.test.ts
git commit -m "feat(OMN-154): unsorted + inbox task scripts count the full matching population"
```

---

### Task 3: Projects script emits `total_matched`; JXA wrapper forwards it

Spec R8 (projects arm). Reminder: projects has NO offset option — population math runs with offset 0 (spec R8 note).

**Files:**

- Modify: `src/contracts/ast/script-builder.ts` (`buildFilteredProjectsScript`, OmniJS loop ~line 1239 and JXA wrapper
  metadata ~line 1330)
- Test: `tests/unit/contracts/ast/script-builder.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
describe('OMN-154: projects script counts the full population', () => {
  const Project = {
    Status: { Active: 'Active', Done: 'Done', Dropped: 'Dropped', OnHold: 'OnHold' },
  };
  const stubProject = (name: string, status: string) => ({
    id: { primaryKey: `id-${name}` },
    name,
    status,
    flagged: false,
    folder: null,
    rootTask: null,
    note: '',
  });

  it('script text includes total_matched and the wrapper forwards it', () => {
    const result = buildFilteredProjectsScript({ status: ['active'] }, { limit: 2 });
    expect(result.script).toContain('total_matched: totalMatched');
    // JXA wrapper forwards it in its metadata block
    expect(result.script).toContain('total_matched: result.total_matched');
  });

  it('vm: limit 2 against 4 active → 2 rows, total_matched 4', () => {
    const projects = [
      stubProject('p1', Project.Status.Active),
      stubProject('p2', Project.Status.Active),
      stubProject('p3', Project.Status.Active),
      stubProject('p4', Project.Status.Active),
      stubProject('p5', Project.Status.Done),
    ];
    const generated = buildFilteredProjectsScript({ status: ['active'] }, { limit: 2, performanceMode: 'lite' });
    // Extract the inner OmniJS (the generated .script is the JXA wrapper).
    // The OmniJS source is embedded as a template literal; instead of parsing
    // it out, run the INNER source by rebuilding it: the builder exposes only
    // the wrapped script, so vm-run the wrapper with an Application stub whose
    // evaluateJavascript executes the OmniJS in the same sandbox.
    const sandbox: Record<string, unknown> = {
      flattenedProjects: projects,
      Project,
      JSON,
      Application: () => ({
        evaluateJavascript: (src: string) => vm.runInNewContext(src, sandbox) as string,
      }),
    };
    const raw = vm.runInNewContext(generated.script, sandbox) as string;
    const parsed = JSON.parse(raw) as {
      projects: unknown[];
      metadata: { total_matched: number; returned_count: number; total_available: number };
    };
    expect(parsed.projects).toHaveLength(2);
    expect(parsed.metadata.returned_count).toBe(2);
    expect(parsed.metadata.total_matched).toBe(4);
    expect(parsed.metadata.total_available).toBe(5); // pre-filter total, unchanged
  });
});
```

NOTE for the implementer: `performanceMode: 'lite'` skips the rootTask/taskCounts block, keeping the stub small. The
status helper in the script compares `project.status === Project.Status.Done` etc. — the stub's `status` values must be
the SAME sentinels as the sandbox `Project.Status` object (they are, by construction above). If the lite projection
touches more fields, extend the stub per the vm error. The double-vm trick (Application stub running the inner OmniJS in
the same sandbox) keeps the test at the real seam — the full generated artifact, both layers.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/contracts/ast/script-builder.test.ts -t 'OMN-154: projects script'` Expected: FAIL (no
`total_matched` in script text).

- [ ] **Step 3: Implement**

In `buildFilteredProjectsScript`'s OmniJS source — current loop:

```javascript
flattenedProjects.forEach(project => {
  if (count >= limit) return;
  // Apply AST-generated filter
  if (!matchesFilter(project)) return;
  const proj = { ... };
  ...
  results.push(proj);
  count++;
});
```

becomes (declare `let totalMatched = 0;` beside `let count = 0;`):

```javascript
flattenedProjects.forEach(project => {
  // Apply AST-generated filter
  if (!matchesFilter(project)) return;
  // OMN-154: count every match; the limit caps only the projected rows
  totalMatched++;
  if (count >= limit) return;
  const proj = { ... };
  ...
  results.push(proj);
  count++;
});
```

OmniJS return payload gains `total_matched: totalMatched,` (keep `total_available` — pre-filter total, unchanged, see
spec §2). JXA wrapper metadata block gains `total_matched: result.total_matched,` beside `total_available`.

- [ ] **Step 4: Run the test file**

Run: `npx vitest run tests/unit/contracts/ast/script-builder.test.ts` Expected: ALL PASS.

- [ ] **Step 5: Commit**

```bash
git add src/contracts/ast/script-builder.ts tests/unit/contracts/ast/script-builder.test.ts
git commit -m "feat(OMN-154): projects script counts the full matching population"
```

---

### Task 4: Tasks handler passes the population; `metadata.total_matched` removed (D3)

**Files:**

- Modify: `src/tools/unified/OmniFocusReadTool.ts` (`handleTaskQuery` ~lines 428–473)
- Test: `tests/unit/tools/unified/OmniFocusReadTool.test.ts`

- [ ] **Step 1: Write failing tests**

Follow the file's existing mocking pattern (it stubs `execJson`-level script results — see the countOnly tests around
line 1404). Add:

```typescript
describe('OMN-154: tasks envelope reports population', () => {
  it('total_count = script total_matched; truncated set; metadata.total_matched gone (D3)', async () => {
    // Mock a script result: 2 rows, total_matched 48
    // (shape: { tasks: [...], metadata: { total_matched: 48, sorted_in_script: false } })
    // ... use the file's established execJson mock helper ...
    const result = await callReadTool({ type: 'tasks', filters: { flagged: true }, limit: 2 });
    expect(result.metadata.total_count).toBe(48);
    expect(result.metadata.returned_count).toBe(2);
    expect(result.metadata.truncated).toBe(true);
    expect(result.metadata.total_matched).toBeUndefined(); // D3
    expect(result.summary.total_count).toBe(48);
  });

  it('script without total_matched (defensive): falls back to echo, no truncated (R9)', async () => {
    // Mock metadata without total_matched
    const result = await callReadTool({ type: 'tasks', filters: { flagged: true }, limit: 2 });
    expect(result.metadata.total_count).toBe(2);
    expect('truncated' in result.metadata).toBe(false);
  });

  it('offset rides into the truncation formula', async () => {
    // 2 rows, total_matched 4, offset 2 → 2 + 2 = 4 → complete
    const result = await callReadTool({ type: 'tasks', filters: { flagged: true }, limit: 2, offset: 2 });
    expect('truncated' in result.metadata).toBe(false);
  });

  it('smart_suggest mode inherits the contract (population + truncated)', async () => {
    // Same handler path; post-script re-ranking does not change row count.
    // Mock: 2 rows, total_matched 48, mode smart_suggest.
    const result = await callReadTool({ type: 'tasks', mode: 'smart_suggest', limit: 2 });
    expect(result.metadata.total_count).toBe(48);
    expect(result.metadata.truncated).toBe(true);
  });
});
```

(Exact mock invocation per the file's pattern — the implementer adapts the scaffolding, NOT the assertions.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/tools/unified/OmniFocusReadTool.test.ts -t 'OMN-154'` Expected: FAIL — `total_count`
echoes 2; `total_matched` still in metadata.

- [ ] **Step 3: Implement in `handleTaskQuery`**

- Delete the `...(totalMatched !== undefined ? { total_matched: totalMatched } : {})` line from the metadata literal
  (D3).
- Change the return to pass counts:

```typescript
return createTaskResponseV2('tasks', tasks, metadata, {
  population: totalMatched,
  offset: compiled.offset || 0,
});
```

(`totalMatched` is already extracted at ~line 434; when the script omits it — defensive only after Tasks 2–3 —
`population: undefined` triggers R9 fallback.)

Leave `executeCountOnly` and `executeIdLookup` untouched (R9 / R1 "countOnly unchanged").

- [ ] **Step 4: Run the tool's full unit file**

Run: `npx vitest run tests/unit/tools/unified/OmniFocusReadTool.test.ts` Expected: ALL PASS. If any existing test pinned
`metadata.total_matched` or echo counts on the row path, rewrite it to the new contract (it was pinning the bug) — note
this in the task report.

- [ ] **Step 5: Commit**

```bash
git add src/tools/unified/OmniFocusReadTool.ts tests/unit/tools/unified/OmniFocusReadTool.test.ts
git commit -m "feat(OMN-154): tasks envelope reports matching population, drops total_matched (D3)"
```

---

### Task 5: Projects handler — stop discarding script metadata; cache the population (R6)

**Files:**

- Modify: `src/tools/unified/OmniFocusReadTool.ts` (`handleProjectQuery` ~lines 679–733)
- Test: `tests/unit/tools/unified/OmniFocusReadTool.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
describe('OMN-154: projects envelope reports population', () => {
  it('total_count + summary.total_projects = script total_matched; truncated set', async () => {
    // Mock script result: { projects: [2 rows], metadata: { total_matched: 160, returned_count: 2, total_available: 200 } }
    const result = await callReadTool({ type: 'projects', filters: { status: 'active' }, limit: 2 });
    expect(result.metadata.total_count).toBe(160);
    expect(result.metadata.truncated).toBe(true);
    expect(result.summary.total_projects).toBe(160);
  });

  it('cache hit repeats the honest counts (R6)', async () => {
    // First call populates the cache (mock as above), second call must NOT
    // re-run the script and must still report population, not row echo.
    const first = await callReadTool({ type: 'projects', filters: { status: 'active' }, limit: 2 });
    const second = await callReadTool({ type: 'projects', filters: { status: 'active' }, limit: 2 });
    expect(second.metadata.from_cache).toBe(true);
    expect(second.metadata.total_count).toBe(160);
    expect(second.metadata.truncated).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/tools/unified/OmniFocusReadTool.test.ts -t 'OMN-154: projects'` Expected: FAIL (echo 2;
cached path loses everything).

- [ ] **Step 3: Implement in `handleProjectQuery`**

- After `const resultData = result.data as { projects?: unknown[]; items?: unknown[] };` widen the type to read the
  wrapper metadata:

```typescript
const resultData = result.data as {
  projects?: unknown[];
  items?: unknown[];
  metadata?: { total_matched?: number };
};
const totalMatched = resultData.metadata?.total_matched;
```

- Cache entry becomes `this.cache.set('projects', cacheKey, { projects, totalMatched });` and the cache read type
  becomes `{ projects: unknown[]; totalMatched?: number }`.
- Both response constructions (cached at ~line 686 and fresh at ~line 723) pass `{ population: <totalMatched> }` as the
  new 5th argument to `createListResponseV2` (projects has no offset — omit it, spec R8 note).

- [ ] **Step 4: Run the tool's unit file**

Run: `npx vitest run tests/unit/tools/unified/OmniFocusReadTool.test.ts` Expected: ALL PASS (rewrite any echo-pinning
projects tests; report them).

- [ ] **Step 5: Commit**

```bash
git add src/tools/unified/OmniFocusReadTool.ts tests/unit/tools/unified/OmniFocusReadTool.test.ts
git commit -m "feat(OMN-154): projects envelope + cache carry the matching population (R6)"
```

---

### Task 6: Folders rider (R7)

**Files:**

- Modify: `src/tools/unified/OmniFocusReadTool.ts` (`handleFolderQuery` ~lines 874–914)
- Test: `tests/unit/tools/unified/OmniFocusReadTool.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
describe('OMN-154: folders surface total_available as total_count (R7)', () => {
  it('truncated when the 100-cap hides folders', async () => {
    // Mock script result: { success: true, folders: [100 rows], metadata: { total_available: 120 } }
    const result = await callReadTool({ type: 'folders' });
    expect(result.metadata.total_count).toBe(120);
    expect(result.metadata.returned_count).toBe(100);
    expect(result.metadata.total_folders).toBe(120); // honest alias
    expect(result.metadata.truncated).toBe(true);
  });

  it('complete when population fits', async () => {
    // Mock: 30 folders, total_available 30
    const result = await callReadTool({ type: 'folders' });
    expect(result.metadata.total_count).toBe(30);
    expect('truncated' in result.metadata).toBe(false);
  });

  it('cached folders response repeats the counts (R6)', async () => {
    const first = await callReadTool({ type: 'folders' });
    const second = await callReadTool({ type: 'folders' });
    expect(second.metadata.from_cache).toBe(true);
    expect(second.metadata.total_count).toBe(first.metadata.total_count);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/tools/unified/OmniFocusReadTool.test.ts -t 'OMN-154: folders'` Expected: FAIL
(`total_count` absent; cached path returns no count at all today).

- [ ] **Step 3: Implement in `handleFolderQuery`**

- Read the script's metadata:
  `const resultData = result.data as { folders?: unknown[]; items?: unknown[]; metadata?: { total_available?: number } };`
  and `const totalAvailable = resultData.metadata?.total_available;`
- Cache entry: `this.cache.set('folders', cacheKey, { folders, totalAvailable });` (widen the cache read type to match).
- Both return sites build metadata with `returned_count: folders.length` and `total_folders`, then use the exported
  helper directly (folders use `createSuccessResponseV2`, which has no counts parameter):

```typescript
const response = createSuccessResponseV2('folders', { folders }, undefined, {
  ...timer.toMetadata(),
  operation: 'list',
  returned_count: folders.length,
  total_folders: folders.length,
});
applyCountHonesty(response, { population: totalAvailable }, 'folders');
if (typeof response.metadata.total_count === 'number') {
  response.metadata.total_folders = response.metadata.total_count; // honest alias (R7)
}
return response;
```

(Import `applyCountHonesty` from `../../utils/response-format.js`. The folders query has no filter — pre-filter total =
population, spec R7. Type note: the helper's first parameter expects `summary?: Record<string, unknown>` — apply the
same `as` cast shown in Task 1 step 3(b) if `StandardResponseV2`'s typed summary union doesn't assign directly.)

- [ ] **Step 4: Run the tool's unit file**

Run: `npx vitest run tests/unit/tools/unified/OmniFocusReadTool.test.ts` Expected: ALL PASS.

- [ ] **Step 5: Commit**

```bash
git add src/tools/unified/OmniFocusReadTool.ts tests/unit/tools/unified/OmniFocusReadTool.test.ts
git commit -m "feat(OMN-154): folders surface total_available with truncation honesty (R7)"
```

---

### Task 7: Tool description note + SKILL.md contract update + full unit suite

**Files:**

- Modify: `src/tools/unified/OmniFocusReadTool.ts` (description string, near the countOnly COMMON QUERIES line
  ~line 223)
- Modify: `docs/skills/omnifocus-assistant/SKILL.md` (the "Pagination metadata" paragraph, ~line 513)

- [ ] **Step 1: Add one line to the tool description**

In the `description` string, directly under the `- Count only (fast): ...` COMMON QUERIES line, add:

```
- metadata.total_count always reports the FULL matching population; truncated: true marks a partial result (raise limit or paginate with offset)
```

(The MCP-facing `inputSchema` is untouched — this is response-shape documentation only, spec §5.5.)

- [ ] **Step 2: Rewrite the SKILL.md pagination paragraph (D3)**

`docs/skills/omnifocus-assistant/SKILL.md` (~line 513) documents the now-removed `metadata.total_matched` ("Pagination
metadata: When sort + limit are used, the response metadata includes `total_matched`…"). Replace that paragraph with the
new contract:

```markdown
**Pagination metadata:** `metadata.total_count` always reports the full matching population (not just the returned
rows), and `metadata.truncated: true` appears whenever `offset + returned_count < total_count`. Use these to decide
whether to raise `limit` or page with `offset`; a separate `countOnly` query is no longer needed just to detect
truncation.
```

- [ ] **Step 3: Build and run the FULL unit suite**

Run: `npm run build && npm run test:unit` Expected: ALL PASS. Pay attention to `tests/unit/docs/claude-md-paths.test.ts`
and `tests/unit/architecture/schema-impl-parity.test.ts` — they guard description/docs drift. Fix forward if they flag
the new line.

- [ ] **Step 4: Commit**

```bash
git add src/tools/unified/OmniFocusReadTool.ts docs/skills/omnifocus-assistant/SKILL.md
git commit -m "docs(OMN-154): document total_count population semantics + truncated flag"
```

---

### Task 8: Live integration test (AC probes, C11 shape)

**Files:**

- Create: `tests/integration/count-honesty.test.ts`

- [ ] **Step 1: Write the integration test**

Use the harness pattern from `tests/integration/name-filter-scope.test.ts` (shared client, sandbox folder, run-unique
markers, folder-scoped cleanup). Deterministic population: create 10 sandbox tasks named with a run-unique marker, then
drive every assertion off filters that match exactly those 10 — this is conformance case C11's exact shape (`limit:5`
against a 10-row population → `total_count: 10`, truncation visible).

```typescript
/**
 * OMN-154: count honesty — total_count reports the matching population,
 * truncated marks partial results, countOnly agrees (R1/R2/R4; C11).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getSharedClient } from './helpers/shared-server.js';
import { MCPTestClient } from './helpers/mcp-test-client.js';
import { ensureSandboxFolder, fullCleanup } from './helpers/sandbox-manager.js';
import { RUN_ID } from './helpers/run-id.js';

const RUN_INTEGRATION_TESTS = process.env.DISABLE_INTEGRATION_TESTS !== 'true' && process.platform === 'darwin';
const d = RUN_INTEGRATION_TESTS ? describe : describe.skip;

const MARKER = `XYZCOUNT${RUN_ID.replace(/[^a-z0-9]/gi, '')}`;
const POPULATION = 10;

d('OMN-154: read-metadata count honesty', () => {
  let client: MCPTestClient;

  beforeAll(async () => {
    client = await getSharedClient();
    await ensureSandboxFolder(); // NOTE: takes no arguments (see name-filter-scope.test.ts) — same for fullCleanup()
    // Create POPULATION tasks named `${MARKER}-NN` inside a sandbox project
    // (NOT the inbox), batch-create per the sandbox-manager / name-filter-scope
    // precedent. Read back with countOnly to confirm the fixture landed.
  }, 120_000);

  afterAll(async () => {
    await fullCleanup();
  }, 120_000);

  it('C11: limit 5 against the 10-row population → total_count 10, truncated, countOnly agrees', async () => {
    const rows = await readTasks({ filters: { name: { contains: MARKER } }, limit: 5 });
    expect(rows.metadata.total_count).toBe(POPULATION);
    expect(rows.metadata.returned_count).toBe(5);
    expect(rows.metadata.truncated).toBe(true);
    expect(rows.metadata.total_matched).toBeUndefined(); // D3
    expect(rows.summary?.total_count).toBe(POPULATION);

    const count = await readTasks({ filters: { name: { contains: MARKER } }, countOnly: true });
    expect(count.metadata.total_count).toBe(POPULATION); // R4 same-predicate agreement
  });

  it('complete response: limit >= population → no truncated key', async () => {
    const rows = await readTasks({ filters: { name: { contains: MARKER } }, limit: 50 });
    expect(rows.metadata.total_count).toBe(POPULATION);
    expect(rows.metadata.returned_count).toBe(POPULATION);
    expect('truncated' in rows.metadata).toBe(false);
  });

  it('offset: the last page reads complete (R2/D5)', async () => {
    const lastPage = await readTasks({ filters: { name: { contains: MARKER } }, limit: 5, offset: 5 });
    expect(lastPage.metadata.total_count).toBe(POPULATION);
    expect(lastPage.metadata.returned_count).toBe(5);
    expect('truncated' in lastPage.metadata).toBe(false);
  });

  it('sorted path: same contract (population + truncated)', async () => {
    const rows = await readTasks({
      filters: { name: { contains: MARKER } },
      limit: 3,
      sort: [{ field: 'name', direction: 'asc' }],
    });
    expect(rows.metadata.total_count).toBe(POPULATION);
    expect(rows.metadata.truncated).toBe(true);
  });

  it('projects: limit below population reports population; cache hit repeats it (R6)', async () => {
    // Query against the live DB with a status filter and limit 1. The exact
    // population is unknown but MUST be >= the sandbox project count (>=1)
    // and the response must satisfy the invariants:
    const first = await readProjects({ filters: { status: 'active' }, limit: 1 });
    const population = first.metadata.total_count as number;
    expect(population).toBeGreaterThanOrEqual(1);
    expect(first.metadata.returned_count).toBe(1);
    if (population > 1) expect(first.metadata.truncated).toBe(true);

    const second = await readProjects({ filters: { status: 'active' }, limit: 1 });
    expect(second.metadata.from_cache).toBe(true);
    expect(second.metadata.total_count).toBe(population);
    if (population > 1) expect(second.metadata.truncated).toBe(true);
  });
});
```

(`readTasks` / `readProjects` are thin wrappers over `client.callTool('omnifocus_read', { query: ... })` parsing the
JSON text content — copy the helper shape from the existing integration files. Fixture creation: batch create via
`omnifocus_write`, per the sandbox precedent in `name-filter-scope.test.ts`.)

- [ ] **Step 2: Build, then run the integration suite in the background**

```bash
npm run build
# Integration MUST run via npm in a BACKGROUND process; never kill it mid-run
# (orphaned vitest teardowns hit the live OmniFocus DB).
npm run test:integration
```

Expected: the new file passes; the whole suite stays green. OmniFocus must be running and not blocked by dialogs; if
scripts time out, check the app.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/count-honesty.test.ts
git commit -m "test(OMN-154): live count-honesty integration probes (C11 shape)"
```

---

### Task 9: Final verification sweep

- [ ] **Step 1: Full unit + integration, fresh**

```bash
npm run build && npm run test:unit
npm run test:integration   # background, do not kill
```

Expected: both fully green.

- [ ] **Step 2: Mutation-verify the core fix**

Temporarily revert the `buildUnsortedScript` counting hunk (`git stash` the change or comment `totalMatched++`), run
`npx vitest run tests/unit/contracts/ast/script-builder.test.ts` — the vm tests MUST fail. Restore (`git stash pop` /
undo), re-run, green. State the result in the task report.

- [ ] **Step 3: Check off the spec's acceptance criteria**

Walk `docs/superpowers/specs/2026-06-12-omn-154-count-honesty-design.md` §7 — every unchecked box must now be
demonstrably true (cite the test that proves each).

- [ ] **Step 4: Commit any stragglers; hand off to finishing-a-development-branch**

Post-merge (outside this plan): deploy to `~/omnifocus-mcp` is Kip's manual step; live-verify by re-running the spec §1
probe table on the prod buildId (all four rows flip to population counts), then update memory
(`tooling_omnifocus_read_defaults` gotcha 6, `project_selection_honesty_cluster`) and Linear OMN-154.
