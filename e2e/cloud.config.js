import { defineConfig, devices } from '@playwright/test';

/**
 * `npm run e2e:cloud`: the app running on this machine (`npm run dev`) against
 * a cloud database. Uses the installed Chrome. Not part of `npm run e2e`, which
 * runs its own in-memory server.
 *
 * It creates a real bill. CLAUDE.md says never to create a bill in production
 * to test something, and the cloud database now holds a live restaurant's real
 * bills (P25). So it refuses to start unless `E2E_CLOUD_DATABASE` is set and is
 * exactly the database name in `MONGO_URI`: a person has to name the database
 * on purpose, and docs/DEPLOYMENT.md says it must only ever be a separate
 * staging database. `E2E_CLOUD_RESTAURANT` names the restaurant it plays in.
 */
try {
  process.loadEnvFile('.env');
} catch {
  // No .env here: the variables must already be in the environment.
}

/** The database name in a MongoDB connection string, "test" when it has none. */
export function databaseNameOf(uri) {
  const afterHost = uri.replace(/^mongodb(\+srv)?:\/\/[^/]*/, '');
  const name = afterHost.replace(/^\//, '').split('?')[0];
  return name || 'test';
}

const uri = process.env.MONGO_URI ?? '';
const named = process.env.E2E_CLOUD_DATABASE ?? '';
if (!uri) throw new Error('e2e:cloud needs MONGO_URI, the staging database the app is running against.');
if (!named) {
  throw new Error('e2e:cloud refuses to start without E2E_CLOUD_DATABASE. Set it to the staging database name. Never production.');
}
if (named !== databaseNameOf(uri)) {
  throw new Error(`E2E_CLOUD_DATABASE is "${named}" but MONGO_URI points at "${databaseNameOf(uri)}". Refusing.`);
}
if (!process.env.E2E_CLOUD_RESTAURANT) {
  throw new Error('e2e:cloud needs E2E_CLOUD_RESTAURANT, the exact name of the staging restaurant it plays in.');
}

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
