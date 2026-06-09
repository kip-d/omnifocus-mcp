# OMN-128 Slice 2 — create-task + batch-create on the Mutation AST

**Date:** 2026-06-09 **Ticket:** OMN-128 (umbrella), folding in OMN-137 semantics for the migrated builders; live
coverage feeds OMN-138 **Predecessor:** `docs/superpowers/specs/2026-06-08-write-side-mutation-ast-design.md` (slice 1,
`buildCreateProjectScript`, PR #74) **Approach decided with Kip:** shared per-spec lowering, two thin program wrappers
(approach A); scope = `buildCreateTaskScript` + `buildBatchCreateTasksScript` in one PR.

## 1. Scope

Migrate two builders in `src/contracts/ast/mutation-script-builder.ts` to the OmniJS-native mutation AST
(`src/contracts/ast/mutation/`):

| Builder                       | Legacy shape                                                                                                              | New shape                                                                                |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `buildCreateTaskScript`       | JXA shell + 5 `evaluateJavascript` islands (project lookup, OMN-29 nonce id-bridge, OMN-31 parent move, tags, repetition) | one OmniJS program from `dispatchMutation('create/task', …)`                             |
| `buildBatchCreateTasksScript` | already OmniJS-native, but template-string codegen with a runtime spec loop                                               | one OmniJS program from `dispatchMutation('batch-create/tasks', …)`, build-time unrolled |

Both builders keep their `GeneratedMutationScript` return shape, but awaiting the async sandbox guard at dispatch (§5)
forces `buildBatchCreateTasksScript` and `buildCreateProjectScript` from sync to **async** (`buildCreateTaskScript`
already is). Call sites in `OmniFocusWriteTool` add `await` accordingly; `validateTaskCreate` (currently module-private)
gets exported for `MUTATION_DEFS` registration. Beyond that, callers change only to pass through the new `warnings`
envelope field (§5).

Out of scope: create-folder, update-task/project, complete, delete, bulk-delete, tag builders (later slices); read-side
boundary retrofit (OMN-129).

## 2. Substrate additions (`mutation/types.ts`, `mutation/emitter.ts`, `mutation/snippets.ts`)

### 2.1 Typed container resolution

Mirror `FolderResolution`'s named-states discipline:

```ts
export type ContainerResolution =
  | { kind: 'inbox' } // no container requested — new Task() stays in inbox
  | { kind: 'project'; var: string } // resolved project binding
  | { kind: 'parentTask'; var: string } // resolved existing-task binding
  | { kind: 'tempIdRef'; var: string }; // batch-only: a task binding created earlier in the same program
```

New statement nodes, both resolving to a binding that a `guard` checks before any construct consumes it:

- `resolveProject(bind, ref)` → `const <bind> = resolveProjectFlexible(<json ref>);` — new single-source snippet
  `resolveProjectFlexible` in the snippet registry: `Project.byIdentifier(ref)` then
  `flattenedProjects.find(p => p.name === ref)`, returning `null` when neither matches (legacy lookup semantics, minus
  the silent fallback — the guard makes not-found loud).
- `resolveParentTask(bind, ref)` → `const <bind> = Task.byIdentifier(<json ref>) || null;`

`tempIdRef` needs no resolve node: in an unrolled batch program the referenced task is a direct in-program binding (§4).

### 2.2 `constructTask`

`constructTask(bind, name, container)` emits:

| `container.kind`                       | Emission                                                              |
| -------------------------------------- | --------------------------------------------------------------------- |
| `inbox`                                | `const <bind> = new Task(<name>);`                                    |
| `project` / `parentTask` / `tempIdRef` | `const <bind> = new Task(<name>); moveTasks([<bind>], <var>.ending);` |

`new Task(name)` is inbox-native OmniJS; `moveTasks` places it. `task.id.primaryKey` reads directly off the fresh
binding, so the OMN-29 nonce bridge and OMN-31 post-creation move island are **deleted, not migrated**
(identity-plumbing between runtimes, obsolete in a single-runtime program). A `notFound`-state construct is illegal at
emit time, same as `constructProject` (validator + emitter both enforce).

### 2.3 Repetition rule — build-time lowering, zero new expression nodes

The legacy repetition island (~120 lines of runtime OmniJS: RRULE assembly, scheduleType/anchorDateKey enum mapping,
deprecated-`method` derivation, catchUp default) becomes a pure TS function:

```ts
lowerRepetitionRule(rule: RepetitionRule): {
  rrule: string;            // e.g. 'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,FR'
  scheduleTypePath: string; // e.g. 'Task.RepetitionScheduleType.Regularly'
  anchorPath: string;       // e.g. 'Task.AnchorDateKey.DueDate'
  catchUp: boolean;
}
```

emitted as existing nodes:

```ts
setProp(
  ref(task),
  'repetitionRule',
  newExpr('Task.RepetitionRule', [
    json(rrule),
    json(null),
    enumRef(scheduleTypePath),
    enumRef(anchorPath),
    json(catchUp),
  ]),
  'direct',
  /* bestEffort */ true,
);
```

Behavioral notes preserved from legacy: `method` and `scheduleType`/`anchorDateKey` are mutually exclusive in the
OmniFocus API — always pass `null` for `method` and derive `scheduleType` from `rule.method` when `rule.scheduleType` is
absent (`due-after-completion`/`defer-after-completion` → FromCompletion, else Regularly); `defer-after-completion`
implies `AnchorDateKey.DeferDate`; `catchUpAutomatically` defaults true. Invalid frequency now throws at **build time**
(loud, typed) instead of returning a swallowed in-script error.

### 2.4 Parameterized `assignTags` internals (slice-1 carry-over, now forced)

The `assignTags` bind is already caller-supplied (`let ${node.bind} = []`), but every call site passes the same name — a
batch program emits N occurrences, and a second `let appliedTags` is a redeclaration SyntaxError. The hard requirement
is exactly this: **distinct bind names per batch item** (`appliedTags_<i>`). The loop internals are already safe
(`for (const _tagName …)` is per-loop scoped; `var _segs`/`var _tag` redeclare legally); wrapping the loop body in a
block suffices if anything tightens later. No larger rework needed.

## 3. Lowering (`mutation/defs.ts` + new shared lowering)

`lowerTaskCreate(spec, names) → { statements: Stmt[], snippetDeps: string[] }` — the single source for "create one
task", consumed by both program builders. `names` parameterizes bindings (`task` vs `_t<i>`, `appliedTags` vs
`appliedTags_<i>`) so the same lowering serves single and unrolled-batch contexts.

