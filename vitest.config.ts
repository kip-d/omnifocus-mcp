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
        'tests/**',
        '*.config.ts',
        '*.config.js',
        'src/omnifocus/scripts/**', // These are template strings, not executable code
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
