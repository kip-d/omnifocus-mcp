# CLAUDE.md Stable-Anchors Refactor + Regression Guard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix CLAUDE.md's factual rot at the root cause and add a vitest guard that fails when any `src/`/`docs/` reference in `CLAUDE.md` no longer resolves on disk.

> **Scope note (2026-05-18):** Guard covers `CLAUDE.md` only. The original `docs/dev/*.md` coverage was dropped during plan review — it surfaced ~36 pre-existing rotted/non-literal refs across 15+ historical docs (only 3 in CLAUDE.md); that is a separate optional follow-up. See the spec's §4 scope decision.

**Architecture:** One self-contained vitest test file holds both the pure extraction/normalization helpers (fixture-tested, TDD) and the real-doc assertion against `CLAUDE.md`. CLAUDE.md content fixes are surgical edits, no restructuring. The guard's correctness is proven against fixtures *before* it is pointed at the real (post-fix) `CLAUDE.md`, satisfying both TDD and the spec's ordering constraint.

**Tech Stack:** TypeScript, vitest, Node `fs`/`path`. No new dependencies (uses `node:fs` `readFileSync`/`existsSync`/`statSync`). Spec: `docs/superpowers/specs/2026-05-18-claudemd-stable-anchors-design.md`.

---

## File Structure

| File | Responsibility |
|---|---|
| `tests/unit/docs/claude-md-paths.test.ts` | Create. Pure helpers (`extractRefs`, `normalizeRef`, `classifyRef`) + fixture tests + real-docs assertion. Self-contained; helpers exported for fixture tests in the same file. |
| `CLAUDE.md` | Modify. §1 surgical fact fixes; §2 stable-anchors note; §3 Workflow norms section. |

vitest default include matches `*.test.ts` only, so a single test file is the cleanest home — no separate helper module (avoids accidental non-collection and keeps the matcher logic beside its fixtures). `tests/unit/docs/` follows the existing `tests/unit/<area>/` convention.

---

## Task 1: Path-reference matcher (TDD against fixtures only)

Builds and proves the guard's pure logic with in-memory fixture strings. Does **not** touch real `CLAUDE.md` yet (spec ordering constraint: §1 fixes precede pointing the guard at the real file).

**Files:**
- Create: `tests/unit/docs/claude-md-paths.test.ts`

- [ ] **Step 1: Write the failing fixture tests**

