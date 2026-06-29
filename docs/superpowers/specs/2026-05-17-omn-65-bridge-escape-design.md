# OMN-65 — Neutralize the bridge-template interpolation hazard

Date: 2026-05-17 Linear: OMN-65 Status: Design approved (2026-05-17), pending spec review

## Problem

`script-builder.ts` bridge builders embed an OmniJS source string inside an outer JXA `app.evaluateJavascript(\`…\`)`
backtick template. User-derived filter strings reach that template via two channels, **unescaped**:

1. **Predicate channel** — `emitValue`/`emitTagComparison`/`emitProjectComparison` (`emitters/omnijs.ts`) emit user
   values via `JSON.stringify` (double-quoted). JSON does not escape `` ` `` or `${`; that literal sits inside the outer
   JXA backtick template.
2. **Comment channel** — `describeFilterForScript` (`script-builder.ts:990`, raw
   `text: "${filter.text||filter.search}"`, `project: ${filter.projectId}`, `id: ${filter.id}`) and the folder builder's
   `:1731` `search: "${search}"` flow into `// Filter: ${filterDescription}`.

**Proven** (deterministic, script-generation level): a `text` filter of ``a`b`` → unbalanced-backtick → syntactically
broken JXA; `a${x}b` → outer-template interpolation → eval-time `ReferenceError`; `a⏎b` → newline splits the single-line
`// Filter:` comment. Benign input is unaffected. User-reachable via `filters.text.contains/.matches` (and
name/tag/project/id). A task search containing a backtick or `${` (code/markdown) silently breaks the query — a real
correctness bug, not theoretical. Confirmed: the analogous live MCP path also errors; the script-generation probe is the
unconfounded proof.

## Key facts (reuse, don't reinvent)

