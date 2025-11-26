import { defineConfig } from 'vitest/config';

const isIntegrationTest = process.argv.some(arg => arg.includes('tests/integration'));
const isSmokeTest = process.argv.some(arg => arg.includes('tests/smoke'));
const needsOmniFocus = isIntegrationTest || isSmokeTest;

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['tests/support/setup-unit.ts'],
    globalSetup: isIntegrationTest ? ['tests/support/setup-integration.ts'] : undefined,
    testTimeout: isIntegrationTest ? 120000 : 30000,     // 2min for integration, 30s for unit
    hookTimeout: isIntegrationTest ? 300000 : 60000,     // 5min for integration (cleanup accumulates), 1min for unit
    // OmniFocus tests MUST run sequentially to prevent resource contention
    // Multiple concurrent osascript processes cause timeouts and failures
    ...(needsOmniFocus || process.env.VITEST_SAFE === '1'
      ? { pool: 'forks' as const, poolOptions: { forks: { singleFork: true } } }
      : {}),
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      // Measure coverage only for source files
      include: [
        'src/**',
      ],
      thresholds: {
        global: {
          branches: 75,
          functions: 80,
          lines: 85,
          statements: 85
        }
      },
      exclude: [
        'node_modules/**',
        'dist/**',
        'tests/**',            // never include tests in coverage
        'archive/**',          // exclude archived experimental content
        'scripts/**',          // local maintenance scripts
        'docs/**',             // documentation helpers
        'eslint-rules/**',
        '*.config.ts',
        '*.config.js',
        'src/omnifocus/scripts/**', // These are template strings, not executable code
        'src/prompts/**',                               // prompt content (non-executable)
        'src/tools/analytics/PatternAnalysisTool.ts',  // legacy v1 tool superseded by V2
        'src/omnifocus/plugins/PluginRegistry.ts',     // registry shell, no runtime logic to test
      ],
    },
    // Environment-specific configurations
    env: {
      'test:integration': {
        testTimeout: 60000,    // 60s for integration tests
        hookTimeout: 120000,   // 2min for complex setup
      },
      'test:performance': {
        testTimeout: 120000,   // 2min for performance tests
        hookTimeout: 60000,    // 1min for setup
      }
    }
  },
});
