#!/usr/bin/env npx tsx
/**
 * Measure the OmniJS bridge RETURN-path size limit.
 *
 * docs/dev/SCRIPT_SIZE_LIMITS.md documents an empirically-measured limit for
 * the evaluateJavascript() INPUT side (~261,124 chars, the size of the OmniJS
 * source string JXA can hand to the bridge). That measurement says nothing
 * about the RETURN side — how large a string evaluateJavascript() can hand
 * BACK to JXA. workflow-analysis-v3.ts (OMN-233) extrapolates a conservative
 * RAW_DATA_BYTE_BUDGET from the input-side figure because the return path has
 * never been separately measured. This script closes that gap.
 *
 * Method (mirrors docs/dev/SCRIPT_SIZE_LIMITS.md's binary-search approach,
 * applied to the opposite data-flow direction):
 *   1. Build a JXA wrapper script that calls
 *      `app.evaluateJavascript(omniJsSnippet)`, where the OmniJS snippet
 *      constructs a string of exactly N characters and returns it.
 *   2. The JXA wrapper JSON.stringifies the returned string and writes it to
 *      stdout (the exact path our MCP server's OmniAutomation.ts uses:
 *      spawn('osascript', ['-l', 'JavaScript']) + stdin piping).
 *   3. Binary search N between a known-good floor and a known-bad ceiling
 *      until the search window is within TOLERANCE_CHARS, recording the
 *      largest N that (a) exits 0, (b) round-trips the exact expected length
 *      back through JSON.parse.
 *
 * This measures the full round trip (evaluateJavascript return -> JXA
 * JSON.stringify -> stdout -> our node-side JSON.parse), which is the
 * relevant limit for data.tasks in workflow-analysis-v3.ts: that payload
 * takes exactly this path. It does not isolate which layer fails first if
 * failure occurs (evaluateJavascript's own return-size limit vs. stdout pipe
 * buffering vs. JSON.stringify inside JXA) — see the printed diagnostics on a
 * failing boundary run for a hint, but treat the reported number as the
 * limit for OUR usage pattern, not a fundamental platform constant.
 *
 * DO NOT RUN THIS UNSUPERVISED. It requires a live, unlocked OmniFocus
 * instance (evaluateJavascript executes against the real app) and repeatedly
 * spawns osascript processes near the failure boundary, which can be slow
 * and, per SCRIPT_SIZE_LIMITS.md's prior boundary testing, occasionally
 * flaky right at the edge. Kip runs this manually, supervised:
 *
 *   npx tsx scripts/measure-bridge-return-limit.ts
 *
 * Optional env vars:
 *   MEASURE_FLOOR=<n>      starting known-good size (default 10000)
 *   MEASURE_CEILING=<n>    starting known-bad size (default 400000)
 *   MEASURE_TOLERANCE=<n>  binary-search stop window, in chars (default 1024)
 *   MEASURE_TIMEOUT_MS=<n> per-attempt osascript timeout (default 20000)
 *
 * On completion, replace RAW_DATA_BYTE_BUDGET in
 * src/omnifocus/scripts/analytics/workflow-analysis-v3.ts with a figure
 * derived from the measured boundary (leave headroom below it — don't set
 * the budget AT the measured ceiling), and update the comments there and in
 * docs/dev/SCRIPT_SIZE_LIMITS.md to cite the new measurement in place of the
 * "extrapolated, pending measurement" language.
 */

import { spawn } from 'child_process';

interface AttemptResult {
  size: number;
  success: boolean;
  detail: string;
}

const FLOOR = parseInt(process.env.MEASURE_FLOOR || '10000', 10);
const CEILING = parseInt(process.env.MEASURE_CEILING || '400000', 10);
const TOLERANCE = parseInt(process.env.MEASURE_TOLERANCE || '1024', 10);
const TIMEOUT_MS = parseInt(process.env.MEASURE_TIMEOUT_MS || '20000', 10);

