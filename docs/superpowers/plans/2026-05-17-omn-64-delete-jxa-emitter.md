# OMN-64 — Delete the dead `'jxa'` filter-predicate emitter — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the production-unreachable `'jxa'` AST filter-predicate emitter and collapse the pipeline to
OmniJS-only, with zero production behavior change.

**Architecture:** Pure dead-code deletion. Ordered **test-surgery first, source-deletion second** so the unit suite
stays green after every task (removing jxa _test_ refs while `emitJXA` still exists keeps tests green; then deleting the
source compiles cleanly because nothing references it). `tsc` is the source-completeness gate (any missed
`emitJXA`/`EmitTarget`/`target`-arg reference fails the build). A grep gate proves the emitter is gone while three
unrelated `'jxa'` strings remain.

**Tech Stack:** TypeScript, vitest. No new deps, no new files.

**Spec:** `docs/superpowers/specs/2026-05-17-omn-64-delete-jxa-emitter-design.md`

---

## File Structure

| File                                                  | Action                                                                                                                    |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `tests/unit/contracts/ast/emitters/jxa.test.ts`       | **Delete** (entire file)                                                                                                  |
| `tests/unit/contracts/ast/filter-generator.test.ts`   | Remove jxa-target `it`s + `'defaults to omnijs target'` + the lone `:289` `result.target` assertion                       |
| `tests/unit/contracts/ast/pipeline-isolation.test.ts` | Remove `emitJXA` import + JXA-emitter describe + jxa sibling of the cross-stage loop + `'defaults to omnijs target'`      |
| `tests/unit/contracts/ast/filter-coverage.test.ts`    | Remove `emitJXA` import; convert the parity `it` to omnijs-only                                                           |
| `src/contracts/ast/emitters/jxa.ts`                   | **Delete** (entire file)                                                                                                  |
| `src/contracts/ast/filter-generator.ts`               | Remove `emitJXA` import, `EmitTarget`, all `target` params, `GenerateFilterCodeResult.target` + population, `emit()` body |
| `src/contracts/ast/types.ts`                          | Remove `SyntheticFieldDef.jxa` field + `jxa: null` from all 4 `SYNTHETIC_FIELD_DEFS`                                      |
| `src/contracts/ast/index.ts`                          | Remove `emitJXA` + `EmitTarget` exports + doc bullet                                                                      |
| `src/contracts/ast/script-builder.ts`                 | 5 callers `generateFilterCode(f,'omnijs')` → `generateFilterCode(f)`                                                      |

**Out of scope — DO NOT TOUCH:** `src/omnifocus/OmniAutomation.ts:51` (`monitorScriptSize(script,'jxa')`),
`src/omnifocus/utils/script-size-monitor.ts` (~50/64/69/134), `src/tools/unified/OmniFocusWriteTool.ts:865,938`
(`method:'jxa'`). These `'jxa'` strings are unrelated (script-size / response metadata).

---

## Task 1: Test surgery (suite stays green — `emitJXA` still exists)

**Files:** the 4 test files above.

- [ ] **Step 1: Delete the jxa emitter test file**

```bash
git rm tests/unit/contracts/ast/emitters/jxa.test.ts
```

- [ ] **Step 2: `filter-generator.test.ts` — remove jxa cases + stale assertions**

- Delete each `it(...)` whose body calls `generateFilterCode(filter, 'jxa')` or `generateFilterCodeSafe(filter, 'jxa')`
  — these are at lines ~23, ~186, ~194, ~230, ~254, ~269, ~312 (use the `'jxa'` literal to locate; remove the whole
  `it(...)` block each). Removing the `~269` jxa `it` empties its wrapper
  `describe('JXA target for combined filters', …)` (≈ lines 261–276) — delete that now-empty `describe` block too.
  (Other jxa `it`s share a `describe` with omnijs `it`s — leave those describes.)
- Delete the entire `describe('generateFilterCodeSafe with JXA target', …)` block (≈ lines 309–321, contains the `:316`
  `expect(result.target).toBe('jxa')`).
- Delete the `it('defaults to omnijs target', …)` case (≈ line 43) — a defaultable `target` no longer exists after
  Task 2.
- In the **kept** case `it('returns success result for valid filter', …)`, delete **only** the single line
  `expect(result.target).toBe('omnijs');` (≈ line 289). Keep every other assertion in that case.
- Leave all other (OmniJS / non-target) cases untouched.

- [ ] **Step 3: `pipeline-isolation.test.ts` — remove jxa refs, keep the omnijs loop half**

