# OMN-261: Cross-file shared MCP server via globalThis — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `tests/integration/helpers/shared-server.ts`'s "one MCP server per suite run" design actually work across
test files, instead of silently re-spawning a fresh server (and idle Node process) for 13 of 17 `getSharedClient()` call
sites.

**Architecture:** Vitest's `forks` pool defaults to `isolate: true`, which resets every test file's ES-module top-level
bindings to a fresh instance — independent of `singleFork: true`, which only controls OS-process count (one process,
many fresh module registries). `globalThis` is the one thing per-file isolation does _not_ reset within a single OS
process. Move `shared-server.ts`'s three pieces of mutable state (`sharedClient`, `initPromise`, `isFirstAccess`) off
module-scope `let` bindings and onto a `globalThis`-keyed slot via a small new `global-singleton.ts` helper. Zero
test-file edits — same invariant OMN-186 held to. Also add a real `process.once('beforeExit', ...)` graceful-shutdown
hook inside `shared-server.ts`, since `setup-integration.ts`'s `globalTeardown` call to `shutdownSharedClient()` runs in
a separate OS process from the worker fork and can never reach the real client (confirmed: the 2026-07-08 profiler
logged that call at `1 call, 0s` — a real shutdown involving IPC round-trips to a live server cannot complete in 0ms).

**Tech Stack:** TypeScript, Vitest 3.2.4, `@modelcontextprotocol/sdk` stdio transport (via `MCPTestClient`).

---

## Root cause (already confirmed — do not re-derive, just verify empirically in Task 1)

17 total `getSharedClient()` calls across 13 files (`grep -rn "getSharedClient(" tests/integration --include="*.ts"`).
Two files call it more than once: `omn-126-dedup-scope.test.ts` (4 calls) and `project-name-filter.test.ts` (2 calls).
The 2026-07-11 profiler showed **13 inits / 4 reuses** — and `4 = (4-1) + (2-1)` exactly: every reuse is a _second call
within the same file_. There is **zero cross-file reuse** today. `isolate` is not set anywhere in `vitest.config.ts`
(confirmed via grep), so it's vitest's default (`true`) for the `forks` pool.

## Rejected alternative: `isolate: false`

Flipping `isolate: false` suite-wide would fix this file too, but changes module-reset semantics for **every**
integration helper simultaneously — an unaudited blast radius (any other helper that assumes fresh per-file state would
silently start sharing state too). The `globalThis`-keyed slot is a contained, one-file change with no config edits and
no test-file edits. Do not implement `isolate: false` as part of this plan.

---

### Task 1: Regression-pinning test for the vitest isolation behavior itself

**Files:**

- Create: `tests/integration/_diagnostics/module-isolation-probe-1.test.ts`
- Create: `tests/integration/_diagnostics/module-isolation-probe-2.test.ts`

This proves — empirically, against the _real_ integration-suite vitest config (`pool:'forks'`, `singleFork:true`), not a
simulation — that module-scope state resets per file while `globalThis` does not. It's a permanent regression pin: if a
future vitest upgrade or config change alters this behavior, this test fails loudly instead of silently reintroducing
the per-file-respawn bug.

**Design note (revised 2026-07-11 after a real flake was caught during implementation):** the first draft of this task
used a third `-z-verify` file whose name was chosen to sort after `-a`/`-b`, assuming vitest's default file-discovery
order runs it last. That assumption is false in practice: vitest 3.2.4's default `BaseSequencer` persists a per-file
pass/fail/duration cache (`node_modules/.vite/vitest/**/results.json`) and reorders files by it on every run after the
first — independent of filename. Confirmed directly: cold cache → 3/3 pass in name order; any warm-cache rerun →
deterministic failure with the verify file's `beforeAll` running before file B's. The fix below eliminates the ordering
dependency entirely instead of working around the cache (`--no-cache` isn't viable for a permanent pin that runs as part
of the normal `vitest tests/integration --run` invocation) or falling back to `vi.resetModules()` (that would duplicate
Task 2's unit-level proof and lose the point of this task, which is proving the behavior against the _real_ multi-file
suite execution, not a simulation within one file).

Two probe files, no separate verify file. Each does the SAME thing: assert its own module-scope state is fresh
(order-independent — true for every file regardless of when it runs), then record a globalThis observation. Whichever
file happens to run _last_ — tracked via a shared counter, not filename — does the aggregate cross-file assertion. This
is correct no matter what vitest's sequencer decides, and self-checks: if two files ever ran with any lost-update race
(they can't, under `singleFork:true`'s single OS process with synchronous same-tick increments, but the assertion would
catch it if that ever changed), the aggregate values wouldn't come out as the expected `[0, 1]`.

