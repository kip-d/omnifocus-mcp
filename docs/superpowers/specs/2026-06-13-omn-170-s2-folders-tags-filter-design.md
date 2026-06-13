# OMN-170 (OMN-161 S2): folders/tags filtering capability — design

**Status:** APPROVED WITH CHANGES (spec-reviewer 2026-06-13; C1/I1/I2/I3 folded in below). Premise-checked against
`origin/main` @ `7403e72`, the merged S1. **Ticket:** OMN-170 (follow-up to OMN-161 S1, PR #99). **Parent spec:**
`docs/superpowers/specs/2026-06-13-omn-161-per-query-type-filter-contracts-design.md` §4 S2 (the requirements).
**Normative spec:** `docs/spec/read-filters.md` (P1 strict boundary, P3 no silent widening, §6 folders/tags contracts).
**Program:** the OMN-161 honesty-cluster redesign; S1 made folders/tags **reject-all**, S2 adds the actual capability on
S1's typed contracts.

---

## 1. Premise-check (verified against `7403e72`, 2026-06-13)

S1 shipped on `origin/main` (`7403e72`); local `main` is stale at `dd956de` (pre-S1) — `git fetch` does not move local
main, so all premise-checking read via `git show origin/main:…` and this work is based off a worktree on `7403e72`.

| Ticket / §4-S2 premise                                                                | Status on `7403e72` | Evidence                                                                                                                |
| ------------------------------------------------------------------------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| single `ALL_REJECT` table → forks into `TAG_KEY_DISPOSITION`/`FOLDER_KEY_DISPOSITION` | **TRUE**            | `reject-filters.ts` has one `ALL_REJECT as const satisfies Record<EmptyInputKey,'reject'>` used by all three transforms |
| `TagFilter`/`FolderFilter` currently `Record<string, never>`                          | **TRUE**            | `contracts/filters.ts` — `export type TagFilter = Record<string, never>` (+ Folder, Perspective)                        |
| `handleTagQuery`/`handleFolderQuery` take `_compiled` and ignore filters              | **TRUE**            | `OmniFocusReadTool.ts` — both signatures `(_compiled: CompiledQuery)`; hardcoded script options                         |
| reuse `extractTextCondition`                                                          | **TRUE**            | `filter-merge.ts` — returns `{value, operator:'CONTAINS'\|'MATCHES'} \| null`                                           |
| `transformProjectFilters` is the mirror template                                      | **TRUE**            | `transform-project-filters.ts` — reject-offenders + map pattern with `satisfies Record<…,Disposition>`                  |
| input shapes: `name = {contains}\|{matches}`, `folder = string\|null`                 | **TRUE**            | `read-schema.ts` — `TextFilterSchema` (strict union), `folder: z.union([z.string(), z.null()])`                         |

**Four substrate obstacles §4 S2 ("pure capability add") understates — all REAL, all in scope here:**

| #   | Obstacle                                                                                                                                                                                                                                                                                                            | Anchor                                               |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| O1  | `rejectByDisposition` is hardcoded `table[key]==='reject'` → throw; **no `'map'` branch**. S2 is not "flip a table value" — the dispatch must extract mapped keys. Cleaner: mirror `transformProjectFilters`' own reject-then-map loop per type.                                                                    | `reject-filters.ts rejectByDisposition`              |
| O2  | Folder script supports **CONTAINS-only** (`search` = lowercased substring), **no `matches`/regex, no parent filter, no `topLevelOnly`**. Already emits `parentName`/`parentId` per row but never filters on them. `name` honestly needs the regex path → OMN-149 hazard.                                            | `script-builder.ts buildFilteredFoldersScript`       |
| O3  | Tags `basic` script has **no name filter at all** and builds an inner `omniJsScript = \`…\``**without**`escapeTemplateString`— raw`${}`interpolation into a nested backtick is the OMN-111/113 hazard. Must adopt`escapeTemplateString` (the folders pattern) before injecting a name predicate.                    | `tag-script-builder.ts buildBasicTagsScript`         |
| O4  | Both handlers cache under a **fixed key** (`folders_list_basic`, `list:name:true:false:false:true:false`). Filtering without keying the filter serves a filtered query the unfiltered slice (C17/R11 cache-honesty class). Must fold the filter into the cache key (the `projects_list_${JSON.stringify}` pattern). | `OmniFocusReadTool handleFolderQuery/handleTagQuery` |

## 2. Goals / non-goals

**Goals**

1. Folders queries filter by **name** (`{contains}`/`{matches}`) and **parent**: `folder: "<name>"` → parent folder name
   substring; `folder: null` → top-level only (mirrors projects exactly, OMN-96/142).
2. Tags queries filter by **name** (`{contains}`/`{matches}`).
3. `TagFilter`/`FolderFilter` carry the supported keys; the per-type disposition tables flip those keys `reject`→`map`
   and stay `satisfies`-exhaustive (class-closure preserved — a future schema key still forces a disposition).
4. Honesty riders the capability makes mandatory: **O4 cache key includes the filter**; **count honesty** — a filtered
   folders/tags query reports `total_count` = the matching population (OMN-154), not the whole-list count; **safe
   regex** (O2/O3) and **safe nested-template injection** (O3).

**Non-goals (out of scope; stay rejected, honestly)**

- Logical operators on folders/tags (`AND`/`OR`/`NOT`) — remain `reject` in the disposition tables. Flat top-level
  `name` (+ `folder`) only. (OR/NOT evaluation is S3, and only for projects.)
- `id`/`text`/`status`/any task key on folders/tags — remain `reject`.
- MATCHES on the folder **parent** — parent is substring-only, mirroring projects' `folderName` (`name` gets both
  operators; parent gets CONTAINS, the projects-parity choice).
