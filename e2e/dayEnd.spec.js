/**
 * P44 through the screens: the manager walks the Day End page's three steps
 * and emails the day-end message, which reaches the address the owner set.
 */
import { expect, test } from '@playwright/test';

import { at, resetGolden } from './helpers/clock.js';
import { signIn } from './helpers/people.js';

const DAY = '2026-09-26';
const APP = 'http://127.0.0.1:5055/api/v1';
const CONTROL = 'http://127.0.0.1:5056';

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

test('the manager walks Day End and emails the day-end message', async ({ browser }) => {
  const golden = await resetGolden();
  await at('15:05', DAY);
  const [owner, manager, captain, cashier] = await Promise.all(['Owner', 'Manager', 'Budha Singh', 'Counter'].map((name) => tokenOf(golden, name)));
  await api('PATCH', '/settings', owner, { reason: 'Day-end email', reports: { dayEndEmails: ['z.chaat25@gmail.com'] } });

  // Table 3: one pizza, billed and paid in cash.
  const { items, tables } = golden.ids;
  const order = await api('POST', '/orders', captain, {
    orderType: 'DINE_IN',
    tableId: tables['Table 3'],
    guestCount: 2,
    lines: [{ menuItemId: items['Half & Half Pizza'], quantity: 1 }],
  });
  const fired = await api('POST', `/orders/${order.id}/fire`, captain, { version: order.version });
  for (const kot of fired.kots) await api('PATCH', `/kots/${kot.id}/ready`, manager);
  const served = await api('GET', `/orders/${order.id}`, captain);
  const bill = await api('POST', '/bills', cashier, { orderId: order.id, version: served.version });
  await api('POST', `/bills/${bill.id}/payments`, cashier, { method: 'CASH', amountInPaise: bill.grandTotalInPaise });

  await at('22:30', DAY);
  const person = await signIn(browser, { name: 'Manager', phone: golden.phones.Manager, password: golden.password, device: 'computer' });
  const page = person.page;
  await page.getByRole('link', { name: 'Day End' }).first().click();
  await expect(page).toHaveURL(/\/day-end/);

  // 1. Overview.
  await expect(page.getByRole('heading', { name: 'Day End', level: 1 })).toBeVisible();
  const glance = page.getByRole('region', { name: 'Day at a glance' });
  await expect(glance.getByText('₹399.00')).toBeVisible();
  const messageBox = page.getByRole('region', { name: 'Day-end message' });
  await expect(messageBox).toContainText('Gross Sale - 399');
  await expect(messageBox).toContainText('Grand Total Cash in hand - —');
  await page.screenshot({ path: 'e2e/screenshots/day-end-overview.png', fullPage: true });

  // 2. Cash.
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByRole('region', { name: 'Cash' })).toContainText('Cash sales');

  // 3. Close.
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByRole('button', { name: 'Count and close the day' })).toBeVisible();

  // Email this report.
  await messageBox.getByRole('button', { name: 'Email this report' }).click();
  await expect(page.getByText('Emailed to z.chaat25@gmail.com.')).toBeVisible();
  const { emails } = await (await fetch(`${CONTROL}/emails`)).json();
  const last = emails.at(-1);
  expect(last.to).toEqual(['z.chaat25@gmail.com']);
  expect(last.text).toContain('Gross Sale - 399');
  expect(last.text).not.toContain('Cash in hand - —');
  await page.screenshot({ path: 'e2e/screenshots/day-end.png', fullPage: true });
});
