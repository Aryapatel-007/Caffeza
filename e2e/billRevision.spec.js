/**
 * P29 Part B and D, through the screens: a cashier makes a bill, it prints,
 * the guest says the water bottle was not theirs, the cashier removes it with
 * a manager's PIN, the revised bill prints, and payment is taken. The bill list
 * shows one bill, revised, and no voided bill.
 */
import { expect, test } from '@playwright/test';

import { at, resetGolden } from './helpers/clock.js';
import { signIn } from './helpers/people.js';
import { pay } from './pages/bill.js';
import { billOrder } from './pages/order.js';

const DAY = '2026-09-26';
const APP = 'http://127.0.0.1:5055/api/v1';

async function api(method, path, token, body) {
  const response = await fetch(`${APP}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const parsed = await response.json();
  if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${JSON.stringify(parsed)}`);
  return parsed.data;
}
const tokenOf = async (golden, name) => (await api('POST', '/auth/login', null, { phone: golden.phones[name], password: golden.password })).accessToken;

test.describe.configure({ mode: 'serial' });

test('a water bottle taken off a printed bill, without a void', async ({ browser }) => {
  const golden = await resetGolden();
  await at('15:05', DAY);
  const [manager, captain, cashier] = await Promise.all(['Manager', 'Budha Singh', 'Counter'].map((name) => tokenOf(golden, name)));

  // Table 3: Half & Half Pizza and a Water Bottle, cooked and ready; the kitchen's ready serves them.
  const { items, tables } = golden.ids;
  const order = await api('POST', '/orders', captain, {
    orderType: 'DINE_IN',
    tableId: tables['Table 3'],
    guestCount: 2,
    lines: ['Half & Half Pizza', 'Water Bottle'].map((name) => ({ menuItemId: items[name], quantity: 1 })),
  });
  const fired = await api('POST', `/orders/${order.id}/fire`, captain, { version: order.version });
  for (const kot of fired.kots) await api('PATCH', `/kots/${kot.id}/ready`, manager);
  const served = await api('GET', `/orders/${order.id}`, captain);
  expect(served.status).toBe('READY_TO_BILL');

  await at('15:50', DAY);
  const counter = await signIn(browser, { name: 'Counter', phone: golden.phones.Counter, password: golden.password, device: 'computer' });
  const page = counter.page;
  await page.goto(`/orders/${order.id}`);
  const billId = (await billOrder(page)).split('/').at(-1);

  // Print first: the payment buttons wait for it.
  await expect(page.getByRole('region', { name: 'Take payment' })).toHaveCount(0);
  await page.getByRole('button', { name: /^Print bill/ }).click();
  await expect.poll(() => counter.prints.length).toBe(1);
  await expect(page.getByRole('region', { name: 'Take payment' })).toBeVisible();

  // The guest: the water bottle was not ours.
  const bottle = page.locator('li').filter({ hasText: 'Water Bottle' });
  await bottle.getByRole('button', { name: 'Remove' }).click();
  const sheet = page.getByRole('dialog', { name: 'Remove Water Bottle' });
  await sheet.getByRole('button', { name: 'Wrong item entered', exact: true }).click();
  await sheet.getByRole('button', { name: 'No', exact: true }).click();
  await sheet.getByRole('button', { name: 'Next' }).click();
  await expect(sheet.getByText(/^Water Bottle ₹[\d,.]+ comes off bill .+\. The bill becomes ₹[\d,.]+\.$/)).toBeVisible();
  await sheet.getByRole('button', { name: 'Manager', exact: true }).click();
  await sheet.getByLabel('Their PIN').fill('2468');
  await sheet.getByRole('button', { name: 'Remove it' }).click();
  await expect(page.getByText(/^Water Bottle removed\. The bill is now/)).toBeVisible();
  await expect(page.getByText('Changed before payment')).toBeVisible();

  // The revised bill prints again before payment, as a new print, not a duplicate.
  await page.getByRole('button', { name: 'Print the revised bill' }).click();
  await expect.poll(() => counter.prints.length).toBe(2);
  expect(counter.prints[1].text).toContain('Revised bill');
  expect(counter.prints[1].text).not.toContain('DUPLICATE');

  const bill = await api('GET', `/bills/${billId}`, cashier);
  await pay(page, [['Cash', (bill.grandTotalInPaise / 100).toFixed(2)]]);
  await expect(page.getByText('This bill is paid in full', { exact: false })).toBeVisible();

  // One bill, revised, and nothing voided.
  const all = await api('GET', `/bills?from=${DAY}&to=${DAY}&includeVoided=true`, manager);
  expect(all.length).toBe(1);
  expect(all[0].revision).toBe(1);
  expect(all[0].isVoided).toBe(false);
  await page.screenshot({ path: 'e2e/screenshots/bill-revision.png', fullPage: true });
});