- Remove the import line (~16) `import { emitJXA } from '../../../../src/contracts/ast/emitters/jxa.js';`.
- Delete the entire `describe('JXA emitter with hand-crafted AST', …)` block (≈ lines 103–116, the `emitJXA(ast)` at
  ~111).
- In the parameterized cross-stage loop: **keep** the `it('build -> validate -> emit (omnijs) …')` case (the
  `emitOmniJS(ast)` at ~294) and **delete only** its sibling
  `it('build -> validate -> emit (jxa) succeeds for ${name}', …)` (the `emitJXA(ast)` at ~304). Do NOT delete the
  surrounding loop or the omnijs `it`.
- Delete the `it('emits JXA code', …)` case (≈ lines 222–225, body calls
  `FilterPipeline.from({ flagged: true }).emit('jxa')`). Its omnijs siblings at ~217 and ~232 retain coverage. (This is
  the 5th jxa ref in this file — without removing it, Task 2 `tsc` fails on `.emit('jxa')` once the `emit()` param is
  dropped.)
- Delete the `it('defaults to omnijs target', …)` case (~227, calls `.emit()` arg-less — premise gone).
- Keep `describe('OmniJS emitter with hand-crafted AST', …)`.

- [ ] **Step 4: `filter-coverage.test.ts` — convert parity loop to omnijs-only**

- Remove the import line (~16) `import { emitJXA } from '../../../../src/contracts/ast/emitters/jxa.js';`.
- In the parameterized `for (const { name, filter } of testFilters)` loop, the first `it` is
  `it('both emitters produce non-empty output for: ${name}', …)` (≈ 299–307). Edit it to:
  - rename to `it('omnijs emitter produces non-empty output for: ${name}', …)`,
  - delete the line `const jxaResult = emitJXA(ast);`,
  - delete the line `expect(jxaResult.predicate.length).toBeGreaterThan(0);`,
  - keep `const omnijsResult = emitOmniJS(ast);` and `expect(omnijsResult.predicate.length).toBeGreaterThan(0);`.
- Keep the second `it('AST validates for: ${name}', …)` unchanged. Keep all `QueryCompiler.transformFilters` describes
  untouched.

- [ ] **Step 5: Verify suite still green (jxa source still present)**

Run: `npm run test:unit 2>&1 | grep -E "Test Files|Tests "` Expected: 0 failures. (Net test count drops — `jxa.test.ts`
removed and jxa cases deleted — expected. `emitJXA`/`EmitTarget` still exist in `src/`, so everything compiles and
OmniJS coverage is intact.) Run: `npm run build 2>&1 | tail -1` — Expected: exit 0 (no source change yet).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "test(OMN-64): drop jxa-emitter test coverage (suite stays green)"
```

---

## Task 2: Source deletion (`tsc` is the completeness gate)

**Files:** `src/contracts/ast/{emitters/jxa.ts,filter-generator.ts,types.ts,index.ts}`,
`src/contracts/ast/script-builder.ts`.

- [ ] **Step 1: Delete the jxa emitter source file**

```bash
git rm src/contracts/ast/emitters/jxa.ts
```

- [ ] **Step 2: `filter-generator.ts` edits**

- Remove the import: `import { emitJXA } from './emitters/jxa.js';` (line ~21).
- Remove the type: `export type EmitTarget = 'jxa' | 'omnijs';` (line ~28).
- In `interface GenerateFilterCodeResult`, remove the field `target: EmitTarget;` (line ~35).
- `FilterPipeline.emit` (line ~83): change signature `emit(target: EmitTarget = 'omnijs'): EmitResult` →
  `emit(): EmitResult`; change the final line `return target === 'jxa' ? emitJXA(this._ast!) : emitOmniJS(this._ast!);`
  → `return emitOmniJS(this._ast!);`.
- `generateFilterCode` (~121), `generateFilterCodeSafe` (~137), `generateFilterFunction` (~173): delete the
  `target: EmitTarget = 'omnijs',` parameter from each signature; update each `@param target` JSDoc line (delete it).
  Internal calls that passed `target`: `FilterPipeline.from(filter).emit(target)` → `.emit()`;
  `generateFilterCode(filter, target)` inside `generateFilterFunction` → `generateFilterCode(filter)`; the
  `generateFilterBlock` internal `generateFilterCode(filter, 'omnijs')` (~193) → `generateFilterCode(filter)`.
- In `generateFilterCodeSafe`'s success return object (≈ lines 153–159), remove the `target,` line (and the
  `const code = pipeline.emit(target);` → `pipeline.emit()`).

- [ ] **Step 3: `types.ts` edits**

- In `interface SyntheticFieldDef` (line ~142), remove the field `readonly jxa: SyntheticFieldEmitter | null;` (~145).
- In `SYNTHETIC_FIELD_DEFS` (~170-178), remove `, jxa: null` from all four entries (`task.dropped`, `task.available`,
  `task.blocked`, `task.tagStatusValid`). If `SyntheticFieldEmitter` is now only referenced by the removed field, leave
  its type definition (harmless) unless `tsc` flags it unused under the project's noUnused settings — if so, remove it
  too. (`emitOmniJS` reads only `syntheticDef.omnijs` — verified — so nothing else breaks.)

- [ ] **Step 4: `index.ts` edits**

- Remove `export { emitJXA } from './emitters/jxa.js';` (~52).
- Remove `EmitTarget` from the `export type { EmitTarget, GenerateFilterCodeResult, GenerateFilterCodeError } …` line
  (~57) — keep `GenerateFilterCodeResult` and `GenerateFilterCodeError`.
- Remove the `- emitJXA: …` bullet from the file's top doc comment (~7).

- [ ] **Step 5: `script-builder.ts` caller updates**

Change `generateFilterCode(<arg>, 'omnijs')` → `generateFilterCode(<arg>)` at lines ~466, ~582, ~751, ~1502, ~1953 (5
sites; the `<arg>` expression differs per site — keep it, drop only the `, 'omnijs'`).

- [ ] **Step 6: Build — `tsc` completeness gate**

Run: `npm run build 2>&1 | tail -3` Expected: exit 0. If `tsc` errors with any remaining `emitJXA` / `EmitTarget` /
surplus-argument reference, that is the gate working — fix the named reference and re-run until clean. Do NOT suppress
with casts/`any`.

- [ ] **Step 7: Verify suite + lint green**

Run: `npm run test:unit 2>&1 | grep -E "Test Files|Tests "` — Expected: 0 failures. Run:
`npm run lint:strict; echo "exit=$?"` — Expected: `exit=0`.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor(OMN-64): delete the dead jxa filter-predicate emitter; OmniJS-only pipeline"
```

