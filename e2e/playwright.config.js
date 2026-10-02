import { defineConfig, devices } from '@playwright/test';

/**
 * The golden day through the real screens. P21.
 *
 *   npm run e2e
 *
 * Builds the client once, then starts `server/scripts/e2eServer.js`: the real
 * app on 127.0.0.1:5055 over an in-memory database, with a clock control
 * listener on 5056 that is not part of the app. Not part of `npm test`, because
 * it takes minutes.
 */
export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.js',
  outputDir: 'test-results',
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 40 * 60 * 1000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:5055',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: {
    command: 'npm run build && NODE_ENV=test node server/scripts/e2eServer.js',
    cwd: '..',
    url: 'http://127.0.0.1:5056/ready',
    timeout: 5 * 60 * 1000,
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe',
  },
});
