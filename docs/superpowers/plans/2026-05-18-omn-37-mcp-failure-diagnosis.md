# OMN-37 MCP Failure Diagnosis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the already-captured MCP tool-failure JSONL stream into automated, deduplicated, classified triage —
catching dual-schema drift before it compounds.

**Architecture:** A pure `failure-clustering` module (shared by the existing `analyze-failures` CLI and a new
`diagnose-failures` driver) feeds a static `inputSchema`↔Zod drift checker (also wired as a CI-failing unit test). The
driver classifies clusters deterministically, dispatches only the residue to an LLM agent, writes a committed triage
doc, and — behind guardrails — files Linear issues for deterministic drift. An optional local-only PostToolUse hook adds
a dev-feedback prioritization marker; scheduling lives in an untracked `~/bin` wrapper.

**Tech Stack:** TypeScript, Zod, vitest (`npm run test:unit` = `vitest tests/unit --run`), tsx scripts, Linear MCP
(`graphql` action).

**Spec:** `docs/superpowers/specs/2026-05-18-omn-37-mcp-failure-diagnosis-design.md`

---

## Key codebase facts (verified on worktree branch `worktree-omn-37-failure-diagnosis`, base `2ce9255`)

- **Failure log shape** (`src/tools/base.ts` `logToolFailure()` ≈:316–334):
  `{ timestamp:ISO, tool:string, errorType:'VALIDATION_ERROR'|'EXECUTION_ERROR', errorMessage:string, validationErrors?:ZodIssue[], inputArgs:<redacted>, schemaDescription:string, categorization?:{ errorType:ScriptErrorType, severity, recoverable, actionable, context } }`.
  Files: `~/.omnifocus-mcp/tool-failures/failures-YYYY-MM-DD.jsonl`.
- **Existing normalization** (`scripts/analyze-tool-failures.ts:119–122`):
  `errorMessage.replace(/[0-9a-f]{8,}/gi,'ID').replace(/\d{4}-\d{2}-\d{2}/g,'DATE').substring(0,100)`. This is the logic
  to **extract, not duplicate**.
- **Taxonomy** (`src/utils/error-taxonomy.ts`): `ScriptErrorType` enum members include `INVALID_ID`, `NULL_RESULT`,
  `OMNIFOCUS_NOT_RUNNING`, `SCRIPT_TIMEOUT`, `CONNECTION_TIMEOUT` (the ignore-set), plus `getErrorSeverity()`,
  `isRecoverableError()`.
- **inputSchema getters**: `OmniFocusReadTool.ts get inputSchema()`, `OmniFocusWriteTool.ts`, `OmniFocusAnalyzeTool.ts`,
  `SystemTool.ts` — each returns `{ type:'object', properties:{ <field>:{ type, enum?, description } }, required?:[] }`.
- **Zod schemas**: `src/tools/unified/schemas/{read,write,analyze,batch}-schema*.ts`. Tool Zod schema symbols:
  `SystemToolSchema` (SystemTool). Read/Write/Analyze tools validate via their unified schemas.
- **Coercion convention reality** (NOT as CLAUDE.md prose states): `src/tools/schemas/coercion-helpers.ts` exports
  `coerceNumber = () => z.coerce.number()`, `coerceBoolean`, `coerceObject`. **Do not pattern-match
  `z.union([z.number(),...])`** — detect coercibility by runtime probe (see Task 7).
- **`redactArgs`**: `src/utils/logger.ts:45` (already applied before logging — the module consumes already-redacted
  `inputArgs`; never re-redact, never log raw).
- Test files live flat/foldered under `tests/unit/`; vitest. No `src/diagnostics/` dir yet.

---

## File Structure

| File                                      | Responsibility                                                               | Phase |
| ----------------------------------------- | ---------------------------------------------------------------------------- | ----- |
| `src/diagnostics/failure-log.ts`          | Types + tolerant JSONL parse (`FailureRecord`, `parseFailureLog`)            | 1     |
| `src/diagnostics/normalize.ts`            | `normalizeErrorMessage`, `normalizeInputShape` (extracted from CLI)          | 1     |
| `src/diagnostics/clustering.ts`           | `clusterFailures`, `classifyCluster`, `fingerprint`, ignore-set              | 1     |
| `scripts/analyze-tool-failures.ts`        | Refactored to consume the module; CLI output unchanged                       | 1     |
| `src/diagnostics/schema-drift.ts`         | `canonicalizeInputSchema`, `canonicalizeZodSchema`, `diffSchemas`            | 2     |
| `src/diagnostics/tool-schema-registry.ts` | Maps each tool name → `{ getInputSchema(), zodSchema }`                      | 2     |
| `src/diagnostics/ledger.ts`               | Seen-patterns ledger read/write (`~/.omnifocus-mcp/diagnosed-patterns.json`) | 3     |
| `src/diagnostics/triage-doc.ts`           | Render `docs/dev/mcp-failure-triage.md` from diagnosed clusters              | 3     |
| `src/diagnostics/linear-filer.ts`         | Guardrailed auto-Linear (cap guard, fingerprint dedup, per-run limit)        | 4     |
| `scripts/diagnose-failures.ts`            | Tier-1 driver orchestrating all of the above                                 | 3,4   |
| `.claude/agents/mcp-failure-diagnoser.md` | LLM agent for residual non-deterministic clusters                            | 3     |
| `.claude/settings.local.json`             | Tier-2 PostToolUse marker hook (gitignored)                                  | 5     |
| `docs/dev/mcp-failure-diagnosis.md`       | Operator doc incl. the untracked `~/bin` scheduling wrapper recipe           | 5     |
| `tests/unit/diagnostics/*.test.ts`        | Unit + golden tests per module                                               | all   |

Each `src/diagnostics/*.ts` file is pure/side-effect-free except `ledger.ts` (fs), `linear-filer.ts` (Linear calls —
injected, mockable), and the driver.

---

## Phase 1 — `failure-clustering` module (independently shippable; behavior-preserving for `npm run analyze-failures`)

### Task 1: Failure-log types + tolerant parser

**Files:**

- Create: `src/diagnostics/failure-log.ts`
- Test: `tests/unit/diagnostics/failure-log.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/diagnostics/failure-log.test.ts
import { describe, it, expect } from 'vitest';
import { parseFailureLog } from '../../../src/diagnostics/failure-log.js';

describe('parseFailureLog', () => {
  it('parses valid JSONL lines into FailureRecord[]', () => {
    const jsonl = [
      JSON.stringify({
        timestamp: '2026-05-18T10:00:00.000Z',
        tool: 'omnifocus_write',
        errorType: 'VALIDATION_ERROR',
        errorMessage: 'name: Required',
        inputArgs: { x: 1 },
        schemaDescription: 'd',
      }),
      JSON.stringify({
        timestamp: '2026-05-18T10:01:00.000Z',
        tool: 'omnifocus_read',
        errorType: 'EXECUTION_ERROR',
        errorMessage: 'boom',
        inputArgs: {},
        schemaDescription: 'd',
        categorization: { errorType: 'INVALID_ID', severity: 'low', recoverable: true },
      }),
    ].join('\n');
    const recs = parseFailureLog(jsonl);
    expect(recs).toHaveLength(2);
    expect(recs[0].tool).toBe('omnifocus_write');
    expect(recs[1].categorization?.errorType).toBe('INVALID_ID');
  });

  it('skips malformed lines and blank lines without throwing', () => {
    const jsonl =
      'not json\n\n' +
      JSON.stringify({
        timestamp: '2026-05-18T10:00:00.000Z',
        tool: 't',
        errorType: 'EXECUTION_ERROR',
        errorMessage: 'e',
        inputArgs: {},
        schemaDescription: 'd',
      });
    const recs = parseFailureLog(jsonl);
    expect(recs).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npx vitest tests/unit/diagnostics/failure-log.test.ts --run` Expected: FAIL — cannot resolve
`src/diagnostics/failure-log.js`.

- [ ] **Step 3: Implement**

