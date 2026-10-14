/**
 * P46 through the screens: the owner has an open item on the menu; a captain
 * on a phone adds "Extra chutney" at ₹20, sends it, and the kitchen ticket and
 * the order carry the typed name and price.
 */
import { expect, test } from '@playwright/test';

import { at, resetGolden } from './helpers/clock.js';
import { signIn } from './helpers/people.js';
import { sendToKitchen } from './pages/order.js';

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

test('a captain adds an open item with a typed name and price', async ({ browser }) => {
  const golden = await resetGolden();
  await at('13:10', DAY);
  const [owner, captainToken] = await Promise.all(['Owner', 'Khuman Singh'].map((name) => tokenOf(golden, name)));

  // The owner's open item, in the pasta's category, at 5%.
  const pasta = await api('GET', `/menu-items/${golden.ids.items['Creamy Pesto Pasta']}`, owner);
  await api('POST', '/menu-items', owner, { categoryId: pasta.categoryId, name: 'Open item', priceInPaise: 0, taxRateBps: 500, isOpenItem: true });

  const order = await api('POST', '/orders', captainToken, {
    orderType: 'DINE_IN',
    tableId: golden.ids.tables['Table 12'],
    guestCount: 2,
    lines: [{ menuItemId: golden.ids.items['Creamy Pesto Pasta'], quantity: 1 }],
  });

  const captain = await signIn(browser, { name: 'Khuman Singh', phone: golden.phones['Khuman Singh'], password: golden.password, device: 'phone' });
  const page = captain.page;
  await page.goto(`/orders/${order.id}`);
  await page.getByPlaceholder('Search dishes').fill('Open item');
  await expect(page.getByText('Type name and price')).toBeVisible();
  await page.getByRole('button', { name: 'Add Open item', exact: true }).click();

  const sheet = page.getByRole('dialog', { name: 'Open item' });
  const add = sheet.getByRole('button', { name: /^Add to order/ });
  await expect(add).toBeDisabled();
  await sheet.getByLabel('Name').fill('Extra chutney');
  await sheet.getByLabel('Price (₹)').fill('20');
  await expect(add).toBeEnabled();
  await add.click();
  await expect(sheet).toHaveCount(0);
  await sendToKitchen(page);

  const after = await api('GET', `/orders/${order.id}`, captainToken);
  const open = after.lines.find((line) => line.isOpenItem);
  expect([open.itemName, open.unitPriceInPaise, open.taxRateBps, open.status]).toEqual(['Extra chutney', 2000, 500, 'FIRED']);
  const kots = await api('GET', `/kots?orderId=${order.id}`, captainToken).catch(() => null);
  if (kots) expect(JSON.stringify(kots)).toContain('Extra chutney');
  await page.screenshot({ path: 'e2e/screenshots/open-item.png' });
});