function buildWrapperScript(size: number): string {
  // OmniJS snippet: build a string of exactly `size` characters and return it.
  // JXA snippet: call the bridge, JSON.stringify the result, print it.
  // Matches our production execution pattern (OmniAutomation.ts): a JXA IIFE
  // that calls Application('OmniFocus').evaluateJavascript(...) and prints
  // JSON via console.log so stdout is the sole channel back to node.
  return `
    (() => {
      const app = Application('OmniFocus');
      const omniJsSnippet = \`
        (() => {
          return 'x'.repeat(${size});
        })()
      \`;
      const result = app.evaluateJavascript(omniJsSnippet);
      return JSON.stringify({ length: result.length });
    })()
  `;
}

function runAttempt(size: number): Promise<AttemptResult> {
  return new Promise((resolve) => {
    const script = buildWrapperScript(size);
    const proc = spawn('osascript', ['-l', 'JavaScript'], { timeout: TIMEOUT_MS });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });
    proc.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on('error', (error) => {
      resolve({ size, success: false, detail: `spawn error: ${error.message}` });
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        resolve({ size, success: false, detail: `exit ${code}: ${stderr.trim().slice(0, 300)}` });
        return;
      }
      try {
        const parsed = JSON.parse(stdout.trim());
        if (parsed && parsed.length === size) {
          resolve({ size, success: true, detail: 'round-trip length matched' });
        } else {
          resolve({
            size,
            success: false,
            detail: `length mismatch: expected ${size}, got ${parsed && parsed.length}`,
          });
        }
      } catch (e) {
        resolve({
          size,
          success: false,
          detail: `JSON.parse failed: ${e instanceof Error ? e.message : String(e)}`,
        });
      }
    });

    proc.stdin.write(script);
    proc.stdin.end();
  });
}

async function binarySearch(): Promise<void> {
  console.log('Measuring OmniJS bridge RETURN-path size limit.');
  console.log(`Floor: ${FLOOR}  Ceiling: ${CEILING}  Tolerance: ${TOLERANCE}  Timeout: ${TIMEOUT_MS}ms\n`);

  const floorResult = await runAttempt(FLOOR);
  if (!floorResult.success) {
    console.error(`FLOOR size ${FLOOR} already fails (${floorResult.detail}). Lower MEASURE_FLOOR and retry.`);
    process.exitCode = 1;
    return;
  }
  console.log(`✓ floor ${FLOOR} succeeds (${floorResult.detail})`);

  const ceilingResult = await runAttempt(CEILING);
  if (ceilingResult.success) {
    console.error(`CEILING size ${CEILING} still succeeds (${ceilingResult.detail}). Raise MEASURE_CEILING and retry.`);
    process.exitCode = 1;
    return;
  }
  console.log(`✓ ceiling ${CEILING} fails as expected (${ceilingResult.detail})\n`);

  let low = FLOOR;
  let high = CEILING;

  while (high - low > TOLERANCE) {
    const mid = Math.floor((low + high) / 2);
    const result = await runAttempt(mid);
    if (result.success) {
      console.log(`  ${mid.toLocaleString()} chars: OK`);
      low = mid;
    } else {
      console.log(`  ${mid.toLocaleString()} chars: FAIL (${result.detail})`);
      high = mid;
    }
  }

  console.log(`\nBoundary found within ${TOLERANCE} chars:`);
  console.log(`  Largest known-good: ${low.toLocaleString()} chars`);
  console.log(`  Smallest known-bad: ${high.toLocaleString()} chars`);
  console.log(
    `\nUpdate RAW_DATA_BYTE_BUDGET in src/omnifocus/scripts/analytics/workflow-analysis-v3.ts using a figure ` +
      `well below ${low.toLocaleString()} (leave headroom for insights/patterns/recommendations sharing the ` +
      'same return payload), and record this measurement in docs/dev/SCRIPT_SIZE_LIMITS.md.',
  );
}

binarySearch().catch((error) => {
  console.error('Measurement run failed:', error);
  process.exitCode = 1;
});