```typescript
// src/diagnostics/failure-log.ts
export interface FailureCategorization {
  errorType: string;
  severity?: string;
  recoverable?: boolean;
  actionable?: string;
  context?: Record<string, unknown>;
}

export interface FailureRecord {
  timestamp: string;
  tool: string;
  // Usually 'VALIDATION_ERROR' | 'EXECUTION_ERROR', but base.ts:303/639 can also write a raw
  // ScriptErrorType string. Keep it `string`; classification keys off `categorization.errorType`.
  errorType: string;
  errorMessage: string;
  validationErrors?: Array<{ path?: (string | number)[]; message?: string }>;
  inputArgs: unknown; // already redacted upstream by redactArgs()
  schemaDescription: string;
  categorization?: FailureCategorization;
}

/** Tolerant line-delimited-JSON parse. Never throws; skips malformed/blank lines. */
export function parseFailureLog(jsonl: string): FailureRecord[] {
  const out: FailureRecord[] = [];
  for (const line of jsonl.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed.tool === 'string' && typeof parsed.errorMessage === 'string') {
        out.push(parsed as FailureRecord);
      }
    } catch {
      // skip malformed line by design
    }
  }
  return out;
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npx vitest tests/unit/diagnostics/failure-log.test.ts --run` Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/diagnostics/failure-log.ts tests/unit/diagnostics/failure-log.test.ts
git commit -m "feat(OMN-37): failure-log types + tolerant JSONL parser"
```

---

### Task 2: Normalization (extract the CLI's regex, do not duplicate)

**Files:**

- Create: `src/diagnostics/normalize.ts`
- Test: `tests/unit/diagnostics/normalize.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/diagnostics/normalize.test.ts
import { describe, it, expect } from 'vitest';
import { normalizeErrorMessage, normalizeInputShape } from '../../../src/diagnostics/normalize.js';

describe('normalizeErrorMessage', () => {
  it('replaces hex IDs and ISO dates with placeholders and truncates to 100 chars', () => {
    expect(normalizeErrorMessage('task a1b2c3d4e5 not found on 2026-05-18')).toBe('task ID not found on DATE');
    expect(normalizeErrorMessage('x'.repeat(200)).length).toBe(100);
  });
});