---

## Task 3: Verification gate

**Files:** none.

- [ ] **Step 1: Full matrix**

```bash
npm run build
npm run test:unit
npm run lint:strict; echo "lint:strict exit=$?"
```

Expected: build 0; unit 0 failures; lint:strict exit 0.

- [ ] **Step 2: Grep gate (precise)**

```bash
grep -rn "emitJXA\|EmitTarget" src/ ; echo "emitter-refs exit=$?"
```

Expected: **no matches** (`exit=1` from grep = nothing found = PASS). Then confirm the three unrelated survivors still
exist (must print lines):

```bash
grep -rn "monitorScriptSize(script, 'jxa')" src/omnifocus/OmniAutomation.ts
grep -rn "'jxa'" src/omnifocus/utils/script-size-monitor.ts
grep -rn "method: 'jxa'" src/tools/unified/OmniFocusWriteTool.ts
```

Expected: each prints its line(s) — unchanged. If `emitJXA`/`EmitTarget` matched anything in `src/`, STOP (Task 2
incomplete). If any of the three survivors is missing, STOP (over-deletion).

- [ ] **Step 3: Scope discipline**

`git diff main...HEAD --stat` touches only: the 4 test files, the 4 `src/contracts/ast/*` files,
`src/contracts/ast/script-builder.ts`, and the spec/plan docs. No `OmniAutomation.ts`, `script-size-monitor.ts`,
`OmniFocusWriteTool.ts`, `emitOmniJS`, AST builder/validator, or generated- script changes.

- [ ] **Step 4: Behavior sanity (no production change expected)**

Run a representative query end-to-end (live OmniFocus, the pipeline is already OmniJS-only in prod so output must be
unchanged):

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"omnifocus_read","arguments":{"query":{"type":"tasks","filters":{"flagged":true},"countOnly":true}}}}' | node dist/index.js 2>/dev/null | grep -o '"optimization":"[^"]*"\|"total_count":[0-9]*'
```

Expected: `omnijs_count_*` + a sane `total_count` — identical behavior to pre-change. If it errors or differs, STOP and
surface.

- [ ] **Step 5: Commit (only if a verification-driven tweak was needed; otherwise skip)**

```bash
git add -A && git commit -m "chore(OMN-64): verification adjustments"
```

---

## Post-plan (project convention — execution handoff, not a plan task)

PR to `kip-d/omnifocus-mcp` cross-referencing OMN-64; mandatory code-reviewer subagent gated on a SAFE verdict;
`gh pr merge --squash --auto` (never `--admin`); then comment OMN-64 with the grep-gate evidence (emitter gone, 3
unrelated `'jxa'` survivors intact, zero behavior change) and close OMN-64.
