import { defineConfig, devices } from '@playwright/test';

/**
 * Runs against the same dev-mode API, worker and storefront harness used locally (`pnpm dev`) —
 * `reuseExistingServer` picks those up if they're already running, or Playwright starts fresh
 * ones from a clean checkout. This shares the dev database/bucket rather than a dedicated
 * `aiart-e2e` one; the two seeded designs' names are unique enough that the test doesn't need
 * isolation from other local testing.
 */
export default defineConfig({
  testDir: '.',
  timeout: 45_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: 'node --import tsx src/server.ts',
      cwd: '../../apps/api',
      url: 'http://localhost:4000/health',
      reuseExistingServer: true,
      timeout: 30_000,
    },
    {
      command: 'node --import tsx src/server.ts',
      cwd: '../../apps/worker',
      url: 'http://localhost:4001/health',
      reuseExistingServer: true,
      timeout: 30_000,
    },
    {
      command: 'node --import tsx node_modules/vite/bin/vite.js',
      cwd: '../../apps/storefront',
      url: 'http://localhost:5173',
      reuseExistingServer: true,
      timeout: 30_000,
    },
  ],
  // Uses the system's installed Chrome (`channel: 'chrome'`) instead of a Playwright-managed
  // Chromium download — avoids `playwright install` entirely where Chrome is already present.
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], channel: 'chrome' } }],
});
