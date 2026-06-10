# OMN-128 Slice 4 — update-task + update-project (paired) on the Mutation AST

**Date:** 2026-06-10 **Ticket:** OMN-128 (umbrella) **Predecessors:**
`docs/superpowers/specs/2026-06-08-write-side-mutation-ast-design.md` (slice 1, `buildCreateProjectScript`, PR #74);
`docs/superpowers/specs/2026-06-09-create-task-batch-mutation-ast-design.md` (slice 2, create-task + batch-create, PR
#78); `docs/superpowers/specs/2026-06-09-create-folder-mutation-ast-design.md` (slice 3, create-folder, PR #80 — the
create family is complete). This slice opens the **update family**, migrating both update builders PAIRED because they
share an update substrate: set-vs-clear semantics, tag add/remove modes, and resolve-before-apply ordering.

## 1. Scope

Migrate `buildUpdateTaskScript` and `buildUpdateProjectScript` (`src/contracts/ast/mutation-script-builder.ts`) to the
OmniJS-native mutation AST (`src/contracts/ast/mutation/`):

| Builder                    | Legacy shape                                                                                             | New shape                                                       |
| -------------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `buildUpdateTaskScript`    | JXA shell + 1 `evaluateJavascript` island; generic runtime `if (changes.x !== undefined)` body           | one OmniJS program from `dispatchMutation('update/task', …)`    |
| `buildUpdateProjectScript` | JXA shell + up to 3 islands (props; status; folder move) + a 4th for tags; swallowed status/tag failures | one OmniJS program from `dispatchMutation('update/project', …)` |

Both builders keep their `GeneratedMutationScript` return shape and stay async (dispatch awaits the sandbox guard). Call
sites (`OmniFocusWriteTool`) already `await`.

**The lowering is build-time conditional.** The legacy scripts injected the whole `changes` object as JSON and shipped a
generic body of runtime field checks. The lowering runs in TypeScript where `changes` is already known, so the emitted
program contains ONLY the statements for fields actually being changed — a rename-only update emits a resolve, a guard,
one `setProp`, and a return.

**Out of scope:** complete, delete, batch-mixed `buildBatchScript` (last `batchNonce` standing, OMN-134 residue),
bulk-delete (slice 5), tag builders (slice 6); OMN-129 read-side retrofit; OMN-141 (batch stopOnError flattening);
OMN-142 (name filter matches notes).

## 2. Behavior deltas (deliberate, recorded)

### 2.1 ID-only update targets (kills the project name fallback)

Legacy `buildUpdateProjectScript` resolved its `projectId` parameter via `Project.byIdentifier` **with a silent fallback
to name matching** (`flattenedProjects.find(p => p.name === projectId)`); `buildUpdateTaskScript` had no such fallback.
This is the identifier/name conflation family slice 2 killed for create-task's project lookup. New: both update
**targets** resolve strictly by identifier — `resolveTask` / `resolveProjectById` — with loud not-found and nothing
mutated. A client passing a project NAME as the update id now gets `Project not found: <id>` instead of a name-matched
(possibly wrong-duplicate) update.

Move **destinations** keep their legacy flexible resolution — only the update target id is strict:

| Reference                     | Resolution                                                  |
| ----------------------------- | ----------------------------------------------------------- |
| update target `taskId`        | `Task.byIdentifier` only                                    |
| update target `projectId`     | `Project.byIdentifier` only (**delta**: name fallback dead) |
| `changes.project` (move dest) | `resolveProjectFlexible` (id, then name — legacy-faithful)  |
| `changes.parentTaskId`        | `Task.byIdentifier` (legacy-faithful)                       |
| `changes.folder` (move dest)  | `resolveFolderFlexible` (path / id / leaf name, OMN-127 #2) |

### 2.2 Resolve-first ordering (kills partial-apply-then-error)

Legacy update-task applied simple props FIRST, then returned an error envelope mid-script when a move target was missing
— persisted partial changes reported as total failure (non-atomic false failure, the duplicate-retry hazard class from
the slice-1 `appliedTags` incident). New: every reference resolution (target + all destinations) is emitted **before any
apply**, each followed by a return-mode guard. A not-found reference is a hard error with **zero mutations applied**.

Guard messages (legacy-exact where the legacy message existed):

| Guard                          | Message                                                                                                                                                          | Context          |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| target task missing            | `Task not found: <id>`                                                                                                                                           | `update_task`    |
| target project missing         | `Project not found: <id>`                                                                                                                                        | `update_project` |
| `changes.project` missing      | `Project not found: <ref>`                                                                                                                                       | `update_task`    |
| `changes.parentTaskId` missing | `Parent task not found: <ref>`                                                                                                                                   | `update_task`    |
| `changes.folder` missing       | `Folder not found: <ref>` (**delta**: legacy wrapped it as `Failed to move project: folder_not_found: <ref>`; the new message matches the create-family wording) | `update_project` |

### 2.3 OMN-137 — update paths stop swallowing

Legacy swallowed: project status set (`catch (e) {}` around a whole bridge island) and project tags
(`catch (e) { /* tag errors don't fail the update */ }`). Legacy repetition failures were NOT silent but worse: a
`new Task.RepetitionRule(...)` throw propagated to the outer JXA catch and returned a total-failure envelope AFTER
earlier changes had persisted — the §2.2 partial-apply class. (Legacy's mid-script `Invalid frequency` error also moves
strictly earlier: `lowerRepetitionRule` throws at build time.) New: every post-resolution apply that can fail is
`bestEffort` with a **label**, so failures surface as `_warnings.push('<label>: <message>')` and lift through the
existing tool-layer `liftWarnings`. Labels: `status`, `reviewInterval`, `tags`, `repetitionRule`, `move` (task
project/parent moves), `folder` (project folder move). Scalar/date `setProp`s keep their existing strategies (dateExpr
self-wraps; direct setProps on a resolved target are not wrapped — same posture as the create lowerings).

### 2.4 Read-back envelopes (kills the status echo)

Legacy project-update envelope returned `status: changes.status || 'active'` — an **echo of the requested input** while
the actual status set could have silently failed (the slice-3 vacuous-parentage lesson in builder form). New envelopes
read the live object and add `warnings`:

```js
// update/task
{ taskId: task.id.primaryKey, name: task.name, flagged: task.flagged, updated: true, warnings: _warnings }
// update/project
{ projectId: proj.id.primaryKey, name: proj.name, flagged: proj.flagged,
  status: <live proj.status mapped to 'active'|'on_hold'|'completed'|'dropped'>, updated: true, warnings: _warnings }
```

The status read-back is a builder-internal `raw` ternary chain over `Project.Status` constants (no user data — the `raw`
trust model). Envelope keys are unchanged plus `warnings`, so existing clients keep working.

## 3. Legacy-faithful semantics (preserved exactly)

| Semantics            | Behavior                                                                                                                                               |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Date set-vs-clear    | `dueDate/deferDate/plannedDate`: string sets via `dateExpr`; `null` assigns null; `clearX: true` wins over a value (legacy applied clear last)         |
| `estimatedMinutes`   | `clearEstimatedMinutes` → null; else set when `!== undefined` (NOTE: update sets 0; create drops 0 — pre-existing asymmetry, preserved)                |
| Tags replace         | `tags: [...]` → `clearTags()` then create-or-find + `addTag` per name; `tags: []` clears all (truthy-empty-array, legacy-faithful)                     |
| Tags add / remove    | `addTags` create-or-find + `addTag`; `removeTags` resolve WITHOUT create + `removeTag`, missing names silently skipped (legacy-faithful)               |
| Repetition           | `repetitionRule: null` → assign null; object → build-time lowering via existing `repetition.ts` (RRULE + enum paths as literals)                       |
| Task status          | `status: 'completed'` → `task.markComplete(new Date())`; `'dropped'` → `task.drop(true, new Date())`; applied LAST (legacy order)                      |
| Project status       | enum assign incl. `Active` (update supports it; create skips it) — extend the status map accordingly                                                   |
| `reviewInterval`     | existing `readModifyReassign` node + `reviewIntervalUnit` build-time unit conversion (shared with create/project)                                      |
| Move to inbox        | `changes.project: null` → `moveTasks([task], inbox.beginning)`                                                                                         |
| Remove parent        | `changes.parentTaskId: null` or `''` → `moveTasks([task], task.containingProject ? task.containingProject.beginning : inbox.beginning)`                |
| Move project to root | `changes.folder: null` → `moveSections([proj], library.beginning)`                                                                                     |
| Apply order          | task: scalars → dates → estimatedMinutes → moves → tags → repetition → status; project: scalars → reviewInterval → dates → status → folder move → tags |

**Task `sequential` is LIVE — `TaskUpdateData` gains the field (non-delta).** The legacy task script checks
`changes.sequential` and the field genuinely arrives: the shared `UpdateChangesSchema` accepts it for both targets, and
`sanitizeTaskUpdates` (`src/tools/unified/utils/task-sanitizer.ts`) deliberately coerces and forwards it — only the
`TaskUpdateData` TS interface is missing it. Setting `sequential` on a task is meaningful (action groups) and works
today. Fix the type, not the behavior: add `sequential?: boolean` to `TaskUpdateData` and lower it alongside the other
scalars (the exhaustiveness guard then counts 19 keys). Dropping it would be a silent behavior regression — exactly the
silent-drop class the exhaustiveness guards exist to prevent.

**Plan note (tool-layer seam):** `sanitizeTaskUpdates` normalizes `clearDueDate` → `dueDate: null` (stripping the clear
flags and converting dates) BEFORE the task builder, while `handleProjectUpdateDirect` passes clear flags through
untouched. The builder-level clear-wins semantics above are therefore load-bearing on the project path but reachable on
the task path only via direct builder calls — and the builder is the public contract, so the task-update golden tests
must exercise BOTH representations (`clearDueDate: true` and `dueDate: null`).

## 4. Substrate additions

### 4.1 Nodes (`mutation/types.ts`, `mutation/emitter.ts`)

| Node                 | Emission                                                                 | Notes                                                                                                                                                                                                                                                                                        |
| -------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `resolveTask`        | `const <bind> = Task.byIdentifier(<ref>) \|\| null;`                     | Generalizes `resolveParentTask` (identical emission): the node type is renamed, the `resolveParentTask` factory remains as an alias so slice-2 lowerings read unchanged. Mechanical rename across emitter/validator/tests.                                                                   |
| `resolveProjectById` | `const <bind> = Project.byIdentifier(<ref>) \|\| null;`                  | Strict counterpart to the flexible `resolveProject` — the strict/flexible asymmetry stays visible in the tree.                                                                                                                                                                               |
| `moveTask`           | `moveTasks([<task>], <position>);`                                       | `position` is a typed union: `{kind:'inboxBeginning'}` \| `{kind:'projectBeginning'; var}` \| `{kind:'parentEnding'; var}` \| `{kind:'containerRoot'; taskVar}` (emits the containingProject-or-inbox ternary). `bestEffort` + `label`.                                                      |
| `moveProject`        | `moveSections([<proj>], <position>);`                                    | `position`: `{kind:'libraryBeginning'}` \| `{kind:'folderBeginning'; var}`. `bestEffort` + `label`.                                                                                                                                                                                          |
| `callMethod`         | `<target>.<method>(<args>);`                                             | Allowlisted methods (`markComplete`, `drop`) — validator-enforced, extensible for slice 5 (complete/delete). `bestEffort` + `label`.                                                                                                                                                         |
| `assignTags.mode`    | `'replace' \| 'add' \| 'remove'` (absent = `'add'`, the create behavior) | `replace` prepends `<target>.clearTags();` inside the same best-effort wrap; `remove` resolves via `resolveTagByPath`/find WITHOUT create and calls `removeTag` (new `resolveTagByPath` snippet joins the registry — lifted from the legacy `OMNIJS_RESOLVE_TAG_PATH` const, single-source). |

Date/scalar applies and the null-assignments for clears reuse the existing `setProp` strategies — no new node needed
(`setProp(..., json(null), 'direct')` covers clears).

### 4.2 Snippets (`mutation/snippets.ts`)

`resolveTagByPath` (resolve-only walk, no create) joins the registry with `deps: ['parseTagPath']`, lifted verbatim from
the legacy `OMNIJS_RESOLVE_TAG_PATH` const. The remove-mode emission depends on it; the legacy const survives only until
the tag builders migrate (slice 6).

### 4.3 Lowerings (`mutation/defs.ts`)

Inputs are wrapper objects so `MutationDef<T>`'s single data parameter carries both id and changes:

```ts
export interface UpdateTaskInput {
  taskId: string;
  changes: TaskUpdateData;
}
export interface UpdateProjectInput {
  projectId: string;
  changes: ProjectUpdateData;
}
```

`buildUpdateTaskProgram` / `buildUpdateProjectProgram`, each with a compile-time exhaustiveness guard over its changes
type (`Record<keyof TaskUpdateData, true>` — 19 keys once `sequential` lands, §3;
`Record<keyof ProjectUpdateData, true>` — 16 keys), per the established discipline: a new schema field cannot be
silently dropped.

**Shared update helpers** (the "paired" substrate — shared where the data shapes genuinely coincide, mirroring how slice
2 shared `lowerTaskCreate` only because single/batch data was identical):

| Helper              | Serves                                                                   |
| ------------------- | ------------------------------------------------------------------------ |
| `lowerDateSetClear` | dueDate/deferDate/plannedDate set-vs-clear, both targets                 |
| `lowerTagChanges`   | tags/addTags/removeTags → mode'd `assignTags` nodes, both targets        |
| scalar lowering     | name/note/flagged/sequential `setProp`s (sequential on both targets, §3) |

Statement shape (both programs): target resolve + guard → destination resolves + guards → applies in legacy order →
read-back envelope. Return-mode guards throughout (no batch path in this slice).

### 4.4 Registry + sandbox guard (`MUTATION_DEFS`)

```ts
'update/task':    { guard: async (d) => { await validateTaskInSandbox(d.taskId, 'update'); validateTagChanges(d.changes); },
                    build: buildUpdateTaskProgram }    as MutationDef<UpdateTaskInput>,
'update/project': { guard: async (d) => { await validateProjectInSandbox(d.projectId, 'update'); validateTagChanges(d.changes); },
                    build: buildUpdateProjectProgram } as MutationDef<UpdateProjectInput>,
```

`validateTaskInSandbox`, `validateProjectInSandbox`, `validateTagChanges` get exported from `mutation-script-builder.ts`
(currently module-private) — same move as slice 3's `validateFolderCreate`. The guard runs at dispatch, BEFORE building:
the OMN-119/120 non-bypass property now covers updates. Carry-over: the guard pre-flight is ID-only
(`isTaskInSandbox`/`isProjectInSandbox` are byIdentifier checks), so live verifies of not-found probes and non-sandbox
targets need the bounded unguarded window (§7).

## 5. Validator (`mutation/validator.ts`)

**Prep (own commit, behavior-preserving):** extract each numbered rule from `validateStatementList` (cognitive
complexity 82 vs limit 20) into a per-rule function; existing validator tests must pass unchanged before any new rule
lands.

**New rules:**

1. Move nodes: `position` must be a typed object with a known `kind`; non-parameterless kinds require a non-empty string
   `var`/`taskVar` (mirrors rules 2/5).
2. `callMethod.method` must be in the allowlist (`markComplete`, `drop` this slice).
3. `assignTags.mode`, when present, must be in `{replace, add, remove}`.
4. **Rule 7 generalized:** today it guards resolve→construct only. Updates consume resolution binds in `setProp`
   targets, move nodes, `callMethod` targets, `assignTags` targets, and envelopes — so rule 7 widens to: any `resolve*`
   bind consumed by ANY later statement must have an intervening guard whose cond mentions the bind. This needs a small
   `Expr`-tree ref walker (collect `ref` names from statement expressions); the per-rule extraction makes it tractable.
   (Same trajectory as slice 3 widening rule 7 to all constructs.)

Reserved-identifier rule 10 extends to the new binding-free nodes' inner names (the move/callMethod nodes bind nothing;
no change beyond the walker).

## 6. Tool layer (`OmniFocusWriteTool.ts`)

- No schema changes (no new/renamed fields) → **no `inputSchema` edits** (dual-schema rule satisfied vacuously). Verify
  the tool description string doesn't document the killed name-fallback; update if it does.
- Verify `liftWarnings` is applied on both update response paths (it already wraps several result sites); add where
  missing so `warnings` reaches MCP clients on update.
- Both legacy builder bodies (and `buildUpdateChangesObject`, if it loses its last consumer) are deleted, not kept as
  fallbacks. The legacy `OMNIJS_PARSE_TAG_PATH`/`OMNIJS_RESOLVE_OR_CREATE_TAG_PATH`/`OMNIJS_RESOLVE_TAG_PATH`/
  `OMNIJS_PARSE_FOLDER_PATH`/`OMNIJS_RESOLVE_FOLDER_PATH`/`OMNIJS_RESOLVE_FOLDER_FLEXIBLE` consts survive only if a
  remaining legacy builder still interpolates them (complete/delete/batch/tag builders) — check with grep, delete what
  loses its last consumer.

## 7. Testing & verification

| Layer                      | Coverage                                                                                                                                                                                                                                                                                                                                                       |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Golden unit                | `tests/unit/contracts/ast/mutation/update-task.test.ts` + `update-project.test.ts`: per-field emission; only-what-changed program shape; exact guard messages; resolve-first ordering; mode'd tag emission; status read-back ternary                                                                                                                           |
| `node:vm` execution        | Stubbed OmniJS globals (Task/Project.byIdentifier, moveTasks, moveSections, inbox, library, flattenedTags, Project.Status, Task.RepetitionRule…): envelope correctness; warnings on forced best-effort failure; **zero mutation on not-found target**; clearTags ordering in replace mode                                                                      |
| Validator unit             | Extraction is behavior-preserving (existing tests unchanged); each new rule has a positive + negative case                                                                                                                                                                                                                                                     |
| Tool-layer unit            | `warnings` lifted on update responses                                                                                                                                                                                                                                                                                                                          |
| Live integration (OMN-138) | Sandbox-scoped update coverage in `tests/integration`: fixture task/project; update props/dates/tags/moves; **read back persisted values** (load-bearing fields — `parentId`, containing project, persisted status — never envelope echoes; the slice-3 vacuous-parentage lesson)                                                                              |
| Live `/verify` matrix      | At the external seam (mandatory per `feedback_verify_external_seams`): guarded sandbox probes + bounded unguarded window for ID-only not-found, name-as-id refusal, and non-sandbox cases; one-shot `of-call.mjs` driver recreated in job tmp; `pgrep -fl vitest` before probes; integration suite only via `run_in_background` (OMN-143 lock notwithstanding) |

Review gates per `feedback_review_gates`: spec review loop → user spec review → plan + plan review → user plan review →
per-task two-stage subagent reviews (spec-compliance, then code-quality with the vacuous-green/wrong-seam check) → final
pre-merge `superpowers:code-reviewer` gated on SAFE → `gh pr merge --squash --auto`.

## 8. Decision record (alternatives not taken)

- **One generic `lowerUpdate` + per-target field table** — rejected: task/project update shapes diverge on the
  structural half (moves vs folder moves; method-call status vs enum status; repetition vs reviewInterval); the table
  becomes a config DSL and the per-target exhaustiveness guards stop being expressible as plain `Record<keyof T, true>`.
- **One mega-node per op (`updateTask` node)** — rejected by the OMN-128 design framing (one-node-per-op is too rigid;
  set-vs-clear and move semantics would be validator-opaque).
- **Keep the project name fallback** — rejected: same conflation class as the create-side silent inbox fallback (slice-2
  delta); a duplicate-name match can silently update the wrong project.
- **Hard-fail on any apply failure** — rejected: OmniJS inside one `evaluateJavascript` isn't transactional, so a
  hard-fail envelope would misreport already-persisted partial state; resolve-first + OMN-137 warnings reports the truth
  instead.
