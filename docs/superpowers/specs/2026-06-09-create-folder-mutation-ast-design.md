# OMN-128 Slice 3 — create-folder on the Mutation AST

**Date:** 2026-06-09 **Ticket:** OMN-128 (umbrella) **Predecessors:**
`docs/superpowers/specs/2026-06-08-write-side-mutation-ast-design.md` (slice 1, `buildCreateProjectScript`, PR #74);
`docs/superpowers/specs/2026-06-09-create-task-batch-mutation-ast-design.md` (slice 2, create-task + batch-create, PR
#78). This slice finishes the **create family**.

## 1. Scope

Migrate `buildCreateFolderScript` (`src/contracts/ast/mutation-script-builder.ts`) to the OmniJS-native mutation AST
(`src/contracts/ast/mutation/`):

| Builder                   | Legacy shape                                                                                         | New shape                                                      |
| ------------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `buildCreateFolderScript` | JXA shell + 2 `evaluateJavascript` islands (parent-folder lookup; JXA→OmniJS `id.primaryKey` bridge) | one OmniJS program from `dispatchMutation('create/folder', …)` |

The builder keeps its `GeneratedMutationScript` return shape but goes sync → **async** (dispatch awaits the sandbox
guard, same forcing as slices 1–2). The single call site (`OmniFocusWriteTool.handleFolderCreate`) adds `await`.
`validateFolderCreate` (currently module-private) gets exported for `MUTATION_DEFS` registration.

The id-bridge island (find JXA index → re-query `id.primaryKey` via a second `evaluateJavascript`) is **deleted, not
migrated** — in a single-runtime program `folder.id.primaryKey` reads directly off the fresh binding (same precedent as
slice 2 deleting the OMN-29 nonce).

Out of scope: update-task/update-project (slice 4, paired — shared update substrate), complete, delete, batch-mixed
`buildBatchScript` (carries the last `batchNonce`, OMN-134 residue), bulk-delete, tag builders; OMN-129 read-side
retrofit; OMN-141/OMN-142 (open tickets from slice 2).

## 2. Substrate additions

### 2.1 `constructFolder` node (`mutation/types.ts`, `mutation/emitter.ts`)

Near-clone of `constructProject`, consuming the **existing** `FolderResolution` type. Full substrate checklist (every
touch point, so none is silently skipped):

```ts
export interface ConstructFolderNode {
  type: 'constructFolder';
  bind: string;
  name: Expr;
  parent: FolderResolution;
}
```

- `types.ts`: the interface above; add `ConstructFolderNode` to the `Stmt` union; add the factory
  `constructFolder(bindVar: string, name: Expr, parent: FolderResolution): ConstructFolderNode` (mirrors
  `constructProject`'s factory).
- `emitter.ts`: new `case 'constructFolder'` in `emitStmt`'s exhaustive switch (the `never` default forces this at
  compile time once the union grows).
- `validator.ts`: new rules in `validateStatementList` (§2.2).
- `index.ts` barrel: export `ConstructFolderNode` (type), `constructFolder` (factory), and `buildCreateFolderProgram`
  (lowering).

Emission (OmniJS API verified against omni-automation.com:
`new Folder(name: String, position: Folder | Folder.ChildInsertionLocation | null)`; omitted position = top-level
library placement):

| `parent.kind` | Emission                                                    |
| ------------- | ----------------------------------------------------------- |
| `resolved`    | `const <bind> = new Folder(<name>, <var>);`                 |
| `none`        | `const <bind> = new Folder(<name>);`                        |
| `notFound`    | illegal at emit time (throw) — mirror of `constructProject` |

Passing the resolved `Folder` object directly as position appends inside it — the same convention `constructProject`
uses (`new Project(name, folderVar)`), and behavior-equivalent to the legacy `targetParent.folders.push(folder)`.
`const` (not `var`) — folders have no batch path, so no cross-item hoisting concern.

### 2.2 Validator (`mutation/validator.ts`)

- Extend rules 2/3 to `constructFolder`: `parent` must be a typed `FolderResolution` (kind ∈ {resolved, none,
  notFound}); `notFound` is illegal — must be guard-handled earlier.
- Rule 10: `constructFolder.bind` must not be a reserved emitter identifier.
- **Rule 7 extension (pre-existing gap, closed here):** the resolution-guard discipline currently covers only
  `resolveProject`/`resolveParentTask` → `constructTask`. Extend it to `resolveFolder` binds consumed by
  `constructProject.folder.var` or `constructFolder.parent.var` (kind `resolved`): a `guard` whose `cond` mentions the
  bind (word-boundary match) must sit between resolve and construct. **Implementation structure** (the existing rule-7
  loop generalizes): widen the resolve-node filter to include `resolveFolder`; per construct node the consumed-bind
  accessor differs — `constructTask` reads `container.var` (kind ≠ `inbox`), `constructProject` reads `folder.var` (kind
  = `resolved`), `constructFolder` reads `parent.var` (kind = `resolved`). This retroactively covers the slice-1
  create-project lowering (which already complies — its guard sits between resolve and construct) and protects the new
  lowering. No existing unit test hand-builds an unguarded `resolveFolder` + `constructProject` pair, so no test churn
  (verified during spec review).

No new snippets — `resolveFolderFlexible` (+ its `parseFolderPath`/`resolveFolderPath` deps) is already in the
single-source registry, and the existing `resolveFolder` statement node already emits the call.

## 3. Lowering (`mutation/defs.ts`)

`buildCreateFolderProgram(data: FolderCreateData): Program`, with the established compile-time exhaustiveness guard
(`Record<keyof FolderCreateData, true>` — `name`, `parentFolder`).

Statement order (legacy-faithful):

1. If `data.parentFolder`: `resolveFolder('targetParent', data.parentFolder)` + return-mode
   `guard('targetParent === null', { error: json(true), message: json('Parent folder not found: ' + data.parentFolder), context: json('create_folder') })`
   — envelope values are `Expr` nodes (`json(...)`), exactly like `buildCreateProjectProgram`'s guard; the message text
   is the **exact legacy string**, already loud since OMN-127 (no behavior delta). `snippetDeps` is conditionally
   `['resolveFolderFlexible']` here and `[]` on the top-level path (mirrors create/project's conditional push;
   transitive `parseFolderPath`/`resolveFolderPath` come via `collectSnippets`).
2. `constructFolder('folder', json(data.name), resolved | none)`.
3. Return envelope:

```ts
{
  folderId: member(ref('folder'), 'id.primaryKey'),
  name: member(ref('folder'), 'name'),
  parentFolder: data.parentFolder ? raw('targetParent.name') : json(null),
  warnings: ref('_warnings'),   // OMN-137 uniformity — see below
  created: json(true),
}
```

**Envelope deltas vs legacy, both deliberate:**

1. `folderId` is always the OmniJS `id.primaryKey` — the legacy JXA-id fallback (used only when the bridge re-query
   failed) is dead along with the bridge. Strictly more correct: one id namespace.
2. `warnings: ref('_warnings')` is **additive** — the emitter declares `_warnings` unconditionally, and the folder
   lowering has no best-effort statements, so it is always `[]` today. Included for one-semantics uniformity across
   migrated create envelopes (slice-2 §3.1.2 precedent); `liftWarnings` at the tool layer omits empty arrays.

Nested-path semantics (`Parent : Child`, `/`) preserved exactly: `resolveFolderFlexible` walks existing paths only —
**parents must already exist**; a missing segment is the loud not-found, never mkdir-p.

## 4. Dispatch, guard, and tool-layer changes

- `MUTATION_DEFS` gains `'create/folder'` (`FolderCreateData`), guard `validateFolderCreate` (sync — the widened
  `void | Promise<void>` signature accepts it as-is), build `buildCreateFolderProgram`.
- `validateFolderCreate` exported from `mutation-script-builder.ts` (mirrors `validateProjectCreate` /
  `validateTaskCreate`). Its semantics are untouched: test mode requires `parentFolder === SANDBOX_FOLDER_NAME` (exact
  string match).
- `buildCreateFolderScript` becomes the thin async wrapper (dispatch → validate → emit → `wrapInLauncher`), same shape
  as `buildCreateProjectScript`. Legacy template body **deleted**.
- `OmniFocusWriteTool.handleFolderCreate`: `await` the builder; spread `...liftWarnings(result.data)` into the success
  response data object (top-level alongside `folder`/`operation` — the exact create-task/create-project precedent:
  warnings stay nested in `folder.warnings` AND are promoted top-level when non-empty; `liftWarnings` returns `{}` for
  empty/missing). Additive: the legacy envelope never had a `warnings` key.
- **Guard-throw surface (unchanged class):** in test mode, `dispatchMutation` runs `validateFolderCreate` before
  building, so a guard violation now throws from `await buildCreateFolderScript(...)` rather than surfacing as a
  script-level error envelope. `handleFolderCreate` does not catch it — deliberately the same surface as
  `handleProjectCreate`/`handleCreateTask` after slices 1–2 (the throw propagates to the tool-level error handler). Live
  matrix item 1 asserts the observable: a `TEST GUARD` error response, nothing created.
- `mutation/index.ts` barrel exports the new symbols (§2.1 checklist).

## 5. Testing & verification

| Layer                      | What it proves                   | This slice                                                                                                                                       |
| -------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Type system                | illegal trees unrepresentable    | `constructFolder` consumes only `FolderResolution`; exhaustiveness guard on `FolderCreateData`                                                   |
| Unit/golden                | emitted program shape            | new `tests/unit/contracts/ast/mutation/create-folder.test.ts`: top-level, nested (name / path / id refs), guard envelope, snippet inclusion      |
| Validator                  | malformed programs throw         | `constructFolder` notFound illegal; untyped parent; reserved bind; **rule-7 extension** (unguarded resolveFolder→construct throws)               |
| `node:vm` execution        | the emitted string actually runs | top-level + nested create against the OmniJS shims (Folder constructor, flattenedFolders); not-found returns the error envelope, creates nothing |
| Live `/verify`             | real-DB correctness              | matrix §5.1                                                                                                                                      |
| Live integration (OMN-138) | regression coverage at the seam  | folder-create paths added to the integration suite in this PR                                                                                    |

**Test placement (slice-2 precedent):** all new node/validator/golden/vm tests live in the slice-specific
`tests/unit/contracts/ast/mutation/create-folder.test.ts`, not in `validator.test.ts`.

**vm shim surface (must be added — the existing create-task shims have no folder support):** the slice's vm sandbox
needs, beyond what `create-task.test.ts` already shims: a `Folder` constructor accepting `(name, parent?)` that records
`name`, `parent`, and a fresh `id.primaryKey`, and appends itself to the parent's children (or the top-level
collection); a static `Folder.byIdentifier(ref)`; `flattenedFolders` (array of folder stubs with `.name` and
`.id.primaryKey`); and the top-level `folders` collection (the `resolveFolderPath` snippet walks
`parent ? parent.children : folders`).

**Legacy test rewrite (`mutation-script-builder.test.ts`, `buildCreateFolderScript` describe block):** every test
becomes `async` and **awaits** the builder — a sync call on the now-async builder returns a Promise, so un-awaited
assertions on `result.script` would read `undefined` rather than fail loudly at the right seam. Expectations change
substantively: the script is now the JSON-encoded one-program launcher (assert against the JSON-decoded program where
needed, as the slice-2 rewrites do); the `primaryKey`-bridge and `flattenedFolders`-index expectations are deleted; the
"parent folder not found" test asserts the guard emission inside the encoded program rather than a JXA-island string.

### 5.1 Live `/verify` matrix

Sandbox-guard constraint discovered in slice 2 carries over with a folder-specific twist: `validateFolderCreate`
requires `parentFolder === SANDBOX_FOLDER_NAME` (exact string), so on the guarded dev server only a simple-name sandbox
parent passes. Path refs, id refs, top-level creates, and not-found probes all need the **bounded unguarded window**
(`of-call.mjs --unguarded` pattern, one call per process, killed in `finally`).

1. Guard refuses non-sandbox folder create (guarded) — `TEST GUARD` error, nothing created.
2. Nested create under sandbox by **name** (guarded) — read back `parentFolder`, `folderId` is a primaryKey; with a
   sibling pre-created, confirm the new folder lands at the **end** of the parent's children (legacy `push()` appended;
   `new Folder(name, folderObj)` must match — this is the §6 position-form risk's authoritative check).
3. Nested create under a path ref (`__MCP_TEST_SANDBOX__ : <child>` after pre-creating the child) (unguarded, bounded) —
   path walk works end-to-end.
4. Nested create by **parent id** (unguarded, bounded).
5. Loud parent-not-found: bogus parent → `Parent folder not found: …` envelope, **no folder created anywhere**.
6. Top-level create (unguarded, bounded) — placed at library root; deleted in cleanup.

All artifacts `__TEST__`-prefixed or sandbox-scoped; full sweep + residue check at the end (slice-2 cleanup discipline).
`pgrep -fl vitest` before any live verify (orphaned-run class, OMN-143 norm).

### 5.2 Acceptance

- `npm run build` clean; `npm run test:unit` green; lint 0 errors; integration suite green (run via `run_in_background`
  only).
- Legacy template body of `buildCreateFolderScript` deleted (no dead path left behind).
- Sandbox guard fires on the new dispatch key (negative test).
- Live `/verify` matrix passes against real OmniFocus before PR review; findings recorded.

## 6. Risks / open edges

- **Rule-7 extension blast radius:** it newly constrains `constructProject` programs too. The only existing lowering
  (`buildCreateProjectProgram`) already guards its folder resolve, so no churn expected; if a hand-built test program
  violates it, the test gets fixed — the rule is the spec.
- **`new Folder(name, folderObj)` position form:** verified against the published OmniJS API and mirrors the shipped
  `constructProject` convention, but the live matrix (§5.1 items 2–4) is the authoritative check.
- **Warnings field is always empty today** — it's plumbing for uniformity, not a feature; if a reviewer flags it as
  speculative, the counter is slice-2's one-semantics-across-builders decision (envelope shape should not fork per-op).
