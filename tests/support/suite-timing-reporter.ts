/**
 * Suite-timing vitest reporter (OMN-182).
 *
 * Appends ONE JSONL record per integration run to the per-machine suite-timing log
 * (`$XDG_STATE_HOME/of-mcp-suite-timing/runs.jsonl`, see scripts/lib/suite-timing.ts). It is
 * attached only to non-unit runs (vitest.config.ts gates on `isUnitTestOnly`), so it records
 * every real integration run automatically — no manual bookkeeping, no opt-in target.
 *
 * Writing to a per-machine state file (not a tracked repo file) is deliberate: recording every
 * run never dirties a worktree, and the captured machine load (load/cpu/mem) is inherently
 * machine-local data that lets a slow run be attributed to a busy box vs. genuine suite growth.
 *
 * `totalTests` counts tests that actually ran (pass + fail), excluding skipped ones — matching
 * the historical row semantics (e.g. "166 passed / 0 failed / 22 skipped" was recorded as 166).
 */

import { execFileSync } from 'child_process';
import type { Reporter } from 'vitest/node';
import { appendRun, buildIntegrationRecord, captureEnv, defaultLogPath } from '../../scripts/lib/suite-timing.js';

/** Minimal structural view of a vitest task tree node — enough to walk and count leaf tests. */
interface TaskNode {
  type?: string;
  result?: { state?: string };
  tasks?: TaskNode[];
}

function countRanTests(tasks: TaskNode[] | undefined): number {
  if (!tasks) return 0;
  let n = 0;
  for (const t of tasks) {
    if (t.type === 'suite') {
      n += countRanTests(t.tasks);
    } else if (t.type === 'test') {
      const state = t.result?.state;
      if (state === 'pass' || state === 'fail') n += 1;
    }
  }
  return n;
}

function gitShort(): string {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

export default class SuiteTimingReporter implements Reporter {
  // Stamp at construction so a missed onInit() can't yield wallMs ≈ Date.now() (a ~56,000-year
  // wall that would poison the log as a permanent fastest-ever outlier). onInit refines it to the
  // run's true start when it fires.
  private startMs = Date.now();

  onInit(): void {
    this.startMs = Date.now();
  }

  onFinished(files: TaskNode[] = []): void {
    const logPath = defaultLogPath();
    const record = buildIntegrationRecord({
      build: gitShort(),
      ts: new Date().toISOString(),
      wallMs: Date.now() - this.startMs,
      totalTests: files.reduce((sum, f) => sum + countRanTests(f.tasks), 0),
      env: captureEnv(),
      notes: process.env.SUITE_TIMING_NOTE,
    });
    try {
      appendRun(logPath, record);
      process.stderr.write(
        `[suite-timing] recorded run → ${logPath} (${record.totalTests} tests, ${Math.round(
          record.wallMs / 1000,
        )}s, load/cpu ${record.env.loadPerCpu})\n`,
      );
    } catch (e) {
      // Never let timing bookkeeping fail a test run — loudly note and move on.
      process.stderr.write(`[suite-timing] could not write ${logPath}: ${String(e)}\n`);
    }
  }
}
