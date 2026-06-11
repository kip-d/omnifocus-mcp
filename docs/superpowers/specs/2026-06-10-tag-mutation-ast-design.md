# OMN-128 Slice 6 — tag builders on the Mutation AST

**Ticket:** OMN-128 (write-side mutation codegen → AST emitter). **Slice:** 6 of 6 — the last family. **Predecessors:**
`2026-06-08-write-side-mutation-ast-design.md` (slice 1, create-project),
`2026-06-09-create-task-batch-mutation-ast-design.md` (slice 2), `2026-06-09-create-folder-mutation-ast-design.md`
(slice 3), `2026-06-10-update-task-project-mutation-ast-design.md` (slice 4),
`2026-06-10-complete-delete-mutation-ast-design.md` (slice 5).

After this slice, **zero write-side template-string codegen remains** and every write path routes through the
`MUTATION_DEFS` guard chokepoint.

## 1. Scope

`src/contracts/ast/tag-mutation-script-builder.ts` — seven builders, all template-string JXA, four with nested-backtick
`evaluateJavascript` islands (the OMN-111/113 injection shape):

| Builder                  | Legacy shape                                                                                   | Island? |
| ------------------------ | ---------------------------------------------------------------------------------------------- | ------- |
| `buildCreateTagScript`   | JXA `app.make` + `collection.push` fallback + OMN-27 index-loop id bridge + path-create island | yes     |
| `buildRenameTagScript`   | JXA name-scan + `tag.name =`                                                                   | no      |
| `buildDeleteTagScript`   | JXA name-scan + `app.delete`                                                                   | no      |
| `buildMergeTagsScript`   | island iterating `flattenedTasks` (removeTag/addTag) + JXA `app.delete` of source              | yes     |
| `buildNestTagScript`     | island: resolve + self-check + `moveTags([t], parent)`                                         | yes     |
| `buildUnparentTagScript` | island: resolve + `moveTags([t], null)`                                                        | yes     |
| `buildReparentTagScript` | island: resolve + optional parent + `moveTags`                                                 | yes     |

**Call-site map is exactly one seam:** `handleTagManage` in `OmniFocusWriteTool.ts` (a 7-way switch). It passes
`tagName`, and per-action `newName` / `targetTag` / `parentTagName`. It **never** passes `parentTagId` — that parameter
(on create/nest/reparent) is dead at every seam: the write schema exposes `parentTag` as a name, and no test references
it (`grep -rn parentTagId src tests` hits only the builder file itself).

Tag-by-name resolution is hand-copied **five times** with already-divergent semantics (create's parent: id-first then
name in JXA; nest/reparent: id-first then name in OmniJS; rename/delete/merge: name-only in JXA) — the OMN-127 drift
class, live.

Existing test surface: `tests/unit/tag-operations.test.ts` (8 tests), `tests/unit/tag-conversion.test.ts` (3),
`tests/integration/test-tag-hierarchy.ts`.

Out of scope: `tag-script-builder.ts` (read side), `assignTags` (migrated in slices 1–4), tool-layer response assembly
(unchanged), the write schema.

## 2. Behavior deltas (deliberate, Kip-approved 2026-06-10)

### 2.1 Sandbox guard moves to dispatch and covers every name an op touches

`validateTagMutation` (name-prefix guard: in test mode, every targeted tag must start with `TEST_TAG_PREFIX`) relocates
from inside the builders to the `MUTATION_DEFS` guards — the last entry in the OMN-119/120 bypass class closes; after
this slice a write path that skips the guard does not exist.

**Coverage unifies (stricter in two corners, sandbox-only):** legacy guards `tagName` everywhere, `newName` on rename,
`targetTag` on merge, and `parentTagName` on nest/reparent — but **not** `parentTagName` on create. New guards cover
every tag name the op touches, uniformly — so in test mode, creating a `__TEST__` tag under a real (unprefixed) parent
now refuses loudly where legacy executed it. Same posture as slice 5's §2.1. Path-syntax creates guard the **full path
string** (it starts with the prefix or it refuses — segments aren't individually prefixed, matching how the integration
helpers name path fixtures).

### 2.2 `tagId` always real — the OMN-27 id bridge and both `catch(e) {}` swallowers die

OmniJS gives `tag.id.primaryKey` directly; the JXA index-loop bridge, its silent-catch fallbacks, and the `'unknown'`
sentinel become unrepresentable. The create envelope's `tagId` / `parentTagId` are always live values. These two empty
catches are the **last write-path swallowers** flagged in slice 5 §2.4 — whether OMN-137 closes at this merge is Kip's
call, recorded in the ticket.

