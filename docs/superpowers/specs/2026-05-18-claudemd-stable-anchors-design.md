# OMN-68 — CLAUDE.md stable-anchors refactor + regression guard

**Date:** 2026-05-18 **Linear:** OMN-68 (High) **Status:** Design approved; spec under review

## Problem

The project `CLAUDE.md` is structurally sound but factually rotted, and the rot is concentrated in its highest-stakes
section. It does not merely lag the code — in the Tag Operations section it instructs a fresh Claude to call
`bridgeSetTags()`, a function that no longer exists. A silent doc is safer than a confidently wrong one; this is the
exact failure `CLAUDE.md`'s own Debugging section warns against.

Discovered while completing OMN-41: a new doc (`docs/dev/SETTER-PATTERNS.md`) inherited a dead path copied straight from
CLAUDE.md's Key Files table. The code-review gate caught it — a parse/lint/test pass is structurally blind to "this path
404s."

## Root cause

Every rotted item is the same anti-pattern: a **volatile specific** (exact file path, `file.ts:NN` line number, version
pin, hardcoded count) stated inline. CLAUDE.md already states the cure for one case ("Don't hardcode the current version
in prose; `package.json` / `CHANGELOG.md` are the single source of truth") but never generalizes it. A one-time scrub
re-rots in ~2 months. The durable fix is a style change plus a mechanical guard.

## Audit findings (verified against the codebase, 2026-05-18)

| Location                                | Problem                                                                            | Reality                                                                                                               |
| --------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Key Files table                         | `bridge-helpers.ts`, `minimal-tag-bridge.ts` rows dead                             | Deleted `f143e44`; only `helpers.ts` survives                                                                         |
| Tag Operations § code example           | `bridgeSetTags()` gone                                                             | OmniJS `addTag()` in `mutation-script-builder.ts`; AST builders in `src/contracts/ast/tag-mutation-script-builder.ts` |
| Quick Symptom Index — "Tags not saving" | Dead `bridgeSetTags()` / `minimal-tag-bridge.ts`                                   | Same as above                                                                                                         |
| MCP Specification §, MCP-test `echo`    | SDK `1.17.4` → `^1.25.1`; protocol `2025-06-18` → `2025-11-25` (wrong in 3 places) | `package.json` / `src/index.ts`                                                                                       |
| Quick Reference                         | `~1644` unit tests; "73 integration tests"                                         | `~1812+` unit; the 73 was unit _files_                                                                                |
| Script Size Limits                      | "Current largest 31KB"                                                             | ~35KB (`workflow-analysis-v3.ts`); low harm, drift-prone                                                              |

Conceptual content — JXA-vs-OmniJS property/method rule, date-format table, dual-schema sync warning, process-cluster
index _structure_ — is accurate and **out of scope** for rewrite.

## Design

### 1. Content fixes (surgical)

Section structure preserved. Per-location changes:

- **Key Files table:** drop the two dead rows; keep `helpers.ts`; add `src/contracts/ast/` (mutation + tag script
  builders) as the real setter/tag home.
- **Tag Operations §:** replace the `bridgeSetTags()` example with the current mechanism (OmniJS `addTag()` +
  `tag-mutation-script-builder.ts`). Keep the durable fact: JXA `task.tags = …` / `task.addTags()` silently no-op.
- **Quick Symptom Index:** fix the "Tags not saving" row to the real mechanism; **add** a row — typed-value write
  returns `success` but didn't persist → `docs/dev/SETTER-PATTERNS.md`.
- **Architecture Documentation table:** add a `SETTER-PATTERNS.md` row.
- **MCP Specification § + test `echo`:** remove the hardcoded SDK version and protocol date from prose; point at
  `package.json` / the SDK. Keep the spec a generic single reference.
- **Quick Reference:** remove the `~1644` / `73` count assertions; keep the bare commands, note "counts vary; run it."
- **Script Size Limits:** remove "current largest 31KB"; keep the limit constants (stable); point at
  `SCRIPT_SIZE_LIMITS.md` for the live measurement.

### 2. Stable-anchors principle (generalize the existing rule)

Add a short "Referencing code in this doc" note: cite directories, grep targets, and command invocations — never
`file.ts:NN`, version strings, or counts. This promotes the anti-hardcoding rule from version-only to general, so future
edits don't re-introduce rot.

### 3. Surface tribal norms

Add a brief "Workflow norms" section: PRs target `kip-d/omnifocus-mcp`; run a code-review subagent before merge; merge
via `gh pr merge --squash --auto` (never `--admin`). These currently live only in agent memory, invisible to a fresh
session.

### 4. Regression guard — `tests/unit/docs/claude-md-paths.test.ts`

A vitest unit test that:

**Input set.** `CLAUDE.md` only, read from the repo root.

> **Scope decision (2026-05-18, supersedes the original design choice).** The guard was originally scoped to
> `CLAUDE.md` + `docs/dev/*.md`. Running the matcher against the live repo during plan review surfaced ~36 pre-existing
> rotted/non-literal references across 15+ `docs/dev` files (historical session logs, benchmark snapshots, intentional
> line-range and glob references) — only 3 failures were in `CLAUDE.md`. Folding a 36-reference cleanup of point-in-time
> historical docs into this ticket would be scope creep and partly wrong (session logs are records, not living docs).
> User decision: **guard covers `CLAUDE.md` only**; `docs/dev` rot is a separate optional follow-up. This also makes
> line-range (`:NN-MM`) and glob (`src/**/*.ts`) token handling moot — `CLAUDE.md` contains neither.

**Extraction surface (exact).** Scan only two Markdown constructs, never bare prose:

1. Inline-code spans (`` `…` ``) and fenced-code-block contents.
2. Markdown link _targets_ — the `(...)` of `[text](target)`. The link _text_ is **not** scanned (avoids double-counting
   `[docs/DOCS_MAP.md](docs/DOCS_MAP.md)`). Extract the target string from inside `(...)` _first_, then
   tokenize/normalize — so the link-syntax close paren is never mistaken for path punctuation in normalization step 3.

Within a scanned span, a **candidate** is a token whose `src/` or `docs/` segment sits at a **path-token boundary** —
i.e. the (optionally single-leading-`/`) `src/`/`docs/` is preceded by start-of-span, whitespace, a backtick, `(`, `[`,
or `]`. It must, after the normalization below, end in an allowed extension **or** a trailing `/` (directory). Tokens
not _starting_ `src/` or `docs/` are ignored — this deliberately excludes `dist/index.js`, `node …`, and any
`http(s)://…` URL (URLs never start `src/` or `docs/`).

**Boundary-anchored, not substring (load-bearing).** The `src/`/`docs/` must begin the path token, not appear mid-path.
A reference like `` `tests/unit/docs/claude-md-paths.test.ts` `` is a `tests/`-rooted path — **out of the guard's
scope** (the guard validates `src/`- and `docs/`-rooted references only). A substring matcher would wrongly extract the
inner `docs/claude-md-paths.test.ts` and false-positive on a perfectly valid reference. The regex therefore requires a
preceding boundary char (lookbehind), e.g.
`/(?<=^|[\s\`(\[\]])\/?(?:src|docs)\/[^\s\`)]+/g`. Concretely: `` `/docs/dev/x.md` ``, `` `docs/X.md` ``, link target `(docs/X.md)`, and `src/contracts/ast/`after whitespace all match;`tests/unit/docs/…`, `foo/src/bar.ts`do **not** (their`docs/`/`src/`is preceded by`/`,
not a boundary). This must have explicit fixture coverage.

**Allowed extensions (explicit allowlist):** `.ts`, `.js`, `.md`, `.dot`, `.json`. A token matching `^/?(src|docs)/`
with no allowed extension and no trailing `/` is reported as _malformed reference_ (fail), not silently skipped.

**Normalization before resolution, in order:**

1. Strip a single leading `/` if present — CLAUDE.md uses both `docs/x.md` and `/docs/dev/x.md` forms; a leading `/`
   means **repo-root**, never filesystem root. After stripping, resolve as `path.join(repoRoot, token)`.
2. Strip a trailing `:NN` (or `:NN:CC`) line/column suffix — line numbers are the volatile specifics we discourage; the
   guard resolves the _file_, not the line.
3. Strip trailing sentence punctuation (`.`, `,`, `)`, `;`, `:`) not part of the path.

**Assertion.** Each normalized reference must resolve on disk: file refs via `fs.existsSync` as a file; refs ending `/`
must exist **and** be a directory. The test fails with a list of every unresolved/malformed reference and its source
file+line.

**Ordering constraint.** The guard asserts the **post-§1-fix** state of `CLAUDE.md`. §1's content fixes (which delete
the `minimal-tag-bridge.ts:41` token and other dead paths) land before the guard is pointed at the real `CLAUDE.md`. The
guard's own correctness is proven independently against fixtures first (below).

