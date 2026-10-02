import { defineConfig, devices } from '@playwright/test';

/**
 * `npm run e2e:cloud`: the app running on this machine (`npm run dev`) against
 * the cloud database, with "Cafezza Demo" loaded by `npm run seed:mock`.
 * Uses the installed Chrome. Not part of `npm run e2e`, which runs its own
 * in-memory server.
 */
export default defineConfig({
  testDir: '.',
  testMatch: 'cloudFlow.spec.js',
  outputDir: 'test-results',
  workers: 1,
  retries: 0,
  reporter: [['list']],
  expect: { timeout: 20_000 },
  use: {
    ...devices['Desktop Chrome'],
    channel: 'chrome',
    baseURL: process.env.CLOUD_BASE_URL ?? 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 20_000,
  },
});
