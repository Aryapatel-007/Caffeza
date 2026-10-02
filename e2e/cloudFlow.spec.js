import { expect, test } from '@playwright/test';

import { DEVICES } from './helpers/people.js';
import { pay } from './pages/bill.js';
import { markReady } from './pages/kitchen.js';
import { billOrder, sendToKitchen, serveAll } from './pages/order.js';
import { openTable, tile } from './pages/floor.js';

/**
 * One real table, end to end, against the app as it runs on this machine and
 * the cloud database: `npm run e2e:cloud` with `npm run dev` running and
 * "Cafezza Demo" loaded by `npm run seed:mock`. Not part of `npm run e2e`.
 *
 * A captain seats Table 1 on a phone and sends a dish and a coffee to the
 * kitchen; each station's tablet marks its ticket ready; the captain serves;
 * the counter bills and takes cash; the table is free again; and the owner
 * sees the ten loaded days in Sales by Day. It runs at the real time, so it
 * leaves one paid bill for today, and no table busy.
 */
const PASSWORD = process.env.DEMO_PASSWORD ?? 'demopass123';
const PEOPLE = {
  captain: '9000002006',
  counter: '9000002002',
  liveKitchen: '9000002008',
  beverages: '9000002009',
  owner: '9000002000',
};
const TABLE = 'Table 1';
const DISH = 'Cheesy Vada Pao Pops';
const DRINK = 'Cappuccino';

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

test('a table, from seating to paid, against the cloud database', async ({ browser }) => {
  test.setTimeout(5 * 60 * 1000);

  const captain = await signIn(browser, PEOPLE.captain, 'phone');
  await openTable(captain.page, TABLE, 2);
  for (const item of [DISH, DRINK]) {
    await captain.page.getByRole('button', { name: `Add ${item}`, exact: true }).click();
    await expect(captain.page.getByRole('button', { name: 'One more' }).first()).toBeVisible();
  }
  await sendToKitchen(captain.page);
  const orderUrl = captain.page.url();

  const live = await signIn(browser, PEOPLE.liveKitchen, 'computer');
  await markReady(live.page, 'Live Kitchen', TABLE);
  const bar = await signIn(browser, PEOPLE.beverages, 'computer');
  await markReady(bar.page, 'Beverages', TABLE);

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
  await owner.page.goto('/reports/sales-by-day?from=2026-09-22&to=2026-10-01');
  for (const day of ['22 Sep', '26 Sep', '1 Oct']) {
    await expect(owner.page.getByText(new RegExp(day)).first()).toBeVisible();
  }
  await expect(owner.page.getByText('Balanced', { exact: false }).first()).toBeVisible();
});