- OMN-167 (tasks-by-folder) — distinct, harder problem; stays parked. S2 filters **folders/tags queries**, not tasks.
- Tag hierarchy reads (§8 D3 / OMN-145) — unrelated.

## 3. Design

### 3.1 Filter contracts (`src/contracts/filters.ts`)

```ts
export interface TagFilter {
  name?: string;
  nameOperator?: TextOperator; // CONTAINS | MATCHES
}
export interface FolderFilter {
  name?: string;
  nameOperator?: TextOperator;
  parentName?: string; // folder: '<name>' → parent folder name (CONTAINS substring)
  topLevelOnly?: boolean; // folder: null → folders with no parent
}
export type PerspectiveFilter = Record<string, never>; // unchanged — perspectives take no filters
```

### 3.2 Disposition tables + transforms (`reject-filters.ts`)

Fork `ALL_REJECT` into two per-type tables, each `as const satisfies Record<EmptyInputKey, 'map' | 'reject'>`. Keep an
all-reject table for perspectives (the existing `ALL_REJECT`, possibly renamed `PERSPECTIVE_KEY_DISPOSITION`):

`TAG_KEY_DISPOSITION` = every `EmptyInputKey` `'reject'` except `name: 'map'`. `FOLDER_KEY_DISPOSITION` = every key
`'reject'` except `name: 'map'` and `folder: 'map'`. Both written as **full object literals** (every key spelled out, no
spreads — spreads defeat `satisfies` exhaustiveness). `name`/`folder` ∈ `FlatFilterValue` ⊆ `EmptyInputKey`, so they
legally take `'map'`. Replace the reject-only helper with a small shared routine mirroring `transformProjectFilters`
steps 3+5:

- **Reject pass:** for every present input key whose disposition ≠ `'map'`, collect it; if any, throw one `z.ZodError`
  (`path: ['query','filters', <firstOffender>]` or `['query','filters']`) naming all offenders + the type's supported
  set + S2 steering. AND/OR/NOT are `'reject'` in the table → rejected by the same loop (no separate operator handling).
- **Map pass:** `name` via `extractTextCondition` → `{name, nameOperator}`; (folders) `folder === null` →
  `topLevelOnly`, `typeof folder === 'string'` → `parentName`.

