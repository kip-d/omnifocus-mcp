# OMN-64 — Delete the dead `'jxa'` filter-predicate emitter

Date: 2026-05-17
Linear: OMN-64
Status: Design approved (2026-05-17), pending spec review

## Problem

The AST filter pipeline has two emit targets: `'jxa'` (`emitJXA`) and `'omnijs'` (`emitOmniJS`). The
`'jxa'` emitter and `'omnijs'` emitter encode status-derived synthetic fields differently:

- `'omnijs'`: `task.dropped`/`available`/`blocked` → `task.taskStatus === Task.Status.X` (**effective**
  status). Verified live (2930-task DB): effective-dropped = 67.
- `'jxa'`: every `SYNTHETIC_FIELD_DEFS` entry has `jxa: null`, so the JXA emitter falls through to the
  generic accessor: `task.dropped()` (**own** flag, 38 — diverges from omnijs by 29 inherited drops),
  `task.blocked()` (works), and **`task.available()` which throws** ("Error: Can't convert types" —
  not a valid JXA accessor; would error per-task).

Two facts make this a dead-code-removal, not a behavior fix:

1. **The `'jxa'` filter-predicate emitter is unreachable in production.** Every `generateFilterCode(…)`
   call site in `src/` passes `'omnijs'` (OMN-57 #1 moved the last one — the count path — off `'jxa'`;
   verified by exhaustive grep). No production code path emits JXA filter predicates.
2. **The `jxa` synthetic hook has always been vestigial.** All four `SYNTHETIC_FIELD_DEFS`
   (`dropped`, `available`, `blocked`, `tagStatusValid`) have `jxa: null`. The JXA emitter was
   structurally incapable of correctly emitting any synthetic field; the divergence/broken-`available`
   is the symptom of an emitter that no one should use.

The `'jxa'` emitter is therefore a dormant landmine: a future `generateFilterCode(x, 'jxa')` caller
would get silently-wrong (`dropped` own-vs-effective) and outright-throwing (`available`) predicates.

## Decision

Delete the `'jxa'` filter-predicate emitter and collapse the AST emit pipeline to OmniJS-only.
**Zero production behavior change** (the path is already unreachable). This removes the landmine at
the root and shrinks the public API surface. "Collapse to OmniJS-only" means **full removal of the
`EmitTarget` type and the `target` parameter**, not a vestigial `'omnijs'`-only param.

## Scope

In scope: delete the jxa emitter + every reference to it + the dual-target parameterization + the
vestigial `SyntheticFieldDef.jxa` field; delete/retarget the jxa-emitter tests.

Out of scope (explicit):
- **`src/omnifocus/OmniAutomation.ts:51` `monitorScriptSize(script, 'jxa')`** — this `'jxa'` is a
  script-size-budget *category label* for the outer JXA wrapper script (the final generated script is
  still a JXA script that embeds OmniJS via `app.evaluateJavascript`). It is **unrelated** to the
  filter emitter and MUST remain unchanged. Likewise any `'jxa'` in `SCRIPT_SIZE_LIMITS` / script-size
  code or docs.
- **`src/omnifocus/utils/script-size-monitor.ts`** (`'jxa'` script-size category type/defaults, ~lines
  50/64/69/134) and **`src/tools/unified/OmniFocusWriteTool.ts:865,938`** (`method: 'jxa'` write-path
  response-metadata label) — both use the string `'jxa'` for entirely unrelated concerns (script-size
  budgeting; response metadata). MUST remain unchanged. These exist so the Verification grep gate is
  scoped correctly (see Verification §4).
- No change to `emitOmniJS`, the AST builder, validator, `SYNTHETIC_FIELD_DEFS[].omnijs`, or any
  generated-script behavior.
- No semantic change to `dropped`/`available`/`blocked` (omnijs effective-status behavior is retained
  as-is; harmonizing or redefining those semantics is explicitly NOT this ticket).

## Design

### Source

