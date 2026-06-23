# OMN-167: Tasks-side folder filter — Parent:Child path, subtree match (shared with projects-side)

**Date:** 2026-06-16 **Ticket:** OMN-167 (capability work preserved from OMN-162's "alternative not taken")
**Decision:** Implement option (a). Folder is identified by a `Parent : Child` **path** (bare name = 1-segment path),
matched against the **subtree** beneath the pinned folder, via a **shared emitter used by both tasks-side and
projects-side**.

> **Ratified + premise re-checked 2026-06-23 (Kip).** This doc never landed on `main` (it lived only in dangling commit
> `9dcbd9c1` on the discarded 2026-06-18 build branch); the 2026-06-18 escalation that cited it as "authoritative in the
> repo" was working from a doc that was never merged. Kip re-ratified **this** design on 2026-06-23 (Design A over the
> vault spec's tasks-only/bare-name/exclude-dropped Decision-A; **status-agnostic** confirmed) — so it now governs and
> **supersedes OMN-203** (projects-side is upgraded here, not deferred).
>
> Re-checked every §0 surface against current `main` (`03e1f7b2`). One material change since `9ee4ef1`: **OMN-193
> removed the `export` read type entirely** — there is no `exportType` / `type:"export"` path anymore. So **§2.4's
> export-folder considerations are moot and dropped**: nothing to probe, no export-folder follow-up. All other surfaces
> (`SYNTHETIC_FIELD_DEFS`/`tagStatusValid` emitter shape, `folder:'reject'` in `task-key-disposition.ts`, the
> `folderName`/`folderId`/`topLevelOnly` blocks in `filter-generator.ts`, `TaskFilter.folder`/`folderTopLevel`
> already-present-but-dead) verified accurate.

## 0. Premise-check vs current `origin/main` (`9ee4ef1`, 2026-06-16)

OMN-161 (per-query-type filter contracts, S1–S4), OMN-174 (countOnly fast path), and OMN-133 (forecast_past) all landed
since OMN-162. Re-derived the surfaces against today's code, NOT the ticket text:

| Claim in OMN-167 ticket / OMN-162 spec                                                 | Reality in current code                                                                                                                                                                                                                                                               | Consequence                                                                                                                |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| "OmniJS **ancestor walk**" (ticket title); read-filters.md §3.4 "containing hierarchy" | The only shipped folder matcher (`filter-generator.ts`) is **case-insensitive substring on the DIRECT parent folder, one level** — no walk anywhere. Current read-filters.md §3.4 said folder "rejects with steering" (OMN-162) at the time of writing; the "hierarchy" line is gone. | The ticket's framing for the match-depth decision was stale. The depth question was re-opened and decided fresh (subtree). |
| `folder` rejects on tasks via `TASK_KEY_DISPOSITION`                                   | Confirmed: `task-key-disposition.ts` `folder: 'reject'`; enforcement in `QueryCompiler.transformFlatFilter` rejects on `disposition === 'reject'` ONLY.                                                                                                                               | Flip to `'map'`; keep the reject loop (structural enforcement for future keys).                                            |
| Synthetic-field precedent `task.tagStatusValid`                                        | Confirmed: `SYNTHETIC_FIELD_DEFS` in `types.ts`; emitter `(operator, value) => string`; registered in `KNOWN_FIELDS`.                                                                                                                                                                 | Mirror this exact pattern for `task.folderMatch`.                                                                          |
| `folder:null` → `folderTopLevel`                                                       | Confirmed: mapping exists (`filter-merge.ts`, `filters.ts` `folderTopLevel?: boolean`, in `KNOWN_FIELDS`) but **no `FILTER_DEFS` consumer**.                                                                                                                                          | Add the consumer.                                                                                                          |

API confirmed (`OmniFocus.d.ts`): `Project.parentFolder: Folder | null` and `Folder.parent: Folder | null` are both
readable in OmniJS — the ancestor walk is feasible. Parent relationships work ONLY in OmniJS (bridge required), which
both codegen paths already satisfy.

## 1. Decisions (confirmed with Kip, 2026-06-16)

| #   | Decision                         | Resolution                                                                                                                                                                            | Rationale                                                                                                                                                                                               |
| --- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Identify folder by               | **Parent:Child path**, case-insensitive **substring per segment**. Bare name = single-segment path (backward compatible).                                                             | Kip prefers path specification; a path is a strict generalization of bare-name, so one emitter covers both.                                                                                             |
| 2   | Match scope                      | **Subtree** — match items whose containing-folder ancestry passes _through_ the pinned folder (the pinned folder or any descendant).                                                  | A precise path anchor removes the substring over-matching worry that argued against walking; "tasks in Development" returns everything nested. Supersedes the earlier provisional "direct parent only". |
| 3   | `folder: null` / inbox           | `folder:null` = items whose containing project has **no parent folder** (top-level projects). Inbox tasks (no containing project) **never** match any folder filter (string or null). | Mirrors projects-side `topLevelOnly = !project.parentFolder`. Keeps `folder` purely about project-folder hierarchy; inbox stays addressable via `project:null` / `inInbox`.                             |
| 4   | Folder status (dropped/archived) | **Status-agnostic** name match — no `folder.status` check in the emitter.                                                                                                             | Mirrors projects-side (no folder-status check). Task/project status defaults already exclude inactive work.                                                                                             |
| 5   | Applies to                       | **Both** tasks-side (new) and projects-side (upgraded), via **one shared TS emitter**.                                                                                                | Keeps the projects↔tasks recipe identical and the codegen DRY (`feedback_dry_preference`). Accepts a deliberate projects-side widening (see §4).                                                        |

## 2. Architecture

### 2.1 Shared emitter — `src/contracts/ast/folder-path-match.ts` (new)

The single source of truth for folder-path matching across both codegen layers (the tasks AST emitter in `types.ts` and
the projects string-emitter in `filter-generator.ts`).

```ts
/** Parse a user folder path into lowercased, trimmed segments (leaf last).
 *  Throws on an empty segment (e.g. "A : : B" or trailing separator). */
export function parseFolderPath(path: string): string[];

/** Emit an OmniJS boolean expression: true iff the ancestor chain starting at
 *  `leafFolderExpr` (a Folder|null expression) passes THROUGH a folder matching
 *  the path (subtree semantics). Inlined as a self-invoking arrow per call. */
export function emitFolderPathMatch(leafFolderExpr: string, path: string): string;
```

Generated shape (segments baked in as a literal array; `leafFolderExpr` substituted):

```js
(() => { const segs = ["development","web"]; let a = (<leafFolderExpr>);
  while (a) {
    let f = a, ok = true;
    for (let i = segs.length - 1; i >= 0; i--) {
      if (!f || !((f.name || '').toLowerCase().includes(segs[i]))) { ok = false; break; }
      f = f.parent;
    }
    if (ok) return true;
    a = a.parent;               // subtree: re-anchor the leaf segment one level up
  }
  return false; })()
```

- **Single-segment** path (`"bills"`) collapses to "any ancestor folder name ⊇ bills" — the simple subtree case.
- **Multi-segment** (`"personal : bills"`) anchors the leaf segment at each ancestor and verifies the remaining segments
  walking up; matches if any anchor satisfies the full path.
- `segs` is embedded via `JSON.stringify` of the parsed array (no nested-template / injection hazard — segments are
  data, never interpolated into a comment or unquoted position; consistent with `nested_template_backtick_hazard`).

### 2.2 Tasks-side

- **`src/contracts/ast/types.ts`** — add **two** synthetic fields, both registered in `SYNTHETIC_FIELD_DEFS`,
  `SYNTHETIC_FIELD_MAP` (auto), and `KNOWN_FIELDS`:
  - `{ field: 'task.folderMatch', omnijs: emitOmniJSFolderMatch }` — `emitOmniJSFolderMatch(operator, value)`: value is
    the path string; supports `==` (and `!=` as negation); delegates to
    `emitFolderPathMatch('(task.containingProject ? task.containingProject.parentFolder : null)', value)`. The
    `containingProject ? … : null` guard means inbox tasks (no project) evaluate the leaf expr to `null` → the
    while-loop never runs → no match (Decision 3).
  - `{ field: 'task.folderTopLevel', omnijs: emitOmniJSFolderTopLevel }` — emits
    `(task.containingProject && !task.containingProject.parentFolder)` for `== true` (inbox excluded by the
    `containingProject &&` guard).
- **`src/contracts/ast/builder.ts`** — two `FILTER_DEFS` entries:
  - folder path: `build: (f) => (f.folder !== undefined ? comparison('task.folderMatch', '==', f.folder) : null)`.
  - top-level: `build: (f) => (f.folderTopLevel ? comparison('task.folderTopLevel', '==', true) : null)`.
- **`src/contracts/filters.ts`** — `TaskFilter` gains `folder?: string` (the path); `folderTopLevel?: boolean` already
  exists. Both added to the `KNOWN_FILTER_KEYS` / validator list as needed.
- **`src/tools/unified/compilers/QueryCompiler.ts`** `transformFlatFilter` — map `folder: "<path>"` → `result.folder`,
  `folder: null` → `result.folderTopLevel = true`. (The reject branch no longer fires for folder.)
- **`src/tools/unified/compilers/task-key-disposition.ts`** — flip `folder: 'reject'` → `'map'`. Keep the
  `FOLDER_TASKS_REJECTION` constant only if still referenced; otherwise remove it and the now-dead reject test. The
  reject enforcement loop in `transformFlatFilter` stays (no `'reject'` keys remain, but the structural guard protects
  future keys — same role as `MUTATION_DEFS`).

### 2.3 Projects-side (upgrade)

- **`src/contracts/ast/filter-generator.ts`** — replace the bare-name `folderName` block:
  ```js
  // before: (project.parentFolder && (project.parentFolder.name||'').toLowerCase().includes(<name>))
  // after:  emitFolderPathMatch('project.parentFolder', filter.folderName)
  ```
  `folderId` (exact id, direct parent) and `topLevelOnly` (`!project.parentFolder`) are **unchanged** — `folderId` is a
  precise single-folder fast path with different semantics; widening it is out of scope (noted in §6).
- `describeProjectFilter` / `isEmptyProjectFilter` — update the folder description string to reflect path+subtree
  ("folder path ⊇ …, subtree"); emptiness logic unchanged (`folderName` presence still the trigger).

### 2.4 Schema & advertisement (dual-schema rule)

- **`read-schema.ts`** — `folder` Zod field stays a shared `z.union([z.string(), z.null()])`; update the description
  comment: tasks/export now **support** folder (path, subtree) — drop the "tasks/export REJECT this key" clause.
- **`OmniFocusReadTool.ts`** — tool description + `inputSchema` override: folder now works on tasks queries; note the
  `Parent : Child` path syntax and subtree semantics. (`filters` advertised as bare `object` — no structural change.)
- Export queries: `exportType:'tasks'` routes through the same `transformFilters`, so it inherits folder support
  automatically. Verify the export script's OmniJS context can evaluate the emitted expression (it shares the bridge);
  if the export path does not run the AST emitter, scope export-folder to a follow-up and keep export rejecting folder
  with steering (decide during implementation via a live export probe — do NOT assume parity).

## 3. Error handling & edge cases

- **Empty segment** (`"A : : B"`, `" : B"`, `"A : "`) → `parseFolderPath` throws; `QueryCompiler` surfaces a
  `VALIDATION_ERROR` with steering ("folder path segments cannot be empty; use 'Parent : Child'").
- **Literal `:` in a folder name** → not escapable; documented limitation. A folder literally named `"A:B"` is
  unreachable as a single segment (it would parse as two). Acceptable (rare; matches no existing escape mechanism).
- **Whitespace** — segments are trimmed, so `"A:B"`, `"A : B"`, `"A :B"` are equivalent.
- **`folder: null` + inbox** — handled structurally by the `containingProject &&` guard; no inbox task matches.
- **Match-all guard** — a folder path is always an executable condition (emits a real expression), so it cannot trip the
  OMN-151/162 `compilesToMatchAll` guard. Confirm the §3.3 safety invariant still holds (every `TaskFilter` key
  `transformFlatFilter` can produce is consumed by a `FILTER_DEFS` entry): `folder`→`task.folderMatch` def,
  `folderTopLevel`→top-level def. ✓

## 4. Projects-side behavior change (deliberate widening — call out loudly)

Projects `folder:"X"` changes from **direct-parent substring** to **subtree path substring**. This is a pure
**superset** (subtree includes the direct-parent case), so no previously-matching query loses results — but a query that
relied on direct-parent-only scoping now also returns descendants.

- **Honesty:** `feedback_no_silent_failures` — announce in CHANGELOG and read-filters.md, not silently.
- **Live-verify (mandatory, `feedback_verify_external_seams`):** against a real nested folder, confirm projects
  `folder:"<parent>"` now returns subtree projects, and that tasks `folder:"<parent>"` returns the union of those
  projects' tasks (recipe parity — the OMN-162 steering recipe still holds, now at subtree scope).
- **Test audit:** `transform-project-filters.test.ts` and `ast-phase3-builders.test.ts` may assert direct-parent-only
  matching; update those to subtree expectations (the folder-touching assertions across the suite — most are unrelated;
  enumerate the projects-folder ones during implementation).

## 5. Tests

- **Unit — shared helper (`folder-path-match.test.ts`):** `parseFolderPath` (1-segment, N-segment, trim, empty-segment
  throw); `emitFolderPathMatch` output shape; **OmniJS predicate parity** via the sandbox predicate harness
  (`sandbox-manager-omnijs-predicate-parity.test.ts` pattern) over a synthetic folder tree — single-segment subtree,
  multi-segment anchored, top-level, inbox(null leaf)=no-match.
- **Unit — tasks compiler:** `folder:"path"` maps to `task.folderMatch`; `folder:null` maps to `folderTopLevel`; the
  OMN-162 reject tests in `reject-filters.test.ts` / `task-key-disposition.test.ts` flip from "rejects" to "maps";
  `TASK_KEY_DISPOSITION` parity test still green with `folder:'map'`; `describe-filter-coverage` covers the new keys.
- **Unit — projects:** `filter-generator` emits the shared expression for `folderName`; updated direct-parent assertions
  → subtree; `folderId`/`topLevelOnly` regression (unchanged).
- **Integration (live, `run_in_background`, npm not bun, never kill — OMN-143):** real nested folder fixture →
  tasks-by-path returns subtree; projects-by-path returns the same scoping; `folder:null` = top-level; inbox excluded;
  multi-segment path narrows correctly. Export-folder behavior probed live (parity or scoped-out per §2.4).
- **Conformance:** schema/description changes touch the conformance surface — run `npm run conformance` against a
  same-day control run before merge (`feedback_conformance_probe_as_support_contract`; recorded baselines rot).

## 6. Out of scope

- `folderId` subtree semantics (stays exact single-folder, direct anchor) — separate decision; note in Linear if wanted.
- `omnifocus_analyze` folder filtering — `AnalysisCompiler` has no `transformFilters`/folder handling (per OMN-162 §4);
  unchanged.
- A folder-path escape mechanism for literal `:` in names (documented limitation).
- Tags/folders/perspectives query folder semantics (separate per-type dispositions, OMN-170).

## 7. Linear hygiene

- OMN-167: implements option (a); close via PR. Comment that the implementation chose **subtree path** (not the ticket's
  "ancestor walk" framing, which was stale) and **upgraded projects-side** for consistency.
- If `folderId` subtree is wanted, file a follow-up.
- read-filters.md §3.4 / §5 / §6 + D7/D20 status rows updated to reflect tasks-folder now implemented (path, subtree)
  and projects-folder widened.
