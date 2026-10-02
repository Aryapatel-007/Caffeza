/**
 * Loads the golden day of docs/TEST-DATA.md into a LOCAL database, for checking
 * the report screens by hand. P18. `npm run seed:golden`.
 *
 * It runs the same fixture the tests use, tests/helpers/goldenDay.js, through
 * the real API at the golden day's own times, then closes 26 September as the
 * Manager with ₹3,400.00 counted. Every record is a real record made by the
 * real code; nothing is written to a collection by hand.
 *
 * Local use only. It runs with NODE_ENV=test, because the fixture sets the
 * clock and the clock refuses to be set anywhere else, and it refuses any
 * database that is not localhost, through the same guard as seed:demo. A
 * previous "Cafezza Golden Day" is wiped first, so a re-run starts clean.
 */
import { pathToFileURL } from 'node:url';

import { config } from '../config/env.js';
import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { ALL_MODELS } from '../models/index.js';
import { buildGoldenDay, GOLDEN_DATE, ist } from '../tests/helpers/goldenDay.js';
import { DEFAULT_PASSWORD } from '../tests/helpers/seed.js';
import { request, startTestServer, stopTestServer } from '../tests/helpers/testServer.js';
import { resetClockForTests, setClockForTests } from '../utils/time.js';
import { assertSafeToSeed, databaseHost, wipeRestaurantNamed } from './lib/localSeed.js';

export const GOLDEN_RESTAURANT = 'Cafezza Golden Day';

async function main() {
  assertSafeToSeed();
  if (config.NODE_ENV !== 'test') {
    throw new Error('Run this through `npm run seed:golden`, which sets NODE_ENV=test so the fixture can set the clock.');
  }

  await connectDatabase();
  await startTestServer();
  try {
    console.log(`Loading the golden day into ${databaseHost()}.`);
    for (const model of ALL_MODELS) await model.init();
    if (await wipeRestaurantNamed(GOLDEN_RESTAURANT)) console.log(`  Wiped the previous "${GOLDEN_RESTAURANT}".`);

    const golden = await buildGoldenDay({ name: GOLDEN_RESTAURANT });

    setClockForTests(ist('09:00', '2026-09-27'));
    const close = await request('POST', '/api/v1/day-close', {
      token: golden.tokens.MANAGER,
      body: { businessDate: GOLDEN_DATE, countedCashInPaise: 340000, note: 'Four rupees short' },
    });
    resetClockForTests();
    if (close.status !== 201) throw new Error(`Closing 26 September failed: ${JSON.stringify(close.body)}`);

    console.log('');
    console.log(`Done. 26 September 2026 is loaded and closed. Every login's password: ${DEFAULT_PASSWORD}`);
    for (const [name, token] of Object.entries(golden.people)) {
      const me = await request('GET', '/api/v1/auth/me', { token });
      console.log(`  ${name.padEnd(16)} ${me.body.data.user.phone}  ${me.body.data.user.role}`);
    }
  } finally {
    await stopTestServer();
    await disconnectDatabase();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

export { main };
