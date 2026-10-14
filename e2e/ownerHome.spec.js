/**
 * P51. The owner's home on a phone: today's figures, read from R1, R2 and R4.
 * A manager keeps the old home.
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

test('the owner reads today at a glance on a phone', async ({ browser }) => {
  const golden = await resetGolden();
  await at('20:05', DAY);
  const [manager, captain, cashier] = await Promise.all(['Manager', 'Budha Singh', 'Counter'].map((name) => tokenOf(golden, name)));
  const { items, tables } = golden.ids;

  const billFor = async (table, item) => {
    const order = await api('POST', '/orders', captain, { orderType: 'DINE_IN', tableId: tables[table], guestCount: 2, lines: [{ menuItemId: items[item], quantity: 1 }] });
    const fired = await api('POST', `/orders/${order.id}/fire`, captain, { version: order.version });
    for (const kot of fired.kots) await api('PATCH', `/kots/${kot.id}/ready`, manager);
    const served = await api('GET', `/orders/${order.id}`, captain);
    return api('POST', '/bills', cashier, { orderId: order.id, version: served.version });
  };
  // Table 3 paid in cash; Table 5 billed and not yet paid.
  const paid = await billFor('Table 3', 'Half & Half Pizza');
  await api('POST', `/bills/${paid.id}/payments`, cashier, { method: 'CASH', amountInPaise: paid.grandTotalInPaise });
  const unpaid = await billFor('Table 5', 'Caffe Latte');

  await at('21:42', DAY);
  const owner = await signIn(browser, { name: 'Owner', phone: golden.phones.Owner, password: golden.password, device: 'phone' });
  const page = owner.page;
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible();
  await expect(page.getByText('Day open · figures to 9:42')).toBeVisible();

  const rupees = (paise) => `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
  const billTotal = paid.grandTotalInPaise + unpaid.grandTotalInPaise;
  await expect(page.getByText(rupees(billTotal)).first()).toBeVisible();
  const cards = page.getByRole('region', { name: 'Bills, covers and unpaid' });
  await expect(cards).toContainText('Bills2');
  await expect(cards).toContainText(`Unpaid${rupees(unpaid.grandTotalInPaise)}1 bill`);

  await expect(page.getByRole('heading', { name: 'Where the sales came from' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Dine-in/ })).toBeVisible();
  const moneyCard = page.locator('section', { has: page.getByRole('heading', { name: 'Where the money went' }) });
  await expect(moneyCard).toContainText(`Cash${rupees(paid.grandTotalInPaise)}`);
  await expect(moneyCard).toContainText(`Total ${rupees(billTotal)}`);
  await expect(page.getByText('Busiest hour 8pm')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Watch list' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Checks' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Day End', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'e2e/screenshots/owner-home.png' });
  await page.getByRole('heading', { name: 'By hour' }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'e2e/screenshots/owner-home-hours.png' });
  await page.getByRole('link', { name: 'Day End', exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'e2e/screenshots/owner-home-end.png' });

  // A manager keeps the old home.
  const person = await signIn(browser, { name: 'Manager', phone: golden.phones.Manager, password: golden.password, device: 'phone' });
  await person.page.goto('/dashboard');
  await expect(person.page.getByRole('heading', { name: 'Where the sales came from' })).toHaveCount(0);
});