Also dead by construction: the legacy dual create path (`app.make` throws → retry `collection.push`) collapses to one
`new Tag(name)` / `new Tag(name, parent)` construct, and the JXA preamble's `flattenedTags()` null-check envelope
("Failed to retrieve tags from OmniFocus…") has no OmniJS analogue.

### 2.3 Envelopes — slice-4 convention (no inner `success` key)

Migrated envelopes drop `success: true` (the transport's `ScriptResult` owns success signaling; error envelopes remain
`{error: true, message}` — same shape legacy tag errors already use). Everything else in the envelopes is preserved
key-for-key, including `action`, the human `message` strings, and merge's `tasksMerged` count:

```js
// create (flat)                                    // create (path)
{ action: 'created', tagName, tagId,                { action: 'created', tagName: <leaf>, tagId,
  parentTagName: <name|null>,                         path: <full input>, createdSegments: [<names>],
  parentTagId: <id|null>, message }                   message }
// rename                                           // delete
{ action: 'renamed', oldName, newName, message }    { action: 'deleted', tagName, message }
// merge                                            // merge (source delete failed — see §2.5)
{ action: 'merged', sourceTag, targetTag,           { action: 'merged_with_warning', sourceTag, targetTag,
  tasksMerged, message }                              tasksMerged, warning, message }
// nest                                             // unparent / reparent-to-root
{ action: 'nested', tagName, parentTagName,         { action: 'unparented'|'reparented', tagName, message }
  parentTagId, message }
// reparent (with parent)
{ action: 'reparented', tagName, newParentTagName, newParentTagId, message }
```

`handleTagManage` passes the envelope through as `result` and is otherwise unchanged.

### 2.4 `parentTagId` parameters erased

The three builders that accept `parentTagId` lose it (dead at every seam, §1). OMN-134 precedent: erasure of zero-caller
surface, not migration of it. The nest/reparent islands' id-first-then-name parent resolution thereby becomes name-only
— **no observable change at any live seam**, recorded because the builder signatures are exported.

### 2.5 `deleteObject` gains opt-in best-effort (merge only) — amends a slice-5 design note

Slice 5 spec'd `DeleteObjectNode` as hard-error-only ("no partial result to preserve"). Merge **has** a partial result:
retagging already happened when the source delete runs. Legacy preserves it loudly (`merged_with_warning`).
`DeleteObjectNode` gains optional `bestEffort` + `label` (same fields and emitter machinery as `setProp` /
`callMethod`); the delete/task–delete/project–bulk lowerings don't set it, so their hard-error posture is untouched.
Merge's lowering routes the failure into the envelope's `warning` rather than OMN-137 `warnings[]` to stay
envelope-compatible (recorded: this is the one best-effort site that predates and bypasses the `warnings[]` mechanism —
by design, not omission).

### 2.6 Outer error shape — launcher-standard

A thrown top-level error now returns the launcher's `{error: true, message, context}` instead of legacy
`formatError(error, 'manage_tags')` (`{error: true, message, context: 'manage_tags', stack?}`). Same keys
`isScriptError` consumes; the `context` value changes from `'manage_tags'` to the per-op program context, and `stack`
disappears. Tool-layer behavior is unchanged.

## 3. Legacy-faithful semantics (preserved exactly)

- **Name resolution:** exact-name match over `flattenedTags`, **first match in flattened order** — a nested tag is
  addressable by bare name. (Legacy rename/delete/merge used a JXA forEach-with-break; nest/reparent used OmniJS
  forEach-**without**-break, which takes the _last_ match. The new `resolveTag` emits first-match for all — the
  divergence is exactly the OMN-127 drift class this ticket exists to kill; flattened order makes last-vs-first
  observable only with duplicate names at different depths, recorded here rather than preserved per-op.)
- **Create, flat:** duplicate name anywhere → `{error: true, message: "Tag '<name>' already exists"}`. Parent given but
  not found → `"Parent tag not found: <name>"`.
- **Create, path syntax** (`' : '` separator): find-or-create each segment; already-fully-existing path returns success
  with `createdSegments: []` and the "already exists" message; path + `parentTag` together →
  `"Cannot use path syntax (' : ' separator) with parentTag parameter…"` error; empty segment →
  `'Invalid tag path: empty segment in "<input>"'` error. (Path parsing moves to **build time** in the lowering — same
  envelopes, emitted as constant-return programs for the two error cases.)
