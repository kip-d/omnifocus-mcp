# OMN-170 (OMN-161 S2): folders/tags filtering — implementation plan

**Spec:** `docs/superpowers/specs/2026-06-13-omn-170-s2-folders-tags-filter-design.md` (APPROVED WITH CHANGES;
C1/I1/I2/I3 folded). **Plan-reviewed** 2026-06-13 (APPROVED WITH CHANGES; B1–B5 + 3 underspec decisions + data-agnostic
integration folded below). **Base:** worktree on `7403e72` (merged S1). **Method:** TDD per task (RED → GREEN →
refactor); run `npm run test:unit` after each task; `npm run build` must stay green. Integration + conformance at the
end.

Implementation order respects dependencies: contracts → tables/transforms → predicate generator → scripts → handlers →
advertisements → integration.

---

## Task 1 — Filter contracts (`src/contracts/filters.ts`)

Populate the empty types (`TextOperator` is defined locally in this file — no import needed; **B4**):

```ts
export interface TagFilter {
  name?: string;
  nameOperator?: TextOperator;
}
export interface FolderFilter {
  name?: string;
  nameOperator?: TextOperator;
  parentName?: string; // folder:'<name>' → parent folder name CONTAINS
  topLevelOnly?: boolean; // folder:null → no parent
}
export type PerspectiveFilter = Record<string, never>; // unchanged
```

No standalone test; the type changes are exercised by Tasks 2–6. `npm run build` after.

## Task 2 — Disposition tables + transforms (`src/tools/unified/compilers/reject-filters.ts`)

**RED first — rewrite the two pinning tests** (C1):

- `tests/unit/tools/unified/compilers/reject-filters.test.ts`: the folder-rejects-`folder` case → assert
  `transformFolderFilters({folder:'Bills'})` returns `{parentName:'Bills'}`; add `{folder:null}` →
  `{topLevelOnly:true}`; add `{name:{contains:'X'}}` → `{name:'X', nameOperator:'CONTAINS'}`, `{name:{matches:'^X'}}` →
  `{name:'^X', nameOperator:'MATCHES'}`. Tags: `{name:{contains:'X'}}` → `{name:'X', nameOperator:'CONTAINS'}`.
- Keep/extend still-reject cases: folders `{status:'active'}`/`{flagged:true}`/`{AND:[…]}`/`{OR:[…]}`/`{id:'x'}` throw;
  tags `{folder:'x'}`/`{flagged:true}`/`{OR:[…]}` throw. Perspectives: any key throws (unchanged).

**GREEN — implement:**

- Fork `ALL_REJECT` into full-literal `TAG_KEY_DISPOSITION` (all `'reject'` except `name:'map'`) and
  `FOLDER_KEY_DISPOSITION` (all `'reject'` except `name:'map'`, `folder:'map'`), each
  `as const satisfies Record<EmptyInputKey, 'map' | 'reject'>`. Keep an all-reject table for perspectives.
- Replace the reject-only `rejectByDisposition` with a shared reject-then-map flow (mirror `transformProjectFilters`
  steps 3+5): collect every present key whose disposition ≠ `'map'` → one `z.ZodError` naming offenders + supported
  set + steering; then map `name` via `extractTextCondition`, and (folders) `folder===null`→`topLevelOnly`,
  `typeof folder==='string'`→`parentName`.
- **Shared helper shape (underspec-1):** extract `rejectThenMap(input, table, typeName, supportedMsg, mapFn)` — the
  per-key reject loop (mirror `transform-project-filters` steps 3 only — the `merged`-key offender collection + one
  combined `z.ZodError`) followed by `mapFn(input)`. **Do NOT copy the AND-merge machinery** (steps 1–2) — folders/tags
  have no AND support (AND is `'reject'` in the table). Preserve the `value === undefined → continue` skip guard the
  current `rejectByDisposition` has. `transformFolderFilters`' `mapFn` adds `name`(extractTextCondition)/`parentName`/
  `topLevelOnly`; `transformTagFilters`' `mapFn` is name-only.
- `transformTagFilters` → `TagFilter`; `transformFolderFilters` → `FolderFilter`; `transformPerspectiveFilters` stays
  reject-all (its own all-reject table). Steering text drops the "planned (OMN-161 S2)" wording for the now-supported
  keys.
- **Add the `satisfies` exhaustiveness pin (omitted test):** a `@ts-expect-error` block (mirror
  `compiled-query-union.test.ts`) asserting a fake key in `FOLDER_KEY_DISPOSITION`/`TAG_KEY_DISPOSITION` is a compile
  error — makes Goal 3 a test, not a comment.
- **Perspectives regression (omitted test):** assert `transformPerspectiveFilters({name:{contains:'x'}})` STILL throws
  (the one key that flipped for the siblings must stay rejected for perspectives — guards against giving perspectives
  the tag table by accident).

Verify: `npm run test:unit` (this file) GREEN; `npm run build`.