- A correct escape helper already exists: `escapeTemplateString(str)` in
  `src/omnifocus/scripts/tasks/list-tasks-ast.ts:124` (`\`→`\\`, `` ` ``→`` \` ``, `${`→`\${`).
- It is already applied **at whole-script granularity** in the list path: `list-tasks-ast.ts:88`
  `const omniJsScript = \`${escapeTemplateString(generatedScript.script)}\`;`.
  That path is **not vulnerable**. The bug is that the `script-builder.ts` builders **do not** apply
  it — they inline-assemble the OmniJS source as a nested escaped-backtick template with
  `${predicate}`/`${filterDescription}`
  interpolated raw.
- `escapeTemplateString` does **not** neutralize a newline; a `\n` inside a single-line `//` comment still breaks the
  OmniJS parse _after_ whole-script escaping. The comment channel needs its own CR/LF/control collapse.
- Escaping the predicate _substring_ is unsafe: it would double-escape `JSON.stringify`'s own `\` escaping. The escape
  must apply **once to the whole assembled OmniJS source** (the `list-tasks-ast.ts:88` shape), not per-substring.

## Decision

Reuse + centralize `escapeTemplateString`; apply it at the whole-OmniJS-source boundary in every `script-builder.ts`
builder (mirroring `list-tasks-ast.ts:88`); add a `sanitizeForScriptComment` CR/LF/control collapse for the comment
channel. Net effect: benign filters unchanged; hostile filters now **run correctly** (search literal matched verbatim;
comment rendered safely) instead of erroring.

## Scope

In scope:

- **Shared module** `src/contracts/ast/bridge-escape.ts`: move `escapeTemplateString` here (single source of truth); add
  `sanitizeForScriptComment`. Update `list-tasks-ast.ts` to import `escapeTemplateString` from it (delete its private
  copy) — **no behavior change** to that path.
- **5 `script-builder.ts` builders** — refactor each so its OmniJS source is assembled as a standalone TS string then
  embedded via `escapeTemplateString`; **additionally** apply `sanitizeForScriptComment` to the in-body `// Filter:`
  description for the **3 comment-channel builders only** (`buildExportTasksScript`, `buildTaskCountScript`,
  `buildFilteredProjectsScript`). `buildProjectByIdScript` and `buildFilteredFoldersScript` are predicate-only
  (escape-only, no sanitize). Builders: `buildFilteredProjectsScript` (~1173), `buildProjectByIdScript` (~1330),
  `buildExportTasksScript` (~1520), `buildFilteredFoldersScript` (~1738), `buildTaskCountScript` (~1965). (Line numbers
  approximate — trust `grep -n "evaluateJavascript(omniJsScript)"`.)
- Tests: unit-test both helpers; builder-level "generated script parses as valid JS for hostile + benign vectors" across
  the builders.

Out of scope (explicit):

- `emitDateComparison`'s `new Date("${dateStr}")` — `dateStr` is schema-validated ISO from internal date handling, not
  user free-text. Noted; no change.
- The `list-tasks-ast.ts` path's behavior — only its import source changes (its escaping is already correct).
- `emitValue` itself — left as plain `JSON.stringify` (the whole-source escape at the embed boundary is the chokepoint;
  per-value escaping is explicitly rejected as non-DRY and double-escape-unsafe).
- Any matching/semantic change beyond "hostile input no longer breaks the script."

## Design

### 1. `src/contracts/ast/bridge-escape.ts` (new shared module)

```ts
/** Escape a string for safe embedding inside a JXA backtick template literal. */
export function escapeTemplateString(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
}

/**
 * Make a human filter description safe inside a single-line `//` comment within
 * a bridge template. escapeTemplateString handles backtick/${ /backslash but
 * NOT newlines — a CR/LF (or other control char) would split the `//` line and
 * break the OmniJS parse even after whole-script escaping. Collapse them to a
 * single space; trim. (Backtick/${ are additionally handled by the whole-source
 * escapeTemplateString pass; this function's job is the newline/control class.)
 */
export function sanitizeForScriptComment(desc: string): string {
  // Collapse any run of CR/LF/tab/other C0 control char (and DEL) to one space.
  return desc.replace(/[\u0000-\u001F\u007F]+/g, ' ').trim();
}
```

`list-tasks-ast.ts`: delete its local `escapeTemplateString` (lines ~123–126); add
`import { escapeTemplateString } from '../../../contracts/ast/bridge-escape.js';` (verify the exact relative path at
implementation). Line 88 usage unchanged.

### 2. Per-builder refactor (the 5 builders)

Each builder currently has, inside its outer `const script = \`(() => { … const omniJsScript = \\\` …OMNIJS with
${interpolations}… \\\`; return app.evaluateJavascript(omniJsScript); …
})()\``, an **inline nested escaped-backtick** OmniJS body. Refactor each to the proven `list-tasks-ast.ts:88` shape:

1. Extract the OmniJS body into a standalone TS template literal **before** the outer `script`:
   `const omniJsSource = \`…OMNIJS…
   ${filterCode.predicate} … // Filter: ${sanitizeForScriptComment(filterDescription)} …\`;`
   (now real backticks at the TS level, normal `${}`
   interpolation; the description is sanitized here).
2. In the outer JXA wrapper, embed via the existing pattern:
   `const omniJsScript = \\\`${escapeTemplateString(omniJsSource)}\\\`;`then`app.evaluateJavascript(omniJsScript)`
   (unchanged).

This applies the escape **once to the whole OmniJS source** per builder — covering predicate + structural channels for
any current/future interpolation — and (for the comment-channel builders) the description is newline-safe before
escaping.

**Per-builder description-source notes (the comment-channel function differs by builder):**

- `buildExportTasksScript`, `buildTaskCountScript` → `describeFilterForScript` (`script-builder.ts:990`).
- `buildFilteredProjectsScript` → **`describeProjectFilter`** (`filter-generator.ts:330`), _not_
  `describeFilterForScript` — same raw-user-text hazard (`filter.text`, `filter.folderName`); wrap its `// Filter:`
  interpolation with `sanitizeForScriptComment` the same way.
- `buildFilteredFoldersScript` → **predicate-only**. The `:1731` `search: "${search}"` `filterDescription` lives **only
  in the returned `GeneratedScript` metadata, NOT interpolated into the OmniJS body** (the body gets `search` solely via
  `${JSON.stringify(search)}`). No comment-channel hazard; **no `sanitizeForScriptComment` step** — the whole-source
  `escapeTemplateString` wrap is the entire fix here (same category as `buildProjectByIdScript`).
- `buildProjectByIdScript` → its `filterDescription` (`id = ${projectId}`) lives **only in the returned
  `GeneratedScript` metadata, NOT embedded in the script body** → **no comment-channel hazard** here. Its only in-body
  hazard is the predicate channel via the user-derived `projectId` (`${JSON.stringify(projectId)}`); the whole-source
  `escapeTemplateString` wrap still applies and is still necessary, but the `sanitizeForScriptComment` step is N/A for
  this builder.

Mechanical, pattern-driven (each builder converges on the single correct shape). It is a real structural change to 5
builders, not a one-line addition — sized accordingly in the plan.

### 3. Tests

- **`bridge-escape.ts` unit tests:** `escapeTemplateString` escapes `` ` ``/`${`/`\` and is identity on benign; does NOT
  alter newlines (documents the division of responsibility). `sanitizeForScriptComment` collapses CR/LF/`\t`/control to
  space, trims, identity on benign.
- **Builder-level tests:** for each of the 5 builders, generate the script with (a) benign and (b) hostile (`` ` ``,
  `${x}`, `\n`) values in the user-reachable field(s) (`text`/tag/`projectId`/ `id`/folder `search`); assert the
  generated script **parses as valid JS** (`new Function(script)` does not throw — it constructs but does not execute,
  so no OmniFocus needed) and the hostile payload is present only in escaped form (not as raw unbalanced backtick / live
  `${}`). Include the benign-identity regression (generated script for benign input is unchanged vs. pre-fix modulo the
  escape no-op). This is the unconfounded proof shape from the brainstorm probe. Per-builder hostile vector:
  `buildFilteredProjectsScript`/`buildExportTasksScript`/ `buildTaskCountScript` via `text`/tag;
  `buildFilteredFoldersScript` via folder `search`; **`buildProjectByIdScript` via the `projectId` argument** (its
  hazard is predicate-only — no comment channel — so the hostile payload must go through `projectId`, not a
  description).

## Verification

1. `npm run build` — exit 0.
2. `npm run test:unit` — new helper + builder tests green; existing suite 0 failures (the refactor is
   behavior-preserving for benign input — spot-check a generated benign script is semantically equivalent: same OmniJS
   logic, only escaping differs at the embed boundary).
3. `npm run lint:strict` — exit 0.
4. Live sanity (OMN-60 discipline): an `omnifocus_read` tasks query with
   `filters:{text:{contains:"a\`b${x}"}}` now returns `success:true` (matches tasks whose name
   contains the literal `` a`b${x}
   ``) instead of `SCRIPT_ERROR`; a benign query is unchanged.
5. The `list-tasks-ast.ts` path still works (import-source change only) — a list query succeeds.

## Risks and mitigations

| Risk                                                 | Mitigation                                                                                                                                                                                                                     |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Per-builder extract refactor changes benign behavior | The transformation is escaping-only at the embed boundary; benign input → escape is identity → byte-identical OmniJS delivered. Builder tests assert benign-equivalence; full suite must stay green.                           |
| Double-escaping (escapeTemplateString applied twice) | Applied exactly once per builder at the single embed boundary; list path keeps its single existing call (now imported). Tests assert payload appears singly-escaped.                                                           |
| Newline still breaks comment                         | `sanitizeForScriptComment` collapses CR/LF/control before the description enters the source; helper unit test covers it.                                                                                                       |
| Missed a 6th builder / embed site                    | `grep -n "evaluateJavascript(omniJsScript)" src/contracts/ast/script-builder.ts` enumerates them (5 confirmed: 1286/1370/1559/1875/2013 regions → builders at 1173/1330/1520/1738/1965). Plan re-greps as a completeness gate. |
| ISO-date channel left unescaped                      | Out of scope by decision; `dateStr` is schema-validated ISO, not user free-text — no injection surface.                                                                                                                        |

## Linear

On completion: comment OMN-65 with the before/after proof (hostile `text` query: SCRIPT_ERROR → success) + the
centralization note; close OMN-65. (OMN-63/64 already closed; this is the last of the three OMN-57-spawned findings.)