- [ ] **Step 1: Write the two probe files**

`tests/integration/_diagnostics/module-isolation-probe-1.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';

// OMN-261: proves vitest's per-file module isolation (default `isolate: true`
// for the `forks` pool) resets this file's own module-scope state, while
// globalThis survives across files in the same singleFork process.
//
// Order-independent by design: vitest's default sequencer reorders files by a
// persisted pass/fail/duration cache, NOT file name, so this can't assume
// "file 1 runs before file 2". Whichever of the TWO probe files happens to
// run last does the aggregate assertion, tracked via a shared counter.
const TOTAL_PROBE_FILES = 2;

let moduleScopeCounter = 0;

declare global {
  var __omn261ProbeCounter: number | undefined;
  var __omn261ProbeSeenValues: number[] | undefined;
  var __omn261ProbeFilesRun: number | undefined;
}

describe('module isolation probe (file 1)', () => {
  it('sees fresh module-scope state; records a persistent globalThis observation', () => {
    const moduleScopeSeenBefore = moduleScopeCounter;
    moduleScopeCounter++;
    // Order-independent: EVERY file starts with a fresh module-scope binding
    // if isolate:true is in effect, regardless of which file runs first.
    expect(moduleScopeSeenBefore).toBe(0);

    const globalThisSeenBefore = globalThis.__omn261ProbeCounter ?? 0;
    globalThis.__omn261ProbeCounter = globalThisSeenBefore + 1;
    globalThis.__omn261ProbeSeenValues ??= [];
    globalThis.__omn261ProbeSeenValues.push(globalThisSeenBefore);

    globalThis.__omn261ProbeFilesRun = (globalThis.__omn261ProbeFilesRun ?? 0) + 1;
    if (globalThis.__omn261ProbeFilesRun === TOTAL_PROBE_FILES) {
      // Whichever file happens to run last (by vitest's sequencer) verifies
      // the aggregate: both files must have seen DIFFERENT globalThis values
      // (0 and 1, in some order) — proof that globalThis persisted across
      // the per-file module-scope reset.
      const seen = [...globalThis.__omn261ProbeSeenValues].sort((x, y) => x - y);
      expect(seen).toEqual([0, 1]);
    }
  });
});
```

`tests/integration/_diagnostics/module-isolation-probe-2.test.ts` — byte-for-byte identical except the `describe` label
reads `'module isolation probe (file 2)'`.

- [ ] **Step 2: Run the two probe files together to confirm they pass, repeatedly (to rule out the cache-reordering
      flake)**

