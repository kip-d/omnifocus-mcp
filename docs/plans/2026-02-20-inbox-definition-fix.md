# Inbox Definition Fix — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace manual `!task.containingProject` inbox checks with OmniFocus's native `task.inInbox` property, which
respects the user's cleanup setting ("Either a project or a tag").

**Architecture:** Two code paths use the wrong inbox definition. The AST filter layer already uses `task.inInbox`
correctly. The field projection and workflow analysis script use `!task.containingProject` /
`task.containingProject === null`, which counts tagged-but-no-project tasks as inbox when the user's cleanup setting
says they aren't. Fix both, add regression tests, mark both OmniFocus bug tasks complete.

**Tech Stack:** TypeScript, OmniJS, Vitest

**Bugs:** `htNU-VTjLkY` (workflow_analysis inboxPercentage inflated), `etV_kfqyDOb` (inbox definition should respect
cleanup setting)

---

### Task 1: Fix inInbox field projection in script-builder

**Files:**

- Modify: `src/contracts/ast/script-builder.ts:101-102`
- Test: `tests/unit/contracts/ast/script-builder.test.ts`

**Step 1: Write failing test**

Add to `tests/unit/contracts/ast/script-builder.test.ts`, inside the existing describe block for field projections:

```typescript
it('should use task.inInbox for inInbox field projection (not containingProject)', () => {
  const result = buildListTasksScriptV4({
    filter: {},
    fields: ['id', 'name', 'inInbox'],
    limit: 10,
  });
  // Must use native task.inInbox, NOT !task.containingProject
  expect(result.script).toContain('inInbox: task.inInbox');
  expect(result.script).not.toContain('inInbox: !task.containingProject');
});
```

**Step 2: Run test to verify it fails**

Run:
`npx vitest run tests/unit/contracts/ast/script-builder.test.ts --reporter verbose 2>&1 | grep -A 2 "inInbox field projection"`
Expected: FAIL — current code emits `inInbox: !task.containingProject`

**Step 3: Fix the projection**

In `src/contracts/ast/script-builder.ts`, change line 102:

```typescript
// Before:
projections.push('inInbox: !task.containingProject');
// After:
projections.push('inInbox: task.inInbox');
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/contracts/ast/script-builder.test.ts` Expected: All tests PASS

**Step 5: Commit**

```bash
git add src/contracts/ast/script-builder.ts tests/unit/contracts/ast/script-builder.test.ts
git commit -m "fix: use task.inInbox for field projection instead of !containingProject

The native task.inInbox property respects the user's OmniFocus cleanup
setting ('Either a project or a tag'). The manual !containingProject
check counted tagged-but-no-project tasks as inbox when they aren't.

Refs: etV_kfqyDOb"
```

---

### Task 2: Fix inbox counting in workflow-analysis-v3

**Files:**

- Modify: `src/omnifocus/scripts/analytics/workflow-analysis-v3.ts:176`
- Test: `tests/unit/tools/analytics/workflow-analysis-tool.test.ts`

**Step 1: Write failing test**

Add to `tests/unit/tools/analytics/workflow-analysis-tool.test.ts`:

```typescript
it('should use task.inInbox for inbox counting (not containingProject)', () => {
  // The workflow analysis script string should reference task.inInbox
  // for inbox determination, not task.containingProject === null
  const scriptModule = require('../../../../src/omnifocus/scripts/analytics/workflow-analysis-v3.js');
  // Read the script source to verify the pattern
  const fs = require('fs');
  const scriptSource = fs.readFileSync('src/omnifocus/scripts/analytics/workflow-analysis-v3.ts', 'utf-8');
  expect(scriptSource).not.toContain('containingProject === null');
  expect(scriptSource).toContain('task.inInbox');
});
```

Note: This is a source-level assertion test. If the existing test infrastructure makes this awkward, an alternative
approach is to grep-test the built script string. Check how the existing workflow analysis tests work and adapt
accordingly.

Actually, a simpler approach: since workflow-analysis-v3.ts is a template string that builds a JXA/OmniJS script, we can
check the generated script:

