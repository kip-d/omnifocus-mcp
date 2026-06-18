import { defineConfig } from 'vitest/config';

// Dedicated vitest config for Stryker mutation testing (src/contracts/ast/).
//
// Why a separate config instead of reusing vitest.config.ts:
//   1. setup-worker-guard.ts (OMN-143) kills a worker on a ppid->1 transition. Stryker tears
//      down and respawns vitest workers between mutant runs, which can reparent them to init
//      and trip the guard. Omit it here — mutation runs never orphan a live OF session.
//   2. The integration globalSetup (teardown of OF sandbox tasks) is irrelevant to unit-only
//      mutation runs and adds startup cost. Omit it.
//
// Only unit tests run: they mock OmniAutomation (setup-unit.ts), so no real OmniFocus is touched
// and tests can run in parallel. coverageAnalysis:'perTest' (in stryker.config.json) then narrows
// each mutant to its covering tests.
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Scope the test universe to the AST-referencing unit tests (derived from
    // `grep -rl contracts/ast tests/unit`). Two reasons:
    //   1. Speed: STATIC mutants (the big OmniJS template literals) re-run the WHOLE included
    //      suite each. Against all 3417 unit tests that projected to ~18h for the full dir; scoped
    //      to the ~45 AST tests it drops to minutes.
    //   2. Stability: the full suite intermittently spawns real OmniFocus from a non-mocked tool
    //      test ("Spawn failed"), which aborts Stryker's dry run. The contracts tests are pure
    //      mock-based unit tests.
    // Tradeoff: a mutant only killed by an EXCLUDED test (e.g. an indirect tool test) reports as
    // Survived. That's the SAFE direction for a coverage-gap audit — it over-flags, never hides a
    // real gap. Widen this list if you need to attribute a specific survivor.
    include: [
      'tests/unit/contracts/**/*.test.ts',
      'tests/unit/tag-operations.test.ts',
      'tests/unit/tag-conversion.test.ts',
      'tests/unit/ast-phase3-builders.test.ts',
      'tests/unit/task-search-limit.test.ts',
    ],
    setupFiles: ['tests/support/setup-unit.ts'],
    exclude: ['.claude/worktrees/**', 'node_modules/**', 'dist/**'],
  },
});
