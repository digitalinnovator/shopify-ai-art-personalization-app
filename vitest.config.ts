import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['packages/*/test/**/*.test.ts', 'apps/*/test/**/*.test.ts'],
          exclude: ['**/node_modules/**', '**/*.int.test.ts'],
          env: { NODE_ENV: 'test', LOG_LEVEL: 'silent' },
        },
      },
      {
        test: {
          name: 'integration',
          include: ['packages/*/test/**/*.int.test.ts', 'apps/*/test/**/*.int.test.ts'],
          exclude: ['**/node_modules/**'],
          setupFiles: ['./test/setup-integration.ts'],
          // Integration tests share one database, bucket and queue prefix.
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