`transformTagFilters`/`transformFolderFilters` return the populated typed filter; `transformPerspectiveFilters` stays
reject-all. The `CompiledQuery` union variants (`type:'tags'|'folders'`) already carry `TagFilter`/`FolderFilter` — no
QueryCompiler dispatch change beyond the transforms' new return values.

### 3.3 Folder predicate generator (`filter-generator.ts`)

Add `generateFolderFilterCode(filter: FolderFilter): string` mirroring `generateProjectFilterCode`, operating on the
OmniJS `folder` object, with a `folderTextCondition` mirroring `projectTextCondition` (CONTAINS =
`.toLowerCase() .includes(JSON.stringify(term.toLowerCase()))`; MATCHES =
`new RegExp(JSON.stringify(term), 'i').test(...)` — the OMN-149-safe emit):

- `name` → `folderTextCondition('name', value, op)`
- `parentName` → `(folder.parent && (folder.parent.name || '').toLowerCase().includes(<json>))`
- `topLevelOnly` → `!folder.parent`
- empty → `'true'`

Plus `isEmptyFolderFilter` / `describeFolderFilter` siblings for the script's `filterDescription` and the empty-filter
fast path (mirrors the project trio).

### 3.4 Folder script (`script-builder.ts buildFilteredFoldersScript`)

- Add `filter?: FolderFilter` to `FolderScriptOptions`. When present, replace the inline `searchFilter` substring with
  `matchesFilter(folder)` = `generateFolderFilterCode(filter)`. Keep `search` as a back-compat path or drop it (no
  public caller passes `search` today — the handler hardcodes `{limit:100}` — so dropping `search` in favor of `filter`
  is clean; verify no other caller, e.g. CacheWarmer, passes `search`).
- The predicate string is embedded inside `omniJsSource`, which is already wrapped via `escapeTemplateString` →
  nested-backtick + regex-`/` hazards handled (the established mechanism). Comment the filter description via
  `sanitizeForScriptComment`.
- **Count honesty (OMN-154) — I3:** the current loop's FIRST statement is `if (count >= limit) return;`, so the limit
  guard runs **before** any filter. S2 must **reorder**: run `matchesFilter(folder)` first → `if (!match) return;` →
  `totalMatched++` (every match, pre-limit) → `if (count >= limit) return;` (cap projected rows only). Emit
  `total_available: totalMatched` instead of `flattenedFolders.length`. This is a restructure, not a drop-in counter
  add. `FolderListSchema`/`FolderListMetadataSchema` are `.strict()` but already declare
  `total_available`/`returned_count` and `FolderItemSchema` already has optional `parentId`/`parentName` — no
  response-schema change needed.

### 3.5 Tags script (`tag-script-builder.ts buildBasicTagsScript`)

- Thread a `name`/`nameOperator` filter through `TagQueryOptions` → `buildBasicTagsScript`.
- **Refactor the inner OmniJS to the `escapeTemplateString` wrapper pattern** (mirror folders): build a
  `tagsOmniJsSource` string, embed the generated name predicate + the `count`/`total` logic, then
  `const omniJsScript = \`${escapeTemplateString(tagsOmniJsSource)}\``. This removes the raw-`${}`-into-backtick hazard
  (O3) and makes the name term injection safe.
- Predicate: a `tagTextCondition` mirroring `folderTextCondition` on `tag.name`.
- **Count honesty (OMN-154) — I2:** do NOT overload `summary.total` (it is the returned/limited count, read by the
  handler at `total = envelope.summary?.total ?? items.length` for the unfiltered path). Add a SEPARATE `total_matched`
  field incremented on every name-match before the limit guard, and have `handleTagQuery` read that as the population
  for `applyCountHonesty`. `summary.total` keeps its current meaning.
- Scope note: only **basic** mode is reachable from `handleTagQuery` (it hardcodes `mode:'basic'`). S2 wires name into
  basic. `names`/`full` modes are not reached by the read path; leaving them name-less is honest (no public surface) —
  do not silently add half-support. (If trivial to add to `names`, do it for consistency; otherwise leave + note.)

### 3.6 Handlers (`OmniFocusReadTool.ts`)

