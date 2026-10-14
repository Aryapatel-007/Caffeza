/**
 * P43 through the screens: with Other switched on, the cashier picks Other,
 * the keypad waits for the mode of payment, Cheque fills it in one tap, and
 * the bill shows "Other · Cheque".
 */
import { expect, test } from '@playwright/test';

import { at, resetGolden } from './helpers/clock.js';
import { signIn } from './helpers/people.js';

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

test('a cashier takes a cheque through Other', async ({ browser }) => {
  const golden = await resetGolden();
  await at('15:05', DAY);
  const [owner, manager, captain, cashier] = await Promise.all(['Owner', 'Manager', 'Budha Singh', 'Counter'].map((name) => tokenOf(golden, name)));

  // Other is off for every restaurant until the owner switches it on.
  const methods = await api('GET', '/payment-methods?includeInactive=true', owner);
  const other = methods.find((method) => method.code === 'OTHER');
  await api('PATCH', `/payment-methods/${other.id}`, owner, { isActive: true });

  // Table 3: a pizza, made and served, billed and printed.
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
  await api('POST', `/bills/${bill.id}/printed`, cashier);

  await at('15:40', DAY);
  const counter = await signIn(browser, { name: 'Counter', phone: golden.phones.Counter, password: golden.password, device: 'computer' });
  const page = counter.page;
  await page.goto(`/bills/${bill.id}`);
  const area = page.getByRole('region', { name: 'Take payment' });
  await area.getByRole('button', { name: /^Other/ }).click();

  // The keypad waits for the mode of payment.
  const record = area.getByRole('button', { name: /^Record payment/ });
  await expect(record).toBeDisabled();
  await expect(area.getByText('Pick or type how it was paid to record it.')).toBeVisible();
  await area.getByRole('button', { name: 'Cheque', exact: true }).click();
  await expect(record).toBeEnabled();
  await record.click();
  await expect(page.getByText(/^Payment recorded/)).toBeVisible();
  await expect(page.getByText('Other · Cheque', { exact: false })).toBeVisible();

  const paid = await api('GET', `/bills/${bill.id}`, cashier);
  expect(paid.status).toBe('PAID');
  expect(paid.payments.map((payment) => [payment.method, payment.reference])).toEqual([['OTHER', 'Cheque']]);
  await page.screenshot({ path: 'e2e/screenshots/other-payment.png', fullPage: true });
});

test('the owner adds Paytm to Other modes in Settings, and the cashier pays by it (P47)', async ({ browser }) => {
  const golden = await resetGolden();
  await at('15:05', DAY);
  const [owner, manager, captain, cashier] = await Promise.all(['Owner', 'Manager', 'Budha Singh', 'Counter'].map((name) => tokenOf(golden, name)));

  // In Settings, as the owner: Other on, then Paytm added to Other modes and saved with a reason.
  const boss = await signIn(browser, { name: 'Owner', phone: golden.phones.Owner, password: golden.password, device: 'computer' });
  await boss.page.goto('/settings');
  await expect(boss.page.getByRole('heading', { name: 'Other modes' })).toBeVisible();
  await expect(boss.page.getByText('Other is switched off, so these are not shown.')).toBeVisible();
  const methods = await api('GET', '/payment-methods?includeInactive=true', owner);
  await api('PATCH', `/payment-methods/${methods.find((method) => method.code === 'OTHER').id}`, owner, { isActive: true });
  await boss.page.getByLabel('New mode').fill('Paytm');
  await boss.page.getByRole('button', { name: 'Add', exact: true }).click();
  await boss.page.getByRole('heading', { name: 'Other modes' }).scrollIntoViewIfNeeded();
  await boss.page.screenshot({ path: 'e2e/screenshots/other-modes-settings.png' });
  await boss.page.getByLabel('Why are you changing this?').fill('Paytm at the counter');
  await boss.page.getByRole('button', { name: 'Save changes' }).click();
  await expect(boss.page.getByText('Settings saved.')).toBeVisible();

  // A bill, printed, paid by Other with the new mode.
  const order = await api('POST', '/orders', captain, {
    orderType: 'DINE_IN',
    tableId: golden.ids.tables['Table 3'],
    guestCount: 2,
    lines: [{ menuItemId: golden.ids.items['Half & Half Pizza'], quantity: 1 }],
  });
  const fired = await api('POST', `/orders/${order.id}/fire`, captain, { version: order.version });
  for (const kot of fired.kots) await api('PATCH', `/kots/${kot.id}/ready`, manager);
  const served = await api('GET', `/orders/${order.id}`, captain);
  const bill = await api('POST', '/bills', cashier, { orderId: order.id, version: served.version });
  await api('POST', `/bills/${bill.id}/printed`, cashier);

  const counter = await signIn(browser, { name: 'Counter', phone: golden.phones.Counter, password: golden.password, device: 'computer' });
  await counter.page.goto(`/bills/${bill.id}`);
  const area = counter.page.getByRole('region', { name: 'Take payment' });
  await area.getByRole('button', { name: /^Other/ }).click();
  const modes = area.getByRole('group', { name: 'Mode of payment' });
  for (const mode of ['Swiggy Dineout', 'Zomato Dineout', 'EazyDiner', 'Paytm']) {
    await expect(modes.getByRole('button', { name: mode, exact: true })).toBeVisible();
  }
  await modes.getByRole('button', { name: 'Paytm', exact: true }).click();
  await area.getByRole('button', { name: /^Record payment/ }).click();
  await expect(counter.page.getByText('Other · Paytm', { exact: false })).toBeVisible();
  const paid = await api('GET', `/bills/${bill.id}`, cashier);
  expect(paid.payments.map((payment) => [payment.method, payment.reference])).toEqual([['OTHER', 'Paytm']]);
});

