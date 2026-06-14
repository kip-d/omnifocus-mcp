/**
 * Suite-timing vitest reporter (OMN-182).
 *
 * Writes an integration timing artifact (schema `omn-182-integration-timing@1`) consumed by
 * `scripts/record-suite-timing.ts --integration-json`. This replaces the manual
 * `--integration-wall <s> --integration-tests <n>` bookkeeping that kept the suite-timing log
 * stagnant — running `npm run baseline:integration` now captures the numbers automatically.
 *
 * GATED ON `INTEGRATION_TIMING_JSON`: when that env var is unset the reporter is a complete
 * no-op. That is deliberate — it lets the reporter be attached via `--reporter` on the
 * dedicated `baseline:integration` target WITHOUT a row ever being written by a plain
 * `test:integration` run, so verifying sessions never get a dirty SUITE_TIMING_LOG.md.
 *
 * `totalTests` counts tests that actually ran (pass + fail), excluding skipped ones — matching
 * the historical row semantics (e.g. "166 passed / 0 failed / 22 skipped" was recorded as 166).
 */

import { writeFileSync } from 'fs';
import type { Reporter } from 'vitest/node';
import { INTEGRATION_ARTIFACT_SCHEMA, type IntegrationArtifact } from '../../scripts/lib/suite-timing.js';

/** Minimal structural view of a vitest task tree node — enough to walk and count leaf tests. */
interface TaskNode {
  type?: string;
  mode?: string;
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

export default class SuiteTimingReporter implements Reporter {
  private startMs = 0;

  onInit(): void {
    this.startMs = Date.now();
  }

  onFinished(files: TaskNode[] = []): void {
    const out = process.env.INTEGRATION_TIMING_JSON;
    if (!out) return; // no-op unless explicitly recording

    const artifact: IntegrationArtifact = {
      schema: INTEGRATION_ARTIFACT_SCHEMA,
      wallMs: Date.now() - this.startMs,
      totalTests: files.reduce((sum, f) => sum + countRanTests(f.tasks), 0),
    };
    writeFileSync(out, JSON.stringify(artifact, null, 2) + '\n');
    process.stderr.write(
      `[suite-timing] wrote integration artifact → ${out} (${artifact.totalTests} tests, ${Math.round(
        artifact.wallMs / 1000,
      )}s)\n`,
    );
  }
}