Statement order (mirrors legacy semantics): resolve container (+ guard) → `constructTask` → `note`, `flagged` setProps →
date setProps (`dueDate`/`deferDate`/`plannedDate`, `dateExpr` strategy, self-wrapped) → `estimatedMinutes` (emitted
only when set — legacy used a falsy check, preserved) → `assignTags` (best-effort) → repetition `setProp` (best-effort).

Container selection preserves legacy batch priority, now applied uniformly to both paths: exactly one of `parentTempId`
(batch-only, intra-batch ref) → `parentTaskId` → `projectId`/`project` → inbox, checked in that order.

Field coverage gets the same compile-time exhaustiveness guard as `ProjectCreateData` got in slice 1
(`Record<keyof TaskCreateData, true>` and `Record<keyof BatchTaskSpec, true>`), so a new schema field cannot be silently
dropped.

### 3.1 Deliberate behavior deltas (Kip-approved 2026-06-09)

1. **Project/parent not-found is loud on the single path.** Legacy `buildCreateTaskScript` silently fell through to the
   inbox when the project lookup missed (the OMN-127 conflation in task form); legacy batch threw per-item. The typed
   `ContainerResolution` + guard aligns both on loud failure. This intentionally diverges from OMN-128's
   "behavior-equivalent" acceptance line, under the greenlight comment's typed fail-able-resolution requirement — same
   precedent as slice 1's folder-not-found.
2. **OMN-137 partial-result reporting, emitter-level.** The `bestEffort` emission changes from `catch (e) {}` to
   `catch (e) { _warnings.push(<label> + ': ' + (e && e.message ? e.message : String(e))) }`, with `let _warnings = [];`
   emitted once at program scope whenever any best-effort statement exists. Envelopes gain `warnings: ref('_warnings')`.
   Because the rule lives in the emitter, **`create/project` inherits warnings in this PR** (its envelope and golden
   tests update accordingly) — one semantics across migrated builders, no per-op fork. Best-effort statement nodes gain
   a `label` so warnings are attributable (`'tags'`, `'repetitionRule'`, `'status'`, `'reviewInterval'`).

`dateExpr`'s self-wrap keeps swallow semantics for now: an invalid date string produces `Invalid Date` rather than a
throw, so a warning there would be theater; tightening date validation is schema-layer work, not this slice.

## 4. Batch composition (`batch-create/tasks`)

Build-time **unrolled** program; the runtime `byTempId` map deletes:

```text
let _warnings = [];            // shared; per item: record _warnings.length at item start, slice() at item end
const results = [];
// per spec i, wrapped by batchItem(tempId_i, stmts_i):
try {
  <lowerTaskCreate(spec_i, names_i) statements, container guard throws instead of returning>
  results.push({ tempId: <i>, taskId: _t<i>.id.primaryKey, success: true, warnings: <item warnings> });
} catch (e) {
  results.push({ tempId: <i>, taskId: null, success: false, error: String(e && e.message ? e.message : e) });
  <if stopOnError: stop executing subsequent items>
}
return JSON.stringify({ results: results });
```

- `batchItem` is a new composite statement node owning the try/capture/result-push shape; inside it, a not-found
  container guard becomes a thrown error (per-item failure) rather than a top-level return — the guard node gains a
  `mode: 'return' | 'throw'` (single path returns, batch path throws).
