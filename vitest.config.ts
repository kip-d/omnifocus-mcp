import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 30000,        // 30s for most tests
    hookTimeout: 60000,        // 60s for setup/teardown hooks
    // Sandbox-friendly mode: when VITEST_SAFE=1, use single threaded pool
    ...(process.env.VITEST_SAFE === '1'
      ? { pool: 'threads' as const, maxThreads: 1, minThreads: 1 }
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
