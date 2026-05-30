# aislop Evaluation & Actionable Findings

**Tool:** [`aislop`](https://github.com/scanaislop/aislop) v0.9.4 — a deterministic (non-LLM) static analyzer that
scores a codebase 0–100 for "AI slop" patterns (narrative comments, swallowed exceptions, `as any` / double casts, dead
code, oversized files, etc.).

**Scope of this doc:** what aislop found against this repo, which findings are real vs. noise, the config we added to
quiet the structural false positives, and the genuinely-worth-doing fixes — each chosen so that _clearing the flag
requires better code, not flag-silencing_.

> ⚠️ **Line numbers below are from the scan date and will drift.** Re-run the scan (commands at the bottom) before
> navigating.

---

## TL;DR

- aislop scores this repo **1/100**, but the number is **misleading**: it's pinned by one rule class
  (`swallowed-exception`) that systematically misreads **JXA/OmniJS scripts embedded as template-literal strings** as if
  they were our TypeScript.
- We added `.aislop/config.yml` excludes for **generated type declarations** and **script-generator directories**. That
  removed ~189 findings (88→37 errors) of pure noise.
- The score stays at 1/100 even after excludes, because the remaining false-positive catches live inside large files
  (e.g. `OmniFocusAnalyzeTool.ts`) that _also_ contain real TS, so they can't be cleanly excluded.
- **Do not run `aislop fix` wholesale** — it would strip ~180 narrative comments, including load-bearing ones (e.g. the
  [OMN-29](https://linear.app/omnifocus-mcp/issue/OMN-29/task-create-bridge-returns-wrong-primarykey-flattenedtasks-ordering)
  JXA/OmniJS ordering bridge explanation).
- The genuinely actionable, non-noise work is a short list, and two of three buckets **align with architecture we're
  already building** (the `.strict()` typed-JXA-envelope work).

---

## The config we added

`./.aislop/config.yml` — keeps generated/vendored code in the tree (it's load-bearing: 267 ambient-type usages across
`src/`) but out of the score.

```yaml
version: 1

# Vendored / generated type declarations are not our engineering surface.
# OmniFocus.d.ts is exported by OmniFocus itself (Automation → API Reference →
# Export TypeScript) and the `// ClassName` section labels it emits otherwise
# trip ai-slop/narrative-comment; the 2k-line exports also trip file-too-large.
# Keep them in the tree (267 ambient-type usages across src/) but out of the
# score. Mirrors the .prettierignore entry.
#
# Note: the exporter names versioned files `OmniFocus-X.Y.Z-d.ts` (hyphen-d),
# so `*.d.ts` alone misses them — exclude the whole api/ dir as well.
exclude:
  - '**/*.d.ts'
  - '**/*-d.ts'
  - '**/omnifocus/api/**'
  # JXA/OmniJS script generators: these files build OmniFocus automation as
  # template-literal strings. aislop is regex-based and reads the embedded JS
  # as if it were our TS — so empty `catch(e){}` inside a generated script
  # (deliberate best-effort date/property access) trips swallowed-exception,
  # and the in-script comments trip narrative/trivial. Grade the hand-written
  # server logic, not the generated scripts.
  - '**/contracts/ast/**'
  - '**/omnifocus/scripts/**'
```

**Why each exclude exists**

| Pattern                   | Reason                                                                                                                                                                                                                                     |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `**/*.d.ts`, `**/*-d.ts`  | OmniFocus's TypeScript export. The `// ClassName` section labels it emits trip `narrative-comment`; the 2k-line files trip `file-too-large`. The `-d.ts` variant catches the versioned `OmniFocus-4.8.6-d.ts` naming that `*.d.ts` misses. |
| `**/omnifocus/api/**`     | Belt-and-suspenders for the whole vendored API dir (mirrors the `.prettierignore` entry).                                                                                                                                                  |
| `**/contracts/ast/**`     | AST → JXA/OmniJS **script builders**. The "code" is largely JS-in-strings; empty `catch(e){}` there is deliberate best-effort, not a swallowed error.                                                                                      |
| `**/omnifocus/scripts/**` | The JXA scripts themselves / their generators. Same embedded-script false-positive class.                                                                                                                                                  |

**Candidate excludes we deliberately did _not_ add** (your call):

- `docs/**` — `docs/jxa-test-utilities.js` produces 15 `console-leftover` warnings where `console` _is_ the intended
  output. Excluding `docs/**` is reasonable.
- We left `src/tools/unified/*` in scope on purpose: those files mix real TS with embedded scripts, and the real TS is
  worth grading.

---

## Actionable groups

The 14 `double-type-assertion` (`as unknown as X`) findings — the highest-signal category — split into three buckets.

### Bucket 1 — "Parse, don't cast" at the JXA boundary _(DEFERRED — see status)_

> 🟡 **STATUS: DEFERRED — the headline fix below is infeasible _as written_.** Empirical check: the read path does
> **user-driven partial field projection** (`projectFields()` in `task-query-pipeline.ts`). When a query passes a
> `fields` list, the result is a `Partial<OmniFocusTask>` (only `id` + the requested fields) — the
> `as unknown as OmniFocusTask` cast exists _precisely because_ `result` is partial. A strict
> `OmniFocusTaskSchema.parse()` against the full interface would **reject valid partial reads.** The original "real
> architectural win" framing was overstated. The genuinely promising thread (a `.partial()`-derived schema that survives
> projection) is tracked as future work — see **"Future exploration"** below
> ([OMN-112](https://linear.app/omnifocus-mcp/issue/OMN-112/explore-partial-projection-safe-read-side-validation-at-the-jxa)).
> The original analysis is kept below for context; read it through the lens of this status.

**Sites (8):** `task-query-pipeline.ts:194`, `OmniFocusReadTool.ts:453,578,642,679`, `OmniFocusWriteTool.ts:530,1519`.
Dynamic-key variants: `task-query-pipeline.ts:239,240,377`.

**Root cause:** data crossing the JXA/OmniJS boundary arrives as `unknown` / `Record<string,unknown>` and is force-cast
to a domain type with **no validation**.

```ts
// task-query-pipeline.ts:194
return result as unknown as OmniFocusTask;
// OmniFocusWriteTool.ts:530
const script = (await buildCreateTaskScript(convertedTaskData as unknown as TaskCreateData)).script;
```

**Fix — the read-side mirror of the `.strict()` write-path work
([OMN-96–99](https://linear.app/omnifocus-mcp/issue/OMN-96/omnifocus-read-projects-model-passes-filtersfolder-null-expecting-top);
see Referenced issues below).** `OmniFocusTask` is currently only a TypeScript `interface` (`src/omnifocus/types.ts:6`)
— there is **no runtime schema for data coming _out_ of OmniFocus.** Define one and parse at the boundary:

```ts
return OmniFocusTaskSchema.parse(result); // replaces `result as unknown as OmniFocusTask`
```

**Why it's better, not just quieter:**

- Validates OmniFocus data exactly where it's least trustworthy — version drift, missing props across OF 4.7/4.8 (the
  same reason best-effort `catch(e){}` is everywhere in generated scripts).
- Makes `schema-drift.ts` enforceable at runtime, not merely detectable.
- The cast disappears as a _side effect_ of doing the right thing.

**Caveats (and the blocker that deferred this):**

- **Partial projection breaks a naive strict parse** (the blocker — see STATUS above). `projectFields()` returns
  `Partial<OmniFocusTask>` whenever a query selects `fields`.
- Real work — authoring read-side Zod schemas for the domain types.
- Adds a parse cost on hot read paths. **Measure** before applying everywhere, given the perf focus.
- The dynamic-key reads (`(task as unknown as Record<string,unknown>)[field]`) are a sub-variant; a small typed
  `getField()` accessor handles them, but that's cosmetic — low priority.
- **The `TaskCreateData` cast is _not_ a read boundary.** `convertedTaskData as unknown as TaskCreateData`
  (`OmniFocusWriteTool.ts`) operates on input that is **already validated** by `CreateDataSchema` at the MCP boundary;
  it's a local typing mismatch after date conversion, not unvalidated boundary data. It needs at most a typing cleanup,
  not a new schema — out of scope here.

#### Future exploration — a `.partial()`-derived read schema (tracked: [OMN-112](https://linear.app/omnifocus-mcp/issue/OMN-112/explore-partial-projection-safe-read-side-validation-at-the-jxa))

"Infeasible" applies only to a _full strict_ parse. A **`.partial()`** variant of `OmniFocusTaskSchema` (validate the
_types_ of whatever fields are present, allow the rest absent) **would survive partial projection** and still catch
type-drift on the fields that are present — real value where OmniFocus data is least trustworthy (version drift across
OF 4.7/4.8). Trade-offs: it can't catch missing-_required_-field drift (projection makes "required" situational), and
the hot-path parse cost still needs measuring. Prototype at one boundary, benchmark, then decide on merits.

#### Design note — keep `OmniFocusTask` (interface) and `OmniFocusTaskSchema` (Zod) as one source of truth

Introducing `OmniFocusTaskSchema` solves the read-boundary validation gap but **creates a new drift axis.**
`OmniFocusTask` is today a hand-maintained TypeScript `interface` (`src/omnifocus/types.ts`); a Zod twin means two
definitions of the same shape that can silently diverge — the same hazard `schema-drift.ts` exists to catch on the
_advertised-vs-Zod_ axis, now on an _interface-vs-Zod_ axis.

**Do not reach for `schema-drift.ts` here — it structurally cannot cover this axis.** That gate works by _runtime
reflection_: it canonicalizes a live Zod schema (walking `_def`) and the advertised JSON schema, then diffs them. A
TypeScript `interface` is **erased at compile time** — at runtime there is nothing to reflect on. The right tool is one
layer up, at the type checker.

**Recommended: mirror the compile-time twin-guard the codebase already uses for `RepetitionRule`** (see the header
comment in `src/tools/unified/schemas/write-schema.ts`). Keep the readable, hand-authored `interface` as the source of
truth that the existing call sites reference, and bind the new schema to it:

```ts
export const OmniFocusTaskSchema = z
  .object({
    /* … */
  })
  .strict() satisfies z.ZodType<OmniFocusTask, z.ZodTypeDef, unknown>;
// `satisfies` catches type mismatches + missing *required* fields, but PERMITS a
// schema missing an *optional* field — so pair it with a SameKeys guard:
const _omniFocusTaskKeysSync: SameKeys<z.output<typeof OmniFocusTaskSchema>, OmniFocusTask> = true;
```

This is established prior art (`RepetitionRuleSchema` uses exactly this `satisfies` + `SameKeys` pair, for exactly this
reason — `OMN-98`), so it's low-risk and consistent.

**Alternative (not recommended):** invert the dependency — `type OmniFocusTask = z.infer<typeof OmniFocusTaskSchema>` —
making Zod the sole source. Rejected as the default: it discards the readable hand-authored interface and churns the
existing call sites, for no gain over the twin-guard.

### Bucket 2 — Discriminated unions for "no value here" states _(clean, low-risk win)_

**`src/utils/error-recovery.ts:103`** — `RetryResult<T>` declares `result: T` as always-present, so the failure path
fabricates a value:

```ts
return { result: undefined as unknown as T, attempts, succeeded: false, lastError: error };
```

**Fix — make the type honest:**

```ts
type RetryResult<T> =
  | { succeeded: true; result: T; attempts: number }
  | { succeeded: false; lastError: unknown; attempts: number };
```

Failure branch carries no fake result; callers must check `.succeeded` before reading `.result` (compile-time enforced).

**✅ RESOLVED BY DELETION (not the union).** The "check first" hunch was right: `executeWithRetry` in
`error-recovery.ts` was **dead code** — `src/tools/base.ts` has its own live `executeWithRetry`, and a repo-wide grep +
`ts-prune` confirmed zero external imports. Deleted `executeWithRetry` and its now-orphaned companions (`RetryResult`,
`RetryOptions`, `DEFAULT_RETRY_OPTIONS`, `isTransientError`, `createEnhancedErrorResponse`, and the private
`calculateExponentialBackoff`/`sleep`). Only `classifyErrorWithContext` (the one symbol `base.ts` imports) and its deps
remain. The fabricated-value cast disappeared with the function — no discriminated union needed.

**`src/utils/logger.ts:54,67`** — `redactArgs<T>(...): T` rebuilds a redacted structure but asserts it's still `T`. The
generic is dishonest. **Fix:** drop the generic, return `unknown` (it's a logging redactor; callers don't consume the
typed result). Both casts vanish; the signature stops lying. **✅ DONE.** Signature is now
`redactArgs(value: unknown, depth?): unknown`; both `as unknown as T` casts removed. Verified no production caller reads
a typed field (all feed it to `JSON.stringify` / an `unknown[]` log sink). One honest `as unknown[]` narrowing remains
at the structured-entry call site (an array input yields an array), and the unit test's typed field access was updated.

### Bucket 3 — Localize, don't chase _(leave them — "fixing" would be worse code)_

- **`src/diagnostics/schema-drift.ts:61`** — `(s as unknown as { _def: ZDef })._def` reaches into Zod internals.
  Unavoidable; Zod doesn't expose `_def` stably across versions. Best move: wrap it in **one** documented helper so
  there's a single cast, not scattered ones. Not a structural fix.

---

## Other real (but minor) items

| Category                                                      | Count          | Verdict / action                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `duplicate-import`                                            | 8 → **2 real** | **✅ FIXED.** The "8" overcounted: only **two** files had genuine splits — `OmniFocusAnalyzeTool.ts` (4 type imports from `script-response-types.js`) and `OmniFocusWriteTool.ts` (a `type` + value split from `mutation-script-builder.js`). `QueryCompiler.ts` and `diagnose-failures.ts` were already clean. Merged both, and added the autofixable `import/no-duplicates` rule to `eslint.config.js` (requires `eslint-plugin-import`) so future splits are caught at lint time, not by an external scan. |
| `vulnerable-dependency`                                       | 2              | **Real, unrelated to slop. ✅ FIXED** — `brace-expansion`, `qs` (both transitive, moderate). Resolved via `npm audit fix` (this is an **npm** project — `package-lock.json`; the original "pnpm.overrides" advice was wrong; npm's native `"overrides"` is the fallback). brace-expansion 5.0.5→5.0.6, qs 6.14.2→6.15.2, no breaking changes; `npm audit` → 0.                                                                                                                                                |
| `console-leftover`                                            | 16             | **~All false positive here.** 15 in `docs/jxa-test-utilities.js` (console _is_ the output); 1 in `src/utils/cli.ts:108` (a CLI — legitimate). No fix; consider excluding `docs/**`.                                                                                                                                                                                                                                                                                                                           |
| `swallowed-exception` (remaining 37)                          | 37             | **False positive.** Embedded JXA in template strings (18 in `OmniFocusAnalyzeTool.ts`, rest in `scripts/` + `docs/*.js`). Can't exclude without dropping real TS in the same files. Ignore.                                                                                                                                                                                                                                                                                                                   |
| `narrative-comment` / `trivial-comment`                       | ~330           | **Review individually, do NOT bulk-fix.** Some genuine AI narration; many are load-bearing (e.g. OMN-29 bridge rationale).                                                                                                                                                                                                                                                                                                                                                                                    |
| `file-too-large` (13), `duplicate-block` (20), `deep-nesting` | —              | **Real but expected.** Big builders/tools (`OmniFocusAnalyzeTool` 3016 LOC, `OmniFocusWriteTool` 2370). Legit refactor targets, not slop. Track separately from this exercise.                                                                                                                                                                                                                                                                                                                                |

---

## Suggested order of work

> ✅ **Items 1–2 are DONE** (this PR). Item 3 is deferred to
> [OMN-112](https://linear.app/omnifocus-mcp/issue/OMN-112/explore-partial-projection-safe-read-side-validation-at-the-jxa).
> The list is kept as the record of what was decided.

1. **Quick wins — ✅ DONE.** `npm audit fix` for the 2 vuln deps (npm `overrides` as fallback — _not_ `pnpm.overrides`);
   merged the 2 real duplicate-import sites and added the `import/no-duplicates` lint rule.
2. **Bucket 2 — ✅ DONE.** `error-recovery.executeWithRetry` was verified **dead** → deleted it (and orphaned
   companions), which removed the fabricated-value cast without a discriminated union; dropped the `logger.redactArgs`
   generic.
3. **Bucket 1 — DEFERRED
   ([OMN-112](https://linear.app/omnifocus-mcp/issue/OMN-112/explore-partial-projection-safe-read-side-validation-at-the-jxa)).**
   The naive strict parse is infeasible (partial projection — see Bucket 1 STATUS). The promising thread is a
   `.partial()`-derived schema: pilot at one boundary (e.g. `task-query-pipeline.ts`), benchmark hot-path parse cost,
   decide on merits. If pursued, settle the interface↔Zod source-of-truth question first (see the Bucket 1 design note).
4. **Leave Bucket 3 and the comment findings** unless touched incidentally.

---

## Referenced issues

| Issue   | Title                                                                                        | Link                                                                                                                |
| ------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| OMN-29  | Task create bridge returns wrong primaryKey (flattenedTasks ordering mismatch)               | https://linear.app/omnifocus-mcp/issue/OMN-29/task-create-bridge-returns-wrong-primarykey-flattenedtasks-ordering   |
| OMN-96  | `omnifocus_read` projects: accept `filters.folder: null` as "top-level only"                 | https://linear.app/omnifocus-mcp/issue/OMN-96/omnifocus-read-projects-model-passes-filtersfolder-null-expecting-top |
| OMN-97  | Propagate `.strict()` across the full write mutation tree + enrich `data` inputSchema        | https://linear.app/omnifocus-mcp/issue/OMN-97/close-residual-silent-drop-surface-on-write-path-propagate-strict     |
| OMN-98  | Make `RepetitionRuleSchema` (+ nested `daysOfWeek`) strict                                   | https://linear.app/omnifocus-mcp/issue/OMN-98/make-repetitionruleschema-nested-daysofweek-strict-last-non-strict    |
| OMN-99  | Make `ReviewIntervalObjectSchema` strict — final non-strict object on the write path         | https://linear.app/omnifocus-mcp/issue/OMN-99/make-reviewintervalobjectschema-strict-final-non-strict-object-on-the |
| OMN-112 | Explore partial-projection-safe read-side validation at the JXA boundary (Bucket 1 deferred) | https://linear.app/omnifocus-mcp/issue/OMN-112/explore-partial-projection-safe-read-side-validation-at-the-jxa      |

The `.strict()` write-path lineage is OMN-76 → OMN-90 (read) → OMN-97 → OMN-98 → OMN-99; Bucket 1 (read-side) is its
mirror — deferred to OMN-112 because the read path's partial projections rule out a naive strict parse.

---

## How to reproduce / re-scan

```bash
# from the repo root
npx -y aislop@latest scan .            # human-readable summary + score
npx -y aislop@latest scan . --json     # machine-readable, for slicing findings by dir/rule
npx -y aislop@latest scan src/tools    # narrow to a subtree

# DO NOT run wholesale — would strip load-bearing comments:
#   npx aislop fix
```

---

## Recommendation on adoption

For a codebase that is fundamentally a **JXA/OmniJS script-generation engine**, aislop's regex model produces structural
false positives and the single 0–100 score is **not a useful CI gate here**. The genuinely useful output is a small,
filterable lint list — most of which `eslint` + `tsc` (already wired into husky/CI) also surface.

**Suggested stance:** keep `.aislop/config.yml` so an occasional manual scan isn't dominated by noise, but **do not add
a score-based CI gate.** Treat the Bucket 1/2 fixes as ordinary engineering improvements we'd want regardless of the
tool.

> A tool like aislop earns its keep on greenfield, heavily agent-written app code as a per-PR gate. On a mature,
> JXA-heavy server like this, it's mostly fighting the architecture.
