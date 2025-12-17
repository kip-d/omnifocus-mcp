import { defineConfig } from 'vitest/config';

// Detect if running only unit tests (explicit path or TEST_UNIT_ONLY env var)
const isUnitTestOnly = process.argv.some((arg) => arg.includes('tests/unit')) || process.env.TEST_UNIT_ONLY === '1';

// When running ALL tests together (npm test), we need timeouts that work for integration/smoke tests
// Only use short timeouts when explicitly running unit tests only
const useShortTimeouts = isUnitTestOnly;

// Always use safe mode (sequential execution) unless explicitly running unit tests
// This prevents resource contention when integration/smoke tests are included
const useSafeMode = !isUnitTestOnly || process.env.VITEST_SAFE === '1';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['tests/support/setup-unit.ts'],
    // Global setup for integration test teardown - enable when any integration tests might run
    globalSetup: isUnitTestOnly ? undefined : ['tests/support/setup-integration.ts'],
    // Default timeouts accommodate integration tests; unit tests finish faster anyway
    // Integration tests (especially update-operations) can take 60-90s each, need 3min buffer
    testTimeout: useShortTimeouts ? 30000 : 180000, // 30s for unit-only, 3min otherwise
    hookTimeout: useShortTimeouts ? 60000 : 300000, // 1min for unit-only, 5min otherwise
    // OmniFocus tests MUST run sequentially to prevent resource contention
    // Multiple concurrent osascript processes cause timeouts and failures
    ...(useSafeMode ? { pool: 'forks' as const, poolOptions: { forks: { singleFork: true } } } : {}),
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      // Measure coverage only for source files
      include: ['src/**'],
      thresholds: {
        global: {
          branches: 75,
          functions: 80,
          lines: 85,
          statements: 85,
        },
      },
      exclude: [
        'node_modules/**',
        'dist/**',
        'tests/**', // never include tests in coverage
        'archive/**', // exclude archived experimental content
        'scripts/**', // local maintenance scripts
        'docs/**', // documentation helpers
        'eslint-rules/**',
        '*.config.ts',
        '*.config.js',
        'src/omnifocus/scripts/**', // These are template strings, not executable code
        'src/prompts/**', // prompt content (non-executable)
        'src/tools/analytics/PatternAnalysisTool.ts', // legacy v1 tool superseded by V2
        'src/omnifocus/plugins/PluginRegistry.ts', // registry shell, no runtime logic to test
      ],
    },
    // Environment-specific configurations
    env: {
      'test:integration': {
        testTimeout: 60000, // 60s for integration tests
        hookTimeout: 120000, // 2min for complex setup
      },
      'test:performance': {
        testTimeout: 120000, // 2min for performance tests
        hookTimeout: 60000, // 1min for setup
      },
    },
  },
});