```typescript
it('workflow analysis script should use task.inInbox for inbox detection', async () => {
  const fs = await import('fs');
  const source = fs.readFileSync('src/omnifocus/scripts/analytics/workflow-analysis-v3.ts', 'utf-8');
  // Should NOT use the manual containingProject check for inbox
  expect(source).not.toMatch(/const inInbox = task\.containingProject === null/);
  // Should use the native OmniFocus property
  expect(source).toMatch(/const inInbox = task\.inInbox/);
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/tools/analytics/workflow-analysis-tool.test.ts` Expected: FAIL — source still has
`task.containingProject === null`

**Step 3: Fix the inbox check**

In `src/omnifocus/scripts/analytics/workflow-analysis-v3.ts`, change line 176:

```typescript
// Before:
const inInbox = task.containingProject === null;
// After:
const inInbox = task.inInbox;
```

This is inside an OmniJS `evaluateJavascript` block, so `task.inInbox` is the native OmniJS property access (not a
method call).

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/tools/analytics/workflow-analysis-tool.test.ts` Expected: All tests PASS

**Step 5: Commit**

```bash
git add src/omnifocus/scripts/analytics/workflow-analysis-v3.ts tests/unit/tools/analytics/workflow-analysis-tool.test.ts
git commit -m "fix: workflow analysis uses task.inInbox for inbox counting

Replaces task.containingProject === null with task.inInbox. The native
property respects OmniFocus cleanup setting, so tagged-but-no-project
tasks are no longer counted as inbox when the user has 'Either a
project or a tag' configured. Fixes inflated inboxPercentage.

Refs: htNU-VTjLkY"
```

---

### Task 3: Audit and fix any remaining !containingProject inbox checks

**Files:**

- Potentially modify: any file still using `!task.containingProject` as inbox proxy

**Step 1: Search for remaining instances**

Run: `grep -rn 'containingProject.*null\|!.*containingProject' src/ --include='*.ts' | grep -v 'test' | grep -v '.d.ts'`

Known instances already found:

- `src/contracts/ast/script-builder.ts:102` — fixed in Task 1
- `src/omnifocus/scripts/analytics/workflow-analysis-v3.ts:176` — fixed in Task 2
- `src/omnifocus/scripts/shared/helpers.ts:90` — `isTaskEffectivelyCompleted` checks `containingProject` for parent
  project status (NOT an inbox check — this is correct usage)
- `src/contracts/ast/emitters/omnijs.ts:59-60` — project comparison (NOT an inbox check — this is correct usage)
- `src/contracts/ast/mutation-script-builder.ts:708` — `task.inInbox()` in JXA context (already correct, uses native
  method)

**Step 2: Fix any remaining instances**

If any new instances are found, apply the same `!task.containingProject` → `task.inInbox` replacement. Note: only fix
instances that are using `containingProject` as an **inbox proxy**. Instances that check `containingProject` for project
identification (e.g., getting the project name, checking parent status) should NOT be changed.

**Context distinction:**

- `task.containingProject === null` meaning "is this task in the inbox?" → replace with `task.inInbox`
- `task.containingProject` meaning "get the project this task belongs to" → leave alone
- JXA context: `task.containingProject()` (method call) vs OmniJS: `task.containingProject` (property access)
- JXA context: `task.inInbox()` (method call) vs OmniJS: `task.inInbox` (property access)

**Step 3: Commit if any additional fixes**

```bash
git commit -m "fix: replace remaining containingProject inbox proxies with task.inInbox

Refs: etV_kfqyDOb"
```

---

### Task 4: Build, full test suite, mark bugs complete

**Step 1: Build**

Run: `npm run build` Expected: Clean TypeScript build

**Step 2: Run full unit test suite**

Run: `npm run test:unit` Expected: All tests pass, no regressions

**Step 3: Mark OmniFocus bug tasks complete**

Use `omnifocus_write` to mark both tasks as complete:

- `htNU-VTjLkY` — workflow_analysis inboxPercentage inflated
- `etV_kfqyDOb` — inbox definition should respect cleanup setting

**Step 4: Final commit if needed, then push**

```bash
git push
```