```typescript
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

// ---- Pure helpers (exported for fixture tests) ----

/** Extract candidate path strings from inline code, fenced code, and markdown link targets only. */
export function extractRefs(markdown: string): string[] {
  const spans: string[] = [];
  // Fenced code blocks first, then remove them so inline regex doesn't re-scan.
  let rest = markdown.replace(/```[\s\S]*?```/g, (m) => { spans.push(m); return ''; });
  for (const m of rest.matchAll(/`[^`\n]+`/g)) spans.push(m[0]);
  // Markdown link targets: take the (...) target string FIRST, then tokenize.
  for (const m of markdown.matchAll(/\]\(([^)]+)\)/g)) spans.push(m[1]);
  const refs: string[] = [];
  for (const span of spans) {
    for (const m of span.matchAll(/\/?(?:src|docs)\/[^\s`)]+/g)) refs.push(m[0]);
  }
  return refs;
}

/** Normalize a raw token: strip leading '/', trailing :NN[:CC], trailing sentence punctuation. */
export function normalizeRef(token: string): string {
  let t = token.replace(/^\//, '');           // leading '/' => repo-root
  t = t.replace(/:\d+(?::\d+)?$/, '');         // strip :NN or :NN:CC
  t = t.replace(/[.,);:]+$/, '');              // strip trailing sentence punctuation
  return t;
}

const ALLOWED_EXT = /\.(ts|js|md|dot|json)$/;

/** 'dir' | 'file' | 'malformed' */
export function classifyRef(norm: string): 'dir' | 'file' | 'malformed' {
  if (norm.endsWith('/')) return 'dir';
  if (ALLOWED_EXT.test(norm)) return 'file';
  return 'malformed';
}

describe('claude-md path matcher', () => {
  it('extracts only from code spans and link targets, not bare prose or link text', () => {
    const md = [
      'bare src/foo.ts in prose should be ignored',
      'inline `src/a.ts` here',
      '[docs/DOCS_MAP.md](docs/DOCS_MAP.md) link',
      '```\nsrc/b.ts\n```',
    ].join('\n');
    expect(extractRefs(md).sort()).toEqual(['docs/DOCS_MAP.md', 'src/a.ts', 'src/b.ts'].sort());
  });

  it('ignores tokens not starting src/ or docs/ (urls, dist)', () => {
    const md = 'see `node dist/index.js` and `https://modelcontextprotocol.io/specification/2025-06-18/`';
    expect(extractRefs(md)).toEqual([]);
  });

  it('normalizes leading slash to repo-root form', () => {
    expect(normalizeRef('/docs/dev/PATTERNS.md')).toBe('docs/dev/PATTERNS.md');
  });

  it('strips :NN line suffix', () => {
    expect(normalizeRef('src/x.ts:41')).toBe('src/x.ts');
    expect(normalizeRef('src/x.ts:41:7')).toBe('src/x.ts');
  });

  it('strips trailing sentence punctuation', () => {
    expect(normalizeRef('docs/dev/PATTERNS.md).')).toBe('docs/dev/PATTERNS.md');
  });

  it('classifies dir, file, malformed', () => {
    expect(classifyRef('src/tools/unified/')).toBe('dir');
    expect(classifyRef('docs/dev/x.dot')).toBe('file');
    expect(classifyRef('src/tools/unified')).toBe('malformed'); // no ext, no trailing /
  });
});
```

- [ ] **Step 2: Run the fixture tests, verify they pass**

Run: `npx vitest tests/unit/docs/claude-md-paths.test.ts --run`
Expected: PASS (6 tests). These prove the matcher; if any fail, fix the helper, not the test.

- [ ] **Step 3: Commit**

```bash
git add tests/unit/docs/claude-md-paths.test.ts
git commit -m "test(OMN-68): path-reference matcher proven against fixtures"
```

---

## Task 2: §1 surgical content fixes to CLAUDE.md

Fix the rotted facts so the real-docs guard (Task 4) can go green. Each edit is one fact. Verify replacements against the live codebase before writing.

**Files:**
- Modify: `CLAUDE.md` (Key Files table, Tag Operations §, Quick Symptom Index, Architecture Documentation table, MCP Specification §, Quick Reference, Script Size Limits, MCP-test `echo`)

- [ ] **Step 1: Verify the live replacement targets**

Run:
```bash
ls src/contracts/ast/tag-mutation-script-builder.ts src/contracts/ast/mutation-script-builder.ts src/omnifocus/scripts/shared/helpers.ts
grep -n '"@modelcontextprotocol/sdk"' package.json
grep -rn "MCP 20\|protocolVersion" src/index.ts | head
```
Expected: the three ast/shared files exist. Note: `src/index.ts` does **not** contain a literal `protocolVersion` value — only a `// … MCP <date> metadata` comment; the protocol version is supplied by `@modelcontextprotocol/sdk`. So the doc must **not** claim a value "from src/index.ts"; it points at the SDK (package.json) instead. Record the SDK semver and the MCP-date comment string for use below.

- [ ] **Step 2: Apply the content fixes**

Edits (each a single Edit call against `CLAUDE.md`):