## Task 3 — Folder predicate generator (`src/contracts/ast/filter-generator.ts`)

**RED:** unit tests asserting `generateFolderFilterCode` output strings:

- `{name:'x', nameOperator:'CONTAINS'}` → contains `(folder.name || '').toLowerCase().includes("x")`.
- `{name:'^x', nameOperator:'MATCHES'}` → contains `new RegExp("^x", 'i').test((folder.name || ''))`.
- `{parentName:'P'}` → `(folder.parent && (folder.parent.name || '').toLowerCase().includes("p"))`.
- `{topLevelOnly:true}` → `!folder.parent`.
- `{}` → `'true'`. Combined → `&&`-joined.

**GREEN:** add `folderTextCondition('name', term, op)` (mirror `projectTextCondition`: MATCHES =
`new RegExp(JSON.stringify (term),'i').test(...)`, CONTAINS =
`.toLowerCase().includes(JSON.stringify(term.toLowerCase()))`), `generateFolderFilterCode`, `isEmptyFolderFilter`,
`describeFolderFilter` (the project trio mirrored). Import `FolderFilter`.

Verify unit + build.

## Task 4 — Folder script (`src/contracts/ast/script-builder.ts`)

**RED — first rewrite the existing `search` tests (B1):** `tests/unit/contracts/ast/folder-builders.test.ts` has a
`describe('search filter', …)` block + `isEmptyFilter`/return-type cases that pass `{search:'Work'}` and assert
`const searchFilter = ""`. Dropping `search` makes these a type error / stale. Rewrite them to the new `filter` option
(`{filter:{name:'Work',nameOperator:'CONTAINS'}}` → predicate present; `{filter:{}}` → `isEmptyFilter` true). Then new
RED on `buildFilteredFoldersScript({filter})` output (string-shape):

- predicate appears in `matchesFilter`; a backtick-bearing name does not leave an unescaped backtick in the final script
  (escapeTemplateString); MATCHES emits the safe RegExp.
- count (load-bearing string pins, not brittle ordering): emitted source contains `totalMatched++` AND
  `total_available: totalMatched` (NOT `flattenedFolders.length`), and `if (!matchesFilter(folder)) return;` precedes
  the `count >= limit` guard. (True limit-caps-projected-but-counts-all behavior is verified at integration, Task 8.)

**GREEN:**

- Add `filter?: FolderFilter` to `FolderScriptOptions`; remove `search` (only the handler calls this builder, with
  `{limit:100}` — CacheWarmer does not warm folders; re-confirm before deleting, DR5). `filterDescription` = returned
  value from `describeFolderFilter(filter)` — set the `GeneratedScript.filterDescription` FIELD only (the folder script
  has NO inline `// Filter:` comment site, so NO `sanitizeForScriptComment` is needed; underspec-2).
  `isEmptyFilter = isEmptyFolderFilter(filter)`.
- In `omniJsSource`: define `matchesFilter(folder)` = `generateFolderFilterCode(filter)`; restructure the `forEach` (the
  current FIRST statement is `if (count >= limit) return;` — move it):
  `if (!matchesFilter(folder)) return; totalMatched++; if (count >= limit) return; …push…; count++;`. Emit
  `metadata: { returned_count: results.length, total_available: totalMatched }`. Keep the `escapeTemplateString`
  wrapper.

Verify unit + build. `script-response-schemas.test.ts` `total_available` cases stay green (field kept, only its source
changed — confirmed).

## Task 5 — Tags script (`src/contracts/tag-options.ts` + `src/contracts/ast/tag-script-builder.ts`)

**RED — test through the PUBLIC seam (B2):** `buildBasicTagsScript` is module-private; test via
`buildTagsScript({mode:'basic', name:'x', nameOperator:…})` (also the real handler call path — no new export):

- unfiltered `buildTagsScript({mode:'basic'})`: assert STRUCTURAL invariants, NOT byte-identity (B3 — the
  escapeTemplateString refactor changes escaping of the same logical script, so byte-identical is impossible): the
  script still contains the `flattenedTags.forEach` body + `mode: 'basic'` + the `total` envelope; and `total_matched`
  is absent or equals `total` when no name filter.
- filtered: predicate appears; backtick-bearing name stays escaped (no raw backtick in final script); `total_matched`
  emitted separately from `total`.

**GREEN:**

- `TagQueryOptions` (`src/contracts/tag-options.ts`, public) AND `TagScriptOptions` (private, in tag-script-builder.ts):
  add optional `name?: string; nameOperator?: TextOperator;` (additive — the 3 other `buildTagsScript` callers pass
  none, unchanged). `buildTagsScript` threads `name`/`nameOperator` down to `buildBasicTagsScript` (B2).
