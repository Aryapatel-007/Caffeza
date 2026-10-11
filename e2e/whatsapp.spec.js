/**
 * P37, through the screens, against a fake Meta: the owner's WhatsApp is
 * connected with an approved Bill receipt; a cashier bills and takes payment
 * for a table whose guest gave a mobile; the bill goes out on WhatsApp once,
 * with the right template and figures, and a second payment sends nothing.
 */
import { expect, test } from '@playwright/test';

import { at, resetGolden } from './helpers/clock.js';
import { signIn } from './helpers/people.js';
import { pay } from './pages/bill.js';
import { billOrder } from './pages/order.js';

const DAY = '2026-09-26';
const APP = 'http://127.0.0.1:5055/api/v1';
const CONTROL = 'http://127.0.0.1:5056';

// Made up for the fake, never a real Meta value: tests/helpers/fakeMeta.js.
const FAKE = {
  phoneNumberId: '100000000000001',
  wabaId: '200000000000002',
  accessToken: 'fake-meta-access-token-not-real-0001',
  webhookVerifyToken: 'fake-verify-token-not-real-0001',
  appSecret: 'fake-meta-app-secret-not-real-0001',
};

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
const metaMessages = async () => (await (await fetch(`${CONTROL}/meta`)).json()).messages;

test.describe.configure({ mode: 'serial' });

test('a paid bill goes out on WhatsApp once', async ({ browser }) => {
  const golden = await resetGolden();
  await at('15:05', DAY);
  const [owner, manager, captain, cashier] = await Promise.all(['Owner', 'Manager', 'Budha Singh', 'Counter'].map((name) => tokenOf(golden, name)));
  const { url: metaUrl } = await (await fetch(`${CONTROL}/meta`)).json();

  // The owner connects WhatsApp, and Meta approves the Bill receipt.
  await api('PUT', '/integrations/WHATSAPP', owner, { environment: 'SANDBOX', credentials: FAKE, config: { apiBaseUrl: metaUrl, sendBillOnPayment: true } });
  await api('POST', '/integrations/WHATSAPP/test', owner, {});
  await api('POST', '/integrations/whatsapp/templates', owner, {
    key: 'BILL_RECEIPT',
    metaName: 'bill_receipt',
    category: 'UTILITY',
    bodyText: 'Thanks for visiting {{1}}! Your bill {{2}} for {{3}} is attached. We hope to see you again.',
    variables: ['restaurantName', 'billNumber', 'billTotal'],
    example: ['Golden Day Cafe', '2026-27/000001', '₹795.00'],
  });
  await fetch(`${CONTROL}/meta/approve`, { method: 'POST', body: JSON.stringify({ name: 'bill_receipt' }) });
  const [template] = await api('POST', '/integrations/whatsapp/templates/sync', owner, {});
  expect(template.status).toBe('APPROVED');

  // Table 3, B05's dishes, with the guest's mobile; the kitchen makes them, which serves them.
  const { items, tables } = golden.ids;
  const order = await api('POST', '/orders', captain, {
    orderType: 'DINE_IN',
    tableId: tables['Table 3'],
    guestCount: 2,
    customerName: 'Asha Patel',
    customerPhone: '9876543210',
    lines: ['Half & Half Pizza', 'Ferrero Hazelnut Shake', 'Water Bottle'].map((name) => ({ menuItemId: items[name], quantity: 1 })),
  });
  const fired = await api('POST', `/orders/${order.id}/fire`, captain, { version: order.version });
  for (const kot of fired.kots) await api('PATCH', `/kots/${kot.id}/ready`, manager);

  // The counter bills it, prints it and takes cash, through the screens.
  await at('15:50', DAY);
  const counter = await signIn(browser, { name: 'Counter', phone: golden.phones.Counter, password: golden.password, device: 'computer' });
  const page = counter.page;
  await page.goto(`/orders/${order.id}`);
  const billId = (await billOrder(page)).split('/').at(-1);
  await page.getByRole('button', { name: /^Print bill/ }).click();
  await expect.poll(() => counter.prints.length).toBe(1);
  await pay(page, [['Cash', '795.00']]);
  await expect(page.getByText('This bill is paid in full', { exact: false })).toBeVisible();

  // The job loop sends it within a few seconds: once, with the bill's own figures.
  await expect.poll(async () => (await metaMessages()).length, { timeout: 20_000 }).toBe(1);
  const [message] = await metaMessages();
  const bill = await api('GET', `/bills/${billId}`, cashier);
  expect(message.to).toBe('919876543210');
  expect(message.template.name).toBe('bill_receipt');
  expect(message.template.components[0].parameters.map((entry) => entry.text)).toEqual(['Golden Day Cafe', bill.billNumber, '₹795.00']);

  // A second payment is refused, and nothing more goes out.
  await expect(api('POST', `/bills/${billId}/payments`, cashier, { method: 'CASH', amountInPaise: 100 })).rejects.toThrow();
  await page.waitForTimeout(6_000);
  expect((await metaMessages()).length).toBe(1);
});