1. **Key Files table** — remove the `bridge-helpers.ts` and `minimal-tag-bridge.ts` rows; keep `helpers.ts`; add a row `src/contracts/ast/` — "Mutation + tag script builders (setters, tags)".
2. **Tag Operations §** — replace the `bridgeSetTags()` code block with: JXA `task.tags = …` / `task.addTags()` silently no-op; assign tags via OmniJS `addTag()` inside the mutation script (`src/contracts/ast/mutation-script-builder.ts`) or the AST tag builders (`src/contracts/ast/tag-mutation-script-builder.ts`). Remove the `Function: bridgeSetTags() in …:41` line.
3. **Quick Symptom Index** — change the "Tags not saving/empty" Quick Fix to "Assign via OmniJS `addTag()` — see Tag Operations". Add a row: `Typed-value write returns success but didn't persist` → `Read-back required — see docs/dev/SETTER-PATTERNS.md`.
4. **Architecture Documentation table** — add row: `/docs/dev/SETTER-PATTERNS.md` | "OmniJS/JXA property setter decision matrix".
5. **MCP Specification table** — replace the `SDK` row value with "see `package.json` → `@modelcontextprotocol/sdk`" and the `Protocol Version` row with "determined by the installed `@modelcontextprotocol/sdk` (see `package.json`)"; change the `Spec:` line to the version-agnostic `https://modelcontextprotocol.io/specification/`. Do **not** substitute a new hardcoded date — that just relocates the rot.
6. **MCP-test `echo` block** — the `protocolVersion` here is a *client-declared request param* in an example handshake, not a server constant. Keep an example value but add an inline comment after the block: `# protocolVersion is the client-declared value; use one your installed @modelcontextprotocol/sdk supports`. Do not pin it to a specific date in prose.
7. **Quick Reference** — drop "~2 seconds, ~1644 tests" and "~2 minutes, 73 tests"; keep the bare commands with "(counts vary; run it)".
8. **Script Size Limits** — remove the "Current largest script: 31KB (6% of limit)" bullet; keep the JXA/OmniJS limit constants; keep the `SCRIPT_SIZE_LIMITS.md` pointer for the live measurement.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(OMN-68): fix rotted facts in CLAUDE.md (§1 surgical)"
```

---

## Task 3: §2 stable-anchors principle + §3 Workflow norms

Additive sections; no existing content removed.

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add the "Referencing code in this doc" note (§2)**

Add (near the existing "Documentation" section that already states the version rule), generalizing it:

```markdown
## Referencing code in this doc

Cite **stable anchors**, never volatile specifics — this is the version-pin rule generalized:

- ✅ directories (`src/contracts/ast/`), grep targets ("grep for `bridgeSetTags`"), command
  invocations (`npm run test:unit`)
- ❌ `file.ts:NN` line numbers, hardcoded version strings, hardcoded test/size counts

Volatile references rot silently; `tests/unit/docs/claude-md-paths.test.ts` fails CI when a
path reference stops resolving, but it cannot catch a stale line number or count — those must
not be written in the first place.
```

- [ ] **Step 2: Add the "Workflow norms" section (§3)**

```markdown
## Workflow norms