**CI/enforcement.** The test lives under `tests/unit/`, so it is picked up by the `vitest tests/unit` glob that both
`npm run test:unit` (used in `test:pre-push`) and CI's `npm run test:quick` (`.github/workflows/ci.yml`) execute. No new
npm script or CI wiring.

The guard is itself TDD'd: fixture strings (a known-dead path → red; a resolvable path, a leading-slash path, and a
`:NN`-suffixed path → green) prove the matcher before it is pointed at the real docs.

## Testing strategy

- Guard test: TDD with fixtures (dead-path fixture → red; resolvable fixture → green) before wiring to the real docs.
- Content fixes verified by the guard going green plus a manual read for semantic accuracy (the guard proves paths
  resolve, not that prose is correct).
- `npm run test:unit`, `npm run lint`, `npm run typecheck` must stay green.
- Code-review subagent gate before merge (repo norm); merge `--squash --auto`.

## Scope guards (YAGNI)

- No section reorganization. No rewrite of accurate conceptual content.
- The guard validates **resolution only**, not anchor _quality_ — a test cannot mechanically distinguish a good anchor
  from a bad one. Style is enforced by the written principle (§2) + code review, not the test.
- Guard covers `CLAUDE.md` only (see §4 scope decision). `docs/dev/*.md` and `docs/superpowers/specs` are **not**
  scanned: the former carries a large pre-existing backlog of intentional/historical non-literal refs (separate optional
  follow-up ticket); the latter legitimately references planned/future paths. Both would be false-positive heavy.
- Out of scope: the user's global `~/.claude/CLAUDE.md` (separate concern, not project-owned).
- Follow-up (not this ticket): a `docs/dev/*.md` rot audit, if desired, is its own scoped effort — ~36 refs across 15+
  files, several being point-in-time session logs that should arguably not be "fixed" at all.

## Deliverables

1. Surgical content fixes to `CLAUDE.md` per §1.
2. "Referencing code in this doc" stable-anchors note (§2).
3. "Workflow norms" section (§3).
4. `tests/unit/docs/claude-md-paths.test.ts` regression guard (§4), TDD'd, green in `test:unit` / pre-push / CI.

## Origin

OMN-41 follow-up session, 2026-05-18 (PR #22 merged). Filed because the rot misleads every fresh Claude session until
fixed.