describe('normalizeInputShape', () => {
  it('produces a stable shape string keyed by sorted top-level keys, not values', () => {
    expect(normalizeInputShape({ b: 2, a: 'hello' })).toBe(normalizeInputShape({ a: 'world', b: 99 }));
    expect(normalizeInputShape({ a: 1 })).not.toBe(normalizeInputShape({ a: 1, c: 2 }));
  });
  it('handles non-object inputs', () => {
    expect(normalizeInputShape(null)).toBe('<non-object>');
    expect(normalizeInputShape('str')).toBe('<non-object>');
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npx vitest tests/unit/diagnostics/normalize.test.ts --run` Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
// src/diagnostics/normalize.ts

/** Extracted verbatim from scripts/analyze-tool-failures.ts:119-122 (the canonical normalization). */
export function normalizeErrorMessage(errorMessage: string): string {
  return errorMessage
    .replace(/[0-9a-f]{8,}/gi, 'ID')
    .replace(/\d{4}-\d{2}-\d{2}/g, 'DATE')
    .substring(0, 100);
}

/** Structural fingerprint of the input: sorted top-level key names only (never values — values are PII-redacted but still volatile). */
export function normalizeInputShape(inputArgs: unknown): string {
  if (inputArgs === null || typeof inputArgs !== 'object' || Array.isArray(inputArgs)) {
    return '<non-object>';
  }
  return Object.keys(inputArgs as Record<string, unknown>)
    .sort()
    .join(',');
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npx vitest tests/unit/diagnostics/normalize.test.ts --run` Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/diagnostics/normalize.ts tests/unit/diagnostics/normalize.test.ts
git commit -m "feat(OMN-37): extract failure-message + input-shape normalization"
```

---

### Task 3: Clustering with threshold + stable fingerprint

**Files:**

- Create: `src/diagnostics/clustering.ts`
- Test: `tests/unit/diagnostics/clustering.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/diagnostics/clustering.test.ts
import { describe, it, expect } from 'vitest';
import { clusterFailures } from '../../../src/diagnostics/clustering.js';
import type { FailureRecord } from '../../../src/diagnostics/failure-log.js';

const rec = (over: Partial<FailureRecord>): FailureRecord => ({
  timestamp: '2026-05-18T10:00:00.000Z',
  tool: 'omnifocus_write',
  errorType: 'VALIDATION_ERROR',
  errorMessage: 'name: Required',
  inputArgs: { name: 1 },
  schemaDescription: 'd',
  ...over,
});

describe('clusterFailures', () => {
  it('groups by (tool, normalizedError, inputShape) and assigns a stable fingerprint', () => {
    const clusters = clusterFailures([rec({}), rec({ inputArgs: { name: 2 } }), rec({})], {
      minOccurrences: 1,
      minSpanDays: 999,
    });
    expect(clusters).toHaveLength(1);
    expect(clusters[0].count).toBe(3);
    expect(clusters[0].fingerprint).toMatch(/^[0-9a-f]{16}$/);
  });

  it('escalates a cluster with count >= minOccurrences', () => {
    const recs = [rec({}), rec({}), rec({})];
    const [c] = clusterFailures(recs, { minOccurrences: 3, minSpanDays: 999 });
    expect(c.escalated).toBe(true);
  });

  it('escalates a low-count cluster that spans >= minSpanDays', () => {
    const recs = [rec({ timestamp: '2026-05-10T10:00:00.000Z' }), rec({ timestamp: '2026-05-18T10:00:00.000Z' })];
    const [c] = clusterFailures(recs, { minOccurrences: 99, minSpanDays: 2 });
    expect(c.escalated).toBe(true);
    expect(c.count).toBe(2);
  });

  it('does not escalate a fresh low-count cluster', () => {
    const [c] = clusterFailures([rec({}), rec({})], { minOccurrences: 3, minSpanDays: 2 });
    expect(c.escalated).toBe(false);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npx vitest tests/unit/diagnostics/clustering.test.ts --run` Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
// src/diagnostics/clustering.ts
import { createHash } from 'crypto';
import type { FailureRecord } from './failure-log.js';
import { normalizeErrorMessage, normalizeInputShape } from './normalize.js';

export interface ClusterOptions {
  minOccurrences: number; // default 3
  minSpanDays: number; // default 2
}

export interface FailureCluster {
  fingerprint: string;
  tool: string;
  normalizedError: string;
  inputShape: string;
  count: number;
  firstSeen: string;
  lastSeen: string;
  escalated: boolean;
  example: FailureRecord; // first occurrence (inputArgs already redacted)
}

export function fingerprintOf(tool: string, normalizedError: string, inputShape: string): string {
  return createHash('sha256').update(`${tool} ${normalizedError} ${inputShape}`).digest('hex').slice(0, 16);
}

export function clusterFailures(records: FailureRecord[], opts: ClusterOptions): FailureCluster[] {
  const map = new Map<string, FailureCluster>();
  for (const r of records) {
    const normalizedError = normalizeErrorMessage(r.errorMessage);
    const inputShape = normalizeInputShape(r.inputArgs);
    const fp = fingerprintOf(r.tool, normalizedError, inputShape);
    const existing = map.get(fp);
    if (!existing) {
      map.set(fp, {
        fingerprint: fp,
        tool: r.tool,
        normalizedError,
        inputShape,
        count: 1,
        firstSeen: r.timestamp,
        lastSeen: r.timestamp,
        escalated: false,
        example: r,
      });
    } else {
      existing.count++;
      if (r.timestamp < existing.firstSeen) existing.firstSeen = r.timestamp;
      if (r.timestamp > existing.lastSeen) existing.lastSeen = r.timestamp;
    }
  }
  const DAY = 86_400_000;
  for (const c of map.values()) {
    const spanDays = (Date.parse(c.lastSeen) - Date.parse(c.firstSeen)) / DAY;
    c.escalated = c.count >= opts.minOccurrences || spanDays >= opts.minSpanDays;
  }
  return [...map.values()];
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npx vitest tests/unit/diagnostics/clustering.test.ts --run` Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/diagnostics/clustering.ts tests/unit/diagnostics/clustering.test.ts
git commit -m "feat(OMN-37): cluster failures with threshold + stable fingerprint"
```

---

### Task 4: `classifyCluster` + ignore-set

**Files:**

- Modify: `src/diagnostics/clustering.ts` (append `classifyCluster`)
- Test: `tests/unit/diagnostics/classify.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/diagnostics/classify.test.ts
import { describe, it, expect } from 'vitest';
import { classifyCluster, isIgnored } from '../../../src/diagnostics/clustering.js';
import type { FailureCluster } from '../../../src/diagnostics/clustering.js';

const cluster = (over: Partial<FailureCluster>): FailureCluster => ({
  fingerprint: 'abc',
  tool: 't',
  normalizedError: 'e',
  inputShape: 'a',
  count: 5,
  firstSeen: '',
  lastSeen: '',
  escalated: true,
  example: {
    timestamp: '',
    tool: 't',
    errorType: 'VALIDATION_ERROR',
    errorMessage: 'e',
    inputArgs: {},
    schemaDescription: 'd',
  },
  ...over,
});

describe('isIgnored', () => {
  it('ignores data/infra noise classes', () => {
    for (const t of ['INVALID_ID', 'NULL_RESULT', 'OMNIFOCUS_NOT_RUNNING', 'SCRIPT_TIMEOUT', 'CONNECTION_TIMEOUT']) {
      expect(isIgnored(cluster({ example: { ...cluster({}).example, categorization: { errorType: t } } }))).toBe(true);
    }
  });
  it('does not ignore validation errors', () => {
    expect(isIgnored(cluster({}))).toBe(false);
  });
});

describe('classifyCluster', () => {
  it('classifies a Zod validation cluster as VALIDATION (candidate for drift/coercion/description)', () => {
    expect(classifyCluster(cluster({}))).toBe('VALIDATION');
  });
  it('classifies an ignored cluster as DATA_ERROR', () => {
    const c = cluster({
      example: { ...cluster({}).example, errorType: 'EXECUTION_ERROR', categorization: { errorType: 'INVALID_ID' } },
    });
    expect(classifyCluster(c)).toBe('DATA_ERROR');
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npx vitest tests/unit/diagnostics/classify.test.ts --run` Expected: FAIL — `classifyCluster`/`isIgnored` not
exported.

- [ ] **Step 3: Implement (append to `src/diagnostics/clustering.ts`)**

```typescript
const IGNORE_SET = new Set([
  'INVALID_ID',
  'NULL_RESULT',
  'OMNIFOCUS_NOT_RUNNING',
  'SCRIPT_TIMEOUT',
  'CONNECTION_TIMEOUT',
]);

export function isIgnored(c: FailureCluster): boolean {
  const cat = c.example.categorization?.errorType;
  return cat !== undefined && IGNORE_SET.has(cat);
}

export type CoarseClass = 'VALIDATION' | 'EXECUTION' | 'DATA_ERROR';

/** Coarse pre-classification. The fine SCHEMA_DRIFT/COERCION/DESCRIPTION split happens in the driver
 *  (deterministic via schema-drift) or the LLM agent (residual). */
export function classifyCluster(c: FailureCluster): CoarseClass {
  if (isIgnored(c)) return 'DATA_ERROR';
  return c.example.errorType === 'VALIDATION_ERROR' ? 'VALIDATION' : 'EXECUTION';
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npx vitest tests/unit/diagnostics/classify.test.ts --run` Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/diagnostics/clustering.ts tests/unit/diagnostics/classify.test.ts
git commit -m "feat(OMN-37): coarse cluster classification + ignore-set"
```

---

### Task 5: Refactor `analyze-tool-failures.ts` onto the module (golden test first)

**Files:**

- Create: `tests/unit/diagnostics/analyze-cli-golden.test.ts`
- Modify: `scripts/analyze-tool-failures.ts` (replace inline parse + normalization with module imports; **CLI stdout
  unchanged**)

- [ ] **Step 1: Write the golden test that pins CURRENT output BEFORE refactor**

```typescript
// tests/unit/diagnostics/analyze-cli-golden.test.ts
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import { mkdtempSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir, homedir } from 'os';
import { join } from 'path';

// Drives the CLI against a fixture HOME so output is deterministic.
function runCli(homeOverride: string): string {
  return execFileSync('npx', ['tsx', 'scripts/analyze-tool-failures.ts', '--days=3650'], {
    env: { ...process.env, HOME: homeOverride },
    encoding: 'utf-8',
  });
}

describe('analyze-failures CLI output is behavior-preserving', () => {
  it('produces identical output before/after the module refactor (golden)', () => {
    const home = mkdtempSync(join(tmpdir(), 'omn37-'));
    const dir = join(home, '.omnifocus-mcp', 'tool-failures');
    mkdirSync(dir, { recursive: true });
    const rows = [
      {
        timestamp: '2026-05-18T10:00:00.000Z',
        tool: 'omnifocus_write',
        errorType: 'VALIDATION_ERROR',
        errorMessage: 'name: Required for task a1b2c3d4e5',
        validationErrors: [{ path: ['name'], message: 'Required' }],
        inputArgs: { flagged: true },
        schemaDescription: 'd',
      },
      {
        timestamp: '2026-05-18T11:00:00.000Z',
        tool: 'omnifocus_write',
        errorType: 'VALIDATION_ERROR',
        errorMessage: 'name: Required for task f9e8d7c6b5',
        validationErrors: [{ path: ['name'], message: 'Required' }],
        inputArgs: { flagged: false },
        schemaDescription: 'd',
      },
    ];
    writeFileSync(join(dir, 'failures-2026-05-18.jsonl'), rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
    expect(runCli(home)).toMatchSnapshot();
  });
});
```

- [ ] **Step 2: Run to capture the snapshot against the UNMODIFIED script**

Run: `npx vitest tests/unit/diagnostics/analyze-cli-golden.test.ts --run` Expected: PASS — snapshot written
(`__snapshots__/analyze-cli-golden.test.ts.snap`). This snapshot is the contract.

- [ ] **Step 3: Refactor the script to consume the module (no output change)**

Replace the inline `JSON.parse` loop with `parseFailureLog`, and the inline `simpleError` regex (lines ≈119–122) with
`normalizeErrorMessage` from `src/diagnostics/normalize.js`. Keep all `console.log` formatting, the `FailureStats`
aggregation, sorting, recommendations, and arg parsing exactly as-is. Concretely:

- Add imports: `import { parseFailureLog } from '../src/diagnostics/failure-log.js';` and
  `import { normalizeErrorMessage } from '../src/diagnostics/normalize.js';`
- Replace lines ≈59–82 (manual per-file `JSON.parse`/`try`) with: read each file's content, `parseFailureLog(content)`,
  then `if (!specificTool || entry.tool === specificTool) failures.push(entry)`.
- Replace the `const simpleError = failure.errorMessage.replace(...).replace(...).substring(0,100)` with
  `const simpleError = normalizeErrorMessage(failure.errorMessage);`.

- [ ] **Step 4: Run the golden test — output MUST be byte-identical**

Run: `npx vitest tests/unit/diagnostics/analyze-cli-golden.test.ts --run` Expected: PASS with **no snapshot diff**. If
the snapshot differs, the refactor changed behavior — revert and fix until identical.

- [ ] **Step 5: Run full unit suite + commit**

Run: `npm run test:unit` Expected: PASS (all existing + new diagnostics tests).

```bash
git add scripts/analyze-tool-failures.ts tests/unit/diagnostics/analyze-cli-golden.test.ts tests/unit/diagnostics/__snapshots__
git commit -m "refactor(OMN-37): analyze-failures consumes shared clustering module (behavior-preserving)"
```

**Phase 1 ships here** — `npm run analyze-failures` unchanged; module reusable.

---

## Phase 2 — Schema-drift checker (highest standalone value; CI-failing)

### Task 6: `canonicalizeInputSchema`

**Files:**

- Create: `src/diagnostics/schema-drift.ts`
- Test: `tests/unit/diagnostics/schema-drift.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/diagnostics/schema-drift.test.ts
import { describe, it, expect } from 'vitest';
import { canonicalizeInputSchema } from '../../../src/diagnostics/schema-drift.js';

describe('canonicalizeInputSchema', () => {
  it('flattens a flat advertised JSON schema (system tool — no wrapper)', () => {
    const adv = {
      type: 'object',
      properties: {
        operation: { type: 'string', enum: ['version', 'cache'] },
        limit: { type: 'number' },
      },
      required: ['operation'],
    };
    const c = canonicalizeInputSchema(adv); // wrapperKey omitted
    expect(c.operation).toEqual({ type: 'string', required: true, enum: ['version', 'cache'] });
    expect(c.limit).toEqual({ type: 'number', required: false, enum: undefined });
  });

  it('descends into a single wrapper key (read/write/analyze nest real fields under query/mutation/analysis)', () => {
    // Mirrors OmniFocusReadTool.inputSchema: { properties: { query: { properties: {...}, required: ['type'] } } }
    const adv = {
      type: 'object',
      properties: {
        query: {
          type: 'object',
          properties: { type: { type: 'string', enum: ['tasks', 'projects'] }, limit: { type: 'number' } },
          required: ['type'],
        },
      },
      required: ['query'],
    };
    const c = canonicalizeInputSchema(adv, 'query');
    expect(c.type).toEqual({ type: 'string', required: true, enum: ['tasks', 'projects'] });
    expect(c.limit).toEqual({ type: 'number', required: false, enum: undefined });
    expect(c.query).toBeUndefined(); // the wrapper itself is not a field
  });
});
```

- [ ] **Step 2: Run, verify fail.** `npx vitest tests/unit/diagnostics/schema-drift.test.ts --run` → FAIL (module not
      found).

- [ ] **Step 3: Implement**

```typescript
// src/diagnostics/schema-drift.ts
export interface CanonicalField {
  type: string;
  required: boolean;
  enum?: (string | number)[];
  coercible?: boolean; // only meaningful for the Zod side
}
export type CanonicalSchema = Record<string, CanonicalField>;

type JsonSchemaNode = {
  type?: string;
  enum?: (string | number)[];
  properties?: Record<string, JsonSchemaNode>;
  required?: string[];
};

/**
 * Canonicalize the advertised JSON schema.
 * @param wrapperKey  For read/write/analyze the real fields are nested one level under a single
 *                     wrapper property ('query' | 'mutation' | 'analysis'). Pass it to descend.
 *                     Omit for flat schemas (the `system` tool).
 */
export function canonicalizeInputSchema(advertised: Record<string, unknown>, wrapperKey?: string): CanonicalSchema {
  let node = advertised as JsonSchemaNode;
  if (wrapperKey) {
    const wrapped = node.properties?.[wrapperKey];
    if (!wrapped)
      throw new Error(`canonicalizeInputSchema: wrapper key '${wrapperKey}' not found in advertised schema`);
    node = wrapped;
  }
  const props = node.properties ?? {};
  const required = new Set(node.required ?? []);
  const out: CanonicalSchema = {};
  for (const [name, def] of Object.entries(props)) {
    out[name] = { type: def.type ?? 'unknown', required: required.has(name), enum: def.enum };
  }
  return out;
}
```

- [ ] **Step 4: Run, verify pass.** Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add src/diagnostics/schema-drift.ts tests/unit/diagnostics/schema-drift.test.ts
git commit -m "feat(OMN-37): canonicalize advertised inputSchema"
```

---

### Task 7: `canonicalizeZodSchema` with behavioral coercibility probe

**Files:**

- Modify: `src/diagnostics/schema-drift.ts`
- Modify: `tests/unit/diagnostics/schema-drift.test.ts`

- [ ] **Step 1: Add the failing test**

```typescript
import { z } from 'zod';
import { canonicalizeZodSchema } from '../../../src/diagnostics/schema-drift.js';

describe('canonicalizeZodSchema', () => {
  it('marks z.coerce.number() fields coercible and bare z.number() non-coercible (behavioral probe, not syntactic)', () => {
    const schema = z.object({
      a: z.coerce.number(),
      b: z.number(),
      mode: z.enum(['x', 'y']),
      note: z.string().optional(),
    });
    const c = canonicalizeZodSchema(schema);
    // NOTE: `coercible` is only meaningful for NUMERIC fields. A non-numeric optional like
    // `note` also probes coercible=true (z.string().optional().safeParse('5') succeeds); that
    // is harmless because diffSchemas only consults `coercible` when advertised type==='number'.
    expect(c.a.coercible).toBe(true); // z.coerce.number().safeParse('5') succeeds
    expect(c.b.coercible).toBe(false); // z.number().safeParse('5') fails
    expect(c.mode.enum).toEqual(['x', 'y']);
    expect(c.note.required).toBe(false);
  });

  it('descends a single wrapper key whose inner is z.preprocess(...) over a discriminatedUnion (the real read/write/analyze shape)', () => {
    // Mirrors ReadSchema = z.object({ query: coerceObject(QuerySchema) }),
    // QuerySchema = z.discriminatedUnion('type', [...]). coerceObject = z.preprocess(fn, inner).
    const coerceObject = <T extends z.ZodTypeAny>(s: T) => z.preprocess((v) => v, s);
    const QuerySchema = z.discriminatedUnion('type', [
      z.object({ type: z.literal('tasks'), limit: z.coerce.number().optional(), flagged: z.boolean().optional() }),
      z.object({ type: z.literal('projects'), limit: z.coerce.number().optional() }),
    ]);
    const ReadSchema = z.object({ query: coerceObject(QuerySchema) });

    const c = canonicalizeZodSchema(ReadSchema, 'query');
    // Discriminator: union of member literal values.
    expect(c.type.enum?.sort()).toEqual(['projects', 'tasks']);
    expect(c.type.required).toBe(true); // required in every member
    // limit present in all members -> required iff required in all (it's optional -> not required), and coercible.
    expect(c.limit.coercible).toBe(true);
    expect(c.limit.required).toBe(false);
    // flagged present in only ONE member -> not required (absent from a member counts as not-required).
    expect(c.flagged.required).toBe(false);
  });
});
```

- [ ] **Step 2: Run, verify fail** — `canonicalizeZodSchema` not exported.

- [ ] **Step 3: Implement (append). The coercibility check is a RUNTIME PROBE — never pattern-match source (see plan Key
      Facts).**

```typescript
import { z } from 'zod';

type ZDef = {
  typeName?: string;
  schema?: z.ZodTypeAny; // ZodEffects (z.preprocess / z.transform)
  innerType?: z.ZodTypeAny; // ZodOptional / ZodDefault / ZodNullable
  values?: unknown[]; // ZodEnum
  value?: unknown; // ZodLiteral
  discriminator?: string; // ZodDiscriminatedUnion
  options?: Map<unknown, z.ZodTypeAny> | z.ZodTypeAny[]; // ZodDiscriminatedUnion members
};
const defOf = (s: z.ZodTypeAny): ZDef => (s as unknown as { _def: ZDef })._def;

/** Peel ZodEffects (preprocess/transform — this is what coerceObject is), Optional, Default, Nullable. */
function unwrap(s: z.ZodTypeAny): z.ZodTypeAny {
  let cur = s;
  for (;;) {
    const d = defOf(cur);
    if (d.typeName === 'ZodEffects' && d.schema) cur = d.schema;
    else if (
      (d.typeName === 'ZodOptional' || d.typeName === 'ZodDefault' || d.typeName === 'ZodNullable') &&
      d.innerType
    )
      cur = d.innerType;
    else return cur;
  }
}

function isCoercibleNumber(field: z.ZodTypeAny): boolean {
  // Behavioral probe — NEVER pattern-match source. A number field is "coercible" iff a stringified
  // number survives validation. Catches z.coerce.number(), z.preprocess(...), z.union([...]) alike.
  return field.safeParse('5').success;
}

function fieldType(field: z.ZodTypeAny): { type: string; enum?: (string | number)[] } {
  const inner = unwrap(field);
  const d = defOf(inner);
  if (d.typeName === 'ZodEnum') return { type: 'string', enum: d.values as (string | number)[] };
  if (d.typeName === 'ZodLiteral')
    return { type: typeof d.value === 'number' ? 'number' : 'string', enum: [d.value as string | number] };
  if (d.typeName === 'ZodNumber') return { type: 'number' };
  if (d.typeName === 'ZodBoolean') return { type: 'boolean' };
  if (d.typeName === 'ZodString') return { type: 'string' };
  return { type: 'object' };
}

function membersOf(du: z.ZodTypeAny): z.ZodTypeAny[] {
  const opts = defOf(du).options;
  if (!opts) return [];
  return Array.isArray(opts) ? opts : [...opts.values()];
}

/** Merge object/discriminated-union members into one CanonicalSchema.
 *  required(field) := present AND required in EVERY member (absence in any member ⇒ not required).
 *  enum/coercible := unioned across members (discriminator literal values collapse to one enum). */
function mergeShapes(members: z.ZodTypeAny[]): CanonicalSchema {
  const out: CanonicalSchema = {};
  const presentCount: Record<string, number> = {};
  for (const m of members) {
    const shape = (unwrap(m) as z.ZodObject<z.ZodRawShape>).shape ?? {};
    for (const [name, raw] of Object.entries(shape)) {
      const field = raw as z.ZodTypeAny;
      presentCount[name] = (presentCount[name] ?? 0) + 1;
      const required = !(field.isOptional?.() ?? false);
      const probe = isCoercibleNumber(field);
      const { type, enum: en } = fieldType(field);
      const prev = out[name];
      const mergedEnum = [...new Set([...(prev?.enum ?? []), ...(en ?? [])])];
      out[name] = {
        type: prev?.type ?? type,
        required: prev ? prev.required && required : required,
        enum: mergedEnum.length ? mergedEnum : undefined,
        coercible: (prev?.coercible ?? false) || probe,
      };
    }
  }
  // A field absent from any member cannot be globally required.
  for (const [name, f] of Object.entries(out)) {
    if (presentCount[name] !== members.length) f.required = false;
  }
  return out;
}

/**
 * Canonicalize a tool's Zod schema.
 * @param wrapperKey  read/write/analyze wrap the real schema under one key
 *                     ('query'|'mutation'|'analysis') via coerceObject (= z.preprocess) over a
 *                     z.discriminatedUnion. Pass it to descend. Omit for the flat `system` schema.
 */
export function canonicalizeZodSchema(schema: z.ZodTypeAny, wrapperKey?: string): CanonicalSchema {
  const top = unwrap(schema) as z.ZodObject<z.ZodRawShape>;
  let target: z.ZodTypeAny = top;
  if (wrapperKey) {
    const wrapped = top.shape?.[wrapperKey];
    if (!wrapped) throw new Error(`canonicalizeZodSchema: wrapper key '${wrapperKey}' not found`);
    target = unwrap(wrapped); // peels coerceObject's z.preprocess → inner discriminatedUnion/object
  }
  const td = defOf(target);
  if (td.typeName === 'ZodDiscriminatedUnion' || td.typeName === 'ZodUnion') {
    return mergeShapes(membersOf(target));
  }
  // Plain object (system tool, or a non-union wrapper).
  return mergeShapes([target]);
}
```

- [ ] **Step 4: Run, verify pass.** Expected: PASS (both tests, incl. the discriminated-union case). If `fieldType`
      mis-detects on the real schemas, fix the `_def.typeName` mapping — but the behavioral probe (`isCoercibleNumber`)
      and the unwrap/merge structure are load-bearing and must not be replaced by source pattern-matching.
- [ ] **Step 5: Commit**

```bash
git add src/diagnostics/schema-drift.ts tests/unit/diagnostics/schema-drift.test.ts
git commit -m "feat(OMN-37): canonicalize Zod schema with behavioral coercibility probe"
```

---

### Task 8: `diffSchemas` → `DriftFinding[]`

**Files:**

- Modify: `src/diagnostics/schema-drift.ts`
- Modify: `tests/unit/diagnostics/schema-drift.test.ts`

- [ ] **Step 1: Add the failing test**

```typescript
import { diffSchemas } from '../../../src/diagnostics/schema-drift.js';

describe('diffSchemas', () => {
  it('reports FIELD_MISSING, ENUM_MISMATCH, REQUIRED_MISMATCH, COERCION_GAP', () => {
    const advertised = canonicalizeInputSchema({
      type: 'object',
      properties: { mode: { type: 'string', enum: ['a', 'b'] }, limit: { type: 'number' }, ghost: { type: 'string' } },
      required: ['mode'],
    });
    const zod = canonicalizeZodSchema(
      z.object({
        mode: z.enum(['a']), // ENUM_MISMATCH (b advertised, not validated)
        limit: z.number(), // COERCION_GAP (advertised numeric, not coercible)
        extra: z.string(), // advertised-missing (validated field never advertised)
      }),
    );
    const findings = diffSchemas(advertised, zod);
    const kinds = findings.map((f) => f.kind).sort();
    expect(kinds).toContain('FIELD_MISSING'); // ghost advertised, not validated
    expect(kinds).toContain('FIELD_MISSING'); // extra validated, not advertised
    expect(kinds).toContain('ENUM_MISMATCH');
    expect(kinds).toContain('COERCION_GAP');
  });

  it('returns [] for an aligned schema (no false positives on coerced numerics)', () => {
    const advertised = canonicalizeInputSchema({
      type: 'object',
      properties: { limit: { type: 'number' } },
      required: [],
    });
    const zod = canonicalizeZodSchema(z.object({ limit: z.coerce.number().optional() }));
    expect(diffSchemas(advertised, zod)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement (append)**

```typescript
export type DriftKind = 'FIELD_MISSING' | 'ENUM_MISMATCH' | 'REQUIRED_MISMATCH' | 'COERCION_GAP';
export interface DriftFinding {
  kind: DriftKind;
  field: string;
  detail: string;
}

export function diffSchemas(advertised: CanonicalSchema, zod: CanonicalSchema): DriftFinding[] {
  const findings: DriftFinding[] = [];
  const fields = new Set([...Object.keys(advertised), ...Object.keys(zod)]);
  for (const f of fields) {
    const a = advertised[f];
    const z = zod[f];
    if (a && !z) {
      findings.push({ kind: 'FIELD_MISSING', field: f, detail: 'advertised to LLM but not validated by Zod' });
      continue;
    }
    if (!a && z) {
      findings.push({ kind: 'FIELD_MISSING', field: f, detail: 'validated by Zod but never advertised to LLM' });
      continue;
    }
    if (!a || !z) continue;
    if (a.enum && z.enum && JSON.stringify([...a.enum].sort()) !== JSON.stringify([...z.enum].sort())) {
      findings.push({ kind: 'ENUM_MISMATCH', field: f, detail: `advertised [${a.enum}] vs validated [${z.enum}]` });
    }
    if (a.required !== z.required) {
      findings.push({
        kind: 'REQUIRED_MISMATCH',
        field: f,
        detail: `advertised required=${a.required} vs validated required=${z.required}`,
      });
    }
    if (a.type === 'number' && z.coercible === false) {
      findings.push({
        kind: 'COERCION_GAP',
        field: f,
        detail: 'advertised numeric but Zod rejects stringified input (Claude Desktop stringifies all params)',
      });
    }
  }
  return findings;
}
```

- [ ] **Step 4: Run, verify pass.** Expected: PASS (both tests).
- [ ] **Step 5: Commit**

```bash
git add src/diagnostics/schema-drift.ts tests/unit/diagnostics/schema-drift.test.ts
git commit -m "feat(OMN-37): diffSchemas drift findings (field/enum/required/coercion)"
```

---

### Task 9: Tool-schema registry + CI-failing drift test for all 4 tools

**Files:**

- Create: `src/diagnostics/tool-schema-registry.ts`
- Create: `tests/unit/diagnostics/schema-drift-tools.test.ts`

- [ ] **Step 1: Write the test (this is the CI gate)**

```typescript
// tests/unit/diagnostics/schema-drift-tools.test.ts
import { describe, it, expect } from 'vitest';
import { TOOL_SCHEMA_REGISTRY } from '../../../src/diagnostics/tool-schema-registry.js';
import { canonicalizeInputSchema, canonicalizeZodSchema, diffSchemas } from '../../../src/diagnostics/schema-drift.js';

describe('inputSchema <-> Zod drift gate (fails CI on drift)', () => {
  for (const entry of TOOL_SCHEMA_REGISTRY) {
    it(`${entry.name}: advertised schema matches Zod validation`, () => {
      const findings = diffSchemas(
        canonicalizeInputSchema(entry.getInputSchema(), entry.wrapperKey),
        canonicalizeZodSchema(entry.zodSchema, entry.wrapperKey),
      );
      // Some advertised-vs-validated asymmetry is intentional (compact advertised schema).
      // The gate fails ONLY on the high-signal kinds: enum/required/coercion drift.
      const blocking = findings.filter((f) => f.kind !== 'FIELD_MISSING');
      expect(blocking, `${entry.name} drift: ${JSON.stringify(findings, null, 2)}`).toEqual([]);
    });
  }
});
```

- [ ] **Step 2: Run, verify fail** — registry not found.

- [ ] **Step 3: Implement the registry**

```typescript
// src/diagnostics/tool-schema-registry.ts
import type { z } from 'zod';
import { CacheManager } from '../cache/CacheManager.js';
import { SystemTool } from '../tools/system/SystemTool.js';
import { OmniFocusReadTool } from '../tools/unified/OmniFocusReadTool.js';
import { OmniFocusWriteTool } from '../tools/unified/OmniFocusWriteTool.js';
import { OmniFocusAnalyzeTool } from '../tools/unified/OmniFocusAnalyzeTool.js';

export interface ToolSchemaEntry {
  name: string;
  /** Single nesting key for read/write/analyze; undefined for the flat `system` schema. */
  wrapperKey?: 'query' | 'mutation' | 'analysis';
  getInputSchema: () => Record<string, unknown>;
  zodSchema: z.ZodTypeAny;
}

// Every BaseTool subclass exposes its Zod schema as a public instance property `schema`
// (SystemTool.ts:93 `schema = SystemToolSchema`; OmniFocusReadTool.ts:205 `schema = ReadSchema`;
// Write:164 `schema = WriteSchema`; Analyze:300 `schema = AnalyzeSchema`). Reading the instance
// property avoids importing non-exported symbols (SystemToolSchema is a non-exported const) and
// needs zero source edits.
const cache = new CacheManager();
const sys = new SystemTool(cache);
const read = new OmniFocusReadTool(cache);
const write = new OmniFocusWriteTool(cache);
const analyze = new OmniFocusAnalyzeTool(cache);

export const TOOL_SCHEMA_REGISTRY: ToolSchemaEntry[] = [
  { name: 'system', getInputSchema: () => sys.inputSchema, zodSchema: sys.schema },
  { name: 'omnifocus_read', wrapperKey: 'query', getInputSchema: () => read.inputSchema, zodSchema: read.schema },
  { name: 'omnifocus_write', wrapperKey: 'mutation', getInputSchema: () => write.inputSchema, zodSchema: write.schema },
  {
    name: 'omnifocus_analyze',
    wrapperKey: 'analysis',
    getInputSchema: () => analyze.inputSchema,
    zodSchema: analyze.schema,
  },
];
```

> **Implementer note (verified on `2ce9255`):** the four schemas have two distinct shapes, both handled by Tasks 6–7:
>
> | Tool                | Zod schema (instance `.schema`)                                                                                                 | Advertised `inputSchema`                                                     | `wrapperKey` |
> | ------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------ |
> | `system`            | `SystemToolSchema` — flat `z.object({...})`                                                                                     | flat `properties`                                                            | — (none)     |
> | `omnifocus_read`    | `ReadSchema = z.object({ query: coerceObject(QuerySchema) })`, `QuerySchema = z.discriminatedUnion('type', […])`                | fields nested under `properties.query.properties`, inner `required:['type']` | `'query'`    |
> | `omnifocus_write`   | `WriteSchema = z.object({ mutation: coerceObject(MutationSchema) })`, `MutationSchema = z.discriminatedUnion('operation', […])` | nested under `properties.mutation`                                           | `'mutation'` |
> | `omnifocus_analyze` | `AnalyzeSchema = z.object({ analysis: coerceObject(AnalysisSchema) })`, `AnalysisSchema = z.discriminatedUnion('type', […])`    | nested under `properties.analysis`                                           | `'analysis'` |
>
> `coerceObject(x)` is `z.preprocess(fn, x)` (`src/tools/schemas/coercion-helpers.ts:35`) → a `ZodEffects`, which
> `unwrap()` (Task 7) peels to reach the inner `z.discriminatedUnion`. `mergeShapes` then unions the
> per-`operation`/`type` member shapes, collapsing each discriminator's literals into one enum and treating a field as
> required only if required in **every** member. This is NOT a `discriminatedUnion`-at-top-level case and there is NO
> viable "scope to system + read" shortcut — read/write/analyze are all the same wrapped-DU shape; the merge is
> mandatory for Phase 2 to deliver any value (do not let the gate pass vacuously — see the session "vacuous-green"
> lesson, OMN-65).
>
> **Scope boundary (intentional, not a bug):** this static gate canonicalizes only the depth-1 field shape of each tool.
> Deeper nested sub-schemas — e.g. the per-item `operation` inside `WriteSchema`'s batch array, or nested object filters
> — are deliberately out of scope; both canonicalizers read one level so they stay symmetric and the gate confirms 0
> drift. A future maintainer should not "fix" the depth-1 limitation: deeper drift detection is a separate, larger
> effort (candidate follow-up), not an omission in this task.

- [ ] **Step 4: Run, verify pass** (or surface real drift)

Run: `npx vitest tests/unit/diagnostics/schema-drift-tools.test.ts --run` Expected: PASS. **If it reports real drift,
that is a genuine OMN-37 find** — do NOT loosen the assertion to make it pass. Record the finding, fix the underlying
schema mismatch in a separate commit, or (if the drift is intentional/compact-by-design) add a narrowly-scoped
documented allowlist entry. Escalate to the controller if unsure.

- [ ] **Step 5: Run full suite + commit**

Run: `npm run test:unit`

```bash
git add src/diagnostics/tool-schema-registry.ts tests/unit/diagnostics/schema-drift-tools.test.ts
git commit -m "feat(OMN-37): CI drift gate for all advertised tool schemas"
```

**Phase 2 ships here** — drift now fails CI.

---

## Phase 3 — Diagnoser agent + Tier-1 driver

### Task 10: Seen-patterns ledger

**Files:**

- Create: `src/diagnostics/ledger.ts`
- Test: `tests/unit/diagnostics/ledger.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/diagnostics/ledger.test.ts
import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { loadLedger, recordDiagnosis, isKnown } from '../../../src/diagnostics/ledger.js';

describe('seen-patterns ledger', () => {
  it('round-trips and recognizes a known fingerprint', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'omn37led-')), 'diagnosed-patterns.json');
    let ledger = loadLedger(path); // missing file → empty
    expect(isKnown(ledger, 'fp1')).toBe(false);
    ledger = recordDiagnosis(ledger, path, {
      fingerprint: 'fp1',
      classification: 'SCHEMA_DRIFT',
      linearIssueId: 'OMN-99',
    });
    expect(isKnown(loadLedger(path), 'fp1')).toBe(true);
    expect(loadLedger(path).entries['fp1'].linearIssueId).toBe('OMN-99');
  });
});
```

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement**

```typescript
// src/diagnostics/ledger.ts
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { homedir } from 'os';

export interface LedgerEntry {
  fingerprint: string;
  classification: string;
  linearIssueId?: string;
  diagnosedAt: string;
}
export interface Ledger {
  entries: Record<string, LedgerEntry>;
}

/** Default path: ~/.omnifocus-mcp/diagnosed-patterns.json — SIBLING of tool-failures/, not nested inside it. */
export function defaultLedgerPath(): string {
  return join(homedir(), '.omnifocus-mcp', 'diagnosed-patterns.json');
}

export function loadLedger(path = defaultLedgerPath()): Ledger {
  if (!existsSync(path)) return { entries: {} };
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as Ledger;
  } catch {
    return { entries: {} };
  }
}

export function isKnown(ledger: Ledger, fingerprint: string): boolean {
  return fingerprint in ledger.entries;
}

export function recordDiagnosis(ledger: Ledger, path: string, e: Omit<LedgerEntry, 'diagnosedAt'>): Ledger {
  const next: Ledger = {
    entries: { ...ledger.entries, [e.fingerprint]: { ...e, diagnosedAt: new Date().toISOString() } },
  };
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(next, null, 2));
  return next;
}
```

- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit**

```bash
git add src/diagnostics/ledger.ts tests/unit/diagnostics/ledger.test.ts
git commit -m "feat(OMN-37): seen-patterns ledger (sibling of tool-failures/)"
```

---

### Task 11: Triage-doc renderer

**Files:**

- Create: `src/diagnostics/triage-doc.ts`
- Test: `tests/unit/diagnostics/triage-doc.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/diagnostics/triage-doc.test.ts
import { describe, it, expect } from 'vitest';
import { renderTriageDoc } from '../../../src/diagnostics/triage-doc.js';

describe('renderTriageDoc', () => {
  it('renders a tables-over-prose markdown doc, one row per pattern, with fingerprint', () => {
    const md = renderTriageDoc(
      [
        {
          fingerprint: 'abc123',
          tool: 'omnifocus_write',
          classification: 'SCHEMA_DRIFT',
          suggestedFix: 'add coerceNumber to limit',
          firstSeen: '2026-05-10',
          lastSeen: '2026-05-18',
          count: 7,
        },
      ],
      new Date('2026-05-18T12:00:00Z'),
    );
    expect(md).toContain('# MCP Failure Triage');
    expect(md).toContain('| Fingerprint | Tool | Classification |');
    expect(md).toContain('| abc123 | omnifocus_write | SCHEMA_DRIFT |');
    expect(md).toContain('CAP_GUARD'); // legend documents the sentinel even when unused
  });
});
```

- [ ] **Step 2–4:** Run-fail → implement `renderTriageDoc(rows, now)` returning a deterministic markdown string: title,
      generated-at line, a single sorted table
      (`Fingerprint | Tool | Classification | Suggested fix | First seen | Last seen | Count`), and a legend explaining
      classes + the `CAP_GUARD_TRIPPED` sentinel row. Sort rows by `count` desc then `fingerprint` for deterministic
      output. Run-pass.
- [ ] **Step 5: Commit** `feat(OMN-37): triage-doc markdown renderer`

---

### Task 12: `mcp-failure-diagnoser` agent file

**Files:**

- Create: `.claude/agents/mcp-failure-diagnoser.md`
- Test: `tests/unit/diagnostics/diagnoser-agent.test.ts` (structural)

- [ ] **Step 1: Write the structural test**

```typescript
// tests/unit/diagnostics/diagnoser-agent.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('mcp-failure-diagnoser agent', () => {
  it('has frontmatter name/description and enumerates the five classifications', () => {
    const md = readFileSync(join(process.cwd(), '.claude/agents/mcp-failure-diagnoser.md'), 'utf-8');
    expect(md).toMatch(/^---[\s\S]*name:\s*mcp-failure-diagnoser[\s\S]*---/);
    for (const k of ['SCHEMA_DRIFT', 'DESCRIPTION_GAP', 'COERCION_MISSING', 'LLM_EXPLORATION', 'DATA_ERROR']) {
      expect(md).toContain(k);
    }
  });
});
```

- [ ] **Step 2: Run, verify fail** (file absent).
- [ ] **Step 3: Author the agent** — sibling style to `.claude/agents/code-standards-reviewer.md`. Frontmatter
      `name: mcp-failure-diagnoser`, `description:` (when to use). Body: role = given ONE cluster (tool, normalized
      error, example redacted inputArgs, the tool's live advertised inputSchema + Zod canonical), read the tool
      description, emit exactly one classification of {SCHEMA_DRIFT, DESCRIPTION_GAP, COERCION_MISSING, LLM_EXPLORATION
      (no-op), DATA_ERROR (no-op)} + one-line suggested fix. Explicit instruction: deterministic SCHEMA_DRIFT/COERCION
      already handled upstream — only adjudicate ambiguous DESCRIPTION_GAP vs LLM_EXPLORATION. Output a fenced JSON
      block `{ "classification": "...", "suggestedFix": "..." }`.
- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit** `feat(OMN-37): mcp-failure-diagnoser agent`

---

### Task 13: `diagnose-failures` driver (deterministic path) + npm script

**Files:**

- Create: `scripts/diagnose-failures.ts`
- Modify: `package.json` (add `"diagnose-failures": "npx tsx scripts/diagnose-failures.ts"`)
- Test: `tests/unit/diagnostics/diagnose-driver.test.ts`

- [ ] **Step 1: Write the failing test (pure orchestration via injected deps)**

Structure `scripts/diagnose-failures.ts` so the orchestration core is an exported pure function
`runDiagnosis(opts: { logDir, ledgerPath, now, registry, fileSink, agentRunner?, linearFiler? })` and the CLI is a thin
wrapper. Test:

```typescript
// tests/unit/diagnostics/diagnose-driver.test.ts
import { describe, it, expect, vi } from 'vitest';
import { runDiagnosis } from '../../../scripts/diagnose-failures.js';
import { z } from 'zod';

it('deterministically classifies a coercion-gap cluster without invoking the agent', async () => {
  const agentRunner = vi.fn();
  const sink = vi.fn();
  await runDiagnosis({
    records: [
      /* 3x omnifocus_x failures whose inputShape includes a numeric field the Zod rejects as string */
    ],
    registry: [
      {
        name: 'omnifocus_x',
        getInputSchema: () => ({ type: 'object', properties: { limit: { type: 'number' } } }),
        zodSchema: z.object({ limit: z.number() }),
      },
    ],
    ledgerPath: '/tmp/omn37-test-ledger.json',
    now: new Date('2026-05-18T12:00:00Z'),
    thresholds: { minOccurrences: 3, minSpanDays: 2 },
    writeTriageDoc: sink,
    agentRunner,
  });
  expect(agentRunner).not.toHaveBeenCalled(); // deterministic class → no LLM
  expect(sink).toHaveBeenCalledOnce();
  const md = sink.mock.calls[0][0] as string;
  expect(md).toContain('COERCION');
});
```

- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement `runDiagnosis`**: parse→cluster (Task 3) with thresholds → drop
      ignored/un-escalated/ledger-known → for each escalated cluster: run `diffSchemas` for that tool (Task 8); if drift
      findings → deterministic classification (`COERCION_GAP`→`COERCION_MISSING`, others→`SCHEMA_DRIFT`); else push to
      `agentRunner` (residual). Build triage rows, call `writeTriageDoc(renderTriageDoc(rows, now))`, record each into
      the ledger. CLI wrapper resolves real deps (`logDir = ~/.omnifocus-mcp/tool-failures`,
      `registry = TOOL_SCHEMA_REGISTRY`, `writeTriageDoc` = write `docs/dev/mcp-failure-triage.md`, `agentRunner` =
      spawn the agent or, if unavailable, mark `NEEDS_LLM` and skip). `agentRunner` is OPTIONAL and **omitted in
      tests**.
- [ ] **Step 4: Run, verify pass** + `npm run test:unit`.
- [ ] **Step 5: Commit** `feat(OMN-37): diagnose-failures Tier-1 driver (deterministic path)`

**Phase 3 ships here** — `npm run diagnose-failures` writes the committed triage doc; agent invoked only for residue.

---

## Phase 4 — Auto-Linear (guardrailed)

### Task 14: `linear-filer` — cap guard, fingerprint dedup, per-run limit

**Files:**

- Create: `src/diagnostics/linear-filer.ts`
- Test: `tests/unit/diagnostics/linear-filer.test.ts`

The Linear API is injected as `LinearClient` interface
(`{ openIssueCount(): Promise<number>; searchByLabelAndBody(label, needle): Promise<string[]>; createIssue(input): Promise<string> }`)
— fully mocked in tests; no network in unit tests.

- [ ] **Step 1: Write the failing tests** (one per guard)

```typescript
// tests/unit/diagnostics/linear-filer.test.ts
import { describe, it, expect, vi } from 'vitest';
import { fileDriftIssues } from '../../../src/diagnostics/linear-filer.js';

const cluster = (fp: string, cls: string) => ({
  fingerprint: fp,
  tool: 't',
  classification: cls,
  suggestedFix: 'fix',
  firstSeen: '',
  lastSeen: '',
  count: 5,
});

it('files ONLY SCHEMA_DRIFT, never judgment/no-op classes', async () => {
  const client = {
    openIssueCount: vi.fn().mockResolvedValue(10),
    searchByLabelAndBody: vi.fn().mockResolvedValue([]),
    createIssue: vi.fn().mockResolvedValue('OMN-1'),
  };
  await fileDriftIssues(
    [cluster('a', 'SCHEMA_DRIFT'), cluster('b', 'DESCRIPTION_GAP'), cluster('c', 'COERCION_MISSING')],
    { client, perRunLimit: 3, capThreshold: 230 },
  );
  expect(client.createIssue).toHaveBeenCalledTimes(1);
});

it('trips the cap guard at >= capThreshold and creates nothing', async () => {
  const client = {
    openIssueCount: vi.fn().mockResolvedValue(230),
    searchByLabelAndBody: vi.fn(),
    createIssue: vi.fn(),
  };
  const r = await fileDriftIssues([cluster('a', 'SCHEMA_DRIFT')], { client, perRunLimit: 3, capThreshold: 230 });
  expect(client.createIssue).not.toHaveBeenCalled();
  expect(r.capGuardTripped).toBe(true);
});

it('dedups against an existing issue with the same fingerprint in body', async () => {
  const client = {
    openIssueCount: vi.fn().mockResolvedValue(10),
    searchByLabelAndBody: vi.fn().mockResolvedValue(['OMN-7']),
    createIssue: vi.fn(),
  };
  await fileDriftIssues([cluster('dup', 'SCHEMA_DRIFT')], { client, perRunLimit: 3, capThreshold: 230 });
  expect(client.createIssue).not.toHaveBeenCalled();
});

it('caps creations at perRunLimit', async () => {
  const client = {
    openIssueCount: vi.fn().mockResolvedValue(10),
    searchByLabelAndBody: vi.fn().mockResolvedValue([]),
    createIssue: vi.fn().mockResolvedValue('OMN-X'),
  };
  await fileDriftIssues(
    [
      cluster('a', 'SCHEMA_DRIFT'),
      cluster('b', 'SCHEMA_DRIFT'),
      cluster('c', 'SCHEMA_DRIFT'),
      cluster('d', 'SCHEMA_DRIFT'),
    ],
    { client, perRunLimit: 3, capThreshold: 230 },
  );
  expect(client.createIssue).toHaveBeenCalledTimes(3);
});
```

- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement `fileDriftIssues`** enforcing, in order: (1) filter to `classification === 'SCHEMA_DRIFT'`;
      (2) `await client.openIssueCount()` — if `>= capThreshold` return `{ created: [], capGuardTripped: true }` (caller
      emits the `CAP_GUARD_TRIPPED` triage row); (3) per cluster, `searchByLabelAndBody('omn-37-auto', fingerprint)` —
      non-empty → skip; (4) stop at `perRunLimit`; (5) `createIssue` with body embedding the fingerprint verbatim +
      label `omn-37-auto`; return created IDs for the ledger. Document that the concrete `LinearClient` impl uses the
      Linear MCP **`graphql` action** (not typed `search`) for both `openIssueCount`
      (`state.type nin [completed,canceled]` across OMN+GATE) and the dedup query.
- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit** `feat(OMN-37): guardrailed auto-Linear filer (cap/dedup/limit)`

---

### Task 15: Wire `--create-issues` into the driver

**Files:**

- Modify: `scripts/diagnose-failures.ts`
- Modify: `tests/unit/diagnostics/diagnose-driver.test.ts`

- [ ] **Step 1: Add a test** asserting that without `--create-issues` the injected `linearFiler` is never called, and
      with it, only `SCHEMA_DRIFT` clusters are passed and the returned issue IDs are written into the ledger, and a
      `CAP_GUARD_TRIPPED` row is appended to the triage doc when `capGuardTripped`.
- [ ] **Step 2:** Run, verify fail.
- [ ] **Step 3:** Thread an optional `linearFiler` dep + `createIssues` flag through `runDiagnosis`; default off. CLI
      wires the real graphql-backed `LinearClient` only when `--create-issues` is passed.
- [ ] **Step 4:** Run, verify pass + `npm run test:unit`.
- [ ] **Step 5: Commit** `feat(OMN-37): opt-in --create-issues wiring with ledger + cap-row`

**Phase 4 ships here.**

---

## Phase 5 — Tier-2 hook (local, optional) + scheduling doc

### Task 16: PostToolUse marker hook in `.claude/settings.local.json`

**Files:**

- Modify/Create: `.claude/settings.local.json` (gitignored — confirm via `git check-ignore .claude/settings.local.json`)
- Create: `scripts/mcp-failure-marker.sh` (in-repo, the cheap appender the hook calls)
- Test: `tests/unit/diagnostics/marker-script.test.ts`

- [ ] **Step 1: Write the failing test** — invoke `scripts/mcp-failure-marker.sh` with a fake tool name + a temp marker
      path env var; assert it appends exactly one `ISO8601\ttool` line and never spawns anything (grep the script: must
      NOT contain `claude -p`).
- [ ] **Step 2:** Run, verify fail.
- [ ] **Step 3:** Implement the 3-line shell appender
      (`echo "$(date -u +%FT%TZ)\t$1" >> "${OMN37_MARKER:-$HOME/.omnifocus-mcp/fresh-failures.tsv}"`). Add the
      `.claude/settings.local.json` `hooks.PostToolUse` entry: matcher `mcp__omnifocus__*`, command invoking the marker
      script with the tool name, no condition that could spawn an agent. Document that this file is local-only.
- [ ] **Step 4:** Run, verify pass.
- [ ] **Step 5: Commit** `feat(OMN-37): Tier-2 PostToolUse marker hook (local, no agent spawn)` (only
      `scripts/mcp-failure-marker.sh` + test are committed; settings.local.json is gitignored — note this in the commit
      body).

---

### Task 17: Operator doc incl. untracked `~/bin` scheduling wrapper

**Files:**

- Create: `docs/dev/mcp-failure-diagnosis.md`
- Modify: `docs/dev/PATTERNS.md` (one symptom-index row → link the new doc) — only if PATTERNS.md has a stable section
  to append to; else skip and note.

- [ ] **Step 1:** Write `docs/dev/mcp-failure-diagnosis.md` (tables-over-prose per repo standards): the pipeline
      overview, `npm run analyze-failures` vs `npm run diagnose-failures [--create-issues]`, the threshold flags, the
      ledger location, the triage doc location, the Tier-2 hook (local), and a copy-pasteable **untracked**
      `~/bin/of-mcp-diagnose` cron/launchd recipe (sibling precedent: `of-mcp-redeploy`) — explicitly stated as NOT
      committed and machine-specific.
- [ ] **Step 2:** Verify all referenced `src/`+`docs/` paths resolve (CLAUDE.md path guard from OMN-68 will fail CI
      otherwise): `npm run test:unit -- tests/unit/docs/claude-md-paths.test.ts` is unaffected (we don't edit
      CLAUDE.md), but keep the new doc's internal refs literal.
- [ ] **Step 3:** `npm run test:unit` (full) + `npm run build`.
- [ ] **Step 4: Commit** `docs(OMN-37): operator guide + scheduling recipe`

**Phase 5 ships here. Feature complete.**

---

## Final verification (before requesting review / PR)

- [ ] `npm run build` — clean.
- [ ] `npm run test:unit` — all green, including the new drift gate and golden snapshot.
- [ ] `npm run analyze-failures` — manual smoke: output visually identical to pre-refactor (golden test already pins
      this).
- [ ] `npm run diagnose-failures` against a seeded fixture log — triage doc generated, ledger written, agent not spawned
      for deterministic classes.
- [ ] Confirm `.claude/settings.local.json` is gitignored and NOT staged.
- [ ] Per repo norm (memory: `feedback_review_before_merge`): dispatch a code-reviewer subagent as a hard pre-merge
      gate; gate the PR on a SAFE/Yes verdict; merge via `gh pr merge --squash --auto` (never `--admin`); PR targets
      `kip-d/omnifocus-mcp`.

## Notes for the implementer

- TDD is mandatory (`superpowers:test-driven-development`): test → red → minimal green → commit, every task.
- The Phase-2 drift gate finding **real** drift is success, not failure — never weaken an assertion to get green;
  surface it.
- `inputArgs` in the log is already redacted (`redactArgs`, logger.ts:45). Never re-redact, never print raw, never add
  new PII sinks.
- The coercibility check is a **runtime `safeParse` probe**, never a source pattern-match (CLAUDE.md's `z.union`
  phrasing is stale; reality is `coercion-helpers.ts`).
- Zod schema symbol names in Task 9 are expected names — `grep` and correct to actual exports before implementing;
  handle discriminated-union top-level schemas per the Task 9 implementer note.
- Phases 1, 2, 3, 4, 5 are each independently shippable in that order; a reviewer/PR boundary after Phase 2 is
  reasonable if scope needs splitting.