- `buildBasicTagsScript`: refactor inner OmniJS to a `tagsOmniJsSource` string wrapped via
  `` `${escapeTemplateString(tagsOmniJsSource)}` `` (mirror folders, removes the raw-`${}`-into-backtick hazard). Add
  `tagTextCondition` on `tag.name`; gate the push on it; add `totalMatched` (pre-limit) and emit
  `summary.total_matched`. `summary.total` keeps current meaning (returned/limited count). names/full modes unchanged —
  unreachable from the read seam; note in code.
- **Schema (underspec-3):** `TagSummarySchema` is `.strict()` (leaf-strict, OMN-158) — add
  `total_matched: z.number() .optional()` to it in `src/omnifocus/script-response-schemas.ts`, or `execJson` rejects the
  new field.

Verify unit + build. Run `tag-operations.test.ts`/`tag-conversion.test.ts`/`ast-phase3-builders.test.ts` to confirm the
basic-mode refactor is behavior-preserving (they assert basic/full script shape).

## Task 6 — Handlers (`src/tools/unified/OmniFocusReadTool.ts`)

**RED:** rewrite `tests/unit/tools/unified/compiled-query-union.test.ts` folder-rejects case → assert
`{type:'folders', filters:{folder:'Bills'}}` compiles to a folders variant carrying `{parentName:'Bills'}` (the
tags-flagged reject case stays). Add a handler-level test if the harness supports mocking `execJson` for folders/tags.

**GREEN:**

- `handleFolderQuery(compiled)`: drop `_`; `if (compiled.type !== 'folders') throw`;
  `buildFilteredFoldersScript({ filter: compiled.filters, limit: 100 })`; cache key = empty→`'folders_list_basic'`, else
  `'folders_list_basic_'+JSON.stringify(compiled.filters)`. `applyCountHonesty` uses script `total_available`.
- `handleTagQuery(compiled)`: drop `_`; narrow `TagFilter`; thread `name`/`nameOperator` into `buildTagsScript`; cache
  key = empty→`'list:name:true:false:false:true:false'`, else that+`'_'+JSON.stringify(compiled.filters)`. **B5 — the
  tag handler currently has NO `applyCountHonesty` call** (only folders does); ADD one mirroring folders:
  `applyCountHonesty(response, { population: envelope.summary?.total_matched ?? total }, 'tags')` after building the
  list response, so a filtered tags query reports honest `total_count`. (New wiring, not a read-source swap.)
- Leave `CacheWarmer` untouched (its tag write is already dead; folders unwarmed).

Verify unit + build.

## Task 7 — Advertisements (dual-schema rule)

- `OmniFocusReadTool` inputSchema getter + tool description: folders accept `name`/`folder`, tags accept `name`; drop
  "reject all filters" language for these types.
- `src/tools/unified/schemas/read-schema.ts` header comments mentioning folder/tag reject-all → update.
- `docs/spec/read-filters.md` §6 folders + tags rows → S2 capability (name {contains|matches}, folder parent/topLevel
  for folders; name for tags; the parity decisions DR2/DR3). §8 D17/D18 → note S2 added capability over the S1
  placeholder.

No code behavior; `npm run build` (claude-md/path tests) green.

## Task 8 — Integration tests (live OF)

Host file: `tests/integration/end-to-end.test.ts` (has tasks/projects/tags cases; **no folders case exists** — write it
fresh from the tags case template). **Data-agnostic** (no known folder/tag names in the test vault): first run an
unfiltered query, derive a probe substring from `result[0].name`, then assert the filtered query is a correct subset.

- folders-by-name: unfiltered folders → pick a substring of `folders[0].name` → filtered query returns only folders
  whose name contains it; `total_count` = that subset size (honesty). `{folder:null}` query → all returned folders have
  no parent (top-level).
- tags-by-name: unfiltered tags → substring of `tags[0].name` → filtered query returns only matching tags.
- cache honesty: an unfiltered folders query then a filtered one returns the filtered set (not the cached full list).

## Final verification

1. `npm run build` clean; `npm run test:unit` all green.
2. `npm run test:integration` — backgrounded, never killed (OMN-143); pgrep vitest clear before/after.
3. `npm run conformance` — advertisements changed, so run it (same-day control if it deviates from the recorded
   baseline; llama3.1:8b + qwen2.5:7b). New capability must not regress the bar.
4. Two-stage review (spec-compliance + code-quality) via subagent; mutation-verify the count-honesty + cache-key tests.
5. PR → final `superpowers:code-reviewer` gate → merge on SAFE via
   `gh pr merge --repo kip-d/omnifocus-mcp --squash --auto`. Then Kip redeploys + live-verifies (probes in the OMN-170
   Linear comment).

## Risks / watch-items (from spec §6 + review)

- Don't overload `summary.total` for tags (I2). Reorder folder limit guard (I3). Empty-filter cache key must byte-match
  the existing literal (I1). Keep the unfiltered tag script byte-identical post-refactor (Task 5 golden). `satisfies`
  full-literal tables (no spreads). Leave CacheWarmer alone.
