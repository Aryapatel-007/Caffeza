import { expect, test } from '@playwright/test';

import { DEVICES } from './helpers/people.js';
import { pay } from './pages/bill.js';
import { markReady } from './pages/kitchen.js';
import { addFromPanel, billOrder, details, sendToKitchen, serveAll } from './pages/order.js';
import { openTable, tile } from './pages/floor.js';

/**
 * One real table, end to end, against the app as it runs on this machine and a
 * STAGING database: `npm run e2e:cloud` with `npm run dev` running. Not part of
 * `npm run e2e`. e2e/cloud.config.js refuses to start unless
 * `E2E_CLOUD_DATABASE` names the database in `MONGO_URI`, and the test refuses
 * unless the owner it signs in as belongs to `E2E_CLOUD_RESTAURANT`.
 *
 * A captain seats a table on a phone and sends a dish and a drink to the
 * kitchen; each station's tablet marks its ticket ready; the captain serves;
 * the counter bills and takes cash; the table is free again; and the owner's
 * Sales by Day for today balances. It runs at the real time, so it leaves one
 * paid bill for today, and no table busy.
 *
 * The staging restaurant's logins, stations and dishes come from E2E_CLOUD_*
 * variables, so no client's names live in this file.
 */
const env = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`e2e:cloud needs ${name}.`);
  return value;
};
const RESTAURANT = env('E2E_CLOUD_RESTAURANT');
const PASSWORD = env('E2E_CLOUD_PASSWORD');
const PEOPLE = {
  captain: env('E2E_CLOUD_CAPTAIN_PHONE'),
  counter: env('E2E_CLOUD_COUNTER_PHONE'),
  owner: env('E2E_CLOUD_OWNER_PHONE'),
};
/** "Station name=phone" pairs, comma separated: every station a ticket goes to. */
const STATIONS = env('E2E_CLOUD_STATIONS').split(',').map((pair) => pair.split('=').map((part) => part.trim()));
const TABLE = env('E2E_CLOUD_TABLE');
const DISH = env('E2E_CLOUD_DISH');
const DRINK = env('E2E_CLOUD_DRINK');

/** Refuses unless the owner's phone signs in to the named restaurant. */
async function assertRestaurant(baseURL) {
  const response = await fetch(`${baseURL}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: PEOPLE.owner, password: PASSWORD }),
  });
  const body = await response.json();
  const name = body?.data?.restaurant?.name;
  if (name !== RESTAURANT) {
    throw new Error(`The owner login belongs to "${name}", not E2E_CLOUD_RESTAURANT "${RESTAURANT}". Refusing.`);
  }
}

async function signIn(browser, phone, device) {
  const context = await browser.newContext(DEVICES[device]);
  const page = await context.newPage();
  await page.goto('/login');
  await page.getByLabel('Phone or email').fill(phone);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).not.toHaveURL(/\/login/);
  return { context, page };
}

test('a table, from seating to paid, against the staging database', async ({ browser, baseURL }) => {
  test.setTimeout(5 * 60 * 1000);
  await assertRestaurant(baseURL);

  const captain = await signIn(browser, PEOPLE.captain, 'phone');
  await openTable(captain.page, TABLE, 2);
  // + opens the panel; the dish goes with a note to the chef, the coffee without.
  await captain.page.getByRole('button', { name: `Add ${DISH}`, exact: true }).click();
  await captain.page.getByRole('dialog').getByRole('button', { name: 'Less spicy', exact: true }).click();
  await addFromPanel(captain.page);
  await captain.page.getByRole('button', { name: `Add ${DRINK}`, exact: true }).click();
  await addFromPanel(captain.page);
  await expect((await details(captain.page)).getByText('Less spicy')).toBeVisible();
  await captain.page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
  await sendToKitchen(captain.page);
  const orderUrl = captain.page.url();

  for (const [station, phone] of STATIONS) {
    const tablet = await signIn(browser, phone, 'computer');
    await markReady(tablet.page, station, TABLE);
  }

  await captain.page.goto(orderUrl);
  await serveAll(captain.page);

  const counter = await signIn(browser, PEOPLE.counter, 'computer');
  await counter.page.goto(orderUrl);
  await billOrder(counter.page);
  const totalText = await counter.page.getByText('Bill total').locator('xpath=..').innerText();
  const rupees = totalText.match(/₹([\d,]+\.\d\d)/)[1].replace(/,/g, '');
  await pay(counter.page, [['Cash', rupees]]);
  await expect(counter.page.getByText('This bill is paid in full', { exact: false })).toBeVisible();

  await captain.page.goto('/floor');
  await expect(tile(captain.page, TABLE, 'free')).toBeVisible();

  const owner = await signIn(browser, PEOPLE.owner, 'computer');
  await owner.page.goto('/reports/sales-by-day');
  await expect(owner.page.getByText('Balanced', { exact: false }).first()).toBeVisible();
});