1. **Delete** `src/contracts/ast/emitters/jxa.ts` (the entire `emitJXA` + its helpers).
2. **`src/contracts/ast/filter-generator.ts`:**
   - Remove `import { emitJXA } from './emitters/jxa.js';`.
   - `FilterPipeline.emit`: drop the `target` parameter; body becomes
     `return emitOmniJS(this._ast!);` (was `target === 'jxa' ? emitJXA(...) : emitOmniJS(...)`).
   - Remove the `EmitTarget` type entirely.
   - Drop the `target` parameter from `generateFilterCode` (:121), `generateFilterCodeSafe` (:137),
     `generateFilterFunction` (:173), and `FilterPipeline.emit` (:83) — all currently
     `target: EmitTarget = 'omnijs'`. Update their JSDoc (`@param target`) accordingly. Internal calls
     (`generateFilterCode(filter, 'omnijs')` at `:193`, `generateFilterBlock`) become arg-less.
   - **Remove the `target: EmitTarget` field from the `GenerateFilterCodeResult` interface
     (`filter-generator.ts:35`) and its population site (`target: target` / `target,` at ~`:158`).**
     This is part of "full `EmitTarget` removal"; `tsc` flags it but it must be enumerated. Any
     surviving test asserting `result.target` must be updated (see Tests).
3. **`src/contracts/ast/types.ts`:** remove the `jxa` property from the `SyntheticFieldDef` type and
   from all four `SYNTHETIC_FIELD_DEFS` entries (it is universally `null` and was read only by the
   deleted JXA emitter; `emitOmniJS` reads only `.omnijs`).
4. **`src/contracts/ast/index.ts`:** remove `export { emitJXA } from './emitters/jxa.js';`, remove
   `EmitTarget` from the `export type { … }` line, and drop the `emitJXA` bullet from the file's doc
   comment. (`GenerateFilterCodeResult`/`GenerateFilterCodeError` exports stay — only their `target`
   field is gone.)
5. **All `src/` callers** of `generateFilterCode(filter, 'omnijs')` (script-builder.ts:466, 582, 751,
   1502, 1953) → `generateFilterCode(filter)`. `tsc` will flag any missed call/import/type reference;
   treat a clean `tsc` as the completeness gate.

### Tests

Guiding principle: **remove only jxa-target assertions/refs; never drop unique OmniJS behavioral
coverage** (where a parameterized loop emits both a jxa `it` and an omnijs `it`, keep the omnijs `it`,
delete only the jxa `it`). The plan will pin exact final line numbers; the dispositions below are
exhaustive for the jxa references (the reviewer-confirmed compile-breaking ones are named explicitly).