- `handleFolderQuery(compiled)` (drop `_`): `if (compiled.type !== 'folders') throw` narrows
  `compiled.filters: FolderFilter`. Pass `{ filter: compiled.filters, limit: 100 }` to `buildFilteredFoldersScript`.
  **Cache key (I1):** empty filter → the EXISTING literal `'folders_list_basic'` (byte-identical, no regression);
  non-empty → `'folders_list_basic_' + JSON.stringify(compiled.filters)`. (Folders are not warmed by `CacheWarmer` — the
  literal is produced/consumed only here.) Count honesty lands via `applyCountHonesty` using `total_available` (now the
  matching population per I3).
- `handleTagQuery(compiled)` (drop `_`): narrow `compiled.filters: TagFilter`; thread `name`/`nameOperator` into
  `buildTagsScript` options (additive — the other 3 callers pass none, unchanged). **Cache key (I1):** empty filter →
  the EXISTING literal `'list:name:true:false:false:true:false'`; non-empty → that literal +
  `'_' + JSON.stringify(filters)`. Population for `applyCountHonesty` reads the new `total_matched` (I2), not
  `summary.total`.
- **Pre-existing, out of scope (noted):** `CacheWarmer.warmTags` writes `'list:name:true:false:false:false:false'`
  (`mode:'full'`) while `handleTagQuery` reads `'list:name:true:false:false:true:false'` (`mode:'basic'`) — the warmer's
  tag write is ALREADY dead on `main` (key + shape mismatch), independent of S2. **Leave the warmer untouched**; do not
  "align" the key (it would feed full-mode data to the basic-mode handler). File as a separate observation if it
  matters.

### 3.7 Advertisements (dual-schema rule)

- **Input schema already parses these keys.** `FolderQuerySchema`/`TagQuerySchema` =
  `BaseQuerySchema.merge({type}).strict()` and `BaseQuerySchema.filters` is the full task-shaped `FilterSchema`, so
  `{type:'folders', filters:{name:{contains}, folder}}` already validates and reaches the transform today — no schema
  _shape_ change needed. Only human-facing description/advertisement text changes.
- `read-schema.ts` header + `OmniFocusReadTool` inputSchema/description: state that folders queries accept
  `name`/`folder` and tags queries accept `name`; remove any "reject all filters" claim for these types.
- `docs/spec/read-filters.md`: rewrite §6 folders + tags rows to the S2 capability (name/parent filtering, the
  operators, the parity decisions); flip §8 D17/D18 notes to record S2 added capability over the S1 reject-all
  placeholder.

### 3.8 Error surface

Unchanged shape: rejects are `z.ZodError` → VALIDATION_ERROR / InvalidParams. Messages name the offending key(s), the
type's supported set, and (for now-unsupported logical operators) steer to flat name/folder filters.

## 4. Decision records

- **DR1 — cache: fold filter into key (not bypass-when-filtered).** Mirrors `handleProjectQuery`
  (`projects_list_${JSON.stringify(cacheParams)}`); preserves cache benefit for repeated filtered queries; unfiltered
  `{}` reuses the existing browse key so no regression. Reversible.
- **DR2 — MATCHES supported for `name`, CONTAINS-only for parent.** `name` parity with projects/tasks
  (extractTextCondition yields both); parent parity with projects' `folderName` (substring only). Avoids speculative
  regex surface on parent.
- **DR3 — logical operators stay rejected in S2.** Keeps the disposition tables honest and closed; OR/NOT capability is
  S3 (projects-only). Flat `name`+`folder` compose at top level without AND.
- **DR4 — adopt `escapeTemplateString` in the tags basic script.** The robust, established nested-backtick safety
  mechanism (already used by folders), rather than ad-hoc per-char escaping.
- **DR5 — drop the folder script's `search` option in favor of `filter`** iff no non-handler caller passes `search`
  (verify CacheWarmer); else keep both. Removes a now-redundant CONTAINS-only path.

## 5. Alternatives considered

