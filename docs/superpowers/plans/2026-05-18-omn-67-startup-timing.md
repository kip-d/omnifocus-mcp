# STARTUP COMPLETE Timing Line — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Emit one always-on `STARTUP COMPLETE` INFO line per process start that decomposes startup into six phases
(`load init perms warm register ready`) so the operator sees which phase dominates without reading code or subtracting
timestamps.

**Architecture:** A new `src/utils/startup-timer.ts` with a _pure_ `formatStartupSummary(marks, mode)` (the unit-tested
contract) and a thin `StartupTimer` class (clock-injectable) that records `performance.now()` at six boundaries. A
module-level `StartupTimer` instance in `src/index.ts` (constructed at the first executable statement so `load` captures
Node bootstrap + ESM import-graph cost) is `mark()`ed at boundaries and emitted via the existing `logger` after the
`ready` boundary in both stdio and HTTP modes. Additive only — no behavior change to warm/transport/shutdown.

**Tech Stack:** TypeScript (ESM), Vitest, Node `perf_hooks` (`performance.now`), `@modelcontextprotocol/sdk`.

**Spec:** `docs/superpowers/specs/2026-05-18-omn-67-startup-timing-design.md`

---

## File Structure

| File                                                | Responsibility                                                                                                                                                              |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/utils/startup-timer.ts` (create)               | `StartupMode`/`StartupCheckpoint`/`StartupMarks` types; pure `formatStartupSummary`; `StartupTimer` class (clock-injectable)                                                |
| `tests/unit/utils/startup-timer.test.ts` (create)   | The contract: formatter exactness, sum-to-total, stdio/http, missing `registerEnd`, clock-injected timer                                                                    |
| `tests/integration/startup-timing.test.ts` (create) | End-to-end wiring: spawn built server (`NODE_ENV=test`), assert exactly one `STARTUP COMPLETE … [stdio]` line, phases parse and sum                                         |
| `src/index.ts` (modify)                             | Import + module-level instance (first executable statement); 4 shared `mark()`s; stdio `registerEnd`+`ready`+emit; http `ready`+emit; fix 2 stale `(non-blocking)` comments |

---

## Task 1: StartupTimer + pure formatter (the contract)

**Files:**

- Create: `src/utils/startup-timer.ts`
- Test: `tests/unit/utils/startup-timer.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/utils/startup-timer.test.ts
import { describe, it, expect } from 'vitest';
import { StartupTimer, formatStartupSummary, type StartupMarks } from '../../../src/utils/startup-timer.js';

describe('formatStartupSummary', () => {
  it('renders all six phases for stdio, summing to total', () => {
    const marks: StartupMarks = {
      load: 8210,
      initEnd: 8214,
      permsEnd: 8354,
      warmEnd: 30954,
      registerEnd: 31067,
      ready: 31280,
    };
    const line = formatStartupSummary(marks, 'stdio');
    expect(line).toBe(
      'STARTUP COMPLETE 31280ms  load 8210 · init 4 · perms 140 · warm 22600 · register 113 · ready 213  [stdio]',
    );
    // sum-to-total invariant (rounded parts within phase-count ms of total)
    const nums = [...line.matchAll(/(?:load|init|perms|warm|register|ready) (\d+)/g)].map((m) => Number(m[1]));
    const total = Number(line.match(/COMPLETE (\d+)ms/)![1]);
    expect(Math.abs(nums.reduce((a, b) => a + b, 0) - total)).toBeLessThanOrEqual(6);
  });

  it('treats missing registerEnd as register 0 (http path) and still sums', () => {
    const marks: StartupMarks = { load: 5000, initEnd: 5002, permsEnd: 5100, warmEnd: 27000, ready: 27210 };
    const line = formatStartupSummary(marks, 'http');
    expect(line).toBe(
      'STARTUP COMPLETE 27210ms  load 5000 · init 2 · perms 98 · warm 21900 · register 0 · ready 210  [http]',
    );
  });

  it('handles warm disabled (warmEnd == permsEnd) as warm 0', () => {
    const marks: StartupMarks = { load: 400, initEnd: 402, permsEnd: 440, warmEnd: 440, registerEnd: 510, ready: 700 };
    expect(formatStartupSummary(marks, 'stdio')).toContain('warm 0 ·');
  });
});