- **Rename:** target not found → `"Tag '<name>' not found"`; `newName` already exists →
  `"Tag '<newName>' already exists"`; then `tag.name = newName`.
- **Delete:** not found → `"Tag '<name>' not found"`; `deleteObject(tag)` failure is a hard error.
- **Merge:** source/target not found → `"Source tag '<x>' not found"` / `"Target tag '<y>' not found"`; retag every task
  carrying source (`removeTag(src)`, `addTag(tgt)` only if not already tagged, count++), then delete source
  (best-effort, §2.5).
- **Nest:** parent required (`"Parent tag name or ID is required for nest action"` — wording preserved verbatim, id
  mention and all); self-nest → `"Cannot nest tag under itself"`; `moveTags([tag], parent)`.
- **Unparent:** `moveTags([tag], null)`.
- **Reparent:** parent optional — absent moves to root (legacy quirk, preserved); self-reparent →
  `"Cannot reparent tag under itself"`; envelope branches on with-parent vs to-root (§2.3).
- **`moveTags` failures** (e.g. nesting under own descendant — legacy never pre-checks) surface as
  `"Failed to nest tag: <err>"` / unparent / reparent wordings via the node's error wrapping.
- **Tool seam:** `GeneratedMutationScript` shape, `handleTagManage`'s switch, cache invalidation, and the
  `'unnest'→'unparent'` alias are all untouched.

## 4. Substrate additions

### 4.1 Nodes (`mutation/types.ts`, `mutation/emitter.ts`)

