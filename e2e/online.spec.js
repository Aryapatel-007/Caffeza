/**
 * P23, online takeaway and a booking, through the real screens.
 *
 * A guest on a phone orders from the restaurant's page; the cashier's tablet
 * shows the banner and says it aloud (a spy records the spoken line, since a
 * headless browser has no speakers); the cashier accepts; the Beverages
 * station gets the ticket; the guest's page reads Confirmed. Then a booking:
 * requested on the page, confirmed on Table 5, shown as Reserved on the floor,
 * and seated, which opens the table's order.
 */
import { expect, test } from '@playwright/test';

import { at, resetGolden, track } from './helpers/clock.js';
import { DEVICES, signIn } from './helpers/people.js';
import { markReady, openStation } from './pages/kitchen.js';
import { billOrder, serveAll } from './pages/order.js';

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

/** Records every spoken line instead of saying it. */
async function spyOnSpeech(person) {
  await person.context.addInitScript(() => {
    window.__spoken = [];
    if (window.speechSynthesis) {
      window.speechSynthesis.speak = (utterance) => window.__spoken.push(utterance.text);
    }
  });
  await person.page.reload();
}

const spoken = (person) => person.page.evaluate(() => window.__spoken ?? []);

/** A dish's round add button on the public menu. */
const addDish = (page, name) => page.getByRole('button', { name: `Add ${name}` }).click();

test.describe.configure({ mode: 'serial' });