Run: `npm run build && npx vitest tests/integration/_diagnostics --run` three times in a row (warm cache on the 2nd/3rd
runs — this is the condition that exposed the original flake). Expected: 2 files, 2 tests, all PASS, every time. If any
run fails, STOP — the root-cause hypothesis is wrong and Task 2's fix premise is invalid; report back instead of
proceeding.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/_diagnostics/
git commit -m "test(OMN-261): pin vitest per-file module isolation vs globalThis persistence"
```

---

### Task 2: `global-singleton.ts` helper + unit test (TDD)

**Files:**

- Create: `tests/integration/helpers/global-singleton.ts`
- Create: `tests/unit/integration-helpers/global-singleton.test.ts`

- [ ] **Step 1: Write the failing unit test**

`tests/unit/integration-helpers/global-singleton.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('getGlobalSlot', () => {
  const KEY = 'unit-test-probe';
  const globalKey = Symbol.for(`omnifocus-mcp:${KEY}`);

  beforeEach(() => {
    delete (globalThis as unknown as Record<symbol, unknown>)[globalKey];
  });

  it('returns the same instance on repeated calls, ignoring the factory after first creation', async () => {
    const { getGlobalSlot } = await import('../../integration/helpers/global-singleton.js');
    const a = getGlobalSlot(KEY, () => ({ n: 0 }));
    const b = getGlobalSlot(KEY, () => ({ n: 999 }));
    expect(b).toBe(a);
    expect(b.n).toBe(0);
  });

  it('survives a fresh module re-import (the mechanism vitest per-file isolation relies on)', async () => {
    const mod1 = await import('../../integration/helpers/global-singleton.js');
    const slot1 = mod1.getGlobalSlot(KEY, () => ({ n: 0 }));
    slot1.n = 42;

    vi.resetModules();
    const mod2 = await import('../../integration/helpers/global-singleton.js');
    const slot2 = mod2.getGlobalSlot(KEY, () => ({ n: 0 }));

    expect(slot2.n).toBe(42);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest tests/unit/integration-helpers/global-singleton.test.ts --run` Expected: FAIL —
`Cannot find module '../../integration/helpers/global-singleton.js'`

- [ ] **Step 3: Write the implementation**

`tests/integration/helpers/global-singleton.ts`:

```typescript
/**
 * Vitest's default `isolate: true` (the `forks` pool default) resets every
 * test file's ES-module top-level bindings to a fresh instance, even under
 * `pool:'forks', poolOptions.forks.singleFork:true` (one OS process, but one
 * module registry per file). `globalThis` is the one thing that per-file
 * isolation does NOT reset — same JS realm/object across files in the same
 * fork. Use this to persist state across integration test files within a
 * single suite run. See OMN-261.
 */
export function getGlobalSlot<T>(key: string, initial: () => T): T {
  const globalKey = Symbol.for(`omnifocus-mcp:${key}`);
  const store = globalThis as unknown as Record<symbol, T>;
  if (store[globalKey] === undefined) {
    store[globalKey] = initial();
  }
  return store[globalKey];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest tests/unit/integration-helpers/global-singleton.test.ts --run` Expected: PASS (both tests)

- [ ] **Step 5: Commit**

```bash
git add tests/integration/helpers/global-singleton.ts tests/unit/integration-helpers/global-singleton.test.ts
git commit -m "feat(OMN-261): add globalThis-backed singleton slot helper"
```

---

### Task 3: Wire `shared-server.ts` onto the global slot + real graceful shutdown

**Files:**

- Modify: `tests/integration/helpers/shared-server.ts` (full file — state management section)
- Modify: `tests/support/setup-integration.ts` (remove the dead cross-process shutdown call)

- [ ] **Step 1: Replace module-scope state with the global slot**

In `tests/integration/helpers/shared-server.ts`, replace:

```typescript
let sharedClient: MCPTestClient | null = null;
let initPromise: Promise<MCPTestClient> | null = null;
let isFirstAccess = true;
```

with:

```typescript
import { getGlobalSlot } from './global-singleton.js';

interface SharedServerState {
  client: MCPTestClient | null;
  initPromise: Promise<MCPTestClient> | null;
  isFirstAccess: boolean;
  shutdownHookRegistered: boolean;
}

// OMN-261: module-scope `let` bindings reset on every test file under
// vitest's default per-file isolation, even inside the single OS process
// `singleFork:true` guarantees — defeating the "one server per run" design
// this file's docstring already describes. globalThis survives the reset.
function getState(): SharedServerState {
  return getGlobalSlot<SharedServerState>('shared-server-state', () => ({
    client: null,
    initPromise: null,
    isFirstAccess: true,
    shutdownHookRegistered: false,
  }));
}
```

- [ ] **Step 2: Update `getSharedClient` / `getSharedClientImpl` to read/write the state object**

Replace:

```typescript
export async function getSharedClient(): Promise<MCPTestClient> {
  // OMN-186: first access pays server start + cache warm + OmniFocus warm;
  // later per-file accesses pay a cache clear. Split ops so a profiled run
  // (FIXTURE_PROFILE=1) can tell the one-time warm from the per-file cost.
  const op = sharedClient || initPromise ? 'getSharedClient.reuse' : 'getSharedClient.init';
  return profileFixture('beforeAll', op, getSharedClientImpl);
}

async function getSharedClientImpl(): Promise<MCPTestClient> {
  if (sharedClient) {
    // Clear cache between test file accesses to prevent pollution
    if (!isFirstAccess) {
      await sharedClient.clearCache();
    }
    isFirstAccess = false;
    return sharedClient;
  }

  // Prevent race conditions if multiple tests start simultaneously
  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    console.log('🚀 Starting shared MCP server for integration tests (with cache warming)...');
    sharedClient = new MCPTestClient({ enableCacheWarming: true });
    await sharedClient.startServer();
    console.log('🔥 Warming up OmniFocus (read + mutation paths)...');
    await warmupOmniFocus(sharedClient);
    console.log('✅ Shared MCP server ready (cache warmed, OmniFocus warmed)');
    isFirstAccess = false; // First access complete
    return sharedClient;
  })();

  return initPromise;
}
```

with:

```typescript
export async function getSharedClient(): Promise<MCPTestClient> {
  // OMN-186/OMN-261: first access pays server start + cache warm + OmniFocus
  // warm; later accesses (now genuinely cross-file, via the global slot) pay
  // a cache clear. Split ops so a profiled run (FIXTURE_PROFILE=1) can tell
  // the one-time warm from the per-file cost.
  const state = getState();
  const op = state.client || state.initPromise ? 'getSharedClient.reuse' : 'getSharedClient.init';
  return profileFixture('beforeAll', op, getSharedClientImpl);
}

async function getSharedClientImpl(): Promise<MCPTestClient> {
  const state = getState();

  if (state.client) {
    // Clear cache between test file accesses to prevent pollution
    if (!state.isFirstAccess) {
      await state.client.clearCache();
    }
    state.isFirstAccess = false;
    return state.client;
  }

  // Prevent race conditions if multiple tests start simultaneously
  if (state.initPromise) {
    return state.initPromise;
  }

  state.initPromise = (async () => {
    console.log('🚀 Starting shared MCP server for integration tests (with cache warming)...');
    const client = new MCPTestClient({ enableCacheWarming: true });
    state.client = client;
    await client.startServer();
    console.log('🔥 Warming up OmniFocus (read + mutation paths)...');
    await warmupOmniFocus(client);
    console.log('✅ Shared MCP server ready (cache warmed, OmniFocus warmed)');
    state.isFirstAccess = false; // First access complete
    registerShutdownHook();
    return client;
  })();

  return state.initPromise;
}

// OMN-261: setup-integration.ts's globalTeardown runs in a separate OS
// process from the worker fork that actually owns this client — its call to
// shutdownSharedClient() can never reach `state.client` there (confirmed:
// the 2026-07-08 profiler logged that call at 1 call/0s, impossible for a
// real IPC-round-trip shutdown). Register a real in-process graceful
// shutdown instead, once, the first time a client is created.
function registerShutdownHook(): void {
  const state = getState();
  if (state.shutdownHookRegistered) return;
  state.shutdownHookRegistered = true;
  process.once('beforeExit', () => {
    void shutdownSharedClient();
  });
}
```

- [ ] **Step 3: Update `shutdownSharedClient` and `getSharedClientSync` to read the state object**

Replace:

```typescript
export async function shutdownSharedClient(): Promise<void> {
  // OMN-186: end-of-run cost — profiled when FIXTURE_PROFILE=1
  return profileFixture('globalTeardown', 'shutdownSharedClient', async () => {
    if (sharedClient) {
      console.log('🧹 Shutting down shared MCP server...');
      await sharedClient.thoroughCleanup();
      await sharedClient.stop();
      sharedClient = null;
      initPromise = null;
      isFirstAccess = true; // Reset for next test run
      console.log('✅ Shared MCP server shutdown complete');
    }
  });
}

export function getSharedClientSync(): MCPTestClient {
  if (!sharedClient) {
    throw new Error('Shared MCP client not initialized. Call getSharedClient() first.');
  }
  return sharedClient;
}
```

with:

```typescript
export async function shutdownSharedClient(): Promise<void> {
  // OMN-186/OMN-261: real end-of-run cost now (called from the beforeExit
  // hook inside the actual worker-fork process) — profiled when
  // FIXTURE_PROFILE=1.
  return profileFixture('globalTeardown', 'shutdownSharedClient', async () => {
    const state = getState();
    if (state.client) {
      console.log('🧹 Shutting down shared MCP server...');
      await state.client.thoroughCleanup();
      await state.client.stop();
      state.client = null;
      state.initPromise = null;
      state.isFirstAccess = true; // Reset for next test run
      console.log('✅ Shared MCP server shutdown complete');
    }
  });
}

export function getSharedClientSync(): MCPTestClient {
  const state = getState();
  if (!state.client) {
    throw new Error('Shared MCP client not initialized. Call getSharedClient() first.');
  }
  return state.client;
}
```

- [ ] **Step 4: Remove the dead cross-process shutdown call from `setup-integration.ts`**

In `tests/support/setup-integration.ts`, remove the import:

```typescript
import { shutdownSharedClient } from '../integration/helpers/shared-server.js';
```

and remove from `teardown()`:

```typescript
// Shutdown shared client
await shutdownSharedClient();
```

Replace with a one-line comment at the same spot explaining the removal:

```typescript
// OMN-261: shared-client shutdown no longer lives here — globalTeardown
// runs in a separate OS process from the worker fork that owns the real
// client, so this call could never reach it (confirmed dead at 1 call/0s
// in the 2026-07-08 profile). shared-server.ts now registers its own
// process.once('beforeExit', ...) hook inside the worker fork itself.
```

- [ ] **Step 5: Build and run the full unit suite**

Run: `npm run build && npm run test:unit` Expected: build clean, all unit tests PASS (no regressions from the
`shutdownSharedClient` signature/behavior change — check specifically for any unit test mocking
`sharedClient`/`initPromise` as module exports rather than through the public functions, since those would now need to
go through `getState()`).

- [ ] **Step 6: Commit**

```bash
git add tests/integration/helpers/shared-server.ts tests/support/setup-integration.ts
git commit -m "fix(OMN-261): share the MCP server across integration files via globalThis, add real beforeExit shutdown"
```

---

### Task 3b: Deterministic shutdown via a PID file (added after Task 4's first run exposed the `beforeExit` gap)

**Why:** Task 4's first live run showed `getSharedClient.init`/`reuse` working exactly as designed (1 init, 16 reuses),
but the `beforeExit` hook from Task 3 never fired — no shutdown log line, and one real orphaned `dist/index.js` process
(PPID 1, reparented to launchd) appeared that wasn't in the before-snapshot. Investigation (read-only, all claims
confirmed against actual source, not guessed):

- `node_modules/tinypool/dist/index.js`'s `ProcessWorker.terminate()` tears down a `forks`-pool worker with an
  **external** `this.process.kill()` (default SIGTERM) from tinypool's own pool process, falling back to SIGKILL after
  1000ms if the worker hasn't died — NOT a `process.exit()` call from inside the worker.
- `node_modules/vitest/dist/worker.js` only registers a `SIGTERM` handler inside the worker when Node's own profiling
  flags (`--prof`, `--cpu-prof`, etc.) are present — unrelated to our own `FIXTURE_PROFILE=1` env var convention. Our
  real runs set no such flags, so **no handler is registered for the incoming SIGTERM at all**, meaning Node's default
  disposition (immediate termination, no more JS runs) applies. Neither `'exit'` nor `'beforeExit'` fires — this isn't a
  "wrong event name" bug, the worker process gets **zero** JS-level teardown opportunity under real suite runs.
- The orphaned MCP server (`dist/index.js`, a _grandchild_ of tinypool's pool process — child of the worker fork, not of
  tinypool directly) is NOT killed when its immediate parent (the worker fork) dies; grandchildren reparent to `launchd`
  (`PPID 1`) instead. It eventually exits on its own once the worker fork's death closes every fd it held, including the
  stdin pipe into the server — the server's own `process.stdin.on('end'/'close', ...)` handler (`src/index.ts`, the same
  convention CLAUDE.md documents) then calls `gracefulExit()` → `process.exit(0)`. That's why it eventually died with no
  `🧹 Shutting down shared MCP server...` line: that string only exists in `shared-server.ts`, which never got to run.
  The delay before that happens is OS pipe-teardown timing, not something in this repo's control.

**Conclusion:** no hook registered _inside_ the worker fork process can be relied on for this. This repo already solves
an equivalent problem — a PID recorded in a durable file, liveness-checked from a **different** process — for the
OMN-143 integration lock (`tests/support/integration-guard.ts`'s `DEFAULT_LOCK_PATH`/`pidIsAlive`). Reuse that exact
pattern instead of a new one: `globalTeardown` (which reliably runs once, in the orchestrator process, after the whole
worker-fork phase ends — see Task 3's own rationale) reads a PID file written at spawn time and sends a prompt
`SIGTERM`. This sidesteps the worker-teardown mechanism entirely; it doesn't matter whether tinypool SIGTERMs, SIGKILLs,
or does anything else to the worker, because the kill now happens from a process that isn't the worker.

Keep the existing `beforeExit` hook from Task 3 as harmless defense-in-depth (it costs nothing and might fire under some
other invocation this repo doesn't currently exercise, e.g. a profiling run) — the PID-file mechanism below becomes the
primary, guaranteed path.

**Files:**

- Modify: `tests/integration/helpers/mcp-test-client.ts` (expose the spawned child's PID)
- Modify: `tests/integration/helpers/shared-server.ts` (record the PID at spawn; export the kill function)
- Modify: `tests/support/setup-integration.ts` (call the kill function from both `setup()` and `teardown()`)
- Create: `tests/unit/integration-helpers/shared-server-pid-file.test.ts`

- [ ] **Step 1: Expose the child's PID from `MCPTestClient`**

In `tests/integration/helpers/mcp-test-client.ts`, add this accessor near the top of the class (it already has a
`transport` field — see the `private readonly transport: StdioJsonRpcTransport;` declaration):

```typescript
  /** PID of the spawned server child process, once `startServer()` has run. */
  get pid(): number | undefined {
    return this.transport.child.pid;
  }
```

(`StdioJsonRpcTransport` already exposes `get child(): ChildProcess` for exactly this kind of use — see
`tests/integration/helpers/stdio-jsonrpc-transport.ts`.)

- [ ] **Step 2: Write the failing unit test for the PID-file kill function**

`tests/unit/integration-helpers/shared-server-pid-file.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

describe('killOrphanedSharedServer', () => {
  let dir: string;
  let pidFilePath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'omn261-pidfile-'));
    pidFilePath = join(dir, 'shared-server.pid');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('does nothing when no PID file exists', async () => {
    const { killOrphanedSharedServer } = await import('../../integration/helpers/shared-server.js');
    expect(() =>
      killOrphanedSharedServer({
        pidFilePath,
        isPidAlive: () => true,
        kill: () => {
          throw new Error('should not be called');
        },
      }),
    ).not.toThrow();
  });

  it('sends SIGTERM to a live PID and removes the file', async () => {
    const fs = await import('fs');
    fs.writeFileSync(pidFilePath, '4242', 'utf-8');
    const { killOrphanedSharedServer } = await import('../../integration/helpers/shared-server.js');

    const killed: Array<{ pid: number; signal: string }> = [];
    killOrphanedSharedServer({
      pidFilePath,
      isPidAlive: (pid) => pid === 4242,
      kill: (pid, signal) => killed.push({ pid, signal }),
    });

    expect(killed).toEqual([{ pid: 4242, signal: 'SIGTERM' }]);
    expect(existsSync(pidFilePath)).toBe(false);
  });

  it('removes the file but does not kill when the recorded PID is no longer alive', async () => {
    const fs = await import('fs');
    fs.writeFileSync(pidFilePath, '4242', 'utf-8');
    const { killOrphanedSharedServer } = await import('../../integration/helpers/shared-server.js');

    killOrphanedSharedServer({
      pidFilePath,
      isPidAlive: () => false,
      kill: () => {
        throw new Error('should not be called');
      },
    });

    expect(existsSync(pidFilePath)).toBe(false);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest tests/unit/integration-helpers/shared-server-pid-file.test.ts --run` Expected: FAIL —
`killOrphanedSharedServer` is not exported from `shared-server.ts` yet.

- [ ] **Step 4: Implement PID recording + the kill function in `shared-server.ts`**

Add near the top of `tests/integration/helpers/shared-server.ts` (alongside the existing imports):

```typescript
import { mkdirSync, writeFileSync, readFileSync, existsSync, unlinkSync } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { pidIsAlive } from '../../support/integration-guard.js';

// OMN-261: mirrors the OMN-143 lock's PID-in-a-file pattern (integration-guard.ts's
// DEFAULT_LOCK_PATH/pidIsAlive) — see Task 3b's rationale for why no in-process
// exit hook can be relied on to shut this down.
const SHARED_SERVER_PID_PATH = path.join(os.homedir(), '.omnifocus-mcp', 'shared-server.pid');

function recordSharedServerPid(pid: number | undefined): void {
  if (pid === undefined) return;
  try {
    mkdirSync(path.dirname(SHARED_SERVER_PID_PATH), { recursive: true });
    writeFileSync(SHARED_SERVER_PID_PATH, String(pid), 'utf-8');
  } catch {
    // Best-effort — losing this only loses the deterministic-cleanup path,
    // not correctness of the suite itself.
  }
}

/**
 * OMN-261: call from a DIFFERENT process than the one that spawned the
 * server (e.g. globalTeardown) — see Task 3b for why no hook registered
 * inside the vitest worker fork process can be relied on here.
 */
export function killOrphanedSharedServer(
  opts: {
    pidFilePath?: string;
    isPidAlive?: (pid: number) => boolean;
    kill?: (pid: number, signal: string) => void;
  } = {},
): void {
  const pidFilePath = opts.pidFilePath ?? SHARED_SERVER_PID_PATH;
  const isAlive = opts.isPidAlive ?? pidIsAlive;
  const kill = opts.kill ?? ((pid, signal) => process.kill(pid, signal));

  let raw: string;
  try {
    raw = readFileSync(pidFilePath, 'utf-8').trim();
  } catch {
    return; // no PID file — nothing to do
  }
  try {
    unlinkSync(pidFilePath);
  } catch {
    /* already gone — fine, we still act on what we read */
  }

  const pid = Number.parseInt(raw, 10);
  if (!Number.isFinite(pid) || pid <= 0) return;
  if (!isAlive(pid)) return;
  try {
    kill(pid, 'SIGTERM');
  } catch {
    /* gone between the liveness check and the kill; harmless */
  }
}
```

Then, inside `getSharedClientImpl`'s init branch (from Task 3 Step 2), right after `await client.startServer();`, add:

```typescript
recordSharedServerPid(client.pid);
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest tests/unit/integration-helpers/shared-server-pid-file.test.ts --run` Expected: PASS (all three cases)

- [ ] **Step 6: Wire the kill into `setup-integration.ts`**

In `tests/support/setup-integration.ts`, add the import:

```typescript
import { killOrphanedSharedServer } from '../integration/helpers/shared-server.js';
```

Call it defensively in `setup()`, right before the existing `fullCleanup({ scope: 'full' })` prior-run orphan hunt (same
"clean up whatever a crashed prior run left behind" spirit):

```typescript
// OMN-261: a crashed prior run may have left its shared server's PID file
// behind with the process still alive (or, more likely, already dead) —
// clear it before this run starts its own.
killOrphanedSharedServer();
```

And replace the comment Task 3 Step 4 left in `teardown()`:

```typescript
// OMN-261: shared-client shutdown no longer lives here — globalTeardown
// runs in a separate OS process from the worker fork that owns the real
// client, so this call could never reach it (confirmed dead at 1 call/0s
// in the 2026-07-08 profile). shared-server.ts now registers its own
// process.once('beforeExit', ...) hook inside the worker fork itself.
```

with:

```typescript
// OMN-261: the beforeExit hook shared-server.ts registers inside the
// worker fork is defense-in-depth only — investigation confirmed Vitest's
// forks-pool teardown (an external SIGTERM/SIGKILL from tinypool, no
// in-worker signal handler for non-profiling runs) gives the worker zero
// JS-level teardown opportunity, so beforeExit realistically never fires.
// This PID-file kill runs from THIS process instead, which always executes
// regardless of how the worker fork itself was torn down.
killOrphanedSharedServer();
```

- [ ] **Step 7: Build and run the full unit suite**

Run: `npm run build && npm run test:unit` Expected: build clean, all unit tests PASS.

- [ ] **Step 8: Commit**

```bash
git add tests/integration/helpers/mcp-test-client.ts tests/integration/helpers/shared-server.ts tests/support/setup-integration.ts tests/unit/integration-helpers/shared-server-pid-file.test.ts
git commit -m "fix(OMN-261): deterministic shared-server shutdown via a PID file, not an in-worker exit hook"
```

**Do not re-run Task 4's full live verification yet** — OMN-261 is on hold pending OMN-262 (the dedup-cache regression
Task 4's first run exposed). Stop after this commit and report back; Task 4 gets re-run once OMN-262 is resolved and
this fix is already in place.

---

### Task 4: Supervised full-suite verification

**Files:** none (verification only)

- [ ] **Step 1: Clear the stale fixture-profile log**

Run: `rm -f tests/integration/fixture-profile.jsonl`

- [ ] **Step 2: Snapshot any pre-existing dist/index.js processes**

Run: `pgrep -fl 'dist/index.js' || echo "none running"` Record the output — this is the BEFORE snapshot for the orphan
check in Step 5.

- [ ] **Step 3: Build and run the full suite with profiling, in the background**

Run (background, do not kill, ~15-20 min):

```bash
npm run build
FIXTURE_PROFILE=1 npx vitest tests/integration --run --reporter=json --outputFile.json=/tmp/omn261-pertest.json
```

- [ ] **Step 4: Aggregate the fixture-profile log**

```bash
jq -s 'group_by(.op) | map({op: .[0].op, calls: length, total_s: ((map(.ms) | add) / 1000 | round), avg_s: ((map(.ms) | add) / length / 1000 * 100 | round) / 100})' tests/integration/fixture-profile.jsonl
```

Expected: `getSharedClient.init` calls drops from 13 to 1 (or very close — exactly 1 if file execution is strictly
serial with no concurrent first-calls); `getSharedClient.reuse` calls rises to ~16. `shutdownSharedClient` (op, hook
`globalTeardown`) should show a NON-ZERO duration now (real cleanup, not the old 0s no-op) — if it's still 0s, the
`beforeExit` hook did not fire; investigate before declaring success (see [`superpowers:systematic-debugging`] rather
than guessing).

- [ ] **Step 5: Confirm zero orphaned server processes**

Run: `pgrep -fl 'dist/index.js' || echo "none running"` Expected: matches (or is a subset of) the Step 2 BEFORE snapshot
— no NEW lingering `dist/index.js` processes from this run. If there's a mismatch, this is a real regression (a spawned
server outlived the run) — stop and report, do not proceed to Task 5.

- [ ] **Step 6: Confirm test correctness**

```bash
jq '{numTotalTests, numPassedTests, numFailedTests, numPendingTests}' /tmp/omn261-pertest.json
```

Expected: `numFailedTests: 0`, same `numTotalTests`/`numPassedTests`/`numPendingTests` as the pre-change baseline (178
passed / 0 failed / 22 pending, plus +3 for the new diagnostic probe files from Task 1 — expect 181 passed / 0 failed /
22 pending, or note if the count differs and explain why before proceeding).

- [ ] **Step 7: Check for the "No orphaned test data found" / zero fixture-leak signal**

```bash
grep -iE "fail|error|scanForFixtures|FIXTURE LEAK" <the run's stdout log> | grep -v "No orphaned test data found"
```

Expected: no output.

---

### Task 5: Document + close out

**Files:**

- Modify: `tests/integration/PERFORMANCE.md`

- [ ] **Step 1: Add a new section to `PERFORMANCE.md`** documenting the design and the Task 4 verification numbers, in
      the same style as the existing "Per-run fixture epoch (OMN-186 Phase 2)" section — include the before/after
      `getSharedClient.init` call-count delta and the actual measured `getSharedClient.init` total-seconds delta from
      Task 4's aggregation, plus a note that raw suite wall is still not the tracked metric (same caveat as OMN-186).

- [ ] **Step 2: Commit**

```bash
git add tests/integration/PERFORMANCE.md
git commit -m "docs(OMN-261): document the shared-server globalThis fix + verification numbers"
```

- [ ] **Step 3: Push the branch and open a DRAFT PR — do not merge**

```bash
git push -u origin <branch-name>
gh pr create --repo kip-d/omnifocus-mcp --draft --title "fix(OMN-261): share the MCP server across integration files via globalThis" --body "$(cat <<'EOF'
## Summary
- Root cause: vitest's default `isolate:true` (forks pool) resets shared-server.ts's module-scope singleton on every test file, even under `singleFork:true` (one process, many fresh module registries) — so 13 of 17 `getSharedClient()` calls spawned a fresh MCP server instead of reusing one, and the file's own docstring's "one server per run" design never actually worked.
- Fix: move the singleton state onto a `globalThis`-keyed slot (survives the per-file reset); add a real `process.once('beforeExit', ...)` graceful shutdown inside the worker-fork process, since `globalTeardown`'s call to `shutdownSharedClient()` runs in a separate OS process and could never reach the real client (confirmed dead at 1 call/0s in the 2026-07-08 profile).
- Zero test-file edits — same invariant OMN-186 held to.
- New permanent regression-pinning test (`tests/integration/_diagnostics/module-isolation-probe-*`) proves the vitest isolation behavior this fix depends on, against the real integration-suite config.

## Test plan
- [ ] `npm run test:unit` green
- [ ] Supervised `FIXTURE_PROFILE=1` full-suite run: `getSharedClient.init` 13→1, zero orphaned `dist/index.js` processes, zero test regressions (see PERFORMANCE.md for numbers)
- [ ] Kip's `/code-review` gate

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Post the same summary as a comment on OMN-261**, and leave the ticket state as-is (In Progress /
      whatever it currently is) — do NOT mark it Done. Closing is gated on Kip's `/code-review` per this repo's review
      protocol; that happens after this PR, not as part of this plan.

---

## Notes for the executing agent

- **Do not merge this PR.** Repo norm: Kip runs `/code-review` before any merge. Stop after Task 5 Step 3.
- **Do not skip Task 4's live verification** even though it's slow (~15-20 min) — it's the only thing that actually
  proves the fix works, exactly like OMN-186's own VERIFY-DEBT. Run it via `run_in_background`, never kill it
  (orphaned-worker hazard, OMN-143).
- **Test independence** (OMN-261's own acceptance criterion) already relies on the _existing_ `clearCache()` call
  between file accesses — `shared-server.ts`'s docstring already documented this as the cross-pollution guard, it just
  never fired for 13 of 17 files because they never reached the reuse branch. This plan doesn't change that guard's
  logic, only makes it actually execute for every file. Task 4 Step 6 (zero failures across the whole suite) is the
  practical proof it still holds: any real cross-file pollution would surface as a downstream test failure once every
  file is genuinely sharing one client.
- If Task 1's probe assertions fail, or Task 4's `getSharedClient.init` count doesn't drop close to 1, **stop and
  report** rather than adjusting the plan on your own — the root-cause premise would be wrong and needs
  re-investigation, not a workaround.
- If you find an existing unit test that mocks or imports `sharedClient`/`initPromise` as named exports directly (rather
  than through `getSharedClient`/`getSharedClientSync`/`shutdownSharedClient`), it will break under this refactor since
  those bindings no longer exist as module exports — that's expected; update the test to go through the public
  functions, don't reintroduce the module-scope bindings to avoid touching it.
