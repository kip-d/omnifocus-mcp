import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['packages/*/tests/unit/**/*.test.ts'],
          testTimeout: 30000,
        },
      },
      {
        test: {
          name: 'integration',
          include: ['packages/*/tests/integration/**/*.test.ts'],
          testTimeout: 180000,
          pool: 'forks',
          poolOptions: { forks: { singleFork: true } },
        },
      },
    ],
  },
});