- **Delete** `tests/unit/contracts/ast/emitters/jxa.test.ts` — entire file is `describe('emitJXA', …)`.
- **`tests/unit/contracts/ast/filter-generator.test.ts`:**
  - Remove every `it(...)` passing `'jxa'` to `generateFilterCode`/`generateFilterCodeSafe` (the
    JXA-syntax cases — `:23,186,194,230,254,269,312`) and the whole `generateFilterCodeSafe with JXA
    target` block (`:316` region).
  - Remove the `'defaults to omnijs target'` case (premise — a defaultable `target` — no longer
    exists once the param is gone).
  - **`:289` `expect(result.target).toBe('omnijs');`** is inside a KEPT case ("returns success result
    for valid filter") — `GenerateFilterCodeResult.target` is being deleted, so this assertion is now
    a compile error. **Remove just that one assertion line**; keep the rest of that case.
  - Every removed jxa case already has an OmniJS counterpart in this file (e.g. `'generates OmniJS
    code for simple boolean filter'`); no OmniJS coverage is lost.
- **`tests/unit/contracts/ast/pipeline-isolation.test.ts`:**
  - Remove `import { emitJXA }`.
  - Remove the `describe('JXA emitter with hand-crafted AST', …)` block (the `emitJXA(ast)` at ~`:111`).
  - In the parameterized **cross-stage contract loop**, each filter emits TWO `it`s: keep
    `build -> validate -> emit (omnijs) …` (the `emitOmniJS(ast)` at ~`:294`, unique non-empty
    coverage for ~21 filter shapes) and **delete only the sibling `build -> validate -> emit (jxa)
    succeeds for ${name}` `it`** (the `emitJXA(ast)` at ~`:304`). Do NOT delete the loop wholesale.
  - Delete the `it('emits JXA code', …)` case (~`:222`, body `FilterPipeline.from(...).emit('jxa')`) —
    a 5th jxa ref; omnijs siblings (~`:217`/`:232`) retain coverage.
  - The `'defaults to omnijs target'` case calling `FilterPipeline.from(...).emit()` arg-less
    (~`:227`): its premise (a default target) is gone — delete the case.
  - Keep the `describe('OmniJS emitter with hand-crafted AST')` describe.
- **`tests/unit/contracts/ast/filter-coverage.test.ts`:**
  - Remove `import { emitJXA }`.
  - The parameterized **emitter parity** loop emits two `it`s per filter:
    `both emitters produce non-empty output for: ${name}` (uses `emitJXA` + `emitOmniJS`, ~22 filters)
    and `AST validates for: ${name}` (no jxa). **Convert the first `it` to OmniJS-only** — drop the
    `const jxaResult = emitJXA(ast)` line and its `expect(jxaResult…)` assertion; **keep the
    `emitOmniJS` non-empty assertion** (unique coverage for ~22 filter shapes) and rename the `it` to
    `omnijs emitter produces non-empty output for: ${name}`. Keep the `AST validates` `it`. The
    `QueryCompiler.transformFilters` coverage is untouched.

## Verification

1. `npm run build` — exit 0. `tsc` is the primary completeness gate: any surviving `emitJXA`,
   `EmitTarget`, or `target`-argument reference fails the build.
2. `npm run test:unit` — 0 failures after the test deletions/retargets. Net test count drops
   (jxa.test.ts removed) — expected; confirm no *omnijs* coverage regressed.
3. `npm run lint:strict` — exit 0.
4. **Grep gate (precise):** `grep -rn "emitJXA\|EmitTarget" src/` returns **nothing** — this is the
   exact, true post-condition. Do NOT gate on the bare string `'jxa'`: it legitimately survives in
   three unrelated places that MUST remain (asserting they still exist is part of the gate):
   `src/omnifocus/OmniAutomation.ts:51` (`monitorScriptSize(script, 'jxa')`),
   `src/omnifocus/utils/script-size-monitor.ts` (~`:50,64,69,134`, the script-size category), and
   `src/tools/unified/OmniFocusWriteTool.ts:865,938` (`method: 'jxa'` response metadata). Confirm
   these three are present and unchanged; only `emitJXA`/`EmitTarget` should be absent.
5. Sanity: a representative `omnifocus_read` tasks query + a countOnly query still work (no
   behavior change expected — pipeline already OmniJS-only in production).

## Risks and mitigations

| Risk | Mitigation |
| ---- | ---------- |
| The `'jxa'` path is secretly reachable | Exhaustive grep proves all `src/` callers pass `'omnijs'`; `tsc` + full suite catch any missed reference; zero production behavior change by construction. |
| Accidentally removing the unrelated `monitorScriptSize(script,'jxa')` | Explicit out-of-scope callout + the grep gate *asserts that line still exists*. |
| Losing OmniJS test coverage when deleting jxa cases | Per-file rule: remove only jxa-target assertions; ensure an OmniJS equivalent remains for any behavior previously only jxa-covered. |
| External consumer imports `emitJXA`/`EmitTarget` from `src/contracts/ast` | This is an internal library (no external consumers of this repo's TS API); acceptable per repo norms. Noted, not mitigated further. |

## Linear

On completion: comment OMN-64 with the deletion summary + grep-gate evidence (jxa emitter gone,
script-size label intact, zero behavior change); close OMN-64. (OMN-65 remains independent.)
