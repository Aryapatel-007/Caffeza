/**
 * P25 Part D, through the screens: a captain on a phone makes a bill and
 * sends it to the counter; the counter computer, set to print bills sent by
 * captains, prints it once.
 */
import { expect, test } from '@playwright/test';

import { at, resetGolden } from './helpers/clock.js';
import { signIn } from './helpers/people.js';
import { markReady } from './pages/kitchen.js';
import { addItems, billOrder, sendToKitchen, serveAll } from './pages/order.js';
import { openTable } from './pages/floor.js';

const DAY = '2026-09-26';

test.describe.configure({ mode: 'serial' });

test('a captain bills a table and it prints once at the counter', async ({ browser }) => {
  const golden = await resetGolden();
  await at('12:00', DAY);

  // The counter computer prints bills sent by captains.
  const counter = await signIn(browser, { name: 'Counter', phone: golden.phones.Counter, password: golden.password, device: 'computer' });
  await counter.page.goto('/device');
  await counter.page.getByText('Print bills sent by captains').click();
  await counter.page.goto('/bills');

  const captain = await signIn(browser, { name: 'Khuman Singh', phone: golden.phones['Khuman Singh'], password: golden.password, device: 'phone' });
  const station = await signIn(browser, { name: 'Manager', phone: golden.phones.Manager, password: golden.password, device: 'tablet' });

  await openTable(captain.page, 'Table 3', 2);
  await addItems(captain.page, ['Caffe Latte']);
  await sendToKitchen(captain.page);
  await markReady(station.page, 'Beverages', 'Table 3');
  await serveAll(captain.page);
  await billOrder(captain.page);

  await captain.page.getByRole('button', { name: 'Print at counter' }).click();
  await expect(captain.page.getByText('Sent to the counter. It prints there.')).toBeVisible();
  expect(captain.prints).toHaveLength(0);

  // The counter polls every 5 seconds, prints the bill, and never again.
  await expect.poll(() => counter.prints.length, { timeout: 20_000 }).toBe(1);
  expect(counter.prints[0].text).toContain('Table 3');
  expect(counter.prints[0].text).toMatch(/Caffe Latte/);
  await counter.page.waitForTimeout(11_000);
  expect(counter.prints).toHaveLength(1);
});