| Node                   | Shape                                                                                                             | Emits                                                                                                                                                                                           |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ResolveTagNode`       | `resolveTag(bind, ref)`                                                                                           | first-match exact-name scan over `flattenedTags` into `const <bind>`                                                                                                                            |
| `ConstructTagNode`     | `constructTag(bind, name: Expr, parent: TagResolution)`                                                           | `new Tag(<name>)` / `new Tag(<name>, <parentVar>)`; `notFound` is unconstructable by type (the greenlight never-null-into-root rule)                                                            |
| `ConstructTagPathNode` | `constructTagPath(bind, createdBind, segments: Expr)`                                                             | find-or-create walk binding leaf tag + created-segment-names array (the existing `resolveOrCreateTagByPath` snippet returns only the leaf — this node's snippet variant also reports `created`) |
| `MoveTagNode`          | `moveTag(tag: Expr, position: TagMovePosition)` where `TagMovePosition = {kind:'root'} \| {kind:'underTag'; var}` | `moveTags([<tag>], null \| <var>)` — one node, three consumers (nest/unparent/reparent)                                                                                                         |
| `MergeRetagNode`       | `mergeRetag(sourceVar, targetVar, bind)`                                                                          | the `flattenedTasks` iteration (hasSrc/hasTgt scan, `removeTag`/conditional `addTag`, count) binding the count — bespoke per the `bulkDeleteItem` precedent; emitter owns the loop internals    |

Plus: `TagResolution` union (`{kind:'resolved'; var} | {kind:'none'} | {kind:'notFound'}` — the typed fail-able tag
resolution deferred since slice 1, now needed) and the `DeleteObjectNode` `bestEffort`/`label` extension (§2.5).

### 4.2 Lowerings (`mutation/defs.ts`)

Seven `build*TagProgram(data)` functions, each with the compile-time exhaustiveness guard (`Record<keyof Data, true>`)
the other lowerings carry. Statement shapes:

- **create (flat):** `resolveTag(_dup, name)` → guard found ("already exists") → [if parent: `resolveTag(_parent,
  parentName)` → guard not-found] → `constructTag(_tag, name, resolution)` → `return_` (live ids).
- **create (path):** build-time parse (§3) → `constructTagPath(_tag, _created, segments)` → `return_`.
- **rename:** `resolveTag(_tag, name)` → guard not-found → `resolveTag(_dup, newName)` → guard found →
  `setProp(_tag, 'name', json(newName))` → `return_`.
- **delete:** `resolveTag(_tag, name)` → guard not-found → `deleteObject(ref(_tag))` → `return_`.
- **merge:** two `resolveTag` + guards → `mergeRetag(_src, _tgt, _count)` → `deleteObject(ref(_src), bestEffort, label)`
  → `return_` (envelope branches on the delete outcome — emitter pattern as in §2.5).
- **nest:** `resolveTag(_tag)` + guard → `resolveTag(_parent)` + guard → self-check guard →
  `moveTag(ref(_tag), {kind:'underTag', var:'_parent'})` → `return_`. (The parent-required check is build-time: absent
  parent emits the constant error program, §3.)
- **unparent:** `resolveTag(_tag)` + guard → `moveTag(ref(_tag), {kind:'root'})` → `return_`.
- **reparent:** like nest, but absent parent lowers to the `{kind:'root'}` position and the to-root envelope.

### 4.3 Registry + guards (`MUTATION_DEFS`)

Seven entries: `create/tag`, `rename/tag`, `delete/tag`, `merge/tag`, `nest/tag`, `unparent/tag`, `reparent/tag`. Guards
are sync `validateTagMutation` calls (relocated from the builder file) over every name the op touches (§2.1).
`validateTagMutation` moves to `defs.ts` (or a shared guards module beside the other `validate*` guards — implementer's
choice, recorded in the plan).

### 4.4 Wrappers (`tag-mutation-script-builder.ts`)

The module survives as the import seam: seven thin async wrappers in the established shape (`dispatchMutation` →
`validateMutationProgram` → `emitProgram` → `wrapInLauncher` → `GeneratedMutationScript`). Everything else in the file —
preamble, epilogue, the four islands, `validateTagMutation` — is deleted, not migrated.

## 5. Validator (`mutation/validator.ts`)

- Rule 7 (`consumedBind`) extends to the new consumers: `constructTag.parent` (when `resolved`), `moveTag.position`
  (when `underTag`), `mergeRetag` (both vars).
- Bind-declaration tracking covers `resolveTag`, `constructTag`, `constructTagPath` (two binds), `mergeRetag`.
- No `CALL_METHOD_ALLOWLIST` change — `moveTags` is a node, not a `callMethod`.

## 6. Tool layer (`OmniFocusWriteTool.ts`)

`handleTagManage` is byte-identical except the builder calls lose nothing visible (it never passed `parentTagId`). No
schema change, no response-assembly change.

## 7. Testing & verification

- **Structural unit tests per lowering** (slice pattern): program-shape assertions + emitted-script content, including
  the §2.1 guard coverage (per-op refusal tests) and the §3 error envelopes. Update the 11 existing tag unit tests to
  the new emitted shape.
- **Non-vacuity discipline:** every envelope assertion driven through `dispatchMutation` (the real seam), not the
  lowering functions directly, so guard-before-build is exercised.
- **Live integration** (OMN-138 posture): a guarded round-trip on `__TEST__` tags — create (flat + path + under parent)
  → rename → nest → reparent → unparent → merge → delete — asserting **persisted** state via read-back (parent linkage
  by id, merge by querying the target tag's tasks), never the envelope echo.
- **Live `/verify` matrix per builder** at the OmniFocus seam (mandatory — template→emitter swaps are the "wiring tests
  pass, artifact broken" trap, cf. OMN-125). Verify record to Obsidian, slice convention.
- Full gates: `npm run build`, `npm run test:unit`, `npm run test:integration` (npm, background-run per OMN-143).

## 8. Decision record (alternatives not taken)

- **Bespoke `mergeRetag` vs generic `forEachTask` node vs snippet** — bespoke chosen (Kip, 2026-06-10): the whole-DB
  iteration has no second consumer (YAGNI), and a generic iteration node widens the validator surface for one caller; a
  snippet can't parameterize the per-op envelope cleanly.
- **Build-time vs runtime path parsing** — build time: the lowering sees the literal `tagName`, so `' : '` detection and
  the two input-error cases need no runtime code; envelopes stay equivalent via constant-return programs.
- **Keep `tag-mutation-script-builder.ts` as wrapper seam vs consolidate into `mutation-script-builder.ts`** — keep:
  preserves the import surface (`OmniFocusWriteTool` + two test files) for zero call-site churn; the file shrinks from
  ~750 lines of templates to ~100 of wrappers.
- **Typed `TagResolution` now vs continue string-shaped** — now: slice 1 deferred it "until a read-only ResolveTag node
  is needed"; rename/delete/merge/nest/reparent are exactly that need, and the greenlight comment requires resolution as
  a typed fail-able step.
- **Unify name resolution on first-match** (vs preserving nest/reparent's accidental last-match) — unify: the per-op
  divergence is the drift class itself; preserving it would mean two resolveTag variants distinguished only by a
  historical bug. Recorded as a delta in §3.
