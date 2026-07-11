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