describe('StartupTimer', () => {
  it('captures load at construction and marks via injected clock', () => {
    let t = 100;
    const timer = new StartupTimer(() => t);
    t = 105;
    timer.mark('initEnd');
    t = 250;
    timer.mark('permsEnd');
    t = 9000;
    timer.mark('warmEnd');
    t = 9100;
    timer.mark('registerEnd');
    t = 9300;
    timer.mark('ready');
    expect(timer.summary('stdio')).toBe(
      'STARTUP COMPLETE 9300ms  load 100 · init 5 · perms 145 · warm 8750 · register 100 · ready 200  [stdio]',
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/utils/startup-timer.test.ts` Expected: FAIL —
`Cannot find module '../../../src/utils/startup-timer.js'`

- [ ] **Step 3: Write minimal implementation**

```ts
// src/utils/startup-timer.ts
export type StartupMode = 'stdio' | 'http';
export type StartupCheckpoint = 'initEnd' | 'permsEnd' | 'warmEnd' | 'registerEnd' | 'ready';

export interface StartupMarks {
  /** ms from process start to timer construction (≈ Node bootstrap + ESM import graph). */
  load: number;
  initEnd?: number;
  permsEnd?: number;
  warmEnd?: number;
  registerEnd?: number; // stdio-only; absent in HTTP mode → register renders 0
  ready?: number;
}

/**
 * Pure. Given recorded marks (ms relative to process start) and the server mode,
 * render the single STARTUP COMPLETE line. Phases are consecutive deltas, so
 * load+init+perms+warm+register+ready === total (within rounding). A missing
 * checkpoint collapses its phase to 0 (e.g. HTTP has no registerEnd).
 */
export function formatStartupSummary(marks: StartupMarks, mode: StartupMode): string {
  const initEnd = marks.initEnd ?? marks.load;
  const permsEnd = marks.permsEnd ?? initEnd;
  const warmEnd = marks.warmEnd ?? permsEnd;
  const registerEnd = marks.registerEnd ?? warmEnd;
  const ready = marks.ready ?? registerEnd;

  const load = Math.round(marks.load);
  const init = Math.round(initEnd - marks.load);
  const perms = Math.round(permsEnd - initEnd);
  const warm = Math.round(warmEnd - permsEnd);
  const register = Math.round(registerEnd - warmEnd);
  const readyMs = Math.round(ready - registerEnd);
  const total = Math.round(ready);

  return (
    `STARTUP COMPLETE ${total}ms  load ${load} · init ${init} · perms ${perms} · ` +
    `warm ${warm} · register ${register} · ready ${readyMs}  [${mode}]`
  );
}

export class StartupTimer {
  private readonly marks: StartupMarks;
  private readonly now: () => number;

  constructor(now: () => number = () => performance.now()) {
    this.now = now;
    this.marks = { load: now() };
  }

  mark(checkpoint: StartupCheckpoint): void {
    this.marks[checkpoint] = this.now();
  }

  summary(mode: StartupMode): string {
    return formatStartupSummary(this.marks, mode);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/utils/startup-timer.test.ts` Expected: PASS (3 + 1 = all green)

- [ ] **Step 5: Lint the new files**

Run: `npx eslint src/utils/startup-timer.ts tests/unit/utils/startup-timer.test.ts` Expected: no output (clean)

- [ ] **Step 6: Commit**

```bash
git add src/utils/startup-timer.ts tests/unit/utils/startup-timer.test.ts
git commit -m "feat(OMN-67): StartupTimer + pure formatStartupSummary contract

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Integration smoke test (RED — wiring not present yet)

**Files:**

- Create: `tests/integration/startup-timing.test.ts`

This test spawns the built server with `NODE_ENV=test` (cache warming disabled → fast, no OmniFocus needed; the line is
always-on so it still emits with `warm 0`) and `stdin` closed (triggers the graceful-exit path). It is written BEFORE
the `src/index.ts` wiring so it fails first.

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/startup-timing.test.ts
import { describe, it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const entry = join(repoRoot, 'dist', 'index.js');

function runServerOnce(): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [entry], {
      env: { ...process.env, NODE_ENV: 'test' },
      stdio: ['pipe', 'ignore', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', (d) => (stderr += d.toString()));
    child.stdin.end(); // EOF → graceful exit after startup
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('server did not exit within 20s'));
    }, 20_000);
    child.on('close', () => {
      clearTimeout(timer);
      resolve(stderr);
    });
    child.on('error', reject);
  });
}

describe('startup timing line (integration)', () => {
  it('emits exactly one STARTUP COMPLETE [stdio] line whose phases sum to total', async () => {
    const stderr = await runServerOnce();
    const matches = stderr.match(/STARTUP COMPLETE .*\[stdio\]/g) ?? [];
    expect(matches).toHaveLength(1);
    const line = matches[0];
    const total = Number(line.match(/COMPLETE (\d+)ms/)![1]);
    const parts = [...line.matchAll(/(?:load|init|perms|warm|register|ready) (\d+)/g)].map((m) => Number(m[1]));
    expect(parts).toHaveLength(6);
    expect(Math.abs(parts.reduce((a, b) => a + b, 0) - total)).toBeLessThanOrEqual(6);
  }, 25_000);
});
```

- [ ] **Step 2: Build, then run the test to verify it fails**

Run: `npm run build && npx vitest run tests/integration/startup-timing.test.ts` Expected: FAIL —
`expected [] to have length 1` (no `STARTUP COMPLETE` line emitted yet; server still starts/exits cleanly)

- [ ] **Step 3: Commit the RED test**

```bash
git add tests/integration/startup-timing.test.ts
git commit -m "test(OMN-67): integration smoke for STARTUP COMPLETE line (RED)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Wire StartupTimer into src/index.ts (GREEN)

**Files:**

- Modify: `src/index.ts` (import after line 15; instance as first executable statement ~line 17; `mark('initEnd')` after
  line 63; `mark('permsEnd')` after line 76; `mark('warmEnd')` after line 125; stdio `mark('registerEnd')` after line
  162 and `mark('ready')`+emit after line 218; http `mark('ready')`+emit after line 257; comment fixes at lines 62
  and 78)

All boundary line numbers are relative to the file as read; if drift occurs, anchor on the quoted code, not the number.

- [ ] **Step 1: Add the import**

After `import { HttpServerManager } from './http-server.js';` add:

```ts
import { StartupTimer } from './utils/startup-timer.js';
```

- [ ] **Step 2: Construct the timer as the FIRST executable statement**

Immediately after the import block and BEFORE `const logger = createLogger('server');`, insert:

```ts
// First executable statement: performance.now() here ≈ Node bootstrap + ESM
// import-graph load (the cold-`npm ci` FS cost). Must precede parseCLIArgs.
const startupTimer = new StartupTimer();
```

- [ ] **Step 3: Fix the two stale `(non-blocking)` comments (doc-only)**

`// Perform initial permission check (non-blocking)` →
`// Perform initial permission check (blocking — awaited before the transport connects)`

`// Warm cache with frequently accessed data (non-blocking)` →
`// Warm cache with frequently accessed data (blocking — awaited before the transport connects)`

- [ ] **Step 4: Add the four shared `mark()` calls in `runServer()`**

After `const permissionChecker = PermissionChecker.getInstance();` (line ~63):

```ts
startupTimer.mark('initEnd');
```

After the permission-check `try { … } catch { … }` block closes (line ~76, before the `// Warm cache …` comment):

```ts
startupTimer.mark('permsEnd');
```

After the entire cache-warm `if/else if/else if/else` block closes (line ~125, before
`// Check if we're running in HTTP mode`):

```ts
startupTimer.mark('warmEnd');
```

- [ ] **Step 5: Add stdio `registerEnd` + `ready` + emit**

In `runStdioServer`, after `registerPrompts(stdioServer);` (line ~162):

```ts
startupTimer.mark('registerEnd');
```

At the end of `runStdioServer`, after `await stdioServer.connect(transport);` (line ~218):

```ts
startupTimer.mark('ready');
logger.info(startupTimer.summary('stdio'));
```

- [ ] **Step 6: Add http `ready` + emit**

In `runHttpServer`, immediately after the `try { await httpServerManager.start(); } catch { … }` block (line ~257,
before the `gracefulShutdown` definition):

```ts
startupTimer.mark('ready');
logger.info(startupTimer.summary('http'));
```

Note (cosmetic, expected): this prints `STARTUP COMPLETE … [http]` _before_ the existing
`logger.info('HTTP server ready and accepting connections')` at line ~287. Intentional — `ready` is marked when the
listener is up (`start()` resolved), not at the later human-readable banner. No functional impact.

- [ ] **Step 7: Build + run the integration test (now GREEN)**

Run: `npm run build && npx vitest run tests/integration/startup-timing.test.ts` Expected: PASS — exactly one
`STARTUP COMPLETE … [stdio]` line, 6 phases, sum ≈ total

- [ ] **Step 8: Lint the modified file**

Run: `npx eslint src/index.ts` Expected: no output (clean)

- [ ] **Step 9: Commit**

```bash
git add src/index.ts
git commit -m "feat(OMN-67): emit STARTUP COMPLETE timing line (stdio+HTTP, always-on)

Wire module-level StartupTimer; mark load/init/perms/warm/register/ready;
emit after ready in both modes. Correct two stale (non-blocking) comments
(:62 perms, :78 warm — both are awaited/blocking). Additive only.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Full gate verification

**Files:** none (verification only)

- [ ] **Step 1: Build**

Run: `npm run build` Expected: exit 0, clean `tsc`

- [ ] **Step 2: Full unit suite**

Run: `npm run test:unit` Expected: all pass, including the new `startup-timer.test.ts` (suite count increases)

- [ ] **Step 3: Strict lint**

Run: `npm run lint:strict` Expected: exit 0, no warnings (`--max-warnings=0`)

- [ ] **Step 4: Integration smoke (re-confirm)**

Run: `npx vitest run tests/integration/startup-timing.test.ts` Expected: PASS

- [ ] **Step 5: Update spec status + commit**

Edit the spec header `Status:` line to `Status: Implemented (2026-05-18) — pending review/merge`.

```bash
git add docs/superpowers/specs/2026-05-18-omn-67-startup-timing-design.md
git commit -m "docs(OMN-67): mark spec implemented

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Definition of Done

- `npm run build` 0 · `npm run test:unit` all green (incl. new contract tests) · `npm run lint:strict` 0
- `tests/integration/startup-timing.test.ts` GREEN: exactly one `STARTUP COMPLETE … [stdio]` line, six phases, sum
  within rounding of total
- `src/index.ts`: module-level `StartupTimer` is the first executable statement; six boundaries marked; emitted after
  `ready` in both stdio and HTTP; both stale `(non-blocking)` comments corrected
- No behavior change to warm/transport/mode-branch/shutdown (additive logging only)
- `~/bin/of-mcp-redeploy` (already greps `STARTUP COMPLETE`) will surface the line on next prod redeploy with zero
  script change
