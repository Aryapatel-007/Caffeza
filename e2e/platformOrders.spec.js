/**
 * P25 Part H, through the screens, with the sandbox platform: an order
 * arrives on the incoming screen, the cashier accepts it, the tickets reach
 * the station tablets, the stations mark them ready, a pickup arrives, and the
 * bill is paid by the platform's method.
 */
import { createHmac } from 'node:crypto';

import { expect, test } from '@playwright/test';

import { at, resetGolden } from './helpers/clock.js';
import { signIn } from './helpers/people.js';
import { openStation } from './pages/kitchen.js';

const DAY = '2026-09-26';
const ORIGIN = 'http://127.0.0.1:5055';
const APP = `${ORIGIN}/api/v1`;
const SECRET = 'golden-day-sandbox-secret';

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

/** Posts a signed event to the sandbox's webhook address, as the platform would. */
async function platformSends(hookPath, event) {
  const body = JSON.stringify(event);
  const response = await fetch(`${ORIGIN}${hookPath}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-sandbox-signature': createHmac('sha256', SECRET).update(body).digest('hex') },
    body,
  });
  expect(response.status).toBe(200);
}

/** Taps ready on every ticket a station has. */
async function readyEverything(page, station) {
  await openStation(page, station);
  const list = page.locator('article');
  for (let left = await list.count(); left > 0; left = await list.count()) {
    await list.first().locator('footer button').click();
    await expect(list).toHaveCount(left - 1);
  }
}

test.describe.configure({ mode: 'serial' });

test('a sandbox platform order, from arrival to paid', async ({ browser }) => {
  const golden = await resetGolden();
  await at('18:00', DAY);
  const owner = (await api('POST', '/auth/login', null, { phone: golden.phones.Owner, password: golden.password })).accessToken;

  // The owner connects the sandbox as Zomato and matches its two items.
  const saved = await api('PUT', '/integrations/SANDBOX_PLATFORM', owner, { environment: 'SANDBOX', credentials: { webhookSecret: SECRET }, config: { actsAs: 'ZOMATO' } });
  await api('POST', '/integrations/SANDBOX_PLATFORM/test', owner, {});
  const hookPath = new URL(saved.webhookUrl).pathname;
  const { items } = golden.ids;
  await api('PUT', '/integrations/SANDBOX_PLATFORM/item-mappings', owner, { externalItemId: 'gd-latte', externalName: 'Caffe Latte', menuItemId: items['Caffe Latte'] });
  await api('PUT', '/integrations/SANDBOX_PLATFORM/item-mappings', owner, { externalItemId: 'gd-sandwich', externalName: 'Masala Pav Sandwich', menuItemId: items['Masala Pav Sandwich'] });

  const cashier = await signIn(browser, { name: 'Counter', phone: golden.phones.Counter, password: golden.password, device: 'tablet' });
  const station = await signIn(browser, { name: 'Manager', phone: golden.phones.Manager, password: golden.password, device: 'tablet' });
  await cashier.page.goto('/online');

  await platformSends(hookPath, {
    type: 'ORDER_PLACED',
    order: {
      platformOrderId: 'SBX20001',
      customerName: 'Asha',
      items: [
        { externalItemId: 'gd-latte', name: 'Caffe Latte', quantity: 1, unitPriceInPaise: 22000, addOns: [] },
        { externalItemId: 'gd-sandwich', name: 'Masala Pav Sandwich', quantity: 1, unitPriceInPaise: 17500, addOns: [] },
      ],
      packagingChargeInPaise: 0,
      merchantDiscountInPaise: 0,
      platformDiscountInPaise: 0,
      totalInPaise: 39500,
      paymentMode: 'PREPAID',
      deliveredBy: 'PLATFORM',
    },
  });

  // It arrives on the incoming screen, and the cashier accepts it.
  const card = cashier.page.locator('article').filter({ hasText: 'SBX20001' });
  await expect(card).toBeVisible({ timeout: 30_000 });
  await card.getByRole('button', { name: 'Accept', exact: true }).click();
  const sheet = cashier.page.getByRole('dialog', { name: 'Accept Zomato SBX20001' });
  await sheet.getByRole('button', { name: /^Accept, ready in/ }).click();
  await expect(cashier.page.getByText('Zomato SBX20001 accepted and sent to the kitchen.')).toBeVisible();

  // The tickets reach both stations, which mark them ready.
  await readyEverything(station.page, 'Beverages');
  await readyEverything(station.page, 'Live Kitchen');

  // The rider picks it up; the bill is made and paid by Zomato.
  await platformSends(hookPath, { type: 'ORDER_PICKED_UP', platformOrderId: 'SBX20001' });
  let record;
  await expect.poll(async () => {
    [record] = await api('GET', '/platform-orders?limit=5', owner);
    return record?.billId ?? null;
  }, { timeout: 30_000 }).not.toBeNull();

  await cashier.page.goto(`/bills/${record.billId}`);
  await expect(cashier.page.getByText('Tax invoice')).toBeVisible();
  await expect(cashier.page.getByText('Paid', { exact: true }).first()).toBeVisible();
  await expect(cashier.page.getByText('Zomato').first()).toBeVisible();
  await expect(cashier.page.getByText('Bill total').locator('xpath=..')).toContainText('395.00');
  await cashier.page.screenshot({ path: 'e2e/screenshots/platform-order-bill.png', fullPage: true });
});