- PRs target `kip-d/omnifocus-mcp` (use `--repo kip-d/omnifocus-mcp`), not any upstream fork.
- Run a code-review subagent before merge; gate the merge on a Safe/Approved verdict.
- Merge via `gh pr merge --squash --auto` — never `--admin`.
- `git pull --rebase` before `git push` (work spans multiple machines/sessions).
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(OMN-68): add stable-anchors principle + workflow norms (§2/§3)"
```

---

## Task 4: Point the guard at the real CLAUDE.md

Now that §1/§2/§3 fixes have landed, add the real-doc assertion. Before the fixes this would have been red (3 known dead refs — proving the guard works); after them it must be green. Scope: `CLAUDE.md` only (per spec §4 scope decision — `docs/dev/*.md` deliberately not scanned).

**Files:**
- Modify: `tests/unit/docs/claude-md-paths.test.ts`

- [ ] **Step 1: Add the real-doc describe block**

Append to the test file (`readFileSync`, `existsSync`, `statSync`, `join` are already imported in Task 1):

```typescript
describe('CLAUDE.md path references all resolve', () => {
  const root = process.cwd(); // vitest runs from repo root (verified: worktree IS the project root)

  it('every src/ and docs/ reference in CLAUDE.md resolves on disk', () => {
    const md = readFileSync(join(root, 'CLAUDE.md'), 'utf8');
    const failures: string[] = [];
    for (const raw of extractRefs(md)) {
      const norm = normalizeRef(raw);
      const kind = classifyRef(norm);
      const abs = join(root, norm);
      if (kind === 'malformed') {
        failures.push(`CLAUDE.md: malformed reference "${raw}" (no allowed extension, no trailing /)`);
      } else if (kind === 'dir') {
        if (!(existsSync(abs) && statSync(abs).isDirectory()))
          failures.push(`CLAUDE.md: directory "${norm}" does not resolve`);
      } else if (!(existsSync(abs) && statSync(abs).isFile())) {
        failures.push(`CLAUDE.md: file "${norm}" does not resolve`);
      }
    }
    expect(failures, `\n${failures.join('\n')}\n`).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the full guard, verify green**

Run: `npx vitest tests/unit/docs/claude-md-paths.test.ts --run`
Expected: PASS (fixtures from Task 1 + this real-doc test). If the real-doc test fails, the message lists each unresolved/malformed ref — fix the offending CLAUDE.md reference (it is genuinely rotted) or, if it is an intentional non-literal anchor, restructure the wording per §2. **Do not loosen the matcher.**

- [ ] **Step 3: Typecheck + lint the new file + the unit glob**

Run:
```bash
npm run typecheck
npx eslint tests/unit/docs/claude-md-paths.test.ts --ext .ts
npx vitest tests/unit/docs --run
```
Expected: all green. (Note: `npm run lint` only scans `src/`, so the test file is lint-checked explicitly here. If eslint flat-config ignores `tests/**`, eslint exits 0 with no output — acceptable; `tsc --noEmit` still type-checks the file.)

- [ ] **Step 4: Commit**

```bash
git add tests/unit/docs/claude-md-paths.test.ts
git commit -m "test(OMN-68): guard asserts real CLAUDE.md paths resolve"
```

---

## Task 5: Full verification + PR

**Files:** none (verification + PR)

- [ ] **Step 1: Full unit suite**

Run: `npm run test:unit`
Expected: all pass, including the new `tests/unit/docs/claude-md-paths.test.ts`. Note the real test count (do not hardcode it anywhere).

- [ ] **Step 2: Sanity-read CLAUDE.md**

Re-read CLAUDE.md end to end: confirm no dead `bridgeSetTags`/`minimal-tag-bridge` remains, the SDK/protocol/count assertions are gone, §2/§3 read cleanly, and section structure is otherwise unchanged.

Run: `grep -n "bridgeSetTags\|minimal-tag-bridge\|1644\|1\.17\.4\|2025-06-18" CLAUDE.md`
Expected: no matches (or only an intentional, sourced reference).

- [ ] **Step 3: Push + open PR**

```bash
git push -u origin worktree-omn-68-claudemd-stable-anchors
gh pr create --repo kip-d/omnifocus-mcp --base main \
  --head worktree-omn-68-claudemd-stable-anchors \
  --title "docs(OMN-68): CLAUDE.md stable-anchors refactor + path-resolution guard" \
  --body "<summary of §1–§4 + verification; closes the OMN-41 follow-up doc-rot thread>"
```

- [ ] **Step 4: Code-review gate (repo norm)**

Dispatch a code-review subagent over the diff. Gate merge on a Safe/Approved verdict; fix any blocking findings and re-review. Then merge `gh pr merge --squash --auto`. Move OMN-68 → Done in Linear.

---

## Notes for the implementer

- **Spec ordering is load-bearing:** Task 1 (fixtures) and Task 4 (real `CLAUDE.md`) are deliberately split so the matcher is proven before it judges the real file, and so §1 fixes precede the real-doc assertion. Do not merge them.
- **Do not loosen the matcher to make Task 4 pass.** A failure there means a real rotted reference — fix the reference.
- **No restructuring** of CLAUDE.md sections; conceptual content (JXA/OmniJS rules, date table, dual-schema) is accurate and out of scope.
- `npx vitest … --run` for single-file runs; `npm run test:unit` for the full gate.
- @docs/superpowers/specs/2026-05-18-claudemd-stable-anchors-design.md is the source of truth for matcher rules.