test('online takeaway and a booking, through the screens', async ({ browser }) => {
  const golden = await resetGolden();
  await at('13:00', DAY);

  // The owner switches it on, as they would in Settings.
  const owner = await api('POST', '/auth/login', null, { phone: golden.phones.Owner, password: golden.password });
  await api('PATCH', '/settings', owner.accessToken, {
    reason: 'Start online orders',
    features: { online: true },
    online: { takeawayEnabled: true, reservationsEnabled: true },
  });
  await api('PATCH', '/online/site', owner.accessToken, { publicSlug: 'cafezza' });

  const cashier = await signIn(browser, { name: 'Counter', phone: golden.phones.Counter, password: golden.password, device: 'tablet' });
  await spyOnSpeech(cashier);
  await cashier.page.goto('/floor');
  // Browsers allow sound only after a tap.
  await cashier.page.mouse.click(5, 5);

  // A guest on a phone, not signed in.
  const guestContext = await browser.newContext(DEVICES.phone);
  const guest = await guestContext.newPage();
  await track(guest);
  await guest.goto('/r/cafezza');
  await guest.getByRole('link', { name: /Order takeaway/ }).click();
  await addDish(guest, 'Masala Tea');
  await addDish(guest, 'Caffe Latte');
  await guest.getByRole('button', { name: 'Review order' }).click();
  await expect(guest.getByText('Estimated bill total')).toBeVisible();
  await guest.getByLabel('Your name').fill('Asha');
  await guest.getByLabel('Mobile number').fill('9876543210');
  await guest.getByRole('button', { name: 'Place order' }).click();
  await expect(guest.getByText('W-1', { exact: true })).toBeVisible();
  await expect(guest.getByText('Waiting for the cafe to confirm')).toBeVisible();

  // The cashier hears it and sees it. A till is always the window in front;
  // Chromium slows the timers of windows behind another.
  await cashier.page.bringToFront();
  const banner = cashier.page.getByRole('status').filter({ hasText: 'online request' });
  await expect(banner).toContainText('1 online request waiting', { timeout: 30_000 });
  await expect.poll(() => spoken(cashier), { timeout: 10_000 }).toContainEqual('New takeaway order, W 1, 2 items, pickup 1 20 PM.');

  await banner.getByRole('link', { name: 'Open' }).click();
  await expect(cashier.page).toHaveURL(/\/online$/);
  await cashier.page.getByRole('button', { name: 'Accept' }).click();
  await cashier.page.getByRole('dialog').getByRole('button', { name: 'Accept' }).click();
  await expect(cashier.page.getByText(/W-1 accepted as order \d+ and sent to the kitchen/)).toBeVisible();
  await expect(banner).toHaveCount(0);

  // The drinks station has the ticket.
  const beverages = await signIn(browser, { name: 'Beverages', phone: golden.phones.Manager, password: golden.password, device: 'tablet' });
  await openStation(beverages.page, 'Beverages');
  await expect(beverages.page.getByText('Masala Tea')).toBeVisible();
  await expect(beverages.page.getByText('Caffe Latte')).toBeVisible();

  // The guest's page follows.
  await expect(guest.getByText('Confirmed', { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(guest.getByText(/Ready at 1:20 pm/i).first()).toBeVisible();

  // A booking for four at 8 PM.
  await guest.goto('/r/cafezza/book');
  await guest.getByRole('button', { name: '4', exact: true }).click();
  await guest.getByRole('button', { name: /^8:00 pm$/i }).click();
  await guest.getByLabel('Your name').fill('Mehta');
  await guest.getByLabel('Mobile number').fill('9123456789');
  await guest.getByRole('button', { name: 'Request booking' }).click();
  await expect(guest.getByText('R-1', { exact: true })).toBeVisible();

  await cashier.page.bringToFront();
  await expect(banner).toContainText('1 online request waiting', { timeout: 30_000 });
  await expect.poll(() => spoken(cashier), { timeout: 10_000 }).toContainEqual(expect.stringMatching(/^New table booking, R 1, 4 people, Saturday 8 00 PM\.$/));

  await cashier.page.goto('/online/bookings');
  await cashier.page.getByRole('button', { name: 'Confirm' }).click();
  const confirmSheet = cashier.page.getByRole('dialog');
  await confirmSheet.getByLabel('Table').selectOption({ label: 'Table 5' });
  await confirmSheet.getByRole('button', { name: 'Confirm' }).click();
  await expect(cashier.page.getByText('R-1 confirmed.')).toBeVisible();

  // Ten to eight: the floor shows the table as reserved, and seats the booking.
  await at('19:50', DAY);
  await cashier.page.goto('/floor');
  const table5 = cashier.page.getByRole('button', { name: /^Table 5, reserved at 8:00 pm, seat guests$/i });
  await expect(table5).toBeVisible();
  await expect(table5).toContainText(/Reserved 8:00 pm, 4/i);
  await table5.click();
  await cashier.page.getByRole('dialog').getByRole('button', { name: 'Seat R-1, 4 guests' }).click();
  await expect(cashier.page).toHaveURL(/\/orders\/[a-f0-9]{24}$/);

  await guestContext.close();
});

/**
 * P24. The same guest pays in advance through the cafe's Razorpay (a fake one
 * in the e2e server), comes back, and the cashier applies the advance to the
 * bill, which is then paid without anyone touching cash.
 */
test('a prepaid takeaway, from paying online to a paid bill', async ({ browser }) => {
  const golden = await resetGolden();
  await at('13:00', DAY);

  const owner = await api('POST', '/auth/login', null, { phone: golden.phones.Owner, password: golden.password });
  await api('PATCH', '/settings', owner.accessToken, {
    reason: 'Online orders, paid in advance',
    features: { online: true },
    online: { takeawayEnabled: true, reservationsEnabled: true, takeawayPrepay: true, depositPerPersonInPaise: 10000 },
  });
  await api('PATCH', '/online/site', owner.accessToken, { publicSlug: 'cafezza' });
  // The fake gateway's keys, in server/tests/helpers/fakeRazorpay.js.
  await api('PUT', '/settings/payments/gateway', owner.accessToken, {
    keyId: 'rzp_test_FakeKey1234',
    keySecret: 'fake-key-secret-123456',
    webhookSecret: 'fake-webhook-secret-123456',
    reason: 'Connect Razorpay',
  });

  const guestContext = await browser.newContext(DEVICES.phone);
  const guest = await guestContext.newPage();
  await track(guest);
  await guest.goto('/r/cafezza');
  await expect(guest.getByText('Refunded in full if the cafe cannot take it')).toBeVisible();
  await guest.getByRole('link', { name: /Order takeaway/ }).click();
  await addDish(guest, 'Masala Tea');
  await addDish(guest, 'Caffe Latte');
  await guest.getByRole('button', { name: 'Review order' }).click();
  await guest.getByLabel('Your name').fill('Asha');
  await guest.getByLabel('Mobile number').fill('9876543210');
  const pay = guest.getByRole('button', { name: /^Pay ₹326\.00 securely$/ });
  await expect(pay).toBeEnabled();
  // Razorpay's page (the fake pays at once) sends the guest back to the status page.
  await pay.click();
  await expect(guest).toHaveURL(/\/r\/cafezza\/order\/[a-f0-9]{24}$/);
  await expect(guest.getByText('Waiting for the cafe to confirm')).toBeVisible();
  await expect(guest.getByText(/^Paid online at /)).toBeVisible();

  const cashier = await signIn(browser, { name: 'Counter', phone: golden.phones.Counter, password: golden.password, device: 'tablet' });
  await cashier.page.goto('/online');
  await expect(cashier.page.getByText('Paid online ₹326.00')).toBeVisible();
  await cashier.page.getByRole('button', { name: 'Accept' }).click();
  await cashier.page.getByRole('dialog').getByRole('button', { name: 'Accept' }).click();
  await expect(cashier.page.getByText(/W-1 accepted as order \d+/)).toBeVisible();

  const beverages = await signIn(browser, { name: 'Beverages', phone: golden.phones.Manager, password: golden.password, device: 'tablet' });
  await markReady(beverages.page, 'Beverages', 'Order 1');

  await cashier.page.getByRole('button', { name: 'Open the order' }).click();
  await serveAll(cashier.page);
  await billOrder(cashier.page);
  await cashier.page.getByRole('button', { name: 'Apply ₹326.00 paid online' }).click();
  await expect(cashier.page.getByText('Online advance applied. Bill paid in full.')).toBeVisible();
  await expect(cashier.page.getByText('This bill is paid in full', { exact: false })).toBeVisible();

  await guestContext.close();
});

/**
 * P24. A paid request the cafe declines is refunded in full through Razorpay,
 * and the guest's page says so without anyone telling them.
 */
test('a paid takeaway the cafe declines shows Refunded on the guest page', async ({ browser }) => {
  const golden = await resetGolden();
  await at('13:00', DAY);

  const owner = await api('POST', '/auth/login', null, { phone: golden.phones.Owner, password: golden.password });
  await api('PATCH', '/settings', owner.accessToken, {
    reason: 'Online orders, paid in advance',
    features: { online: true },
    online: { takeawayEnabled: true, reservationsEnabled: true, takeawayPrepay: true, depositPerPersonInPaise: 10000 },
  });
  await api('PATCH', '/online/site', owner.accessToken, { publicSlug: 'cafezza' });
  await api('PUT', '/settings/payments/gateway', owner.accessToken, {
    keyId: 'rzp_test_FakeKey1234',
    keySecret: 'fake-key-secret-123456',
    webhookSecret: 'fake-webhook-secret-123456',
    reason: 'Connect Razorpay',
  });

  const guestContext = await browser.newContext(DEVICES.phone);
  const guest = await guestContext.newPage();
  await track(guest);
  await guest.goto('/r/cafezza');
  await guest.getByRole('link', { name: /Order takeaway/ }).click();
  await addDish(guest, 'Masala Tea');
  await guest.getByRole('button', { name: 'Review order' }).click();
  await guest.getByLabel('Your name').fill('Ravi');
  await guest.getByLabel('Mobile number').fill('9876500000');
  await guest.getByRole('button', { name: /^Pay ₹.+ securely$/ }).click();
  await expect(guest.getByText('Waiting for the cafe to confirm')).toBeVisible();

  const cashier = await signIn(browser, { name: 'Counter', phone: golden.phones.Counter, password: golden.password, device: 'tablet' });
  await cashier.page.goto('/online');
  await cashier.page.getByRole('button', { name: 'Decline' }).click();
  const sheet = cashier.page.getByRole('dialog');
  await sheet.getByRole('button', { name: 'Too busy right now' }).click();
  await sheet.getByRole('button', { name: 'Decline' }).click();
  await expect(cashier.page.getByText(/W-\d+ declined\. The guest has been told\./)).toBeVisible();

  await guest.reload();
  await expect(guest.getByText('Refunded to you')).toBeVisible();
  await expect(guest.getByText('The cafe is too busy to take this right now', { exact: true })).toBeVisible();

  await guestContext.close();
});
