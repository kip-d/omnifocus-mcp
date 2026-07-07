/**
 * FIXTURE PROFILER (OMN-186 Phase 1)
 *
 * Env-gated hook-duration instrumentation for the integration suite's fixture
 * machinery. The OMN-165 audit measured test BODIES (~526s of a ~1017s wall)
 * and inferred that the remaining ~400-490s is per-file fixture setup/teardown
 * — but hooks were never profiled, so the attribution is located nowhere. This
 * harness times the fixture-machinery leaf calls (sandbox setup, fullCleanup,
 * shared-server access/shutdown) and appends one JSON line per call, so a
 * single profiled run can show where that overhead actually goes.
 *
 * Usage: FIXTURE_PROFILE=1 npm run test:integration
 * Log:   FIXTURE_PROFILE_LOG (default: tests/integration/fixture-profile.jsonl)
 * Line:  {"file","hook","op","ms","at","failed"?}
 *
 * Aggregate (per-op totals):
 *   jq -s 'group_by(.op) | map({op: .[0].op, calls: length, total_s: (map(.ms) | add / 1000 | round)})' \
 *     tests/integration/fixture-profile.jsonl
 *
 * Invariants:
 * - Flag off (the default) => pure pass-through: zero writes, zero timing, no
 *   behavior change on normal runs.
 * - Profiling failures never fail the wrapped call — a broken log path must
 *   not turn a green suite red.
 * - `file` comes from vitest's expect state; calls outside a test worker
 *   (globalSetup/globalTeardown in tests/support/setup-integration.ts) record
 *   as "(global)".
 */
import { appendFileSync, mkdirSync } from 'fs';
import { dirname, join, relative } from 'path';
import { performance } from 'perf_hooks';

/**
 * Where in the vitest lifecycle the profiled call runs (best-effort label).
 * Leaf helpers pass the hook their per-file callers use (beforeAll/afterAll);
 * when the same leaf fires outside a test worker (setup-integration.ts's
 * globalSetup/globalTeardown also call fullCleanup), the recorded hook is
 * rewritten to 'global' since the per-file label would be wrong there.
 *
 * NOTE: this is the CALLER-side type. The `hook` field that lands in the
 * JSONL is `FixtureHook | 'global'` (see the rewrite in profileFixture) —
 * filter the log on 'beforeAll' | 'afterAll' | 'global' | 'globalTeardown'.
 */
export type FixtureHook = 'beforeAll' | 'afterAll' | 'globalTeardown';

export function fixtureProfilingEnabled(): boolean {
  return process.env.FIXTURE_PROFILE === '1';
}

function logPath(): string {
  return process.env.FIXTURE_PROFILE_LOG ?? join(process.cwd(), 'tests', 'integration', 'fixture-profile.jsonl');
}

/**
 * Current test file (repo-relative), or "(global)" outside a test worker.
 *
 * Reads vitest's `expect` off globalThis (config sets `globals: true`) instead
 * of importing it: this module is transitively loaded by the globalSetup
 * script (tests/support/setup-integration.ts), and importing test utilities
 * from 'vitest' outside a worker throws.
 */
function currentTestFile(): string {
  try {
    const globalExpect = (globalThis as { expect?: { getState(): { testPath?: string } } }).expect;
    const testPath = globalExpect?.getState().testPath;
    if (testPath) return relative(process.cwd(), testPath);
  } catch {
    // expect state is unavailable outside a running test worker
  }
  return '(global)';
}

let warnedWriteFailure = false;
// Ensure the log directory once per run, not per profiled call — the profiler
// measures fixture overhead, so it must not add a syscall to every event.
let logDirEnsured = false;

function record(entry: Record<string, unknown>): void {
  try {
    const path = logPath();
    if (!logDirEnsured) {
      mkdirSync(dirname(path), { recursive: true });
      logDirEnsured = true;
    }
    appendFileSync(path, `${JSON.stringify(entry)}\n`);
  } catch (err) {
    // Profiling must never fail the fixture call it wraps — but a profiled
    // run whose log can't be written must not finish looking successful
    // (the whole run exists to produce this file), so warn once.
    if (!warnedWriteFailure) {
      warnedWriteFailure = true;
      console.warn(`[fixture-profiler] failed to write ${logPath()}: ${String(err)} — profile data will be incomplete`);
    }
  }
}

/**
 * Time an async fixture-machinery call and append a JSONL entry when
 * FIXTURE_PROFILE=1. Pass-through (no timing, no I/O) otherwise. The wrapped
 * fn's result/rejection propagates unchanged; a rejection is still recorded
 * (failed: true) since a failing teardown costs wall time too.
 */
export async function profileFixture<T>(hook: FixtureHook, op: string, fn: () => Promise<T>): Promise<T> {
  if (!fixtureProfilingEnabled()) return fn();

  const file = currentTestFile();
  const hookLabel = file === '(global)' && (hook === 'beforeAll' || hook === 'afterAll') ? 'global' : hook;
  const start = performance.now();
  try {
    const result = await fn();
    record({ file, hook: hookLabel, op, ms: Math.round(performance.now() - start), at: new Date().toISOString() });
    return result;
  } catch (err) {
    record({
      file,
      hook: hookLabel,
      op,
      ms: Math.round(performance.now() - start),
      at: new Date().toISOString(),
      failed: true,
    });
    throw err;
  }
}