- `parentTempId` resolves at build time to the prior item's binding (`{kind:'tempIdRef', var:'_t<j>'}`); a forward or
  missing reference is a **build-time** error (legacy made it a runtime per-item error; build time is strictly earlier
  and loud — input order still comes from `createSequentially` handling upstream, unchanged).
- `stopOnError`: emitted via the unrolled equivalent of `break` (a labeled block or an `_aborted` flag checked at each
  item head — emitter's choice, covered by vm-execution tests for both true/false).
- **Program-size guard:** unrolling scales code with N. The validator computes the emitted program size and throws a
  loud, actionable error above a conservative ceiling derived from the measured OmniJS bridge limit (261KB,
  `docs/dev/SCRIPT_SIZE_LIMITS.md`) — no silent truncation. Expected per-item cost ≲1KB; the guard is a backstop, not an
  expected path.

## 5. Dispatch, guard, and tool-layer changes

- `MUTATION_DEFS` gains `'create/task'` (`TaskCreateData`) and `'batch-create/tasks'`
  (`{ specs: BatchTaskSpec[]; stopOnError?: boolean }`). `dispatchMutation` takes the deferred per-key generic typing
  (`<K extends keyof typeof MUTATION_DEFS>(key: K, data: DataOf<K>)`) — the slice-1 `TODO(op #2)` lands here.
- `MutationDef.guard` widens to `(data) => void | Promise<void>`; `dispatchMutation` awaits it (the task sandbox guard
  `validateTaskCreate` is async; `validateBatchCreateOps` guards batch). The non-bypass property is unchanged: guard
  runs at dispatch, before build, for every registered op.
- `OmniFocusWriteTool` passes the envelope's `warnings` through to the MCP response for create-task, create-project, and
  per-item batch results. No schema-shape change otherwise; `warnings` is additive.
- The `index.ts` barrel exports the new symbols and the barrel actually gets exercised by tests (slice-1 carry-over #3).

## 6. Testing & verification

| Layer                                                       | What it proves                   | This slice                                                                                                                                                          |
| ----------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Type system                                                 | illegal trees unrepresentable    | `ContainerResolution` consumed only via guard-checked bindings; exhaustiveness guards on both data types                                                            |
| Unit/golden                                                 | emitted program shape            | golden tests for single + batch programs; `lowerRepetitionRule` tested as a pure function (RRULE permutations, method-derivation, catchUp default)                  |
| `node:vm` execution                                         | the emitted string actually runs | single-create program; 2-item batch with tags on both items (proves §2.4 collision fix); stopOnError true/false; warnings populated when a best-effort block throws |
| Live `/verify` (guarded dev server, `__MCP_TEST_SANDBOX__`) | real-DB correctness              | matrix in §6.1                                                                                                                                                      |
| Live integration (OMN-138)                                  | regression coverage at the seam  | create paths added to the integration suite as part of this PR                                                                                                      |

### 6.1 Live `/verify` matrix

1. Single create, all fields: note, flagged, all three dates, estimatedMinutes, nested tag path, weekly repetition
   (`FREQ=WEEKLY`) — read back every field.
2. Single create into a project **by name** and **by id**; subtask via `parentTaskId`.
3. Loud not-found: bogus project ref → error envelope, **no task created anywhere** (the legacy bug's regression check).
4. Batch: 3 items with a `parentTempId` chain; one deliberately failing middle item with `stopOnError: false` (expect
   partial results) and `true` (expect halt).
5. Warnings path: force a best-effort failure (e.g. malformed repetition input that passes schema but fails in
   OmniFocus) → create succeeds, `warnings` non-empty in the response.
6. Repetition correctness: created task's rule reads back with the right schedule type and anchor.

Plus the standing OF-task obligation: pressure-test the residual **unguarded ad-hoc server window** used for non-sandbox
verifies (root placement, arbitrary folder) and record the actual exposure + mitigation in the verify notes.

### 6.2 Acceptance

- `npm run build` clean; `npm run test:unit` green; lint 0 errors; integration suite green.
- Legacy template bodies of both builders **deleted** (no dead path left behind).
- Sandbox guard fires on both new dispatch keys (negative tests).
- Live `/verify` matrix above passes against real OmniFocus before PR review; findings recorded.

## 7. Risks / open edges

- **Unrolled-batch size** is bounded by the validator guard (§4); if real usage ever approaches it, the fallback design
  is a runtime-loop lowering — explicitly deferred until evidence demands it.
- **`create/project` golden churn** from the warnings change is deliberate and reviewed in this PR, not a regression.
- **`estimatedMinutes` falsy check** preserves legacy behavior (0 is dropped); changing that is schema-layer policy, out
  of scope.
- Batch `projectId` accepts a name fallback in legacy; preserved via `resolveProjectFlexible` for both paths (one
  resolver, one policy — the drift point eliminated).