| Alternative                                                                    | Why not                                                                                                                                   |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Keep `rejectByDisposition`, add a parallel `mapByDisposition`                  | Two helpers diverge; mirroring `transformProjectFilters`' single reject-then-map flow per type is the proven, reviewed shape.             |
| Support AND-merge on folders/tags now (full projects parity)                   | Adds merge/conflict machinery for a capability no requirement asks for; flat name+folder covers the use case. Defer until asked.          |
| Bypass cache entirely when a filter is present                                 | Simpler but loses the repeat-query benefit and diverges from the projects pattern; DR1 chosen.                                            |
| Inject the tag name term via `JSON.stringify` only (no `escapeTemplateString`) | `JSON.stringify` does not escape backticks; a tag-name search containing `` ` `` breaks the inner template — exactly the OMN-111/113 bug. |
| Add name filtering to all three tag modes (names/basic/full)                   | Only `basic` is reachable from the read seam; speculative coverage of unreachable modes. Basic only (DR per §3.5).                        |

## 6. Risks

| Risk                                                          | Mitigation                                                                                                                  |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Filtered folders/tags served stale/unfiltered from cache (O4) | DR1 cache-key includes the filter; integration probe: filtered query right after an unfiltered one returns the filtered set |
| MATCHES regex injection / `/` breakage (O2/O3)                | `new RegExp(JSON.stringify(term),'i')` (OMN-149-safe); folders via `escapeTemplateString`; tags via the §3.5 refactor       |
| Nested-backtick break from a name containing `` ` `` (O3)     | `escapeTemplateString` over the whole tag OmniJS source; unit test with a backtick-bearing name                             |
| Count dishonesty on filtered lists                            | `totalMatched` pre-limit (OMN-154 pattern); test asserts `total_count` = match count, not whole-list count                  |
| `satisfies` exhaustiveness lost when forking the table        | Full literals (no spreads); a type-level test adds a fake key → expect compile error                                        |
| Tasks/projects behavior drift                                 | S2 touches only folders/tags transforms + their scripts + handlers; golden/project tests pin the rest byte-identical        |

## 7. Testing strategy

TDD per change. **REWRITE (not just add) two S1 tests that pin the now-removed folder-reject (C1)** — these go RED
first, then GREEN under the new behavior:

- `tests/unit/tools/unified/compilers/reject-filters.test.ts` — the "folders: folder key rejects" case now asserts
  `transformFolderFilters({folder:'Bills'})` returns `{parentName:'Bills'}` (and `{folder:null}` →
  `{topLevelOnly:true}`).
- `tests/unit/tools/unified/compiled-query-union.test.ts` — the "folders: folder filter rejects with a folders-named
  message" case now asserts the compiled folders query carries the mapped `FolderFilter`. (The "tags: flagged rejects"
  case STAYS — `flagged` is still rejected.)

**Unit (new):** reject→accept matrix per supported key (folders: `name {contains}`, `name {matches}`, `folder:'X'`→
parentName, `folder:null`→topLevelOnly; tags: `name {contains}`, `name {matches}`); still-rejected keys (folders:
`status`, `flagged`, `AND`, `OR`, `id`; tags: `folder`, `flagged`, `OR`); `satisfies` exhaustiveness (fake key → compile
error pin); `generateFolderFilterCode` emits the safe regex for MATCHES and `!folder.parent` for topLevelOnly;
backtick-bearing name does not break the tag/folder script (string-shape assertion); count-honesty (totalMatched
separate from returned count, per I2/I3). **Integration (live OF):** a folders-by-name query returns only matching
folders + honest `total_count`; a tags-by-name query returns only matching tags; a filtered query right after an
unfiltered browse returns the filtered set (cache honesty). **Full suites:** `npm run test:unit`,
`npm run test:integration` (backgrounded, never killed — OMN-143), `npm run conformance` (same-day control if
advertisements change — they do here, so run it).

## 8. Follow-ups

- S3 (OMN-171): OR/NOT on projects. S4 (OMN-172): per-branch default + metadata reconciliation. OMN-167: tasks-by-folder
  (parked). If `names`/`full` tag modes become reachable, extend name filtering there.
