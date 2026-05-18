# OMN-68 — CLAUDE.md stable-anchors refactor + regression guard

**Date:** 2026-05-18
**Linear:** OMN-68 (High)
**Status:** Design approved; spec under review

## Problem

The project `CLAUDE.md` is structurally sound but factually rotted, and the rot is
concentrated in its highest-stakes section. It does not merely lag the code — in the Tag
Operations section it instructs a fresh Claude to call `bridgeSetTags()`, a function that no
longer exists. A silent doc is safer than a confidently wrong one; this is the exact failure
`CLAUDE.md`'s own Debugging section warns against.

Discovered while completing OMN-41: a new doc (`docs/dev/SETTER-PATTERNS.md`) inherited a dead
path copied straight from CLAUDE.md's Key Files table. The code-review gate caught it — a
parse/lint/test pass is structurally blind to "this path 404s."

## Root cause

Every rotted item is the same anti-pattern: a **volatile specific** (exact file path,
`file.ts:NN` line number, version pin, hardcoded count) stated inline. CLAUDE.md already
states the cure for one case ("Don't hardcode the current version in prose; `package.json` /
`CHANGELOG.md` are the single source of truth") but never generalizes it. A one-time scrub
re-rots in ~2 months. The durable fix is a style change plus a mechanical guard.

## Audit findings (verified against the codebase, 2026-05-18)

| Location | Problem | Reality |
|---|---|---|
| Key Files table | `bridge-helpers.ts`, `minimal-tag-bridge.ts` rows dead | Deleted `f143e44`; only `helpers.ts` survives |
| Tag Operations § code example | `bridgeSetTags()` gone | OmniJS `addTag()` in `mutation-script-builder.ts`; AST builders in `src/contracts/ast/tag-mutation-script-builder.ts` |
| Quick Symptom Index — "Tags not saving" | Dead `bridgeSetTags()` / `minimal-tag-bridge.ts` | Same as above |
| MCP Specification §, MCP-test `echo` | SDK `1.17.4` → `^1.25.1`; protocol `2025-06-18` → `2025-11-25` (wrong in 3 places) | `package.json` / `src/index.ts` |
| Quick Reference | `~1644` unit tests; "73 integration tests" | `~1812+` unit; the 73 was unit *files* |
| Script Size Limits | "Current largest 31KB" | ~35KB (`workflow-analysis-v3.ts`); low harm, drift-prone |

Conceptual content — JXA-vs-OmniJS property/method rule, date-format table, dual-schema sync
warning, process-cluster index *structure* — is accurate and **out of scope** for rewrite.

## Design

### 1. Content fixes (surgical)

Section structure preserved. Per-location changes:

- **Key Files table:** drop the two dead rows; keep `helpers.ts`; add `src/contracts/ast/`
  (mutation + tag script builders) as the real setter/tag home.
- **Tag Operations §:** replace the `bridgeSetTags()` example with the current mechanism
  (OmniJS `addTag()` + `tag-mutation-script-builder.ts`). Keep the durable fact: JXA
  `task.tags = …` / `task.addTags()` silently no-op.
- **Quick Symptom Index:** fix the "Tags not saving" row to the real mechanism; **add** a
  row — typed-value write returns `success` but didn't persist → `docs/dev/SETTER-PATTERNS.md`.
- **Architecture Documentation table:** add a `SETTER-PATTERNS.md` row.
- **MCP Specification § + test `echo`:** remove the hardcoded SDK version and protocol date
  from prose; point at `package.json` / the SDK. Keep the spec a generic single reference.
- **Quick Reference:** remove the `~1644` / `73` count assertions; keep the bare commands,
  note "counts vary; run it."
- **Script Size Limits:** remove "current largest 31KB"; keep the limit constants (stable);
  point at `SCRIPT_SIZE_LIMITS.md` for the live measurement.

### 2. Stable-anchors principle (generalize the existing rule)

Add a short "Referencing code in this doc" note: cite directories, grep targets, and command
invocations — never `file.ts:NN`, version strings, or counts. This promotes the
anti-hardcoding rule from version-only to general, so future edits don't re-introduce rot.

### 3. Surface tribal norms

Add a brief "Workflow norms" section: PRs target `kip-d/omnifocus-mcp`; run a code-review
subagent before merge; merge via `gh pr merge --squash --auto` (never `--admin`). These
currently live only in agent memory, invisible to a fresh session.

### 4. Regression guard — `tests/unit/docs/claude-md-paths.test.ts`

A vitest unit test that:

- Reads `CLAUDE.md` and globs `docs/dev/*.md`.
- Extracts inline-code / link tokens matching `src/…` or `docs/…` with a file-ish extension
  or a trailing `/` (directory).
- **Strips** any `:NN` line suffix and trailing punctuation before resolving — line numbers
  are precisely what we discourage, so the guard resolves the *file*, not the line.
- Asserts each reference resolves on disk (repo-root relative); directory refs checked as
  directories. Failure lists every unresolved reference.
- Runs in `test:unit` → already gated in `test:pre-push` and `.github/workflows/ci.yml`. No
  new CI wiring, no new npm script.

The guard is itself TDD'd: a fixture-based test proves it (a) fails on a known-dead path and
(b) passes on resolvable ones, before it is pointed at the real docs.

## Testing strategy

- Guard test: TDD with fixtures (dead-path fixture → red; resolvable fixture → green) before
  wiring to the real docs.
- Content fixes verified by the guard going green plus a manual read for semantic accuracy
  (the guard proves paths resolve, not that prose is correct).
- `npm run test:unit`, `npm run lint`, `npm run typecheck` must stay green.
- Code-review subagent gate before merge (repo norm); merge `--squash --auto`.

## Scope guards (YAGNI)

- No section reorganization. No rewrite of accurate conceptual content.
- The guard validates **resolution only**, not anchor *quality* — a test cannot
  mechanically distinguish a good anchor from a bad one. Style is enforced by the written
  principle (§2) + code review, not the test.
- `docs/superpowers/specs` excluded from the guard: spec docs legitimately reference
  planned/future paths and would produce false positives.
- Out of scope: the user's global `~/.claude/CLAUDE.md` (separate concern, not project-owned).

## Deliverables

1. Surgical content fixes to `CLAUDE.md` per §1.
2. "Referencing code in this doc" stable-anchors note (§2).
3. "Workflow norms" section (§3).
4. `tests/unit/docs/claude-md-paths.test.ts` regression guard (§4), TDD'd, green in
   `test:unit` / pre-push / CI.

## Origin

OMN-41 follow-up session, 2026-05-18 (PR #22 merged). Filed because the rot misleads every
fresh Claude session until fixed.
